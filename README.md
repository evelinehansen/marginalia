# Marginalia

Keep the passages, quotes, and ideas that struck you while reading, and meet them again. Marginalia deals you one saved entry per day, chosen from the ones you have seen least and longest ago. You read it and choose: **still hits** (it stays in circulation) or **retire** (it moves to the archive with thanks).

Part of a family of static, local-first tools (sibling to DecisionBuilder). No backend, no accounts, no cookies, no analytics, and no external network requests of any kind at runtime. Everything lives in your browser's localStorage; the export file is the real home of your data.

## Files

Vanilla HTML, CSS, and JavaScript as ES modules. No frameworks, no build step, no npm.

- `index.html` — the page: today view, library, capture panel, modals
- `styles.css` — design tokens and all styling
- `app.js` — rendering and event wiring
- `engine.js` — pure functions: the deal ordering, search, filters, stats (no DOM, no storage)
- `storage.js` — localStorage load/save, export/import, backup age

## Running locally

ES modules need to be served over HTTP, so opening `index.html` directly from the file system will not work. From this folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000 in a browser.

## Deploying

Push to GitHub, then in the repo settings enable GitHub Pages from the main branch root. That is the whole deployment.

## How the daily deal works

The deal is derived, never stored: circulating entries are ordered never-shown first, then least recently shown, with ties broken by a random pick seeded from the date. Revisiting on the same day always shows the same card. Dealing a card records `lastShown` and `timesShown` on the entry; there is no schedule anywhere that could be corrupted.

(One small piece of view state, `marginalia.today` in localStorage, remembers which cards were dealt today so a reload shows the same stack. If it is lost, nothing breaks; it is not part of the export.)

## Backups

localStorage can be evicted by the browser (Safari does this after about 7 days of disuse). Export regularly; the footer shows how long it has been. Import checks the file's `schemaVersion` and offers merge or replace.
