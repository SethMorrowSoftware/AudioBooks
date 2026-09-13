# Audit status

Audit of the LibriVox Audiobooks app (backend logic in the JS modules that talk to Archive.org, plus the two HTML pages and stylesheet).
This file is updated with every commit on the audit branch so it always shows what was found, what is fixed, and what is still open.

Evidence tags: **[repro]** reproduced in a headless Chromium run against the real pages with Archive.org responses mocked; **[read]** confirmed by reading the code; **[test]** covered by `npm test`.

## Findings

| # | Sev. | Area | Finding | Status |
|---|------|------|---------|--------|
| 1 | High | player.js | Every derivative of each chapter is added to the playlist (5-chapter test item renders 12 rows), rows are not sorted by track, derivative rows are titled by file name. [repro] | Fixed: `selectAudioFiles` keeps one MP3 (or Ogg fallback) per chapter, sorted by track; 5 rows for the test item [repro] [test] |
| 2 | High | search.js | Infinite scroll re-appends the whole accumulated result set on every page: 60 results render 132 cards. [repro] | Fixed: only the new page is appended; 60 results render 60 cards [repro] |
| 3 | High | player.js | Next at the last chapter / Previous at the first chapter clear the audio source before deciding not to move: playback dies, a spurious "Audio format not supported" toast appears (empty-src error, code 4) and "Previous restarts the chapter after 3s" never works. [repro] | Fixed: target index is decided first, the source is only replaced when switching; Next at the end shows "This is the last chapter", Previous after 3s restarts the chapter [repro] |
| 4 | High | player.js | Playback speed resets to 1x on every chapter change because `load()` resets `playbackRate`. [repro] | Fixed: `defaultPlaybackRate`/`playbackRate` re-applied after every load; speed survives chapter changes and reloads [repro] |
| 5 | High | storage.js | localStorage is touched while the module is evaluated with no guard; when storage is blocked (Safari private mode, disabled storage) both pages die with SecurityError and never render. [repro] | Fixed (memory fallback); page renders with storage blocked [repro] [test] |
| 6 | High | search.js, player.js | Stored XSS: titles, creators, subjects, chapter titles, descriptions and notes from Archive.org are interpolated into innerHTML/attributes unescaped; the probe payload executed on both pages. [repro] | Fixed: every interpolation escaped, cards are real links, descriptions go through the allowlist sanitiser; probes no longer fire [repro] [test] |
| 7 | Med | search.js, player.js | Multi-valued fields render as "Jane Austen,Karen Savage" / "English,French"; the page title shows "Unknown Author" whenever `creator` is an array. [repro] | Fixed: arrays joined with ", " everywhere, page title uses the joined author list [repro] [test] |
| 8 | Med | search.js, index.html | A default `year:[1700 TO 2024]` clause is added to every search, dropping items without a year and anything after 2024; year inputs cap at 2024. [repro] | Fixed: year inputs start empty, clause added only when typed, upper bound is the current year [repro] [test] |
| 9 | Med | index.html, search.js | Keyboard shortcuts are registered twice (R fires two random-book fetches), Ctrl+R / Cmd+R is hijacked, and the random-book picker ignores the selected category because `window.getCategoryConfig` never exists. [repro] | Fixed: one keyboard handler, modifier keys ignored (Ctrl+R now reloads), random pick lives in `search.js` and honours the category [repro] |
| 10 | Med | search.js | A failed infinite-scroll page replaces the entire grid with an error panel (0 cards left). [repro] | Fixed: append failures keep the grid and show a toast plus a Retry control in the sentinel [repro] |
| 11 | Med | search.js | Overlapping searches race: no abort or sequence check, so a slow earlier response can overwrite newer results (13 requests observed in one scroll session). [repro] | Fixed: stale responses are ignored via a request sequence and aborted with AbortController [read] |
| 12 | Med | search.js | Malformed queries (unbalanced quotes/parentheses) reach Archive.org and the error payload is shown as "No audiobooks found". [repro] | Fixed: quotes/parentheses balanced before sending; Archive.org error payloads surface as "Search Not Understood" [repro] [test] |
| 13 | Med | search.js, player.js | Retries repeat on 4xx responses that cannot succeed; the metadata fetch has no timeout. [read] | Fixed: retries only on network errors, 429 and 5xx; 15s search timeout, 20s metadata timeout [read] |
| 14 | Med | player.js | No listening position memory, no speed/volume persistence; `recentlyViewed` is saved but never shown. [repro] | Fixed: position saved every 5s and on pause/unload, restored on return (URL track wins); speed and volume persisted; "Continue Listening" strip on the library page [repro] [test] |
| 15 | Low | player.js | No Media Session metadata or handlers (lock screen / hardware keys). [read] | Fixed: Media Session metadata (chapter, author, cover) plus play/pause/next/previous/seek handlers [repro] |
| 16 | High | index.html, player.js | Accessibility: book cards and chapter rows are click-only `div`s (not keyboard reachable), `role="list"` without list items, toggle buttons (filters, shuffle, loop, speed) lack `aria-pressed`. [repro] | Fixed: cards are `<a>` links with labels, chapters are `<button role="listitem">`, `aria-pressed` on filters/shuffle/loop/mute/speed, `aria-current` on the playing chapter, skip link, labelled inputs [repro] |
| 17 | Med | index.html, player.html | Tailwind Play CDN used in production (runtime JIT on every visit, console warning, no SRI). [read] | Fixed: `tailwind.css` is compiled from the HTML/JS and committed (`npm run build:css`); no runtime CDN [read] |
| 18 | Low | index.html, player.html | `/favicon.ico` does not exist: 404 on every page load. [repro] | Fixed: inline SVG favicon on both pages [repro] |
| 19 | Low | search.js | Search requests fetch the `description` field that is never rendered. [read] | Fixed: `description` no longer requested [test] |
| 20 | Low | socialMeta.js | Unused module left over from a live-music app (venues, "concert recording", MusicRecording schema). [read] | Fixed: rewritten for audiobooks (Open Graph, schema.org Audiobook) and wired into the player with a Share button [read] |
| 21 | Low | styles.css, index.html, player.html | Dead/duplicate CSS (`#waveform`, `.view-btn`, `.chapter-item`, `.skeleton`, `.loading-spinner`, `.search-glow`, duplicated `.filter-chip`), Playfair Display loaded but unused, per-card stagger rules that cannot stagger, progress knob drawn on the buffer bar, focus rule that changes the border radius of focused controls. [read] | Fixed: dead selectors removed, inline styles moved into `styles.css`, knob only on the progress bar, focus rule no longer changes shape, Playfair dropped, hover transforms limited to hover-capable devices [read] |
| 22 | Low | utils.js, main.js, search.js | Unused exports and globals (`throttle`, `debounce`, `getUrlParams`, `formatNumber`, `getRelativeTime`, `isInViewport`, `scrollToElement`, `window.retryCurrentTrack`, `window.changePage`, `prevPage`/`nextPage` ids). [read] | Fixed: unused helpers and globals removed; the only remaining global is `window.player` for debugging [read] |
| 23 | Low | index.html | Category `<select>` is hand-copied and drifts from `categoryConfig.js` (Louisa May Alcott, L. Frank Baum, Custom missing). [read] | Fixed: the select is rendered from `getAllCategories()` [repro] |
| 24 | Low | visualizer.js | Animation loop runs while paused and while the tab is hidden, canvas ignores devicePixelRatio, resize listener is never removed, a gradient is allocated per bar per frame. [read] | Fixed: loop runs only while playing and while the tab is visible, DPR-aware canvas, cached gradient, listeners removed on destroy [repro] |
| 25 | Low | repo | No README, tests or lint. [read] | Fixed: README, `npm test`, Tailwind build scripts [read] |

