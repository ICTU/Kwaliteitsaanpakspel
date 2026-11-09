// De spelleiderpagina.

import {REFRESH_INTERVAL, fetchState, phase, renderResults, resultsTable, resultsTitle} from "./teams.js";

export function nextAction(game) {
  if (game.finished) return null;
  if (game.round === null) return {path: "start-round", label: "Start ronde 1"};
  if (game.round_finished) return {path: "start-round", label: `Start ronde ${game.round + 1}`};
  return {path: "finish-round", label: `Stop ronde ${game.round}`};
}

// De status in het kruimelpad, achter "Spelleider".
export function statusText(game) {
  return {waiting: "Teams aanmelden", playing: `Ronde ${game.round}`, results: resultsTitle(game)}[phase(game)];
}

function teamNames(teams) {
  return teams.map(team => {
    const item = document.createElement("li");
    item.textContent = team.name;
    return item;
  });
}

// Per team een knop die de link kopieert waarmee het team weer in het spel komt.
function reconnectItems(links) {
  return links.map(({name, url}) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = "📋 Kopieer link";
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(url);
      button.textContent = "✅ Gekopieerd";
    });
    item.append(name, button);
    return item;
  });
}

export function main() {
  const element = id => document.getElementById(id);
  let action = null;

  // Toon de links om teams opnieuw te verbinden; alleen opnieuw opbouwen als de teams zijn veranderd, zodat een
  // "Gekopieerd" blijft staan.
  async function showReconnectLinks(teams) {
    element("reconnect").hidden = teams.length === 0;
    const key = teams.map(team => team.name).join("\n");
    if (teams.length === 0 || element("reconnect-links").dataKey === key) return;
    const links = await (await fetch("/api/teams/links")).json();
    element("reconnect-links").replaceChildren(...reconnectItems(links));
    element("reconnect-links").dataKey = key;
  }

  async function refresh() {
    const {teams, game} = await fetchState();
    const currentPhase = phase(game);
    const status = statusText(game);
    action = nextAction(game);
    for (const name of ["waiting", "playing", "results"]) {
      element(name).hidden = name !== currentPhase;
    }
    element("status").textContent = status;
    element("action").hidden = action === null;
    element("action").disabled = teams.length === 0;
    element("action").textContent = action?.label ?? "";
    element("no-teams").hidden = teams.length > 0;
    element("team-names").replaceChildren(...teamNames(teams));
    await showReconnectLinks(teams);
    if (currentPhase === "playing") {
      // Tijdens de ronde ziet de spelleider ook bij welke stap van de release elk team is.
      const stepLabels = Object.fromEntries(game.steps.map(({key, label}) => [key, label]));
      element("scores").replaceChildren(resultsTable(teams, game.round - 1, null, stepLabels));
    }
    if (currentPhase === "results") {
      renderResults(element("results-tables"), teams, game.round);
    }
  }

  element("action").addEventListener("click", async () => {
    const response = await fetch(`/api/game/${action.path}`, {method: "POST"});
    const body = await response.json();
    element("error").textContent = response.ok ? "" : body.detail;
    await refresh();
  });

  setInterval(refresh, REFRESH_INTERVAL);
  return refresh();
}
