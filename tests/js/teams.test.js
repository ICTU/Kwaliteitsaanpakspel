import assert from "node:assert/strict";
import {describe, test} from "node:test";

import {
  fetchState, formatMoney, phase, progressText, renderResults, resultRows, resultsTable, resultsTitle, totalRow,
} from "../../src/kwaliteitsaanpakspel/static/teams.js";
import {FakeElement, TEAM_A, TEAM_B, fakeBrowser, gameState, resultsTexts, rowTexts, score} from "./fakes.js";

test("fetchState haalt de teams en de stand van het spel op", async t => {
  fakeBrowser(t, {"GET /api/teams": [200, [TEAM_A]], "GET /api/game": [200, gameState(1)]});
  assert.deepEqual(await fetchState(), {teams: [TEAM_A], game: gameState(1)});
});

describe("formatMoney", () => {
  test("bedragen zijn in €CTU, met een punt als scheidingsteken voor duizendtallen", () => {
    assert.equal(formatMoney(0), "0 €CTU");
    assert.equal(formatMoney(2000), "2.000 €CTU");
  });

  test("negatieve bedragen hebben een minteken", () => {
    assert.equal(formatMoney(-1500), "−1.500 €CTU");
  });
});

describe("phase", () => {
  test("voor de start wachten de teams", () => {
    assert.equal(phase(gameState()), "waiting");
  });

  test("tijdens een ronde spelen de teams", () => {
    assert.equal(phase(gameState(1)), "playing");
  });

  test("na een ronde zijn de resultaten zichtbaar", () => {
    assert.equal(phase(gameState(1, true)), "results");
    assert.equal(phase(gameState(2, true)), "results");
  });
});

describe("resultsTitle", () => {
  test("na ronde 1 gaat het om het resultaat van ronde 1", () => {
    assert.equal(resultsTitle(gameState(1, true)), "Resultaat ronde 1");
  });

  test("na de laatste ronde is het spel afgelopen", () => {
    assert.equal(resultsTitle(gameState(2, true)), "Het spel is afgelopen");
  });
});

describe("progressText", () => {
  test("de voortgang is de release waar het team aan werkt", () => {
    assert.equal(progressText(score([0, 0, 0, 0])), "Release 1");
    assert.equal(progressText(score([0, 0, 0, 0], 0, 0, 3)), "Release 4");
  });

  test("na de laatste release is het team klaar", () => {
    assert.equal(progressText(score([0, 0, 0, 0], 0, 0, 4)), "Afgerond");
  });

  test("met de labels van de stappen staat ook de stap erbij", () => {
    const labels = {team: "👫 Team", risks: "⚠️ Risico's"};
    assert.equal(progressText(score([0, 0, 0, 0], 0, 0, 1, {step: "risks"}), labels), "Release 2 · ⚠️ Risico's");
    assert.equal(progressText(score([0, 0, 0, 0], 0, 0, 4), labels), "Afgerond");
  });
});

describe("resultRows", () => {
  test("per team het target en de werkelijke waarde van budget, business waarde, bugs en technische schuld", t => {
    fakeBrowser(t, {});
    assert.deepEqual(rowTexts(resultRows([TEAM_A, TEAM_B], 0)), [["Team A", "Afgerond", "2.000 €CTU", "1.000 €CTU", 80, 3, 4, 2, 4, 0], ["Team B", "Afgerond", "2.000 €CTU", "400 €CTU", 80, 5, 4, 1, 4, 0]]);
  });

  test("de werkelijke waarde laat zien of het team het target heeft gehaald", t => {
    fakeBrowser(t, {});
    // Team A geeft in ronde 2 meer uit dan het budget, haalt de business waarde niet en heeft niet te veel bugs en TS.
    const [row] = resultRows([TEAM_A], 1);
    const actuals = row.children.filter((_, index) => index > 1 && index % 2 === 1);
    assert.deepEqual(actuals.map(actual => actual.className), ["missed", "missed", "achieved", "achieved"]);
    const [, , , , , teamB] = resultRows([TEAM_B], 1)[0].children;
    assert.equal(teamB.className, "missed");
  });

  test("het eigen team is gemarkeerd", t => {
    fakeBrowser(t, {});
    assert.deepEqual(resultRows([TEAM_A, TEAM_B], 0, "Team B").map(row => row.classes.has("own")), [false, true]);
  });

  test("een team dat het business waarde-target haalt, heeft dat gehaald", t => {
    fakeBrowser(t, {});
    const team = {name: "Team C", rounds: [score([10, 10, 0, 0], 80, 5, 4)]};
    const [, , , , , businessValue, , bugs] = resultRows([team], 0)[0].children;
    assert.deepEqual([businessValue.className, bugs.className], ["achieved", "missed"]);
  });
});

