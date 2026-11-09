import assert from "node:assert/strict";
import {describe, test} from "node:test";

import {main, nextAction, statusText} from "../../src/kwaliteitsaanpakspel/static/host.js";
import {REFRESH_INTERVAL} from "../../src/kwaliteitsaanpakspel/static/teams.js";
import {TEAM_A, TEAM_B, fakeBrowser, gameState, resultsTexts, rowTexts} from "./fakes.js";

describe("nextAction", () => {
  test("voor de start kan de spelleider ronde 1 starten", () => {
    assert.deepEqual(nextAction(gameState()), {path: "start-round", label: "Start ronde 1"});
  });

  test("tijdens een ronde kan de spelleider de ronde stoppen", () => {
    assert.deepEqual(nextAction(gameState(1)), {path: "finish-round", label: "Stop ronde 1"});
    assert.deepEqual(nextAction(gameState(2)), {path: "finish-round", label: "Stop ronde 2"});
  });

  test("na ronde 1 kan de spelleider ronde 2 starten", () => {
    assert.deepEqual(nextAction(gameState(1, true)), {path: "start-round", label: "Start ronde 2"});
  });

  test("na het einde is er geen actie meer", () => {
    assert.equal(nextAction(gameState(2, true)), null);
  });
});

describe("statusText", () => {
  test("voor de start melden de teams zich aan", () => {
    assert.equal(statusText(gameState()), "Teams aanmelden");
  });

  test("tijdens een ronde is de status de ronde", () => {
    assert.equal(statusText(gameState(1)), "Ronde 1");
  });

  test("na een ronde is de status het resultaat", () => {
    assert.equal(statusText(gameState(1, true)), "Resultaat ronde 1");
    assert.equal(statusText(gameState(2, true)), "Het spel is afgelopen");
  });
});

function routes(teams, game, extra = {}) {
  const links = teams.map(({name}) => ({name, url: `http://192.168.1.23:8765/#team=${name}&token=geheim`}));
  return {"GET /api/teams": [200, teams], "GET /api/game": [200, game], "GET /api/teams/links": [200, links], ...extra};
}

function visibleSections(browser) {
  return ["waiting", "playing", "results"].filter(id => !browser.element(id).hidden);
}

