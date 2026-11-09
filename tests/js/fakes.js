// Minimale nep-versies van de browser-API's die de pagina's gebruiken.

// Verplaats een element naar een nieuwe ouder, zoals de browser doet bij append en prepend.
function adopt(parent, child) {
  if (!(child instanceof FakeElement)) return;
  if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(other => other !== child);
  child.parentNode = parent;
}

export class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.value = "";
    this.children = [];
    this.classes = new Set();
    this.listeners = {};
    this.selected = {};
    this.attributes = {};
    this.style = {};
    this.classList = {toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name)};
  }

  // De plek op het scherm; tests kunnen die zetten met rect.
  getBoundingClientRect() {
    return this.rect ?? {left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0};
  }

  // Tests zien met scrolled hoe vaak het element in beeld is gescrold.
  scrollIntoView(options) {
    this.scrolled = [...(this.scrolled ?? []), options];
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  dispatch(type, event = {}) {
    return this.listeners[type](event);
  }

  append(...children) {
    for (const child of children) adopt(this, child);
    this.children.push(...children);
  }

  prepend(child) {
    adopt(this, child);
    this.children.unshift(child);
  }

  replaceChildren(...children) {
    for (const child of children) adopt(this, child);
    this.children = children;
  }

  querySelector(selector) {
    return this.selected[selector] ??= new FakeElement();
  }
}

export class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.activeElement = null;
  }

  getElementById(id) {
    if (!this.elements.has(id)) this.elements.set(id, new FakeElement());
    return this.elements.get(id);
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createElementNS(namespace, tagName) {
    const result = new FakeElement(tagName);
    result.namespace = namespace;
    return result;
  }
}

export class FakeStorage {
  constructor(items = {}) {
    this.items = new Map(Object.entries(items));
  }

  getItem(key) {
    return this.items.get(key) ?? null;
  }

  setItem(key, value) {
    this.items.set(key, value);
  }

  removeItem(key) {
    this.items.delete(key);
  }
}

// Een nepserver: routes koppelt "METHODE /pad" aan [status, body].
export class FakeServer {
  constructor(routes) {
    this.routes = routes;
    this.requests = [];
    this.fetch = async (url, options = {}) => {
      const route = `${options.method ?? "GET"} ${url}`;
      this.requests.push({route, options});
      const [status, body] = this.routes[route];
      return {ok: status < 300, status, json: async () => body};
    };
  }

  posts() {
    return this.requests.filter(request => request.route.startsWith("POST"));
  }
}

export class FakeTimers {
  constructor() {
    this.intervals = new Map();
    this.cleared = [];
    this.nextId = 1;
    this.setInterval = (callback, delay) => {
      this.intervals.set(this.nextId, {callback, delay});
      return this.nextId++;
    };
    this.clearInterval = id => this.cleared.push(id);
  }

  tick() {
    return Promise.all([...this.intervals.values()].map(({callback}) => callback()));
  }
}

// Installeer nep-globals en geef een functie terug die de oorspronkelijke globals terugzet.
export function installGlobals(globals) {
  const originals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});
  }
  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

// Installeer een nep-browser voor één test.
export function fakeBrowser(t, routes, storage = {}, hash = "") {
  const browser = {
    location: {hash, pathname: "/", reloads: 0, reload() { this.reloads++; }},
    windowListeners: {},
    history: {replaced: [], replaceState(...args) { this.replaced.push(args); }},
    clipboard: {written: [], async writeText(text) { this.written.push(text); }},
    document: new FakeDocument(),
    server: new FakeServer(routes),
    storage: new FakeStorage(storage),
    timers: new FakeTimers(),
  };
  t.after(installGlobals({
    document: browser.document,
    fetch: browser.server.fetch,
    localStorage: browser.storage,
    setInterval: browser.timers.setInterval,
    clearInterval: browser.timers.clearInterval,
    location: browser.location,
    history: browser.history,
    navigator: {clipboard: browser.clipboard},
    addEventListener: (type, listener) => { browser.windowListeners[type] = listener; },
  }));
  browser.element = id => browser.document.getElementById(id);
  return browser;
}

// De tekst van een kop van een groep: de kop is een knop om in en uit te klappen.
export function headingText(heading) {
  return heading.children[0].textContent;
}

export function rowTexts(rows) {
  return rows.map(row => row.children.map(cell => cell.textContent));
}

// De teksten van de tabellen met resultaten, per ronde: [kop, rijen]. Zonder kop is de kop null.
export function resultsTexts(container) {
  return container.children.map(section => {
    const [heading, table] = section.children.length > 1 ? section.children : [{textContent: null}, section.children[0]];
    const [, tbody] = table.children;
    return [heading.textContent, rowTexts(tbody.children)];
  });
}

const VELOCITY = [0, 4, 8, 13, 18, 22, 25, 28, 30, 31, 32];

// Een deel van de maatregelen, genoeg voor de tests.
export const MEASURES = [{key: "preliminary_phase", label: "📐 Voorfase"}, {key: "security_test", label: "🔎 Securitytest"}];
const MEASURE_KEYS = MEASURES.map(({key}) => key);

const CARDS = ["one_point_cards", "two_point_cards", "three_point_cards", "bug_cards", "tech_debt_cards"];

