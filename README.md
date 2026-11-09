# Kwaliteitsaanpakspel

[![CI](https://github.com/ICTU/Kwaliteitsaanpakspel/actions/workflows/ci.yml/badge.svg)](https://github.com/ICTU/Kwaliteitsaanpakspel/actions/workflows/ci.yml)

De ICTU Kwaliteitsaanpak Softwareontwikkeling als spel. De software ondersteunt het bordspel: per team houdt hij het budget, de velocity, de opgeleverde business waarde, de bugs en de technische schuld bij, en de spelleider ziet de voortgang en de resultaten van alle teams.

## Spelen

Het spel draait op één laptop, die van de spelleider; alle teams spelen mee via de browser op hun eigen laptop. Alle laptops moeten op hetzelfde (wifi-)netwerk zitten.

Start het spel met [just](https://just.systems/) (dat [uv](https://docs.astral.sh/uv/) gebruikt):

```console
just start
```

De browser opent dan automatisch de spelleiderpagina. Daarop staat het adres dat de teams in hun browser moeten openen, bijvoorbeeld `http://192.168.1.23:8765`. Is poort 8765 bezet, dan kiest het spel automatisch de volgende vrije poort.

### Het verloop van het spel

1. De teams melden zich aan met een teamnaam. De spelleider ziet de aangemelde teams.
2. De spelleider start ronde 1. Een ronde heeft vier releases.
3. Elk team doorloopt per release een aantal stappen. De stap waar het team mee bezig is, heeft een kader in de releasetabel; met ▲ en ▼ op dat kader gaat het team naar de vorige of volgende stap:
   - 👫 **Team**: ontwikkelaars en testers inhuren en, vanaf ronde 2, rollen inzetten;
   - 📋 **Maatregelen** (vanaf ronde 2);
   - ⚠️ **Risico's**: de opgetreden risico's aanvinken;
   - 🚀 **Velocity**: de velocity verdelen over bugs, technische schuld en business waarde;
   - 🛠️ **Bouw en test**: de omgedraaide kaartjes invoeren. Zijn alle kaartjes ingevoerd, dan rondt het team de release af en begint de volgende.
4. Tijdens de ronde ziet de spelleider per team bij welke release en stap het is, en hoe het ervoor staat ten opzichte van de targets. Naast de releasetabel ziet elk team grafieken van het budget, de business waarde, de bugs en de technische schuld.
5. De spelleider stopt de ronde; iedereen ziet dan de resultaten. Daarna start de spelleider ronde 2 en, na afloop daarvan, zien alle teams de resultaten van beide rondes.

Is een team zijn aanmelding kwijt, bijvoorbeeld omdat de browser is gewist of het team een andere laptop gebruikt, dan kan de spelleider via **🔗 Team opnieuw verbinden** een link kopiëren waarmee het team weer in het spel komt.

### Kunnen de teams het spel niet bereiken?

- Sta inkomende verbindingen toe als de firewall daarom vraagt (macOS en Windows vragen dit bij de eerste keer starten).
- Sommige (gast)netwerken blokkeren verkeer tussen apparaten onderling. Gebruik dan bijvoorbeeld de hotspot van een telefoon.

### Beveiliging

- Alleen de laptop van de spelleider kan het spel besturen, en alleen via `localhost`.
- Elk team krijgt bij het aanmelden een geheim token, zodat alleen het team zelf zijn releases kan wijzigen.

## Ontwikkelen

Nodig: [uv](https://docs.astral.sh/uv/) (dat zelf Python 3.13 installeert), [just](https://just.systems/) en [Node.js](https://nodejs.org/) 26.

Draai alle unittests, van zowel de Python-code als de JavaScript-code (met de testrunner die in Node.js is ingebouwd), met dekkingsmeting:

```console
just test
```

De dekking moet voor beide 100% zijn. Met `just test-python` en `just test-js` draai je ze apart. De JavaScript-tests gebruiken geen npm-pakketten, maar een eigen nagemaakte DOM (`tests/js/fakes.js`).

Controleer de Python-code met [ruff](https://docs.astral.sh/ruff/), op fouten en op de opmaak:

```console
just lint
```

`just` zonder argumenten toont alle recipes. GitHub Actions draait `just lint` en `just test` bij elke push en pull request.

### Opbouw

- `src/kwaliteitsaanpakspel/game.py`: de spelregels en de stand per team;
- `src/kwaliteitsaanpakspel/app.py`: de webapplicatie (FastAPI), met de spelleiderpagina op `localhost` en de teampagina op de andere laptops;
- `src/kwaliteitsaanpakspel/cli.py` en `network.py`: het starten van de server en het bepalen van het adres op het netwerk;
- `src/kwaliteitsaanpakspel/static/`: de pagina's, scripts en stijl (`common.css` is gedeeld door de spelleiderpagina en de teampagina).
