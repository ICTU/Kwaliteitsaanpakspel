"""De webapplicatie: een spelleiderpagina op localhost en een teampagina voor de andere laptops."""

import secrets
from collections.abc import Callable
from importlib.resources import files
from urllib.parse import urlencode

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .game import (
    LAST_ROUND,
    MAX_DEVELOPERS,
    MAX_TESTERS,
    MEASURES,
    MEASURES_FROM_ROUND,
    PROTECTION_REASONS,
    RISKS,
    ROLES,
    ROLES_FROM_ROUND,
    STEPS,
    Game,
    GameError,
    Team,
    TeamDict,
    UnknownTeamError,
)

LOCALHOST_ADDRESSES = {"127.0.0.1", "::1"}

GameStateDict = dict[str, int | bool | list[dict[str, str]] | dict[str, str] | None]


class TeamRegistration(BaseModel):
    """De gegevens om een team aan te melden."""

    name: str


class ReleasePlan(BaseModel):
    """De onderdelen van een release die een team wil wijzigen."""

    developers: int | None = None
    testers: int | None = None
    bug_fixing: int | None = None
    tech_debt: int | None = None
    one_point_cards: int | None = None
    two_point_cards: int | None = None
    three_point_cards: int | None = None
    bug_cards: int | None = None
    tech_debt_cards: int | None = None
    risks: list[str] | None = None
    roles: list[str] | None = None
    measures: list[str] | None = None


LOCALHOST_NAMES = {"localhost", "127.0.0.1", "[::1]"}


def is_local(request: Request) -> bool:
    """Geef aan of het verzoek van de laptop komt waarop de server draait."""
    return request.client is not None and request.client.host in LOCALHOST_ADDRESSES


def is_game_master(request: Request) -> bool:
    """Geef aan of het verzoek van de spelleider komt: van de laptop waarop de server draait, via localhost.

    De Host-header voorkomt DNS-rebinding en de Origin-header dat een andere website via de browser van de spelleider
    het spel bestuurt (CSRF).
    """
    host = request.headers.get("host", "").rsplit(":", 1)[0]
    origin = request.headers.get("origin")
    trusted_origin = origin is None or origin.split("://", 1)[-1].rsplit(":", 1)[0] in LOCALHOST_NAMES
    return is_local(request) and host in LOCALHOST_NAMES and trusted_origin


STATIC = files(__package__).joinpath("static")


def page(name: str, **values: str) -> str:
    """Lees een HTML-pagina uit de static-map en vul de placeholders in."""
    html = STATIC.joinpath(name).read_text(encoding="utf-8")
    for key, value in values.items():
        html = html.replace("{{" + key + "}}", value)
    return html


