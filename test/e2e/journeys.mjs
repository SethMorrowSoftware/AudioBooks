/**
 * End-to-end journeys for index.html and player.html in headless Chromium
 * with every Archive.org endpoint mocked (see fixtures.mjs).
 *
 *   npm install && npx playwright install chromium
 *   npm run e2e            # starts a static server on a free port itself
 *
 * Environment: E2E_BASE_URL to reuse a running server, CHROME_EXE to point at
 * a specific Chromium binary, E2E_OUT to also write the raw results as JSON.
 * Exits non-zero when a journey throws, a page error or unexpected console
 * error is logged, or one of the assertions at the bottom fails.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { searchResponse, searchErrorResponse, metadataResponse, BOOK_ID, ROWS } from './fixtures.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.env.E2E_OUT;

// A ten-second 440 Hz tone as a WAV file, generated in memory so no binary
// fixture needs to live in the repository. It is served for every
// /download/ URL regardless of the requested extension.
function makeToneWav(seconds = 10, rate = 22050, frequency = 440) {
  const samples = seconds * rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * frequency * i / rate)), 44 + i * 2);
  return buffer;
}
const audioBytes = makeToneWav();
const audioType = 'audio/wav';
const coverBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function startServer() {
  if (process.env.E2E_BASE_URL) return { base: process.env.E2E_BASE_URL.replace(/\/$/, ''), stop() {} };
  const port = 8700 + Math.floor(Math.random() * 200);
  const child = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', REPO_ROOT], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { const res = await fetch(`${base}/index.html`); if (res.ok) break; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return { base, stop() { child.kill(); } };
}
const server = await startServer();
const base = server.base;

const results = { baseUrl: base, scenarios: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch { /* navigation in progress */ }
    await sleep(100);
  }
  return false;
}

