/**
 * archive.js - Pure helpers for the Archive.org APIs.
 *
 * No DOM access here, so everything is unit-testable with `node --test`.
 * Archive.org returns multi-valued metadata fields (creator, subject,
 * language, description...) as arrays when an item has more than one value,
 * and the metadata API lists every derivative of every audio file, so the
 * helpers below normalise those shapes before the UI touches them.
 */

export const ARCHIVE_BASE = 'https://archive.org';
export const LIBRIVOX_SCOPE = 'collection:(librivoxaudio)';
export const SEARCH_FIELDS = ['identifier', 'title', 'year', 'creator', 'date', 'language', 'runtime', 'subject'];

const FILTER_CLAUSES = {
    solo: 'subject:(solo)',
    complete: 'subject:(complete)',
    english: 'language:(English)'
};

/* ------------------------------------------------------------------ */
/* Value normalisation                                                 */
/* ------------------------------------------------------------------ */

/** Coerce a scalar-or-array metadata value into a list of non-empty strings. */
export function asList(value) {
    if (value === undefined || value === null) return [];
    const list = Array.isArray(value) ? value : [value];
    return list
        .filter(v => v !== undefined && v !== null)
        .map(v => String(v).trim())
        .filter(v => v.length > 0);
}

/** Join a scalar-or-array metadata value for display ("A, B"). */
export function joinValues(value, separator = ', ') {
    return asList(value).join(separator);
}

/** First value of a scalar-or-array field, or the fallback. */
export function firstValue(value, fallback = '') {
    const list = asList(value);
    return list.length ? list[0] : fallback;
}

/** Archive.org identifiers are ASCII letters, digits, "_", "-" and ".". */
export function isValidIdentifier(identifier) {
    return typeof identifier === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(identifier);
}

/* ------------------------------------------------------------------ */
/* Search query construction                                          */
/* ------------------------------------------------------------------ */

/**
 * Make free text safe to embed inside a Lucene query without producing a
 * parse error: drop characters that only carry Lucene syntax, and remove
 * quotes/parentheses entirely when they are unbalanced.
 */
