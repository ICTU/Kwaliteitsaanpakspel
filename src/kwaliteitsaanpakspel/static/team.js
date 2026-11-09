// De teampagina.

import {CHART_SIZE, renderLineChart} from "./charts.js";
import {REFRESH_INTERVAL, fetchState, formatMoney, formatNumber, phase, renderResults, resultsTitle} from "./teams.js";

export const STORAGE_KEY = "kwaliteitsaanpakspel-team";
// Het geheim waarmee het team zijn eigen releases wijzigt; het team krijgt het van de server bij het aanmelden.
export const TOKEN_KEY = "kwaliteitsaanpakspel-token";

// De tekst van de knop om de huidige release af te ronden, of null als alle releases zijn afgerond.
export function finishReleaseLabel(score) {
  const current = score.completed_releases + 1;
  if (current > score.releases.length) return null;
  if (current === score.releases.length) return `Rond release ${current} af`;
  return `Rond release ${current} af en start release ${current + 1}`;
}

// De uitleg bij de knop naar de volgende (direction is 1) of vorige (direction is -1) stap van de release, of null als
// er geen volgende of vorige stap is.
export function stepButtonLabel(release, stepLabels, direction) {
  const step = release.steps[release.steps.indexOf(release.step) + direction];
  return step === undefined ? null : `${direction > 0 ? "Volgende" : "Vorige"} stap: ${stepLabels[step]}`;
}

// De melding over de omgedraaide kaartjes die het team nog moet invoeren, of null als ze allemaal zijn ingevoerd.
export function openCardsMessage(openCards) {
  if (openCards === 0) return null;
  const cards = openCards === 1 ? "omgedraaid kaartje" : "omgedraaide kaartjes";
  return `Voer nog ${openCards} ${cards} in.`;
}

// De uitleg bij een waarde die door risico's, rollen of maatregelen is veranderd: per oorzaak een regel met het label
// en de verandering.
export function changesText(changes, labels, format = String) {
  return changes.map(({cause, change}) => `${labels[cause]} ${change > 0 ? "+" : "−"}${format(Math.abs(change))}`)
    .join("\n");
}

export function registrationError(body) {
  return typeof body.detail === "string" ? body.detail : "Aanmelden is niet gelukt.";
}

// De grafieken naast de releases en de ruimte die ze krijgen, in pixels.
const CHART_COUNT = 4;
const CHART_GAP = 24;  // de ruimte tussen twee grafieken naast elkaar; zie de CSS van .charts
const MIN_CHART_WIDTH = 220;  // smaller worden twee grafieken naast elkaar niet; zie de CSS van .charts
const CHART_PADDING = 8;  // de ruimte rond een grafiek binnen zijn kaartje; zie de CSS van .chart
const CHART_TITLE_SPACE = 45 + 2 * CHART_PADDING;  // de ruimte voor de titel en de rand van het kaartje
const MIN_CHART_HEIGHT = 120;
const MAX_CHART_HEIGHT = 320;

// Hoe ver het midden van de knoppen naar de vorige en volgende stap van de linkerrand van het kader staat, in pixels.
// De waarden en invoer staan rechts in de cellen, dus links is ruimte.
const STEP_BUTTON_OFFSET = 18;

// De ruimte tussen de onderkant van de tabel en de knop of melding om de release af te ronden, in pixels.
const RELEASE_FINISH_GAP = 8;

// De velocity die nodig is om een bug of een punt technische schuld op te lossen.
const VELOCITY_PER_FIX = 2;

// Geef een keuzelijst de veelvouden van step van 0 tot en met max als opties.
function setOptions(select, max, step) {
  const count = Math.floor(max / step) + 1;
  if (select.children.length === count) return;
  select.replaceChildren(...Array.from({length: count}, (_, index) => {
    const option = document.createElement("option");
    option.value = option.textContent = String(index * step);
    return option;
  }));
}

// De knopjes − en + bij een keuzelijst, en wat er moet gebeuren als de waarde verandert.
const steppers = new Map();

// Een keuzelijst met de veelvouden van step van 0 tot en met max.
function numberSelect(max, onChange, step = 1) {
  const select = document.createElement("select");
  setOptions(select, max, step);
  const change = () => onChange(Number(select.value));
  select.addEventListener("change", change);
  steppers.set(select, {change});
  return select;
}