async function newPage(browser, log) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) log.console.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => log.pageErrors.push(String(e && e.message || e)));
  page.on('request', r => { const u = r.url(); if (u.includes('advancedsearch.php')) log.searchRequests.push({ t: Date.now(), url: u }); if (u.includes('/metadata/')) log.metadataRequests.push(u); if (u.includes('/download/')) log.downloadRequests.push(u); });
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(base)) return route.continue();
    if (u.includes('archive.org/advancedsearch.php')) {
      const url = new URL(u);
      const q = url.searchParams.get('q') || '';
      const page_ = parseInt(url.searchParams.get('page') || '1', 10);
      const rows = parseInt(url.searchParams.get('rows') || String(ROWS), 10);
      log.queries.push(q);
      if (process.env.SLOW_FIRST && log.queries.length === 1) await sleep(1500);
      if (q.includes('FAILPAGE') || (process.env.FAIL_PAGE && String(page_) === process.env.FAIL_PAGE)) {
        return route.fulfill({ status: 503, contentType: 'text/html', body: '<html>503</html>' });
      }
      const open = (q.match(/\(/g) || []).length, close = (q.match(/\)/g) || []).length;
      const quotes = (q.match(/"/g) || []).length;
      if (open !== close || quotes % 2 === 1) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(searchErrorResponse()) });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(searchResponse(page_, rows)) });
    }
    if (u.includes('archive.org/metadata/')) {
      const id = u.split('/metadata/')[1].split(/[?#]/)[0];
      if (id === 'missing_item') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(metadataResponse(id)) });
    }
    if (u.includes('archive.org/download/')) {
      return route.fulfill({ status: 200, contentType: audioType, headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes' }, body: audioBytes });
    }
    if (u.includes('archive.org/services/img/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: coverBytes });
    }
    if (u.includes('cdn.tailwindcss.com')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* tailwind stub */' });
    if (u.includes('fonts.googleapis.com')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  return { ctx, page };
}

function freshLog() { return { console: [], pageErrors: [], searchRequests: [], metadataRequests: [], downloadRequests: [], queries: [] }; }

async function scenarioIndex(browser) {
  const log = freshLog();
  const r = { log };
  const { ctx, page } = await newPage(browser, log);
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForSelector('.book-card', { timeout: 10000 });
    await sleep(400);
    r.initialCards = await page.locator('.book-card').count();
    r.initialQuery = log.queries[0];
    r.xssTitle = await page.evaluate(() => window.__xssTitle === 1);
    r.xssSubject = await page.evaluate(() => window.__xssSubject === 1);
    r.firstCardTitleText = await page.locator('.book-card').first().locator('.book-title, h3').first().textContent();
    r.firstCardAuthorText = (await page.locator('.book-card').first().locator('.book-author').first().textContent() || '').trim();
    r.firstCardImgAlt = await page.locator('.book-card img').first().getAttribute('alt');
    r.cardIsLink = await page.evaluate(() => { const c = document.querySelector('.book-card'); return { tag: c.tagName, href: c.getAttribute('href'), tabindex: c.getAttribute('tabindex'), role: c.getAttribute('role') }; });
    r.langBadgesFirstCard = await page.locator('.book-card').first().locator('.lang-badge').allTextContents();
    r.pageInfo = (await page.locator('#pageInfo').textContent() || '').trim();
    r.yearInputs = await page.evaluate(() => ({ from: document.getElementById('yearFrom').value, to: document.getElementById('yearTo').value, max: document.getElementById('yearTo').max }));
    r.favicon = await page.evaluate(() => { const l = document.querySelector('link[rel~="icon"]'); return l ? l.getAttribute('href').slice(0, 40) : null; });

    // Keyboard 'r' on body: how many random-book searches fire?
    const before = log.searchRequests.length;
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('r');
    await sleep(1300);
    r.randomRequestsAfterR = log.searchRequests.length - before;
    r.urlAfterR = page.url();
    await page.goto(`${base}/index.html`); await page.waitForSelector('.book-card'); await sleep(300);

    // Ctrl+R must not be hijacked.
    const before2 = log.searchRequests.length;
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+r');
    await sleep(1300);
    r.randomRequestsAfterCtrlR = log.searchRequests.length - before2;
    await page.goto(`${base}/index.html`); await page.waitForSelector('.book-card'); await sleep(300);

    // Enter inside year input: does the form natively submit (page reload with query string)?
    await page.fill('#yearFrom', '1900');
    await page.locator('#yearFrom').press('Enter');
    await sleep(900);
    r.urlAfterEnterInYear = page.url();
    r.nativeSubmitHappened = page.url().includes('searchQuery=');
    if (r.nativeSubmitHappened) { await page.goto(`${base}/index.html`); await page.waitForSelector('.book-card'); await sleep(300); }

    // Query with unbalanced parenthesis -> API error payload. What does the UI show?
    await page.fill('#searchQuery', 'austen ((');
    await page.locator('#searchQuery').press('Enter');
    await sleep(800);
    r.unbalancedQuerySent = log.queries[log.queries.length - 1];
    r.unbalancedResultText = (await page.locator('#results').textContent() || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    await page.fill('#searchQuery', '');
    await page.locator('#searchQuery').press('Enter');
    await page.waitForSelector('.book-card'); await sleep(300);

    // Infinite scroll: reach page 2 and 3. Type (but do not submit) a new query first: appended pages must keep the old one.
    await page.fill('#searchQuery', 'unsubmitted text');
    for (let i = 0; i < 4; i++) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(700); }
    r.appendQueriesUseSubmittedSearch = log.queries.slice(-2).every(q => !q.includes('unsubmitted'));
    await page.fill('#searchQuery', '');
    r.scrollY = await page.evaluate(() => window.scrollY);
    r.cardsAfterScroll = await page.locator('.book-card').count();
    r.loadingToasts = (await page.locator('.toast').allTextContents()).map(t => t.trim());
    r.pageInfoAfterScroll = (await page.locator('#pageInfo').textContent() || '').trim();

    // Filter chip aria-pressed
    r.filterChipAria = await page.evaluate(() => { const b = document.querySelector('[data-filter="solo"]'); return b ? b.getAttribute('aria-pressed') : null; });

    // Click first card
    await page.locator('.book-card').first().click();
    await sleep(600);
    r.urlAfterCardClick = page.url();
  } catch (e) { r.error = String(e && e.stack || e); }
  await ctx.close();
  return r;
}

async function scenarioAppendFailure(browser) {
  const log = freshLog(); const r = { log };
  process.env.FAIL_PAGE = '2';
  const { ctx, page } = await newPage(browser, log);
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForSelector('.book-card', { timeout: 10000 });
    await sleep(300);
    for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(1500); }
    await sleep(4000); // retries with backoff
    r.cardsAfterFailedAppend = await page.locator('.book-card').count();
    r.resultsText = (await page.locator('#results').textContent() || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  } catch (e) { r.error = String(e && e.stack || e); }
  delete process.env.FAIL_PAGE;
  await ctx.close();
  return r;
}

async function scenarioPlayer(browser) {
  const log = freshLog(); const r = { log };
  const { ctx, page } = await newPage(browser, log);
  try {
    await page.goto(`${base}/player.html?id=${BOOK_ID}&track=2`);
    await page.waitForSelector('#custom-player:not(.hidden)', { timeout: 10000 });
    await sleep(800);
    r.playlistCount = await page.locator('#playlistContainer .playlist-item').count();
    r.playlistTitles = await page.locator('#playlistContainer .playlist-item').allTextContents().then(a => a.map(t => t.replace(/\s+/g, ' ').trim()));
    r.playlistItemTag = await page.evaluate(() => { const c = document.querySelector('#playlistContainer'); const b = c.querySelector('.playlist-item'); return { container: c.tagName, row: c.firstElementChild && c.firstElementChild.tagName, button: b && b.tagName, role: b && b.getAttribute('role') }; });
    r.trackInfo = (await page.locator('#trackInfo').textContent() || '').trim();
    r.trackTitle = (await page.locator('#trackTitle').textContent() || '').trim();
    r.documentTitle = await page.title();
    r.bookInfoText = (await page.locator('#book-details, #show-info').first().textContent() || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    r.additionalInfoHasLink = await page.evaluate(() => !!document.querySelector('#book-about a[href^="https://librivox.org"], #additional-info a[href^="https://librivox.org"]'));
    r.additionalInfoHasImg = await page.evaluate(() => !!document.querySelector('#book-about img, #additional-info img'));
    r.xssDesc = await page.evaluate(() => window.__xssDesc === 1);
    r.xssScript = await page.evaluate(() => window.__xssScript === 1);
    r.audioSrc = await page.evaluate(() => document.getElementById('audioElement').getAttribute('src'));
    r.playerState = await page.evaluate(() => window.player && window.player.playerState);
    r.mediaSession = await page.evaluate(() => navigator.mediaSession && navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : null);
    // Wait for playback to start (autoplay allowed in headless Chromium)
    await waitFor(page, () => { const a = document.getElementById('audioElement'); return a && !a.paused && a.currentTime > 0; });
    r.autoplayStarted = await page.evaluate(() => { const a = document.getElementById('audioElement'); return !a.paused && a.currentTime > 0; });
    r.isLoadingTrack = await page.evaluate(() => window.player.isLoadingTrack);

    // Space with play button focused: should toggle exactly once.
    const pausedBefore = await page.evaluate(() => document.getElementById('audioElement').paused);
    await page.locator('#playPause').focus();
    await page.keyboard.press('Space');
    await sleep(600);
    const pausedAfter = await page.evaluate(() => document.getElementById('audioElement').paused);
    r.spaceOnFocusedButton = { pausedBefore, pausedAfter, toggledOnce: pausedBefore !== pausedAfter };
    if (pausedAfter) { await page.evaluate(() => window.player.playPause()); await sleep(400); }

    // Go to the last chapter and press N: player must stay alive (src intact, no error toast).
    const last = r.playlistCount - 1;
    await page.evaluate(i => window.player.selectTrack(i), last);
    await waitFor(page, () => window.player && !window.player.isLoadingTrack);
    await sleep(800);
    r.indexAtLast = await page.evaluate(() => window.player.currentIndex);
    const toastsBefore = await page.locator('#toastContainer .toast, .toast').count();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('n');
    await sleep(900);
    r.afterNAtLast = await page.evaluate(() => ({ src: document.getElementById('audioElement').getAttribute('src'), index: window.player.currentIndex, paused: document.getElementById('audioElement').paused, state: window.player.playerState, error: document.getElementById('audioElement').error && document.getElementById('audioElement').error.code }));
    r.afterNAtLast.newToasts = (await page.locator('.toast').allTextContents()).map(t => t.trim()).slice(toastsBefore);
    r.afterNAtLast.errorPanel = await page.evaluate(() => !!document.querySelector('.bg-red-800'));

    // First chapter, >3s in, press P: should restart the chapter rather than kill the player.
    await page.evaluate(() => window.player.selectTrack(0));
    await waitFor(page, () => window.player && !window.player.isLoadingTrack);
    await sleep(800);
    await page.evaluate(() => { document.getElementById('audioElement').currentTime = 5; });
    await sleep(300);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('p');
    await sleep(900);
    r.afterPAtFirst = await page.evaluate(() => ({ src: document.getElementById('audioElement').getAttribute('src'), index: window.player.currentIndex, currentTime: document.getElementById('audioElement').currentTime, paused: document.getElementById('audioElement').paused }));

    // Speed button
    await page.locator('.speed-btn[data-speed="1.5"]').click();
    await sleep(200);
    r.speed = await page.evaluate(() => ({ rate: document.getElementById('audioElement').playbackRate, pressed: document.querySelector('.speed-btn[data-speed="1.5"]').getAttribute('aria-pressed') }));

    // Next chapter keeps speed
    await page.evaluate(() => window.player.nextTrack());
    await waitFor(page, () => window.player && !window.player.isLoadingTrack);
    await sleep(600);
    r.speedAfterNext = await page.evaluate(() => document.getElementById('audioElement').playbackRate);
    r.urlTrackParam = new URL(page.url()).searchParams.get('track');

    // Persistence: reload and see where we land.
    await page.evaluate(() => { document.getElementById('audioElement').currentTime = 4; });
    await sleep(1500);
    await page.goto(`${base}/player.html?id=${BOOK_ID}`);
    await page.waitForSelector('#custom-player:not(.hidden)', { timeout: 10000 });
    await sleep(1200);
    r.afterReload = await page.evaluate(() => ({ index: window.player.currentIndex, currentTime: Math.round(document.getElementById('audioElement').currentTime), rate: document.getElementById('audioElement').playbackRate }));
    r.visualizerRunning = await page.evaluate(() => !!(window.player && window.player.visualizer && window.player.visualizer.animationId));
  } catch (e) { r.error = String(e && e.stack || e); }
  await ctx.close();
  return r;
}

async function scenarioPlayerErrors(browser) {
  const log = freshLog(); const r = { log };
  const { ctx, page } = await newPage(browser, log);
  try {
    await page.goto(`${base}/player.html`);
    await sleep(800);
    r.noIdText = (await page.locator('#player-wrapper').textContent() || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    await page.goto(`${base}/player.html?id=missing_item`);
    await sleep(1500);
    r.missingItemText = (await page.locator('#player-wrapper').textContent() || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  } catch (e) { r.error = String(e && e.stack || e); }
  await ctx.close();
  return r;
}

async function scenarioStorageDisabled(browser) {
  const log = freshLog(); const r = { log };
  const { ctx, page } = await newPage(browser, log);
  try {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    });
    await page.goto(`${base}/index.html`);
    await page.waitForSelector('.book-card', { timeout: 6000 }).catch(() => {});
    r.cardsWithStorageBlocked = await page.locator('.book-card').count();
    r.pageErrors = log.pageErrors.slice();
  } catch (e) { r.error = String(e && e.stack || e); }
  await ctx.close();
  return r;
}

async function scenarioMobile(browser) {
  const log = freshLog(); const r = { log };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(base)) return route.continue();
    if (u.includes('advancedsearch.php')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(searchResponse(1)) });
    if (u.includes('/services/img/')) return route.fulfill({ status: 200, contentType: 'image/png', body: coverBytes });
    if (u.includes('/metadata/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metadataResponse()) });
    if (u.includes('/download/')) return route.fulfill({ status: 200, contentType: audioType, headers: { 'access-control-allow-origin': '*' }, body: audioBytes });
    return route.abort();
  });
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForSelector('.book-card', { timeout: 10000 });
    await sleep(300);
    r.indexHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await page.goto(`${base}/player.html?id=${BOOK_ID}`);
    await page.waitForSelector('#custom-player:not(.hidden)', { timeout: 10000 });
    await sleep(500);
    r.playerHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  } catch (e) { r.error = String(e && e.stack || e); }
  await ctx.close();
  return r;
}

