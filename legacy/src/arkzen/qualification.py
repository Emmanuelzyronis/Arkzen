"""Small deterministic qualification foundation for Phase 2."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from .models import Evidence, Qualification, QualificationStatus


class QualificationError(ValueError):
    """Raised when Evidence cannot be evaluated safely."""


_INTENT_PATTERNS = (
    re.compile(r"\bneed(?:s|ed)?\b"),
    re.compile(r"\b(?:looking|searching|seeking) for\b"),
    re.compile(r"\b(?:want|wants|wanted)\b"),
    re.compile(r"\brecommend(?:ation|ations)?\b"),
    re.compile(r"\b(?:hire|find|get)\b"),
    re.compile(r"\banyone know\b"),
)
_SPAM_PATTERNS = (
    re.compile(r"\bbuy followers\b"),
    re.compile(r"\bfree money\b"),
    re.compile(r"\bcrypto giveaway\b"),
    re.compile(r"\bairdrop\b"),
    re.compile(r"\bpromo code\b"),
)


def evaluate_evidence(
    evidence: Evidence,
    *,
    qualification_version: str = "deterministic-v1",
    evaluated_at: datetime | None = None,
) -> Qualification:
    """Evaluate one Evidence record without model calls or provider knowledge."""
    if not isinstance(evidence, Evidence):
        raise QualificationError("evidence is required")
    content = evidence.raw_post_content.strip() if isinstance(evidence.raw_post_content, str) else ""
    author = evidence.author_handle.strip() if isinstance(evidence.author_handle, str) else ""
    if not content or not author or evidence.post_timestamp is None:
        return Qualification(
            evidence_id=evidence.id,
            status=QualificationStatus.REJECTED,
            intent_strength=0.0,
            authenticity=0.0,
            spam_likelihood=0.0,
            reachability=0.0,
            reason="insufficient_evidence",
            qualification_version=qualification_version,
            evaluated_at=evaluated_at or datetime.now(timezone.utc),
        )

    folded = content.casefold()
    spam_hits = [pattern.pattern for pattern in _SPAM_PATTERNS if pattern.search(folded)]
    intent_hits = [pattern.pattern for pattern in _INTENT_PATTERNS if pattern.search(folded)]
    reachable = author.startswith("@") and len(author) > 1
    if spam_hits:
        status = QualificationStatus.REJECTED
        reason = f"obvious_spam_pattern:{spam_hits[0]}"
        intent_strength = 0.0
        authenticity = 0.1
        spam_likelihood = 1.0
    elif intent_hits and reachable:
        status = QualificationStatus.QUALIFIED
        reason = f"explicit_intent:{intent_hits[0]}"
        intent_strength = min(1.0, 0.5 + 0.15 * len(intent_hits))
        authenticity = 0.8
        spam_likelihood = 0.0
    else:
        status = QualificationStatus.NEEDS_REVIEW
        reason = "ambiguous_intent_or_unreachable_author"
        intent_strength = 0.25 if intent_hits else 0.0
        authenticity = 0.5
        spam_likelihood = 0.0

    return Qualification(
        evidence_id=evidence.id,
        status=status,
        intent_strength=intent_strength,
        authenticity=authenticity,
        spam_likelihood=spam_likelihood,
        reachability=1.0 if reachable else 0.0,
        reason=reason,
        qualification_version=qualification_version,
        evaluated_at=evaluated_at or datetime.now(timezone.utc),
    )
