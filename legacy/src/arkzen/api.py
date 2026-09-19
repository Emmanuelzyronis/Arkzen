"""Minimal Phase 1 API for profile capture, Evidence review, and monitoring."""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .intent_capture import create_watch_profile_from_input
from .models import (
    Evidence,
    EvidenceReview,
    EvidenceReviewStatus,
    Qualification,
    QualificationStatus,
    WatchProfile,
)
from .monitoring import (
    AcquisitionRunResult,
    ProviderCapabilities,
    ProviderHealth,
    SignalMonitor,
    TwscrapeAccount,
    TwscrapePostSource,
    load_twscrape_accounts,
)
from .qualification import QualificationError, evaluate_evidence
from .persistence import SQLiteRepository

logger = logging.getLogger(__name__)


class WatchProfileCreateRequest(BaseModel):
    owner: str = Field(min_length=1)
    source_description: str = Field(min_length=1)
    keywords: str | list[str] = ""
    phrase_patterns: str | list[str] = ""
    location_filter: str | None = None
    language_filter: str | None = None
    active: bool = True


class WatchProfileResponse(BaseModel):
    id: str
    owner: str
    source_description: str
    keywords: list[str]
    phrase_patterns: list[str]
    location_filter: str | None
    language_filter: str | None
    active: bool


class EvidenceResponse(BaseModel):
    id: str
    watch_profile_id: str
    raw_post_content: str
    author_handle: str
    post_timestamp: datetime
    capture_timestamp: datetime
    match_reason: str
    source_type: str
    provider_id: str | None
    provider_signal_id: str | None
    canonical_url: str | None
    content_hash: str | None
    identity_fingerprint: str | None
    matched_patterns: list[str]
    provenance: dict[str, str]
    schema_version: str
    watch_profile: WatchProfileResponse
    latest_review: "EvidenceReviewResponse | None" = None


class MonitoringRunResponse(BaseModel):
    run_id: str
    ran_at: datetime
    completed_at: datetime
    status: str
    profiles_attempted: int
    profiles_succeeded: int
    profiles_failed: int
    candidates_observed: int
    candidates_accepted: int
    candidates_rejected: int
    captured_count: int
    duplicates: int
    stale_candidates: int
    missing_timestamps: int
    malformed_candidates: int
    failures: list[dict[str, str]]
    active_profile_count: int


class MonitoringVerificationResponse(BaseModel):
    provider_id: str
    available: bool
    detail: str | None
    supports_provider_signal_id: bool
    supports_canonical_url: bool
    supports_cursor: bool


class EvidenceReviewCreateRequest(BaseModel):
    evidence_id: str = Field(min_length=1)
    decision: EvidenceReviewStatus
    reviewer: str = Field(min_length=1)
    reason: str | None = None


class EvidenceReviewResponse(BaseModel):
    id: str
    evidence_id: str
    decision: EvidenceReviewStatus
    reviewer: str
    reason: str | None
    reviewed_at: datetime
    schema_version: str


class EvidenceReviewSummaryResponse(BaseModel):
    USEFUL: int
    NOT_USEFUL: int
    NEEDS_MORE_INFO: int
    total: int


class QualificationCreateRequest(BaseModel):
    evidence_id: str = Field(min_length=1)
    qualification_version: str = Field(default="deterministic-v1", min_length=1)


class QualificationResponse(BaseModel):
    id: str
    evidence_id: str
    status: QualificationStatus
    intent_strength: float
    authenticity: float
    spam_likelihood: float
    reachability: float
    reason: str
    qualification_version: str
    evaluated_at: datetime
    model_id: str | None
    model_version: str | None
    prompt_version: str | None
    scoring_schema_version: str
    evaluation_version: str


def _qualification_response(qualification: Qualification) -> QualificationResponse:
    return QualificationResponse(
        id=qualification.id,
        evidence_id=qualification.evidence_id,
        status=qualification.status,
        intent_strength=qualification.intent_strength,
        authenticity=qualification.authenticity,
        spam_likelihood=qualification.spam_likelihood,
        reachability=qualification.reachability,
        reason=qualification.reason,
        qualification_version=qualification.qualification_version,
        evaluated_at=qualification.evaluated_at,
        model_id=qualification.model_id,
        model_version=qualification.model_version,
        prompt_version=qualification.prompt_version,
        scoring_schema_version=qualification.scoring_schema_version,
        evaluation_version=qualification.evaluation_version,
    )


def _evidence_review_response(review: EvidenceReview) -> EvidenceReviewResponse:
    return EvidenceReviewResponse(
        id=review.id,
        evidence_id=review.evidence_id,
        decision=review.decision,
        reviewer=review.reviewer,
        reason=review.reason,
        reviewed_at=review.reviewed_at,
        schema_version=review.schema_version,
    )


