import assert from "node:assert/strict";
import {describe, test} from "node:test";

import {
  STORAGE_KEY, TOKEN_KEY, changesText, finishReleaseLabel, main, openCardsMessage, stepButtonLabel,
  registrationError,
} from "../../src/kwaliteitsaanpakspel/static/team.js";
import {REFRESH_INTERVAL} from "../../src/kwaliteitsaanpakspel/static/teams.js";
import {STEPS, TEAM_A, TEAM_B, fakeBrowser, gameState, headingText, resultsTexts, score} from "./fakes.js";

describe("finishReleaseLabel", () => {
  test("het team rondt de huidige release af en start de volgende", () => {
    assert.equal(finishReleaseLabel(score([0, 0, 0, 0])), "Rond release 1 af en start release 2");
    assert.equal(finishReleaseLabel(score([0, 0, 0, 0], 0, 0, 2)), "Rond release 3 af en start release 4");
  });

  test("na de laatste release is er geen volgende release", () => {
    assert.equal(finishReleaseLabel(score([0, 0, 0, 0], 0, 0, 3)), "Rond release 4 af");
  });

  test("als alle releases zijn afgerond, is er niets meer af te ronden", () => {
    assert.equal(finishReleaseLabel(score([0, 0, 0, 0], 0, 0, 4)), null);
  });
});

describe("stappen", () => {
  const labels = Object.fromEntries(STEPS.map(({key, label}) => [key, label]));
  const release = (step, steps = ["team", "risks", "velocity", "cards"]) => ({step, steps});

  test("de knop naar de volgende stap noemt die stap", () => {
    assert.equal(stepButtonLabel(release("team"), labels, 1), "Volgende stap: ⚠️ Risico's");
    assert.equal(stepButtonLabel(release("measures", ["measures", "cards"]), labels, 1), "Volgende stap: 🛠️ Bouw en test");
  });

  test("de knop naar de vorige stap noemt die stap", () => {
    assert.equal(stepButtonLabel(release("velocity"), labels, -1), "Vorige stap: ⚠️ Risico's");
  });

  test("voor de eerste stap is er geen vorige stap", () => {
    assert.equal(stepButtonLabel(release("team"), labels, -1), null);
  });

  test("na de laatste stap is er geen volgende stap", () => {
    assert.equal(stepButtonLabel(release("cards"), labels, 1), null);
  });
});

describe("openCardsMessage", () => {
  test("als alle kaartjes zijn ingevoerd, is er geen melding", () => {
    assert.equal(openCardsMessage(0), null);
  });

  test("de melding noemt het aantal kaartjes dat nog moet worden ingevoerd", () => {
    assert.equal(openCardsMessage(1), "Voer nog 1 omgedraaid kaartje in.");
    assert.equal(openCardsMessage(3), "Voer nog 3 omgedraaide kaartjes in.");
  });
});

describe("changesText", () => {
  const labels = {data_loss: "🔥 Dataloss in productie", impromptu_demo: "👩🏼‍🏫 Impromptu demo"};

  test("zonder veranderingen is er geen uitleg", () => {
    assert.equal(changesText([], labels), "");
  });

  test("per risico een regel met de verandering", () => {
    const changes = [{cause: "data_loss", change: -3}, {cause: "impromptu_demo", change: 4}];
    assert.equal(changesText(changes, labels), "🔥 Dataloss in productie −3\n👩🏼‍🏫 Impromptu demo +4");
  });

  test("de verandering kan worden opgemaakt, bijvoorbeeld als bedrag", () => {
    const changes = [{cause: "data_loss", change: 300}];
    assert.equal(changesText(changes, labels, amount => `${amount} €CTU`), "🔥 Dataloss in productie +300 €CTU");
  });
});

describe("registrationError", () => {
  test("de foutmelding van de server wordt getoond", () => {
    assert.equal(registrationError({detail: "Het spel is al gestart."}), "Het spel is al gestart.");
  });

  test("validatiefouten worden vervangen door een algemene foutmelding", () => {
    assert.equal(registrationError({detail: [{msg: "Field required"}]}), "Aanmelden is niet gelukt.");
  });
});

const NEW_TEAM_A = {name: "Team A", rounds: []};

function routes(teams, game, extra = {}) {
  return {"GET /api/teams": [200, teams], "GET /api/game": [200, game], ...extra};
}

const ROUND_2_STEPS = ["team", "measures", "risks", "velocity", "cards"];

// Het team, met de releases van de laatste ronde in de opgegeven stap.
function atStep(team, step, steps = undefined) {
  const last = team.rounds.length - 1;
  const rounds = team.rounds.map((round, index) => (index < last ? round : {
    ...round, releases: round.releases.map(release => ({...release, step, ...(steps && {steps})})),
  }));
  return {...team, rounds};
}

function visibleScreens(browser) {
  return ["register", "team", "waiting", "playing", "results"].filter(id => !browser.element(id).hidden);
}

// Het invoerelement in een cel: een keuzelijst (tussen de knopjes − en +) of een vinkje, na een eventueel slotje.
function control(cell) {
  const stepper = cell.children.find(child => child.className === "stepper");
  return (stepper ?? cell).children.find(child => ["SELECT", "INPUT"].includes(child.tagName));
}

function selects(browser, row = "release-developers") {
  return browser.element(row).children.map(control);
}

// De keuzelijsten voor de kaartjes van de eerste release, per soort kaartje.
function cardSelects(browser) {
  const rows = {
    one_point_cards: "release-one-point-cards", two_point_cards: "release-two-point-cards",
    three_point_cards: "release-three-point-cards", bug_cards: "release-delivered-bugs",
    tech_debt_cards: "release-delivered-tech-debt",
  };
  return Object.fromEntries(Object.entries(rows).map(([card, row]) => [card, selects(browser, row)[0]]));
}

// De vinkjes per risico, per release.
function riskCheckboxes(browser) {
  const [dataLoss, externalAudit] = browser.element("risks").children;
  const checkboxes = (row, labels) => row.children.slice(labels).map(cell => cell.children[1]);
  return {data_loss: checkboxes(dataLoss, 2), external_audit: checkboxes(externalAudit, 1)};
}

function deliveredBusinessValueTotals(browser) {
  return browser.element("release-delivered-business-value").children.map(cell => cell.textContent);
}

function testerSelects(browser) {
  return selects(browser, "release-testers");
}

function releaseTable(browser) {
  const texts = id => browser.element(id).children.map(cell => cell.textContent);
  const values = id => browser.element(id).children.map(cell => cell.children[0]);
  return {
    headings: texts("release-headings"),
    targets: values("release-business-value-targets").map(value => value.textContent),
    bugsTargets: values("release-bugs-targets").map(value => value.textContent),
    techDebtTargets: values("release-tech-debt-targets").map(value => value.textContent),
    budgets: values("release-budgets").map(value => value.textContent),
    negative: values("release-budgets").map(value => value.classes.has("negative")),
    current: browser.element("release-headings").children.map(cell => cell.classes.has("current")),
    developers: selects(browser).map(select => select.value),
    testers: testerSelects(browser).map(select => select.value),
    velocities: values("release-velocities").map(value => value.textContent),
    bugFixing: selects(browser, "release-bug-fixing").map(select => select.value),
    techDebt: selects(browser, "release-tech-debt").map(select => select.value),
    businessValueVelocities: texts("release-business-value-velocities"),
    bugFixingCapacities: values("release-bug-fixing-capacities").map(value => value.textContent),
    techDebtCapacities: values("release-tech-debt-capacities").map(value => value.textContent),
  };
}

async function register(browser, name) {
  let defaultPrevented = false;
  browser.element("name").value = name;
  await browser.element("register").dispatch("submit", {preventDefault: () => { defaultPrevented = true; }});
  return defaultPrevented;
}

