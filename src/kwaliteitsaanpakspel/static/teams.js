// Gedeelde code voor de spelleiderpagina en de teampagina.

export const REFRESH_INTERVAL = 2000;

// Een getal met een punt als scheidingsteken voor duizendtallen en een minteken (−) voor negatieve getallen, net als in
// de tooltips.
export function formatNumber(number) {
  return `${number < 0 ? "−" : ""}${Math.abs(number).toLocaleString("nl-NL")}`;
}

export function formatMoney(amount) {
  return `${formatNumber(amount)} €CTU`;
}

async function getJson(url) {
  return (await fetch(url)).json();
}

export async function fetchState() {
  const [teams, game] = await Promise.all([getJson("/api/teams"), getJson("/api/game")]);
  return {teams, game};
}

// De fase van het spel: wachten op de start, een ronde spelen of de resultaten bekijken.
export function phase(game) {
  if (game.round === null) return "waiting";
  return game.round_finished ? "results" : "playing";
}

export function resultsTitle(game) {
  return game.finished ? "Het spel is afgelopen" : `Resultaat ronde ${game.round}`;
}

function element(tagName, ...children) {
  const result = document.createElement(tagName);
  result.append(...children);
  return result;
}

function cell(tagName, value) {
  const result = document.createElement(tagName);
  result.textContent = value;
  return result;
}

// Bij welke release een team is en, als de labels van de stappen zijn opgegeven, bij welke stap van die release.
export function progressText(score, stepLabels = {}) {
  const current = score.completed_releases + 1;
  if (current > score.releases.length) return "Afgerond";
  const step = stepLabels[score.releases[current - 1].step];
  return step ? `Release ${current} · ${step}` : `Release ${current}`;
}

// De resultaten van een ronde: per onderdeel het target en de werkelijke waarde, en of het team het target heeft gehaald.
export const RESULTS = [
  {label: "💵 Budget", target: "budget_target", actual: "spent", achieved: (target, actual) => actual <= target, format: formatMoney},
  {label: "🏆 Business waarde", target: "business_value_target", actual: "business_value", achieved: (target, actual) => actual >= target},
  {label: "🐛 Bugs", target: "bugs_target", actual: "open_bugs", achieved: (target, actual) => actual <= target},
  {label: "💳 Technische schuld", target: "tech_debt_target", actual: "open_tech_debt", achieved: (target, actual) => actual <= target},
];

// De cellen met per onderdeel het target en de werkelijke waarde, waarbij de werkelijke waarde laat zien of het
// target is gehaald.
function resultCells(score) {
  return RESULTS.flatMap(({target, actual, achieved, format = value => value}) => {
    const actualCell = cell("td", format(score[actual]));
    actualCell.className = achieved(score[target], score[actual]) ? "achieved" : "missed";
    return [cell("td", format(score[target])), actualCell];
  });
}

// De rijen met de resultaten van de teams in een ronde (0 is de eerste ronde).
export function resultRows(teams, roundIndex, ownTeamName = null, stepLabels = {}) {
  return teams.map(team => {
    const score = team.rounds[roundIndex];
    const row = element("tr", cell("td", team.name), cell("td", progressText(score, stepLabels)), ...resultCells(score));
    row.classList.toggle("own", team.name === ownTeamName);
    return row;
  });
}

// De rij met het totaal van alle teams: per onderdeel de opgetelde targets en de opgetelde werkelijke waarden.
export function totalRow(teams, roundIndex) {
  const total = {};
  for (const {target, actual} of RESULTS) {
    for (const key of [target, actual]) {
      total[key] = teams.reduce((sum, team) => sum + team.rounds[roundIndex][key], 0);
    }
  }
  return element("tr", cell("th", "Totaal"), cell("td", ""), ...resultCells(total));
}

function resultsHeader() {
  const groups = RESULTS.map(({label}) => {
    const heading = cell("th", label);
    heading.colSpan = 2;
    return heading;
  });
  const [team, progress] = ["Team", "Voortgang"].map(label => {
    const heading = cell("th", label);
    heading.rowSpan = 2;
    return heading;
  });
  const subheadings = RESULTS.flatMap(() => [cell("th", "target"), cell("th", "werkelijk")]);
  return element("thead", element("tr", team, progress, ...groups), element("tr", ...subheadings));
}

// Een tabel met de resultaten van alle teams in een ronde (0 is de eerste ronde), met het totaal. Met de labels van
// de stappen staat bij de voortgang ook de stap waar elk team is.
export function resultsTable(teams, roundIndex, ownTeamName = null, stepLabels = {}) {
  const table = element(
    "table", resultsHeader(), element("tbody", ...resultRows(teams, roundIndex, ownTeamName, stepLabels)),
    element("tfoot", totalRow(teams, roundIndex)),
  );
  table.className = "results";
  return table;
}

// Een tabel per ronde met de resultaten van alle teams in die ronde.
export function renderResults(container, teams, roundCount, ownTeamName = null) {
  const sections = [];
  for (let roundIndex = 0; roundIndex < roundCount; roundIndex++) {
    // Een kop per ronde is alleen nodig als er resultaten van meer dan één ronde zijn.
    const heading = roundCount > 1 ? [cell("h3", `Ronde ${roundIndex + 1}`)] : [];
    sections.push(element("section", ...heading, resultsTable(teams, roundIndex, ownTeamName)));
  }
  container.replaceChildren(...sections);
}