## Additional findings from the verification runs

| # | Sev. | Area | Finding | Status |
|---|------|------|---------|--------|
| 26 | Med | player.js | Player state stayed "loading" forever on a direct page load (no autoplay), so the chapter row showed the loading animation indefinitely. [repro] | Fixed: state follows `canplay`/`pause` |
| 27 | Med | socialMeta.js | Building the plain-text description via `innerHTML` on a live element still loaded `<img onerror>` payloads. [repro] | Fixed: parsed with an inert `DOMParser` document |
| 28 | Med | styles.css, player.html | Library grid overflowed the viewport on phones (`1fr` columns take the card's min-content width); the chapter summary chip overflowed at 320px. [repro] | Fixed: `minmax(0, 1fr)` columns, `min-width: 0`, wrapping summary |
| 29 | Low | utils.js | `animate-fade-out` used by toasts was never defined. [read] | Fixed |
| 30 | Low | main.js | Autoplay was attempted on every load, producing a "click play" toast on direct links. [read] | Fixed: autoplay only when arriving from the library |

## Suspicions checked and dropped

- Pressing Enter inside the year inputs does **not** reload the page: implicit form submission clicks the submit button, whose handler prevents the default. A real submit handler is still added for robustness.
- Space with a focused control button toggles playback exactly once in Chromium (the keydown handler's `preventDefault` suppresses the synthetic click).

## Verification

- `npm test` runs the Node unit tests for the pure modules (`archive.js`, `utils.js`, `storage.js`).
- A headless Chromium harness (kept outside the repo) drives both pages with Archive.org mocked, including an XSS probe, a 5-chapter item with derivatives, a failing page load, blocked storage and a 390px viewport. Its before/after results back the [repro] tags above.

## Still to do

1. Fold in the results of the independent multi-agent audit that is still running (its finder phase reported 130 raw findings before deduplication; anything not already covered above will be triaged here).
2. Independent adversarial review of the full diff, then fix whatever it finds.
3. Verify against the live Archive.org API from a machine with network access (this sandbox cannot reach archive.org): confirm the `language` values used by the "English Only" filter and the language categories, and spot-check a few real items' file lists against `selectAudioFiles`.
4. Optional follow-ups not started: sleep timer, chapter bookmarks, offline caching of chapters, a Content-Security-Policy header once the host supports it.
