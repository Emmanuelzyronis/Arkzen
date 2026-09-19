import sqlite3
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from tempfile import NamedTemporaryFile

from arkzen import AcquisitionRun, Evidence, SQLiteRepository, WatchProfile


class ModelPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = SQLiteRepository(":memory:")

    def tearDown(self) -> None:
        self.repository.close()

    def make_profile(self) -> WatchProfile:
        return WatchProfile(
            owner="founder",
            source_description="People looking for a web designer",
            keywords=("web designer", "website help"),
            phrase_patterns=("need a website", "recommend a designer"),
            location_filter="London",
            language_filter="en",
            active=True,
        )

    def make_evidence(self, profile_id: str) -> Evidence:
        post_time = datetime(2026, 9, 6, 10, 30, tzinfo=timezone.utc)
        return Evidence(
            watch_profile_id=profile_id,
            raw_post_content="Can anyone recommend a web designer?",
            author_handle="@prospect",
            post_timestamp=post_time,
            capture_timestamp=datetime(2026, 9, 6, 10, 31, tzinfo=timezone.utc),
            match_reason="matched phrase pattern: recommend a designer",
        )

    def test_watch_profile_creation_and_read(self) -> None:
        profile = self.repository.create_watch_profile(self.make_profile())

        self.assertEqual(self.repository.get_watch_profile(profile.id), profile)

    def test_evidence_creation_and_foreign_key_relationship(self) -> None:
        profile = self.repository.create_watch_profile(self.make_profile())
        evidence = self.repository.create_evidence(self.make_evidence(profile.id))

        self.assertEqual(self.repository.get_evidence(evidence.id), evidence)
        self.assertEqual(list(self.repository.list_evidence(profile.id)), [evidence])

    def test_evidence_audit_metadata_round_trip(self) -> None:
        profile = self.repository.create_watch_profile(self.make_profile())
        evidence = replace(
            self.make_evidence(profile.id),
            matched_patterns=("recommend a designer",),
            provenance={"provider_id": "test", "query": "designer"},
            schema_version="evidence-v2",
        )
        self.repository.create_evidence(evidence)
        self.assertEqual(self.repository.get_evidence(evidence.id), evidence)

    def test_evidence_requires_an_existing_watch_profile(self) -> None:
        with self.assertRaises(sqlite3.IntegrityError):
            self.repository.create_evidence(self.make_evidence("missing-profile"))

    def test_evidence_is_append_only(self) -> None:
        profile = self.repository.create_watch_profile(self.make_profile())
        evidence = self.repository.create_evidence(self.make_evidence(profile.id))

        self.assertFalse(hasattr(self.repository, "update_evidence"))
        self.assertFalse(hasattr(self.repository, "delete_evidence"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.repository._connection.execute(
                "UPDATE evidence SET match_reason = ? WHERE id = ?",
                ("changed", evidence.id),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.repository._connection.execute(
                "DELETE FROM evidence WHERE id = ?", (evidence.id,)
            )
        self.assertEqual(self.repository.get_evidence(evidence.id), evidence)

    def test_evidence_identity_is_unique_per_profile(self) -> None:
        profile = self.repository.create_watch_profile(self.make_profile())
        first = self.repository.create_evidence(
            replace(self.make_evidence(profile.id), identity_fingerprint="same-fingerprint")
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.repository.create_evidence(
                replace(self.make_evidence(profile.id), identity_fingerprint="same-fingerprint")
            )
        self.assertEqual(self.repository.get_evidence(first.id), first)

    def test_existing_evidence_schema_is_migrated_additively(self) -> None:
        with NamedTemporaryFile(suffix=".sqlite3") as database:
            connection = sqlite3.connect(database.name)
            connection.executescript(
                """
                CREATE TABLE watch_profiles (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, source_description TEXT NOT NULL,
                    keywords_json TEXT NOT NULL, phrase_patterns_json TEXT NOT NULL,
                    location_filter TEXT, language_filter TEXT, active INTEGER NOT NULL
                );
                CREATE TABLE evidence (
                    id TEXT PRIMARY KEY, watch_profile_id TEXT NOT NULL,
                    raw_post_content TEXT NOT NULL, author_handle TEXT NOT NULL,
                    post_timestamp TEXT NOT NULL, capture_timestamp TEXT NOT NULL,
                    match_reason TEXT NOT NULL,
                    FOREIGN KEY (watch_profile_id) REFERENCES watch_profiles (id)
                );
                """
            )
            profile = self.make_profile()
            evidence = self.make_evidence(profile.id)
            connection.execute(
                "INSERT INTO watch_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (profile.id, profile.owner, profile.source_description, "[]", "[]", None, None, 1),
            )
            connection.execute(
                "INSERT INTO evidence VALUES (?, ?, ?, ?, ?, ?, ?)",
                (evidence.id, evidence.watch_profile_id, evidence.raw_post_content, evidence.author_handle,
                 evidence.post_timestamp.isoformat(), evidence.capture_timestamp.isoformat(), evidence.match_reason),
            )
            connection.commit()
            connection.close()

            migrated = SQLiteRepository(database.name)
            try:
                self.assertEqual(migrated.get_evidence(evidence.id).raw_post_content, evidence.raw_post_content)
                columns = {row[1] for row in migrated._connection.execute("PRAGMA table_info(evidence)")}
                self.assertIn("identity_fingerprint", columns)
            finally:
                migrated.close()

    def test_acquisition_run_survives_repository_reopen(self) -> None:
        self.repository.close()
        with NamedTemporaryFile(suffix=".sqlite3") as database:
            first = SQLiteRepository(database.name)
            run = AcquisitionRun(
                run_id="run-1",
                started_at=datetime(2026, 9, 7, 10, tzinfo=timezone.utc),
                completed_at=datetime(2026, 9, 7, 10, 1, tzinfo=timezone.utc),
                status="SUCCESS",
                profiles_attempted=1,
                profiles_succeeded=1,
                profiles_failed=0,
                candidates_observed=2,
                candidates_accepted=1,
                candidates_rejected=1,
                duplicates=0,
                stale_candidates=0,
                missing_timestamps=0,
                malformed_candidates=0,
                failures=(),
            )
            first.save_acquisition_run(run)
            first.close()
            second = SQLiteRepository(database.name)
            try:
                self.assertEqual(second.get_acquisition_run("run-1"), run)
            finally:
                second.close()


if __name__ == "__main__":
    unittest.main()