export function sanitizeUserQuery(raw, { allowFieldSyntax = false } = {}) {
    let q = String(raw ?? '').trim();
    if (!q) return '';

    q = q.replace(/[\\{}[\]^~/]/g, ' ');
    // "Dracula: Chapter 1" would otherwise be parsed as a query on a field
    // named Dracula. Only the advanced mode keeps field syntax.
    if (!allowFieldSyntax) q = q.replace(/:/g, ' ');

    const quoteCount = (q.match(/"/g) || []).length;
    if (quoteCount % 2 === 1) q = q.replace(/"/g, ' ');

    let depth = 0;
    let balanced = true;
    for (const ch of q) {
        if (ch === '(') depth++;
        else if (ch === ')') {
            depth--;
            if (depth < 0) { balanced = false; break; }
        }
    }
    if (!balanced || depth !== 0) q = q.replace(/[()]/g, ' ');

    q = q.replace(/\s+/g, ' ').trim();
    // Leading/trailing boolean operators are parse errors. Lucene operators are
    // upper-case only, so "Pride and" is left alone.
    q = q.replace(/^(?:AND|OR|NOT)\s+/, '').replace(/\s+(?:AND|OR|NOT)$/, '').trim();
    if (/^(?:AND|OR|NOT)$/.test(q)) q = '';
    return q;
}

/** Parse a year typed by the user; null when empty or not a plausible year. */
export function normalizeYear(value) {
    const text = String(value ?? '').trim();
    if (!/^\d{4}$/.test(text)) return null;
    const n = parseInt(text, 10);
    return n >= 1000 && n <= 9999 ? n : null;
}

/**
 * Build the Lucene query for a search.
 * @param {object} opts
 * @param {string} opts.category   category id from categoryConfig
 * @param {object} opts.config     the category's config entry ({ query })
 * @param {string} opts.query      free text typed by the user
 * @param {string|number} opts.yearFrom
 * @param {string|number} opts.yearTo
 * @param {Iterable<string>} opts.filters  active quick-filter ids
 */
export function buildSearchQuery({ category = 'AllLibriVox', config = {}, query = '', yearFrom = '', yearTo = '', filters = [] } = {}) {
    const text = sanitizeUserQuery(query, { allowFieldSyntax: category === 'Custom' });
    let lucene;

    if (category === 'Author_Search') {
        lucene = text ? `${LIBRIVOX_SCOPE} AND creator:(${text})` : LIBRIVOX_SCOPE;
    } else if (category === 'Title_Search') {
        lucene = text ? `${LIBRIVOX_SCOPE} AND title:(${text})` : LIBRIVOX_SCOPE;
    } else if (category === 'Custom') {
        lucene = text ? `${LIBRIVOX_SCOPE} AND (${text})` : LIBRIVOX_SCOPE;
    } else {
        lucene = (config && config.query) || LIBRIVOX_SCOPE;
        if (text) lucene += ` AND (${text})`;
    }

    // The year clause is only added when the user actually typed a year:
    // a default range would silently drop every item without a year field.
    let from = normalizeYear(yearFrom);
    let to = normalizeYear(yearTo);
    if (from !== null || to !== null) {
        if (from !== null && to !== null && from > to) [from, to] = [to, from];
        lucene += ` AND year:[${from ?? '*'} TO ${to ?? '*'}]`;
    }

    for (const filter of filters) {
        if (FILTER_CLAUSES[filter]) lucene += ` AND ${FILTER_CLAUSES[filter]}`;
    }
    return lucene;
}

const NOISE_SUBJECTS = /^(librivox|audio ?books?|audio|literature)$/i;

/**
 * Short genre tags from the subject field: splits "a; b" strings, drops
 * boilerplate subjects and long entries, and de-duplicates.
 */
export function subjectTags(subject, { max = 2, maxLength = 20 } = {}) {
    const seen = new Set();
    const tags = [];
    for (const raw of asList(subject).flatMap(s => s.split(/[;|]/))) {
        const tag = raw.trim();
        if (!tag || tag.length >= maxLength || NOISE_SUBJECTS.test(tag)) continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(tag.charAt(0).toUpperCase() + tag.slice(1));
        if (tags.length === max) break;
    }
    return tags;
}

/** URL for the advancedsearch endpoint. */
export function buildSearchUrl(query, { rows = 24, page = 1, fields = SEARCH_FIELDS, sort = 'downloads desc' } = {}) {
    const params = new URLSearchParams();
    params.set('q', query);
    for (const field of fields) params.append('fl[]', field);
    params.append('sort[]', sort);
    params.set('rows', String(rows));
    params.set('page', String(page));
    params.set('output', 'json');
    return `${ARCHIVE_BASE}/advancedsearch.php?${params.toString()}`;
}

/**
 * Validate an advancedsearch payload. Archive.org answers malformed queries
 * with an "error" member instead of an HTTP error.
 * @returns {{ docs: object[], numFound: number }}
 */
export function parseSearchResponse(data) {
    if (!data || typeof data !== 'object') throw new Error('Unexpected response from Archive.org');
    if (typeof data.error === 'string') throw new Error(`Archive.org rejected the query: ${data.error}`);
    const response = data.response;
    if (!response || !Array.isArray(response.docs)) throw new Error('Unexpected response from Archive.org');
    const numFound = Number(response.numFound);
    return { docs: response.docs, numFound: Number.isFinite(numFound) ? numFound : response.docs.length };
}

/* ------------------------------------------------------------------ */
/* HTTP                                                               */
/* ------------------------------------------------------------------ */

export class HttpError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

function namedError(name, message, cause) {
    const error = new Error(message);
    error.name = name;
    if (cause) error.cause = cause;
    return error;
}

function abortError() {
    return typeof DOMException !== 'undefined' ? new DOMException('Aborted', 'AbortError') : namedError('AbortError', 'Aborted');
}

/** Transient failures worth retrying: network, timeout, 429 and 5xx. */
export function isRetryableError(error) {
    if (!error) return false;
    if (error.name === 'AbortError') return false;
    if (error.name === 'HttpError') return error.status === 429 || error.status >= 500;
    return error.name === 'NetworkError' || error.name === 'TimeoutError' || error.name === 'ParseError';
}

/** A short user-facing explanation for a failed request. */
export function describeFetchError(error) {
    switch (error && error.name) {
        case 'TimeoutError': return 'Archive.org is taking too long to respond. Please try again.';
        case 'NetworkError': return 'Unable to reach Archive.org. Please check your connection.';
        case 'ParseError': return 'Archive.org returned an unreadable response. Please try again.';
        case 'HttpError': return error.status === 429
            ? 'Archive.org is rate-limiting requests. Please wait a moment and try again.'
            : `Archive.org responded with an error (HTTP ${error.status}). This is usually temporary.`;
        default: return (error && error.message) || 'Something went wrong talking to Archive.org.';
    }
}

/**
 * fetch + JSON with a per-attempt timeout and retries for transient failures.
 * Errors carry a `name` of AbortError (caller cancelled), TimeoutError,
 * NetworkError, HttpError (with `status`) or ParseError.
 */
export async function fetchJSON(url, { signal, attempts = 3, timeoutMs = 15000, retryDelayMs = 1000, fetchImpl = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        if (signal && signal.aborted) throw abortError();
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        try {
            let response;
            try {
                response = await fetchImpl(url, { signal: controller.signal });
            } catch (error) {
                if (signal && signal.aborted) throw abortError();
                if (timedOut) throw namedError('TimeoutError', 'Archive.org took too long to respond', error);
                throw namedError('NetworkError', 'Could not reach Archive.org', error);
            }
            if (!response.ok) throw new HttpError(`Archive.org responded with HTTP ${response.status}`, response.status);
            try {
                return await response.json();
            } catch (error) {
                if (signal && signal.aborted) throw abortError();
                if (timedOut) throw namedError('TimeoutError', 'Archive.org took too long to respond', error);
                throw namedError('ParseError', 'Archive.org returned an unreadable response', error);
            }
        } catch (error) {
            lastError = error;
            if (error.name === 'AbortError' || !isRetryableError(error) || attempt === attempts) throw error;
            await sleep(retryDelayMs * attempt);
        } finally {
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', onAbort);
        }
    }
    throw lastError;
}

/* ------------------------------------------------------------------ */
/* Item URLs                                                          */
/* ------------------------------------------------------------------ */

export function metadataUrl(identifier) {
    return `${ARCHIVE_BASE}/metadata/${encodeURIComponent(identifier)}`;
}

export function downloadUrl(identifier, fileName) {
    const path = String(fileName).split('/').map(encodeURIComponent).join('/');
    return `${ARCHIVE_BASE}/download/${encodeURIComponent(identifier)}/${path}`;
}

export function coverUrl(identifier) {
    return `${ARCHIVE_BASE}/services/img/${encodeURIComponent(identifier)}`;
}

export function detailsUrl(identifier) {
    return `${ARCHIVE_BASE}/details/${encodeURIComponent(identifier)}`;
}

/**
 * Validate a metadata payload. A missing item comes back as `{}`.
 * @returns {{ metadata: object, files: object[] }}
 */
export function parseMetadataResponse(data) {
    if (!data || typeof data !== 'object' || !data.metadata) {
        throw new Error('This audiobook could not be found on Archive.org');
    }
    return { metadata: data.metadata, files: Array.isArray(data.files) ? data.files : [] };
}

/* ------------------------------------------------------------------ */
/* Audio file selection                                               */
/* ------------------------------------------------------------------ */

const AUDIO_EXTENSION = /\.(mp3|ogg|oga|opus|m4a|m4b|flac|wav)$/i;
const NON_AUDIO_FORMAT = /zip|m3u|spectrogram|png|jpeg|jpg|peaks|metadata|torrent|text|xml/;

/** Parse "01", "3/12" or 7 into a track number. */
export function parseTrackNumber(track) {
    if (track === undefined || track === null) return null;
    const match = String(track).match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
}

/** Parse a file length given as seconds ("600.12") or as "h:mm:ss" / "mm:ss". */
export function parseLength(value) {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value).trim();
    if (text.includes(':')) {
        const parts = text.split(':').map(Number);
        if (parts.some(n => !Number.isFinite(n))) return null;
        return parts.reduce((total, part) => total * 60 + part, 0);
    }
    const seconds = parseFloat(text);
    return Number.isFinite(seconds) ? seconds : null;
}

/** Chapter identity shared by an original and its derivatives. */
export function chapterStem(fileName) {
    return String(fileName)
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/, '')
        .replace(/_(?:\d{1,3}kb|vbr|orig|original)$/, '');
}

/** Human-readable fallback title derived from a file name. */
export function prettifyFileName(fileName) {
    const stem = String(fileName).split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/_(?:\d{1,3}kb|vbr)$/i, '');
    return stem.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || String(fileName);
}