// Zet een keuzelijst tussen de knopjes − en +, die de vorige of volgende optie kiezen.
function stepper(select) {
  const wrapper = document.createElement("span");
  wrapper.className = "stepper";
  const [minus, plus] = [["−", -1, "Minder"], ["+", 1, "Meer"]].map(([text, direction, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.ariaLabel = label;
    button.addEventListener("click", () => {
      const values = Array.from(select.children, option => option.value);
      select.value = values[values.indexOf(select.value) + direction];
      return steppers.get(select).change();
    });
    return button;
  });
  wrapper.append(minus, select, plus);
  Object.assign(steppers.get(select), {minus, plus});
  return wrapper;
}

// Zet de knopjes − en + uit als de keuzelijst uit staat of de waarde de kleinste of grootste is.
function showStepper(select) {
  const {minus, plus} = steppers.get(select);
  const values = Array.from(select.children, option => option.value);
  const index = values.indexOf(select.value);
  minus.disabled = select.disabled || index <= 0;
  plus.disabled = select.disabled || index >= values.length - 1;
}

// De soorten kaartjes, met de rij in de tabel waarin het team het aantal kaartjes invoert.
const CARD_ROWS = {
  one_point_cards: "release-one-point-cards",
  two_point_cards: "release-two-point-cards",
  three_point_cards: "release-three-point-cards",
  bug_cards: "release-delivered-bugs",
  tech_debt_cards: "release-delivered-tech-debt",
};

// Een symbool met een tooltip, zoals een schildje bij een beschermd risico of een slotje bij een keuze die niet kan.
// De uitleg staat in het aria-label, dat de CSS als tooltip toont.
function newIcon(className = "") {
  const result = document.createElement("span");
  result.className = `${className} tooltip`.trim();
  return result;
}

// Toon het symbool met de uitleg, of verberg het als er geen uitleg is.
function showIcon(icon, symbol, text) {
  icon.hidden = !text;
  icon.textContent = text ? symbol : "";
  icon.ariaLabel = text || "";
}

// Een cel met een waarde in een span, zodat de waarde een tooltip kan krijgen.
function newValueCell(row) {
  const cell = newCell(row);
  const value = document.createElement("span");
  cell.append(value);
  return [cell, value];
}

// Een vinkje in een nieuwe cel.
function newCheckbox(row, onChange) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.addEventListener("change", onChange);
  const cell = newCell(row);
  cell.append(checkbox);
  return [cell, checkbox];
}

// De sleutels van de aangevinkte vinkjes.
function checked(checkboxes) {
  return Object.keys(checkboxes).filter(key => checkboxes[key].checked);
}

function newCell(row, tagName = "td") {
  const cell = document.createElement(tagName);
  row.append(cell);
  return cell;
}