describe("main", () => {
  test("een nieuw team ziet het aanmeldformulier", async t => {
    const browser = fakeBrowser(t, routes([], gameState()));
    await main();
    assert.equal(browser.element("register").hidden, false);
    assert.deepEqual(browser.server.requests, []);
    assert.equal(browser.timers.intervals.size, 0);
  });

  test("na het aanmelden wacht het team op de start", async t => {
    const browser = fakeBrowser(t, routes([NEW_TEAM_A], gameState(), {"POST /api/teams": [201, {...NEW_TEAM_A, token: "geheim"}]}));
    await main();
    assert.equal(await register(browser, "Team A"), true);
    const [request] = browser.server.posts();
    assert.equal(request.options.body, JSON.stringify({name: "Team A"}));
    assert.equal(browser.storage.getItem(STORAGE_KEY), "Team A");
    assert.deepEqual(visibleScreens(browser), ["team", "waiting"]);
    assert.equal(browser.element("team-name").textContent, "Team A");
    assert.deepEqual([browser.element("status").hidden, browser.element("status").textContent],
      [false, "Wacht tot de spelleider het spel start"]);
    assert.deepEqual([...browser.timers.intervals.values()].map(({delay}) => delay), [REFRESH_INTERVAL]);
  });

  test("het team bewaart het token dat het bij het aanmelden krijgt en stuurt het mee bij wijzigingen", async t => {
    const browser = fakeBrowser(t, routes([NEW_TEAM_A], gameState(), {"POST /api/teams": [201, {...NEW_TEAM_A, token: "geheim"}]}));
    await main();
    await register(browser, "Team A");
    assert.equal(browser.storage.getItem(TOKEN_KEY), "geheim");
    browser.server.routes["GET /api/teams"] = [200, [{name: "Team A", rounds: [score([0, 0, 0, 0])]}]];
    browser.server.routes["GET /api/game"] = [200, gameState(1)];
    browser.server.routes["POST /api/teams/Team%20A/finish-release"] = [200, NEW_TEAM_A];
    await browser.timers.tick();
    await browser.element("finish-release").dispatch("click");
    browser.server.routes["PUT /api/teams/Team%20A/releases/1"] = [200, NEW_TEAM_A];
    await selects(browser)[0].dispatch("change");
    const changes = browser.server.requests.filter(request => !request.route.startsWith("GET") && request.route !== "POST /api/teams");
    assert.deepEqual(changes.map(request => request.options.headers["X-Team-Token"]), ["geheim", "geheim"]);
    assert.equal(changes[1].options.headers["Content-Type"], "application/json");
  });

  test("met de link van de spelleider komt een team weer in het spel", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {}, "#team=Team+A&token=nieuw");
    await main();
    assert.deepEqual([browser.storage.getItem(STORAGE_KEY), browser.storage.getItem(TOKEN_KEY)], ["Team A", "nieuw"]);
    assert.deepEqual(browser.history.replaced, [[null, "", "/"]]);
    assert.deepEqual(visibleScreens(browser), ["team", "playing"]);
  });

  test("als het team de link in een open tabblad plakt, laadt de pagina opnieuw", async t => {
    const browser = fakeBrowser(t, routes([], gameState()));
    await main();
    browser.windowListeners.hashchange();
    assert.equal(browser.location.reloads, 1);
  });

  test("een link zonder token wordt genegeerd", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {}, "#team=Team+A");
    await main();
    assert.equal(browser.storage.getItem(STORAGE_KEY), null);
    assert.deepEqual(browser.history.replaced, []);
  });

  test("een team dat zonder token is aangemeld, meldt zich opnieuw aan", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A"});
    await main();
    assert.equal(browser.element("register").hidden, false);
    assert.equal(browser.storage.getItem(STORAGE_KEY), null);
    assert.deepEqual(browser.server.requests, []);
  });

  test("een mislukte aanmelding toont de foutmelding", async t => {
    const detail = "Er is al een team met de naam 'Team A'.";
    const browser = fakeBrowser(t, routes([NEW_TEAM_A], gameState(), {"POST /api/teams": [409, {detail}]}));
    await main();
    await register(browser, "Team A");
    assert.equal(browser.element("error").textContent, detail);
    assert.equal(browser.storage.getItem(STORAGE_KEY), null);
    assert.equal(browser.element("register").hidden, false);
  });

  test("tijdens een ronde ziet het team per release het budget, de ontwikkelaars en de kosten", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A, TEAM_B], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.deepEqual(visibleScreens(browser), ["team", "playing"]);
    assert.equal(browser.element("status").textContent, "Ronde 2");
    assert.equal(browser.element("status").hidden, false);
    assert.equal(browser.element("release-bar").hidden, false);
    const releases = releaseTable(browser);
    assert.deepEqual(releases.headings, ["Release 1", "Release 2", "Release 3", "Release 4"]);
    assert.deepEqual(releases.targets, [80, 80, 80, 80]);
    assert.deepEqual(releases.bugsTargets, [4, 4, 4, 4]);
    assert.deepEqual(releases.techDebtTargets, [4, 4, 4, 4]);
    assert.deepEqual(releases.budgets, ["2.000 €CTU", "1.000 €CTU", "0 €CTU", "−500 €CTU"]);
    assert.deepEqual(releases.negative, [false, false, false, true]);
    assert.deepEqual(releases.developers, ["10", "10", "5", "0"]);
    assert.deepEqual(releases.velocities, [32, 32, 22, 0]);
    assert.deepEqual(releases.bugFixing, ["0", "0", "0", "0"]);
    assert.deepEqual(releases.techDebt, ["0", "0", "0", "0"]);
    assert.deepEqual(releases.businessValueVelocities, [32, 32, 22, 0]);
    assert.deepEqual(releases.bugFixingCapacities, [0, 0, 0, 0]);
    assert.deepEqual(releases.techDebtCapacities, [0, 0, 0, 0]);
  });

  test("alleen de huidige release is gemarkeerd en te wijzigen", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.deepEqual(releaseTable(browser).current, [false, false, true, false]);
    const testerCells = browser.element("release-testers").children;
    assert.deepEqual(testerCells.map(cell => cell.classes.has("current")), [false, false, true, false]);
    assert.deepEqual(selects(browser).map(select => select.disabled), [true, true, false, true]);
    assert.deepEqual(testerSelects(browser).map(select => select.disabled), [true, true, false, true]);
    assert.equal(browser.element("finish-release").hidden, true);
    assert.equal(browser.element("releases-done").hidden, true);
  });

  test("het team rondt de huidige release af en gaat door met de volgende", async t => {
    const next = atStep({name: "Team A", rounds: [TEAM_A.rounds[0], score([10, 10, 5, 0], 9, 0, 3)]}, "cards");
    const browser = fakeBrowser(
      t, routes([atStep(TEAM_A, "cards")], gameState(2), {"POST /api/teams/Team%20A/finish-release": [200, next]}),
      {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"},
    );
    await main();
    browser.server.routes["GET /api/teams"] = [200, [next]];
    await browser.element("finish-release").dispatch("click");
    assert.deepEqual(browser.server.posts().map(request => request.route), ["POST /api/teams/Team%20A/finish-release"]);
    assert.deepEqual(releaseTable(browser).current, [false, false, false, true]);
    assert.equal(browser.element("finish-release").textContent, "Rond release 4 af");
  });

  test("als alle releases zijn afgerond, wacht het team op het einde van de ronde", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.deepEqual(releaseTable(browser).current, [false, false, false, false]);
    assert.deepEqual(selects(browser).map(select => select.disabled), [true, true, true, true]);
    assert.deepEqual(testerSelects(browser).map(select => select.disabled), [true, true, true, true]);
    assert.equal(browser.element("finish-release").hidden, true);
    assert.equal(browser.element("finish-release").textContent, "");
    assert.equal(browser.element("releases-done").hidden, false);
  });

  test("per release kunnen 0 tot en met het maximum aantal ontwikkelaars worden gekozen", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const [select] = selects(browser);
    assert.deepEqual(select.children.map(option => [option.value, option.textContent]),
      Array.from({length: 11}, (_, index) => [String(index), String(index)]));
  });

  test("met de knopjes − en + kiest het team de vorige of volgende waarde", async t => {
    const started = {name: "Team A", rounds: [score([3, 0, 0, 0])]};
    const browser = fakeBrowser(t, routes([started], gameState(1), {"PUT /api/teams/Team%20A/releases/1": [200, started]}),
      {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const stepper = row => browser.element(row).children[0].children.find(child => child.className === "stepper");
    const [minus, select, plus] = stepper("release-developers").children;
    assert.deepEqual([minus.textContent, minus.ariaLabel, select.tagName, plus.textContent, plus.ariaLabel], ["−", "Minder", "SELECT", "+", "Meer"]);
    assert.deepEqual([minus.disabled, plus.disabled], [false, false]);
    await plus.dispatch("click");
    await minus.dispatch("click");
    const bodies = browser.server.requests.filter(request => request.route.startsWith("PUT")).map(request => request.options.body);
    assert.deepEqual(bodies, [JSON.stringify({developers: 4}), JSON.stringify({developers: 2})]);
  });

  test("de knopjes − en + werken in stappen van 2 voor de velocity voor bugs", async t => {
    const started = {name: "Team A", rounds: [score([3, 0, 0, 0], 0, 0, 0, {bugFixing: [4, 0, 0, 0]})]};
    const browser = fakeBrowser(t, routes([started], gameState(1), {"PUT /api/teams/Team%20A/releases/1": [200, started]}),
      {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const [, , plus] = browser.element("release-bug-fixing").children[0].children[0].children;
    await plus.dispatch("click");
    const [request] = browser.server.requests.filter(request => request.route.startsWith("PUT"));
    assert.equal(request.options.body, JSON.stringify({bug_fixing: 6}));
  });

  test("bij de kleinste of grootste waarde, of buiten de huidige release, staan de knopjes uit", async t => {
    const team = {name: "Team A", rounds: [score([0, 10, 0, 0], 0, 0, 1)]};
    const browser = fakeBrowser(t, routes([team], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const buttons = index => {
      const [minus, , plus] = browser.element("release-developers").children[index].children
        .find(child => child.className === "stepper").children;
      return [minus.disabled, plus.disabled];
    };
    assert.deepEqual(buttons(1), [false, true]);  // 10 ontwikkelaars: het maximum
    assert.deepEqual(buttons(0), [true, true]);  // niet de huidige release
  });

  test("per release kunnen 0 tot en met het maximum aantal testers worden gekozen", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const [select] = testerSelects(browser);
    assert.deepEqual(select.children.map(option => option.value), ["0", "1", "2", "3", "4", "5"]);
  });

  test("het team kan testers inhuren voor een release", async t => {
    const started = {name: "Team A", rounds: [score([5, 0, 0, 0], 0, 0, 1)]};
    const hired = {name: "Team A", rounds: [score([5, 0, 0, 0], 0, 0, 1, {testers: [0, 2, 0, 0]})]};
    const browser = fakeBrowser(
      t, routes([started], gameState(1), {"PUT /api/teams/Team%20A/releases/2": [200, hired]}), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"},
    );
    await main();
    browser.server.routes["GET /api/teams"] = [200, [hired]];
    const select = testerSelects(browser)[1];
    select.value = "2";
    await select.dispatch("change");
    const [request] = browser.server.requests.filter(request => request.route.startsWith("PUT"));
    assert.equal(request.options.body, JSON.stringify({testers: 2}));
    const releases = releaseTable(browser);
    assert.deepEqual(releases.testers, ["0", "2", "0", "0"]);
    assert.deepEqual(releases.developers, ["5", "0", "0", "0"]);
    assert.deepEqual(releases.budgets, ["2.000 €CTU", "1.500 €CTU", "1.300 €CTU", "1.300 €CTU"]);
  });

  test("een keuzelijst voor testers waar het team mee bezig is, wordt niet overschreven", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const [first, second] = testerSelects(browser);
    browser.document.activeElement = first;
    first.value = "3";
    browser.server.routes["GET /api/teams"] = [200, [{name: "Team A", rounds: [score([0, 0, 0, 0], 0, 0, 0, {testers: [0, 4, 0, 0]})]}]];
    await browser.timers.tick();
    assert.equal(first.value, "3");
    assert.equal(second.value, "4");
  });

  test("het team verdeelt de velocity over bugs, technische schuld en business waarde", async t => {
    const started = {name: "Team A", rounds: [score([3, 0, 0, 0])]};
    const planned = {name: "Team A", rounds: [score([3, 0, 0, 0], 0, 0, 0, {testers: [1, 0, 0, 0], bugFixing: [6, 0, 0, 0]})]};
    const browser = fakeBrowser(
      t, routes([started], gameState(1), {"PUT /api/teams/Team%20A/releases/1": [200, planned]}), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"},
    );
    await main();
    const [bugFixingSelect] = selects(browser, "release-bug-fixing");
    // De even getallen 0 tot en met 12, want de velocity is 13.
    assert.deepEqual(bugFixingSelect.children.map(option => option.value), ["0", "2", "4", "6", "8", "10", "12"]);
    browser.server.routes["GET /api/teams"] = [200, [planned]];
    bugFixingSelect.value = "6";
    await bugFixingSelect.dispatch("change");
    const [request] = browser.server.requests.filter(request => request.route.startsWith("PUT"));
    assert.equal(request.options.body, JSON.stringify({bug_fixing: 6}));
    const releases = releaseTable(browser);
    assert.deepEqual(releases.bugFixing, ["6", "0", "0", "0"]);
    assert.deepEqual(releases.businessValueVelocities, [7, 0, 0, 0]);
    // Eén tester lost 4 bugs op en 6 velocity lost er 3 op.
    assert.deepEqual(releases.bugFixingCapacities, [7, 0, 0, 0]);
    // Na 6 velocity voor bugs blijft er 7 over voor technische schuld, dus maximaal 6.
    assert.deepEqual(selects(browser, "release-tech-debt")[0].children.map(option => option.value), ["0", "2", "4", "6"]);
    assert.equal(bugFixingSelect.children.length, 7);
  });

  test("het team kan velocity besteden aan technische schuld", async t => {
    const started = {name: "Team A", rounds: [score([3, 0, 0, 0])]};
    const planned = {name: "Team A", rounds: [score([3, 0, 0, 0], 0, 0, 0, {techDebt: [4, 0, 0, 0]})]};
    const browser = fakeBrowser(
      t, routes([started], gameState(1), {"PUT /api/teams/Team%20A/releases/1": [200, planned]}), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"},
    );
    await main();
    browser.server.routes["GET /api/teams"] = [200, [planned]];
    const [techDebtSelect] = selects(browser, "release-tech-debt");
    techDebtSelect.value = "4";
    await techDebtSelect.dispatch("change");
    const [request] = browser.server.requests.filter(request => request.route.startsWith("PUT"));
    assert.equal(request.options.body, JSON.stringify({tech_debt: 4}));
    assert.deepEqual(releaseTable(browser).businessValueVelocities, [9, 0, 0, 0]);
    assert.deepEqual(releaseTable(browser).techDebtCapacities, [2, 0, 0, 0]);
    // Na 4 velocity voor technische schuld blijft er 9 over voor bugs, dus maximaal 8.
    assert.equal(selects(browser, "release-bug-fixing")[0].children.length, 5);
  });

  test("de keuzelijsten voor de kaartjes zijn alleen in de huidige release te wijzigen en doen mee met de markering", async t => {
    const browser = fakeBrowser(t, routes([atStep(TEAM_A, "cards")], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    for (const row of ["release-one-point-cards", "release-two-point-cards", "release-three-point-cards",
      "release-delivered-bugs", "release-delivered-tech-debt"]) {
      assert.deepEqual(selects(browser, row).map(select => select.disabled), [true, true, false, true], row);
      assert.deepEqual(browser.element(row).children.map(cell => cell.classes.has("current")), [false, false, true, false], row);
    }
  });

  test("de keuzelijsten voor de velocity zijn alleen in de huidige release te wijzigen", async t => {
    const browser = fakeBrowser(t, routes([atStep(TEAM_A, "velocity")], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    for (const row of ["release-bug-fixing", "release-tech-debt"]) {
      assert.deepEqual(selects(browser, row).map(select => select.disabled), [true, true, false, true]);
    }
  });

  test("het team voert de omgedraaide kaartjes in met keuzelijsten", async t => {
    // 1 ontwikkelaar: velocity 4, dus 4 kaartjes.
    const started = {name: "Team A", rounds: [score([1, 0, 0, 0])]};
    const entered = {name: "Team A", rounds: [score([1, 0, 0, 0], 0, 0, 0, {cards: [{two_point_cards: 3}, {}, {}, {}]})]};
    const browser = fakeBrowser(
      t, routes([started], gameState(1), {"PUT /api/teams/Team%20A/releases/1": [200, entered]}), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"},
    );
    await main();
    const delivered = cardSelects(browser);
    assert.deepEqual(delivered.two_point_cards.children.map(option => option.value), ["0", "1", "2", "3", "4"]);
    browser.server.routes["GET /api/teams"] = [200, [entered]];
    delivered.two_point_cards.value = "3";
    await delivered.two_point_cards.dispatch("change");
    const [request] = browser.server.requests.filter(request => request.route.startsWith("PUT"));
    assert.equal(request.options.body, JSON.stringify({two_point_cards: 3}));
    // Er is nog 1 kaartje over, dus de andere keuzelijsten gaan tot 1 en die voor 2 punten tot 4.
    assert.deepEqual(cardSelects(browser).bug_cards.children.map(option => option.value), ["0", "1"]);
    assert.equal(cardSelects(browser).two_point_cards.children.length, 5);
    assert.equal(deliveredBusinessValueTotals(browser)[0], 6);
  });

  test("het team voert bugs en technische schuld in met keuzelijsten", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    browser.server.routes["PUT /api/teams/Team%20A/releases/1"] = [200, TEAM_A];
    const delivered = cardSelects(browser);
    for (const card of ["bug_cards", "tech_debt_cards"]) {
      delivered[card].value = "2";
      await delivered[card].dispatch("change");
    }
    const bodies = browser.server.requests.filter(request => request.route.startsWith("PUT")).map(request => request.options.body);
    assert.deepEqual(bodies, [JSON.stringify({bug_cards: 2}), JSON.stringify({tech_debt_cards: 2})]);
  });

  test("het team kan de release pas afronden als alle omgedraaide kaartjes zijn ingevoerd", async t => {
    const browser = fakeBrowser(t, routes([atStep(TEAM_A, "cards")], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    // Onderaan de kaart staat dan in plaats van de knop hoeveel kaartjes er nog moeten worden ingevoerd.
    assert.deepEqual(["release-finish", "finish-release"].map(id => browser.element(id).hidden), [false, true]);
    assert.equal(browser.element("open-cards").hidden, false);
    assert.equal(browser.element("open-cards").textContent, "Voer nog 22 omgedraaide kaartjes in.");
  });

  test("als alle omgedraaide kaartjes zijn ingevoerd, kan het team de release afronden", async t => {
    const entered = {name: "Team A", rounds: [score([1, 0, 0, 0], 0, 0, 0, {cards: [{one_point_cards: 2, bug_cards: 2}, {}, {}, {}]})]};
    const browser = fakeBrowser(t, routes([atStep(entered, "cards")], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.deepEqual(["release-finish", "finish-release"].map(id => browser.element(id).hidden), [false, false]);
    assert.equal(browser.element("open-cards").hidden, true);
    assert.equal(browser.element("open-cards").textContent, "");
  });

  test("wat het team cumulatief heeft opgeleverd, staat er ook voor toekomstige releases", async t => {
    const cards = [{three_point_cards: 2, bug_cards: 3, tech_debt_cards: 1}, {one_point_cards: 1, bug_cards: 1}, {}, {}];
    const team = {name: "Team A", rounds: [score([1, 1, 0, 0], 0, 0, 1, {testers: [0, 1, 0, 0], cards})]};
    const browser = fakeBrowser(t, routes([team], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    // In toekomstige releases is nog niets opgeleverd; het cumulatief is daar de stand tot nu toe.
    assert.deepEqual(deliveredBusinessValueTotals(browser), [6, 1, 0, 0]);
    const texts = id => browser.element(id).children.map(cell => cell.textContent);
    assert.deepEqual(texts("release-cumulative-business-value"), [6, 7, 7, 7]);
    // Release 2: 3 open bugs plus 1 nieuwe, min 4 opgelost door 1 tester.
    assert.deepEqual(texts("release-cumulative-bugs"), [3, 0, 0, 0]);
    assert.deepEqual(texts("release-cumulative-tech-debt"), [1, 1, 1, 1]);
  });

  test("er is een rij per risico, met de kop over alle rijen", async t => {
    const team = {name: "Team A", rounds: [score([0, 0, 0, 0], 0, 0, 0, {step: "risks"})]};
    const browser = fakeBrowser(t, routes([team], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const rows = browser.element("risks").children;
    // Twee risico's en een verborgen regel voor als de groep is ingeklapt en er niets is aangevinkt.
    assert.deepEqual(rows.map(row => row.hidden), [false, false, true]);
    const [heading, firstLabel] = rows[0].children;
    assert.deepEqual([heading.tagName, heading.rowSpan, headingText(heading)], ["TH", 2, "⚠️ Risico's"]);
    assert.deepEqual([firstLabel.textContent, rows[1].children[0].textContent], ["🔥 Dataloss in productie", "☑️ Externe audit"]);
  });

  test("buiten de stap voor de risico's zijn die ingeklapt; aangevinkte risico's blijven zichtbaar", async t => {
    const team = {name: "Team A", rounds: [score([1, 1, 0, 0], 0, 0, 1, {risks: [[], ["external_audit"], [], []]})]};
    const browser = fakeBrowser(t, routes([team], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const [dataLoss, externalAudit, empty] = browser.element("risks").children;
    const heading = externalAudit.children[0];  // de kop staat bij de eerste zichtbare rij
    const toggle = heading.children[0];
    assert.deepEqual([toggle.tagName, toggle.className, toggle.textContent], ["BUTTON", "toggle", "⚠️ Risico's"]);
    assert.deepEqual([dataLoss.hidden, externalAudit.hidden, empty.hidden, heading.rowSpan], [true, false, true, 1]);
    assert.deepEqual([toggle.ariaExpanded, toggle.title], ["false", "Klik om uit te klappen"]);
    await toggle.dispatch("click");
    assert.deepEqual([dataLoss.hidden, externalAudit.hidden, dataLoss.children[0], heading.rowSpan], [false, false, heading, 2]);
    assert.deepEqual([toggle.ariaExpanded, toggle.title], ["true", "Klik om in te klappen"]);
    await toggle.dispatch("click");
    assert.deepEqual([dataLoss.hidden, externalAudit.hidden], [true, false]);
  });

  test("bij een nieuwe stap is alleen de groep van die stap uitgeklapt", async t => {
    const teamAt = step => atStep(TEAM_A, step, ["team", "measures", "risks", "velocity", "cards"]);
    const browser = fakeBrowser(t, routes([teamAt("team")], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const risksExpanded = () => !browser.element("risks").children[0].hidden;
    const toggle = () => browser.element("risks").children.find(row => !row.hidden).children[0].children[0];
    await toggle().dispatch("click");  // het team klapt de risico's zelf uit
    await browser.timers.tick();
    assert.equal(risksExpanded(), true);  // zolang de stap dezelfde is, blijft dat zo
    browser.server.routes["GET /api/teams"] = [200, [teamAt("risks")]];
    await browser.timers.tick();
    assert.deepEqual([risksExpanded(), toggle().disabled], [true, true]);
    browser.server.routes["GET /api/teams"] = [200, [teamAt("velocity")]];
    await browser.timers.tick();
    assert.deepEqual([risksExpanded(), toggle().disabled], [false, false]);
  });

  test("ingeklapt zonder aangevinkte risico's staat er een regel dat er niets is aangevinkt", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const [dataLoss, externalAudit, empty] = browser.element("risks").children;
    assert.deepEqual([dataLoss.hidden, externalAudit.hidden, empty.hidden], [true, true, false]);
    assert.equal(empty.children[1].textContent, "Geen risico's aangevinkt");
    assert.equal(empty.children.length, 2 + 4);  // de kop, de tekst en een cel per release
  });

  test("de huidige release is één kaart, van de kop van de release tot de onderkant van de tabel", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    browser.element("releases-area").rect = {left: 100, top: 50};
    browser.element("releases").rect = {bottom: 1250};
    browser.element("release-headings").children[2].rect = {left: 700, top: 60, width: 120};  // release 3 is bezig
    browser.windowListeners.resize();
    for (const id of ["current-column-plate", "current-column-frame"]) {
      const card = browser.element(id);
      assert.deepEqual([card.hidden, card.style.left, card.style.top, card.style.width, card.style.height],
        [false, "600px", "10px", "120px", "1190px"], id);
    }
  });

  test("de grafieken verdelen de hoogte van de grafiekkolom, binnen een minimum en een maximum", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const height = () => browser.element("budget-chart").attributes.height;
    assert.equal(height(), "120");  // zonder bekende hoogte: het minimum
    // Zonder bekende breedte staan de grafieken onder elkaar: vier rijen.
    for (const [available, expected] of [[1000, "189"], [2000, "320"], [300, "120"]]) {
      browser.element("charts").clientHeight = available;
      browser.windowListeners.resize();
      assert.equal(height(), expected, `${available}px`);
      assert.equal(browser.element("budget-chart").attributes.viewBox, `0 0 280 ${expected}`);
    }
  });

  test("met ruimte voor twee grafieken naast elkaar verdelen twee rijen de hoogte en twee kolommen de breedte", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const size = () => ["width", "height"].map(name => browser.element("budget-chart").attributes[name]);
    // Twee grafieken naast elkaar zijn minimaal 220 pixels breed; past dat niet, dan staan ze onder elkaar.
    for (const [available, expected] of [[584, ["264", "239"]], [464, ["204", "239"]], [463, ["447", "120"]]]) {
      Object.assign(browser.element("charts"), {clientWidth: available, clientHeight: 600});
      browser.windowListeners.resize();
      assert.deepEqual(size(), expected, `${available}px`);
    }
  });

  test("als het venster van grootte verandert voordat het spel loopt, gebeurt er niets met de grafieken", async t => {
    const browser = fakeBrowser(t, routes([], gameState()));
    await main();
    browser.windowListeners.resize();
    assert.equal(browser.element("budget-chart").attributes.height, undefined);
  });

  test("als alle releases zijn afgerond, is er geen kaart voor de huidige release", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.deepEqual(["current-column-plate", "current-column-frame"].map(id => browser.element(id).hidden), [true, true]);
  });

  test("in- en uitklappen legt de kaart van de huidige release opnieuw over de kolom", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    browser.element("releases").rect = {bottom: 900};
    await browser.element("delivered-business-value-label").children[0].dispatch("click");
    assert.equal(browser.element("current-column-frame").style.height, "900px");
    browser.element("releases").rect = {bottom: 700};
    await browser.element("risks").children.find(row => !row.hidden).children[0].children[0].dispatch("click");
    assert.equal(browser.element("current-column-frame").style.height, "700px");
  });

  test("buiten de stap Bouw en test zijn de rijen met de kaartjes ingeklapt onder de business waarde", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const label = browser.element("delivered-business-value-label");
    const [toggle] = label.children;
    const cardRows = ["release-one-point-cards", "release-two-point-cards", "release-three-point-cards"].map(browser.element);
    assert.deepEqual([toggle.tagName, toggle.ariaExpanded, cardRows.map(row => row.hidden), browser.element("delivered-heading").rowSpan],
      ["BUTTON", "false", [true, true, true], 3]);
    await toggle.dispatch("click");
    assert.deepEqual([toggle.ariaExpanded, cardRows.map(row => row.hidden), browser.element("delivered-heading").rowSpan],
      ["true", [false, false, false], 6]);
    await toggle.dispatch("click");
    assert.deepEqual(cardRows.map(row => row.hidden), [true, true, true]);
  });

  test("ook de maatregelen zijn ingeklapt buiten de stap voor de maatregelen", async t => {
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([0, 0, 0, 0], 0, 0, 0, {measures: [["security_test"], [], [], []]})]};
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    // In de eerste stap, het team, zijn de maatregelen ingeklapt.
    const [preliminaryPhase, securityTest, empty] = browser.element("measures").children;
    assert.deepEqual([preliminaryPhase.hidden, securityTest.hidden, empty.hidden], [true, false, true]);
    assert.equal(empty.children.at(-1).tagName, "TD");
  });

  test("per release is er per risico een vinkje, alleen te wijzigen in de huidige release", async t => {
    const team = {name: "Team A", rounds: [score([1, 1, 1, 0], 0, 0, 2, {risks: [["external_audit"], [], ["data_loss"], []], step: "risks"})]};
    const browser = fakeBrowser(t, routes([team], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const checkboxes = riskCheckboxes(browser);
    assert.deepEqual(checkboxes.data_loss.map(checkbox => checkbox.checked), [false, false, true, false]);
    assert.deepEqual(checkboxes.external_audit.map(checkbox => checkbox.checked), [true, false, false, false]);
    assert.deepEqual(checkboxes.data_loss.map(checkbox => checkbox.disabled), [true, true, false, true]);
    assert.deepEqual(checkboxes.data_loss.map(checkbox => checkbox.type), ["checkbox", "checkbox", "checkbox", "checkbox"]);
    const cells = browser.element("risks").children[1].children.slice(1);
    assert.deepEqual(cells.map(cell => cell.classes.has("current")), [false, false, true, false]);
  });

  test("het team vinkt een opgetreden risico aan", async t => {
    const team = risks => ({name: "Team A", rounds: [score([0, 0, 0, 0], 0, 0, 0, {risks: [risks, [], [], []], step: "risks"})]});
    const browser = fakeBrowser(t, routes([team([])], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const checkboxes = riskCheckboxes(browser);
    for (const risks of [["external_audit"], ["data_loss", "external_audit"]]) {
      // De server geeft de nieuwe stand terug; de pagina ververst daarna met die stand.
      browser.server.routes["PUT /api/teams/Team%20A/releases/1"] = [200, team(risks)];
      browser.server.routes["GET /api/teams"] = [200, [team(risks)]];
      const checkbox = checkboxes[risks[0]][0];
      checkbox.checked = true;
      await checkbox.dispatch("change");
    }
    assert.deepEqual([checkboxes.data_loss[0].checked, checkboxes.external_audit[0].checked], [true, true]);
    const bodies = browser.server.requests.filter(request => request.route.startsWith("PUT")).map(request => request.options.body);
    assert.deepEqual(bodies, [JSON.stringify({risks: ["external_audit"]}), JSON.stringify({risks: ["data_loss", "external_audit"]})]);
  });

  test("een vinkje waar het team mee bezig is, wordt niet overschreven", async t => {
    const team = risks => ({name: "Team A", rounds: [score([0, 0, 0, 0], 0, 0, 0, {risks, step: "risks"})]});
    const browser = fakeBrowser(t, routes([team([[], [], [], []])], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const [first, second] = riskCheckboxes(browser).data_loss;
    browser.document.activeElement = first;
    first.checked = true;
    browser.server.routes["GET /api/teams"] = [200, [team([[], ["data_loss"], [], []])]];
    await browser.timers.tick();
    assert.equal(first.checked, true);
    assert.equal(second.checked, true);
  });

  test("extra ontwikkelaars en testers door een impromptu demo staan naast de keuzelijsten", async t => {
    const team = {name: "Team A", rounds: [score([5, 0, 0, 0], 0, 0, 0, {extraDevelopers: [1, 0, 0, 0], extraTesters: [1, 0, 0, 0]})]};
    const game = gameState(1);
    game.risks = [...game.risks, {key: "impromptu_demo", label: "👩🏼‍🏫 Impromptu demo"}];
    const browser = fakeBrowser(t, routes([team], game), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const reasons = {
      "release-developers": "👩🏼‍🏫 Impromptu demo: te weinig functionaliteit +1",
      "release-testers": "👩🏼‍🏫 Impromptu demo: te veel bugs +1",
    };
    for (const [row, reason] of Object.entries(reasons)) {
      const extras = browser.element(row).children.map(cell => cell.children[2]);
      assert.deepEqual(extras.map(extra => [extra.hidden, extra.textContent]), [[false, " +1"], [true, ""], [true, ""], [true, ""]]);
      assert.deepEqual([extras[0].ariaLabel, extras[0].className], [reason, "extra tooltip"]);
    }
  });

  test("een velocity die door risico's is veranderd, heeft een tooltip met de uitleg", async t => {
    const velocityChanges = [[{cause: "data_loss", change: -3}], [], [], []];
    const team = {name: "Team A", rounds: [score([5, 0, 0, 0], 0, 0, 0, {risks: [["data_loss"], [], [], []], velocityChanges})]};
    const browser = fakeBrowser(t, routes([team], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const [changed, unchanged] = browser.element("release-velocities").children.map(cell => cell.children[0]);
    assert.deepEqual([...changed.classes].sort(), ["changed", "tooltip"]);
    assert.equal(changed.ariaLabel, "🔥 Dataloss in productie −3");
    assert.deepEqual([[...unchanged.classes], unchanged.ariaLabel], [[], ""]);
  });

  test("targets en budget die in de release door risico's zijn veranderd, hebben een tooltip", async t => {
    const team = {name: "Team A", rounds: [score([5, 0, 0, 0])]};
    team.rounds[0].releases[0].business_value_target_changes = [{cause: "data_loss", change: 8}];
    team.rounds[0].releases[0].budget_changes = [{cause: "data_loss", change: 300}];
    team.rounds[0].releases[0].bugs_target_changes = [{cause: "data_loss", change: -1}];
    team.rounds[0].releases[0].tech_debt_target_changes = [{cause: "external_audit", change: -1}];
    const browser = fakeBrowser(t, routes([team], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const value = row => browser.element(row).children.map(cell => cell.children[0]);
    const [target, unchangedTarget] = value("release-business-value-targets");
    const [budget] = value("release-budgets");
    assert.deepEqual([target.ariaLabel, target.classes.has("tooltip")], ["🔥 Dataloss in productie +8", true]);
    assert.deepEqual([budget.ariaLabel, budget.classes.has("changed")], ["🔥 Dataloss in productie +300 €CTU", true]);
    assert.deepEqual([unchangedTarget.ariaLabel, unchangedTarget.classes.has("tooltip")], ["", false]);
    assert.equal(value("release-bugs-targets")[0].ariaLabel, "🔥 Dataloss in productie −1");
    assert.equal(value("release-tech-debt-targets")[0].ariaLabel, "☑️ Externe audit −1");
  });

  test("in ronde 1 zijn er geen rollen", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.equal(browser.element("team-rows").children.length, 0);
  });

  test("in ronde 2 heeft het team per rol een rij met een vinkje per release", async t => {
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([1, 1, 0, 0], 0, 0, 1, {roles: [["product_owner"], [], [], []]})]};
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const rows = browser.element("team-rows").children;
    assert.deepEqual(rows.map(row => row.children[0].textContent), ["👨🏻‍💼 Architect", "🧕🏻 Product owner"]);
    assert.equal(browser.element("team-heading").rowSpan, 4);
    const checkboxes = rows.map(row => row.children.slice(1).map(control));
    assert.deepEqual(checkboxes[1].map(checkbox => checkbox.checked), [true, false, false, false]);
    assert.deepEqual(checkboxes[0].map(checkbox => checkbox.disabled), [true, false, true, true]);
    assert.deepEqual(rows[0].children.slice(1).map(cell => cell.classes.has("current")), [false, true, false, false]);
  });

  test("een velocity die door een rol is veranderd, noemt de rol in de tooltip", async t => {
    const velocityChanges = [[{cause: "architect", change: 2}], [], [], []];
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([5, 0, 0, 0], 0, 0, 0, {roles: [["architect"], [], [], []], velocityChanges})]};
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.equal(browser.element("release-velocities").children[0].children[0].ariaLabel, "👨🏻‍💼 Architect +2");
  });

  test("een oploscapaciteit voor technische schuld die door een rol is verhoogd, heeft een tooltip", async t => {
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([5, 0, 0, 0], 0, 0, 0, {roles: [["quality_manager"], [], [], []]})]};
    team.rounds[1].releases[0].tech_debt_capacity_changes = [{cause: "product_owner", change: 4}];
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.equal(browser.element("release-tech-debt-capacities").children[0].children[0].ariaLabel, "🧕🏻 Product owner +4");
  });

  test("een risico waartegen een rol beschermt, is niet aan te vinken en heeft een schildje", async t => {
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([1, 0, 0, 0], 0, 0, 0, {
      roles: [["architect"], [], [], []],
      protectedRisks: [{external_audit: "architect", data_loss: "no_software_ready"}, {}, {}, {}],
      step: "risks", steps: ROUND_2_STEPS,
    })]};
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const checkboxes = riskCheckboxes(browser);
    assert.deepEqual([checkboxes.external_audit[0].disabled, checkboxes.data_loss[0].disabled], [true, true]);
    assert.equal(checkboxes.data_loss[1].disabled, true);  // niet de huidige release
    const shield = cell => cell.children[0];
    const [, externalAudit] = browser.element("risks").children;
    const [first, second] = externalAudit.children.slice(1).map(shield);
    assert.deepEqual([first.hidden, first.textContent, first.ariaLabel], [false, "🛡️ ", "Beschermd door 👨🏻‍💼 Architect"]);
    assert.deepEqual([second.hidden, second.textContent, second.ariaLabel], [true, "", ""]);
    const dataLoss = browser.element("risks").children[0].children[2].children[0];  // het schildje
    assert.equal(dataLoss.ariaLabel, "Beschermd: nog geen software gereed");
  });

  test("in ronde 2 zijn er maatregelen, alleen te nemen als ze beschikbaar zijn", async t => {
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([0, 0, 0, 0], 0, 0, 0, {
      measures: [["preliminary_phase"], [], [], []],
      availableMeasures: [["preliminary_phase"], ["security_test"], ["security_test"], ["security_test"]],
      step: "measures", steps: ROUND_2_STEPS,
    })]};
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const rows = browser.element("measures").children;
    const [heading, firstLabel] = rows[0].children;
    assert.deepEqual([headingText(heading), heading.rowSpan, firstLabel.textContent], ["📋 Maatregelen", 2, "📐 Voorfase"]);
    const [preliminaryPhase, securityTest] = [rows[0].children.slice(2), rows[1].children.slice(1)].map(cells => cells.map(control));
    assert.deepEqual(preliminaryPhase.map(checkbox => [checkbox.checked, checkbox.disabled]), [[true, false], [false, true], [false, true], [false, true]]);
    assert.deepEqual(securityTest.map(checkbox => checkbox.disabled), [true, true, true, true]);
  });

  test("een slotje legt uit waarom het team een maatregel niet kan nemen, alleen in de huidige release", async t => {
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([0, 0, 0, 0], 0, 0, 1, {
      unavailableMeasures: [{}, {preliminary_phase: "Alleen in de eerste release"}, {preliminary_phase: "Alleen in de eerste release"}, {}],
      step: "measures", steps: ROUND_2_STEPS,
    })]};
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const locks = browser.element("measures").children[0].children.slice(2).map(cell => cell.children[0]);
    assert.deepEqual(locks.map(lock => [lock.hidden, lock.textContent, lock.ariaLabel]),
      [[true, "", ""], [false, "🔒 ", "Alleen in de eerste release"], [true, "", ""], [true, "", ""]]);
  });

  test("tijdens de voorfase legt een slotje uit waarom het team geen mensen kan inhuren", async t => {
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([0, 0, 0, 0], 0, 0, 0, {measures: [["preliminary_phase"], [], [], []]})]};
    team.rounds[1].releases[0].team_locked = true;
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const reason = "📐 Voorfase: de voorfase heeft een eigen team";
    const developerLock = browser.element("release-developers").children[0].children[0];
    const roleLock = browser.element("team-rows").children[0].children[1].children[0];
    assert.deepEqual([developerLock.ariaLabel, roleLock.ariaLabel, roleLock.textContent], [reason, reason, "🔒 "]);
    assert.equal(browser.element("release-testers").children[1].children[0].hidden, true);  // niet de huidige release
  });

  test("tijdens de voorfase kan het team geen mensen inhuren", async t => {
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([0, 0, 0, 0], 0, 0, 0, {
      measures: [["preliminary_phase"], [], [], []], step: "measures", steps: ["measures", "cards"],
    })]};
    team.rounds[1].releases[0].team_locked = true;
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.deepEqual([selects(browser)[0].disabled, testerSelects(browser)[0].disabled], [true, true]);
    const roleCheckbox = browser.element("team-rows").children[0].children[1].children.find(child => child.tagName === "INPUT");
    assert.equal(roleCheckbox.disabled, true);
    // De maatregelen blijven te wijzigen, zodat het team de voorfase weer kan uitzetten.
    assert.equal(control(browser.element("measures").children[0].children[2]).disabled, false);
  });

  test("het team neemt een maatregel", async t => {
    const team = measures => ({name: "Team A", rounds: [TEAM_A.rounds[0], score([0, 0, 0, 0], 0, 0, 0, {measures: [measures, [], [], []]})]});
    const browser = fakeBrowser(t, routes([team([])], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    browser.server.routes["PUT /api/teams/Team%20A/releases/1"] = [200, team(["security_test"])];
    browser.server.routes["GET /api/teams"] = [200, [team(["security_test"])]];
    const securityTest = browser.element("measures").children[1].children[1].children.find(child => child.tagName === "INPUT");
    securityTest.checked = true;
    await securityTest.dispatch("change");
    const [request] = browser.server.requests.filter(request => request.route.startsWith("PUT"));
    assert.equal(request.options.body, JSON.stringify({measures: ["security_test"]}));
  });

  test("in ronde 1 zijn er geen maatregelen", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.equal(browser.element("measures").children.length, 0);
  });

  test("een oploscapaciteit voor bugs die door een maatregel is verhoogd, heeft een tooltip", async t => {
    const team = {name: "Team A", rounds: [TEAM_A.rounds[0], score([5, 0, 0, 0], 0, 0, 0, {testers: [2, 0, 0, 0]})]};
    team.rounds[1].releases[0].bug_fixing_capacity_changes = [{cause: "security_test", change: 2}];
    const browser = fakeBrowser(t, routes([team], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.equal(browser.element("release-bug-fixing-capacities").children[0].children[0].ariaLabel, "🔎 Securitytest +2");
  });

  test("het team zet een rol in", async t => {
    const team = roles => ({name: "Team A", rounds: [TEAM_A.rounds[0], score([0, 0, 0, 0], 0, 0, 0, {roles: [roles, [], [], []]})]});
    const browser = fakeBrowser(t, routes([team([])], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    browser.server.routes["PUT /api/teams/Team%20A/releases/1"] = [200, team(["architect"])];
    browser.server.routes["GET /api/teams"] = [200, [team(["architect"])]];
    const [architect] = browser.element("team-rows").children[0].children.slice(1).map(control);
    architect.checked = true;
    await architect.dispatch("change");
    const [request] = browser.server.requests.filter(request => request.route.startsWith("PUT"));
    assert.equal(request.options.body, JSON.stringify({roles: ["architect"]}));
    assert.equal(architect.checked, true);
  });

  test("als ronde 2 start terwijl de pagina open staat, komen de rollen erbij, maar één keer", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    browser.server.routes["GET /api/game"] = [200, gameState(2)];
    await browser.timers.tick();
    await browser.timers.tick();
    assert.equal(browser.element("team-rows").children.length, 2);
  });

  test("de budgetgrafiek toont het uitgegeven budget tot en met de huidige release, tegenover het totale budget", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const targets = browser.element("budget-chart").children.filter(child => child.attributes.class === "chart-target");
    // Team A huurt in ronde 2 10, 10 en 5 ontwikkelaars in en werkt aan release 3.
    assert.deepEqual(targets.map(target => target.attributes["aria-label"]), [
      "1.000 €CTU · Release 1 · 🎯 2.000 €CTU", "2.000 €CTU · Release 2 · 🎯 2.000 €CTU",
      "2.500 €CTU · Release 3 · 🎯 2.000 €CTU", "– · Release 4 · 🎯 2.000 €CTU",
    ]);
    const ticks = browser.element("budget-chart").children.filter(child => child.attributes.class === "chart-tick");
    assert.equal(ticks[0].textContent, "0");
  });

  test("naast de releases staan grafieken van wat het team heeft opgeleverd, met het target", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(2)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const labels = id => browser.element(id).children.filter(child => child.attributes.class === "chart-target")
      .map(target => target.attributes["aria-label"]);
    // Team A werkt in ronde 2 aan release 3: voor release 4 is nog niets opgeleverd.
    assert.deepEqual(labels("business-value-chart"), ["0 · Release 1", "0 · Release 2", "0 · Release 3", "– · Release 4"]
      .map(label => `${label} · 🎯 80`));
    assert.deepEqual(labels("bugs-chart").map(label => label.split(" · ").at(-1)), ["🎯 4", "🎯 4", "🎯 4", "🎯 4"]);
    assert.equal(labels("tech-debt-chart").length, 4);
  });

  test("de kolommen van de releases worden maar één keer opgebouwd", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    await browser.timers.tick();
    assert.equal(releaseTable(browser).headings.length, 4);
    assert.equal(browser.element("risks").children.length, 3);  // twee risico's en de regel voor als er niets is aangevinkt
    assert.equal(selects(browser).length, 4);
  });

  test("het team kan ontwikkelaars inhuren voor een release", async t => {
    const started = {name: "Team A", rounds: [score([5, 0, 0, 0], 3, 2, 1)]};
    const hired = {name: "Team A", rounds: [score([5, 7, 0, 0], 3, 2, 1)]};
    const browser = fakeBrowser(
      t, routes([started], gameState(1), {"PUT /api/teams/Team%20A/releases/2": [200, hired]}), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"},
    );
    await main();
    browser.element("release-error").textContent = "Oude foutmelding";
    browser.server.routes["GET /api/teams"] = [200, [hired]];
    const select = selects(browser)[1];
    select.value = "7";
    await select.dispatch("change");
    const [request] = browser.server.requests.filter(request => request.route.startsWith("PUT"));
    assert.equal(request.options.body, JSON.stringify({developers: 7}));
    assert.equal(browser.element("release-error").textContent, "");
    assert.deepEqual(releaseTable(browser).velocities, [22, 28, 0, 0]);
    assert.deepEqual(releaseTable(browser).budgets, ["2.000 €CTU", "1.500 €CTU", "800 €CTU", "800 €CTU"]);
  });

  test("als inhuren niet lukt, ziet het team de foutmelding", async t => {
    const detail = "Er is geen ronde bezig.";
    const browser = fakeBrowser(
      t, routes([TEAM_A], gameState(1), {"PUT /api/teams/Team%20A/releases/1": [409, {detail}]}), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"},
    );
    await main();
    await selects(browser)[0].dispatch("change");
    assert.equal(browser.element("release-error").textContent, detail);
  });

  test("een keuzelijst waar het team mee bezig is, wordt niet overschreven", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    const [first, second] = selects(browser);
    browser.document.activeElement = first;
    first.value = "8";
    browser.server.routes["GET /api/teams"] = [200, [{name: "Team A", rounds: [score([5, 6, 0, 0])]}]];
    await browser.timers.tick();
    assert.equal(first.value, "8");
    assert.equal(second.value, "6");
  });

  test("na opnieuw aanmelden huren de keuzelijsten ontwikkelaars in voor het nieuwe team", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    browser.server.routes = routes([], gameState(1));
    await browser.timers.tick();
    browser.server.routes = routes([TEAM_B], gameState(1), {
      "POST /api/teams": [201, TEAM_B], "PUT /api/teams/Team%20B/releases/1": [200, TEAM_B],
    });
    await register(browser, "Team B");
    await selects(browser)[0].dispatch("change");
    assert.deepEqual(browser.server.requests.filter(request => request.route.startsWith("PUT")).map(request => request.route),
      ["PUT /api/teams/Team%20B/releases/1"]);
  });

  test("de pagina ververst zichzelf regelmatig", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    browser.server.routes["GET /api/game"] = [200, gameState(2)];
    await browser.timers.tick();
    assert.equal(browser.element("status").textContent, "Ronde 2");
  });

  test("na ronde 1 ziet het team de resultaten van ronde 1", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A, TEAM_B], gameState(1, true)), {[STORAGE_KEY]: "Team B", [TOKEN_KEY]: "geheim"});
    await main();
    assert.deepEqual(visibleScreens(browser), ["team", "results"]);
    // De titel staat achter de teamnaam; met maar één ronde staat er geen kop boven de tabel.
    assert.deepEqual([browser.element("status").textContent, browser.element("status").hidden], ["Resultaat ronde 1", false]);
    assert.equal(browser.element("release-bar").hidden, true);
    // Na de ronde staan de release en de stap niet meer in het kruimelpad.
    assert.deepEqual(["release-crumb", "step", "releases-done"].map(id => browser.element(id).hidden), [true, true, true]);
    assert.deepEqual(resultsTexts(browser.element("results-tables")), [
      [null, [["Team A", "Afgerond", "2.000 €CTU", "1.000 €CTU", 80, 3, 4, 2, 4, 0], ["Team B", "Afgerond", "2.000 €CTU", "400 €CTU", 80, 5, 4, 1, 4, 0]]],
    ]);
    const [table] = browser.element("results-tables").children[0].children;
    assert.deepEqual(table.children[1].children.map(row => row.classes.has("own")), [false, true]);
  });

  test("na het einde ziet het team de resultaten van beide rondes", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A, TEAM_B], gameState(2, true)), {[STORAGE_KEY]: "Team B", [TOKEN_KEY]: "geheim"});
    await main();
    assert.equal(browser.element("status").textContent, "Het spel is afgelopen");
    assert.deepEqual(resultsTexts(browser.element("results-tables")).map(([heading]) => heading), ["Ronde 1", "Ronde 2"]);
  });

  test("een team dat de server niet kent, ziet weer het aanmeldformulier", async t => {
    const browser = fakeBrowser(t, routes([], gameState()), {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"});
    await main();
    assert.equal(browser.storage.getItem(STORAGE_KEY), null);
    assert.equal(browser.storage.getItem(TOKEN_KEY), null);
    assert.deepEqual(browser.timers.cleared, [1]);
    assert.equal(browser.element("register").hidden, false);
    assert.equal(browser.element("team").hidden, true);
    // Het kruimelpad is weer dat van het aanmeldscherm.
    assert.deepEqual(["team-name", "status"].map(id => browser.element(id).textContent), ["Kwaliteitsaanpakspel", "Aanmelden"]);
    assert.deepEqual(["status", "release-crumb", "step", "releases-done", "release-bar"].map(id => browser.element(id).hidden),
      [false, true, true, true, true]);
  });
});