def create_app(join_url: str, game: Game | None = None) -> FastAPI:
    """Maak de webapplicatie aan."""
    game = game or Game()
    app = FastAPI(title="Kwaliteitsaanpakspel")
    app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")

    @app.middleware("http")
    async def revalidate(request: Request, call_next: Callable) -> Response:
        """Laat de browser bij elk bezoek controleren of er een nieuwere versie van de pagina's en scripts is, zodat
        teams na een update van het spel niet met oude code verder spelen."""
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/", response_class=HTMLResponse)
    def index(request: Request) -> str:
        """Toon de spelleiderpagina op de host-laptop en de aanmeldpagina op de andere laptops."""
        return page("host.html", join_url=join_url) if is_local(request) else page("team.html")

    @app.get("/api/teams")
    def list_teams() -> list[TeamDict]:
        """Geef de stand van alle teams, per ronde."""
        return [team.as_dict() for team in game.teams.values()]

    @app.post("/api/teams", status_code=201)
    def register_team(registration: TeamRegistration) -> TeamDict:
        """Meld een team aan."""
        try:
            team = game.register_team(registration.name)
        except GameError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return team.as_dict() | {"token": team.token}

    def own_team(name: str, token: str | None) -> None:
        """Controleer of het verzoek van het team zelf komt: met het token dat het team bij het aanmelden kreeg."""
        team = game.teams.get(name)
        if team is not None and not secrets.compare_digest(token or "", team.token):
            raise HTTPException(status_code=403, detail="Alleen het team zelf kan zijn releases wijzigen.")

    def team_action(action: Callable[[], Team]) -> TeamDict:
        """Voer een actie van een team uit en geef de nieuwe stand van het team terug."""
        try:
            return action().as_dict()
        except UnknownTeamError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except GameError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @app.put("/api/teams/{name}/releases/{release}")
    def plan_release(name: str, release: int, plan: ReleasePlan, x_team_token: str | None = Header(None)) -> TeamDict:
        """Plan de huidige release van een team."""
        own_team(name, x_team_token)
        return team_action(lambda: game.plan_release(name, release, **plan.model_dump(exclude_none=True)))

    @app.post("/api/teams/{name}/finish-release")
    def finish_release(name: str, x_team_token: str | None = Header(None)) -> TeamDict:
        """Rond de huidige release van een team af en start de volgende."""
        own_team(name, x_team_token)
        return team_action(lambda: game.finish_release(name))

    @app.post("/api/teams/{name}/next-step")
    def next_step(name: str, x_team_token: str | None = Header(None)) -> TeamDict:
        """Ga in de huidige release van een team naar de volgende stap."""
        own_team(name, x_team_token)
        return team_action(lambda: game.next_step(name))

    @app.post("/api/teams/{name}/previous-step")
    def previous_step(name: str, x_team_token: str | None = Header(None)) -> TeamDict:
        """Ga in de huidige release van een team terug naar de vorige stap."""
        own_team(name, x_team_token)
        return team_action(lambda: game.previous_step(name))

    @app.get("/api/teams/links")
    def team_links(request: Request) -> list[dict[str, str]]:
        """Geef per team een link waarmee het team weer in het spel komt, bijvoorbeeld als de browser het token kwijt
        is. Alleen de spelleider kan de links zien. Het token staat na de # en gaat dus niet naar de server."""
        if not is_game_master(request):
            raise HTTPException(status_code=403, detail="Alleen de spelleider kan de links van de teams zien.")
        return [
            {"name": team.name, "url": f"{join_url}/#{urlencode({'team': team.name, 'token': team.token})}"}
            for team in game.teams.values()
        ]

    @app.get("/api/game")
    def game_state() -> GameStateDict:
        """Geef de stand van het spel."""
        return {
            "round": game.round,
            "last_round": LAST_ROUND,
            "max_developers": MAX_DEVELOPERS,
            "max_testers": MAX_TESTERS,
            "risks": [{"key": key, "label": label} for key, label in RISKS.items()],
            "roles": [{"key": key, "label": label} for key, label in ROLES.items()],
            "roles_from_round": ROLES_FROM_ROUND,
            "measures": [{"key": key, "label": label} for key, label in MEASURES.items()],
            "measures_from_round": MEASURES_FROM_ROUND,
            "protection_reasons": PROTECTION_REASONS,
            "steps": [{"key": key, "label": label} for key, label in STEPS.items()],
            "round_finished": game.round_finished,
            "finished": game.finished,
        }

    def game_master_action(request: Request, action: Callable[[], None]) -> GameStateDict:
        """Voer een actie van de spelleider uit. Alleen de spelleider, op de host-laptop, kan dit."""
        if not is_game_master(request):
            raise HTTPException(status_code=403, detail="Alleen de spelleider kan het spel besturen.")
        try:
            action()
        except GameError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return game_state()

    @app.post("/api/game/start-round")
    def start_round(request: Request) -> GameStateDict:
        """Start de volgende ronde."""
        return game_master_action(request, game.start_round)

    @app.post("/api/game/finish-round")
    def finish_round(request: Request) -> GameStateDict:
        """Stop de huidige ronde."""
        return game_master_action(request, game.finish_round)

    return app
