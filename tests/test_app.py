"""Unittests voor de webapplicatie."""

import re
import unittest

from fastapi.testclient import TestClient

from kwaliteitsaanpakspel.app import create_app
from kwaliteitsaanpakspel.game import MEASURES, RISKS, ROLES, STEPS, Game

JOIN_URL = "http://192.168.1.23:8765"


class AppTestCase(unittest.TestCase):
    """Basisklasse voor de unittests van de webapplicatie."""

    def setUp(self) -> None:
        """Maak de applicatie aan."""
        self.game = Game()
        self.app = create_app(JOIN_URL, self.game)

    def client(self, host: str = "192.168.1.42", headers: dict[str, str] | None = None) -> TestClient:
        """Geef een testclient die zich voordoet als een browser op het opgegeven adres. De browser op de laptop van de
        spelleider gebruikt localhost als adres."""
        base_url = "http://localhost:8765" if host in ("127.0.0.1", "::1") else JOIN_URL
        return TestClient(self.app, client=(host, 50000), base_url=base_url, headers=headers)

    def register(self, name: str = "De Testers") -> TestClient:
        """Meld een team aan en geef een testclient die het token van het team meestuurt."""
        token = self.client().post("/api/teams", json={"name": name}).json()["token"]
        return self.client(headers={"X-Team-Token": token})


class IndexTest(AppTestCase):
    """Unittests voor de startpagina."""

    def test_host_page_on_localhost(self) -> None:
        """Test dat de host-laptop de spelleiderpagina met het aanmeldadres ziet."""
        for host in ("127.0.0.1", "::1"):
            with self.subTest(host=host):
                response = self.client(host).get("/")
                self.assertIn(f'open <a href="{JOIN_URL}" target="_blank">{JOIN_URL}</a> in je browser', response.text)

    def test_team_page_on_other_laptops(self) -> None:
        """Test dat andere laptops de aanmeldpagina voor teams zien."""
        response = self.client().get("/")
        self.assertIn("Naam van je team", response.text)
        self.assertNotIn(JOIN_URL, response.text)

    def test_default_game(self) -> None:
        """Test dat de applicatie zelf een spel aanmaakt als er geen is meegegeven."""
        client = TestClient(create_app(JOIN_URL))
        self.assertEqual([], client.get("/api/teams").json())


class TeamsTest(AppTestCase):
    """Unittests voor de teams-API."""

    def test_no_teams(self) -> None:
        """Test dat er nog geen teams zijn."""
        self.assertEqual([], self.client().get("/api/teams").json())

    def test_register_team(self) -> None:
        """Test dat een team zich kan aanmelden."""
        client = self.client()
        response = client.post("/api/teams", json={"name": "De Testers"})
        self.assertEqual(201, response.status_code)
        team = response.json()
        self.assertEqual("De Testers", team.pop("name"))
        # Het token krijgt alleen het team zelf, bij het aanmelden; het staat niet in de lijst met teams.
        self.assertEqual(22, len(team.pop("token")))
        self.assertEqual([{"name": "De Testers", "rounds": []}], client.get("/api/teams").json())

    def test_register_team_twice(self) -> None:
        """Test dat een teamnaam maar één keer kan worden gebruikt."""
        client = self.client()
        client.post("/api/teams", json={"name": "De Testers"})
        response = client.post("/api/teams", json={"name": "De Testers"})
        self.assertEqual(409, response.status_code)
        self.assertEqual("Er is al een team met de naam 'De Testers'.", response.json()["detail"])


def game_state(round_number: int | None = None, round_finished: bool = False, finished: bool = False) -> dict:
    """Geef de verwachte stand van het spel."""
    return {
        "round": round_number,
        "last_round": 2,
        "max_developers": 10,
        "max_testers": 5,
        "risks": [{"key": key, "label": label} for key, label in RISKS.items()],
        "roles": [{"key": key, "label": label} for key, label in ROLES.items()],
        "roles_from_round": 2,
        "measures": [{"key": key, "label": label} for key, label in MEASURES.items()],
        "measures_from_round": 2,
        "protection_reasons": {"no_software_ready": "nog geen software gereed"},
        "steps": [{"key": key, "label": label} for key, label in STEPS.items()],
        "round_finished": round_finished,
        "finished": finished,
    }