describe("de stappen van een release", () => {
  const storage = {[STORAGE_KEY]: "Team A", [TOKEN_KEY]: "geheim"};
  // Team A werkt in ronde 2 aan release 3.
  const teamAt = step => atStep(TEAM_A, step, ROUND_2_STEPS);

  // Geef de cellen van release 3 in de rijen een plek op het scherm, zoals de browser dat doet.
  function layOut(browser, rows) {
    browser.element("releases-area").rect = {left: 100, top: 50};
    browser.element("release-headings").children[2].rect = {left: 700, top: 60, width: 120};
    rows.forEach((row, index) => {
      browser.element(row).children[2].rect = {top: 400 + 30 * index, bottom: 430 + 30 * index, height: 30};
    });
    browser.windowListeners.resize();
  }

  const buttons = browser => ["previous-step", "next-step"].map(id => browser.element(id))
    .map(button => [button.hidden, button.title, button.ariaLabel]);

  test("het kruimelpad toont de release en de stap", async t => {
    const browser = fakeBrowser(t, routes([teamAt("team")], gameState(2)), storage);
    await main();
    assert.deepEqual([browser.element("release-crumb").hidden, browser.element("release-crumb").textContent], [false, "Release 3"]);
    assert.deepEqual([browser.element("step").hidden, browser.element("step").textContent], [false, "👫 Team"]);
    assert.equal(browser.element("finish-release").hidden, true);
  });

  test("op de boven- en onderrand van het kader staan de knoppen naar de vorige en volgende stap", async t => {
    const browser = fakeBrowser(t, routes([teamAt("velocity")], gameState(2)), storage);
    await main();
    layOut(browser, ["release-velocities", "release-bug-fixing", "release-tech-debt", "release-business-value-velocities"]);
    assert.deepEqual(buttons(browser), [
      [false, "Vorige stap: ⚠️ Risico's", "Vorige stap: ⚠️ Risico's"],
      [false, "Volgende stap: 🛠️ Bouw en test", "Volgende stap: 🛠️ Bouw en test"],
    ]);
    const [previous, next] = ["previous-step", "next-step"].map(id => browser.element(id));
    assert.deepEqual([previous.className, previous.style.left, previous.style.top], ["step-button velocity", "618px", "350px"]);
    assert.deepEqual([next.className, next.style.left, next.style.top], ["step-button velocity", "618px", "470px"]);
  });

  test("in de eerste stap is er geen knop naar de vorige stap", async t => {
    const browser = fakeBrowser(t, routes([teamAt("team")], gameState(2)), storage);
    await main();
    layOut(browser, ["release-developers", "release-testers"]);
    assert.deepEqual(buttons(browser), [[true, "", ""], [false, "Volgende stap: 📋 Maatregelen", "Volgende stap: 📋 Maatregelen"]]);
  });

  test("in de laatste stap rondt het team de release af in plaats van naar de volgende stap te gaan", async t => {
    const browser = fakeBrowser(t, routes([teamAt("cards")], gameState(2)), storage);
    await main();
    layOut(browser, ["release-delivered-business-value"]);
    assert.deepEqual(buttons(browser).map(([hidden]) => hidden), [false, true]);
    assert.equal(browser.element("release-finish").hidden, false);
    assert.equal(browser.element("finish-release").textContent, "Rond release 3 af en start release 4");
  });

  test("de knop of melding om de release af te ronden staat in de kaart, onder de tabel, en wordt in beeld gescrold", async t => {
    const browser = fakeBrowser(t, routes([teamAt("cards")], gameState(2)), storage);
    await main();
    browser.element("releases").rect = {bottom: 1250};
    browser.element("release-finish").rect = {height: 40};
    layOut(browser, ["release-delivered-business-value"]);
    const finish = browser.element("release-finish");
    assert.deepEqual([finish.style.left, finish.style.top, finish.style.width], ["600px", "1208px", "120px"]);
    assert.equal(browser.element("current-column-plate").style.height, `${1190 + 8 + 40 + 8}px`);
    assert.deepEqual([finish.scrolled?.length, browser.element("current-step-frame").scrolled], [1, undefined]);
    // Zijn alle kaartjes ingevoerd, dan vervangt de knop de melding en scrolt die in beeld.
    browser.element("finish-release").hidden = false;
    browser.windowListeners.resize();
    assert.equal(finish.scrolled.length, 2);
  });

  test("buiten de laatste stap is er geen knop of melding om de release af te ronden", async t => {
    const browser = fakeBrowser(t, routes([teamAt("velocity")], gameState(2)), storage);
    await main();
    browser.element("releases").rect = {bottom: 1250};
    browser.element("release-finish").rect = {height: 40};
    layOut(browser, []);
    assert.equal(browser.element("release-finish").hidden, true);
    assert.equal(browser.element("current-column-plate").style.height, "1190px");
  });

  test("zonder kader zijn er geen knoppen naar de vorige en volgende stap", async t => {
    const browser = fakeBrowser(t, routes([teamAt("velocity")], gameState(2)), storage);
    await main();
    assert.deepEqual(buttons(browser), [[true, "", ""], [true, "", ""]]);
  });

  test("als alle releases zijn afgerond, is er geen stap", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), storage);
    await main();
    assert.deepEqual(["release-crumb", "step", "previous-step", "next-step", "current-step-frame"]
      .map(id => browser.element(id).hidden), [true, true, true, true, true]);
    assert.equal(browser.element("step").textContent, "");
  });

  test("het team gaat naar de volgende en de vorige stap", async t => {
    const browser = fakeBrowser(t, routes([teamAt("risks")], gameState(2), {
      "POST /api/teams/Team%20A/next-step": [200, teamAt("velocity")],
      "POST /api/teams/Team%20A/previous-step": [200, teamAt("risks")],
    }), storage);
    await main();
    browser.server.routes["GET /api/teams"] = [200, [teamAt("velocity")]];
    await browser.element("next-step").dispatch("click");
    assert.equal(browser.element("step").textContent, "🚀 Velocity");
    await browser.element("previous-step").dispatch("click");
    assert.deepEqual(browser.server.posts().map(request => [request.route, request.options.headers["X-Team-Token"]]), [
      ["POST /api/teams/Team%20A/next-step", "geheim"], ["POST /api/teams/Team%20A/previous-step", "geheim"],
    ]);
  });

  test("alleen de invoer van de huidige stap is te wijzigen", async t => {
    const browser = fakeBrowser(t, routes([teamAt("velocity")], gameState(2)), storage);
    await main();
    assert.deepEqual(selects(browser).map(select => select.disabled), [true, true, true, true]);
    assert.deepEqual(selects(browser, "release-bug-fixing").map(select => select.disabled), [true, true, false, true]);
    assert.deepEqual(selects(browser, "release-delivered-bugs").map(select => select.disabled), [true, true, true, true]);
  });

  test("de cellen van de huidige stap zijn gemarkeerd en die van de stappen die nog komen gedimd", async t => {
    const browser = fakeBrowser(t, routes([teamAt("velocity")], gameState(2)), storage);
    await main();
    const classes = (row, name) => browser.element(row).children.map(cell => cell.classes.has(name));
    assert.deepEqual(classes("release-velocities", "step-active"), [false, false, true, false]);
    assert.deepEqual(classes("release-developers", "step-active"), [false, false, false, false]);
    assert.deepEqual(classes("release-delivered-bugs", "step-todo"), [false, false, true, false]);
    assert.deepEqual(classes("release-developers", "step-todo"), [false, false, false, false]);
    const done = heading => heading.classes.has("step-done");
    const [teamHeading, velocityHeading, deliveredHeading] = ["team-heading", "velocity-heading", "delivered-heading"]
      .map(browser.element);
    // De kop van een groep staat bij de eerste zichtbare rij.
    const [measuresHeading, risksHeading] = ["measures", "risks"]
      .map(id => browser.element(id).children.find(row => !row.hidden).children[0]);
    assert.deepEqual([teamHeading, measuresHeading, risksHeading, velocityHeading, deliveredHeading].map(done),
      [true, true, true, false, false]);
  });

  test("na de laatste release heeft geen kop een vinkje", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1)), storage);
    await main();
    assert.equal(browser.element("team-heading").classes.has("step-done"), false);
  });

  test("een kader omlijst de cellen van de huidige stap", async t => {
    const browser = fakeBrowser(t, routes([teamAt("velocity")], gameState(2)), storage);
    await main();
    browser.element("releases-area").rect = {left: 100, top: 50};
    browser.element("release-headings").children[2].rect = {left: 700, top: 60, width: 120};
    browser.element("release-velocities").children[2].rect = {top: 400, bottom: 430, height: 30};
    browser.element("release-business-value-velocities").children[2].rect = {top: 490, bottom: 520, height: 30};
    browser.windowListeners.resize();
    const frame = browser.element("current-step-frame");
    assert.deepEqual([frame.hidden, frame.className, frame.style.left, frame.style.top, frame.style.width, frame.style.height],
      [false, "current-step velocity", "600px", "350px", "120px", "120px"]);
    // De stap is in beeld gescrold; zolang het team bij dezelfde stap blijft, niet opnieuw.
    browser.windowListeners.resize();
    assert.deepEqual(frame.scrolled, [{block: "nearest", behavior: "smooth"}]);
  });

  test("zonder zichtbare cellen is er geen kader", async t => {
    const browser = fakeBrowser(t, routes([teamAt("velocity")], gameState(2)), storage);
    await main();
    assert.equal(browser.element("current-step-frame").hidden, true);
  });

  test("de rijen van de huidige stap blijven uitgeklapt", async t => {
    const browser = fakeBrowser(t, routes([teamAt("risks")], gameState(2)), storage);
    await main();
    const [dataLoss, externalAudit, empty] = browser.element("risks").children;
    assert.deepEqual([dataLoss.hidden, externalAudit.hidden, empty.hidden], [false, false, true]);
    const toggle = dataLoss.children[0].children[0];
    assert.deepEqual([toggle.ariaExpanded, toggle.disabled, toggle.title], ["true", true, "Het team is met deze stap bezig"]);
    assert.equal(browser.element("release-one-point-cards").hidden, true);
  });

  test("in de stap voor de kaartjes zijn de kaartjes uitgeklapt", async t => {
    const browser = fakeBrowser(t, routes([teamAt("cards")], gameState(2)), storage);
    await main();
    assert.deepEqual([browser.element("release-one-point-cards").hidden, browser.element("delivered-heading").rowSpan], [false, 6]);
    const toggle = browser.element("delivered-business-value-label").children[0];
    assert.deepEqual([toggle.ariaExpanded, toggle.disabled], ["true", true]);
  });
});
