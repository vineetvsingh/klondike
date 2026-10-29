# Solitaire

Klondike, FreeCell, Spider and Pyramid solitaire built with **React 19 + TypeScript + Vite**, animated with **Motion** springs.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # unit tests: rules, solvers
npm run test:e2e   # browser tests (Playwright; builds and serves the app itself)
npm run build      # production build in dist/ (serve with `npm run preview`)
```

The first time you run the browser tests, install a browser with `npx playwright install chromium`, or reuse one you already have: `PW_CHANNEL=msedge npm run test:e2e`. CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, `npm audit` and the browser tests on every push and pull request.

## Games

- **Klondike**: Draw 1 or Draw 3, unlimited passes through the stock.
- **FreeCell**: four free cells. You can move a run as long as there are enough free cells and empty columns to shuffle it through.
- **Spider**: two decks with 1, 2 or 4 suits. A finished King-to-Ace suit clears itself, and the stock deals a row only when no column is empty.
- **Pyramid**: 28 cards in seven overlapping rows. Remove exposed cards in pairs that add up to 13 (J = 11, Q = 12), and kings on their own, using the waste card too. You get three passes through the stock. Tap a king to clear it, or drag one card onto its partner.

To switch games, tap the game name in the top bar (on phones, **⋯ → Change game**). You always confirm before the table is replaced. A game in progress counts as a loss, but you can undo that for a few seconds.

## Winnable deals and the Daily Deal

`src/game/solver.ts` is a depth-first Klondike solver. It treats the stock and waste as one "talon", so every card that drawing can reach becomes a single move. It also uses a visited set, makes safe foundation moves automatically, and has a node budget, so a timeout means "unknown" and is never counted as winnable. `src/game/solvers.ts` covers the other games: a best-first search for FreeCell and Spider, and a depth-first search for Pyramid. Every solver returns the moves it found, and the unit tests replay those moves through the real rules to prove the solutions are legal. The solvers run in a Web Worker that keeps a couple of proven seeds in reserve for each game and mode, saved across visits, so **Winnable only** deals are usually instant.

Four-suit Spider is the exception. Proving those deals takes far too long, so they are dealt unchecked, and the settings say so. In local benchmarks, the solvers proved about 73% of Klondike Draw 1 deals, every FreeCell deal tried, every one-suit Spider deal and about half of the Pyramid deals. Deals the solver gives up on are discarded, never shown as winnable.

The **Daily Deal** is Klondike Draw 1, numbered from 1 January 2026. It is the first seed in that day's fixed sequence that the solver can win, so every player gets the same game. Finished days fill the calendar, the streak counts consecutive days, and **Share** copies a line such as `Solitaire Daily #302 · 3:41 · 118 moves`.

## Progress

A local profile keeps the last 1,000 games plus totals and best times per game. It drives:

- the **Stats** tab: win rate over time, a histogram of winning times and your best runs. Each chart has a hover readout and a table view.
- 17 **achievements**.
- unlockable **card backs** (Sunburst, Waves, Deco, Constellation, Gilded) and **felts** (Lagoon, Plum, Copper), earned by your number of wins.

## How it's put together

- `src/game/`: the pure rules engine, with one module per game in `rules/` behind a shared interface. It also holds the seeded deals, layout maths, solver, daily logic, profile and storage. None of it uses React.
- Dialogs stay mounted and are only shown or hidden. They fade in with CSS transitions on the compositor, so opening one doesn't rebuild its contents or repaint the table behind it.
- `src/components/Board.tsx`: drives every card through Motion values imperatively, so drags and flights run at frame rate without React re-renders.
  - Released cards keep their throw velocity, and cards lean into their direction of travel.
  - A dragged card is pulled gently toward a legal spot nearby (magnetic drop).
  - On a win, the cards spiral out of the foundations into a sunflower rosette.
- `src/audio/sound.ts`: every sound is synthesised live with the Web Audio API, with no audio files. `src/audio/haptics.ts` adds short vibrations on pickup and landing, and a longer one on a win, on phones that support it. **Settings → Vibration → Try it** fires a test buzz. iPhones don't allow web pages to vibrate.
- `src/kinetics/`: components adapted from [Kinetics](https://kinetics.colorion.co/), namely Magnetic and Squish buttons, Tab Pill Glide, Number Counter, Toast Overshoot and Undo Snackbar.
- `src/text-effects/`: effects adapted from [CSS Text Effects](https://text-effects.colorion.co/) (MIT), namely the Gold-Foil title, Pop-Riot win headline, Ghostwrite shimmer and Wax-Seal badge.
- Fonts: Fraunces (ranks, headlines) and Plus Jakarta Sans (interface), self-hosted via Fontsource.

Keyboard: `Ctrl+Z`/`U` undo · `H` hint · `N` new game · `Space`/`D` draw · `S` stats · `M` mute.