// De stand van een team in een ronde, berekend zoals de server dat doet. Cards bevat per release de ingevoerde
// kaartjes, bijvoorbeeld {one_point_cards: 3, bug_cards: 1}.
export function score(
  developers, businessValue = 0, openBugs = 0, completedReleases = 0,
  {testers = [0, 0, 0, 0], bugFixing = [0, 0, 0, 0], techDebt = [0, 0, 0, 0], cards = [{}, {}, {}, {}], risks = [[], [], [], []], roles = [[], [], [], []], protectedRisks = [{}, {}, {}, {}], measures = [[], [], [], []],
    availableMeasures = [MEASURE_KEYS, MEASURE_KEYS, MEASURE_KEYS, MEASURE_KEYS], unavailableMeasures = [{}, {}, {}, {}],
    extraDevelopers = [0, 0, 0, 0], extraTesters = [0, 0, 0, 0], velocityChanges = [[], [], [], []], step = "team",
    steps = ["team", "risks", "velocity", "cards"], teamLocked = false} = {},
) {
  let budget = 2000;
  let cumulativeBusinessValue = 0, cumulativeBugs = 0, cumulativeTechDebt = 0;
  const releases = developers.map((count, index) => {
    const releaseCards = Object.fromEntries(CARDS.map(card => [card, cards[index][card] ?? 0]));
    const cardCount = Object.values(releaseCards).reduce((total, cardsOfKind) => total + cardsOfKind, 0);
    const delivered = releaseCards.one_point_cards + 2 * releaseCards.two_point_cards + 3 * releaseCards.three_point_cards;
    const bugFixingCapacity = 4 * testers[index] + bugFixing[index] / 2;
    cumulativeBusinessValue += delivered;
    cumulativeBugs = Math.max(cumulativeBugs + releaseCards.bug_cards - bugFixingCapacity, 0);
    cumulativeTechDebt = Math.max(cumulativeTechDebt + releaseCards.tech_debt_cards - techDebt[index] / 2, 0);
    const release = {
      ...releaseCards,
      risks: risks[index],
      roles: roles[index],
      protected_risks: protectedRisks[index],
      measures: measures[index],
      available_measures: availableMeasures[index],
      unavailable_measures: unavailableMeasures[index],
      team_locked: teamLocked,
      step,
      steps,
      velocity_changes: velocityChanges[index],
      extra_developers: extraDevelopers[index],
      extra_testers: extraTesters[index],
      open_cards: VELOCITY[count] - bugFixing[index] - techDebt[index] - cardCount,
      delivered_business_value: delivered,
      cumulative_business_value: cumulativeBusinessValue,
      cumulative_bugs: cumulativeBugs,
      cumulative_tech_debt: cumulativeTechDebt,
      business_value_target: 80, business_value_target_changes: [], bugs_target: 4, bugs_target_changes: [], tech_debt_target: 4,
      tech_debt_target_changes: [], budget,
      budget_changes: [], cumulative_budget: 2000, cumulative_cost: 2000 - budget + (count + testers[index]) * 100, developers: count, testers: testers[index],
      velocity: VELOCITY[count], bug_fixing: bugFixing[index], tech_debt: techDebt[index],
      business_value_velocity: VELOCITY[count] - bugFixing[index] - techDebt[index],
      bug_fixing_capacity: bugFixingCapacity, bug_fixing_capacity_changes: [], tech_debt_capacity: techDebt[index] / 2, tech_debt_capacity_changes: [],
      cost: (count + testers[index]) * 100,
    };
    budget -= release.cost;
    return release;
  });
  return {
    releases, completed_releases: completedReleases, budget_target: 2000, spent: 2000 - budget, remaining_budget: budget,
    business_value_target: 80, bugs_target: 4, tech_debt_target: 4,
    business_value: businessValue, open_bugs: openBugs, open_tech_debt: cumulativeTechDebt,
  };
}

// Team A rondt in ronde 1 alle releases af en houdt 1.000 €CTU over. In ronde 2 werkt het aan release 3 en
// komt het 500 €CTU tekort.
export const TEAM_A = {name: "Team A", rounds: [score([5, 5, 0, 0], 3, 2, 4), score([10, 10, 5, 0], 9, 0, 2)]};
// Team B rondt in ronde 1 alle releases af en houdt 1.600 €CTU over. In ronde 2 werkt het nog aan release 1.
export const TEAM_B = {name: "Team B", rounds: [score([1, 1, 1, 1], 5, 1, 4), score([0, 0, 0, 0], 7, 4, 0)]};

// Een deel van de risico's, genoeg voor de tests.
export const RISKS = [{key: "data_loss", label: "🔥 Dataloss in productie"}, {key: "external_audit", label: "☑️ Externe audit"}];

export const STEPS = [
  {key: "team", label: "👫 Team"}, {key: "measures", label: "📋 Maatregelen"}, {key: "risks", label: "⚠️ Risico's"},
  {key: "velocity", label: "🚀 Velocity"}, {key: "cards", label: "🛠️ Bouw en test"},
];

// Een deel van de rollen, genoeg voor de tests.
export const ROLES = [{key: "architect", label: "👨🏻‍💼 Architect"}, {key: "product_owner", label: "🧕🏻 Product owner"}];

export function gameState(round = null, roundFinished = false) {
  return {round, last_round: 2, max_developers: 10, max_testers: 5, risks: RISKS, roles: ROLES, roles_from_round: 2, measures: MEASURES, measures_from_round: 2,
    protection_reasons: {no_software_ready: "nog geen software gereed"}, steps: STEPS, round_finished: roundFinished, finished: round === 2 && roundFinished};
}
