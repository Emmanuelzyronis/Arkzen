"""Swappable Signal Monitoring boundary and twscrape implementation."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sqlite3
from collections.abc import AsyncIterator, Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from .models import AcquisitionCacheEntry, AcquisitionRun, Evidence, WatchProfile
from .persistence import SQLiteRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RawPost:
    """Small provider output record accepted by the acquisition boundary."""

    content: str
    author_handle: str
    post_timestamp: datetime | None
    provider_post_id: str | None = None
    canonical_url: str | None = None
    provider_id: str | None = None


@dataclass(frozen=True)
class NormalizedCandidate:
    """Provider-neutral candidate used before matching and Evidence persistence."""

    source_type: str
    provider_id: str | None
    provider_signal_id: str | None
    canonical_url: str | None
    author_handle: str
    raw_content: str
    content: str
    published_at: datetime | None
    acquired_at: datetime
    content_hash: str
    identity_fingerprint: str


AcquisitionRunResult = AcquisitionRun


@dataclass(frozen=True)
class ProviderCapabilities:
    supports_provider_signal_id: bool
    supports_canonical_url: bool
    supports_cursor: bool


@dataclass(frozen=True)
class ProviderHealth:
    provider_id: str
    available: bool
    detail: str | None = None


class CandidateValidationError(ValueError):
    """Raised when provider data cannot be safely normalized."""


class PostSource(Protocol):
    async def search(self, query: str, *, limit: int) -> AsyncIterator[RawPost]: ...


def _normalise_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if not parsed.scheme or not parsed.netloc:
        raise CandidateValidationError("canonical_url must be an absolute URL")
    return urlunsplit((parsed.scheme.casefold(), parsed.netloc.casefold(), parsed.path.rstrip("/"), parsed.query, ""))


def _normalise_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, datetime):
        raise CandidateValidationError("published timestamp is not a datetime")
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalise_author(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CandidateValidationError("author handle is required")
    return value.strip()


def _normalise_content(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CandidateValidationError("content is required")
    return " ".join(value.split())


def normalize_candidate(raw: RawPost, *, acquired_at: datetime | None = None) -> NormalizedCandidate:
    """Convert provider output to a stable, provider-neutral candidate."""
    if not isinstance(raw, RawPost):
        raise CandidateValidationError("provider result is not a RawPost")
    if not isinstance(raw.content, str) or not raw.content.strip():
        raise CandidateValidationError("content is required")
    raw_content = raw.content
    content = _normalise_content(raw.content)
    author = _normalise_author(raw.author_handle)
    published_at = _normalise_timestamp(raw.post_timestamp)
    canonical_url = _normalise_url(raw.canonical_url) if raw.canonical_url else None
    provider_id = raw.provider_id.strip() if isinstance(raw.provider_id, str) and raw.provider_id.strip() else None
    provider_signal_id = raw.provider_post_id.strip() if isinstance(raw.provider_post_id, str) and raw.provider_post_id.strip() else None
    acquired = acquired_at or _utc_now()
    acquired = _normalise_timestamp(acquired)
    assert acquired is not None
    content_hash = hashlib.sha256(content.casefold().encode("utf-8")).hexdigest()
    if provider_signal_id:
        identity_basis = f"provider:{(provider_id or 'unknown').casefold()}|signal:{provider_signal_id.casefold()}"
    elif canonical_url:
        identity_basis = f"url:{canonical_url}"
    else:
        published_key = published_at.isoformat() if published_at else "missing"
        identity_basis = f"fallback:{author.casefold().lstrip('@')}|{published_key}|{content.casefold()}"
    identity_fingerprint = hashlib.sha256(identity_basis.encode("utf-8")).hexdigest()
    return NormalizedCandidate(
        source_type=provider_id or "unknown",
        provider_id=provider_id,
        provider_signal_id=provider_signal_id,
        canonical_url=canonical_url,
        author_handle=author,
        raw_content=raw_content,
        content=content,
        published_at=published_at,
        acquired_at=acquired,
        content_hash=content_hash,
        identity_fingerprint=identity_fingerprint,
    )


def freshness_rejection(candidate: NormalizedCandidate, *, now: datetime | None = None, max_age: timedelta = timedelta(days=7)) -> str | None:
    """Return a deterministic rejection reason, or None when freshness is acceptable."""
    if candidate.published_at is None:
        return "missing_published_timestamp"
    reference = _normalise_timestamp(now or _utc_now())
    assert reference is not None
    if candidate.published_at > reference + timedelta(minutes=5):
        return "published_timestamp_in_future"
    if reference - candidate.published_at > max_age:
        return "stale_candidate"
    return None


@dataclass(frozen=True)
class TwscrapeAccount:
    username: str
    password: str = "_"
    email: str = "_"
    email_password: str = "_"
    cookies: str | None = None
    user_agent: str | None = None
    proxy: str | None = None
    mfa_code: str | None = None

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "TwscrapeAccount":
        username = str(value.get("username", "")).strip()
        if not username:
            raise ValueError("each twscrape account requires username")
        cookies = value.get("cookies")
        if isinstance(cookies, dict):
            cookies = "; ".join(f"{key}={val}" for key, val in cookies.items())
        if cookies is not None:
            cookies = str(cookies)
        account = cls(
            username=username,
            password=str(value.get("password", "_")),
            email=str(value.get("email", "_")),
            email_password=str(value.get("email_password", "_")),
            cookies=cookies,
            user_agent=value.get("user_agent"),
            proxy=value.get("proxy"),
            mfa_code=value.get("mfa_code"),
        )
        has_credentials = all(
            getattr(account, field) not in ("", "_")
            for field in ("password", "email", "email_password")
        )
        if not account.cookies and not has_credentials:
            raise ValueError(
                f"account {username!r} needs cookies or password, email, and email_password"
            )
        return account


def load_twscrape_accounts(
    *,
    environ: Mapping[str, str] | None = None,
) -> tuple[TwscrapeAccount, ...]:
    """Load operator-supplied account records from JSON env/file configuration."""
    environ = environ or os.environ
    inline = environ.get("ARKZEN_TWSCRAPE_ACCOUNTS_JSON")
    filename = environ.get("ARKZEN_TWSCRAPE_ACCOUNTS_FILE")
    if inline and filename:
        raise ValueError("set only one of ARKZEN_TWSCRAPE_ACCOUNTS_JSON or _FILE")
    if filename:
        payload = json.loads(Path(filename).read_text())
    elif inline:
        payload = json.loads(inline)
    else:
        raise ValueError(
            "set ARKZEN_TWSCRAPE_ACCOUNTS_FILE or ARKZEN_TWSCRAPE_ACCOUNTS_JSON"
        )
    records = payload.get("accounts") if isinstance(payload, dict) else payload
    if not isinstance(records, list) or not records:
        raise ValueError("account configuration must contain a non-empty JSON list")
    return tuple(TwscrapeAccount.from_mapping(record) for record in records)


def build_search_query(profile: WatchProfile) -> str:
    terms = (*profile.keywords, *profile.phrase_patterns)
    if not terms:
        raise ValueError(f"watch profile {profile.id} has no keywords or phrase patterns")
    escaped_terms = (term.replace('"', '\\"') for term in terms)
    query = " OR ".join(f'"{term}"' for term in escaped_terms)
    if profile.language_filter:
        query += f" lang:{profile.language_filter}"
    if profile.location_filter:
        location = profile.location_filter.replace('"', '\\"')
        query += f' near:"{location}"'
    return query


def find_match_reason(content: str, profile: WatchProfile) -> str | None:
    folded = content.casefold()
    for phrase in profile.phrase_patterns:
        if phrase.casefold() in folded:
            return f"matched phrase pattern: {phrase}"
    for keyword in profile.keywords:
        if keyword.casefold() in folded:
            return f"matched keyword: {keyword}"
    return None


def find_matched_patterns(content: str, profile: WatchProfile) -> tuple[str, ...]:
    """Return every configured pattern found in content, in profile order."""
    folded = content.casefold()
    return tuple(pattern for pattern in (*profile.phrase_patterns, *profile.keywords) if pattern.casefold() in folded)


class TwscrapePostSource:
    """Adapter around twscrape; no twscrape import occurs until construction."""

    def __init__(
        self,
        accounts: Iterable[TwscrapeAccount],
        *,
        pool_database: str | Path = "twscrape_accounts.sqlite3",
    ) -> None:
        self.accounts = tuple(accounts)
        if not self.accounts:
            raise ValueError("at least one twscrape account is required")
        self.pool_database = str(pool_database)
        try:
            from twscrape import API
        except ImportError as exc:
            raise RuntimeError(
                "twscrape is required for Signal Monitoring; install arkzen[monitoring]"
            ) from exc
        self._api = API(
            pool=self.pool_database,
            raise_when_no_account=True,
            wait_timeout=0,
        )
        self._configured = False
        self._known_states: dict[str, tuple[bool, str | None]] = {}
        self.provider_id = "twscrape"

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(True, True, False)

    def health(self) -> ProviderHealth:
        return ProviderHealth("twscrape", self._configured, None if self._configured else "not configured")

    async def configure(self) -> None:
        if self._configured:
            return
        for account in self.accounts:
            await self._api.pool.add_account(
                username=account.username,
                password=account.password,
                email=account.email,
                email_password=account.email_password,
                cookies=account.cookies,
                user_agent=account.user_agent,
                proxy=account.proxy,
                mfa_code=account.mfa_code,
            )
            if account.cookies:
                await self._api.pool.add_account_cookies(account.username, account.cookies)
        summary = await self._api.pool.login_all()
        logger.info("twscrape account setup complete: %s", summary)
        self._configured = True
        await self._log_account_state_changes()
        for account in await self._api.pool.get_all():
            if not account.active:
                logger.error(
                    "twscrape account unavailable account=%s reason=%s",
                    account.username,
                    account.error_msg or "authentication failed or no session",
                )

    async def search(self, query: str, *, limit: int) -> AsyncIterator[RawPost]:
        await self.configure()
        try:
            async for tweet in self._api.search(query, limit=limit):
                yield RawPost(
                    content=tweet.rawContent,
                    author_handle=f"@{tweet.user.username}",
                    post_timestamp=tweet.date,
                    provider_post_id=tweet.id_str,
                    canonical_url=f"https://x.com/{tweet.user.username}/status/{tweet.id_str}",
                    provider_id="twscrape",
                )
        finally:
            await self._log_account_state_changes()

    async def _log_account_state_changes(self) -> None:
        for account in await self._api.pool.get_all():
            state = (account.active, account.error_msg)
            previous = self._known_states.get(account.username)
            if previous is not None and previous != state:
                logger.warning(
                    "twscrape account state changed account=%s active=%s error=%s",
                    account.username,
                    account.active,
                    account.error_msg or "none",
                )
            self._known_states[account.username] = state


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_run_id() -> str:
    return str(uuid4())


class SignalMonitor:
    """Poll all active profiles and persist provider-neutral Evidence records."""

    def __init__(
        self,
        repository: SQLiteRepository,
        source: PostSource,
        *,
        logger_: logging.Logger | None = None,
        max_retries: int = 2,
        retry_backoff_seconds: float = 0.25,
        sleep: Any = asyncio.sleep,
        cache_ttl_seconds: float = 0,
    ) -> None:
        self.repository = repository
        self.source = source
        self.logger = logger_ or logger
        if max_retries < 0 or retry_backoff_seconds < 0 or cache_ttl_seconds < 0:
            raise ValueError("retry and cache values must be non-negative")
        self.max_retries = max_retries
        self.retry_backoff_seconds = retry_backoff_seconds
        self.sleep = sleep
        self.cache_ttl_seconds = cache_ttl_seconds

    async def run_once(self, *, limit_per_profile: int = 20) -> AcquisitionRunResult:
        started_at = _utc_now()
        profiles_attempted = profiles_succeeded = profiles_failed = 0
        candidates_observed = candidates_accepted = candidates_rejected = duplicates = stale_candidates = 0
        missing_timestamps = malformed_candidates = 0
        failures: list[dict[str, str]] = []
        for profile in self.repository.list_watch_profiles(active_only=True):
            profiles_attempted += 1
            try:
                stats = await self._poll_profile(profile, limit_per_profile)
                profiles_succeeded += 1
                candidates_observed += stats["observed"]
                candidates_accepted += stats["accepted"]
                candidates_rejected += stats["rejected"]
                duplicates += stats["duplicates"]
                stale_candidates += stats["stale"]
                missing_timestamps += stats["missing_timestamps"]
                malformed_candidates += stats["malformed"]
            except Exception as exc:
                profiles_failed += 1
                failures.append({"profile_id": profile.id, "error_kind": _error_kind(exc), "detail": str(exc)})
                self.logger.exception(
                    "signal fetch failed profile=%s account_pool=%s error_kind=%s detail=%s",
                    profile.id,
                    self._account_context(),
                    _error_kind(exc),
                    exc,
                )
        if profiles_failed == 0:
            status = "SUCCESS"
        elif profiles_succeeded:
            status = "PARTIAL_SUCCESS"
        else:
            status = "FAILED"
        result = AcquisitionRunResult(
            run_id=_new_run_id(),
            started_at=started_at,
            completed_at=_utc_now(),
            status=status,
            profiles_attempted=profiles_attempted,
            profiles_succeeded=profiles_succeeded,
            profiles_failed=profiles_failed,
            candidates_observed=candidates_observed,
            candidates_accepted=candidates_accepted,
            candidates_rejected=candidates_rejected,
            duplicates=duplicates,
            stale_candidates=stale_candidates,
            missing_timestamps=missing_timestamps,
            malformed_candidates=malformed_candidates,
            failures=tuple(failures),
        )
        self.repository.save_acquisition_run(result)
        return result

    async def poll_once(self, *, limit_per_profile: int = 20) -> int:
        """Compatibility wrapper returning only the accepted Evidence count."""
        return (await self.run_once(limit_per_profile=limit_per_profile)).captured_count

    async def _poll_profile(self, profile: WatchProfile, limit: int) -> dict[str, int]:
        query = build_search_query(profile)
        stats = {"observed": 0, "accepted": 0, "rejected": 0, "duplicates": 0, "stale": 0, "missing_timestamps": 0, "malformed": 0}
        async for post in self._search_with_retries(profile.id, query, limit):
            stats["observed"] += 1
            try:
                candidate = normalize_candidate(post)
            except CandidateValidationError as exc:
                stats["malformed"] += 1
                stats["rejected"] += 1
                self.logger.warning("malformed candidate profile=%s reason=%s", profile.id, exc)
                continue
            reason = find_match_reason(candidate.content, profile)
            if reason is None:
                stats["rejected"] += 1
                continue
            freshness_reason = freshness_rejection(candidate)
            if freshness_reason:
                if freshness_reason == "stale_candidate":
                    stats["stale"] += 1
                elif freshness_reason == "missing_published_timestamp":
                    stats["missing_timestamps"] += 1
                else:
                    stats["malformed"] += 1
                stats["rejected"] += 1
                continue
            if self.repository.evidence_identity_exists(
                watch_profile_id=profile.id, identity_fingerprint=candidate.identity_fingerprint
            ):
                stats["duplicates"] += 1
                continue
            # Preserve idempotency for Evidence created before the identity migration.
            if candidate.published_at is not None and self.repository.evidence_exists(
                watch_profile_id=profile.id,
                raw_post_content=candidate.raw_content,
                author_handle=candidate.author_handle,
                post_timestamp=candidate.published_at,
            ):
                stats["duplicates"] += 1
                continue
            try:
                self.repository.create_evidence(
                    Evidence(
                        watch_profile_id=profile.id,
                        raw_post_content=candidate.raw_content,
                        author_handle=candidate.author_handle,
                        post_timestamp=candidate.published_at,
                        capture_timestamp=candidate.acquired_at,
                        match_reason=reason,
                        source_type=candidate.source_type,
                        provider_id=candidate.provider_id,
                        provider_signal_id=candidate.provider_signal_id,
                        canonical_url=candidate.canonical_url,
                        content_hash=candidate.content_hash,
                        identity_fingerprint=candidate.identity_fingerprint,
                        matched_patterns=find_matched_patterns(candidate.content, profile),
                        provenance={"provider_id": candidate.provider_id or "unknown", "acquired_at": candidate.acquired_at.isoformat(), "query": query},
                    )
                )
            except sqlite3.IntegrityError:
                if self.repository.evidence_identity_exists(
                    watch_profile_id=profile.id, identity_fingerprint=candidate.identity_fingerprint
                ):
                    stats["duplicates"] += 1
                    continue
                raise
            stats["accepted"] += 1
        return stats

    async def _search_with_retries(self, profile_id: str, query: str, limit: int) -> AsyncIterator[RawPost]:
        provider_id = self._provider_id()
        cache_key = hashlib.sha256(f"{provider_id}|{query}|{limit}".encode()).hexdigest()
        if self.cache_ttl_seconds:
            cached = self.repository.get_cache_entry(cache_key)
            if cached and (_utc_now() - cached.fetched_at).total_seconds() <= self.cache_ttl_seconds:
                try:
                    for value in json.loads(cached.payload_json):
                        yield RawPost(
                            content=value["content"],
                            author_handle=value["author_handle"],
                            post_timestamp=datetime.fromisoformat(value["post_timestamp"]) if value.get("post_timestamp") else None,
                            provider_post_id=value.get("provider_post_id"),
                            canonical_url=value.get("canonical_url"),
                            provider_id=value.get("provider_id"),
                        )
                    return
                except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                    self.logger.warning("invalid acquisition cache key=%s profile=%s", cache_key, profile_id)
        for attempt in range(self.max_retries + 1):
            posts: list[RawPost] = []
            try:
                async for post in self.source.search(query, limit=limit):
                    posts.append(post)
                if self.cache_ttl_seconds:
                    self.repository.save_cache_entry(
                        AcquisitionCacheEntry(
                            cache_key=cache_key,
                            provider_id=provider_id,
                            fetched_at=_utc_now(),
                            payload_json=json.dumps([
                                {
                                    "content": post.content,
                                    "author_handle": post.author_handle,
                                    "post_timestamp": post.post_timestamp.isoformat() if post.post_timestamp else None,
                                    "provider_post_id": post.provider_post_id,
                                    "canonical_url": post.canonical_url,
                                    "provider_id": post.provider_id,
                                }
                                for post in posts
                            ]),
                        )
                    )
                for post in posts:
                    yield post
                return
            except Exception:
                if attempt >= self.max_retries:
                    raise
                delay = self.retry_backoff_seconds * (2**attempt)
                self.logger.warning("acquisition retry profile=%s attempt=%s/%s", profile_id, attempt + 1, self.max_retries)
                if delay:
                    await self.sleep(delay)

    def _provider_id(self) -> str:
        return str(getattr(self.source, "provider_id", None) or getattr(self.source, "name", None) or type(self.source).__name__).casefold()

    def provider_health(self) -> ProviderHealth:
        health = getattr(self.source, "health", None)
        if callable(health):
            result = health()
            if isinstance(result, ProviderHealth):
                return result
        return ProviderHealth(self._provider_id(), True)

    def _account_context(self) -> str:
        accounts = getattr(self.source, "accounts", None)
        if accounts:
            return ",".join(getattr(account, "username", "unknown") for account in accounts)
        return "provider-managed"

    async def run_forever(
        self,
        *,
        interval_seconds: float = 60,
        limit_per_profile: int = 20,
        stop_event: asyncio.Event | None = None,
    ) -> None:
        stop_event = stop_event or asyncio.Event()
        while not stop_event.is_set():
            await self.poll_once(limit_per_profile=limit_per_profile)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                continue


def _error_kind(error: Exception) -> str:
    text = f"{type(error).__name__} {error}".casefold()
    if "rate" in text or "limit" in text:
        return "rate_limit"
    if "auth" in text or "credential" in text or "login" in text:
        return "authentication"
    if "lock" in text or "ban" in text or "denied" in text:
        return "account_lockout"
    if "network" in text or "connect" in text or "timeout" in text:
        return "network"
    return type(error).__name__