export function isAudioFile(file) {
    if (!file || typeof file.name !== 'string') return false;
    if (!AUDIO_EXTENSION.test(file.name)) return false;
    const format = String(file.format || '').toLowerCase();
    if (NON_AUDIO_FORMAT.test(format)) return false;
    return format === '' || /mp3|ogg|vorbis|mpeg|audio|flac|wave|opus|aac/.test(format);
}

/** Lower is better. MP3 first (Safari cannot play Ogg Vorbis), originals before derivatives. */
function formatRank(file) {
    const format = String(file.format || '').toLowerCase();
    const name = file.name.toLowerCase();
    const isMp3 = format.includes('mp3') || name.endsWith('.mp3');
    if (isMp3) {
        if (file.source === 'original') return 0;
        if (format.includes('64kbps')) return 1;
        if (format.includes('vbr')) return 2;
        return 3;
    }
    if (name.endsWith('.m4a') || name.endsWith('.m4b') || format.includes('aac')) return 4;
    if (format.includes('ogg') || format.includes('vorbis') || name.endsWith('.ogg') || name.endsWith('.oga')) return 5;
    return 6;
}

function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Reduce the raw Archive.org file list to one playable file per chapter,
 * sorted by track number (then by name).
 * @returns {Array<{ name: string, title: string, track: number|null, length: number|null, format: string }>}
 */
