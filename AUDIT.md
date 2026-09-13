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
| 22 | Low | utils.js, main.js, search.js | Unused exports and globals (`throttle`, `debounce`, `getUrlParams`, `formatNumber`, `getRelativeTime`, `isInViewport`, `scrollToElement`, `window.retryCurrentTrack`, `window.changePage`, `prevPage`/`nextPage` ids). [read] | Fixed: unused helpers and globals removed; the only remaining global is `window.player` for debugging |
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
| 31 | High | search.js | The request timeout aborted the fetch with the same AbortError used for caller cancellation, so a slow Archive.org left the spinner up forever with no error or retry. [read] | Fixed: typed TimeoutError/NetworkError/HttpError/ParseError in `fetchJSON`, retried when transient, surfaced with a plain message [test] |
| 32 | Med | player.js, visualizer.js | Routing the audio element through an AudioContext created without a user gesture can leave playback silent, and awaiting `resume()` could stall autoplay until an unrelated click. [read] | Fixed: the visualizer only attaches when its context is actually running (checked with a 300ms race), is retried on each play, and never blocks playback |
| 33 | Med | search.js | A failed fresh search kept the previous result set in memory, so infinite scroll could append pages of the old query under the error panel. [read] | Fixed: paging state is reset when a fresh search starts and loading is blocked while it is in flight |
| 34 | Med | player.js | Finishing a book cleared the saved position, but the unload save wrote it back, resurrecting the book in Continue Listening. [read] | Fixed: a `finished` flag suppresses saves until playback resumes |
| 35 | Med | player.js | Leaving the page before the resumed chapter's metadata arrived overwrote the saved position with 0. [read] | Fixed: the pending resume position is saved instead |
| 36 | Med | player.js | A book was added to Recently Viewed before the playable-file check, leaving a permanently broken Continue Listening chip for items without audio. [read] | Fixed: recorded only after a playlist exists |
| 37 | Low | player.js | An unplayable chapter produced both a toast and an inline error panel; the "several chapters failed" message also appeared after retrying one chapter three times. [read] | Fixed: media errors are reported once, the counter only increments across different chapters |
| 38 | Low | player.js | Non-JSON metadata responses showed a raw JSON parse error to the user. [read] | Fixed: shared `fetchJSON` with a plain-language message |
| 39 | Low | storage.js | After a failed persistent write, reads returned the stale stored value instead of the newer in-memory one. [read] | Fixed: memory-first reads [test] |
| 40 | Med | index.html, player.html | No Content-Security-Policy; inline scripts and handlers previously prevented adopting one. [read] | Fixed: CSP meta on both pages (`script-src 'self'`, Archive.org allow-listed for images, media and fetch); harness confirms no violations |
| 41 | Med | search.js | Search text such as "Dracula: Chapter 1" was sent as a field query on a field named Dracula. [read] | Fixed: colons are dropped outside Advanced Search [test] |
| 42 | Med | player.html, index.html | Every `<summary>` used `display:flex`, which removes the disclosure marker, so collapsible sections had no expand/collapse affordance. [read] | Fixed: CSS chevron that rotates when open |
| 43 | Med | index.html, player.html | Informative small text used gray-500/600 on the dark background (about 3.9:1 and 2.5:1 contrast). [read] | Fixed: gray-400 or lighter for meaningful text |
| 44 | Med | styles.css | Always-on animations: header gradient repainting every frame, blurred pulsing ring on the play button, waveform pulse, drop-shadow filter on the 60fps canvas, backdrop filters on every card overlay and badge. [read] | Fixed: static header, pulse only while playing, filters removed |
| 45 | Low | styles.css | Active chapter and hover rows were translated 4px inside an overflow container (permanent horizontal scrollbar); active filter chips sat 3px higher than their neighbours; delayed card fade-ins blinked because the animation had no backwards fill; the hover glow pseudo-element was clipped and never rendered. [read] | Fixed |
| 46 | Low | player.js | Subject tags took the first two subjects before filtering, so long or boilerplate subjects ("librivox", "audiobooks") hid useful ones. [read] | Fixed: `subjectTags` splits, filters and de-duplicates [test] |
| 47 | Low | player.js | "Published" showed the Archive.org recording year; "Narrator: Unknown" appeared for most books. [read] | Fixed: labelled "Recorded", narrator row only when present, chapter count added |
| 48 | Low | player.js | Keyboard focus was dropped to the page when the Next button became disabled while focused; the chapter list scrolled the whole page into view on state changes. [read] | Fixed: focus moves to Play, only the list scrolls |
| 49 | Low | index.html, styles.css | The loading spinner was inserted above the grid on every search (200px layout shift); fonts were loaded through a render-blocking `@import` chain; no preconnect to Archive.org; first-row covers were lazy-loaded. [read] | Fixed: overlay spinner with dimmed grid, font link and preconnects in the head, first six covers eager |

## Suspicions checked and dropped