export function main() {
  const element = id => document.getElementById(id);
  let timer = null;
  let teamName = null;
  let releaseColumns = null;
  let labels = {};
  let protectionReasons = {};
  let rolesAdded = false;
  let measuresAdded = false;
  let riskGroup = null;
  let currentIndex = null;
  let lastScore = null;
  let measureGroup = null;
  let stepLabels = {};
  let cardRows = null;
  let groupsStep = null;
  let shownStep = null;

  // Bouw een groep rijen in een tbody: een rij per item, met de kop over de zichtbare rijen. Met het knopje in de kop
  // klapt het team de groep in; dan blijven alleen de rijen zichtbaar van items die in een release zijn aangevinkt, of,
  // als er niets is aangevinkt, een regel met emptyText.
  function createGroup(tbodyId, headingText, items, emptyText) {
    const heading = document.createElement("th");
    const toggle = newToggle(headingText);
    heading.append(toggle);
    const rows = Object.fromEntries(items.map(({key, label}) => {
      const row = document.createElement("tr");
      newCell(row, "th").textContent = label;
      element(tbodyId).append(row);
      return [key, row];
    }));
    const emptyRow = document.createElement("tr");
    const emptyLabel = newCell(emptyRow, "th");
    emptyLabel.textContent = emptyText;
    emptyLabel.className = "empty-group";
    element(tbodyId).append(emptyRow);
    const group = {id: tbodyId, heading, toggle, rows, emptyRow, checkedKeys: [], collapsed: true, active: false};
    toggle.addEventListener("click", () => {
      group.collapsed = !group.collapsed;
      showGroup(group);
      positionCurrentColumn();
    });
    showGroup(group);
    return group;
  }

  // Een label dat een knop is om rijen in en uit te klappen.
  function newToggle(text) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "toggle";
    toggle.textContent = text;
    return toggle;
  }

  // Rijen waarmee het team in de huidige stap bezig is, blijven uitgeklapt; het knopje doet dan niets.
  function showToggle(toggle, collapsed, active = false) {
    toggle.ariaExpanded = String(!collapsed || active);
    toggle.disabled = active;
    toggle.title = active ? "Het team is met deze stap bezig" : collapsed ? "Klik om uit te klappen" : "Klik om in te klappen";
  }

  // De rijen met de kaartjes van 1, 2 en 3 punten zijn in te klappen onder de opgeleverde businesswaarde.
  function setupCardRows() {
    const label = element("delivered-business-value-label");
    const toggle = newToggle(label.textContent);
    label.replaceChildren(toggle);
    cardRows = {collapsed: true, active: false};
    cardRows.show = () => {
      const collapsed = cardRows.collapsed && !cardRows.active;
      for (const row of ["release-one-point-cards", "release-two-point-cards", "release-three-point-cards"]) {
        element(row).hidden = collapsed;
      }
      element("delivered-heading").rowSpan = collapsed ? 3 : 6;
      showToggle(toggle, cardRows.collapsed, cardRows.active);
    };
    toggle.addEventListener("click", () => {
      cardRows.collapsed = !cardRows.collapsed;
      cardRows.show();
      positionCurrentColumn();
    });
    cardRows.show();
  }

  function showGroup(group) {
    const collapsed = group.collapsed && !group.active;
    const visible = Object.entries(group.rows)
      .filter(([key]) => !collapsed || group.checkedKeys.includes(key)).map(([, row]) => row);
    const shown = visible.length > 0 ? visible : [group.emptyRow];
    for (const row of [...Object.values(group.rows), group.emptyRow]) row.hidden = !shown.includes(row);
    shown[0].prepend(group.heading);
    group.heading.rowSpan = shown.length;
    showToggle(group.toggle, group.collapsed, group.active);
  }

  // Leg de kaart van de huidige release over de kolom: van de kop van de release tot de onderkant van de tabel. Een
  // kader in de kleur van de stap omlijst de cellen van de stap waar het team mee bezig is.
  // Onder de tabel staat in de kaart de knop of de melding om de release af te ronden.
  function positionCurrentColumn() {
    const column = releaseColumns?.[currentIndex];
    for (const id of ["current-column-plate", "current-column-frame"]) element(id).hidden = column === undefined;
    if (column !== undefined) {
      const [area, heading, table] = [element("releases-area"), column.cells[0], element("releases")]
        .map(part => part.getBoundingClientRect());
      const finish = element("release-finish");
      finish.style.left = `${heading.left - area.left}px`;
      finish.style.top = `${table.bottom - area.top + RELEASE_FINISH_GAP}px`;
      finish.style.width = `${heading.width}px`;
      const finishHeight = finish.hidden ? 0 : RELEASE_FINISH_GAP * 2 + finish.getBoundingClientRect().height;
      for (const id of ["current-column-plate", "current-column-frame"]) {
        const card = element(id);
        card.style.left = `${heading.left - area.left}px`;
        card.style.top = `${heading.top - area.top}px`;
        card.style.width = `${heading.width}px`;
        card.style.height = `${table.bottom - heading.top + finishHeight}px`;
      }
    }
    positionCurrentStep(column);
  }

  // Het kader rond de cellen van de huidige stap, met op de bovenrand de knop naar de vorige stap en op de onderrand
  // de knop naar de volgende stap.
  function positionCurrentStep(column) {
    const frame = element("current-step-frame");
    const release = lastScore?.releases[currentIndex];
    const step = release?.step;
    const cells = (column?.stepCells[step] ?? []).map(cell => cell.getBoundingClientRect()).filter(rect => rect.height > 0);
    frame.hidden = cells.length === 0;
    const buttons = [[element("previous-step"), -1], [element("next-step"), 1]];
    for (const [button, direction] of buttons) {
      const label = cells.length === 0 ? null : stepButtonLabel(release, stepLabels, direction);
      button.hidden = label === null;
      button.title = button.ariaLabel = label ?? "";
    }
    if (cells.length === 0) return;
    const [area, heading] = [element("releases-area"), column.cells[0]].map(part => part.getBoundingClientRect());
    const top = Math.min(...cells.map(rect => rect.top));
    const bottom = Math.max(...cells.map(rect => rect.bottom));
    frame.className = `current-step ${step}`;
    frame.style.left = `${heading.left - area.left}px`;
    frame.style.top = `${top - area.top}px`;
    frame.style.width = `${heading.width}px`;
    frame.style.height = `${bottom - top}px`;
    for (const [button, direction] of buttons) {
      button.className = `step-button ${step}`;
      button.style.left = `${heading.left - area.left + STEP_BUTTON_OFFSET}px`;
      button.style.top = `${(direction < 0 ? top : bottom) - area.top}px`;
    }
    // Is het team naar een andere stap gegaan, scrol die stap dan in beeld. In de laatste stap ook de knop of melding om
    // de release af te ronden, onderaan de kaart, en opnieuw als de knop de melding vervangt.
    const key = `${currentIndex} ${step} ${element("finish-release").hidden}`;
    const finish = element("release-finish");
    if (key !== shownStep) (finish.hidden ? frame : finish).scrollIntoView({block: "nearest", behavior: "smooth"});
    shownStep = key;
  }

  // De hoogte van elke grafiek: de hoogte van de grafiekkolom verdeeld over de rijen grafieken, min de ruimte voor de titel,
  // en niet kleiner dan MIN_CHART_HEIGHT of groter dan MAX_CHART_HEIGHT.
  // Als er ruimte is, staan de grafieken twee aan twee, en anders onder elkaar (zie de CSS van .charts). Elke grafiek
  // is zo breed als zijn kolom; zonder bekende breedte CHART_SIZE.width.
  function chartSize() {
    const {clientWidth = 0, clientHeight = 0} = element("charts");
    const columns = Math.min(Math.max(Math.floor((clientWidth + CHART_GAP) / (MIN_CHART_WIDTH + CHART_GAP)), 1), 2);
    const perChart = Math.floor(clientHeight / Math.ceil(CHART_COUNT / columns) - CHART_TITLE_SPACE);
    const columnWidth = Math.floor((clientWidth - CHART_GAP * (columns - 1)) / columns);
    return {
      width: columnWidth > 0 ? columnWidth - 2 * CHART_PADDING : CHART_SIZE.width,
      height: Math.min(Math.max(perChart, MIN_CHART_HEIGHT), MAX_CHART_HEIGHT),
    };
  }

  addEventListener("resize", () => {
    positionCurrentColumn();
    if (lastScore !== null) showCharts(lastScore);
  });

  // Werk de groepen bij met wat het team in de releases heeft aangevinkt en met de stap van de huidige release.
  // Bij een nieuwe stap is alleen de groep van die stap uitgeklapt; de andere groepen tonen alleen wat er is
  // aangevinkt. Binnen een stap kan het team die groepen zelf uitklappen.
  function showGroups(score) {
    const step = score.releases[score.completed_releases]?.step;
    const newStep = groupsStep !== `${score.completed_releases} ${step}`;
    groupsStep = `${score.completed_releases} ${step}`;
    for (const [group, key] of [[riskGroup, "risks"], [measureGroup, "measures"], [cardRows, "cards"]]) {
      if (group === null) continue;
      group.active = step === key;
      if (newStep) group.collapsed = !group.active;
      if (group === cardRows) {
        cardRows.show();
        continue;
      }
      group.checkedKeys = score.releases.flatMap(release => release[key]);
      showGroup(group);
    }
  }

  // De koppen van de rijen die bij elke stap horen.
  function stepHeadings() {
    return {
      team: element("team-heading"), measures: measureGroup?.heading, risks: riskGroup.heading,
      velocity: element("velocity-heading"), cards: element("delivered-heading"),
    };
  }

  // Markeer in de huidige release de cellen van de stap waar het team mee bezig is en dim die van de stappen die nog
  // komen. De koppen van de stappen die het team heeft gedaan, krijgen een vinkje.
  function showSteps(score) {
    const release = score.releases[score.completed_releases];
    // Waar een stap staat ten opzichte van de huidige stap: ervoor (negatief), de huidige (0) of erna (positief).
    const position = step => release.steps.indexOf(step) - release.steps.indexOf(release.step);
    releaseColumns.forEach((column, index) => {
      for (const [step, cells] of Object.entries(column.stepCells)) {
        const current = index === score.completed_releases;
        for (const cell of cells) {
          cell.classList.toggle("step-active", current && position(step) === 0);
          cell.classList.toggle("step-todo", current && position(step) > 0);
        }
      }
    });
    for (const [step, heading] of Object.entries(stepHeadings())) {
      heading?.classList.toggle("step-done", release !== undefined && release.steps.includes(step) && position(step) < 0);
    }
  }

  // Bouw de kolommen voor de releases één keer op; daarna worden alleen de waarden bijgewerkt.
  function createReleaseColumns(releaseCount, game) {
    riskGroup = createGroup("risks", "⚠️ Risico's", game.risks, "Geen risico's aangevinkt");
    const riskRows = riskGroup.rows;
    labels = Object.fromEntries([...game.risks, ...game.roles, ...game.measures].map(({key, label}) => [key, label]));
    stepLabels = Object.fromEntries(game.steps.map(({key, label}) => [key, label]));
    protectionReasons = game.protection_reasons;
    return Array.from({length: releaseCount}, (_, index) => {
      const releaseNumber = index + 1;
      const heading = newCell(element("release-headings"), "th");
      heading.textContent = `Release ${releaseNumber}`;
      const developerSelect = numberSelect(game.max_developers, developers => plan(releaseNumber, {developers}));
      const testerSelect = numberSelect(game.max_testers, testers => plan(releaseNumber, {testers}));
      // Het maximum van deze keuzelijsten hangt af van de velocity en wordt bij het tonen bijgewerkt.
      const bugFixingSelect = numberSelect(0, bugFixing => plan(releaseNumber, {bug_fixing: bugFixing}), VELOCITY_PER_FIX);
      const techDebtSelect = numberSelect(0, techDebt => plan(releaseNumber, {tech_debt: techDebt}), VELOCITY_PER_FIX);
      const [businessValueCell, businessValue] = newValueCell(element("release-business-value-targets"));
      const [bugsCell, bugs] = newValueCell(element("release-bugs-targets"));
      const [techDebtTargetCell, techDebtTarget] = newValueCell(element("release-tech-debt-targets"));
      const [budgetCell, budget] = newValueCell(element("release-budgets"));
      const developers = newCell(element("release-developers"));
      const [developerLock, extraDevelopers] = [newIcon(), newIcon("extra")];
      developers.append(developerLock, stepper(developerSelect), extraDevelopers);
      const testers = newCell(element("release-testers"));
      const [testerLock, extraTesters] = [newIcon(), newIcon("extra")];
      testers.append(testerLock, stepper(testerSelect), extraTesters);
      const riskCells = [newCell(riskGroup.emptyRow)];
      const riskCheckboxes = {};
      const riskShields = {};
      for (const [key, row] of Object.entries(riskRows)) {
        const [cell, checkbox] = newCheckbox(row, () => plan(releaseNumber, {risks: checked(riskCheckboxes)}));
        // Een schildje als een rol, maatregel of reden tegen het risico beschermt.
        riskShields[key] = newIcon();
        cell.replaceChildren(riskShields[key], checkbox);
        riskCells.push(cell);
        riskCheckboxes[key] = checkbox;
      }
      const [velocityCell, velocity] = newValueCell(element("release-velocities"));
      const bugFixing = newCell(element("release-bug-fixing"));
      bugFixing.append(stepper(bugFixingSelect));
      const techDebt = newCell(element("release-tech-debt"));
      techDebt.append(stepper(techDebtSelect));
      const businessValueVelocity = newCell(element("release-business-value-velocities"));
      const deliveredBusinessValue = newCell(element("release-delivered-business-value"));
      const cardCells = [];
      const cardSelects = {};
      for (const [card, row] of Object.entries(CARD_ROWS)) {
        cardSelects[card] = numberSelect(0, count => plan(releaseNumber, {[card]: count}));
        cardCells.push(newCell(element(row)));
        cardCells.at(-1).append(stepper(cardSelects[card]));
      }
      const cumulative = {
        business_value: newCell(element("release-cumulative-business-value")),
        bugs: newCell(element("release-cumulative-bugs")),
        tech_debt: newCell(element("release-cumulative-tech-debt")),
      };
      const [bugFixingCapacityCell, bugFixingCapacity] = newValueCell(element("release-bug-fixing-capacities"));
      const [techDebtCapacityCell, techDebtCapacity] = newValueCell(element("release-tech-debt-capacities"));
      return {
        cells: [
          heading, businessValueCell, bugsCell, techDebtTargetCell, budgetCell, developers, testers, ...riskCells, velocityCell,
          bugFixing, techDebt,
          businessValueVelocity, bugFixingCapacityCell, techDebtCapacityCell, deliveredBusinessValue, ...cardCells,
          ...Object.values(cumulative),
        ],
        businessValue, bugs, techDebtTarget, budget, developerSelect, testerSelect, velocity, bugFixingSelect, techDebtSelect,
        businessValueVelocity, bugFixingCapacity, techDebtCapacity, cardSelects, deliveredBusinessValue, cumulative,
        riskCheckboxes, riskShields, roleCheckboxes: {}, roleLocks: {}, measureCheckboxes: {}, measureLocks: {},
        extraDevelopers, extraTesters, developerLock, testerLock,
        // De cellen van elke stap; de rollen en maatregelen komen er in ronde 2 bij.
        stepCells: {
          team: [developers, testers], measures: [], risks: riskCells,
          velocity: [velocityCell, bugFixing, techDebt, businessValueVelocity],
          cards: [deliveredBusinessValue, ...cardCells],
        },
      };
    });
  }

  // Voeg de rijen voor de rollen toe aan het team, met per release een vinkje per rol.
  function addRoleRows(roles) {
    element("team-heading").rowSpan = 2 + roles.length;
    for (const {key, label} of roles) {
      const row = document.createElement("tr");
      newCell(row, "th").textContent = label;
      element("team-rows").append(row);
      releaseColumns.forEach((column, index) => {
        const [cell, checkbox] = newCheckbox(row, () => plan(index + 1, {roles: checked(column.roleCheckboxes)}));
        column.roleLocks[key] = newIcon();
        cell.replaceChildren(column.roleLocks[key], checkbox);
        column.cells.push(cell);
        column.stepCells.team.push(cell);
        column.roleCheckboxes[key] = checkbox;
      });
    }
  }

  // Voeg de rijen voor de maatregelen toe, met per release een vinkje per maatregel.
  function addMeasureRows(measures) {
    measureGroup = createGroup("measures", "📋 Maatregelen", measures, "Geen maatregelen genomen");
    releaseColumns.forEach(column => {
      const cell = newCell(measureGroup.emptyRow);
      column.cells.push(cell);
      column.stepCells.measures.push(cell);
    });
    for (const [key, row] of Object.entries(measureGroup.rows)) {
      releaseColumns.forEach((column, index) => {
        const [cell, checkbox] = newCheckbox(row, () => plan(index + 1, {measures: checked(column.measureCheckboxes)}));
        column.measureLocks[key] = newIcon();
        cell.replaceChildren(column.measureLocks[key], checkbox);
        column.cells.push(cell);
        column.stepCells.measures.push(cell);
        column.measureCheckboxes[key] = checkbox;
      });
    }
  }

  function showReleases(score) {
    score.releases.forEach((release, index) => {
      const column = releaseColumns[index];
      const current = index === score.completed_releases;
      // Het team wijzigt alleen wat bij de stap hoort waar het mee bezig is.
      const active = step => current && release.step === step;
      // Tijdens de voorfase huurt het team geen mensen in.
      const canHire = active("team") && !release.team_locked;
      for (const cell of column.cells) cell.classList.toggle("current", current);
      showChanges(column.businessValue, release.business_value_target, release.business_value_target_changes);
      showChanges(column.bugs, release.bugs_target, release.bugs_target_changes);
      showChanges(column.techDebtTarget, release.tech_debt_target, release.tech_debt_target_changes);
      showChanges(column.budget, formatMoney(release.budget), release.budget_changes, formatMoney);
      column.budget.classList.toggle("negative", release.budget < 0);
      showChanges(column.velocity, release.velocity, release.velocity_changes);
      column.businessValueVelocity.textContent = release.business_value_velocity;
      showChanges(column.bugFixingCapacity, release.bug_fixing_capacity, release.bug_fixing_capacity_changes);
      showChanges(column.techDebtCapacity, release.tech_debt_capacity, release.tech_debt_capacity_changes);
      showCheckboxes(column.riskCheckboxes, release.risks, active("risks"), key => key in release.protected_risks);
      for (const [key, shield] of Object.entries(column.riskShields)) {
        const cause = release.protected_risks[key];
        showIcon(shield, "🛡️ ", cause && protectionText(cause));
      }
      // In de huidige release legt een slotje uit waarom het team iets niet kan kiezen.
      const teamLock = current && release.team_locked && `${labels.preliminary_phase}: de voorfase heeft een eigen team`;
      for (const lock of [column.developerLock, column.testerLock, ...Object.values(column.roleLocks)]) {
        showIcon(lock, "🔒 ", teamLock);
      }
      for (const [key, lock] of Object.entries(column.measureLocks)) {
        showIcon(lock, "🔒 ", active("measures") && release.unavailable_measures[key]);
      }
      showCheckboxes(column.roleCheckboxes, release.roles, canHire);
      showCheckboxes(
        column.measureCheckboxes, release.measures, active("measures"), key => !release.available_measures.includes(key),
      );
      for (const [card, select] of Object.entries(column.cardSelects)) {
        showSelect(select, release[card], active("cards"), release.open_cards + release[card]);
      }
      // In toekomstige releases is nog niets opgeleverd: het cumulatief is daar de stand tot nu toe.
      column.deliveredBusinessValue.textContent = release.delivered_business_value;
      for (const [key, cell] of Object.entries(column.cumulative)) {
        cell.textContent = release[`cumulative_${key}`];
      }
      showSelect(column.developerSelect, release.developers, canHire);
      showSelect(column.testerSelect, release.testers, canHire);
      const demo = labels.impromptu_demo;
      showIcon(column.extraDevelopers, ` +${release.extra_developers}`,
        release.extra_developers > 0 && `${demo}: te weinig functionaliteit +${release.extra_developers}`);
      showIcon(column.extraTesters, ` +${release.extra_testers}`,
        release.extra_testers > 0 && `${demo}: te veel bugs +${release.extra_testers}`);
      const velocity = active("velocity");
      showSelect(column.bugFixingSelect, release.bug_fixing, velocity, release.velocity - release.tech_debt, VELOCITY_PER_FIX);
      showSelect(column.techDebtSelect, release.tech_debt, velocity, release.velocity - release.bug_fixing, VELOCITY_PER_FIX);
    });
  }

  // De grafieken naast de releases: wat het team cumulatief heeft uitgegeven en opgeleverd, tegenover het target. Voor
  // het budget is het target het totale budget tot en met de release. Net als in de tabel staat wat het team heeft
  // uitgegeven en opgeleverd alleen in de grafiek voor releases die zijn gestart.
  function showCharts(score) {
    lastScore = score;
    const releases = score.releases;
    const {width, height} = chartSize();
    const labels = releases.map((_, index) => String(index + 1));
    const started = key => releases.map((release, index) => (index <= score.completed_releases ? release[key] : null));
    const chart = (id, options) =>
      renderLineChart(element(id), element(`${id}-tooltip`), {labels, axisLabel: "Release", width, height, ...options});
    chart("budget-chart", {
      values: started("cumulative_cost"),
      target: releases.map(release => release.cumulative_budget),
      format: formatMoney,
      tickFormat: formatNumber,
    });
    for (const [id, key, target] of [
      ["business-value-chart", "cumulative_business_value", "business_value_target"],
      ["bugs-chart", "cumulative_bugs", "bugs_target"],
      ["tech-debt-chart", "cumulative_tech_debt", "tech_debt_target"],
    ]) {
      chart(id, {values: started(key), target: releases.map(release => release[target])});
    }
  }

  // Toon vinkjes; vinkjes die niet beschikbaar zijn, bijvoorbeeld voor beschermde risico's, zijn uitgeschakeld.
  // De uitleg bij een schildje: de rol of maatregel die beschermt, of een andere reden.
  function protectionText(cause) {
    return cause in protectionReasons ? `Beschermd: ${protectionReasons[cause]}` : `Beschermd door ${labels[cause]}`;
  }

  function showCheckboxes(checkboxes, checkedKeys, active, unavailable = () => false) {
    for (const [key, checkbox] of Object.entries(checkboxes)) {
      checkbox.disabled = !active || unavailable(key);
      // Laat het vinkje met rust als het team er net mee bezig is.
      if (document.activeElement !== checkbox) checkbox.checked = checkedKeys.includes(key);
    }
  }

  // Toon een waarde; als risico's, rollen of maatregelen de waarde hebben veranderd, met een tooltip met de uitleg.
  function showChanges(span, value, changes, format = String) {
    const changed = changes.length > 0;
    span.textContent = value;
    span.classList.toggle("changed", changed);
    span.classList.toggle("tooltip", changed);
    span.ariaLabel = changesText(changes, labels, format);
  }

  function showSelect(select, value, active, max = null, step = 1) {
    select.disabled = !active;
    // Laat de keuzelijst met rust als het team er net mee bezig is.
    if (document.activeElement !== select) {
      if (max !== null) setOptions(select, max, step);
      select.value = String(value);
    }
    showStepper(select);
  }

  async function releaseAction(path, options) {
    const headers = {...options.headers, "X-Team-Token": localStorage.getItem(TOKEN_KEY)};
    const response = await fetch(`/api/teams/${encodeURIComponent(teamName)}/${path}`, {...options, headers});
    const body = await response.json();
    element("release-error").textContent = response.ok ? "" : body.detail;
    await refresh(teamName);
  }

  function plan(releaseNumber, changes) {
    return releaseAction(`releases/${releaseNumber}`, {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(changes),
    });
  }

  for (const action of ["finish-release", "next-step", "previous-step"]) {
    element(action).addEventListener("click", () => releaseAction(action, {method: "POST"}));
  }

  function show(team, game, teams) {
    const currentPhase = phase(game);
    element("register").hidden = true;
    element("team").hidden = false;
    element("team-name").textContent = team.name;
    for (const name of ["waiting", "playing", "results"]) {
      element(name).hidden = name !== currentPhase;
    }
    element("release-bar").hidden = currentPhase !== "playing";
    // Achter de teamnaam staat in het kruimelpad de ronde, het resultaat of dat het team wacht op de start.
    element("status").hidden = false;
    element("status").textContent = {
      waiting: "Wacht tot de spelleider het spel start", playing: `Ronde ${game.round}`, results: resultsTitle(game),
    }[currentPhase];
    // De release en de stap, of de melding dat alle releases zijn afgerond, staan alleen tijdens een ronde in het
    // kruimelpad.
    if (currentPhase !== "playing") {
      for (const id of ["release-crumb", "step", "releases-done"]) element(id).hidden = true;
    }
    if (currentPhase === "playing") {
      const score = team.rounds[game.round - 1];
      releaseColumns ??= createReleaseColumns(score.releases.length, game);
      if (game.round >= game.roles_from_round && !rolesAdded) {
        addRoleRows(game.roles);
        rolesAdded = true;
      }
      if (game.round >= game.measures_from_round && !measuresAdded) {
        addMeasureRows(game.measures);
        measuresAdded = true;
      }
      showReleases(score);
      showGroups(score);
      showSteps(score);
      currentIndex = score.completed_releases;
      showCharts(score);
      showReleaseBar(score);
      positionCurrentColumn();
    }
    if (currentPhase === "results") {
      renderResults(element("results-tables"), teams, game.round, team.name);
    }
  }

  // Het kruimelpad met de release en de stap waar het team is, en de knop of melding om de release af te ronden.
  function showReleaseBar(score) {
    const label = finishReleaseLabel(score);
    const release = score.releases[score.completed_releases];
    const finishing = label !== null && stepButtonLabel(release, stepLabels, 1) === null;
    const message = finishing ? openCardsMessage(release.open_cards) : null;
    element("release-crumb").hidden = label === null;
    element("release-crumb").textContent = label === null ? "" : `Release ${score.completed_releases + 1}`;
    element("step").hidden = label === null;
    element("step").textContent = label === null ? "" : stepLabels[release.step];
    // In de laatste stap staat onderaan de kaart de knop om de release af te ronden, of, zolang er nog kaartjes moeten
    // worden ingevoerd, hoeveel dat er zijn.
    element("release-finish").hidden = !finishing;
    element("finish-release").hidden = !finishing || message !== null;
    element("finish-release").textContent = finishing ? label : "";
    element("open-cards").hidden = message === null;
    element("open-cards").textContent = message ?? "";
    element("releases-done").hidden = label !== null;
  }

  async function refresh(name) {
    const {teams, game} = await fetchState();
    const team = teams.find(team => team.name === name);
    if (team) {
      show(team, game, teams);
    } else {
      forget();
    }
  }

  function follow(name) {
    teamName = name;
    localStorage.setItem(STORAGE_KEY, name);
    timer = setInterval(() => refresh(name), REFRESH_INTERVAL);
    return refresh(name);
  }

  function forget() {
    // De server kent het team niet (meer), bijvoorbeeld omdat het spel opnieuw is gestart.
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    clearInterval(timer);
    element("register").hidden = false;
    element("team").hidden = true;
    // Het kruimelpad van het aanmeldscherm.
    element("team-name").textContent = "Kwaliteitsaanpakspel";
    element("status").textContent = "Aanmelden";
    element("status").hidden = false;
    for (const id of ["release-crumb", "step", "releases-done", "release-bar"]) element(id).hidden = true;
  }

  element("register").addEventListener("submit", async event => {
    event.preventDefault();
    const response = await fetch("/api/teams", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name: element("name").value}),
    });
    const body = await response.json();
    if (!response.ok) {
      element("error").textContent = registrationError(body);
      return;
    }
    localStorage.setItem(TOKEN_KEY, body.token);
    await follow(body.name);
  });

  setupCardRows();

  // Een link van de spelleider om opnieuw te verbinden bevat de naam en het token van het team na de #. Plakt het team
  // de link in een tabblad met deze pagina, dan verandert alleen de #; laad de pagina dan opnieuw.
  addEventListener("hashchange", () => location.reload());
  const reconnect = new URLSearchParams(location.hash.slice(1));
  if (reconnect.has("team") && reconnect.has("token")) {
    localStorage.setItem(STORAGE_KEY, reconnect.get("team"));
    localStorage.setItem(TOKEN_KEY, reconnect.get("token"));
    history.replaceState(null, "", location.pathname);  // Haal het token uit de adresbalk.
  }
  const storedName = localStorage.getItem(STORAGE_KEY);
  if (storedName === null) return Promise.resolve();
  if (localStorage.getItem(TOKEN_KEY) === null) {
    // Aangemeld met een oudere versie van het spel, zonder token: het team kan zijn releases niet wijzigen.
    forget();
    return Promise.resolve();
  }
  element("register").hidden = true;
  return follow(storedName);
}