def _profile_response(profile: WatchProfile) -> WatchProfileResponse:
    return WatchProfileResponse(
        id=profile.id,
        owner=profile.owner,
        source_description=profile.source_description,
        keywords=list(profile.keywords),
        phrase_patterns=list(profile.phrase_patterns),
        location_filter=profile.location_filter,
        language_filter=profile.language_filter,
        active=profile.active,
    )


def _evidence_response(
    evidence: Evidence,
    profile: WatchProfile,
    latest_review: EvidenceReview | None = None,
) -> EvidenceResponse:
    return EvidenceResponse(
        id=evidence.id,
        watch_profile_id=evidence.watch_profile_id,
        raw_post_content=evidence.raw_post_content,
        author_handle=evidence.author_handle,
        post_timestamp=evidence.post_timestamp,
        capture_timestamp=evidence.capture_timestamp,
        match_reason=evidence.match_reason,
        source_type=evidence.source_type,
        provider_id=evidence.provider_id,
        provider_signal_id=evidence.provider_signal_id,
        canonical_url=evidence.canonical_url,
        content_hash=evidence.content_hash,
        identity_fingerprint=evidence.identity_fingerprint,
        matched_patterns=list(evidence.matched_patterns),
        provenance=evidence.provenance,
        schema_version=evidence.schema_version,
        watch_profile=_profile_response(profile),
        latest_review=_evidence_review_response(latest_review) if latest_review else None,
    )