- Pressing Enter inside the year inputs does **not** reload the page: implicit form submission clicks the submit button, whose handler prevents the default. A real submit handler is still added for robustness.
- Space with a focused control button toggles playback exactly once in Chromium (the keydown handler's `preventDefault` suppresses the synthetic click).

## Verification

- `npm test` syntax-checks every module and runs the Node unit tests for the pure modules (`archive.js`, `utils.js`, `storage.js`, `categoryConfig.js`): 38 tests.
- `npm run e2e` (`test/e2e/journeys.mjs`, Playwright) drives both pages in headless Chromium with Archive.org mocked, including an XSS probe, a 5-chapter item with derivatives, a failing page load, blocked storage and a 390px viewport, and asserts the fixed behaviour. Its before/after results back the [repro] tags above.

## Independent review of the fixes

A second multi-agent pass reviewed the complete diff against the original code from six angles (player runtime, search flow and helpers, security, accessibility/HTML/CSS, cross-browser robustness, feature parity) and produced 34 merged findings; a skeptical verifier then re-read the code for each one. Every finding is resolved:

| # | Sev. | Area | Finding | Status |
|---|------|------|---------|--------|
| 50 | High | search.js | Infinite-scroll pages were built from the live form, so typing (without submitting) or switching category before scrolling mixed two queries in one grid. [repro] | Fixed: appended pages reuse the submitted query; harness checks it |
| 51 | High | search.js | An appended page with zero results while `numFound` was still larger re-armed the sentinel immediately: an unbounded request loop. [read] | Fixed: a short or empty page ends the list |
| 52 | High | player.js | Any key or tap on the seek slider that did not change its value left the "seeking" flag set, freezing the progress bar for the rest of the chapter. [repro] | Fixed: only seek keys arm it; pointer release, blur, keyup and chapter changes clear it |
| 53 | Med | player.js | `<button role="listitem">` replaced the button role for assistive technology. [repro] | Fixed: `<ol>` of `<li><button>` |
| 54 | Med | player.js | After a chapter failed to load, Play, Space and the chapter row did nothing. [read] | Fixed: Play reloads the failed source |
| 55 | Med | main.js | `pagehide` tore the player down, so a back/forward-cache restore returned a dead page. [read] | Fixed: unload only saves progress |
| 56 | Med | storage.js | Memory-first reads let two open tabs overwrite each other's positions. [test] | Fixed: memory only backs failed writes; two-tab test added |
| 57 | Med | player.js | Volume slider snapped back to 100% on iOS, where media volume is not settable. [read] | Fixed: UI follows the chosen value; slider hidden where volume cannot be set |
| 58 | Med | visualizer.js | WebKit's `interrupted` AudioContext state was never resumed, leaving playback silent after a call or screen lock. [read] | Fixed: resume on any non-running state and on state changes while playing |
| 59 | Med | player.html | Seek and volume sliders had an 8px hit target and no visible focus ring (they are transparent overlays). [repro] | Fixed: padded wrappers, ring drawn on the visible track |
| 60 | Med | index.html | `focus:outline-none` on the select and year inputs hid the keyboard focus ring. [repro] | Fixed |
| 61 | Med | search.js | "Continue Listening" listed books with no saved position, including finished ones. [read] | Fixed: only books with a position, newest first |
| 62 | Med | archive.js | Dangling operators (`Title - Subtitle`, `austen -`, `a &&`, `AND AND`, `()`) still reached Archive.org; a leading NOT was stripped (inverting the query); Advanced Search lost range/fuzzy/boost syntax. [test] | Fixed with tests |
| 63 | Low | archive.js | Timeouts were retried with backoff (48s of spinner); retry delays ignored cancellation. [test] | Fixed |
| 64 | Low | main.js | Referrer check was a string prefix match; autoplay depended on a referrer being sent at all. [read] | Fixed: origin comparison, and library links carry `autoplay=1` |
| 65 | Low | player.js | Previous while paused stayed paused but Next started playing; mute at volume 0 needed two clicks; elapsed label flickered while scrubbing; Repeat's accessible name did not say which mode; share fallback never showed the link; multi-valued descriptions were truncated to the first entry; random-book guard released before navigation. [read] | Fixed |
| 66 | Low | index.html, player.html, styles.css | Remaining low-contrast gray-500 text; the chevron's auto margin broke `justify-between` summaries; reduced-motion kept animation delays (cards invisible until the delay); print styles were overridden by utility classes; 2x speed wrapped alone on phones; K missing from the shortcut panel; no way to load more without IntersectionObserver; CSP could restrict inline styles to attributes. [read] | Fixed |

## Independent audit workflow

A nine-dimension multi-agent audit (player state, search flow, security, accessibility, UI/CSS, Archive.org contract, dead code, performance, robustness) plus a two-agent gap round produced 140 raw findings. All of them were triaged against this list: every distinct defect is either fixed above or recorded under "Open" below. The workflow's own deduplication and voting phases were stopped as redundant once the triage was complete; a separate adversarial review of the final diff follows.

## Open

| # | Sev. | Area | Item | Why it is open |
|---|------|------|------|----------------|
| O1 | Med | search.js, index.html | The "Solo Reader" and "Complete Works" chips query `subject:(solo)` / `subject:(complete)`; the auditors believe LibriVox items rarely carry those subject terms, so the chips may return very few results. | Cannot be verified from this sandbox (archive.org is blocked). Check the live API; if confirmed, replace with a description-based heuristic or remove the chips. |
| O2 | Low | categoryConfig.js | Language categories use `language:(French)` etc.; Archive.org items sometimes use ISO codes instead of names. | Needs a live check; extend to `(French OR fre OR fra)` if results are missing. |
| O3 | Low | repo | `package.json` carried an MIT license field but the repository has no LICENSE file. | The field was removed; adding a license is the owner's decision. |
| O4 | Low | repo | No ESLint/CI; `npm test` runs a syntax check plus the unit tests. | Optional: add eslint and a GitHub Actions workflow that runs `npm test` and `npm run build:css --check`. |

## Still to do

1. Verify O1 and O2 against the live Archive.org API from a machine with network access, and spot-check a few real items' file lists against `selectAudioFiles` (this sandbox cannot reach archive.org).
2. Optional follow-ups not started: sleep timer, chapter bookmarks, offline caching of chapters, ESLint + CI (O4).
