"""Spelstatus: de teams en per ronde hun budget, opgeleverde businesswaarde en open bugs.

Elke ronde is een eigen instantie van het spel: alle teams beginnen elke ronde opnieuw.
"""

import secrets
from collections.abc import Iterable
from dataclasses import dataclass, field, replace

LAST_ROUND = 2
MAX_TEAMS = 50  # ruim genoeg voor elk spel; voorkomt dat iemand op het netwerk de server laat vollopen
MAX_TEAM_NAME_LENGTH = 30
START_BUDGET = 2000  # €CTU per team per ronde
BUSINESS_VALUE_TARGET = 80  # de businesswaarde die een team per ronde moet opleveren
BUGS_TARGET = 4  # het target voor het aantal bugs; niet het werkelijke aantal bugs
TECH_DEBT_TARGET = 4  # het target voor de technische schuld; niet de werkelijke technische schuld
RELEASES_PER_ROUND = 4
DEVELOPER_COST = 100  # €CTU per ontwikkelaar per release
# De velocity van een release, afhankelijk van het aantal ingezette ontwikkelaars (de index).
VELOCITY = (0, 4, 8, 13, 18, 22, 25, 28, 30, 31, 32)
MAX_DEVELOPERS = len(VELOCITY) - 1  # per release
TESTER_COST = 100  # €CTU per tester per release
MAX_TESTERS = 5  # per release
BUGS_PER_TESTER = 4  # het aantal bugs dat een tester per release kan oplossen
VELOCITY_PER_FIX = 2  # de velocity die nodig is om een bug of een punt technische schuld op te lossen
# De kaartjes die een team per release omdraait: een kaartje per punt velocity voor businesswaarde. Een kaartje is
# businesswaarde (1, 2 of 3 punten), een bug of een item technische schuld. Bij het inperken van de kaartjes, omdat er
# minder velocity is, gaan de laatste soorten eerst omlaag.
# De stappen waarin een team een release doorloopt, in volgorde, met het label van de rijen die bij de stap horen.
STEPS = {
    "team": "👫 Team",
    "measures": "📋 Maatregelen",
    "risks": "⚠️ Risico's",
    "velocity": "🚀 Velocity",
    "cards": "🛠️ Bouw en test",
}
CARDS = ("one_point_cards", "two_point_cards", "three_point_cards", "bug_cards", "tech_debt_cards")
# De risico's die in een release kunnen optreden. Het team draait per release een risicokaart om.
RISKS = {
    "release_not_accepted": "👎 Release niet geaccepteerd",
    "data_loss": "🔥 Dataloss in productie",
    "scope_extension": "👍 Scope uitbreiding",
    "developer_resignation": "👩🏻‍💻 Ontslag ontwikkelaar",
    "major_update": "🚚 Grote update",
    "impromptu_demo": "👩🏼‍🏫 Impromptu demo",
    "operations_cannot_keep_up": "🐌 Beheerpartij kan niet meekomen",
    "target_architecture_changes": "🏛️ Doelarchitectuur wijzigt",
    "external_audit": "☑️ Externe audit",
    "no_test_capacity": "🤷🏻‍♂️ Geen testcapaciteit",
    "change_of_management": "🧭 Wisseling in de aansturing",
    "no_time_at_client": "⏳ Geen tijd bij opdrachtgever",
}
# De rollen die een team vanaf ROLES_FROM_ROUND per release kan inzetten, elk 0 of 1 keer.
ROLES = {
    "architect": "👨🏻‍💼 Architect",
    "quality_manager": "🕵🏻‍♀️ Kwaliteitsmanager",
    "software_delivery_manager": "👩🏽‍💼 Software delivery manager",
    "product_owner": "🧕🏻 Product owner",
}
ROLES_FROM_ROUND = 2
ROLE_COST = 30  # €CTU per rol per release; de rollen zijn in deeltijd
ROLE_VELOCITY = {"architect": 2, "software_delivery_manager": 2}  # de velocity die een rol aan een release toevoegt
ROLE_TECH_DEBT_CAPACITY = {"quality_manager": 4}
# Elke rol beschermt tegen een risico: als het team de rol in een release inzet, kan het risico niet optreden.
ROLE_PROTECTIONS = {
    "architect": "target_architecture_changes",
    "quality_manager": "external_audit",
    "software_delivery_manager": "developer_resignation",
    "product_owner": "no_time_at_client",
}  # de technische schuld die een rol in een release kan oplossen
# De maatregelen die een team vanaf MEASURES_FROM_ROUND per release kan nemen. De voorfase kan alleen in de eerste
# release, en dan zonder andere maatregelen in die release. Met de voorfase kan in de eerste release geen risico
# optreden en kan een release in de rest van de ronde niet meer worden afgekeurd.
MEASURES = {
    "preliminary_phase": "📐 Voorfase",
    "security_test": "🔎 Securitytest",
    "maintainability_check": "🚧 Onderhoudbaarheidstoets",
    "automated_regression_test": "⚙️ Automatische regressietest",
    "risk_management": "🛡 Risicomanagement",
    "quality_monitoring": "⭐️ Kwaliteitsmonitoring",
}
MEASURES_FROM_ROUND = 2
PRELIMINARY_PHASE_TARGET_DECREASE = 25  # het percentage waarmee de voorfase het target voor businesswaarde verlaagt
# De velocity die een maatregel een release kost.
MEASURE_VELOCITY = {
    "security_test": -1,
    "maintainability_check": -1,
    "automated_regression_test": -1,
    "quality_monitoring": -1,
}
# De risico's waartegen een maatregel beschermt in de release waarin het team de maatregel neemt.
MEASURE_PROTECTIONS = {
    "security_test": "data_loss",
    "maintainability_check": "major_update",
    "automated_regression_test": "no_test_capacity",
}
# Andere redenen waarom een risico niet kan optreden: zonder opgeleverde software kan er geen dataloss in productie zijn.
PROTECTION_REASONS = {"no_software_ready": "nog geen software gereed"}
MEASURE_BUG_CAPACITY = {"security_test": 3}  # de extra bugs die het team kan oplossen
MEASURE_TECH_DEBT_CAPACITY = {"maintainability_check": 3}  # de extra technische schuld die het team kan oplossen
# Met kwaliteitsmonitoring lost de kwaliteitsmanager extra technische schuld op; met een automatische regressietest
# lost elke tester extra bugs op.
QUALITY_MONITORING_TECH_DEBT_CAPACITY = 1
REGRESSION_TEST_BUGS_PER_TESTER = 1
MEASURE_COSTS = {  # €CTU per release waarin het team de maatregel neemt
    "preliminary_phase": 250,
    "security_test": 60,
    "maintainability_check": 60,
    "automated_regression_test": 0,
    "risk_management": 30,
    "quality_monitoring": 0,
}
# De velocity die een release verliest door risico's die in de release optreden.
VELOCITY_PENALTIES = {
    "data_loss": 3,
    "major_update": 3,
    "operations_cannot_keep_up": 3,
    "target_architecture_changes": 3,
    "external_audit": 3,
    "no_test_capacity": 3,
}
# Risico's die het target voor het aantal bugs of de technische schuld met 1 verlagen, vanaf de release waarin ze
# optreden. De targets worden niet negatief.
BUGS_TARGET_RISKS = frozenset({"release_not_accepted", "data_loss"})
TECH_DEBT_TARGET_RISKS = frozenset({"major_update", "external_audit"})
# Risico's die meer werk opleveren, vanaf de release waarin ze optreden: het percentage en het aantal punten waarmee het
# target voor businesswaarde omhoog gaat, en het extra budget in €CTU.
EXTRA_WORK = {
    "scope_extension": (10, 0, 300),
    "target_architecture_changes": (5, 0, 150),
    "change_of_management": (0, 6, 0),
}
# Bij een impromptu demo is de stas niet tevreden als er aan het begin van de release minder businesswaarde is
# gerealiseerd of meer bugs open staan. Het team huurt dan in de release een extra ontwikkelaar of tester in.
DEMO_MIN_BUSINESS_VALUE = 25
DEMO_MAX_OPEN_BUGS = 4

