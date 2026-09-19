import json
import os
import unittest
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from arkzen import Evidence, RawPost, SQLiteRepository, WatchProfile, build_search_query
from arkzen.api import create_app


class FakeSource:
    def __init__(self, posts: list[RawPost]):
        self.posts = posts
        self.queries: list[str] = []

    async def search(self, query: str, *, limit: int) -> AsyncIterator[RawPost]:
        self.queries.append(query)
        for post in self.posts[:limit]:
            yield post


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = SQLiteRepository(":memory:")
        self.source = FakeSource(
            [
                RawPost(
                    content="Need a designer",
                    author_handle="@prospect",
                    post_timestamp=datetime(2026, 9, 6, 10, 30, tzinfo=timezone.utc),
                )
            ]
        )
        self.app = create_app(self.repository, source_factory=lambda accounts: self.source)
        self.client = TestClient(self.app)
        self.previous_accounts = os.environ.get("ARKZEN_TWSCRAPE_ACCOUNTS_JSON")

    def tearDown(self) -> None:
        if self.previous_accounts is None:
            os.environ.pop("ARKZEN_TWSCRAPE_ACCOUNTS_JSON", None)
        else:
            os.environ["ARKZEN_TWSCRAPE_ACCOUNTS_JSON"] = self.previous_accounts
        self.repository.close()

    def test_profile_and_evidence_endpoints(self) -> None:
        created = self.client.post(
            "/watch-profiles",
            json={
                "owner": "founder",
                "source_description": "Designer requests",
                "keywords": "designer",
                "phrase_patterns": "need a site",
            },
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(self.client.get("/watch-profiles").json()[0]["source_description"], "Designer requests")

        self.repository.create_evidence(
            Evidence(
                watch_profile_id=created.json()["id"],
                raw_post_content="Need a designer",
                author_handle="@prospect",
                post_timestamp=datetime(2026, 9, 6, 10, 30, tzinfo=timezone.utc),
                capture_timestamp=datetime(2026, 9, 6, 10, 31, tzinfo=timezone.utc),
                match_reason="matched keyword: designer",
            )
        )
        evidence = self.client.get("/evidence").json()
        self.assertEqual(evidence[0]["author_handle"], "@prospect")
        self.assertEqual(evidence[0]["watch_profile"]["id"], created.json()["id"])

    def test_monitoring_endpoint_calls_existing_monitor_path(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="Designer requests", keywords=("designer",))
        )
        os.environ["ARKZEN_TWSCRAPE_ACCOUNTS_JSON"] = json.dumps(
            [{"username": "operator-account", "cookies": {"auth_token": "a", "ct0": "b"}}]
        )

        response = self.client.post("/monitoring/run")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["captured_count"], 1)
        self.assertEqual(response.json()["status"], "SUCCESS")
        self.assertEqual(response.json()["profiles_succeeded"], 1)
        self.assertEqual(response.json()["candidates_observed"], 1)
        self.assertEqual(response.json()["candidates_rejected"], 0)
        self.assertIn("run_id", response.json())
        self.assertEqual(self.source.queries, [build_search_query(profile)])

    def test_monitoring_endpoint_explains_missing_account_configuration(self) -> None:
        os.environ.pop("ARKZEN_TWSCRAPE_ACCOUNTS_JSON", None)
        os.environ.pop("ARKZEN_TWSCRAPE_ACCOUNTS_FILE", None)

        response = self.client.post("/monitoring/run")

        self.assertEqual(response.status_code, 503)
        self.assertIn("ARKZEN_TWSCRAPE_ACCOUNTS_FILE", response.json()["detail"])

    def test_monitoring_endpoint_serializes_successful_empty_run(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="Designer requests", keywords=("designer",))
        )
        self.source.posts = []
        os.environ["ARKZEN_TWSCRAPE_ACCOUNTS_JSON"] = json.dumps(
            [{"username": "operator-account", "cookies": {"auth_token": "a", "ct0": "b"}}]
        )

        response = self.client.post("/monitoring/run")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "SUCCESS")
        self.assertEqual(response.json()["candidates_observed"], 0)
        self.assertEqual(response.json()["captured_count"], 0)
        self.assertEqual(response.json()["profiles_failed"], 0)

    def test_monitoring_endpoint_serializes_provider_failure_as_failed(self) -> None:
        self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="Designer requests", keywords=("designer",))
        )

        class FailingSource:
            async def search(self, query: str, *, limit: int) -> AsyncIterator[RawPost]:
                raise RuntimeError("network timeout")
                yield  # pragma: no cover

        self.app = create_app(self.repository, source_factory=lambda accounts: FailingSource())
        self.client = TestClient(self.app)
        os.environ["ARKZEN_TWSCRAPE_ACCOUNTS_JSON"] = json.dumps(
            [{"username": "operator-account", "cookies": {"auth_token": "a", "ct0": "b"}}]
        )

        response = self.client.post("/monitoring/run")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "FAILED")
        self.assertEqual(response.json()["profiles_failed"], 1)
        self.assertEqual(response.json()["captured_count"], 0)

    def test_monitoring_run_history_is_available(self) -> None:
        profile = self.repository.create_watch_profile(
            WatchProfile(owner="founder", source_description="Designer requests", keywords=("designer",))
        )
        os.environ["ARKZEN_TWSCRAPE_ACCOUNTS_JSON"] = json.dumps(
            [{"username": "operator-account", "cookies": {"auth_token": "a", "ct0": "b"}}]
        )
        created = self.client.post("/monitoring/run")
        run_id = created.json()["run_id"]

        detail = self.client.get(f"/monitoring/runs/{run_id}")
        history = self.client.get("/monitoring/runs")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["run_id"], run_id)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.json()[0]["run_id"], run_id)


if __name__ == "__main__":
    unittest.main()
