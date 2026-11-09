"""Unittests voor de spelstatus."""

import unittest

from kwaliteitsaanpakspel.game import (
    BUGS_PER_TESTER,
    BUGS_TARGET,
    BUSINESS_VALUE_TARGET,
    DEMO_MAX_OPEN_BUGS,
    DEMO_MIN_BUSINESS_VALUE,
    DEVELOPER_COST,
    LAST_ROUND,
    MAX_DEVELOPERS,
    MAX_TEAM_NAME_LENGTH,
    MAX_TEAMS,
    MAX_TESTERS,
    MEASURE_COSTS,
    MEASURES,
    RELEASES_PER_ROUND,
    RISKS,
    ROLE_COST,
    ROLE_PROTECTIONS,
    ROLES,
    START_BUDGET,
    STEPS,
    TECH_DEBT_TARGET,
    TESTER_COST,
    VELOCITY,
    Game,
    GameError,
    Release,
    Score,
    Team,
    UnknownTeamError,
    percentage,
)


class RegistrationTest(unittest.TestCase):
    """Unittests voor het aanmelden van teams."""

    def setUp(self) -> None:
        """Maak een spel aan."""
        self.game = Game()

    def test_new_game(self) -> None:
        """Test dat een nieuw spel geen teams heeft en nog niet is gestart."""
        self.assertEqual({}, self.game.teams)
        self.assertFalse(self.game.started)
        self.assertIsNone(self.game.round)
        self.assertFalse(self.game.round_finished)
        self.assertFalse(self.game.finished)

    def test_register_team(self) -> None:
        """Test dat een team kan worden aangemeld, nog zonder rondes."""
        team = self.game.register_team("  De Testers ")
        self.assertEqual({"name": "De Testers", "rounds": []}, team.as_dict())
        self.assertEqual({"De Testers": team}, self.game.teams)

    def test_register_team_without_name(self) -> None:
        """Test dat een team een naam moet hebben."""
        with self.assertRaisesRegex(GameError, "Geef je team een naam."):
            self.game.register_team("   ")

    def test_team_name_not_too_long(self) -> None:
        """Test dat de naam van een team hoogstens MAX_TEAM_NAME_LENGTH tekens lang is."""
        self.game.register_team("x" * MAX_TEAM_NAME_LENGTH)
        with self.assertRaisesRegex(GameError, "De naam van een team mag hoogstens 30 tekens lang zijn."):
            self.game.register_team("y" * (MAX_TEAM_NAME_LENGTH + 1))

    def test_not_too_many_teams(self) -> None:
        """Test dat er hoogstens MAX_TEAMS teams kunnen meedoen."""
        for number in range(MAX_TEAMS):
            self.game.register_team(f"Team {number}")
        with self.assertRaisesRegex(GameError, "Er kunnen hoogstens 50 teams meedoen."):
            self.game.register_team("Team te veel")

    def test_teams_get_different_tokens(self) -> None:
        """Test dat elk team een eigen, geheim token krijgt."""
        tokens = {self.game.register_team(name).token for name in ("A", "B", "C")}
        self.assertEqual(3, len(tokens))

    def test_register_team_twice(self) -> None:
        """Test dat teamnamen uniek moeten zijn, ongeacht hoofdletters."""
        self.game.register_team("De Testers")
        with self.assertRaisesRegex(GameError, "Er is al een team met de naam 'de testers'."):
            self.game.register_team("de testers")

    def test_register_team_after_start(self) -> None:
        """Test dat teams zich niet meer kunnen aanmelden als het spel is gestart."""
        self.game.register_team("De Testers")
        self.game.start_round()
        with self.assertRaisesRegex(GameError, "Het spel is al gestart."):
            self.game.register_team("De Laatkomers")


class RoundsTest(unittest.TestCase):
    """Unittests voor het starten en stoppen van de rondes."""

    def setUp(self) -> None:
        """Maak een spel met één team aan."""
        self.game = Game()
        self.team = self.game.register_team("De Testers")

    def play_all_rounds(self) -> None:
        """Speel alle rondes."""
        for _ in range(LAST_ROUND):
            self.game.start_round()
            self.game.finish_round()

    def test_start_first_round(self) -> None:
        """Test dat de eerste ronde start en dat elk team een beginstand krijgt."""
        self.game.start_round()
        self.assertTrue(self.game.started)
        self.assertEqual(1, self.game.round)
        self.assertFalse(self.game.round_finished)
        self.assertEqual([Score()], self.team.rounds)
        self.assertEqual(RELEASES_PER_ROUND, len(self.team.rounds[0].releases))

    def test_start_without_teams(self) -> None:
        """Test dat het spel niet kan starten zonder teams."""
        with self.assertRaisesRegex(GameError, "Er moet minimaal één team zijn aangemeld."):
            Game().start_round()

    def test_start_round_while_round_is_in_progress(self) -> None:
        """Test dat een nieuwe ronde pas kan starten als de huidige ronde is gestopt."""
        self.game.start_round()
        with self.assertRaisesRegex(GameError, "Ronde 1 is nog bezig."):
            self.game.start_round()
        self.assertEqual(1, self.game.round)

    def test_finish_round(self) -> None:
        """Test dat de spelleider een ronde kan stoppen, zonder dat de volgende ronde start."""
        self.game.start_round()
        self.game.finish_round()
        self.assertEqual(1, self.game.round)
        self.assertTrue(self.game.round_finished)
        self.assertFalse(self.game.finished)

    def test_finish_round_before_start(self) -> None:
        """Test dat er geen ronde te stoppen is voordat het spel is gestart."""
        with self.assertRaisesRegex(GameError, "Het spel is nog niet gestart."):
            self.game.finish_round()

    def test_finish_round_twice(self) -> None:
        """Test dat een ronde maar één keer kan worden gestopt."""
        self.game.start_round()
        self.game.finish_round()
        with self.assertRaisesRegex(GameError, "Ronde 1 is al afgelopen."):
            self.game.finish_round()

    def test_start_next_round(self) -> None:
        """Test dat de volgende ronde start met een nieuwe stand en dat de stand van de vorige ronde bewaard blijft."""
        self.game.start_round()
        self.game.plan_release("De Testers", 1, 5)
        self.game.finish_round()
        self.game.start_round()
        self.assertEqual(2, self.game.round)
        self.assertFalse(self.game.round_finished)
        self.assertEqual(5, self.team.rounds[0].releases[0].developers)
        self.assertEqual(Score(), self.team.rounds[1])

    def test_game_finishes_after_last_round(self) -> None:
        """Test dat het spel is afgelopen als de laatste ronde is gestopt."""
        self.play_all_rounds()
        self.assertEqual(LAST_ROUND, self.game.round)
        self.assertTrue(self.game.finished)

    def test_no_round_after_last_round(self) -> None:
        """Test dat er na de laatste ronde geen ronde meer kan starten."""
        self.play_all_rounds()
        with self.assertRaisesRegex(GameError, "Het spel is afgelopen."):
            self.game.start_round()
        self.assertEqual(LAST_ROUND, len(self.team.rounds))


class ScoreTest(unittest.TestCase):
    """Unittests voor de stand van een team in een ronde."""

    def test_new_score(self) -> None:
        """Test dat een nieuwe ronde begint met het volledige budget en zonder opgeleverde businesswaarde, bugs en
        technische schuld."""
        score = Score().as_dict()
        self.assertEqual(RELEASES_PER_ROUND, len(score["releases"]))
        totals = {key: score[key] for key in ("completed_releases", "remaining_budget", "business_value", "open_bugs")}
        self.assertEqual(
            {"completed_releases": 0, "remaining_budget": START_BUDGET, "business_value": 0, "open_bugs": 0}, totals
        )
        self.assertEqual(0, score["open_tech_debt"])

    def test_new_release(self) -> None:
        """Test dat een release in een nieuwe ronde het volledige budget heeft en nog niets heeft."""
        release = Score().as_dict()["releases"][0]
        self.assertEqual(START_BUDGET, release["budget"])
        for key in ("developers", "testers", "velocity", "bug_fixing", "tech_debt", "business_value_velocity", "cost"):
            self.assertEqual(0, release[key], key)

    def test_budget_per_release(self) -> None:
        """Test dat het budget van een release het startbudget is minus de kosten van de eerdere releases."""
        score = Score(releases=[Release(5), Release(10), Release(0), Release(3)])
        releases = score.as_dict()["releases"]
        self.assertEqual([2000, 1500, 500, 500], [release["budget"] for release in releases])
        self.assertEqual([500, 1000, 0, 300], [release["cost"] for release in releases])
        self.assertEqual([22, 32, 0, 13], [release["velocity"] for release in releases])
        self.assertEqual(200, score.as_dict()["remaining_budget"])

    def test_business_value_target_per_release(self) -> None:
        """Test dat elke release het target voor de businesswaarde van de ronde heeft."""
        score = Score(releases=[Release(5), Release(10), Release(0), Release(3)])
        targets = [release["business_value_target"] for release in score.as_dict()["releases"]]
        self.assertEqual([BUSINESS_VALUE_TARGET] * RELEASES_PER_ROUND, targets)
        self.assertEqual(80, BUSINESS_VALUE_TARGET)

    def test_bugs_target_per_release(self) -> None:
        """Test dat elke release het target voor het aantal bugs heeft."""
        targets = [release["bugs_target"] for release in Score().as_dict()["releases"]]
        self.assertEqual([BUGS_TARGET] * RELEASES_PER_ROUND, targets)
        self.assertEqual(4, BUGS_TARGET)

    def test_tech_debt_target_per_release(self) -> None:
        """Test dat elke release het target voor de technische schuld heeft."""
        targets = [release["tech_debt_target"] for release in Score().as_dict()["releases"]]
        self.assertEqual([TECH_DEBT_TARGET] * RELEASES_PER_ROUND, targets)
        self.assertEqual(4, TECH_DEBT_TARGET)

    def test_budget_can_become_negative(self) -> None:
        """Test dat het budget negatief kan worden als er meer wordt uitgegeven dan er is."""
        score = Score(releases=[Release(10), Release(10), Release(10), Release(10)])
        self.assertEqual([2000, 1000, 0, -1000], [release["budget"] for release in score.as_dict()["releases"]])
        self.assertEqual(-2000, score.as_dict()["remaining_budget"])

    def test_tester_cost(self) -> None:
        """Test dat testers meetellen in de kosten van een release, maar niet in de velocity."""
        release = Release(developers=2, testers=3)
        self.assertEqual(2 * DEVELOPER_COST + 3 * TESTER_COST, release.cost)
        self.assertEqual(Release(developers=2).velocity, release.velocity)

    def test_budget_includes_testers(self) -> None:
        """Test dat het budget van een release ook de testers van eerdere releases meetelt."""
        score = Score(releases=[Release(5, 5), Release(), Release(), Release()])
        self.assertEqual([2000, 1000, 1000, 1000], [release["budget"] for release in score.as_dict()["releases"]])

    def test_velocity(self) -> None:
        """Test dat de velocity van een release afhangt van het aantal ingezette ontwikkelaars."""
        velocities = [Release(developers).velocity for developers in range(MAX_DEVELOPERS + 1)]
        self.assertEqual([0, 4, 8, 13, 18, 22, 25, 28, 30, 31, 32], velocities)

    def test_developer_cost(self) -> None:
        """Test dat een ontwikkelaar per release DEVELOPER_COST kost."""
        self.assertEqual(7 * DEVELOPER_COST, Release(7).cost)