export function selectAudioFiles(files) {
    if (!Array.isArray(files)) return [];

    const groups = new Map();
    for (const file of files) {
        if (!isAudioFile(file)) continue;
        const keySource = file.source === 'derivative' && typeof file.original === 'string' ? file.original : file.name;
        const key = chapterStem(keySource);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(file);
    }

    const chapters = [];
    for (const group of groups.values()) {
        group.sort((a, b) => formatRank(a) - formatRank(b) || naturalCompare(a.name, b.name));
        const best = group[0];
        const titled = group.find(f => typeof f.title === 'string' && f.title.trim());
        const tracked = group.find(f => parseTrackNumber(f.track) !== null);
        const timed = group.find(f => parseLength(f.length) !== null);
        chapters.push({
            name: best.name,
            title: titled ? titled.title.trim() : prettifyFileName(best.name),
            track: tracked ? parseTrackNumber(tracked.track) : null,
            length: timed ? parseLength(timed.length) : null,
            format: String(best.format || '')
        });
    }

    chapters.sort((a, b) => {
        if (a.track !== null && b.track !== null && a.track !== b.track) return a.track - b.track;
        if (a.track !== null && b.track === null) return -1;
        if (a.track === null && b.track !== null) return 1;
        return naturalCompare(a.name, b.name);
    });
    return chapters;
}
