# LibriVox Audiobooks

A static web app for finding and streaming free public-domain audiobooks
recorded by [LibriVox](https://librivox.org) volunteers and hosted on
[Archive.org](https://archive.org/details/librivoxaudio).

There is no server component: the browser talks directly to the public
Archive.org APIs. Your listening position, playback speed and volume are
kept in the browser's local storage.

## Running locally

The app uses ES modules, so it must be served over HTTP rather than opened
from the file system:

```bash
npm run serve        # python3 -m http.server 8080
# then open http://localhost:8080/
```

Any static file server works. Deploying is a matter of copying the files to
a static host (GitHub Pages, Netlify, an S3 bucket, ...).

## Development

```bash
npm install          # only needed to rebuild Tailwind CSS
npm run build:css    # regenerates tailwind.css from the classes used in *.html and *.js
npm run watch:css    # same, but rebuilds on every change
npm test             # unit tests for the pure modules (node --test)
```

`tailwind.css` is committed so the site can be deployed without a build
step. Run `npm run build:css` after adding new Tailwind utility classes to
the HTML or JS and commit the result.

## Layout

| File | Purpose |
|------|---------|
| `index.html` / `search.js` | Library page: search, category browsing, quick filters, infinite scroll, "continue listening", random pick |
| `player.html` / `player.js` | Player page: chapter list, transport controls, speed, volume, progress memory, Media Session integration |
| `archive.js` | Pure helpers for the Archive.org search and metadata APIs (query building, response validation, audio-file selection). Unit-tested. |
| `categoryConfig.js` | Category definitions; the category dropdown is rendered from this file |
| `storage.js` | Guarded `localStorage` access with an in-memory fallback; progress and preferences |
| `utils.js` | Formatting, HTML escaping, rich-text sanitising, toasts |
| `visualizer.js` | Web Audio frequency visualiser (runs only while playing) |
| `socialMeta.js` | Open Graph / JSON-LD metadata for the player page |
| `styles.css` | Hand-written styles on top of the compiled Tailwind utilities |
| `test/` | `node --test` suites |

## Archive.org notes

- Multi-valued metadata fields (`creator`, `subject`, `language`, ...) come back as arrays when an item has more than one value; `archive.js` normalises both shapes.
- The metadata API lists every derivative of every audio file. `selectAudioFiles` keeps one playable file per chapter (MP3 preferred, since Safari cannot play Ogg Vorbis) and sorts by track number.
- The `year` field of a LibriVox item is the year the recording was published on Archive.org, not the original publication year of the text. The year filter is labelled accordingly.
- Descriptions contain community-submitted HTML; they are rendered through an allowlist sanitiser.

## Keyboard shortcuts

Library: `/` focus search, `R` random book.

Player: `Space`/`K` play-pause, `←`/`→` skip 5s, `J`/`L` back 15s / forward 30s,
`N`/`P` next / previous chapter, `M` mute, `,`/`.` slower / faster.