class GameStateTest(AppTestCase):
    """Unittests voor de spel-API."""

    def setUp(self) -> None:
        """Maak een spelleider aan."""
        super().setUp()
        self.host = self.client("127.0.0.1")

    def register_team(self) -> None:
        """Meld een team aan."""
        self.client().post("/api/teams", json={"name": "De Testers"})

    def test_not_started(self) -> None:
        """Test dat er nog geen ronde is voordat het spel is gestart."""
        self.assertEqual(game_state(), self.client().get("/api/game").json())

    def test_start_first_round(self) -> None:
        """Test dat de spelleider ronde 1 kan starten als er een team is aangemeld."""
        self.register_team()
        response = self.host.post("/api/game/start-round")
        self.assertEqual(200, response.status_code)
        self.assertEqual(game_state(1), response.json())
        self.assertEqual(game_state(1), self.client().get("/api/game").json())
        [team] = self.client().get("/api/teams").json()
        self.assertEqual(2000, team["rounds"][0]["remaining_budget"])

    def test_start_without_teams(self) -> None:
        """Test dat het spel niet kan starten zonder teams."""
        response = self.host.post("/api/game/start-round")
        self.assertEqual(409, response.status_code)
        self.assertEqual("Er moet minimaal één team zijn aangemeld.", response.json()["detail"])

    def test_finish_round(self) -> None:
        """Test dat de spelleider ronde 1 kan stoppen."""
        self.register_team()
        self.host.post("/api/game/start-round")
        response = self.host.post("/api/game/finish-round")
        self.assertEqual(game_state(1, round_finished=True), response.json())

    def test_finish_round_before_start(self) -> None:
        """Test dat er geen ronde te stoppen is voordat het spel is gestart."""
        response = self.host.post("/api/game/finish-round")
        self.assertEqual(409, response.status_code)
        self.assertEqual("Het spel is nog niet gestart.", response.json()["detail"])

    def test_play_all_rounds(self) -> None:
        """Test dat het spel is afgelopen als de spelleider ronde 2 stopt."""
        self.register_team()
        for _ in range(2):
            self.host.post("/api/game/start-round")
            response = self.host.post("/api/game/finish-round")
        self.assertEqual(game_state(2, round_finished=True, finished=True), response.json())
        self.assertEqual(2, len(self.client().get("/api/teams").json()[0]["rounds"]))

    def test_only_host_controls_game(self) -> None:
        """Test dat teams het spel niet kunnen besturen."""
        self.register_team()
        for action in ("start-round", "finish-round"):
            with self.subTest(action=action):
                response = self.client().post(f"/api/game/{action}")
                self.assertEqual(403, response.status_code)
                self.assertEqual("Alleen de spelleider kan het spel besturen.", response.json()["detail"])
        self.assertFalse(self.game.started)


