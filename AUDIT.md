# Audit status

Audit of the LibriVox Audiobooks app (backend logic in the JS modules that talk to Archive.org, plus the two HTML pages and stylesheet).
This file is updated with every commit on the audit branch so it always shows what was found, what is fixed, and what is still open.

Evidence tags: **[repro]** reproduced in a headless Chromium run against the real pages with Archive.org responses mocked; **[read]** confirmed by reading the code; **[test]** covered by `npm test`.

## Findings

| # | Sev. | Area | Finding | Status |
|---|------|------|---------|--------|
| 1 | High | player.js | Every derivative of each chapter is added to the playlist (5-chapter test item renders 12 rows), rows are not sorted by track, derivative rows are titled by file name. [repro] | Helper done (`selectAudioFiles`, [test]); player wiring pending |
| 2 | High | search.js | Infinite scroll re-appends the whole accumulated result set on every page: 60 results render 132 cards. [repro] | Open |
| 3 | High | player.js | Next at the last chapter / Previous at the first chapter clear the audio source before deciding not to move: playback dies, a spurious "Audio format not supported" toast appears (empty-src error, code 4) and "Previous restarts the chapter after 3s" never works. [repro] | Open |
| 4 | High | player.js | Playback speed resets to 1x on every chapter change because `load()` resets `playbackRate`. [repro] | Open |
| 5 | High | storage.js | localStorage is touched while the module is evaluated with no guard; when storage is blocked (Safari private mode, disabled storage) both pages die with SecurityError and never render. [repro] | Fixed (memory fallback, [test]) |
| 6 | High | search.js, player.js | Stored XSS: titles, creators, subjects, chapter titles, descriptions and notes from Archive.org are interpolated into innerHTML/attributes unescaped; the probe payload executed on both pages. [repro] | Helpers done (`escapeHTML`, `sanitizeRichText`, [test]); rendering wiring pending |
| 7 | Med | search.js, player.js | Multi-valued fields render as "Jane Austen,Karen Savage" / "English,French"; the page title shows "Unknown Author" whenever `creator` is an array. [repro] | Helpers done (`joinValues`, [test]); wiring pending |
| 8 | Med | search.js, index.html | A default `year:[1700 TO 2024]` clause is added to every search, dropping items without a year and anything after 2024; year inputs cap at 2024. [repro] | Helper done (`buildSearchQuery`, [test]); wiring pending |
| 9 | Med | index.html, search.js | Keyboard shortcuts are registered twice (R fires two random-book fetches), Ctrl+R / Cmd+R is hijacked, and the random-book picker ignores the selected category because `window.getCategoryConfig` never exists. [repro] | Open |
| 10 | Med | search.js | A failed infinite-scroll page replaces the entire grid with an error panel (0 cards left). [repro] | Open |
| 11 | Med | search.js | Overlapping searches race: no abort or sequence check, so a slow earlier response can overwrite newer results (13 requests observed in one scroll session). [repro] | Open |
| 12 | Med | search.js | Malformed queries (unbalanced quotes/parentheses) reach Archive.org and the error payload is shown as "No audiobooks found". [repro] | Helpers done (`sanitizeUserQuery`, `parseSearchResponse`, [test]); wiring pending |
| 13 | Med | search.js, player.js | Retries repeat on 4xx responses that cannot succeed; the metadata fetch has no timeout. [read] | Open |
| 14 | Med | player.js | No listening position memory, no speed/volume persistence; `recentlyViewed` is saved but never shown. [repro] | Storage API done ([test]); wiring pending |
| 15 | Low | player.js | No Media Session metadata or handlers (lock screen / hardware keys). [read] | Open |
| 16 | High | index.html, player.js | Accessibility: book cards and chapter rows are click-only `div`s (not keyboard reachable), `role="list"` without list items, toggle buttons (filters, shuffle, loop, speed) lack `aria-pressed`. [repro] | Open |
| 17 | Med | index.html, player.html | Tailwind Play CDN used in production (runtime JIT on every visit, console warning, no SRI). [read] | Open (plan: committed static build) |
| 18 | Low | index.html, player.html | `/favicon.ico` does not exist: 404 on every page load. [repro] | Open |
| 19 | Low | search.js | Search requests fetch the `description` field that is never rendered. [read] | Helper done (`SEARCH_FIELDS`); wiring pending |
| 20 | Low | socialMeta.js | Unused module left over from a live-music app (venues, "concert recording", MusicRecording schema). [read] | Open |
| 21 | Low | styles.css, index.html, player.html | Dead/duplicate CSS (`#waveform`, `.view-btn`, `.chapter-item`, `.skeleton`, `.loading-spinner`, `.search-glow`, duplicated `.filter-chip`), Playfair Display loaded but unused, per-card stagger rules that cannot stagger, progress knob drawn on the buffer bar, focus rule that changes the border radius of focused controls. [read] | Open |
| 22 | Low | utils.js, main.js, search.js | Unused exports and globals (`throttle`, `debounce`, `getUrlParams`, `formatNumber`, `getRelativeTime`, `isInViewport`, `scrollToElement`, `window.retryCurrentTrack`, `window.changePage`, `prevPage`/`nextPage` ids). [read] | utils.js cleaned; rest pending |
| 23 | Low | index.html | Category `<select>` is hand-copied and drifts from `categoryConfig.js` (Louisa May Alcott, L. Frank Baum, Custom missing). [read] | Open |
| 24 | Low | visualizer.js | Animation loop runs while paused and while the tab is hidden, canvas ignores devicePixelRatio, resize listener is never removed, a gradient is allocated per bar per frame. [read] | Open |
| 25 | Low | repo | No README, tests or lint. [read] | Tests added (`npm test`); README pending |

## Suspicions checked and dropped

- Pressing Enter inside the year inputs does **not** reload the page: implicit form submission clicks the submit button, whose handler prevents the default. A real submit handler is still added for robustness.
- Space with a focused control button toggles playback exactly once in Chromium (the keydown handler's `preventDefault` suppresses the synthetic click).

## Verification

- `npm test` runs the Node unit tests for the pure modules (`archive.js`, `utils.js`, `storage.js`).
- A headless Chromium harness (kept outside the repo) drives both pages with Archive.org mocked, including an XSS probe, a 5-chapter item with derivatives, a failing page load, blocked storage and a 390px viewport. Its before/after results back the [repro] tags above.

## Still to do

1. Wire the new helpers into `search.js` and `player.js` (findings 1, 6, 7, 8, 12, 14, 19).
2. Fix the player state machine (3, 4), add position/speed/volume persistence and Media Session (14, 15).
3. Fix infinite scroll, append errors, request racing and retry policy (2, 10, 11, 13).
4. Consolidate keyboard shortcuts and the random-book picker into the module (9).
5. Accessibility pass on cards, chapter list and toggle buttons (16).
6. Replace the Tailwind CDN with a committed static build, add favicon, clean CSS, remove dead code, regenerate the category select from config (17, 18, 20, 21, 22, 23).
7. Visualizer efficiency (24), README (25).
8. Re-run the headless harness and unit tests, then an independent review of the diff.
