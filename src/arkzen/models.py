"""Immutable domain records for the Phase 1 data model."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import uuid4


def _new_id() -> str:
    return str(uuid4())


@dataclass(frozen=True)
class WatchProfile:
    """An operator-defined profile used to identify matching posts."""

    owner: str
    source_description: str
    keywords: tuple[str, ...] = ()
    phrase_patterns: tuple[str, ...] = ()
    location_filter: str | None = None
    language_filter: str | None = None
    active: bool = True
    id: str = field(default_factory=_new_id)

    def __post_init__(self) -> None:
        object.__setattr__(self, "keywords", tuple(self.keywords))
        object.__setattr__(self, "phrase_patterns", tuple(self.phrase_patterns))


@dataclass(frozen=True)
class Evidence:
    """An immutable raw matching post captured for a WatchProfile."""

    watch_profile_id: str
    raw_post_content: str
    author_handle: str
    post_timestamp: datetime
    capture_timestamp: datetime
    match_reason: str
    id: str = field(default_factory=_new_id)
    source_type: str = "unknown"
    provider_id: str | None = None
    provider_signal_id: str | None = None
    canonical_url: str | None = None
    content_hash: str | None = None
    identity_fingerprint: str | None = None
    matched_patterns: tuple[str, ...] = ()
    provenance: dict[str, str] = field(default_factory=dict)
    schema_version: str = "evidence-v1"


@dataclass(frozen=True)
class AcquisitionRun:
    """Durable summary of one acquisition attempt."""

    run_id: str
    started_at: datetime
    completed_at: datetime
    status: str
    profiles_attempted: int
    profiles_succeeded: int
    profiles_failed: int
    candidates_observed: int
    candidates_accepted: int
    candidates_rejected: int
    duplicates: int
    stale_candidates: int
    missing_timestamps: int
    malformed_candidates: int
    failures: tuple[dict[str, str], ...] = ()

    @property
    def captured_count(self) -> int:
        return self.candidates_accepted


@dataclass(frozen=True)
class AcquisitionCheckpoint:
    """Provider-neutral resumable position, when a provider offers one."""

    profile_id: str
    provider_id: str
    cursor: str | None
    updated_at: datetime


@dataclass(frozen=True)
class AcquisitionCacheEntry:
    """Small local cache record; Evidence remains the source of truth."""

    cache_key: str
    provider_id: str
    fetched_at: datetime
    payload_json: str


class QualificationStatus(StrEnum):
    QUALIFIED = "QUALIFIED"
    REJECTED = "REJECTED"
    NEEDS_REVIEW = "NEEDS_REVIEW"


@dataclass(frozen=True)
class Qualification:
    """Versioned deterministic decision derived from immutable Evidence."""

    evidence_id: str
    status: QualificationStatus
    intent_strength: float
    authenticity: float
    spam_likelihood: float
    reachability: float
    reason: str
    qualification_version: str
    evaluated_at: datetime
    id: str = field(default_factory=_new_id)
    model_id: str | None = None
    model_version: str | None = None
    prompt_version: str | None = None
    scoring_schema_version: str = "scoring-v1"
    evaluation_version: str = "evaluation-v1"


class EvidenceReviewStatus(StrEnum):
    USEFUL = "USEFUL"
    NOT_USEFUL = "NOT_USEFUL"
    NEEDS_MORE_INFO = "NEEDS_MORE_INFO"


@dataclass(frozen=True)
class EvidenceReview:
    """An append-only operator decision used to validate Phase 1 acquisition."""

    evidence_id: str
    decision: EvidenceReviewStatus
    reviewer: str
    reviewed_at: datetime
    id: str = field(default_factory=_new_id)
    reason: str | None = None
    schema_version: str = "evidence-review-v1"
