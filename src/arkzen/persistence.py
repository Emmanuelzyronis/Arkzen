"""SQLite persistence for WatchProfile and append-only Evidence records."""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterator

from .models import (
    AcquisitionCacheEntry,
    AcquisitionCheckpoint,
    AcquisitionRun,
    Evidence,
    EvidenceReview,
    EvidenceReviewStatus,
    Qualification,
    QualificationStatus,
    WatchProfile,
)


class SQLiteRepository:
    """Small repository containing only the Phase 1 persistence operations."""

    def __init__(self, database: str | Path = "arkzen.sqlite3") -> None:
        # FastAPI may execute sync handlers in worker threads while the same
        # repository instance serves the app. SQLite must allow that access.
        self._connection = sqlite3.connect(str(database), check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA foreign_keys = ON")
        self._create_schema()

    def close(self) -> None:
        self._connection.close()

    def _create_schema(self) -> None:
        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS watch_profiles (
                id TEXT PRIMARY KEY,
                owner TEXT NOT NULL,
                source_description TEXT NOT NULL,
                keywords_json TEXT NOT NULL,
                phrase_patterns_json TEXT NOT NULL,
                location_filter TEXT,
                language_filter TEXT,
                active INTEGER NOT NULL CHECK (active IN (0, 1))
            );

            CREATE TABLE IF NOT EXISTS evidence (
                id TEXT PRIMARY KEY,
                watch_profile_id TEXT NOT NULL,
                raw_post_content TEXT NOT NULL,
                author_handle TEXT NOT NULL,
                post_timestamp TEXT NOT NULL,
                capture_timestamp TEXT NOT NULL,
                match_reason TEXT NOT NULL,
                source_type TEXT NOT NULL DEFAULT 'unknown',
                provider_id TEXT,
                provider_signal_id TEXT,
                canonical_url TEXT,
                content_hash TEXT,
                identity_fingerprint TEXT,
                matched_patterns_json TEXT NOT NULL DEFAULT '[]',
                provenance_json TEXT NOT NULL DEFAULT '{}',
                schema_version TEXT NOT NULL DEFAULT 'evidence-v1',
                FOREIGN KEY (watch_profile_id) REFERENCES watch_profiles (id)
            );

            CREATE TABLE IF NOT EXISTS acquisition_runs (
                run_id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                completed_at TEXT NOT NULL,
                status TEXT NOT NULL,
                profiles_attempted INTEGER NOT NULL,
                profiles_succeeded INTEGER NOT NULL,
                profiles_failed INTEGER NOT NULL,
                candidates_observed INTEGER NOT NULL,
                candidates_accepted INTEGER NOT NULL,
                candidates_rejected INTEGER NOT NULL,
                duplicates INTEGER NOT NULL,
                stale_candidates INTEGER NOT NULL,
                missing_timestamps INTEGER NOT NULL,
                malformed_candidates INTEGER NOT NULL,
                failures_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS acquisition_checkpoints (
                profile_id TEXT NOT NULL,
                provider_id TEXT NOT NULL,
                cursor TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (profile_id, provider_id),
                FOREIGN KEY (profile_id) REFERENCES watch_profiles (id)
            );

            CREATE TABLE IF NOT EXISTS acquisition_cache (
                cache_key TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                payload_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS qualifications (
                id TEXT PRIMARY KEY,
                evidence_id TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('QUALIFIED', 'REJECTED', 'NEEDS_REVIEW')),
                intent_strength REAL NOT NULL,
                authenticity REAL NOT NULL,
                spam_likelihood REAL NOT NULL,
                reachability REAL NOT NULL,
                reason TEXT NOT NULL,
                qualification_version TEXT NOT NULL,
                evaluated_at TEXT NOT NULL,
                model_id TEXT,
                model_version TEXT,
                prompt_version TEXT,
                scoring_schema_version TEXT NOT NULL DEFAULT 'scoring-v1',
                evaluation_version TEXT NOT NULL DEFAULT 'evaluation-v1',
                FOREIGN KEY (evidence_id) REFERENCES evidence (id)
            );

            CREATE TABLE IF NOT EXISTS evidence_reviews (
                id TEXT PRIMARY KEY,
                evidence_id TEXT NOT NULL,
                decision TEXT NOT NULL CHECK (decision IN ('USEFUL', 'NOT_USEFUL', 'NEEDS_MORE_INFO')),
                reviewer TEXT NOT NULL,
                reason TEXT,
                reviewed_at TEXT NOT NULL,
                schema_version TEXT NOT NULL DEFAULT 'evidence-review-v1',
                FOREIGN KEY (evidence_id) REFERENCES evidence (id)
            );

            CREATE TRIGGER IF NOT EXISTS evidence_reviews_immutable_update
            BEFORE UPDATE ON evidence_reviews
            BEGIN
                SELECT RAISE(ABORT, 'Evidence reviews are append-only');
            END;

            CREATE TRIGGER IF NOT EXISTS evidence_reviews_immutable_delete
            BEFORE DELETE ON evidence_reviews
            BEGIN
                SELECT RAISE(ABORT, 'Evidence reviews are append-only');
            END;

            CREATE TRIGGER IF NOT EXISTS qualifications_immutable_update
            BEFORE UPDATE ON qualifications
            BEGIN
                SELECT RAISE(ABORT, 'Qualification records are append-only');
            END;

            CREATE TRIGGER IF NOT EXISTS qualifications_immutable_delete
            BEFORE DELETE ON qualifications
            BEGIN
                SELECT RAISE(ABORT, 'Qualification records are append-only');
            END;

            CREATE TRIGGER IF NOT EXISTS evidence_immutable_update
            BEFORE UPDATE ON evidence
            BEGIN
                SELECT RAISE(ABORT, 'Evidence records are append-only');
            END;

            CREATE TRIGGER IF NOT EXISTS evidence_immutable_delete
            BEFORE DELETE ON evidence
            BEGIN
                SELECT RAISE(ABORT, 'Evidence records are append-only');
            END;
            """
        )
        columns = {row[1] for row in self._connection.execute("PRAGMA table_info(evidence)")}
        additions = {
            "source_type": "TEXT NOT NULL DEFAULT 'unknown'",
            "provider_id": "TEXT",
            "provider_signal_id": "TEXT",
            "canonical_url": "TEXT",
            "content_hash": "TEXT",
            "identity_fingerprint": "TEXT",
            "matched_patterns_json": "TEXT NOT NULL DEFAULT '[]'",
            "provenance_json": "TEXT NOT NULL DEFAULT '{}'",
            "schema_version": "TEXT NOT NULL DEFAULT 'evidence-v1'",
        }
        for name, definition in additions.items():
            if name not in columns:
                self._connection.execute(f"ALTER TABLE evidence ADD COLUMN {name} {definition}")
        q_columns = {row[1] for row in self._connection.execute("PRAGMA table_info(qualifications)")}
        q_additions = {
            "model_id": "TEXT", "model_version": "TEXT", "prompt_version": "TEXT",
            "scoring_schema_version": "TEXT NOT NULL DEFAULT 'scoring-v1'",
            "evaluation_version": "TEXT NOT NULL DEFAULT 'evaluation-v1'",
        }
        for name, definition in q_additions.items():
            if name not in q_columns:
                self._connection.execute(f"ALTER TABLE qualifications ADD COLUMN {name} {definition}")
        self._connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS evidence_profile_identity_unique "
            "ON evidence (watch_profile_id, identity_fingerprint) "
            "WHERE identity_fingerprint IS NOT NULL"
        )
        self._connection.execute(
            "CREATE INDEX IF NOT EXISTS acquisition_runs_started_idx ON acquisition_runs (started_at)"
        )
        self._connection.execute(
            "CREATE INDEX IF NOT EXISTS acquisition_cache_fetched_idx ON acquisition_cache (fetched_at)"
        )
        self._connection.execute(
            "CREATE INDEX IF NOT EXISTS qualifications_evidence_idx ON qualifications (evidence_id, evaluated_at DESC)"
        )
        self._connection.execute(
            "CREATE INDEX IF NOT EXISTS evidence_reviews_evidence_idx "
            "ON evidence_reviews (evidence_id, reviewed_at DESC, id DESC)"
        )
        self._connection.commit()

    def create_watch_profile(self, profile: WatchProfile) -> WatchProfile:
        self._connection.execute(
            """
            INSERT INTO watch_profiles (
                id, owner, source_description, keywords_json,
                phrase_patterns_json, location_filter, language_filter, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                profile.id,
                profile.owner,
                profile.source_description,
                json.dumps(list(profile.keywords)),
                json.dumps(list(profile.phrase_patterns)),
                profile.location_filter,
                profile.language_filter,
                int(profile.active),
            ),
        )
        self._connection.commit()
        return profile

    def get_watch_profile(self, profile_id: str) -> WatchProfile | None:
        row = self._connection.execute(
            "SELECT * FROM watch_profiles WHERE id = ?", (profile_id,)
        ).fetchone()
        return self._watch_profile_from_row(row) if row else None

    def list_watch_profiles(self, *, active_only: bool = False) -> Iterator[WatchProfile]:
        query = "SELECT * FROM watch_profiles"
        if active_only:
            query += " WHERE active = 1"
        query += " ORDER BY id"
        rows = self._connection.execute(query)
        yield from (self._watch_profile_from_row(row) for row in rows)

    def create_evidence(self, evidence: Evidence) -> Evidence:
        self._connection.execute(
            """
            INSERT INTO evidence (
                id, watch_profile_id, raw_post_content, author_handle,
                post_timestamp, capture_timestamp, match_reason, source_type,
                provider_id, provider_signal_id, canonical_url, content_hash,
                identity_fingerprint, matched_patterns_json, provenance_json, schema_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                evidence.id,
                evidence.watch_profile_id,
                evidence.raw_post_content,
                evidence.author_handle,
                evidence.post_timestamp.isoformat(),
                evidence.capture_timestamp.isoformat(),
                evidence.match_reason,
                evidence.source_type,
                evidence.provider_id,
                evidence.provider_signal_id,
                evidence.canonical_url,
                evidence.content_hash,
                evidence.identity_fingerprint,
                json.dumps(list(evidence.matched_patterns)),
                json.dumps(evidence.provenance),
                evidence.schema_version,
            ),
        )
        self._connection.commit()
        return evidence

    def get_evidence(self, evidence_id: str) -> Evidence | None:
        row = self._connection.execute(
            "SELECT * FROM evidence WHERE id = ?", (evidence_id,)
        ).fetchone()
        return self._evidence_from_row(row) if row else None

    def evidence_exists(
        self,
        *,
        watch_profile_id: str,
        raw_post_content: str,
        author_handle: str,
        post_timestamp: datetime,
    ) -> bool:
        row = self._connection.execute(
            """
            SELECT 1 FROM evidence
            WHERE watch_profile_id = ?
              AND raw_post_content = ?
              AND author_handle = ?
              AND post_timestamp = ?
            LIMIT 1
            """,
            (
                watch_profile_id,
                raw_post_content,
                author_handle,
                post_timestamp.isoformat(),
            ),
        ).fetchone()
        return row is not None

    def evidence_identity_exists(self, *, watch_profile_id: str, identity_fingerprint: str) -> bool:
        row = self._connection.execute(
            "SELECT 1 FROM evidence WHERE watch_profile_id = ? AND identity_fingerprint = ? LIMIT 1",
            (watch_profile_id, identity_fingerprint),
        ).fetchone()
        return row is not None

    def list_evidence(self, watch_profile_id: str | None = None) -> Iterator[Evidence]:
        if watch_profile_id is None:
            rows = self._connection.execute(
                "SELECT * FROM evidence ORDER BY capture_timestamp, id"
            )
        else:
            rows = self._connection.execute(
                """
                SELECT * FROM evidence
                WHERE watch_profile_id = ?
                ORDER BY capture_timestamp, id
                """,
                (watch_profile_id,),
            )
        yield from (self._evidence_from_row(row) for row in rows)

    def save_acquisition_run(self, run: AcquisitionRun) -> AcquisitionRun:
        self._connection.execute(
            """
            INSERT INTO acquisition_runs (
                run_id, started_at, completed_at, status, profiles_attempted,
                profiles_succeeded, profiles_failed, candidates_observed,
                candidates_accepted, candidates_rejected, duplicates,
                stale_candidates, missing_timestamps, malformed_candidates,
                failures_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                completed_at = excluded.completed_at,
                status = excluded.status,
                profiles_attempted = excluded.profiles_attempted,
                profiles_succeeded = excluded.profiles_succeeded,
                profiles_failed = excluded.profiles_failed,
                candidates_observed = excluded.candidates_observed,
                candidates_accepted = excluded.candidates_accepted,
                candidates_rejected = excluded.candidates_rejected,
                duplicates = excluded.duplicates,
                stale_candidates = excluded.stale_candidates,
                missing_timestamps = excluded.missing_timestamps,
                malformed_candidates = excluded.malformed_candidates,
                failures_json = excluded.failures_json
            """,
            (
                run.run_id,
                run.started_at.isoformat(),
                run.completed_at.isoformat(),
                run.status,
                run.profiles_attempted,
                run.profiles_succeeded,
                run.profiles_failed,
                run.candidates_observed,
                run.candidates_accepted,
                run.candidates_rejected,
                run.duplicates,
                run.stale_candidates,
                run.missing_timestamps,
                run.malformed_candidates,
                json.dumps(list(run.failures)),
            ),
        )
        self._connection.commit()
        return run

    def get_acquisition_run(self, run_id: str) -> AcquisitionRun | None:
        row = self._connection.execute(
            "SELECT * FROM acquisition_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
        return self._acquisition_run_from_row(row) if row else None

    def list_acquisition_runs(self, *, limit: int = 100) -> Iterator[AcquisitionRun]:
        rows = self._connection.execute(
            "SELECT * FROM acquisition_runs ORDER BY started_at DESC, run_id DESC LIMIT ?",
            (limit,),
        )
        yield from (self._acquisition_run_from_row(row) for row in rows)

    def save_checkpoint(self, checkpoint: AcquisitionCheckpoint) -> AcquisitionCheckpoint:
        self._connection.execute(
            """
            INSERT INTO acquisition_checkpoints (profile_id, provider_id, cursor, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(profile_id, provider_id) DO UPDATE SET
                cursor = excluded.cursor,
                updated_at = excluded.updated_at
            """,
            (
                checkpoint.profile_id,
                checkpoint.provider_id,
                checkpoint.cursor,
                checkpoint.updated_at.isoformat(),
            ),
        )
        self._connection.commit()
        return checkpoint

    def get_checkpoint(self, *, profile_id: str, provider_id: str) -> AcquisitionCheckpoint | None:
        row = self._connection.execute(
            "SELECT * FROM acquisition_checkpoints WHERE profile_id = ? AND provider_id = ?",
            (profile_id, provider_id),
        ).fetchone()
        if row is None:
            return None
        return AcquisitionCheckpoint(
            profile_id=row["profile_id"],
            provider_id=row["provider_id"],
            cursor=row["cursor"],
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def save_cache_entry(self, entry: AcquisitionCacheEntry) -> AcquisitionCacheEntry:
        self._connection.execute(
            """
            INSERT INTO acquisition_cache (cache_key, provider_id, fetched_at, payload_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                provider_id = excluded.provider_id,
                fetched_at = excluded.fetched_at,
                payload_json = excluded.payload_json
            """,
            (entry.cache_key, entry.provider_id, entry.fetched_at.isoformat(), entry.payload_json),
        )
        self._connection.commit()
        return entry

    def get_cache_entry(self, cache_key: str) -> AcquisitionCacheEntry | None:
        row = self._connection.execute(
            "SELECT * FROM acquisition_cache WHERE cache_key = ?", (cache_key,)
        ).fetchone()
        if row is None:
            return None
        return AcquisitionCacheEntry(
            cache_key=row["cache_key"],
            provider_id=row["provider_id"],
            fetched_at=datetime.fromisoformat(row["fetched_at"]),
            payload_json=row["payload_json"],
        )

    def create_qualification(self, qualification: Qualification) -> Qualification:
        self._connection.execute(
            """
            INSERT INTO qualifications (
                id, evidence_id, status, intent_strength, authenticity,
                spam_likelihood, reachability, reason, qualification_version,
                evaluated_at, model_id, model_version, prompt_version,
                scoring_schema_version, evaluation_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                qualification.id,
                qualification.evidence_id,
                qualification.status.value,
                qualification.intent_strength,
                qualification.authenticity,
                qualification.spam_likelihood,
                qualification.reachability,
                qualification.reason,
                qualification.qualification_version,
                qualification.evaluated_at.isoformat(),
                qualification.model_id,
                qualification.model_version,
                qualification.prompt_version,
                qualification.scoring_schema_version,
                qualification.evaluation_version,
            ),
        )
        self._connection.commit()
        return qualification

    def get_qualification(self, qualification_id: str) -> Qualification | None:
        row = self._connection.execute(
            "SELECT * FROM qualifications WHERE id = ?", (qualification_id,)
        ).fetchone()
        return self._qualification_from_row(row) if row else None

    def list_qualifications(self, *, evidence_id: str | None = None) -> Iterator[Qualification]:
        if evidence_id is None:
            rows = self._connection.execute(
                "SELECT * FROM qualifications ORDER BY evaluated_at DESC, id DESC"
            )
        else:
            rows = self._connection.execute(
                "SELECT * FROM qualifications WHERE evidence_id = ? ORDER BY evaluated_at DESC, id DESC",
                (evidence_id,),
            )
        yield from (self._qualification_from_row(row) for row in rows)

    def create_evidence_review(self, review: EvidenceReview) -> EvidenceReview:
        self._connection.execute(
            """
            INSERT INTO evidence_reviews (
                id, evidence_id, decision, reviewer, reason, reviewed_at, schema_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                review.id,
                review.evidence_id,
                review.decision.value,
                review.reviewer,
                review.reason,
                review.reviewed_at.isoformat(),
                review.schema_version,
            ),
        )
        self._connection.commit()
        return review

    def list_evidence_reviews(self, *, evidence_id: str | None = None) -> Iterator[EvidenceReview]:
        if evidence_id is None:
            rows = self._connection.execute(
                "SELECT * FROM evidence_reviews ORDER BY reviewed_at DESC, id DESC"
            )
        else:
            rows = self._connection.execute(
                "SELECT * FROM evidence_reviews WHERE evidence_id = ? ORDER BY reviewed_at DESC, id DESC",
                (evidence_id,),
            )
        yield from (self._evidence_review_from_row(row) for row in rows)

    def list_latest_evidence_reviews(self) -> list[EvidenceReview]:
        rows = self._connection.execute(
            """
            SELECT * FROM (
                SELECT er.*, ROW_NUMBER() OVER (
                    PARTITION BY evidence_id ORDER BY reviewed_at DESC, id DESC
                ) AS review_rank
                FROM evidence_reviews er
            )
            WHERE review_rank = 1
            ORDER BY evidence_id
            """
        ).fetchall()
        return [self._evidence_review_from_row(row) for row in rows]

    def evidence_review_summary(self) -> dict[str, int]:
        rows = self._connection.execute(
            "SELECT decision, COUNT(*) AS count FROM evidence_reviews GROUP BY decision"
        ).fetchall()
        summary = {status.value: 0 for status in EvidenceReviewStatus}
        summary.update({row["decision"]: row["count"] for row in rows})
        return summary

    @staticmethod
    def _acquisition_run_from_row(row: sqlite3.Row) -> AcquisitionRun:
        return AcquisitionRun(
            run_id=row["run_id"],
            started_at=datetime.fromisoformat(row["started_at"]),
            completed_at=datetime.fromisoformat(row["completed_at"]),
            status=row["status"],
            profiles_attempted=row["profiles_attempted"],
            profiles_succeeded=row["profiles_succeeded"],
            profiles_failed=row["profiles_failed"],
            candidates_observed=row["candidates_observed"],
            candidates_accepted=row["candidates_accepted"],
            candidates_rejected=row["candidates_rejected"],
            duplicates=row["duplicates"],
            stale_candidates=row["stale_candidates"],
            missing_timestamps=row["missing_timestamps"],
            malformed_candidates=row["malformed_candidates"],
            failures=tuple(json.loads(row["failures_json"])),
        )

    @staticmethod
    def _qualification_from_row(row: sqlite3.Row) -> Qualification:
        return Qualification(
            id=row["id"],
            evidence_id=row["evidence_id"],
            status=QualificationStatus(row["status"]),
            intent_strength=row["intent_strength"],
            authenticity=row["authenticity"],
            spam_likelihood=row["spam_likelihood"],
            reachability=row["reachability"],
            reason=row["reason"],
            qualification_version=row["qualification_version"],
            evaluated_at=datetime.fromisoformat(row["evaluated_at"]),
            model_id=row["model_id"] if "model_id" in row.keys() else None,
            model_version=row["model_version"] if "model_version" in row.keys() else None,
            prompt_version=row["prompt_version"] if "prompt_version" in row.keys() else None,
            scoring_schema_version=row["scoring_schema_version"] if "scoring_schema_version" in row.keys() else "scoring-v1",
            evaluation_version=row["evaluation_version"] if "evaluation_version" in row.keys() else "evaluation-v1",
        )

    @staticmethod
    def _evidence_review_from_row(row: sqlite3.Row) -> EvidenceReview:
        return EvidenceReview(
            id=row["id"],
            evidence_id=row["evidence_id"],
            decision=EvidenceReviewStatus(row["decision"]),
            reviewer=row["reviewer"],
            reason=row["reason"],
            reviewed_at=datetime.fromisoformat(row["reviewed_at"]),
            schema_version=row["schema_version"],
        )

    @staticmethod
    def _watch_profile_from_row(row: sqlite3.Row) -> WatchProfile:
        return WatchProfile(
            id=row["id"],
            owner=row["owner"],
            source_description=row["source_description"],
            keywords=tuple(json.loads(row["keywords_json"])),
            phrase_patterns=tuple(json.loads(row["phrase_patterns_json"])),
            location_filter=row["location_filter"],
            language_filter=row["language_filter"],
            active=bool(row["active"]),
        )

    @staticmethod
    def _evidence_from_row(row: sqlite3.Row) -> Evidence:
        return Evidence(
            id=row["id"],
            watch_profile_id=row["watch_profile_id"],
            raw_post_content=row["raw_post_content"],
            author_handle=row["author_handle"],
            post_timestamp=datetime.fromisoformat(row["post_timestamp"]),
            capture_timestamp=datetime.fromisoformat(row["capture_timestamp"]),
            match_reason=row["match_reason"],
            source_type=row["source_type"] if "source_type" in row.keys() else "unknown",
            provider_id=row["provider_id"] if "provider_id" in row.keys() else None,
            provider_signal_id=row["provider_signal_id"] if "provider_signal_id" in row.keys() else None,
            canonical_url=row["canonical_url"] if "canonical_url" in row.keys() else None,
            content_hash=row["content_hash"] if "content_hash" in row.keys() else None,
            identity_fingerprint=row["identity_fingerprint"] if "identity_fingerprint" in row.keys() else None,
            matched_patterns=tuple(json.loads(row["matched_patterns_json"] or "[]")) if "matched_patterns_json" in row.keys() else (),
            provenance=json.loads(row["provenance_json"] or "{}") if "provenance_json" in row.keys() else {},
            schema_version=row["schema_version"] if "schema_version" in row.keys() else "evidence-v1",
        )