def create_app(
    repository: SQLiteRepository | None = None,
    *,
    source_factory: Callable[[tuple[TwscrapeAccount, ...]], Any] | None = None,
) -> FastAPI:
    """Create the API, allowing tests to inject an in-memory repository/source."""
    repository = repository or SQLiteRepository(os.getenv("ARKZEN_DATABASE_PATH", "arkzen.sqlite3"))
    source_factory = source_factory or (lambda accounts: TwscrapePostSource(accounts))
    app = FastAPI(title="Arkzen Phase 1 API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/watch-profiles", response_model=list[WatchProfileResponse])
    def list_active_watch_profiles() -> list[WatchProfileResponse]:
        return [_profile_response(profile) for profile in repository.list_watch_profiles(active_only=True)]

    @app.post("/watch-profiles", response_model=WatchProfileResponse, status_code=201)
    def create_watch_profile(request: WatchProfileCreateRequest) -> WatchProfileResponse:
        try:
            profile = create_watch_profile_from_input(
                repository,
                owner=request.owner,
                source_description=request.source_description,
                keywords=request.keywords,
                phrase_patterns=request.phrase_patterns,
                location_filter=request.location_filter,
                language_filter=request.language_filter,
                active=request.active,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return _profile_response(profile)

    @app.get("/evidence", response_model=list[EvidenceResponse])
    def list_evidence(limit: int = Query(default=100, ge=1, le=500)) -> list[EvidenceResponse]:
        profiles = {profile.id: profile for profile in repository.list_watch_profiles()}
        reviews = {review.evidence_id: review for review in repository.list_latest_evidence_reviews()}
        evidence = list(repository.list_evidence())
        evidence.reverse()
        return [
            _evidence_response(item, profiles[item.watch_profile_id], reviews.get(item.id))
            for item in evidence[:limit]
            if item.watch_profile_id in profiles
        ]

    @app.post("/evidence/reviews", response_model=EvidenceReviewResponse, status_code=201)
    def create_evidence_review(request: EvidenceReviewCreateRequest) -> EvidenceReviewResponse:
        evidence = repository.get_evidence(request.evidence_id)
        if evidence is None:
            raise HTTPException(status_code=404, detail="evidence_not_found")
        review = EvidenceReview(
            evidence_id=evidence.id,
            decision=request.decision,
            reviewer=request.reviewer,
            reason=request.reason,
            reviewed_at=datetime.now(timezone.utc),
        )
        repository.create_evidence_review(review)
        return _evidence_review_response(review)

    @app.get("/evidence/reviews", response_model=list[EvidenceReviewResponse])
    def list_evidence_reviews(evidence_id: str | None = None) -> list[EvidenceReviewResponse]:
        return [
            _evidence_review_response(review)
            for review in repository.list_evidence_reviews(evidence_id=evidence_id)
        ]

    @app.get("/evidence/reviews/summary", response_model=EvidenceReviewSummaryResponse)
    def evidence_review_summary() -> EvidenceReviewSummaryResponse:
        summary = repository.evidence_review_summary()
        return EvidenceReviewSummaryResponse(
            USEFUL=summary[EvidenceReviewStatus.USEFUL.value],
            NOT_USEFUL=summary[EvidenceReviewStatus.NOT_USEFUL.value],
            NEEDS_MORE_INFO=summary[EvidenceReviewStatus.NEEDS_MORE_INFO.value],
            total=sum(summary.values()),
        )

    @app.post("/monitoring/verify", response_model=MonitoringVerificationResponse)
    async def verify_monitoring() -> MonitoringVerificationResponse:
        try:
            accounts = load_twscrape_accounts()
        except (OSError, ValueError) as exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Monitoring is not configured. Supply operator accounts with "
                    "ARKZEN_TWSCRAPE_ACCOUNTS_FILE or ARKZEN_TWSCRAPE_ACCOUNTS_JSON. "
                    f"Detail: {exc}"
                ),
            ) from exc
        try:
            source = source_factory(accounts)
            configure = getattr(source, "configure", None)
            if callable(configure):
                await configure()
            health_method = getattr(source, "health", None)
            if not callable(health_method):
                raise RuntimeError("provider does not implement the health contract")
            health = health_method()
            if not isinstance(health, ProviderHealth):
                raise RuntimeError("provider returned an invalid health result")
            capabilities_method = getattr(source, "capabilities", None)
            capabilities = ProviderCapabilities(False, False, False)
            if callable(capabilities_method):
                candidate_capabilities = capabilities_method()
                if isinstance(candidate_capabilities, ProviderCapabilities):
                    capabilities = candidate_capabilities
        except Exception as exc:
            logger.exception("monitoring verification failed detail=%s", exc)
            raise HTTPException(
                status_code=502,
                detail=f"Monitoring verification failed ({type(exc).__name__}): {exc}",
            ) from exc
        return MonitoringVerificationResponse(
            provider_id=health.provider_id,
            available=health.available,
            detail=health.detail,
            supports_provider_signal_id=capabilities.supports_provider_signal_id,
            supports_canonical_url=capabilities.supports_canonical_url,
            supports_cursor=capabilities.supports_cursor,
        )

    @app.post("/monitoring/run", response_model=MonitoringRunResponse)
    async def run_monitoring(limit_per_profile: int = Query(default=20, ge=1, le=100)) -> MonitoringRunResponse:
        try:
            accounts = load_twscrape_accounts()
        except (OSError, ValueError) as exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Monitoring is not configured. Supply operator accounts with "
                    "ARKZEN_TWSCRAPE_ACCOUNTS_FILE or ARKZEN_TWSCRAPE_ACCOUNTS_JSON. "
                    f"Detail: {exc}"
                ),
            ) from exc
        try:
            source = source_factory(accounts)
            result = await SignalMonitor(repository, source).run_once(
                limit_per_profile=limit_per_profile
            )
        except Exception as exc:
            logger.exception("monitoring run failed error_kind=%s detail=%s", type(exc).__name__, exc)
            raise HTTPException(
                status_code=502,
                detail=f"Monitoring run failed ({type(exc).__name__}): {exc}",
            ) from exc
        return MonitoringRunResponse(**_monitoring_response(result, repository))

    @app.get("/monitoring/runs", response_model=list[MonitoringRunResponse])
    def list_monitoring_runs(limit: int = Query(default=100, ge=1, le=500)) -> list[MonitoringRunResponse]:
        return [MonitoringRunResponse(**_monitoring_response(run, repository)) for run in repository.list_acquisition_runs(limit=limit)]

    @app.get("/monitoring/runs/{run_id}", response_model=MonitoringRunResponse)
    def get_monitoring_run(run_id: str) -> MonitoringRunResponse:
        result = repository.get_acquisition_run(run_id)
        if result is None:
            raise HTTPException(status_code=404, detail="acquisition_run_not_found")
        return MonitoringRunResponse(**_monitoring_response(result, repository))

    @app.post("/qualifications", response_model=QualificationResponse, status_code=201)
    def create_qualification(request: QualificationCreateRequest) -> QualificationResponse:
        evidence = repository.get_evidence(request.evidence_id)
        if evidence is None:
            raise HTTPException(status_code=404, detail="evidence_not_found")
        try:
            qualification = evaluate_evidence(
                evidence, qualification_version=request.qualification_version
            )
        except QualificationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        repository.create_qualification(qualification)
        return _qualification_response(qualification)

    @app.get("/qualifications", response_model=list[QualificationResponse])
    def list_qualifications(evidence_id: str | None = None) -> list[QualificationResponse]:
        return [_qualification_response(item) for item in repository.list_qualifications(evidence_id=evidence_id)]

    return app


def _monitoring_response(result: AcquisitionRunResult, repository: SQLiteRepository) -> dict[str, Any]:
    return {
        "run_id": result.run_id,
        "ran_at": result.started_at,
        "completed_at": result.completed_at,
        "status": result.status,
        "profiles_attempted": result.profiles_attempted,
        "profiles_succeeded": result.profiles_succeeded,
        "profiles_failed": result.profiles_failed,
        "candidates_observed": result.candidates_observed,
        "candidates_accepted": result.candidates_accepted,
        "candidates_rejected": result.candidates_rejected,
        "captured_count": result.captured_count,
        "duplicates": result.duplicates,
        "stale_candidates": result.stale_candidates,
        "missing_timestamps": result.missing_timestamps,
        "malformed_candidates": result.malformed_candidates,
        "failures": list(result.failures),
        "active_profile_count": sum(1 for _ in repository.list_watch_profiles(active_only=True)),
    }


app = create_app()
