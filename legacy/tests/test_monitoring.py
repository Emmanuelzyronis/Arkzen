import asyncio
import hashlib
import json
import logging
import unittest
from collections.abc import AsyncIterator, Mapping
from datetime import datetime, timedelta, timezone

from arkzen import (
    AcquisitionCacheEntry,
    AcquisitionCheckpoint,
    RawPost,
    SignalMonitor,
    SQLiteRepository,
    WatchProfile,
    TwscrapeAccount,
    build_search_query,
    freshness_rejection,
    load_twscrape_accounts,
    normalize_candidate,
    ProviderCapabilities,
    ProviderHealth,
)


class FakePostSource:
    def __init__(self, posts_by_query: Mapping[str, list[RawPost]], *, error: Exception | None = None):
        self.posts_by_query = posts_by_query
        self.error = error
        self.queries: list[str] = []

    async def search(self, query: str, *, limit: int) -> AsyncIterator[RawPost]:
        self.queries.append(query)
        if self.error:
            raise self.error
        for post in self.posts_by_query.get(query, [])[:limit]:
            yield post


class MonitoringTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.repository = SQLiteRepository(":memory:")
        self.post_time = datetime(2026, 9, 6, 10, 30, tzinfo=timezone.utc)

    def tearDown(self) -> None:
        self.repository.close()

    async def test_polls_all_active_profiles_and_writes_matching_evidence(self) -> None:
        first = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        second = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="copy", keywords=("copywriter",))
        )
        posts = {
            build_search_query(first): [
                RawPost("Need a designer", "@one", self.post_time),
                RawPost("Unrelated result", "@two", self.post_time),
            ],
            build_search_query(second): [
                RawPost("Looking for a copywriter", "@three", self.post_time),
            ],
        }
        source = FakePostSource(posts)

        captured = await SignalMonitor(self.repository, source).poll_once()

        self.assertEqual(captured, 2)
        evidence = list(self.repository.list_evidence())
        self.assertEqual({item.watch_profile_id for item in evidence}, {first.id, second.id})
        self.assertEqual({item.author_handle for item in evidence}, {"@one", "@three"})
        self.assertIn("matched keyword: designer", {item.match_reason for item in evidence})
        self.assertEqual(
            {item.matched_patterns for item in evidence},
            {("designer",), ("copywriter",)},
        )

    async def test_repeated_poll_does_not_duplicate_same_post(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        post = RawPost("Need a designer", "@one", self.post_time)
        source = FakePostSource({build_search_query(profile): [post]})
        monitor = SignalMonitor(self.repository, source)

        self.assertEqual(await monitor.poll_once(), 1)
        self.assertEqual(await monitor.poll_once(), 0)
        self.assertEqual(len(list(self.repository.list_evidence())), 1)

    async def test_one_profile_error_does_not_stop_other_profiles(self) -> None:
        failing = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="bad", keywords=("bad",))
        )
        healthy = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="good", keywords=("good",))
        )

        class PerQuerySource:
            async def search(self, query: str, *, limit: int) -> AsyncIterator[RawPost]:
                if query == build_search_query(failing):
                    raise RuntimeError("network timeout")
                yield RawPost("good request", "@healthy", self_post_time)

        self_post_time = self.post_time
        captured = await SignalMonitor(self.repository, PerQuerySource()).poll_once()

        self.assertEqual(captured, 1)
        self.assertEqual(list(self.repository.list_evidence())[0].watch_profile_id, healthy.id)

    def test_account_configuration_supports_inline_json_and_cookies(self) -> None:
        accounts = load_twscrape_accounts(
            environ={
                "ARKZEN_TWSCRAPE_ACCOUNTS_JSON": json.dumps(
                    {
                        "accounts": [
                            {"username": "cookie-user", "cookies": {"auth_token": "a", "ct0": "b"}},
                            {
                                "username": "password-user",
                                "password": "p",
                                "email": "e@example.com",
                                "email_password": "ep",
                            },
                        ]
                    }
                )
            }
        )

        self.assertEqual([account.username for account in accounts], ["cookie-user", "password-user"])
        self.assertEqual(accounts[0].cookies, "auth_token=a; ct0=b")

    def test_search_query_quotes_terms(self) -> None:
        profile = WatchProfile(
            owner="founder",
            source_description="requests",
            keywords=("web designer",),
            phrase_patterns=("need a \"site\"",),
        )
        self.assertEqual(
            build_search_query(profile), '"web designer" OR "need a \\"site\\""'
        )

    def test_search_query_includes_optional_filters(self) -> None:
        profile = WatchProfile(
            owner="founder",
            source_description="requests",
            keywords=("designer",),
            location_filter="London",
            language_filter="en",
        )
        self.assertEqual(build_search_query(profile), '"designer" lang:en near:"London"')

    def test_normalized_candidate_prefers_provider_identity(self) -> None:
        candidate = normalize_candidate(
            RawPost(
                "Need a designer",
                " @Prospect ",
                self.post_time,
                provider_post_id="123",
                canonical_url="https://x.com/Prospect/status/123",
                provider_id="twscrape",
            )
        )
        self.assertEqual(candidate.provider_signal_id, "123")
        self.assertEqual(candidate.source_type, "twscrape")
        self.assertEqual(candidate.canonical_url, "https://x.com/Prospect/status/123")
        self.assertNotEqual(candidate.identity_fingerprint, candidate.content_hash)

    def test_provider_signal_id_is_used_without_provider_name(self) -> None:
        candidate = normalize_candidate(RawPost("Need a designer", "@prospect", self.post_time, provider_post_id="123"))
        changed = normalize_candidate(RawPost("Different content", "@other", self.post_time, provider_post_id="123"))
        self.assertEqual(candidate.identity_fingerprint, changed.identity_fingerprint)

    def test_fallback_identity_ignores_insignificant_normalization(self) -> None:
        first = normalize_candidate(RawPost("Need   a designer", "@Prospect", self.post_time))
        second = normalize_candidate(RawPost(" need a designer ", " @prospect ", self.post_time))
        self.assertEqual(first.identity_fingerprint, second.identity_fingerprint)

    async def test_run_status_success_empty_and_failure(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        empty = await SignalMonitor(self.repository, FakePostSource({})).run_once()
        self.assertEqual(empty.status, "SUCCESS")
        self.assertEqual(empty.candidates_accepted, 0)

        class FailingSource:
            async def search(self, query: str, *, limit: int) -> AsyncIterator[RawPost]:
                raise RuntimeError("provider timeout")
                yield  # pragma: no cover

        failed = await SignalMonitor(self.repository, FailingSource()).run_once()
        self.assertEqual(failed.status, "FAILED")
        self.assertEqual(failed.profiles_failed, 1)
        self.assertEqual(failed.failures[0]["error_kind"], "network")

    async def test_run_status_partial_multi_profile_failure(self) -> None:
        failing = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="bad", keywords=("bad",))
        )
        healthy = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="good", keywords=("good",))
        )

        class PerQuerySource:
            async def search(self, query: str, *, limit: int) -> AsyncIterator[RawPost]:
                if query == build_search_query(failing):
                    raise RuntimeError("provider timeout")
                yield RawPost("good request", "@healthy", self_post_time)

        self_post_time = self.post_time
        result = await SignalMonitor(self.repository, PerQuerySource()).run_once()
        self.assertEqual(result.status, "PARTIAL_SUCCESS")
        self.assertEqual(result.profiles_succeeded, 1)
        self.assertEqual(result.profiles_failed, 1)
        self.assertEqual(result.candidates_accepted, 1)

    async def test_freshness_and_malformed_candidates_are_rejected(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        now = datetime.now(timezone.utc)
        source = FakePostSource(
            {
                build_search_query(profile): [
                    RawPost("Need a designer", "@stale", now - timedelta(days=8)),
                    RawPost("Need a designer", "@missing", None),
                    RawPost("Need a designer", "@future", now + timedelta(hours=1)),
                    RawPost(None, "@malformed", now),  # type: ignore[arg-type]
                ]
            }
        )
        result = await SignalMonitor(self.repository, source).run_once()
        self.assertEqual(result.candidates_accepted, 0)
        self.assertEqual(result.candidates_rejected, 4)
        self.assertEqual(result.stale_candidates, 1)
        self.assertEqual(result.missing_timestamps, 1)
        self.assertEqual(result.malformed_candidates, 2)
        self.assertEqual(list(self.repository.list_evidence()), [])

    async def test_duplicate_provider_id_and_repeated_runs_are_idempotent(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        source = FakePostSource(
            {
                build_search_query(profile): [
                    RawPost("Need a designer", "@one", self.post_time, provider_post_id="same", provider_id="p"),
                    RawPost("Need a designer now", "@one", self.post_time, provider_post_id="same", provider_id="p"),
                ]
            }
        )
        monitor = SignalMonitor(self.repository, source)
        first = await monitor.run_once()
        second = await monitor.run_once()
        self.assertEqual(first.candidates_accepted, 1)
        self.assertEqual(first.duplicates, 1)
        self.assertEqual(second.candidates_accepted, 0)
        self.assertEqual(second.duplicates, 2)
        self.assertEqual(len(list(self.repository.list_evidence())), 1)

    async def test_retry_is_bounded_and_uses_exponential_backoff(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        attempts = 0
        delays: list[float] = []

        class FlakySource:
            async def search(self, query: str, *, limit: int) -> AsyncIterator[RawPost]:
                nonlocal attempts
                attempts += 1
                if attempts < 3:
                    raise RuntimeError("temporary network timeout")
                yield RawPost("Need a designer", "@one", post_time)

        async def fake_sleep(delay: float) -> None:
            delays.append(delay)

        post_time = self.post_time
        result = await SignalMonitor(
            self.repository,
            FlakySource(),
            retry_backoff_seconds=0.1,
            sleep=fake_sleep,
        ).run_once()
        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(attempts, 3)
        self.assertEqual(delays, [0.1, 0.2])

    async def test_cache_hit_and_stale_cache_do_not_bypass_pipeline(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        source = FakePostSource({build_search_query(profile): [RawPost("Need a designer", "@one", self.post_time)]})
        monitor = SignalMonitor(self.repository, source, cache_ttl_seconds=60)
        self.assertEqual((await monitor.run_once()).candidates_accepted, 1)
        self.assertEqual((await monitor.run_once()).duplicates, 1)
        self.assertEqual(len(source.queries), 1)

        source.posts_by_query[build_search_query(profile)] = [RawPost("Need a designer", "@two", self.post_time)]
        stale = next(self.repository.get_cache_entry(key) for key in [
            hashlib.sha256(f"fakepostsource|{build_search_query(profile)}|20".encode()).hexdigest()
        ])
        self.repository.save_cache_entry(AcquisitionCacheEntry(stale.cache_key, stale.provider_id, self.post_time - timedelta(days=2), stale.payload_json))
        result = await monitor.run_once()
        self.assertEqual(result.candidates_accepted, 1)
        self.assertEqual(len(source.queries), 2)

    def test_checkpoint_round_trip_and_update(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        self.assertIsNone(self.repository.get_checkpoint(profile_id=profile.id, provider_id="provider"))
        first = AcquisitionCheckpoint(profile.id, "provider", "cursor-1", self.post_time)
        second = AcquisitionCheckpoint(profile.id, "provider", "cursor-2", self.post_time + timedelta(minutes=1))
        self.repository.save_checkpoint(first)
        self.assertEqual(self.repository.get_checkpoint(profile_id=profile.id, provider_id="provider"), first)
        self.repository.save_checkpoint(second)
        self.assertEqual(self.repository.get_checkpoint(profile_id=profile.id, provider_id="provider"), second)

    def test_cache_entry_round_trip(self) -> None:
        entry = AcquisitionCacheEntry("key", "provider", self.post_time, "[]")
        self.repository.save_cache_entry(entry)
        self.assertEqual(self.repository.get_cache_entry("key"), entry)

    def test_provider_health_and_capability_contracts_are_minimal(self) -> None:
        class HealthySource(FakePostSource):
            provider_id = "fake"

            def health(self) -> ProviderHealth:
                return ProviderHealth("fake", True)

        monitor = SignalMonitor(self.repository, HealthySource({}))
        self.assertEqual(monitor.provider_health(), ProviderHealth("fake", True))
        capabilities = ProviderCapabilities(True, False, False)
        self.assertFalse(capabilities.supports_cursor)


if __name__ == "__main__":
    unittest.main()
