"""Simple structured input for creating WatchProfiles."""

from collections.abc import Iterable

from .models import WatchProfile
from .persistence import SQLiteRepository


def parse_terms(value: str | Iterable[str] | None) -> tuple[str, ...]:
    """Normalize comma- or newline-separated form values into unique terms."""
    if value is None:
        return ()
    values = value.splitlines() if isinstance(value, str) else value
    terms: list[str] = []
    for item in values:
        for term in item.split(","):
            cleaned = term.strip()
            if cleaned and cleaned.casefold() not in {x.casefold() for x in terms}:
                terms.append(cleaned)
    return tuple(terms)


def create_watch_profile_from_input(
    repository: SQLiteRepository,
    *,
    owner: str,
    source_description: str,
    keywords: str | Iterable[str] | None = None,
    phrase_patterns: str | Iterable[str] | None = None,
    location_filter: str | None = None,
    language_filter: str | None = None,
    active: bool = True,
) -> WatchProfile:
    """Create and persist a profile from direct structured operator input."""
    profile = WatchProfile(
        owner=owner.strip(),
        source_description=source_description.strip(),
        keywords=parse_terms(keywords),
        phrase_patterns=parse_terms(phrase_patterns),
        location_filter=location_filter.strip() if location_filter else None,
        language_filter=language_filter.strip() if language_filter else None,
        active=active,
    )
    if not profile.owner:
        raise ValueError("owner is required")
    if not profile.source_description:
        raise ValueError("source_description is required")
    if not profile.keywords and not profile.phrase_patterns:
        raise ValueError("at least one keyword or phrase pattern is required")
    return repository.create_watch_profile(profile)
