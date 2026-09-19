import unittest

from arkzen import SQLiteRepository, create_watch_profile_from_input


class IntentCaptureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = SQLiteRepository(":memory:")

    def tearDown(self) -> None:
        self.repository.close()

    def test_structured_input_creates_profile_and_normalizes_terms(self) -> None:
        profile = create_watch_profile_from_input(
            self.repository,
            owner=" founder ",
            source_description="People seeking a designer",
            keywords="website, website\nlanding page",
            phrase_patterns=["need a site", "need a site"],
            location_filter=" London ",
            language_filter=" en ",
        )

        self.assertEqual(profile.owner, "founder")
        self.assertEqual(profile.keywords, ("website", "landing page"))
        self.assertEqual(profile.phrase_patterns, ("need a site",))
        self.assertEqual(list(self.repository.list_watch_profiles(active_only=True)), [profile])

    def test_multiple_profiles_can_be_active(self) -> None:
        first = create_watch_profile_from_input(
            self.repository,
            owner="founder",
            source_description="Web design requests",
            keywords="web designer",
        )
        second = create_watch_profile_from_input(
            self.repository,
            owner="founder",
            source_description="Copywriting requests",
            keywords="copywriter",
        )

        self.assertEqual(
            {profile.id for profile in self.repository.list_watch_profiles(active_only=True)},
            {first.id, second.id},
        )

    def test_profile_requires_a_term(self) -> None:
        with self.assertRaises(ValueError):
            create_watch_profile_from_input(
                self.repository,
                owner="founder",
                source_description="Missing terms",
            )
