import sqlite3
import unittest
from unittest.mock import patch
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from arkzen import Evidence, EvidenceReview, EvidenceReviewStatus, SQLiteRepository, WatchProfile
from arkzen.api import create_app


class EvidenceReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = SQLiteRepository(":memory:")
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="design", keywords=("designer",))
        )
        self.evidence = self.repository.create_evidence(
            Evidence(
                watch_profile_id=profile.id,
                raw_post_content="Can anyone recommend a web designer?",
                author_handle="@prospect",
                post_timestamp=datetime(2026, 9, 7, 10, tzinfo=timezone.utc),
                capture_timestamp=datetime(2026, 9, 7, 10, 1, tzinfo=timezone.utc),
                match_reason="matched keyword: designer",
            )
        )

    def tearDown(self) -> None:
        self.repository.close()

    def test_reviews_are_append_only_and_latest_is_selected(self) -> None:
        first = EvidenceReview(
            evidence_id=self.evidence.id,
            decision=EvidenceReviewStatus.NEEDS_MORE_INFO,
            reviewer="operator",
            reviewed_at=datetime(2026, 9, 7, 11, tzinfo=timezone.utc),
        )
        second = EvidenceReview(
            evidence_id=self.evidence.id,
            decision=EvidenceReviewStatus.USEFUL,
            reviewer="operator",
            reviewed_at=datetime(2026, 9, 7, 12, tzinfo=timezone.utc),
            reason="Fresh actionable request",
        )
        self.repository.create_evidence_review(first)
        self.repository.create_evidence_review(second)

        self.assertEqual(len(list(self.repository.list_evidence_reviews(evidence_id=self.evidence.id))), 2)
        self.assertEqual(self.repository.list_latest_evidence_reviews()[0].decision, EvidenceReviewStatus.USEFUL)
        self.assertEqual(self.repository.evidence_review_summary()["USEFUL"], 1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.repository._connection.execute(
                "UPDATE evidence_reviews SET decision = 'NOT_USEFUL' WHERE id = ?", (second.id,)
            )

    def test_api_creates_lists_and_summarizes_reviews(self) -> None:
        client = TestClient(create_app(self.repository))
        created = client.post(
            "/evidence/reviews",
            json={"evidence_id": self.evidence.id, "decision": "USEFUL", "reviewer": "operator"},
        )
        listed = client.get(f"/evidence/reviews?evidence_id={self.evidence.id}")
        summary = client.get("/evidence/reviews/summary")
        evidence = client.get("/evidence")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["decision"], "USEFUL")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(summary.json(), {"USEFUL": 1, "NOT_USEFUL": 0, "NEEDS_MORE_INFO": 0, "total": 1})
        self.assertEqual(evidence.json()[0]["latest_review"]["decision"], "USEFUL")
        self.assertEqual(client.post("/evidence/reviews", json={"evidence_id": "missing", "decision": "USEFUL", "reviewer": "operator"}).status_code, 404)

    def test_live_connectivity_endpoint_reports_provider_contract(self) -> None:
        class VerifiableSource:
            provider_id = "fake"

            async def configure(self) -> None:
                return None

            def health(self):
                from arkzen import ProviderHealth

                return ProviderHealth("fake", True, "verified")

            def capabilities(self):
                from arkzen import ProviderCapabilities

                return ProviderCapabilities(True, True, False)

        accounts = '[{"username": "operator-account", "cookies": {"auth_token": "a", "ct0": "b"}}]'
        with patch.dict("os.environ", {"ARKZEN_TWSCRAPE_ACCOUNTS_JSON": accounts}):
            client = TestClient(create_app(self.repository, source_factory=lambda accounts: VerifiableSource()))
            response = client.post("/monitoring/verify")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "provider_id": "fake",
            "available": True,
            "detail": "verified",
            "supports_provider_signal_id": True,
            "supports_canonical_url": True,
            "supports_cursor": False,
        })


if __name__ == "__main__":
    unittest.main()