class HireDevelopersTest(AppTestCase):
    """Unittests voor het inhuren van ontwikkelaars."""

    def setUp(self) -> None:
        """Meld een team aan en start de eerste ronde."""
        super().setUp()
        self.team = self.register()
        self.client("127.0.0.1").post("/api/game/start-round")

    def test_hire_developers(self) -> None:
        """Test dat een team ontwikkelaars kan inhuren en de nieuwe stand terugkrijgt."""
        response = self.team.put("/api/teams/De Testers/releases/1", json={"developers": 3})
        self.assertEqual(200, response.status_code)
        [score] = response.json()["rounds"]
        release = score["releases"][0]
        self.assertEqual(
            (2000, 3, 13, 300), (release["budget"], release["developers"], release["velocity"], release["cost"])
        )
        self.assertEqual(1700, score["releases"][1]["budget"])
        self.assertEqual(1700, score["remaining_budget"])

    def test_hire_testers(self) -> None:
        """Test dat een team testers kan inhuren zonder de ontwikkelaars te wijzigen."""
        self.team.put("/api/teams/De Testers/releases/1", json={"developers": 3})
        response = self.team.put("/api/teams/De Testers/releases/1", json={"testers": 2})
        release = response.json()["rounds"][0]["releases"][0]
        self.assertEqual((3, 2, 500), (release["developers"], release["testers"], release["cost"]))

    def test_split_velocity(self) -> None:
        """Test dat een team de velocity kan verdelen over bugs, technische schuld en businesswaarde."""
        self.team.put("/api/teams/De Testers/releases/1", json={"developers": 3})
        response = self.team.put(
            "/api/teams/De Testers/releases/1", json={"bug_fixing": 4, "tech_debt": 2, "testers": 1}
        )
        release = response.json()["rounds"][0]["releases"][0]
        keys = (
            "velocity",
            "bug_fixing",
            "tech_debt",
            "business_value_velocity",
            "bug_fixing_capacity",
            "tech_debt_capacity",
        )
        self.assertEqual([13, 4, 2, 7, 6, 1], [release[key] for key in keys])

    def test_too_much_velocity_on_bugs(self) -> None:
        """Test dat er niet meer velocity aan bugs kan worden besteed dan er is."""
        response = self.team.put("/api/teams/De Testers/releases/1", json={"bug_fixing": 1})
        self.assertEqual(409, response.status_code)
        self.assertEqual(
            "Er kan 0 tot en met 0 velocity aan het oplossen van bugs worden besteed.", response.json()["detail"]
        )

    def test_risks(self) -> None:
        """Test dat een team de opgetreden risico's kan aanvinken."""
        response = self.team.put("/api/teams/De Testers/releases/1", json={"risks": ["impromptu_demo"]})
        self.assertEqual(["impromptu_demo"], response.json()["rounds"][0]["releases"][0]["risks"])

    def test_no_roles_in_round_one(self) -> None:
        """Test dat rollen in ronde 1 een foutmelding opleveren."""
        response = self.team.put("/api/teams/De Testers/releases/1", json={"roles": ["architect"]})
        self.assertEqual(409, response.status_code)

    def test_unknown_risk(self) -> None:
        """Test dat een onbekend risico een foutmelding oplevert."""
        response = self.team.put("/api/teams/De Testers/releases/1", json={"risks": ["meteor"]})
        self.assertEqual(409, response.status_code)
        self.assertEqual("Onbekende risico's: meteor", response.json()["detail"])

    def test_too_many_testers(self) -> None:
        """Test dat er maximaal 5 testers per release kunnen worden ingehuurd."""
        response = self.team.put("/api/teams/De Testers/releases/1", json={"testers": 6})
        self.assertEqual(409, response.status_code)
        self.assertEqual("Per release kunnen 0 tot en met 5 testers worden ingehuurd.", response.json()["detail"])

    def test_unknown_team(self) -> None:
        """Test dat een onbekend team een 404 oplevert."""
        response = self.client().put("/api/teams/De Onbekenden/releases/1", json={"developers": 3})
        self.assertEqual(404, response.status_code)
        self.assertEqual("Er is geen team met de naam 'De Onbekenden'.", response.json()["detail"])

    def test_too_many_developers(self) -> None:
        """Test dat er maximaal 10 ontwikkelaars per release kunnen worden ingehuurd."""
        response = self.team.put("/api/teams/De Testers/releases/1", json={"developers": 11})
        self.assertEqual(409, response.status_code)
        self.assertEqual(
            "Per release kunnen 0 tot en met 10 ontwikkelaars worden ingehuurd.", response.json()["detail"]
        )


