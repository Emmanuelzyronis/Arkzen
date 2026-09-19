import sqlite3
import unittest
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from arkzen import Evidence, QualificationStatus, SQLiteRepository, WatchProfile, evaluate_evidence
from arkzen.api import create_app


class QualificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = SQLiteRepository(":memory:")
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        self.evidence = self.repository.create_evidence(
            Evidence(
                watch_profile_id=profile.id,
                raw_post_content="Can anyone recommend a web designer? I need a site.",
                author_handle="@prospect",
                post_timestamp=datetime(2026, 9, 7, 10, tzinfo=timezone.utc),
                capture_timestamp=datetime(2026, 9, 7, 10, 1, tzinfo=timezone.utc),
                match_reason="matched keyword: designer",
            )
        )

    def tearDown(self) -> None:
        self.repository.close()

    def test_explicit_intent_is_qualified(self) -> None:
        result = evaluate_evidence(
            self.evidence,
            evaluated_at=datetime(2026, 9, 7, 11, tzinfo=timezone.utc),
        )
        self.assertEqual(result.status, QualificationStatus.QUALIFIED)
        self.assertGreater(result.intent_strength, 0.5)
        self.assertEqual(result.reason.split(":", 1)[0], "explicit_intent")

    def test_obvious_spam_is_rejected(self) -> None:
        spam = Evidence(
            watch_profile_id=self.evidence.watch_profile_id,
            raw_post_content="Crypto giveaway: free money, buy followers now",
            author_handle="@spam",
            post_timestamp=self.evidence.post_timestamp,
            capture_timestamp=self.evidence.capture_timestamp,
            match_reason="matched keyword: designer",
        )
        result = evaluate_evidence(spam)
        self.assertEqual(result.status, QualificationStatus.REJECTED)
        self.assertEqual(result.spam_likelihood, 1.0)

    def test_insufficient_evidence_is_rejected(self) -> None:
        incomplete = Evidence(
            watch_profile_id=self.evidence.watch_profile_id,
            raw_post_content="",
            author_handle="",
            post_timestamp=self.evidence.post_timestamp,
            capture_timestamp=self.evidence.capture_timestamp,
            match_reason="matched keyword: designer",
        )
        result = evaluate_evidence(incomplete)
        self.assertEqual(result.status, QualificationStatus.REJECTED)
        self.assertEqual(result.reason, "insufficient_evidence")

    def test_ambiguous_evidence_needs_review(self) -> None:
        ambiguous = Evidence(
            watch_profile_id=self.evidence.watch_profile_id,
            raw_post_content="The designer was amazing yesterday.",
            author_handle="@prospect",
            post_timestamp=self.evidence.post_timestamp,
            capture_timestamp=self.evidence.capture_timestamp,
            match_reason="matched keyword: designer",
        )
        result = evaluate_evidence(ambiguous)
        self.assertEqual(result.status, QualificationStatus.NEEDS_REVIEW)

    def test_repeated_evaluations_preserve_versions_and_evidence(self) -> None:
        first = evaluate_evidence(self.evidence, qualification_version="deterministic-v1")
        second = evaluate_evidence(self.evidence, qualification_version="deterministic-v2")
        self.repository.create_qualification(first)
        self.repository.create_qualification(second)
        stored = list(self.repository.list_qualifications(evidence_id=self.evidence.id))
        self.assertEqual({item.qualification_version for item in stored}, {"deterministic-v1", "deterministic-v2"})
        self.assertEqual(self.repository.get_evidence(self.evidence.id), self.evidence)
        with self.assertRaises(sqlite3.IntegrityError):
            self.repository._connection.execute(
                "UPDATE qualifications SET reason = 'changed' WHERE id = ?", (first.id,)
            )

    def test_api_serializes_qualification(self) -> None:
        app = create_app(self.repository)
        client = TestClient(app)
        response = client.post(
            "/qualifications",
            json={"evidence_id": self.evidence.id, "qualification_version": "deterministic-v1"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "QUALIFIED")
        self.assertEqual(response.json()["evidence_id"], self.evidence.id)
        listed = client.get(f"/qualifications?evidence_id={self.evidence.id}")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)


if __name__ == "__main__":
    unittest.main()