class HireDevelopersTest(unittest.TestCase):
    """Unittests voor het inhuren van ontwikkelaars."""

    def setUp(self) -> None:
        """Maak een spel met één team aan en start de eerste ronde."""
        self.game = Game()
        self.team = self.game.register_team("De Testers")
        self.game.start_round()

    def test_hire_developers(self) -> None:
        """Test dat een team ontwikkelaars kan inhuren voor de huidige release."""
        team = self.game.plan_release("De Testers", 1, 4)
        self.assertEqual([4, 0, 0, 0], [release.developers for release in team.rounds[0].releases])

    def test_hire_developers_for_next_release(self) -> None:
        """Test dat een team na het afronden van een release ontwikkelaars kan inhuren voor de volgende."""
        self.game.plan_release("De Testers", 1, 4, one_point_cards=18)  # velocity 18, dus 18 kaartjes
        self.game.finish_release("De Testers")
        team = self.game.plan_release("De Testers", 2, 6)
        self.assertEqual([4, 6, 0, 0], [release.developers for release in team.rounds[0].releases])

    def test_completed_release(self) -> None:
        """Test dat de ontwikkelaars van een afgeronde release vastliggen."""
        self.game.finish_release("De Testers")
        with self.assertRaisesRegex(GameError, "Release 1 is al afgerond."):
            self.game.plan_release("De Testers", 1, 4)

    def test_release_not_started(self) -> None:
        """Test dat een team pas ontwikkelaars voor een release kan inhuren als die release is gestart."""
        with self.assertRaisesRegex(GameError, "Release 2 is nog niet gestart."):
            self.game.plan_release("De Testers", 2, 4)

    def test_change_number_of_developers(self) -> None:
        """Test dat een team het aantal ontwikkelaars kan aanpassen, ook naar nul en het maximum."""
        for developers in (3, MAX_DEVELOPERS, 0):
            self.game.plan_release("De Testers", 1, developers)
            self.assertEqual(developers, self.team.rounds[0].releases[0].developers)

    def test_hire_testers(self) -> None:
        """Test dat een team testers kan inhuren zonder de ontwikkelaars te wijzigen."""
        self.game.plan_release("De Testers", 1, developers=4)
        team = self.game.plan_release("De Testers", 1, testers=MAX_TESTERS)
        self.assertEqual(Release(developers=4, testers=MAX_TESTERS), team.rounds[0].releases[0])

    def test_hire_developers_and_testers(self) -> None:
        """Test dat een team ontwikkelaars en testers tegelijk kan inhuren."""
        team = self.game.plan_release("De Testers", 1, developers=3, testers=1)
        self.assertEqual(Release(developers=3, testers=1), team.rounds[0].releases[0])

    def test_too_few_or_too_many_testers(self) -> None:
        """Test dat er per release 0 tot en met MAX_TESTERS testers kunnen worden ingehuurd."""
        for testers in (-1, MAX_TESTERS + 1):
            with (
                self.subTest(testers=testers),
                self.assertRaisesRegex(GameError, "Per release kunnen 0 tot en met 5 testers worden ingehuurd."),
            ):
                self.game.plan_release("De Testers", 1, developers=2, testers=testers)
        self.assertEqual(Release(), self.team.rounds[0].releases[0])

    def test_unknown_team(self) -> None:
        """Test dat alleen aangemelde teams ontwikkelaars kunnen inhuren."""
        with self.assertRaisesRegex(UnknownTeamError, "Er is geen team met de naam 'De Onbekenden'."):
            self.game.plan_release("De Onbekenden", 1, 1)

    def test_no_round_in_progress(self) -> None:
        """Test dat er alleen ontwikkelaars kunnen worden ingehuurd tijdens een ronde."""
        game = Game()
        game.register_team("De Testers")
        with self.assertRaisesRegex(GameError, "Er is geen ronde bezig."):
            game.plan_release("De Testers", 1, 1)
        game.start_round()
        game.finish_round()
        with self.assertRaisesRegex(GameError, "Er is geen ronde bezig."):
            game.plan_release("De Testers", 1, 1)

    def test_release_does_not_exist(self) -> None:
        """Test dat een ronde RELEASES_PER_ROUND releases heeft."""
        for release_number in (0, RELEASES_PER_ROUND + 1):
            with (
                self.subTest(release_number=release_number),
                self.assertRaisesRegex(
                    GameError, f"Release {release_number} bestaat niet; een ronde heeft 4 releases."
                ),
            ):
                self.game.plan_release("De Testers", release_number, 1)

    def test_too_few_or_too_many_developers(self) -> None:
        """Test dat er per release 0 tot en met MAX_DEVELOPERS ontwikkelaars kunnen worden ingehuurd."""
        for developers in (-1, MAX_DEVELOPERS + 1):
            with (
                self.subTest(developers=developers),
                self.assertRaisesRegex(GameError, "Per release kunnen 0 tot en met 10 ontwikkelaars worden ingehuurd."),
            ):
                self.game.plan_release("De Testers", 1, developers)
        self.assertEqual(0, self.team.rounds[0].releases[0].developers)


class FinishReleaseTest(unittest.TestCase):
    """Unittests voor het afronden van releases."""

    def setUp(self) -> None:
        """Maak een spel met twee teams aan en start de eerste ronde."""
        self.game = Game()
        self.team = self.game.register_team("De Testers")
        self.other_team = self.game.register_team("De Bouwers")
        self.game.start_round()

    def test_first_release_is_current(self) -> None:
        """Test dat elk team een ronde begint met release 1."""
        self.assertEqual(1, self.team.rounds[0].current_release)

    def test_finish_release(self) -> None:
        """Test dat het afronden van een release de volgende release start, alleen voor dat team."""
        team = self.game.finish_release("De Testers")
        self.assertEqual(1, team.rounds[0].completed_releases)
        self.assertEqual(2, team.rounds[0].current_release)
        self.assertEqual(1, self.other_team.rounds[0].current_release)

    def test_finish_all_releases(self) -> None:
        """Test dat er na de laatste release geen huidige release meer is."""
        for _ in range(RELEASES_PER_ROUND):
            self.game.finish_release("De Testers")
        self.assertIsNone(self.team.rounds[0].current_release)
        with self.assertRaisesRegex(GameError, "Alle releases van deze ronde zijn al afgerond."):
            self.game.finish_release("De Testers")
        self.assertEqual(RELEASES_PER_ROUND, self.team.rounds[0].completed_releases)

    def test_next_round_starts_with_first_release(self) -> None:
        """Test dat een team in een nieuwe ronde weer met release 1 begint."""
        self.game.finish_release("De Testers")
        self.game.finish_round()
        self.game.start_round()
        self.assertEqual(1, self.team.rounds[1].current_release)

    def test_no_round_in_progress(self) -> None:
        """Test dat een team alleen tijdens een ronde releases kan afronden."""
        self.game.finish_round()
        with self.assertRaisesRegex(GameError, "Er is geen ronde bezig."):
            self.game.finish_release("De Testers")

    def test_unknown_team(self) -> None:
        """Test dat alleen aangemelde teams releases kunnen afronden."""
        with self.assertRaisesRegex(UnknownTeamError, "Er is geen team met de naam 'De Onbekenden'."):
            self.game.finish_release("De Onbekenden")


class VelocitySplitTest(unittest.TestCase):
    """Unittests voor het verdelen van de velocity over bugs, technische schuld en businesswaarde."""

    def setUp(self) -> None:
        """Maak een spel met één team aan, start de eerste ronde en zet 3 ontwikkelaars in (velocity 13)."""
        self.game = Game()
        self.team = self.game.register_team("De Testers")
        self.game.start_round()
        self.plan(developers=3)

    def plan(self, **changes: int) -> None:
        """Plan de eerste release van het team."""
        self.game.plan_release("De Testers", 1, **changes)

    def release(self) -> Release:
        """Geef de huidige release van het team."""
        return self.team.rounds[0].releases[0]

    def split(self) -> tuple[int, int, int, int]:
        """Geef de velocity van de huidige release: totaal, bugs, technische schuld en businesswaarde."""
        release = self.release()
        return release.velocity, release.bug_fixing, release.tech_debt, release.business_value_velocity

    def test_all_velocity_goes_to_business_value_by_default(self) -> None:
        """Test dat de velocity standaard helemaal naar het realiseren van businesswaarde gaat."""
        self.assertEqual((13, 0, 0, 13), self.split())

    def test_spend_velocity_on_bugs_and_tech_debt(self) -> None:
        """Test dat de businesswaarde de velocity krijgt die niet naar bugs en technische schuld gaat."""
        self.plan(bug_fixing=6)
        self.plan(tech_debt=4)
        self.assertEqual((13, 6, 4, 3), self.split())

    def test_spend_all_velocity_on_bugs_and_tech_debt(self) -> None:
        """Test dat alle velocity aan bugs en technische schuld kan worden besteed."""
        self.plan(developers=2, bug_fixing=6, tech_debt=2)
        self.assertEqual((8, 6, 2, 0), self.split())

    def test_too_much_velocity_on_bugs(self) -> None:
        """Test dat er niet meer velocity aan bugs kan worden besteed dan overblijft na technische schuld.

        Er blijft 9 over, maar omdat de velocity voor bugs even moet zijn, is het maximum 8.
        """
        self.plan(tech_debt=4)
        for bug_fixing in (-2, 10):
            with (
                self.subTest(bug_fixing=bug_fixing),
                self.assertRaisesRegex(GameError, "Er kan 0 tot en met 8 velocity aan het oplossen van bugs"),
            ):
                self.plan(bug_fixing=bug_fixing)
        self.assertEqual((13, 0, 4, 9), self.split())

    def test_too_much_velocity_on_tech_debt(self) -> None:
        """Test dat er niet meer velocity aan technische schuld kan worden besteed dan overblijft na bugs."""
        self.plan(bug_fixing=6)
        for tech_debt in (-2, 8):
            with (
                self.subTest(tech_debt=tech_debt),
                self.assertRaisesRegex(GameError, "Er kan 0 tot en met 6 velocity aan het oplossen van technische"),
            ):
                self.plan(tech_debt=tech_debt)
        self.assertEqual((13, 6, 0, 7), self.split())

    def test_velocity_for_bugs_and_tech_debt_must_be_even(self) -> None:
        """Test dat de velocity voor bugs en technische schuld een veelvoud van VELOCITY_PER_FIX moet zijn."""
        for purpose, changes in (("bugs", {"bug_fixing": 3}), ("technische schuld", {"tech_debt": 5})):
            with self.subTest(purpose=purpose):
                message = f"De velocity voor het oplossen van {purpose} moet een veelvoud van 2 zijn."
                with self.assertRaisesRegex(GameError, message):
                    self.plan(**changes)
        self.assertEqual((13, 0, 0, 13), self.split())

    def test_nothing_changes_if_part_of_the_plan_is_invalid(self) -> None:
        """Test dat een plan helemaal of helemaal niet wordt doorgevoerd."""
        with self.assertRaisesRegex(GameError, "Er kan 0 tot en met 4 velocity aan het oplossen van bugs"):
            self.plan(developers=1, bug_fixing=6)
        self.assertEqual((13, 0, 0, 13), self.split())

    def test_fewer_developers_reduce_tech_debt_first(self) -> None:
        """Test dat minder ontwikkelaars eerst de velocity voor technische schuld verlagen."""
        self.plan(bug_fixing=6, tech_debt=4)
        self.plan(developers=2)  # velocity 8
        self.assertEqual((8, 6, 2, 0), self.split())

    def test_fewer_developers_reduce_bug_fixing_last(self) -> None:
        """Test dat minder ontwikkelaars ook de velocity voor bugs verlagen als dat nodig is."""
        self.plan(bug_fixing=6, tech_debt=4)
        self.plan(developers=1)  # velocity 4
        self.assertEqual((4, 4, 0, 0), self.split())

    def test_fewer_developers_keep_velocity_for_bugs_and_tech_debt_even(self) -> None:
        """Test dat de velocity voor bugs en technische schuld even blijft als die omlaag moet."""
        self.plan(developers=8, bug_fixing=14, tech_debt=16)  # velocity 30
        self.plan(developers=6)  # velocity 25
        self.assertEqual((25, 14, 10, 1), self.split())

    def test_no_developers_no_velocity(self) -> None:
        """Test dat er zonder ontwikkelaars geen velocity te verdelen is."""
        self.plan(bug_fixing=6, tech_debt=4)
        self.plan(developers=0)
        self.assertEqual((0, 0, 0, 0), self.split())

    def test_more_developers_keep_the_split(self) -> None:
        """Test dat meer ontwikkelaars de extra velocity naar businesswaarde laten gaan."""
        self.plan(bug_fixing=6, tech_debt=4)
        self.plan(developers=5)  # velocity 22
        self.assertEqual((22, 6, 4, 12), self.split())