class FinishReleaseTest(AppTestCase):
    """Unittests voor het afronden van releases."""

    def setUp(self) -> None:
        """Meld een team aan en start de eerste ronde."""
        super().setUp()
        self.team = self.register()
        self.client("127.0.0.1").post("/api/game/start-round")

    def test_finish_release(self) -> None:
        """Test dat een team een release kan afronden en daarna de volgende release kan maken."""
        response = self.team.post("/api/teams/De Testers/finish-release")
        self.assertEqual(200, response.status_code)
        self.assertEqual(1, response.json()["rounds"][0]["completed_releases"])
        response = self.team.put("/api/teams/De Testers/releases/2", json={"developers": 3})
        self.assertEqual(200, response.status_code)

    def test_completed_release(self) -> None:
        """Test dat een afgeronde release niet meer kan worden gewijzigd."""
        self.team.post("/api/teams/De Testers/finish-release")
        response = self.team.put("/api/teams/De Testers/releases/1", json={"developers": 3})
        self.assertEqual(409, response.status_code)
        self.assertEqual("Release 1 is al afgerond.", response.json()["detail"])

    def test_enter_cards_before_finishing_release(self) -> None:
        """Test dat een team de omgedraaide kaartjes moet invoeren voordat het de release kan afronden."""
        self.team.put("/api/teams/De Testers/releases/1", json={"developers": 1})  # velocity 4
        response = self.team.post("/api/teams/De Testers/finish-release")
        self.assertEqual(409, response.status_code)
        self.assertEqual(
            "Voer eerst alle omgedraaide kaartjes in; er moeten er nog 4 worden ingevoerd.", response.json()["detail"]
        )
        response = self.team.put("/api/teams/De Testers/releases/1", json={"three_point_cards": 3, "bug_cards": 1})
        release = response.json()["rounds"][0]["releases"][0]
        self.assertEqual(
            (9, 1, 0), (release["delivered_business_value"], release["cumulative_bugs"], release["open_cards"])
        )
        self.assertEqual(200, self.team.post("/api/teams/De Testers/finish-release").status_code)

    def test_unknown_team(self) -> None:
        """Test dat een onbekend team een 404 oplevert."""
        response = self.client().post("/api/teams/De Onbekenden/finish-release")
        self.assertEqual(404, response.status_code)

    def test_steps(self) -> None:
        """Test dat een team naar de volgende en de vorige stap van de release kan."""
        response = self.team.post("/api/teams/De Testers/next-step")
        self.assertEqual("risks", response.json()["rounds"][0]["releases"][0]["step"])
        response = self.team.post("/api/teams/De Testers/previous-step")
        self.assertEqual("team", response.json()["rounds"][0]["releases"][0]["step"])
        response = self.team.post("/api/teams/De Testers/previous-step")
        self.assertEqual(409, response.status_code)
        self.assertEqual("Dit is de eerste stap van de release.", response.json()["detail"])