describe("main", () => {
  test("zonder teams staat de startknop uit en is het aanmeldadres zichtbaar", async t => {
    const browser = fakeBrowser(t, routes([], gameState()));
    await main();
    assert.deepEqual(visibleSections(browser), ["waiting"]);
    assert.equal(browser.element("status").textContent, "Teams aanmelden");
    assert.equal(browser.element("action").hidden, false);
    assert.equal(browser.element("action").disabled, true);
    assert.equal(browser.element("action").textContent, "Start ronde 1");
    assert.equal(browser.element("no-teams").hidden, false);
  });

  test("met een team kan de spelleider ronde 1 starten", async t => {
    const browser = fakeBrowser(t, routes([{name: "Team A", rounds: []}], gameState()));
    await main();
    assert.equal(browser.element("action").disabled, false);
    assert.equal(browser.element("no-teams").hidden, true);
    assert.deepEqual(browser.element("team-names").children.map(item => item.textContent), ["Team A"]);
  });

  test("tijdens een ronde is de stand van die ronde zichtbaar", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A, TEAM_B], gameState(2)));
    await main();
    assert.deepEqual(visibleSections(browser), ["playing"]);
    assert.equal(browser.element("status").textContent, "Ronde 2");
    assert.equal(browser.element("action").textContent, "Stop ronde 2");
    const [table] = browser.element("scores").children;
    const [, tbody, tfoot] = table.children;
    assert.deepEqual(rowTexts(tbody.children), [
      ["Team A", "Release 3 · 👫 Team", "2.000 €CTU", "2.500 €CTU", 80, 9, 4, 0, 4, 0],
      ["Team B", "Release 1 · 👫 Team", "2.000 €CTU", "0 €CTU", 80, 7, 4, 4, 4, 0],
    ]);
    assert.equal(tfoot.children[0].children[0].textContent, "Totaal");
  });

  test("na ronde 1 zijn de resultaten van ronde 1 zichtbaar", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1, true)));
    await main();
    assert.deepEqual(visibleSections(browser), ["results"]);
    assert.equal(browser.element("status").textContent, "Resultaat ronde 1");
    assert.equal(browser.element("action").textContent, "Start ronde 2");
    assert.deepEqual(resultsTexts(browser.element("results-tables")), [[null, [["Team A", "Afgerond", "2.000 €CTU", "1.000 €CTU", 80, 3, 4, 2, 4, 0]]]]);
  });

  test("na het einde zijn de resultaten van beide rondes zichtbaar en is de knop verdwenen", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(2, true)));
    await main();
    assert.equal(browser.element("status").textContent, "Het spel is afgelopen");
    assert.equal(browser.element("action").hidden, true);
    assert.equal(browser.element("action").textContent, "");
    assert.deepEqual(resultsTexts(browser.element("results-tables")).map(([heading]) => heading), ["Ronde 1", "Ronde 2"]);
  });

  test("zonder teams zijn er geen links om opnieuw te verbinden", async t => {
    const browser = fakeBrowser(t, routes([], gameState()));
    await main();
    assert.equal(browser.element("reconnect").hidden, true);
    assert.equal(browser.server.requests.some(request => request.route === "GET /api/teams/links"), false);
  });

  test("de spelleider kopieert per team de link om opnieuw te verbinden", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A, TEAM_B], gameState(1)));
    await main();
    assert.equal(browser.element("reconnect").hidden, false);
    const items = browser.element("reconnect-links").children;
    assert.deepEqual(items.map(item => item.children[0]), ["Team A", "Team B"]);
    const button = items[1].children[1];
    assert.deepEqual([button.type, button.textContent], ["button", "📋 Kopieer link"]);
    await button.dispatch("click");
    assert.deepEqual(browser.clipboard.written, ["http://192.168.1.23:8765/#team=Team B&token=geheim"]);
    assert.equal(button.textContent, "✅ Gekopieerd");
  });

  test("de links worden alleen opnieuw opgehaald als de teams veranderen", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState()));
    await main();
    await browser.timers.tick();
    const fetches = () => browser.server.requests.filter(request => request.route === "GET /api/teams/links").length;
    assert.equal(fetches(), 1);
    browser.server.routes = routes([TEAM_A, TEAM_B], gameState());
    await browser.timers.tick();
    assert.equal(fetches(), 2);
  });

  test("de pagina ververst zichzelf regelmatig", async t => {
    const browser = fakeBrowser(t, routes([], gameState()));
    await main();
    assert.deepEqual([...browser.timers.intervals.values()].map(({delay}) => delay), [REFRESH_INTERVAL]);
    browser.server.routes = routes([{name: "Team A", rounds: []}], gameState());
    await browser.timers.tick();
    assert.equal(browser.element("action").disabled, false);
  });

  test("een klik op de knop voert de volgende actie uit", async t => {
    const browser = fakeBrowser(t, routes([TEAM_A], gameState(1), {"POST /api/game/finish-round": [200, gameState(1, true)]}));
    await main();
    browser.element("error").textContent = "Oude foutmelding";
    browser.server.routes["GET /api/game"] = [200, gameState(1, true)];
    await browser.element("action").dispatch("click");
    assert.deepEqual(browser.server.posts().map(request => request.route), ["POST /api/game/finish-round"]);
    assert.equal(browser.element("error").textContent, "");
    assert.equal(browser.element("action").textContent, "Start ronde 2");
  });

  test("een mislukte actie toont de foutmelding", async t => {
    const detail = "Er moet minimaal één team zijn aangemeld.";
    const browser = fakeBrowser(t, routes([], gameState(), {"POST /api/game/start-round": [409, {detail}]}));
    await main();
    await browser.element("action").dispatch("click");
    assert.equal(browser.element("error").textContent, detail);
  });
});