class SolvingCapacityTest(unittest.TestCase):
    """Unittests voor de oploscapaciteit van een release."""

    def test_no_capacity_by_default(self) -> None:
        """Test dat een release zonder testers en zonder velocity voor bugs en technische schuld niets oplost."""
        self.assertEqual((0, 0), (Release(developers=5).bug_fixing_capacity, Release(developers=5).tech_debt_capacity))

    def test_testers_solve_bugs(self) -> None:
        """Test dat elke tester BUGS_PER_TESTER bugs oplost."""
        self.assertEqual(3 * BUGS_PER_TESTER, Release(testers=3).bug_fixing_capacity)

    def test_velocity_solves_bugs(self) -> None:
        """Test dat VELOCITY_PER_FIX velocity één bug oplost."""
        self.assertEqual(3, Release(developers=3, bug_fixing=6).bug_fixing_capacity)

    def test_testers_and_velocity_solve_bugs(self) -> None:
        """Test dat de oploscapaciteit voor bugs 4 x testers plus de velocity voor bugs gedeeld door twee is."""
        self.assertEqual(4 * 2 + 6 // 2, Release(developers=3, testers=2, bug_fixing=6).bug_fixing_capacity)

    def test_velocity_solves_tech_debt(self) -> None:
        """Test dat de oploscapaciteit voor technische schuld de velocity voor technische schuld gedeeld door 2 is."""
        release = Release(developers=3, testers=2, tech_debt=4)
        self.assertEqual((2, 8), (release.tech_debt_capacity, release.bug_fixing_capacity))

    def test_capacity_per_release(self) -> None:
        """Test dat de stand per release de oploscapaciteit bevat."""
        score = Score(releases=[Release(3, 2, 6, 4), Release(), Release(), Release()])
        release = score.as_dict()["releases"][0]
        self.assertEqual((11, 2), (release["bug_fixing_capacity"], release["tech_debt_capacity"]))


class CardsTest(unittest.TestCase):
    """Unittests voor het invoeren van de omgedraaide kaartjes."""

    def setUp(self) -> None:
        """Start een ronde voor één team, met 4 ontwikkelaars en 1 tester, en 2 velocity voor technische schuld.

        De velocity is 18, dus het team mag 16 kaartjes omdraaien.
        """
        self.game = Game()
        self.team = self.game.register_team("De Testers")
        self.game.start_round()
        self.plan(developers=4, testers=1, tech_debt=2)

    def plan(self, **changes: int) -> None:
        """Plan de huidige release van het team."""
        self.game.plan_release("De Testers", self.team.rounds[0].current_release, **changes)

    def release(self, index: int = 0) -> Release:
        """Geef een release van het team."""
        return self.team.rounds[0].releases[index]

    def test_enter_cards(self) -> None:
        """Test dat het team de omgedraaide kaartjes kan invoeren en dat de businesswaarde wordt uitgerekend."""
        self.plan(one_point_cards=4, two_point_cards=4, three_point_cards=2, bug_cards=3, tech_debt_cards=3)
        self.assertEqual(
            (16, 0, 18), (self.release().cards, self.release().open_cards, self.release().delivered_business_value)
        )

    def test_too_many_cards(self) -> None:
        """Test dat het team niet meer kaartjes kan invoeren dan het mocht omdraaien."""
        self.plan(one_point_cards=10)
        for count in (-1, 7):
            with (
                self.subTest(count=count),
                self.assertRaisesRegex(GameError, "Het team kan in deze release 0 tot en met 6 van deze kaartjes"),
            ):
                self.plan(bug_cards=count)
        self.assertEqual((10, 0), (self.release().one_point_cards, self.release().bug_cards))

    def test_change_cards(self) -> None:
        """Test dat het team een aantal kaartjes kan wijzigen, ook als alle kaartjes al zijn ingevoerd."""
        self.plan(one_point_cards=16)
        self.plan(one_point_cards=10, bug_cards=6)
        self.assertEqual(
            (10, 6, 0), (self.release().one_point_cards, self.release().bug_cards, self.release().open_cards)
        )

    def test_unknown_cards(self) -> None:
        """Test dat alleen bekende soorten kaartjes kunnen worden ingevoerd."""
        with self.assertRaisesRegex(TypeError, "Onbekende kaartjes: joker_cards"):
            self.plan(joker_cards=1)

    def test_less_velocity_fewer_cards(self) -> None:
        """Test dat minder velocity voor businesswaarde de laatste soorten kaartjes eerst verlaagt."""
        self.plan(one_point_cards=6, two_point_cards=4, bug_cards=3, tech_debt_cards=3)
        self.plan(bug_fixing=6)  # nog 10 kaartjes
        release = self.release()
        self.assertEqual(
            (6, 4, 0, 0), (release.one_point_cards, release.two_point_cards, release.bug_cards, release.tech_debt_cards)
        )

    def test_finish_release_after_entering_all_cards(self) -> None:
        """Test dat het team een release pas kan afronden als alle omgedraaide kaartjes zijn ingevoerd."""
        self.plan(one_point_cards=13)
        with self.assertRaisesRegex(GameError, "Voer eerst alle omgedraaide kaartjes in; er moeten er nog 3 worden"):
            self.game.finish_release("De Testers")
        self.plan(bug_cards=2)
        with self.assertRaisesRegex(GameError, "Voer eerst alle omgedraaide kaartjes in; er moet er nog 1 worden"):
            self.game.finish_release("De Testers")
        self.plan(bug_cards=3)
        self.game.finish_release("De Testers")
        self.assertEqual(1, self.team.rounds[0].completed_releases)


class CumulativeTest(unittest.TestCase):
    """Unittests voor wat een team cumulatief heeft opgeleverd."""

    def score(self, *releases: Release) -> dict:
        """Geef de stand van een ronde met de opgegeven releases."""
        return Score(releases=list(releases) + [Release()] * (RELEASES_PER_ROUND - len(releases))).as_dict()

    def cumulative(self, key: str, *releases: Release) -> list[int]:
        """Geef de cumulatieve waarde per release."""
        return [release[f"cumulative_{key}"] for release in self.score(*releases)["releases"]]

    def test_business_value_adds_up(self) -> None:
        """Test dat de opgeleverde businesswaarde wordt opgeteld."""
        releases = (Release(one_point_cards=2, three_point_cards=1), Release(two_point_cards=3))
        self.assertEqual([5, 11, 11, 11], self.cumulative("business_value", *releases))
        self.assertEqual(11, self.score(*releases)["business_value"])

    def test_bugs_add_up(self) -> None:
        """Test dat nieuwe bugs bij de open bugs komen."""
        self.assertEqual([3, 5, 5, 5], self.cumulative("bugs", Release(bug_cards=3), Release(bug_cards=2)))

    def test_bugs_are_solved_in_the_same_release(self) -> None:
        """Test dat het team bugs kan oplossen in de release waarin ze erbij komen."""
        self.assertEqual([1, 1, 1, 1], self.cumulative("bugs", Release(testers=1, bug_cards=5)))

    def test_open_bugs_are_solved_later(self) -> None:
        """Test dat het team open bugs uit eerdere releases kan oplossen, maar niet meer dan er zijn."""
        releases = (Release(bug_cards=3), Release(testers=1, bug_cards=2), Release(testers=2))
        self.assertEqual([3, 1, 0, 0], self.cumulative("bugs", *releases))
        self.assertEqual(0, self.score(*releases)["open_bugs"])

    def test_tech_debt_adds_up_and_is_solved(self) -> None:
        """Test dat technische schuld erbij komt en wordt opgelost, net als bugs."""
        releases = (Release(tech_debt_cards=3), Release(developers=4, tech_debt=2, tech_debt_cards=1))
        self.assertEqual([3, 3, 3, 3], self.cumulative("tech_debt", *releases))
        self.assertEqual(3, self.score(*releases)["open_tech_debt"])

    def test_cards_per_release(self) -> None:
        """Test dat de stand per release de ingevoerde kaartjes en de opgeleverde businesswaarde bevat."""
        release = self.score(Release(developers=2, one_point_cards=1, two_point_cards=2, bug_cards=1))["releases"][0]
        cards = {
            key: release[key]
            for key in ("one_point_cards", "two_point_cards", "three_point_cards", "bug_cards", "tech_debt_cards")
        }
        self.assertEqual(
            {"one_point_cards": 1, "two_point_cards": 2, "three_point_cards": 0, "bug_cards": 1, "tech_debt_cards": 0},
            cards,
        )
        self.assertEqual((5, 4), (release["delivered_business_value"], release["open_cards"]))


class RisksTest(unittest.TestCase):
    """Unittests voor de risico's die in een release optreden."""

    def setUp(self) -> None:
        """Start een ronde voor één team."""
        self.game = Game()
        self.team = self.game.register_team("De Testers")
        self.game.start_round()

    def risks(self, index: int = 0) -> list[str]:
        """Geef de risico's die in een release zijn opgetreden."""
        return self.team.rounds[0].as_dict()["releases"][index]["risks"]

    def test_twelve_risks(self) -> None:
        """Test dat er twaalf risico's zijn, elk met een label dat met een emoji begint."""
        self.assertEqual(12, len(RISKS))
        self.assertEqual("👎 Release niet geaccepteerd", RISKS["release_not_accepted"])

    def test_no_risks_by_default(self) -> None:
        """Test dat er standaard geen risico's zijn opgetreden."""
        self.assertEqual([], self.risks())

    def test_one_or_more_risks(self) -> None:
        """Test dat er in een release een of meer risico's kunnen optreden, in de volgorde van RISKS."""
        self.game.plan_release("De Testers", 1, risks=["external_audit", "scope_extension"])
        self.assertEqual(["scope_extension", "external_audit"], self.risks())

    def test_uncheck_risks(self) -> None:
        """Test dat het team een aangevinkt risico weer kan uitvinken."""
        self.game.plan_release("De Testers", 1, risks=["external_audit", "scope_extension"])
        self.game.plan_release("De Testers", 1, risks=["scope_extension"])
        self.assertEqual(["scope_extension"], self.risks())

    def test_other_changes_keep_the_risks(self) -> None:
        """Test dat het wijzigen van andere onderdelen van de release de risico's niet verandert."""
        self.game.plan_release("De Testers", 1, risks=["scope_extension"])
        self.game.plan_release("De Testers", 1, developers=2)
        self.assertEqual(["scope_extension"], self.risks())

    def test_unknown_risk(self) -> None:
        """Test dat alleen bekende risico's kunnen optreden."""
        with self.assertRaisesRegex(GameError, "Onbekende risico's: meteor"):
            self.game.plan_release("De Testers", 1, risks=["data_loss", "meteor"])
        self.assertEqual([], self.risks())


def game_with_software() -> tuple[Game, Team]:
    """Geef een spel met één team dat in release 1 software heeft opgeleverd en nu release 2 maakt."""
    game = Game()
    team = game.register_team("De Testers")
    game.start_round()
    game.plan_release("De Testers", 1, developers=1, one_point_cards=4)  # velocity 4
    game.finish_release("De Testers")
    return game, team


class RiskConsequencesTest(unittest.TestCase):
    """Unittests voor de gevolgen van risico's."""

    def bugs_targets(self, *risks_per_release: set[str]) -> list[int]:
        """Geef het target voor het aantal bugs per release, als de opgegeven risico's optreden."""
        score = Score(releases=[Release(risks=frozenset(risks)) for risks in risks_per_release])
        return [release["bugs_target"] for release in score.as_dict()["releases"]]

    def test_release_not_accepted_lowers_bugs_target(self) -> None:
        """Test dat een niet geaccepteerde release het bugtarget in die en de volgende releases met 1 verlaagt."""
        self.assertEqual([4, 3, 3, 3], self.bugs_targets(set(), {"release_not_accepted"}, set(), set()))

    def test_release_not_accepted_twice(self) -> None:
        """Test dat elke niet geaccepteerde release het bugtarget verder verlaagt."""
        self.assertEqual(
            [3, 3, 2, 2], self.bugs_targets({"release_not_accepted"}, set(), {"release_not_accepted"}, set())
        )

    def test_bugs_target_not_below_zero(self) -> None:
        """Test dat het bugtarget niet negatief wordt."""
        not_accepted = {"release_not_accepted"}
        releases = [not_accepted] * 5
        self.assertEqual([3, 2, 1, 0, 0], self.bugs_targets(*releases))

    def test_other_risks_keep_bugs_target(self) -> None:
        """Test dat andere risico's het bugtarget niet veranderen."""
        self.assertEqual([4, 4, 4, 4], self.bugs_targets({"impromptu_demo", "external_audit"}, set(), set(), set()))

    def test_data_loss_lowers_bugs_target(self) -> None:
        """Test dat dataloss in productie het bugtarget in die en de volgende releases met 1 verlaagt."""
        self.assertEqual([4, 3, 3, 3], self.bugs_targets(set(), {"data_loss"}, set(), set()))

    def test_data_loss_and_release_not_accepted_lower_bugs_target_twice(self) -> None:
        """Test dat dataloss en een niet geaccepteerde release in dezelfde release het bugtarget met 2 verlagen."""
        self.assertEqual([2, 2, 2, 2], self.bugs_targets({"data_loss", "release_not_accepted"}, set(), set(), set()))

    def test_data_loss_lowers_velocity_in_current_release_only(self) -> None:
        """Test dat dataloss in productie alleen de velocity van de release zelf verlaagt."""
        score = Score(releases=[Release(4), Release(4, risks=frozenset({"data_loss"})), Release(4), Release(4)])
        velocities = [release["velocity"] for release in score.as_dict()["releases"]]
        self.assertEqual([18, 18 - 3, 18, 18], velocities)

    def test_velocity_not_below_zero(self) -> None:
        """Test dat dataloss de velocity niet negatief maakt."""
        self.assertEqual(0, Release(0, risks=frozenset({"data_loss"})).velocity)

    def test_data_loss_limits_velocity_split_and_cards(self) -> None:
        """Test dat minder velocity door dataloss de verdeling van de velocity en de kaartjes inperkt."""
        game, team = game_with_software()
        game.plan_release("De Testers", 2, developers=3, tech_debt=10, one_point_cards=3)  # velocity 13
        game.plan_release("De Testers", 2, risks=["data_loss"])  # velocity 10
        release = team.rounds[0].releases[1]
        self.assertEqual(
            (10, 10, 0, 0), (release.velocity, release.tech_debt, release.business_value_velocity, release.cards)
        )

    def test_data_loss_limits_new_plans(self) -> None:
        """Test dat de nieuwe velocity meteen geldt als het team dataloss en een nieuwe verdeling tegelijk opgeeft."""
        game, _ = game_with_software()
        game.plan_release("De Testers", 2, developers=3)  # velocity 13
        with self.assertRaisesRegex(GameError, "Er kan 0 tot en met 10 velocity aan het oplossen van bugs"):
            game.plan_release("De Testers", 2, risks=["data_loss"], bug_fixing=12)

    def test_no_data_loss_without_software(self) -> None:
        """Test dat er geen dataloss in productie kan optreden zolang er nog geen software is opgeleverd."""
        game = Game()
        game.register_team("De Testers")
        game.start_round()
        with self.assertRaisesRegex(GameError, "🔥 Dataloss in productie kan niet optreden: nog geen software gereed."):
            game.plan_release("De Testers", 1, risks=["data_loss"])
        self.assertEqual({"data_loss": "no_software_ready"}, Release().protected_risks)

    def test_no_data_loss_if_nothing_delivered_yet(self) -> None:
        """Test dat er ook na de eerste release geen dataloss kan optreden als het team nog niets heeft opgeleverd."""
        score = Score(releases=[Release(1, bug_cards=4), Release(), Release(), Release()])
        self.assertEqual("no_software_ready", score.releases[1].protected_risks.get("data_loss"))

    def test_data_loss_after_delivering_software(self) -> None:
        """Test dat er dataloss kan optreden zodra er software is opgeleverd."""
        game, team = game_with_software()
        game.plan_release("De Testers", 2, risks=["data_loss"])
        self.assertEqual(["data_loss"], team.rounds[0].as_dict()["releases"][1]["risks"])

    def test_security_test_protects_before_software(self) -> None:
        """Test dat de securitytest de bescherming geeft als het team die neemt, ook als er nog geen software is."""
        self.assertEqual("security_test", Release(measures=frozenset({"security_test"})).protected_risks["data_loss"])

    def score(self, *risks_per_release: set[str]) -> list[dict]:
        """Geef de stand per release, als alle releases 5 ontwikkelaars hebben en de opgegeven risico's optreden."""
        score = Score(releases=[Release(5, risks=frozenset(risks)) for risks in risks_per_release])
        return score.as_dict()

    def test_scope_extension_raises_business_value_target(self) -> None:
        """Test dat een scope uitbreiding het target voor businesswaarde vanaf die release met 10% verhoogt."""
        releases = self.score(set(), {"scope_extension"}, set(), set())["releases"]
        self.assertEqual([80, 88, 88, 88], [release["business_value_target"] for release in releases])

    def test_scope_extension_twice(self) -> None:
        """Test dat een tweede scope uitbreiding 10% van het dan geldende target erbij doet, afgerond."""
        releases = self.score({"scope_extension"}, set(), {"scope_extension"}, set())["releases"]
        self.assertEqual([88, 88, 97, 97], [release["business_value_target"] for release in releases])

    def test_scope_extension_raises_budget(self) -> None:
        """Test dat een scope uitbreiding het budget vanaf die release met 300 verhoogt."""
        score = self.score(set(), {"scope_extension"}, set(), set())
        self.assertEqual([2000, 1800, 1300, 800], [release["budget"] for release in score["releases"]])
        self.assertEqual(2000 + 300 - 4 * 500, score["remaining_budget"])

    def test_percentage(self) -> None:
        """Test dat een percentage wordt afgerond op een heel getal, een half naar boven."""
        self.assertEqual((8, 9, 9, 0), (percentage(80, 10), percentage(88, 10), percentage(85, 10), percentage(4, 10)))

    def test_developer_resignation_lowers_velocity(self) -> None:
        """Test dat het ontslag van een ontwikkelaar de velocity berekent met één ontwikkelaar minder."""
        release = Release(4, risks=frozenset({"developer_resignation"}))
        self.assertEqual((4, 13, 4 * DEVELOPER_COST), (release.developers, release.velocity, release.cost))

    def test_developer_resignation_without_developers(self) -> None:
        """Test dat het ontslag van een ontwikkelaar zonder ontwikkelaars de velocity op 0 laat."""
        self.assertEqual(0, Release(0, risks=frozenset({"developer_resignation"})).velocity)

    def test_developer_resignation_in_current_release_only(self) -> None:
        """Test dat het ontslag van een ontwikkelaar alleen de velocity van de release zelf verlaagt."""
        releases = self.score(set(), {"developer_resignation"}, set(), set())["releases"]
        self.assertEqual([22, 18, 22, 22], [release["velocity"] for release in releases])

    def test_developer_resignation_and_data_loss(self) -> None:
        """Test dat het ontslag van een ontwikkelaar en dataloss samen de velocity verlagen."""
        release = Release(4, risks=frozenset({"developer_resignation", "data_loss"}))
        self.assertEqual(13 - 3, release.velocity)

    def test_major_update_lowers_velocity_in_current_release_only(self) -> None:
        """Test dat een grote update alleen de velocity van de release zelf met 3 verlaagt."""
        releases = self.score(set(), {"major_update"}, set(), set())["releases"]
        self.assertEqual([22, 19, 22, 22], [release["velocity"] for release in releases])

    def test_major_update_and_data_loss(self) -> None:
        """Test dat een grote update en dataloss samen de velocity met 6 verlagen."""
        self.assertEqual(22 - 6, Release(5, risks=frozenset({"major_update", "data_loss"})).velocity)

    def test_major_update_lowers_tech_debt_target(self) -> None:
        """Test dat een grote update het target voor technische schuld in die en de volgende releases met 1 verlaagt."""
        releases = self.score(set(), {"major_update"}, set(), {"major_update"})["releases"]
        self.assertEqual([4, 3, 3, 2], [release["tech_debt_target"] for release in releases])

    def test_tech_debt_target_not_below_zero(self) -> None:
        """Test dat het target voor technische schuld niet negatief wordt."""
        releases = self.score(*[{"major_update"}] * 5)["releases"]
        self.assertEqual([3, 2, 1, 0, 0], [release["tech_debt_target"] for release in releases])

    def test_target_architecture_changes(self) -> None:
        """Test dat een wijziging in de doelarchitectuur het target 5% en het budget 150 verhoogt en velocity kost."""
        score = self.score(set(), {"target_architecture_changes"}, set(), set())
        releases = score["releases"]
        self.assertEqual([80, 84, 84, 84], [release["business_value_target"] for release in releases])
        self.assertEqual([2000, 1650, 1150, 650], [release["budget"] for release in releases])
        self.assertEqual([22, 19, 22, 22], [release["velocity"] for release in releases])

    def test_scope_extension_and_target_architecture_changes(self) -> None:
        """Test dat een scope uitbreiding en een doelarchitectuurwijziging samen in de volgorde van RISKS werken."""
        releases = self.score({"target_architecture_changes", "scope_extension"}, set(), set(), set())["releases"]
        self.assertEqual((92, 2000 + 450), (releases[0]["business_value_target"], releases[0]["budget"]))

    def test_external_audit(self) -> None:
        """Test dat een externe audit velocity kost en het target voor technische schuld vanaf die release verlaagt."""
        releases = self.score(set(), {"external_audit"}, set(), set())["releases"]
        self.assertEqual([4, 3, 3, 3], [release["tech_debt_target"] for release in releases])
        self.assertEqual([22, 19, 22, 22], [release["velocity"] for release in releases])

    def test_external_audit_and_major_update(self) -> None:
        """Test dat een externe audit en een grote update samen het target voor technische schuld met 2 verlagen."""
        releases = self.score({"external_audit", "major_update"}, set(), set(), set())["releases"]
        self.assertEqual([2, 2, 2, 2], [release["tech_debt_target"] for release in releases])
        self.assertEqual(22 - 6, releases[0]["velocity"])

    def test_change_of_management(self) -> None:
        """Test dat een wisseling in de aansturing het target vanaf die release met 6 punten verhoogt."""
        score = self.score(set(), {"change_of_management"}, set(), set())
        releases = score["releases"]
        self.assertEqual([80, 86, 86, 86], [release["business_value_target"] for release in releases])
        self.assertEqual([2000, 1500, 1000, 500], [release["budget"] for release in releases])
        self.assertEqual([22, 22, 22, 22], [release["velocity"] for release in releases])

    def test_change_of_management_after_scope_extension(self) -> None:
        """Test dat de punten van een wisseling in de aansturing na de procenten van een scope uitbreiding komen."""
        releases = self.score({"change_of_management", "scope_extension"}, set(), set(), set())["releases"]
        self.assertEqual(80 + 8 + 6, releases[0]["business_value_target"])

    def test_changes_of_business_value_target_and_budget(self) -> None:
        """Test dat de stand per release de risico's bevat die in die release het target en het budget veranderen."""
        risks = {"scope_extension", "change_of_management", "target_architecture_changes"}
        releases = self.score(set(), risks, set(), set())["releases"]
        self.assertEqual(
            [
                {"cause": "scope_extension", "change": 8},
                {"cause": "target_architecture_changes", "change": 4},
                {"cause": "change_of_management", "change": 6},
            ],
            releases[1]["business_value_target_changes"],
        )
        self.assertEqual(
            [{"cause": "scope_extension", "change": 300}, {"cause": "target_architecture_changes", "change": 150}],
            releases[1]["budget_changes"],
        )
        for release in (releases[0], releases[2]):
            self.assertEqual(([], []), (release["business_value_target_changes"], release["budget_changes"]))

    def test_changes_of_bugs_and_tech_debt_targets(self) -> None:
        """Test dat de stand per release de risico's bevat die in die release de targets voor bugs en technische
        schuld verlagen."""
        releases = self.score(set(), {"data_loss", "release_not_accepted", "external_audit"}, set(), set())["releases"]
        self.assertEqual(
            [{"cause": "release_not_accepted", "change": -1}, {"cause": "data_loss", "change": -1}],
            releases[1]["bugs_target_changes"],
        )
        self.assertEqual([{"cause": "external_audit", "change": -1}], releases[1]["tech_debt_target_changes"])
        for release in (releases[0], releases[2]):
            self.assertEqual(([], []), (release["bugs_target_changes"], release["tech_debt_target_changes"]))

    def test_no_change_of_target_at_zero(self) -> None:
        """Test dat een risico dat een target van 0 niet verder kan verlagen, niet in de veranderingen staat."""
        releases = self.score(*[{"major_update"}] * 5)["releases"]
        self.assertEqual(
            [[{"cause": "major_update", "change": -1}], []], [r["tech_debt_target_changes"] for r in releases[3:]]
        )

    def test_targets_and_results_of_round(self) -> None:
        """Test dat de stand van de ronde de targets van de laatste release en de werkelijke waarden bevat."""
        risks = [{"scope_extension"}, {"release_not_accepted"}, {"external_audit"}, set()]
        score = Score(
            releases=[Release(5, three_point_cards=4, bug_cards=2, risks=frozenset(r)) for r in risks]
        ).as_dict()
        targets = [score[key] for key in ("budget_target", "business_value_target", "bugs_target", "tech_debt_target")]
        self.assertEqual([2300, 88, 3, 3], targets)
        results = [score[key] for key in ("spent", "business_value", "open_bugs", "open_tech_debt")]
        self.assertEqual([2000, 48, 8, 0], results)
        self.assertEqual(300, score["remaining_budget"])

    def test_cumulative_budget_and_cost(self) -> None:
        """Test dat de stand per release het totale budget en de uitgaven tot en met die release bevat."""
        releases = self.score(set(), {"scope_extension"}, set(), set())["releases"]
        self.assertEqual([2000, 2300, 2300, 2300], [release["cumulative_budget"] for release in releases])
        self.assertEqual([500, 1000, 1500, 2000], [release["cumulative_cost"] for release in releases])


class ImpromptuDemoTest(unittest.TestCase):
    """Unittests voor de impromptu demo: bij een ontevreden stas huurt het team extra mensen in."""

    DEMO = frozenset({"impromptu_demo"})

    def release_after(self, previous: Release, **current: object) -> dict:
        """Geef de stand van de release na de opgegeven release."""
        score = Score(releases=[previous, Release(**current), Release(), Release()])
        return score.as_dict()["releases"][1]

    def test_demo_in_first_release_fails_on_functionality(self) -> None:
        """Test dat de demo aan het begin van release 1 mislukt, omdat er nog geen businesswaarde is."""
        release = Score(releases=[Release(5, risks=self.DEMO), Release(), Release(), Release()]).as_dict()["releases"][
            0
        ]
        self.assertEqual((1, 0), (release["extra_developers"], release["extra_testers"]))
        self.assertEqual((25, 600), (release["velocity"], release["cost"]))  # 6 ontwikkelaars

    def test_enough_business_value_and_few_bugs(self) -> None:
        """Test dat de stas tevreden is bij genoeg businesswaarde en niet te veel bugs."""
        previous = Release(10, three_point_cards=9, bug_cards=DEMO_MAX_OPEN_BUGS)  # 27 businesswaarde, 4 bugs
        release = self.release_after(previous, developers=5, risks=self.DEMO)
        self.assertEqual((0, 0), (release["extra_developers"], release["extra_testers"]))

    def test_too_many_bugs(self) -> None:
        """Test dat het team een extra tester inhuurt als er aan het begin van de release te veel bugs open staan."""
        previous = Release(10, three_point_cards=9, bug_cards=DEMO_MAX_OPEN_BUGS + 1)
        release = self.release_after(previous, developers=5, testers=1, risks=self.DEMO)
        self.assertEqual((0, 1), (release["extra_developers"], release["extra_testers"]))
        self.assertEqual((2 * 4, 700), (release["bug_fixing_capacity"], release["cost"]))

    def test_too_little_business_value_and_too_many_bugs(self) -> None:
        """Test dat het team een extra ontwikkelaar en een extra tester inhuurt als beide niet goed zijn."""
        previous = Release(10, three_point_cards=8, bug_cards=DEMO_MAX_OPEN_BUGS + 1)  # 24 businesswaarde
        release = self.release_after(previous, developers=5, risks=self.DEMO)
        self.assertEqual((1, 1), (release["extra_developers"], release["extra_testers"]))

    def test_demo_thresholds(self) -> None:
        """Test dat de stas tevreden is vanaf 25 businesswaarde en tot en met 4 open bugs."""
        self.assertEqual((25, 4), (DEMO_MIN_BUSINESS_VALUE, DEMO_MAX_OPEN_BUGS))

    def test_no_demo_no_extra_people(self) -> None:
        """Test dat er zonder demo geen extra mensen bij komen, ook niet als de stand slecht is."""
        release = Score().as_dict()["releases"][0]
        self.assertEqual((0, 0), (release["extra_developers"], release["extra_testers"]))

    def test_eleventh_developer_adds_no_velocity(self) -> None:
        """Test dat een extra ontwikkelaar bovenop 10 wel geld kost maar geen velocity toevoegt."""
        release = Release(10, risks=self.DEMO)
        self.assertEqual((32, 11 * DEVELOPER_COST), (release.velocity, release.cost))

    def test_extra_tester_in_bug_fixing_capacity_changes(self) -> None:
        """Test dat de extra tester door een mislukte demo in de veranderingen van de oploscapaciteit staat."""
        previous = Release(10, three_point_cards=9, bug_cards=DEMO_MAX_OPEN_BUGS + 1)
        release = self.release_after(previous, testers=1, risks=self.DEMO)
        self.assertEqual(
            (8, [{"cause": "impromptu_demo", "change": 4}]),
            (release["bug_fixing_capacity"], release["bug_fixing_capacity_changes"]),
        )

    def test_sixth_tester_solves_bugs(self) -> None:
        """Test dat een extra tester bovenop 5 gewoon bugs oplost."""
        previous = Release(10, three_point_cards=9, bug_cards=DEMO_MAX_OPEN_BUGS + 1)
        release = self.release_after(previous, testers=5, risks=self.DEMO)
        self.assertEqual(6 * 4, release["bug_fixing_capacity"])

    def test_demo_and_developer_resignation_cancel_out(self) -> None:
        """Test dat de extra ontwikkelaar en het ontslag van een ontwikkelaar elkaar voor de velocity opheffen."""
        release = Release(5, risks=frozenset({"impromptu_demo", "developer_resignation"}))
        self.assertEqual((22, 6 * DEVELOPER_COST), (release.velocity, release.cost))

    def test_demo_in_game(self) -> None:
        """Test dat het aanvinken van de demo meteen de velocity en de kosten verandert."""
        game = Game()
        team = game.register_team("De Testers")
        game.start_round()
        game.plan_release("De Testers", 1, developers=4)
        game.plan_release("De Testers", 1, risks=["impromptu_demo"])
        release = team.rounds[0].releases[0]
        self.assertEqual(
            (4, 1, 22, 500), (release.developers, release.extra_developers, release.velocity, release.cost)
        )


class VelocityChangesTest(unittest.TestCase):
    """Unittests voor de risico's die de velocity van een release veranderen."""

    def changes(self, developers: int, *risks: str, previous: Release | None = None) -> list[tuple[str, int]]:
        """Geef de veranderingen van de velocity in een release met de opgegeven ontwikkelaars en risico's."""
        release = Release(developers, risks=frozenset(risks))
        Score(releases=[previous or Release(), release, Release(), Release()])
        return release.velocity_changes

    def test_no_changes(self) -> None:
        """Test dat er zonder risico's geen veranderingen zijn."""
        self.assertEqual([], self.changes(5))

    def test_risks_that_change_velocity(self) -> None:
        """Test dat elk risico dat de velocity verandert zijn verandering geeft, in de volgorde van RISKS."""
        changes = self.changes(
            5, "major_update", "data_loss", "developer_resignation", "impromptu_demo", "external_audit"
        )
        demo = VELOCITY[6] - VELOCITY[5]
        resignation = VELOCITY[5] - VELOCITY[6]
        self.assertEqual(
            [
                ("data_loss", -3),
                ("developer_resignation", resignation),
                ("major_update", -3),
                ("impromptu_demo", demo),
                ("external_audit", -3),
            ],
            changes,
        )

    def test_changes_add_up_to_velocity(self) -> None:
        """Test dat de velocity de velocity van de ontwikkelaars plus de veranderingen is."""
        release = Release(5, risks=frozenset({"major_update", "developer_resignation"}))
        self.assertEqual(VELOCITY[5] + sum(change for _, change in release.velocity_changes), release.velocity)

    def test_no_change_without_effect(self) -> None:
        """Test dat een risico dat de velocity niet verandert, niet in de veranderingen staat.

        Met 10 ontwikkelaars voegt de extra ontwikkelaar van de demo niets toe, en na het ontslag zijn er nog 10.
        """
        self.assertEqual([], self.changes(10, "impromptu_demo", "developer_resignation"))
        self.assertEqual(32, Release(10, risks=frozenset({"impromptu_demo", "developer_resignation"})).velocity)

    def test_satisfied_stakeholders_no_change(self) -> None:
        """Test dat een geslaagde demo de velocity niet verandert."""
        previous = Release(10, three_point_cards=9)  # 27 businesswaarde
        self.assertEqual([], self.changes(5, "impromptu_demo", previous=previous))

    def test_velocity_changes_per_release(self) -> None:
        """Test dat de stand per release de veranderingen van de velocity bevat."""
        score = Score(releases=[Release(5, risks=frozenset({"data_loss"})), Release(), Release(), Release()])
        self.assertEqual([{"cause": "data_loss", "change": -3}], score.as_dict()["releases"][0]["velocity_changes"])

    def test_no_test_capacity_lowers_velocity(self) -> None:
        """Test dat geen testcapaciteit de velocity van de release met 3 verlaagt."""
        self.assertEqual([("no_test_capacity", -3)], self.changes(5, "no_test_capacity"))

    def test_operations_cannot_keep_up_lowers_velocity(self) -> None:
        """Test dat een beheerpartij die niet kan meekomen de velocity van de release met 3 verlaagt."""
        self.assertEqual([("operations_cannot_keep_up", -3)], self.changes(5, "operations_cannot_keep_up"))
        self.assertEqual(22 - 3, Release(5, risks=frozenset({"operations_cannot_keep_up"})).velocity)

    def test_no_time_at_client_halves_velocity(self) -> None:
        """Test dat geen tijd bij de opdrachtgever de velocity halveert, naar boven afgerond."""
        self.assertEqual(
            (11, 7),
            (
                Release(5, risks=frozenset({"no_time_at_client"})).velocity,
                Release(3, risks=frozenset({"no_time_at_client"})).velocity,
            ),
        )
        self.assertEqual([("no_time_at_client", -11)], self.changes(5, "no_time_at_client"))

    def test_no_time_at_client_after_other_changes(self) -> None:
        """Test dat de velocity wordt gehalveerd nadat de andere risico's zijn verwerkt."""
        release = Release(5, risks=frozenset({"no_time_at_client", "major_update"}))
        self.assertEqual(
            (10, [("major_update", -3), ("no_time_at_client", -9)]), (release.velocity, release.velocity_changes)
        )

    def test_no_time_at_client_without_velocity(self) -> None:
        """Test dat halveren van een velocity van 0 niets meer afhaalt."""
        release = Release(1, risks=frozenset({"no_time_at_client", "major_update", "data_loss"}))
        self.assertEqual((0, [("data_loss", -3), ("major_update", -3)]), (release.velocity, release.velocity_changes))


class RolesTest(unittest.TestCase):
    """Unittests voor de rollen die een team vanaf ronde 2 kan inzetten."""

    def setUp(self) -> None:
        """Start een spel met één team."""
        self.game = Game()
        self.team = self.game.register_team("De Testers")
        self.game.start_round()

    def start_round_two(self) -> None:
        """Speel ronde 1 en start ronde 2."""
        self.game.finish_round()
        self.game.start_round()

    def roles(self) -> list[str]:
        """Geef de rollen die het team in de huidige release inzet."""
        return self.team.rounds[-1].as_dict()["releases"][0]["roles"]

    def test_four_roles(self) -> None:
        """Test dat er vier rollen zijn."""
        self.assertEqual(["architect", "quality_manager", "software_delivery_manager", "product_owner"], list(ROLES))

    def test_no_roles_in_round_one(self) -> None:
        """Test dat een team in ronde 1 geen rollen kan inzetten."""
        with self.assertRaisesRegex(GameError, "Rollen kunnen pas vanaf ronde 2 worden ingezet."):
            self.game.plan_release("De Testers", 1, roles=["architect"])
        self.game.plan_release("De Testers", 1, roles=[])
        self.assertEqual([], self.roles())

    def test_roles_in_round_two(self) -> None:
        """Test dat een team in ronde 2 rollen kan inzetten en weer kan uitzetten, in de volgorde van ROLES."""
        self.start_round_two()
        self.game.plan_release("De Testers", 1, roles=["product_owner", "architect"])
        self.assertEqual(["architect", "product_owner"], self.roles())
        self.game.plan_release("De Testers", 1, roles=["product_owner"])
        self.assertEqual(["product_owner"], self.roles())

    def test_unknown_role(self) -> None:
        """Test dat alleen bekende rollen kunnen worden ingezet."""
        self.start_round_two()
        with self.assertRaisesRegex(GameError, "Onbekende rollen: tester"):
            self.game.plan_release("De Testers", 1, roles=["tester"])

    def test_roles_cost(self) -> None:
        """Test dat elke ingezette rol ROLE_COST per release kost."""
        self.start_round_two()
        self.game.plan_release("De Testers", 1, developers=2, roles=["architect", "product_owner"])
        release = self.team.rounds[-1].as_dict()["releases"][0]
        self.assertEqual((30, 2 * 100 + 2 * 30), (ROLE_COST, release["cost"]))
        self.assertEqual(2000 - 260, self.team.rounds[-1].as_dict()["releases"][1]["budget"])

    def test_architect_raises_velocity(self) -> None:
        """Test dat een architect de velocity van de release met 2 verhoogt."""
        release = Release(5, roles=frozenset({"architect"}))
        self.assertEqual((24, [("architect", 2)]), (release.velocity, release.velocity_changes))

    def test_software_delivery_manager_raises_velocity(self) -> None:
        """Test dat een software delivery manager de velocity met 2 verhoogt, ook samen met een architect."""
        release = Release(5, roles=frozenset({"software_delivery_manager", "architect"}))
        changes = [("architect", 2), ("software_delivery_manager", 2)]
        self.assertEqual((26, changes), (release.velocity, release.velocity_changes))

    def test_other_roles_keep_velocity(self) -> None:
        """Test dat de andere rollen de velocity niet veranderen."""
        self.assertEqual([], Release(5, roles=frozenset({"quality_manager", "product_owner"})).velocity_changes)

    def test_architect_before_halving(self) -> None:
        """Test dat de architect meetelt voordat geen tijd bij de opdrachtgever de velocity halveert, en dat het
        halveren als laatste in de veranderingen staat."""
        release = Release(5, risks=frozenset({"no_time_at_client", "major_update"}), roles=frozenset({"architect"}))
        changes = [("major_update", -3), ("architect", 2), ("no_time_at_client", -10)]
        self.assertEqual((11, changes), (release.velocity, release.velocity_changes))

    def test_quality_manager_solves_tech_debt(self) -> None:
        """Test dat een kwaliteitsmanager 4 extra technische schuld per release kan oplossen."""
        release = Release(5, tech_debt=4, roles=frozenset({"quality_manager"}))
        self.assertEqual(
            (2 + 4, [("quality_manager", 4)]), (release.tech_debt_capacity, release.tech_debt_capacity_changes)
        )

    def test_quality_manager_solves_at_most_open_tech_debt(self) -> None:
        """Test dat de kwaliteitsmanager niet meer technische schuld oplost dan er openstaat."""
        score = Score(
            releases=[
                Release(5, tech_debt_cards=3),
                Release(roles=frozenset({"quality_manager"})),
                Release(),
                Release(),
            ]
        )
        self.assertEqual([3, 0, 0, 0], [release["cumulative_tech_debt"] for release in score.as_dict()["releases"]])

    def test_tech_debt_capacity_changes_per_release(self) -> None:
        """Test dat de stand per release de rollen bevat die extra technische schuld oplossen."""
        score = Score(releases=[Release(roles=frozenset({"quality_manager"})), Release(), Release(), Release()])
        releases = score.as_dict()["releases"]
        self.assertEqual([{"cause": "quality_manager", "change": 4}], releases[0]["tech_debt_capacity_changes"])
        self.assertEqual([], releases[1]["tech_debt_capacity_changes"])


class RoleProtectionsTest(unittest.TestCase):
    """Unittests voor de rollen die tegen een risico beschermen."""

    def setUp(self) -> None:
        """Start ronde 2 voor één team."""
        self.game = Game()
        self.team = self.game.register_team("De Testers")
        self.game.start_round()
        self.game.finish_round()
        self.game.start_round()

    def plan(self, **changes: object) -> dict:
        """Plan de eerste release en geef de stand van die release."""
        self.game.plan_release("De Testers", 1, **changes)
        return self.team.rounds[-1].as_dict()["releases"][0]

    def test_each_role_protects_against_a_risk(self) -> None:
        """Test dat elke rol tegen een risico beschermt."""
        expected = {
            "architect": "target_architecture_changes",
            "quality_manager": "external_audit",
            "software_delivery_manager": "developer_resignation",
            "product_owner": "no_time_at_client",
        }
        self.assertEqual(expected, ROLE_PROTECTIONS)

    def test_protected_risks_per_release(self) -> None:
        """Test dat de stand per release de beschermde risico's bevat, met de rol die beschermt."""
        release = self.plan(roles=["product_owner", "architect"])
        self.assertEqual(
            {
                "target_architecture_changes": "architect",
                "no_time_at_client": "product_owner",
                "data_loss": "no_software_ready",
            },
            release["protected_risks"],
        )

    def test_protected_risk_cannot_occur(self) -> None:
        """Test dat een risico waartegen een ingezette rol beschermt, niet kan worden aangevinkt."""
        self.plan(roles=["architect"])
        with self.assertRaisesRegex(
            GameError, "🏛️ Doelarchitectuur wijzigt kan niet optreden: 👨🏻‍💼 Architect beschermt"
        ):
            self.plan(risks=["scope_extension", "target_architecture_changes"])
        self.assertEqual([], self.plan()["risks"])

    def test_protected_risk_in_same_plan(self) -> None:
        """Test dat een rol en het risico waartegen die beschermt niet tegelijk kunnen worden opgegeven."""
        with self.assertRaisesRegex(GameError, "⏳ Geen tijd bij opdrachtgever kan niet optreden"):
            self.plan(roles=["product_owner"], risks=["no_time_at_client"])

    def test_role_removes_protected_risk(self) -> None:
        """Test dat het inzetten van een rol het risico waartegen die beschermt laat vervallen."""
        self.plan(risks=["external_audit", "scope_extension"])
        self.assertEqual(["scope_extension"], self.plan(roles=["quality_manager"])["risks"])

    def test_unprotected_risk_can_occur(self) -> None:
        """Test dat andere risico's gewoon kunnen optreden als een rol is ingezet."""
        self.assertEqual(
            ["developer_resignation"], self.plan(roles=["architect"], risks=["developer_resignation"])["risks"]
        )


class MeasuresTest(unittest.TestCase):
    """Unittests voor de maatregelen die een team vanaf ronde 2 kan nemen."""

    def setUp(self) -> None:
        """Start een spel met één team."""
        self.game = Game()
        self.team = self.game.register_team("De Testers")
        self.game.start_round()

    def start_round_two(self) -> None:
        """Speel ronde 1 en start ronde 2."""
        self.game.finish_round()
        self.game.start_round()

    def plan(self, release_number: int = 1, **changes: object) -> dict:
        """Plan een release en geef de stand van die release."""
        self.game.plan_release("De Testers", release_number, **changes)
        return self.team.rounds[-1].as_dict()["releases"][release_number - 1]

    def finish_release(self) -> None:
        """Rond de huidige release af."""
        self.game.finish_release("De Testers")

    def test_six_measures(self) -> None:
        """Test dat er zes maatregelen zijn, te beginnen met de voorfase."""
        self.assertEqual(6, len(MEASURES))
        self.assertEqual("📐 Voorfase", MEASURES["preliminary_phase"])

    def test_no_measures_in_round_one(self) -> None:
        """Test dat een team in ronde 1 geen maatregelen kan nemen."""
        with self.assertRaisesRegex(GameError, "Maatregelen kunnen pas vanaf ronde 2 worden genomen."):
            self.plan(measures=["security_test"])
        self.assertEqual([], self.plan(measures=[])["measures"])

    def test_measures_in_round_two(self) -> None:
        """Test dat een team in ronde 2 maatregelen kan nemen, in de volgorde van MEASURES."""
        self.start_round_two()
        self.assertEqual(
            ["security_test", "risk_management"],
            self.plan(measures=["risk_management", "security_test"])["measures"],
        )

    def test_unknown_measure(self) -> None:
        """Test dat alleen bekende maatregelen kunnen worden genomen."""
        self.start_round_two()
        with self.assertRaisesRegex(GameError, "Onbekende maatregelen: pair_programming"):
            self.plan(measures=["pair_programming"])

    def test_preliminary_phase_only_in_first_release(self) -> None:
        """Test dat de voorfase alleen in de eerste release kan worden gekozen."""
        self.start_round_two()
        self.finish_release()
        with self.assertRaisesRegex(GameError, "De voorfase kan alleen in de eerste release worden gekozen."):
            self.plan(2, measures=["preliminary_phase"])

    def test_preliminary_phase_without_other_measures(self) -> None:
        """Test dat met de voorfase in de eerste release geen andere maatregelen kunnen worden genomen."""
        self.start_round_two()
        with self.assertRaisesRegex(GameError, "Met de voorfase kunnen in de eerste release geen andere maatregelen"):
            self.plan(measures=["preliminary_phase", "security_test"])

    def test_available_measures(self) -> None:
        """Test welke maatregelen het team in een release kan nemen."""
        self.start_round_two()
        # Zonder kwaliteitsmanager en testers zijn kwaliteitsmonitoring en de automatische regressietest niet beschikbaar.
        without_prerequisites = [m for m in MEASURES if m not in ("quality_monitoring", "automated_regression_test")]
        all_but_preliminary_phase = [measure for measure in without_prerequisites if measure != "preliminary_phase"]
        self.assertEqual(without_prerequisites, self.plan()["available_measures"])
        self.assertEqual(["preliminary_phase"], self.plan(measures=["preliminary_phase"])["available_measures"])
        self.assertEqual(all_but_preliminary_phase, self.plan(measures=["security_test"])["available_measures"])
        self.assertEqual(all_but_preliminary_phase, self.team.rounds[-1].as_dict()["releases"][1]["available_measures"])

    def test_no_risks_in_first_release_with_preliminary_phase(self) -> None:
        """Test dat met de voorfase in de eerste release geen risico's kunnen optreden."""
        self.start_round_two()
        self.plan(risks=["release_not_accepted", "scope_extension"])
        release = self.plan(measures=["preliminary_phase"])
        self.assertEqual([], release["risks"])
        self.assertEqual(dict.fromkeys(RISKS, "preliminary_phase"), release["protected_risks"])
        with self.assertRaisesRegex(
            GameError, "🔥 Dataloss in productie kan niet optreden: 📐 Voorfase beschermt ertegen."
        ):
            self.plan(risks=["data_loss"])

    def test_release_accepted_after_preliminary_phase(self) -> None:
        """Test dat na de voorfase een release in de rest van de ronde niet meer kan worden afgekeurd."""
        self.start_round_two()
        self.plan(measures=["preliminary_phase"])
        self.finish_release()
        release = self.plan(2, risks=["scope_extension"])
        expected = {"release_not_accepted": "preliminary_phase", "data_loss": "no_software_ready"}
        self.assertEqual(expected, release["protected_risks"])
        with self.assertRaisesRegex(GameError, "👎 Release niet geaccepteerd kan niet optreden: 📐 Voorfase"):
            self.plan(2, risks=["release_not_accepted"])

    def test_release_can_be_rejected_without_preliminary_phase(self) -> None:
        """Test dat een release zonder voorfase gewoon kan worden afgekeurd."""
        self.start_round_two()
        self.finish_release()
        self.assertEqual(["release_not_accepted"], self.plan(2, risks=["release_not_accepted"])["risks"])

    def test_measure_costs(self) -> None:
        """Test dat de maatregelen geld kosten in de release waarin het team ze neemt."""
        self.assertEqual(
            {
                "preliminary_phase": 250,
                "security_test": 60,
                "maintainability_check": 60,
                "automated_regression_test": 0,
                "risk_management": 30,
                "quality_monitoring": 0,
            },
            MEASURE_COSTS,
        )
        self.start_round_two()
        self.assertEqual(250, self.plan(measures=["preliminary_phase"])["cost"])
        self.assertEqual(
            100 + 30 + 60 + 30 + 0,
            self.plan(
                testers=1,
                roles=["quality_manager"],
                measures=["security_test", "risk_management", "quality_monitoring"],
            )["cost"],
        )

    def test_no_people_during_preliminary_phase(self) -> None:
        """Test dat het team tijdens de voorfase geen mensen inhuurt: de voorfase heeft een eigen team."""
        self.start_round_two()
        self.plan(developers=5, testers=2, roles=["architect"], one_point_cards=10)
        release = self.plan(measures=["preliminary_phase"])
        people = [release[key] for key in ("developers", "testers", "roles", "velocity", "open_cards", "cost")]
        self.assertEqual([0, 0, [], 0, 0, 250], people)
        self.assertEqual((True, 0), (release["team_locked"], release["one_point_cards"]))

    def test_no_hiring_during_preliminary_phase(self) -> None:
        """Test dat het team tijdens de voorfase geen ontwikkelaars, testers of rollen kan inzetten."""
        self.start_round_two()
        self.plan(measures=["preliminary_phase"])
        for changes in ({"developers": 1}, {"testers": 1}, {"roles": ["product_owner"]}):
            with (
                self.subTest(changes=changes),
                self.assertRaisesRegex(GameError, "De voorfase is inclusief een voorfaseteam"),
            ):
                self.plan(**changes)
        self.assertEqual(0, self.plan(developers=0, testers=0, roles=[])["developers"])

    def test_release_can_be_finished_after_preliminary_phase(self) -> None:
        """Test dat het team de release met de voorfase meteen kan afronden, want er zijn geen kaartjes."""
        self.start_round_two()
        self.plan(measures=["preliminary_phase"])
        self.finish_release()
        self.assertEqual(1, self.team.rounds[-1].completed_releases)

    def test_hiring_again_without_preliminary_phase(self) -> None:
        """Test dat het team weer mensen kan inhuren als de voorfase niet meer is gekozen."""
        self.start_round_two()
        self.plan(measures=["preliminary_phase"])
        release = self.plan(measures=[], developers=3)
        self.assertEqual((False, 3), (release["team_locked"], release["developers"]))

    def test_quality_monitoring_needs_quality_manager(self) -> None:
        """Test dat kwaliteitsmonitoring alleen kan met een kwaliteitsmanager."""
        self.start_round_two()
        self.assertNotIn("quality_monitoring", self.plan()["available_measures"])
        with self.assertRaisesRegex(GameError, "⭐️ Kwaliteitsmonitoring kan alleen met een 🕵🏻‍♀️ Kwaliteitsmanager."):
            self.plan(measures=["quality_monitoring"])
        release = self.plan(roles=["quality_manager"], measures=["quality_monitoring"])
        self.assertEqual(["quality_monitoring"], release["measures"])
        self.assertIn("quality_monitoring", release["available_measures"])

    def test_quality_monitoring_lapses_without_quality_manager(self) -> None:
        """Test dat kwaliteitsmonitoring vervalt als het team de kwaliteitsmanager niet meer inzet."""
        self.start_round_two()
        self.plan(roles=["quality_manager"], measures=["quality_monitoring", "security_test"])
        self.assertEqual(["security_test"], self.plan(roles=[])["measures"])

    def test_regression_test_needs_a_tester(self) -> None:
        """Test dat een automatische regressietest alleen kan met minimaal 1 tester."""
        self.start_round_two()
        self.assertNotIn("automated_regression_test", self.plan()["available_measures"])
        with self.assertRaisesRegex(GameError, "⚙️ Automatische regressietest kan alleen met minimaal 1 tester."):
            self.plan(measures=["automated_regression_test"])
        self.assertEqual(
            ["automated_regression_test"], self.plan(testers=1, measures=["automated_regression_test"])["measures"]
        )

    def test_regression_test_lapses_without_testers(self) -> None:
        """Test dat een automatische regressietest vervalt als het team geen testers meer inzet."""
        self.start_round_two()
        self.plan(testers=1, measures=["automated_regression_test"])
        self.assertEqual([], self.plan(testers=0)["measures"])

    def test_extra_tester_counts_for_regression_test(self) -> None:
        """Test dat een extra tester door een mislukte impromptu demo meetelt voor de automatische regressietest."""
        release = Release(risks=frozenset({"impromptu_demo"}), start_open_bugs=5)
        self.assertNotIn("automated_regression_test", release.unmet_measures)

    def test_reasons_why_measures_are_unavailable(self) -> None:
        """Test dat de stand per release vermeldt waarom het team een maatregel niet kan nemen."""
        self.start_round_two()
        self.assertEqual(
            {
                "automated_regression_test": "Alleen met minimaal 1 tester",
                "quality_monitoring": "Alleen met een 🕵🏻‍♀️ Kwaliteitsmanager",
            },
            self.plan()["unavailable_measures"],
        )
        with_preliminary_phase = self.plan(measures=["preliminary_phase"])["unavailable_measures"]
        self.assertEqual(dict.fromkeys(list(MEASURES)[1:], "Niet samen met de 📐 Voorfase"), with_preliminary_phase)
        with_other_measure = self.plan(measures=["security_test"])["unavailable_measures"]
        self.assertEqual("Niet samen met andere maatregelen", with_other_measure["preliminary_phase"])
        later_release = self.team.rounds[-1].as_dict()["releases"][1]["unavailable_measures"]
        self.assertEqual("Alleen in de eerste release", later_release["preliminary_phase"])


class MeasureEffectsTest(unittest.TestCase):
    """Unittests voor de effecten van de maatregelen."""

    def release(
        self, developers: int = 5, testers: int = 0, roles: set[str] = frozenset(), **kwargs: object
    ) -> Release:
        """Geef een release met de opgegeven maatregelen."""
        return Release(developers, testers, roles=frozenset(roles), **kwargs)

    def test_preliminary_phase_lowers_business_value_target(self) -> None:
        """Test dat de voorfase het target voor businesswaarde vanaf de eerste release met 25% verlaagt."""
        releases = Score(
            releases=[self.release(measures=frozenset({"preliminary_phase"})), Release(), Release(), Release()]
        ).as_dict()["releases"]
        self.assertEqual([60, 60, 60, 60], [release["business_value_target"] for release in releases])
        self.assertEqual([{"cause": "preliminary_phase", "change": -20}], releases[0]["business_value_target_changes"])
        self.assertEqual([], releases[1]["business_value_target_changes"])

    def test_measures_cost_velocity(self) -> None:
        """Test dat securitytest, onderhoudbaarheidstoets, automatische regressietest en kwaliteitsmonitoring elk 1
        velocity kosten, en risicomanagement niet."""
        measures = {
            "security_test",
            "maintainability_check",
            "automated_regression_test",
            "quality_monitoring",
            "risk_management",
        }
        release = self.release(measures=frozenset(measures))
        expected = [
            ("security_test", -1),
            ("maintainability_check", -1),
            ("automated_regression_test", -1),
            ("quality_monitoring", -1),
        ]
        self.assertEqual((22 - 4, expected), (release.velocity, release.velocity_changes))

    def test_measures_before_halving(self) -> None:
        """Test dat de maatregelen de velocity veranderen voordat geen tijd bij de opdrachtgever die halveert."""
        release = self.release(measures=frozenset({"security_test"}), risks=frozenset({"no_time_at_client"}))
        self.assertEqual([("security_test", -1), ("no_time_at_client", -10)], release.velocity_changes)

    def test_measures_protect_against_risks(self) -> None:
        """Test dat securitytest, onderhoudbaarheidstoets en automatische regressietest tegen een risico beschermen."""
        release = self.release(
            measures=frozenset({"security_test", "maintainability_check", "automated_regression_test"})
        )
        expected = {
            "data_loss": "security_test",
            "major_update": "maintainability_check",
            "no_test_capacity": "automated_regression_test",
        }
        self.assertEqual(expected, release.protected_risks)

    def test_maintainability_check_solves_tech_debt(self) -> None:
        """Test dat de onderhoudbaarheidstoets 3 extra technische schuld oplost."""
        release = self.release(measures=frozenset({"maintainability_check"}), tech_debt=2)
        self.assertEqual(
            (1 + 3, [("maintainability_check", 3)]), (release.tech_debt_capacity, release.tech_debt_capacity_changes)
        )

    def test_quality_monitoring_with_quality_manager(self) -> None:
        """Test dat de kwaliteitsmanager met kwaliteitsmonitoring 5 in plaats van 4 technische schuld oplost."""
        release = self.release(roles={"quality_manager"}, measures=frozenset({"quality_monitoring"}))
        self.assertEqual(
            (5, [("quality_manager", 4), ("quality_monitoring", 1)]),
            (release.tech_debt_capacity, release.tech_debt_capacity_changes),
        )

    def test_quality_monitoring_without_quality_manager(self) -> None:
        """Test dat kwaliteitsmonitoring zonder kwaliteitsmanager geen extra technische schuld oplost."""
        self.assertEqual(0, self.release(measures=frozenset({"quality_monitoring"})).tech_debt_capacity)

    def test_regression_test_testers_find_more_bugs(self) -> None:
        """Test dat elke tester met een automatische regressietest 5 in plaats van 4 bugs oplost."""
        release = self.release(testers=2, measures=frozenset({"automated_regression_test"}))
        self.assertEqual(
            (10, [("automated_regression_test", 2)]), (release.bug_fixing_capacity, release.bug_fixing_capacity_changes)
        )

    def test_security_test_solves_bugs(self) -> None:
        """Test dat de securitytest 3 extra bugs oplost, in de volgorde van MEASURES samen met de regressietest."""
        release = self.release(testers=1, measures=frozenset({"automated_regression_test", "security_test"}))
        changes = [("security_test", 3), ("automated_regression_test", 1)]
        self.assertEqual((4 + 1 + 3, changes), (release.bug_fixing_capacity, release.bug_fixing_capacity_changes))

    def test_security_test_solves_at_most_open_bugs(self) -> None:
        """Test dat de securitytest niet meer bugs oplost dan er openstaan."""
        releases = [Release(5, bug_cards=2), Release(measures=frozenset({"security_test"})), Release(), Release()]
        self.assertEqual(
            [2, 0, 0, 0], [release["cumulative_bugs"] for release in Score(releases=releases).as_dict()["releases"]]
        )

    def test_regression_test_without_testers(self) -> None:
        """Test dat een automatische regressietest zonder testers geen extra bugs oplost."""
        release = self.release(measures=frozenset({"automated_regression_test"}))
        self.assertEqual((0, []), (release.bug_fixing_capacity, release.bug_fixing_capacity_changes))

    def test_capacity_changes_per_release(self) -> None:
        """Test dat de stand per release de veranderingen van de oploscapaciteit voor bugs bevat."""
        score = Score(
            releases=[
                self.release(testers=1, measures=frozenset({"automated_regression_test"})),
                Release(),
                Release(),
                Release(),
            ]
        )
        self.assertEqual(
            [{"cause": "automated_regression_test", "change": 1}],
            score.as_dict()["releases"][0]["bug_fixing_capacity_changes"],
        )


class StepsTest(unittest.TestCase):
    """Unittests voor de stappen waarin een team een release doorloopt."""

    def setUp(self) -> None:
        """Maak een spel met een team aan en start de eerste ronde."""
        self.game = Game()
        self.team = self.game.register_team("De Testers")
        self.game.start_round()

    def release(self, index: int = 0) -> dict:
        """Geef een release van het team in de huidige ronde als dictionary."""
        return self.team.rounds[-1].as_dict()["releases"][index]

    def start_second_round(self) -> None:
        """Rond de eerste ronde af en start de tweede."""
        self.game.finish_round()
        self.game.start_round()

    def test_first_step(self) -> None:
        """Test dat een release begint met het samenstellen van het team."""
        self.assertEqual("team", self.release()["step"])

    def test_steps_in_first_round(self) -> None:
        """Test dat er in de eerste ronde geen stap voor de maatregelen is."""
        self.assertEqual(["team", "risks", "velocity", "cards"], self.release()["steps"])

    def test_steps_in_second_round(self) -> None:
        """Test dat er vanaf de tweede ronde een stap voor de maatregelen is."""
        self.start_second_round()
        self.assertEqual(list(STEPS), self.release()["steps"])

    def test_next_steps(self) -> None:
        """Test dat het team de stappen een voor een doorloopt, tot en met de laatste."""
        for step in ("risks", "velocity", "cards"):
            self.game.next_step("De Testers")
            self.assertEqual(step, self.release()["step"])
        with self.assertRaisesRegex(GameError, "Dit is de laatste stap van de release; rond de release af."):
            self.game.next_step("De Testers")

    def test_previous_step(self) -> None:
        """Test dat het team terug kan naar de vorige stap, maar niet verder terug dan de eerste."""
        self.game.next_step("De Testers")
        self.game.previous_step("De Testers")
        self.assertEqual("team", self.release()["step"])
        with self.assertRaisesRegex(GameError, "Dit is de eerste stap van de release."):
            self.game.previous_step("De Testers")

    def test_next_release_starts_with_first_step(self) -> None:
        """Test dat het team elke release weer bij de eerste stap begint."""
        for _ in range(3):
            self.game.next_step("De Testers")
        self.game.finish_release("De Testers")
        self.assertEqual("team", self.release(1)["step"])

    def test_preliminary_phase(self) -> None:
        """Test dat in de voorfase alleen de stappen voor de maatregelen en het opleveren overblijven."""
        self.start_second_round()
        self.game.next_step("De Testers")
        self.game.plan_release("De Testers", 1, measures=["preliminary_phase"])
        self.assertEqual(["measures", "cards"], self.release()["steps"])
        with self.assertRaisesRegex(GameError, "Dit is de eerste stap van de release."):
            self.game.previous_step("De Testers")
        self.game.next_step("De Testers")
        self.assertEqual("cards", self.release()["step"])

    def test_all_releases_finished(self) -> None:
        """Test dat er geen stappen meer zijn als alle releases zijn afgerond."""
        for _ in range(RELEASES_PER_ROUND):
            self.game.finish_release("De Testers")
        with self.assertRaisesRegex(GameError, "Alle releases van deze ronde zijn al afgerond."):
            self.game.next_step("De Testers")