ReleaseDict = dict[str, int | str | list[str] | list[dict[str, str | int]] | dict[str, str]]
ScoreDict = dict[str, int | list[ReleaseDict]]
TeamDict = dict[str, str | list[ScoreDict]]


class GameError(ValueError):
    """Een actie is in de huidige stand van het spel niet mogelijk."""


class UnknownTeamError(GameError):
    """Het team bestaat niet."""


def lower_target(target: int, risks: frozenset[str]) -> tuple[int, list[dict[str, str | int]]]:
    """Verlaag een target met 1 per risico, maar niet onder 0. Geef het nieuwe target en de veranderingen per risico."""
    changes = []
    for risk in RISKS:
        if risk in risks and target > 0:
            target -= 1
            changes.append({"cause": risk, "change": -1})
    return target, changes


def percentage(amount: int, percent: int) -> int:
    """Geef een percentage van een bedrag, afgerond op een heel getal (een half naar boven)."""
    return (amount * percent + 50) // 100


def round_down(velocity: int) -> int:
    """Rond velocity naar beneden af op een veelvoud van VELOCITY_PER_FIX."""
    return velocity - velocity % VELOCITY_PER_FIX


@dataclass
class Release:
    """Een release: de ontwikkelaars en testers die het team ervoor heeft ingehuurd, hoe het team de velocity besteedt
    en wat het team heeft opgeleverd.

    De velocity die niet aan het oplossen van bugs of technische schuld wordt besteed, gaat naar het realiseren van
    businesswaarde. Per punt daarvan draait het team een kaartje om.
    """

    developers: int = 0
    testers: int = 0
    bug_fixing: int = 0  # velocity te besteden aan het oplossen van bugs; een veelvoud van VELOCITY_PER_FIX
    tech_debt: int = 0  # velocity te besteden aan het oplossen van technische schuld; een veelvoud van VELOCITY_PER_FIX
    one_point_cards: int = 0
    two_point_cards: int = 0
    three_point_cards: int = 0
    bug_cards: int = 0
    tech_debt_cards: int = 0
    risks: frozenset[str] = frozenset()  # de risico's die in de release zijn opgetreden
    roles: frozenset[str] = frozenset()  # de rollen die het team in de release inzet
    measures: frozenset[str] = frozenset()  # de maatregelen die het team in de release neemt
    step: str = field(default="team", compare=False)  # de stap (zie STEPS) waarin het team de release doorloopt
    # De stand aan het begin van de release: wat het team in de eerdere releases van de ronde heeft opgeleverd.
    # Score houdt dit bij.
    start_business_value: int = field(default=0, compare=False, repr=False)
    start_open_bugs: int = field(default=0, compare=False, repr=False)
    start_open_tech_debt: int = field(default=0, compare=False, repr=False)
    after_preliminary_phase: bool = field(default=False, compare=False, repr=False)

    @property
    def protected_risks(self) -> dict[str, str]:
        """Geef de risico's die in de release niet kunnen optreden, met de rol, maatregel of reden (zie
        PROTECTION_REASONS) die ertegen beschermt."""
        protected = {ROLE_PROTECTIONS[role]: role for role in ROLES if role in self.roles}
        protected |= {
            MEASURE_PROTECTIONS[measure]: measure for measure in MEASURE_PROTECTIONS if measure in self.measures
        }
        if self.after_preliminary_phase:
            protected["release_not_accepted"] = "preliminary_phase"
        if self.start_business_value == 0:
            protected.setdefault("data_loss", "no_software_ready")
        if "preliminary_phase" in self.measures:
            protected = dict.fromkeys(RISKS, "preliminary_phase")
        return protected

    @property
    def unmet_measures(self) -> dict[str, str]:
        """Geef de maatregelen waarvan het team in de release niet aan de voorwaarde voldoet, met de voorwaarde."""
        unmet = {}
        if "quality_manager" not in self.roles:
            unmet["quality_monitoring"] = f"alleen met een {ROLES['quality_manager']}"
        if self.testers + self.extra_testers == 0:
            unmet["automated_regression_test"] = "alleen met minimaal 1 tester"
        return unmet

    @property
    def team_locked(self) -> bool:
        """Geef aan of het team in de release geen mensen kan inhuren. De voorfase is inclusief een voorfaseteam en
        realiseert nog geen software."""
        return "preliminary_phase" in self.measures

    @property
    def extra_developers(self) -> int:
        """Geef het aantal ontwikkelaars dat het team door een mislukte impromptu demo extra inhuurt."""
        demo = "impromptu_demo" in self.risks
        return int(demo and self.start_business_value < DEMO_MIN_BUSINESS_VALUE)

    @property
    def extra_testers(self) -> int:
        """Geef het aantal testers dat het team door een mislukte impromptu demo extra inhuurt."""
        return int("impromptu_demo" in self.risks and self.start_open_bugs > DEMO_MAX_OPEN_BUGS)

    @property
    def cost(self) -> int:
        """Geef de kosten van de release."""
        developers = self.developers + self.extra_developers
        testers = self.testers + self.extra_testers
        measures = sum(MEASURE_COSTS[measure] for measure in self.measures)
        return developers * DEVELOPER_COST + testers * TESTER_COST + len(self.roles) * ROLE_COST + measures

    @property
    def velocity(self) -> int:
        """Geef de bruto velocity van de release.

        Extra ontwikkelaars tellen mee, maar meer dan MAX_DEVELOPERS ontwikkelaars voegen geen velocity toe. Bij het
        ontslag van een ontwikkelaar is de velocity die van een team met één ontwikkelaar minder; het team betaalt wel
        voor alle ontwikkelaars. Sommige risico's kosten velocity (zie VELOCITY_PENALTIES), maar niet meer dan er is.
        """
        velocity = VELOCITY[self.developers] + sum(change for _, change in self.velocity_changes)
        return max(velocity, 0)

    @property
    def velocity_changes(self) -> list[tuple[str, int]]:
        """Geef de risico's, rollen en maatregelen die de velocity van de release veranderen, met de verandering.

        De volgorde is die van RISKS en daarna ROLES en MEASURES, behalve dat het halveren door geen tijd bij de
        opdrachtgever als laatste komt, omdat dat na de andere veranderingen gebeurt.
        """

        def velocity(developers: int) -> int:
            """Geef de velocity van een aantal ontwikkelaars; meer dan MAX_DEVELOPERS voegen niets toe."""
            return VELOCITY[min(max(developers, 0), MAX_DEVELOPERS)]

        changes = {}
        developers = self.developers
        for risk, extra in (("impromptu_demo", self.extra_developers), ("developer_resignation", -1)):
            if risk in self.risks:
                changes[risk] = velocity(developers + extra) - velocity(developers)
                developers += extra
        for risk in self.risks & VELOCITY_PENALTIES.keys():
            changes[risk] = -VELOCITY_PENALTIES[risk]
        for role in self.roles & ROLE_VELOCITY.keys():
            changes[role] = ROLE_VELOCITY[role]
        for measure in self.measures & MEASURE_VELOCITY.keys():
            changes[measure] = MEASURE_VELOCITY[measure]
        if "no_time_at_client" in self.risks:
            # Geen tijd bij de opdrachtgever halveert de velocity na de andere veranderingen, naar boven afgerond.
            remaining = max(VELOCITY[self.developers] + sum(changes.values()), 0)
            changes["no_time_at_client"] = -(remaining // 2)
        order = (
            [risk for risk in RISKS if risk != "no_time_at_client"]
            + list(ROLES)
            + list(MEASURES)
            + ["no_time_at_client"]
        )
        return [(cause, changes[cause]) for cause in order if changes.get(cause)]

    @property
    def business_value_velocity(self) -> int:
        """Geef de velocity die overblijft voor het realiseren van businesswaarde."""
        return self.velocity - self.bug_fixing - self.tech_debt

    @property
    def bug_fixing_capacity(self) -> int:
        """Geef het aantal bugs dat het team in de release kan oplossen."""
        return (
            BUGS_PER_TESTER * self.testers
            + self.bug_fixing // VELOCITY_PER_FIX
            + sum(change for _, change in self.bug_fixing_capacity_changes)
        )

    @property
    def bug_fixing_capacity_changes(self) -> list[tuple[str, int]]:
        """Geef de extra tester door een mislukte impromptu demo en de maatregelen die extra bugs oplossen, met hoeveel,
        in de volgorde van MEASURES."""
        changes = [("impromptu_demo", BUGS_PER_TESTER * self.extra_testers)] if self.extra_testers else []
        changes += [
            (measure, MEASURE_BUG_CAPACITY[measure]) for measure in MEASURE_BUG_CAPACITY if measure in self.measures
        ]
        testers = self.testers + self.extra_testers
        if "automated_regression_test" in self.measures and testers:
            changes.append(("automated_regression_test", REGRESSION_TEST_BUGS_PER_TESTER * testers))
        return changes

    @property
    def tech_debt_capacity(self) -> int:
        """Geef de hoeveelheid technische schuld die het team in de release kan oplossen."""
        return self.tech_debt // VELOCITY_PER_FIX + sum(change for _, change in self.tech_debt_capacity_changes)

    @property
    def tech_debt_capacity_changes(self) -> list[tuple[str, int]]:
        """Geef de rollen en maatregelen die extra technische schuld oplossen, met hoeveel, in de volgorde van ROLES en
        MEASURES."""
        changes = [(role, ROLE_TECH_DEBT_CAPACITY[role]) for role in ROLE_TECH_DEBT_CAPACITY if role in self.roles]
        changes += [
            (measure, MEASURE_TECH_DEBT_CAPACITY[measure])
            for measure in MEASURE_TECH_DEBT_CAPACITY
            if measure in self.measures
        ]
        if "quality_monitoring" in self.measures and "quality_manager" in self.roles:
            changes.append(("quality_monitoring", QUALITY_MONITORING_TECH_DEBT_CAPACITY))
        return changes

    @property
    def cards(self) -> int:
        """Geef het aantal kaartjes dat het team heeft ingevoerd."""
        return sum(getattr(self, card) for card in CARDS)

    @property
    def open_cards(self) -> int:
        """Geef het aantal omgedraaide kaartjes dat het team nog niet heeft ingevoerd."""
        return self.business_value_velocity - self.cards

    @property
    def delivered_business_value(self) -> int:
        """Geef de businesswaarde die het team in de release heeft opgeleverd."""
        return self.one_point_cards + 2 * self.two_point_cards + 3 * self.three_point_cards

    @property
    def cumulative_business_value(self) -> int:
        """Geef de businesswaarde die het team aan het eind van de release in de ronde heeft opgeleverd."""
        return self.start_business_value + self.delivered_business_value

    @property
    def cumulative_bugs(self) -> int:
        """Geef het aantal bugs dat aan het eind van de release open staat.

        Het team kan bugs oplossen in de release waarin ze erbij komen.
        """
        return max(self.start_open_bugs + self.bug_cards - self.bug_fixing_capacity, 0)

    @property
    def cumulative_tech_debt(self) -> int:
        """Geef de technische schuld die aan het eind van de release open staat."""
        return max(self.start_open_tech_debt + self.tech_debt_cards - self.tech_debt_capacity, 0)

    def fit_velocity_split(self) -> None:
        """Zorg dat er niet meer velocity aan bugs en technische schuld wordt besteed dan er is.

        Dat kan nodig zijn als het team minder ontwikkelaars inzet. Eerst gaat de velocity voor technische schuld
        omlaag, daarna die voor bugs.
        """
        self.tech_debt = round_down(min(self.tech_debt, max(self.velocity - self.bug_fixing, 0)))
        self.bug_fixing = round_down(min(self.bug_fixing, self.velocity - self.tech_debt))

    def fit_cards(self) -> None:
        """Zorg dat het team niet meer kaartjes heeft ingevoerd dan het mocht omdraaien.

        Dat kan nodig zijn als er minder velocity voor businesswaarde is. De laatste soorten kaartjes gaan eerst omlaag.
        """
        for card in reversed(CARDS):
            setattr(self, card, max(getattr(self, card) + min(self.open_cards, 0), 0))


@dataclass
class Score:
    """De stand van een team in een ronde. Het team maakt de releases één voor één."""

    releases: list[Release] = field(default_factory=lambda: [Release() for _ in range(RELEASES_PER_ROUND)])
    completed_releases: int = 0
    round_number: int = field(default=1, compare=False)

    def __post_init__(self) -> None:
        """Bepaal de stand aan het begin van elke release."""
        self.cumulate()

    def cumulate(self) -> None:
        """Bepaal de stand aan het begin van elke release: de stand aan het eind van de vorige release."""
        previous = Release()
        preliminary_phase = False
        for release in self.releases:
            release.start_business_value = previous.cumulative_business_value
            release.start_open_bugs = previous.cumulative_bugs
            release.start_open_tech_debt = previous.cumulative_tech_debt
            release.after_preliminary_phase = preliminary_phase
            preliminary_phase |= "preliminary_phase" in release.measures
            previous = release

    @property
    def current_release(self) -> int | None:
        """Geef het nummer van de release waar het team aan werkt, of None als alle releases zijn afgerond."""
        return None if self.completed_releases == len(self.releases) else self.completed_releases + 1

    def steps(self, release: Release) -> list[str]:
        """Geef de stappen waarin het team de release doorloopt (zie STEPS). Stappen waarin het team niets kan doen,
        vallen weg: de maatregelen voor MEASURES_FROM_ROUND, en in de voorfase het team, de risico's en de velocity."""
        skipped = set()
        if self.round_number < MEASURES_FROM_ROUND:
            skipped.add("measures")
        if release.team_locked:
            skipped |= {"team", "risks", "velocity"}
        return [step for step in STEPS if step not in skipped]

    def as_dict(self) -> ScoreDict:
        """Geef de stand als dictionary, met per release de targets, het beschikbare budget, de ingezette mensen, de
        velocity, de oploscapaciteit, wat het team heeft opgeleverd en wat het team cumulatief heeft opgeleverd.

        Het beschikbare budget van een release is het startbudget minus de kosten van de eerdere releases.
        Het budget kan negatief worden.

        De cumulatieve bugs en technische schuld zijn wat er na de release nog open staat: wat er openstond, plus wat er
        in de release bij is gekomen, minus wat het team heeft opgelost.

        Risico's kunnen de targets veranderen, vanaf de release waarin ze optreden:
        - Het target voor het aantal bugs of de technische schuld gaat 1 omlaag (zie BUGS_TARGET_RISKS en
          TECH_DEBT_TARGET_RISKS), maar niet onder 0.
        - Het target voor businesswaarde gaat een percentage (afgerond op hele punten) of een aantal punten omhoog, en
          het budget gaat omhoog (zie EXTRA_WORK).
        - De voorfase verlaagt het target voor businesswaarde met PRELIMINARY_PHASE_TARGET_DECREASE procent.
        """
        self.cumulate()
        budget = START_BUDGET
        spent = 0
        business_value_target = BUSINESS_VALUE_TARGET
        bugs_target = BUGS_TARGET
        tech_debt_target = TECH_DEBT_TARGET
        releases = []
        for index, release in enumerate(self.releases):
            bugs_target, bugs_target_changes = lower_target(bugs_target, release.risks & BUGS_TARGET_RISKS)
            tech_debt_target, tech_debt_target_changes = lower_target(
                tech_debt_target, release.risks & TECH_DEBT_TARGET_RISKS
            )
            business_value_target_changes, budget_changes = [], []
            if "preliminary_phase" in release.measures:
                target_decrease = percentage(business_value_target, PRELIMINARY_PHASE_TARGET_DECREASE)
                business_value_target -= target_decrease
                business_value_target_changes.append({"cause": "preliminary_phase", "change": -target_decrease})
            for risk in RISKS:
                if risk in release.risks and risk in EXTRA_WORK:
                    target_percentage, target_points, extra_budget = EXTRA_WORK[risk]
                    target_increase = percentage(business_value_target, target_percentage) + target_points
                    business_value_target += target_increase
                    budget += extra_budget
                    business_value_target_changes.append({"cause": risk, "change": target_increase})
                    if extra_budget:
                        budget_changes.append({"cause": risk, "change": extra_budget})
            releases.append(
                {
                    "business_value_target": business_value_target,
                    "business_value_target_changes": business_value_target_changes,
                    "bugs_target": bugs_target,
                    "bugs_target_changes": bugs_target_changes,
                    "tech_debt_target": tech_debt_target,
                    "tech_debt_target_changes": tech_debt_target_changes,
                    "budget": budget,
                    "budget_changes": budget_changes,
                    # Het totale budget tot en met de release en wat het team tot en met de release heeft uitgegeven.
                    "cumulative_budget": budget + spent,
                    "cumulative_cost": spent + release.cost,
                    "developers": release.developers,
                    "testers": release.testers,
                    "velocity": release.velocity,
                    "velocity_changes": [
                        {"cause": cause, "change": change} for cause, change in release.velocity_changes
                    ],
                    "bug_fixing": release.bug_fixing,
                    "tech_debt": release.tech_debt,
                    "business_value_velocity": release.business_value_velocity,
                    "bug_fixing_capacity": release.bug_fixing_capacity,
                    "bug_fixing_capacity_changes": [
                        {"cause": cause, "change": change} for cause, change in release.bug_fixing_capacity_changes
                    ],
                    "tech_debt_capacity": release.tech_debt_capacity,
                    "tech_debt_capacity_changes": [
                        {"cause": cause, "change": change} for cause, change in release.tech_debt_capacity_changes
                    ],
                    **{card: getattr(release, card) for card in CARDS},
                    "open_cards": release.open_cards,
                    "risks": [risk for risk in RISKS if risk in release.risks],
                    "roles": [role for role in ROLES if role in release.roles],
                    "protected_risks": release.protected_risks,
                    "measures": [measure for measure in MEASURES if measure in release.measures],
                    "available_measures": available_measures(index, release),
                    "unavailable_measures": unavailable_measures(index, release),
                    "team_locked": release.team_locked,
                    "delivered_business_value": release.delivered_business_value,
                    "cumulative_business_value": release.cumulative_business_value,
                    "cumulative_bugs": release.cumulative_bugs,
                    "cumulative_tech_debt": release.cumulative_tech_debt,
                    "extra_developers": release.extra_developers,
                    "extra_testers": release.extra_testers,
                    "cost": release.cost,
                    "step": release.step,
                    "steps": self.steps(release),
                }
            )
            budget -= release.cost
            spent += release.cost
        spent = sum(release.cost for release in self.releases)
        return {
            "releases": releases,
            "completed_releases": self.completed_releases,
            "budget_target": budget + spent,
            "spent": spent,
            "remaining_budget": budget,
            "business_value_target": business_value_target,
            "bugs_target": bugs_target,
            "tech_debt_target": tech_debt_target,
            "business_value": self.releases[-1].cumulative_business_value,
            "open_bugs": self.releases[-1].cumulative_bugs,
            "open_tech_debt": self.releases[-1].cumulative_tech_debt,
        }


@dataclass
class Team:
    """Een team en zijn stand per ronde."""

    name: str
    rounds: list[Score] = field(default_factory=list)
    # Het geheim waarmee het team zijn eigen releases wijzigt. Het team krijgt het alleen bij het aanmelden.
    token: str = field(default_factory=lambda: secrets.token_urlsafe(16), compare=False, repr=False)

    def as_dict(self) -> TeamDict:
        """Geef het team en zijn stand per ronde als dictionary."""
        return {"name": self.name, "rounds": [score.as_dict() for score in self.rounds]}


class Game:
    """Een spel met nul of meer teams en LAST_ROUND rondes."""

    def __init__(self) -> None:
        self.teams: dict[str, Team] = {}
        self.round: int | None = None
        self.round_finished = False

    @property
    def started(self) -> bool:
        """Geef aan of het spel is gestart."""
        return self.round is not None

    @property
    def finished(self) -> bool:
        """Geef aan of het spel is afgelopen."""
        return self.round == LAST_ROUND and self.round_finished

    def register_team(self, name: str) -> Team:
        """Meld een nieuw team aan."""
        if self.started:
            raise GameError("Het spel is al gestart.")
        name = name.strip()
        if not name:
            raise GameError("Geef je team een naam.")
        if len(name) > MAX_TEAM_NAME_LENGTH:
            raise GameError(f"De naam van een team mag hoogstens {MAX_TEAM_NAME_LENGTH} tekens lang zijn.")
        if len(self.teams) >= MAX_TEAMS:
            raise GameError(f"Er kunnen hoogstens {MAX_TEAMS} teams meedoen.")
        if name.casefold() in (existing.casefold() for existing in self.teams):
            raise GameError(f"Er is al een team met de naam '{name}'.")
        team = self.teams[name] = Team(name)
        return team

    def start_round(self) -> None:
        """Start de volgende ronde. Alle teams beginnen met een nieuwe stand."""
        if self.finished:
            raise GameError("Het spel is afgelopen.")
        if self.started and not self.round_finished:
            raise GameError(f"Ronde {self.round} is nog bezig.")
        if not self.teams:
            raise GameError("Er moet minimaal één team zijn aangemeld.")
        self.round = (self.round or 0) + 1
        self.round_finished = False
        for team in self.teams.values():
            team.rounds.append(Score(round_number=self.round))

    def finish_round(self) -> None:
        """Stop de huidige ronde."""
        if not self.started:
            raise GameError("Het spel is nog niet gestart.")
        if self.round_finished:
            raise GameError(f"Ronde {self.round} is al afgelopen.")
        self.round_finished = True

    def current_score(self, team_name: str) -> Score:
        """Geef de stand van een team in de ronde die bezig is."""
        if team_name not in self.teams:
            raise UnknownTeamError(f"Er is geen team met de naam '{team_name}'.")
        if not self.started or self.round_finished:
            raise GameError("Er is geen ronde bezig.")
        return self.teams[team_name].rounds[-1]

    def plan_release(
        self,
        team_name: str,
        release_number: int,
        developers: int | None = None,
        testers: int | None = None,
        bug_fixing: int | None = None,
        tech_debt: int | None = None,
        risks: Iterable[str] | None = None,
        roles: Iterable[str] | None = None,
        measures: Iterable[str] | None = None,
        **cards: int,
    ) -> Team:
        """Plan de huidige release van een team: de ontwikkelaars en testers, de rollen (zie ROLES), de maatregelen
        (zie MEASURES), de besteding van de velocity, de risico's die zijn opgetreden (zie RISKS) en de kaartjes die
        het team heeft omgedraaid (zie CARDS).

        Alleen de opgegeven onderdelen veranderen. Als een onderdeel niet kan, verandert er niets.
        """
        if unknown := set(cards) - set(CARDS):
            raise TypeError(f"Onbekende kaartjes: {', '.join(sorted(unknown))}")
        if risks is not None and (unknown := set(risks) - set(RISKS)):
            raise GameError(f"Onbekende risico's: {', '.join(sorted(unknown))}")
        if roles is not None and (unknown := set(roles) - set(ROLES)):
            raise GameError(f"Onbekende rollen: {', '.join(sorted(unknown))}")
        if roles and self.round < ROLES_FROM_ROUND:
            raise GameError(f"Rollen kunnen pas vanaf ronde {ROLES_FROM_ROUND} worden ingezet.")
        if measures is not None:
            check_measures(set(measures), release_number, self.round)
        score = self.current_score(team_name)
        if not 1 <= release_number <= RELEASES_PER_ROUND:
            raise GameError(f"Release {release_number} bestaat niet; een ronde heeft {RELEASES_PER_ROUND} releases.")
        if release_number <= score.completed_releases:
            raise GameError(f"Release {release_number} is al afgerond.")
        if release_number != score.current_release:
            raise GameError(f"Release {release_number} is nog niet gestart.")
        if developers is not None and not 0 <= developers <= MAX_DEVELOPERS:
            raise GameError(f"Per release kunnen 0 tot en met {MAX_DEVELOPERS} ontwikkelaars worden ingehuurd.")
        if testers is not None and not 0 <= testers <= MAX_TESTERS:
            raise GameError(f"Per release kunnen 0 tot en met {MAX_TESTERS} testers worden ingehuurd.")
        score.cumulate()
        release = replace(score.releases[release_number - 1])
        if roles is not None:
            release.roles = frozenset(roles)
        if measures is not None:
            release.measures = frozenset(measures)
        if risks is not None:
            if protected := [risk for risk in RISKS if risk in set(risks) & release.protected_risks.keys()]:
                cause = release.protected_risks[protected[0]]
                reason = PROTECTION_REASONS.get(cause) or f"{(ROLES | MEASURES)[cause]} beschermt ertegen"
                raise GameError(f"{RISKS[protected[0]]} kan niet optreden: {reason}.")
            release.risks = frozenset(risks)
        # Een risico waartegen een nieuw ingezette rol of maatregel beschermt, kan niet meer optreden.
        release.risks -= release.protected_risks.keys()
        if developers is not None:
            release.developers = developers
        if testers is not None:
            release.testers = testers
        if release.team_locked:
            if developers or testers or roles:
                raise GameError("De voorfase is inclusief een voorfaseteam; het team kan geen mensen inhuren.")
            release.developers = release.testers = 0
            release.roles = frozenset()
        if measures is not None and (
            unmet := [measure for measure in MEASURES if measure in set(measures) & release.unmet_measures.keys()]
        ):
            raise GameError(f"{MEASURES[unmet[0]]} kan {release.unmet_measures[unmet[0]]}.")
        # Een maatregel waarvan de voorwaarde niet meer geldt, bijvoorbeeld omdat er geen tester meer is, vervalt.
        release.measures -= release.unmet_measures.keys()
        release.fit_velocity_split()
        if bug_fixing is not None:
            check_velocity(bug_fixing, release.velocity - release.tech_debt, "bugs")
            release.bug_fixing = bug_fixing
        if tech_debt is not None:
            check_velocity(tech_debt, release.velocity - release.bug_fixing, "technische schuld")
            release.tech_debt = tech_debt
        release.fit_cards()
        for card, count in cards.items():
            maximum = release.open_cards + getattr(release, card)
            if not 0 <= count <= maximum:
                raise GameError(f"Het team kan in deze release 0 tot en met {maximum} van deze kaartjes invoeren.")
            setattr(release, card, count)
        score.releases[release_number - 1] = release
        score.cumulate()
        return self.teams[team_name]

    def next_step(self, team_name: str) -> Team:
        """Ga in de huidige release van een team naar de volgende stap."""
        return self.change_step(team_name, 1, "Dit is de laatste stap van de release; rond de release af.")

    def previous_step(self, team_name: str) -> Team:
        """Ga in de huidige release van een team terug naar de vorige stap."""
        return self.change_step(team_name, -1, "Dit is de eerste stap van de release.")

    def change_step(self, team_name: str, direction: int, error: str) -> Team:
        """Ga in de huidige release van een team een stap verder (direction is 1) of terug (direction is -1)."""
        score = self.current_score(team_name)
        release = self.current_release(score)
        order = list(STEPS)
        steps = [
            step for step in score.steps(release) if (order.index(step) - order.index(release.step)) * direction > 0
        ]
        if not steps:
            raise GameError(error)
        release.step = steps[0] if direction > 0 else steps[-1]
        return self.teams[team_name]

    @staticmethod
    def current_release(score: Score) -> Release:
        """Geef de release waar het team aan werkt."""
        if score.current_release is None:
            raise GameError("Alle releases van deze ronde zijn al afgerond.")
        return score.releases[score.completed_releases]

    def finish_release(self, team_name: str) -> Team:
        """Rond de huidige release van een team af; daarmee start de volgende release."""
        score = self.current_score(team_name)
        self.current_release(score)
        if open_cards := score.releases[score.completed_releases].open_cards:
            verb = "moet" if open_cards == 1 else "moeten"
            raise GameError(f"Voer eerst alle omgedraaide kaartjes in; er {verb} er nog {open_cards} worden ingevoerd.")
        score.completed_releases += 1
        return self.teams[team_name]


def unavailable_measures(index: int, release: Release) -> dict[str, str]:
    """Geef de maatregelen die het team in de release (0 is de eerste) niet kan nemen, met de reden, gegeven de
    genomen maatregelen en de voorwaarden van de maatregelen."""
    unavailable = {measure: reason[0].upper() + reason[1:] for measure, reason in release.unmet_measures.items()}
    if index > 0:
        unavailable["preliminary_phase"] = "Alleen in de eerste release"
    elif "preliminary_phase" in release.measures:
        unavailable = dict.fromkeys(
            set(MEASURES) - {"preliminary_phase"}, f"Niet samen met de {MEASURES['preliminary_phase']}"
        )
    elif release.measures:
        unavailable["preliminary_phase"] = "Niet samen met andere maatregelen"
    return {measure: unavailable[measure] for measure in MEASURES if measure in unavailable}


def available_measures(index: int, release: Release) -> list[str]:
    """Geef de maatregelen die het team in de release (0 is de eerste) kan nemen."""
    return [measure for measure in MEASURES if measure not in unavailable_measures(index, release)]


def check_measures(measures: set[str], release_number: int, round_number: int) -> None:
    """Controleer of het team de maatregelen in de release kan nemen."""
    if unknown := measures - set(MEASURES):
        raise GameError(f"Onbekende maatregelen: {', '.join(sorted(unknown))}")
    if measures and round_number < MEASURES_FROM_ROUND:
        raise GameError(f"Maatregelen kunnen pas vanaf ronde {MEASURES_FROM_ROUND} worden genomen.")
    if "preliminary_phase" in measures and release_number > 1:
        raise GameError("De voorfase kan alleen in de eerste release worden gekozen.")
    if "preliminary_phase" in measures and len(measures) > 1:
        raise GameError("Met de voorfase kunnen in de eerste release geen andere maatregelen worden genomen.")


def check_velocity(velocity: int, available: int, purpose: str) -> None:
    """Controleer of de velocity die het team aan het oplossen van bugs of technische schuld wil besteden kan."""
    maximum = round_down(available)
    if not 0 <= velocity <= maximum:
        raise GameError(f"Er kan 0 tot en met {maximum} velocity aan het oplossen van {purpose} worden besteed.")
    if velocity % VELOCITY_PER_FIX:
        raise GameError(f"De velocity voor het oplossen van {purpose} moet een veelvoud van {VELOCITY_PER_FIX} zijn.")