class SecurityTest(AppTestCase):
    """Unittests voor de bescherming van het spel tegen andere teams, andere websites en het vollopen van de server."""

    def setUp(self) -> None:
        """Meld een team aan en start de eerste ronde."""
        super().setUp()
        self.team = self.register()
        self.client("127.0.0.1").post("/api/game/start-round")

    def test_team_needs_its_token(self) -> None:
        """Test dat alleen het team zelf, met zijn token, zijn releases kan wijzigen."""
        wrong_token = self.client(headers={"X-Team-Token": "fout"})
        for client in (self.client(), wrong_token):
            with self.subTest(client=client):
                for response in (
                    client.put("/api/teams/De Testers/releases/1", json={"developers": 3}),
                    client.post("/api/teams/De Testers/finish-release"),
                    client.post("/api/teams/De Testers/next-step"),
                    client.post("/api/teams/De Testers/previous-step"),
                ):
                    self.assertEqual(403, response.status_code)
                    self.assertEqual("Alleen het team zelf kan zijn releases wijzigen.", response.json()["detail"])
        self.assertEqual(200, self.team.put("/api/teams/De Testers/releases/1", json={"developers": 3}).status_code)

    def test_token_of_other_team_does_not_work(self) -> None:
        """Test dat een team met zijn eigen token de releases van een ander team niet kan wijzigen."""
        game = Game()
        game.register_team("De Testers")
        other = game.register_team("De Anderen")
        app = create_app(JOIN_URL, game)
        client = TestClient(app, client=("192.168.1.42", 50000), headers={"X-Team-Token": other.token})
        self.assertEqual(403, client.post("/api/teams/De Testers/finish-release").status_code)

    def test_links_to_reconnect_teams(self) -> None:
        """Test dat de spelleider per team een link krijgt waarmee het team weer in het spel komt."""
        self.game = Game()
        self.app = create_app(JOIN_URL, self.game)
        self.register("De Testers")
        self.register("Team & Co")
        links = self.client("127.0.0.1").get("/api/teams/links").json()
        token = self.game.teams["Team & Co"].token
        expected = {"name": "Team & Co", "url": f"{JOIN_URL}/#team=Team+%26+Co&token={token}"}
        self.assertEqual(["De Testers", "Team & Co"], [link["name"] for link in links])
        self.assertEqual(expected, links[1])

    def test_only_game_master_sees_links(self) -> None:
        """Test dat teams de links, en dus de tokens, van andere teams niet kunnen zien."""
        response = self.client().get("/api/teams/links")
        self.assertEqual(403, response.status_code)
        self.assertEqual("Alleen de spelleider kan de links van de teams zien.", response.json()["detail"])

    def test_game_master_needs_localhost(self) -> None:
        """Test dat de spelleider via localhost moet werken; een ander adres wijst op DNS-rebinding."""
        rebinding = TestClient(self.app, client=("127.0.0.1", 50000), base_url="http://evil.example:8765")
        self.assertEqual(403, rebinding.post("/api/game/finish-round").status_code)

    def test_other_website_cannot_control_the_game(self) -> None:
        """Test dat een andere website via de browser van de spelleider het spel niet kan besturen (CSRF)."""
        response = self.client("127.0.0.1").post("/api/game/finish-round", headers={"Origin": "https://evil.example"})
        self.assertEqual(403, response.status_code)
        self.assertFalse(self.game.round_finished)

    def test_game_master_page_can_control_the_game(self) -> None:
        """Test dat de spelleiderpagina zelf, met localhost als Origin, het spel wel kan besturen."""
        for origin in ("http://localhost:8765", "http://127.0.0.1:8765", "http://[::1]:8765"):
            with self.subTest(origin=origin):
                self.game.round_finished = False
                response = self.client("127.0.0.1").post("/api/game/finish-round", headers={"Origin": origin})
                self.assertEqual(200, response.status_code)


class StaticFilesTest(AppTestCase):
    """Unittests voor de statische bestanden."""

    def test_browser_checks_for_new_versions(self) -> None:
        """Test dat de browser bij elk bezoek controleert of er een nieuwere versie van de pagina's en scripts is."""
        for path in ("/", "/static/team.js", "/api/game"):
            with self.subTest(path=path):
                self.assertEqual("no-cache", self.client().get(path).headers["cache-control"])

    def test_unique_ids(self) -> None:
        """Test dat elke id in de pagina's maar één keer voorkomt; de scripts zoeken elementen op id."""
        for page in ("host.html", "team.html"):
            with self.subTest(page=page):
                ids = re.findall(r'id="([^"]+)"', self.client().get(f"/static/{page}").text)
                self.assertEqual(len(ids), len(set(ids)))

    def test_shared_script(self) -> None:
        """Test dat het gedeelde script wordt geserveerd."""
        response = self.client().get("/static/teams.js")
        self.assertEqual(200, response.status_code)
        self.assertIn("function renderResults", response.text)

    def test_shared_stylesheet(self) -> None:
        """Test dat de pagina's de gedeelde stijl gebruiken en dat die wordt geserveerd."""
        for page in ("host.html", "team.html"):
            with self.subTest(page=page):
                self.assertIn('href="/static/common.css"', self.client().get(f"/static/{page}").text)
        response = self.client().get("/static/common.css")
        self.assertEqual(200, response.status_code)
        self.assertIn("table.results", response.text)