describe("totalRow", () => {
  test("de opgetelde targets en werkelijke waarden van alle teams", t => {
    fakeBrowser(t, {});
    const row = totalRow([TEAM_A, TEAM_B], 0);
    assert.deepEqual(rowTexts([row]), [["Totaal", "", "4.000 €CTU", "1.400 €CTU", 160, 8, 8, 3, 8, 0]]);
    assert.equal(row.children[0].tagName, "TH");
  });

  test("de werkelijke waarden laten zien of het totale target is gehaald", t => {
    fakeBrowser(t, {});
    const actuals = totalRow([TEAM_A, TEAM_B], 1).children.filter((_, index) => index > 1 && index % 2 === 1);
    // Samen 2.500 van 4.000 uitgegeven, 16 van 160 business waarde, 4 van 8 bugs en 0 van 8 TS.
    assert.deepEqual(actuals.map(actual => [actual.textContent, actual.className]),
      [["2.500 €CTU", "achieved"], [16, "missed"], [4, "achieved"], [0, "achieved"]]);
  });
});

describe("resultsTable", () => {
  test("een tabel met een rij per team en het totaal", t => {
    fakeBrowser(t, {});
    const table = resultsTable([TEAM_A, TEAM_B], 0);
    const [, tbody, tfoot] = table.children;
    assert.deepEqual([table.tagName, table.className, tbody.children.length, tfoot.children.length], ["TABLE", "results", 2, 1]);
  });
});

describe("renderResults", () => {
  test("een tabel per gespeelde ronde", t => {
    fakeBrowser(t, {});
    const container = new FakeElement();
    renderResults(container, [TEAM_A, TEAM_B], 2);
    assert.deepEqual(resultsTexts(container), [["Ronde 1", [["Team A", "Afgerond", "2.000 €CTU", "1.000 €CTU", 80, 3, 4, 2, 4, 0], ["Team B", "Afgerond", "2.000 €CTU", "400 €CTU", 80, 5, 4, 1, 4, 0]]], ["Ronde 2", [["Team A", "Release 3", "2.000 €CTU", "2.500 €CTU", 80, 9, 4, 0, 4, 0], ["Team B", "Release 1", "2.000 €CTU", "0 €CTU", 80, 7, 4, 4, 4, 0]]]]);
    const [table] = container.children[0].children.slice(1);
    assert.equal(table.className, "results");
    const [, , tfoot] = table.children;
    assert.deepEqual([tfoot.tagName, tfoot.children[0].children[0].textContent], ["TFOOT", "Totaal"]);
    const [groups, subheadings] = table.children[0].children;
    assert.deepEqual(groups.children.map(heading => [heading.textContent, heading.rowSpan ?? heading.colSpan]),
      [["Team", 2], ["Voortgang", 2], ["💵 Budget", 2], ["🏆 Business waarde", 2], ["🐛 Bugs", 2], ["💳 Technische schuld", 2]]);
    assert.deepEqual(subheadings.children.map(heading => heading.textContent),
      ["target", "werkelijk", "target", "werkelijk", "target", "werkelijk", "target", "werkelijk"]);
  });

  test("het eigen team is gemarkeerd en eerdere resultaten worden vervangen", t => {
    fakeBrowser(t, {});
    const container = new FakeElement();
    renderResults(container, [TEAM_A, TEAM_B], 2);
    renderResults(container, [TEAM_A, TEAM_B], 1, "Team A");
    assert.equal(container.children.length, 1);
    // Met maar één ronde staat er geen kop boven de tabel.
    assert.equal(container.children[0].children.length, 1);
    const [, tbody] = container.children[0].children[0].children;
    assert.deepEqual(tbody.children.map(row => row.classes.has("own")), [true, false]);
  });
});