const browser = await chromium.launch({ ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
const ALL = { index: scenarioIndex, appendFailure: scenarioAppendFailure, player: scenarioPlayer, playerErrors: scenarioPlayerErrors, storageDisabled: scenarioStorageDisabled, mobile: scenarioMobile };
const only = process.env.ONLY ? process.env.ONLY.split(',') : Object.keys(ALL);
for (const name of only) results.scenarios[name] = await ALL[name](browser);
await browser.close();
server.stop();
if (out) writeFileSync(out, JSON.stringify(results, null, 2));

// ---- Assertions -----------------------------------------------------------
const EXPECTED_CONSOLE = /ERR_FAILED|status of 503|Fetch attempt|Search error|could not be found/;
const failures = [];
const check = (name, ok, detail) => { if (!ok) failures.push(`${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`); };
for (const [name, scenario] of Object.entries(results.scenarios)) {
  check(`${name}: journey completed`, !scenario.error, scenario.error);
  check(`${name}: no page errors`, scenario.log.pageErrors.length === 0, scenario.log.pageErrors);
  const unexpected = scenario.log.console.filter(line => !EXPECTED_CONSOLE.test(line));
  check(`${name}: no unexpected console errors`, unexpected.length === 0, unexpected);
}
const { index, appendFailure, player, playerErrors, storageDisabled, mobile } = results.scenarios;
if (index) {
  check('index: first page rendered', index.initialCards === ROWS, index.initialCards);
  check('index: no default year clause', index.initialQuery === 'collection:(librivoxaudio)', index.initialQuery);
  check('index: metadata markup does not execute', !index.xssTitle && !index.xssSubject);
  check('index: multi-valued creator joined', index.firstCardAuthorText === 'Jane Austen, Karen Savage', index.firstCardAuthorText);
  check('index: cards are links', index.cardIsLink && index.cardIsLink.tag === 'A', index.cardIsLink);
  check('index: Ctrl+R is not hijacked', index.randomRequestsAfterCtrlR === 0, index.randomRequestsAfterCtrlR);
  check('index: malformed query is sanitised', index.unbalancedQuerySent && !index.unbalancedQuerySent.includes('(('), index.unbalancedQuerySent);
  check('index: infinite scroll loads every result once', index.cardsAfterScroll === 60, index.cardsAfterScroll);
  check('index: appended pages keep the submitted query', index.appendQueriesUseSubmittedSearch === true);
  check('index: filter chips expose aria-pressed', index.filterChipAria === 'false', index.filterChipAria);
}
if (appendFailure) check('appendFailure: grid survives a failed page', appendFailure.cardsAfterFailedAppend === ROWS, appendFailure.cardsAfterFailedAppend);
if (player) {
  check('player: one row per chapter, sorted', player.playlistCount === 5 && player.playlistTitles[0].startsWith('1. 01'), player.playlistTitles);
  check('player: chapter rows are buttons in a list', player.playlistItemTag && player.playlistItemTag.button === 'BUTTON' && player.playlistItemTag.row === 'LI', player.playlistItemTag);
  check('player: description markup does not execute', !player.xssDesc && !player.xssScript);
  check('player: description links survive sanitising', player.additionalInfoHasLink === true && player.additionalInfoHasImg === false);
  check('player: Next at the last chapter keeps the source', player.afterNAtLast && player.afterNAtLast.src && player.afterNAtLast.error === null, player.afterNAtLast);
  check('player: Previous after 3s restarts the chapter', player.afterPAtFirst && player.afterPAtFirst.src && player.afterPAtFirst.currentTime < 3, player.afterPAtFirst);
  check('player: speed survives a chapter change', player.speedAfterNext === 1.5, player.speedAfterNext);
  check('player: position, chapter and speed restored after reload', player.afterReload && player.afterReload.index === 1 && player.afterReload.currentTime >= 3 && player.afterReload.rate === 1.5, player.afterReload);
  check('player: Media Session metadata set', typeof player.mediaSession === 'string', player.mediaSession);
  check('player: Space on a focused control toggles once', player.spaceOnFocusedButton && player.spaceOnFocusedButton.toggledOnce, player.spaceOnFocusedButton);
}
if (playerErrors) check('playerErrors: missing item explained', /could not be found/.test(playerErrors.missingItemText), playerErrors.missingItemText);
if (storageDisabled) check('storageDisabled: library still renders', storageDisabled.cardsWithStorageBlocked >= ROWS, storageDisabled.cardsWithStorageBlocked);
if (mobile) check('mobile: no horizontal overflow', mobile.indexHorizontalOverflow === false && mobile.playerHorizontalOverflow === false, mobile);

if (failures.length) {
  console.error(`e2e: ${failures.length} failure(s)\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`e2e: ${Object.keys(results.scenarios).length} journeys passed`);
