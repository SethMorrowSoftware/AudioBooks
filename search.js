/**
 * search.js - Library page: search, filters, infinite scroll, random pick
 */

import { showLoading, hideLoading, showToast, escapeHTML } from './utils.js';
import { getCategoryConfig, getAllCategories, isSearchMode } from './categoryConfig.js';
import { storage } from './storage.js';
import {
    buildSearchQuery, buildSearchUrl, parseSearchResponse, coverUrl,
    asList, joinValues, firstValue, isValidIdentifier
} from './archive.js';

const RESULTS_PER_PAGE = 24;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 15000;
const RANDOM_POOL_PAGES = 10;
const RANDOM_POOL_ROWS = 50;

const COVER_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect fill="#374151" width="200" height="300"/>' +
    '<text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="48" font-family="system-ui">📖</text>' +
    '<text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-size="12" font-family="system-ui">No Cover</text></svg>'
);

const state = {
    page: 1,
    total: 0,
    results: [],
    filters: new Set(),
    loadingMore: false,
    requestId: 0,
    controller: null,
    lastParams: null,
    randomInFlight: false
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(error) {
    if (error.name === 'AbortError') return false;
    if (error.status) return error.status === 429 || error.status >= 500;
    return true; // network failure
}

/**
 * Fetch JSON with a timeout and retries for transient failures only.
 * @param {string} url
 * @param {AbortSignal} signal caller's abort signal (stale request cancellation)
 */
export async function fetchJSON(url, { signal, attempts = MAX_ATTEMPTS } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (signal) {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            signal.addEventListener('abort', onAbort, { once: true });
        }
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                const error = new Error(`Archive.org responded with HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }
            return await response.json();
        } catch (error) {
            if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
            lastError = error;
            if (!isRetryable(error) || attempt === attempts) throw error;
            console.warn(`Fetch attempt ${attempt} failed:`, error.message);
            await sleep(RETRY_DELAY_MS * attempt);
        } finally {
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', onAbort);
        }
    }
    throw lastError;
}

function readSearchParams() {
    const query = document.getElementById('searchQuery')?.value.trim() ?? '';
    const yearFrom = document.getElementById('yearFrom')?.value ?? '';
    const yearTo = document.getElementById('yearTo')?.value ?? '';
    const category = document.getElementById('categorySelector')?.value || 'AllLibriVox';
    return { query, yearFrom, yearTo, category, filters: [...state.filters] };
}

function isUnfilteredBrowse(params) {
    return params.category === 'AllLibriVox' && !params.query && !params.yearFrom && !params.yearTo && params.filters.length === 0;
}

/**
 * Run a search. `append` loads the next page under the existing results.
 */
export async function searchAudiobooks(page = 1, { append = false } = {}) {
    const params = readSearchParams();
    const config = getCategoryConfig(params.category);
    const requestId = ++state.requestId;

    if (state.controller) state.controller.abort();
    const controller = new AbortController();
    state.controller = controller;

    if (!append) {
        state.lastParams = { ...params };
        showLoading();
        setLoadMoreState('idle');
    }
    state.loadingMore = append;
    document.getElementById('results')?.setAttribute('aria-busy', 'true');

    const lucene = buildSearchQuery({ category: params.category, config, query: params.query, yearFrom: params.yearFrom, yearTo: params.yearTo, filters: params.filters });
    document.title = `${config.title} - LibriVox Audiobooks`;

    try {
        const data = await fetchJSON(buildSearchUrl(lucene, { rows: RESULTS_PER_PAGE, page }), { signal: controller.signal });
        if (requestId !== state.requestId) return; // a newer search superseded this one

        const { docs, numFound } = parseSearchResponse(data);
        state.page = page;
        state.total = numFound;
        state.results = append ? state.results.concat(docs) : docs;

        hideLoading();
        renderResults(docs, append);
        updateResultsInfo();
        if (isUnfilteredBrowse(params)) updateBookCount(numFound);
    } catch (error) {
        if (error.name === 'AbortError' || requestId !== state.requestId) return;
        console.error('Search error:', error);
        hideLoading();
        if (append) {
            setLoadMoreState('error');
            showToast('Could not load more audiobooks. Scroll or tap Retry to try again.', 'error');
        } else {
            renderSearchError(error);
        }
    } finally {
        if (requestId === state.requestId) {
            state.loadingMore = false;
            document.getElementById('results')?.setAttribute('aria-busy', 'false');
        }
    }
}

function renderResults(docs, append) {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return;

    if (!append && docs.length === 0) {
        resultsDiv.innerHTML = `
            <div class="col-span-full text-center py-16 animate-fade-in">
                <div class="inline-flex items-center justify-center w-20 h-20 bg-gray-800 rounded-full mb-6">
                    <svg class="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                </div>
                <h3 class="text-xl font-bold text-gray-300 mb-2">No audiobooks found</h3>
                <p class="text-gray-500">Try adjusting your search criteria or filters</p>
            </div>`;
        return;
    }

    const html = docs.map((book, index) => {
        const delay = append ? 0 : Math.min(index, 12) * 0.03;
        return createBookCard(book, delay);
    }).join('');

    if (append) {
        resultsDiv.insertAdjacentHTML('beforeend', html);
    } else {
        resultsDiv.innerHTML = html;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function bookYear(book) {
    const year = firstValue(book.year);
    if (/^\d{4}$/.test(year)) return year;
    const date = firstValue(book.date);
    return /^\d{4}/.test(date) ? date.slice(0, 4) : '';
}

export function createBookCard(book, delay = 0) {
    const identifier = firstValue(book.identifier);
    if (!isValidIdentifier(identifier)) return '';

    const title = firstValue(book.title, 'Untitled Audiobook');
    const author = joinValues(book.creator) || 'Unknown Author';
    const year = bookYear(book);
    const language = joinValues(book.language);
    const runtime = firstValue(book.runtime);
    const genreTags = asList(book.subject)
        .filter(s => s.length < 20)
        .slice(0, 2)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1));

    const href = `player.html?id=${encodeURIComponent(identifier)}`;
    const label = `${title} by ${author}`;

    return `
        <a class="book-card animate-fade-in" href="${href}" style="animation-delay: ${delay}s" aria-label="${escapeHTML(label)}">
            <div class="book-cover-wrapper">
                <img src="${coverUrl(identifier)}"
                     alt=""
                     class="book-cover"
                     width="200" height="300"
                     loading="lazy"
                     decoding="async">
                <div class="book-overlay" aria-hidden="true">
                    <div class="play-button">
                        <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/>
                        </svg>
                    </div>
                    <div class="overlay-info">
                        <div class="overlay-author">${escapeHTML(author)}</div>
                        ${runtime ? `<div class="overlay-runtime">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ${escapeHTML(runtime)}
                        </div>` : ''}
                    </div>
                </div>
            </div>
            <div class="book-info">
                <h3 class="book-title" title="${escapeHTML(title)}">${escapeHTML(title)}</h3>
                <p class="book-author">${escapeHTML(author)}</p>
                <div class="book-meta">
                    ${year ? `<span class="meta-badge year-badge">${escapeHTML(year)}</span>` : ''}
                    ${language && language !== 'English' ? `<span class="meta-badge lang-badge">${escapeHTML(language)}</span>` : ''}
                    ${genreTags.map(tag => `<span class="meta-badge genre-badge">${escapeHTML(tag)}</span>`).join('')}
                </div>
            </div>
        </a>
    `;
}

function renderSearchError(error) {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return;

    const message = error.message || 'Unknown error';
    const rejected = /rejected the query/i.test(message);
    const network = !rejected && !error.status;

    let heading = 'Search Error';
    let detail = 'An error occurred while searching. This may be temporary.';
    if (rejected) {
        heading = 'Search Not Understood';
        detail = 'Archive.org could not parse that search. Try simpler words, or wrap exact phrases in quotes.';
    } else if (network) {
        heading = 'Connection Problem';
        detail = 'Unable to reach Archive.org. Please check your connection.';
    }

    resultsDiv.innerHTML = `
        <div class="col-span-full text-center py-16 animate-fade-in" role="alert">
            <div class="inline-flex items-center justify-center w-20 h-20 bg-red-900 bg-opacity-30 rounded-full mb-6">
                <svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <h3 class="text-xl font-bold text-red-400 mb-2">${heading}</h3>
            <p class="text-gray-400 mb-6 max-w-md mx-auto">${detail}</p>
            <button type="button" id="retrySearch"
                class="px-6 py-3 bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white font-semibold rounded-xl transition-all shadow-lg">
                Try Again
            </button>
        </div>`;

    resultsDiv.querySelector('#retrySearch')?.addEventListener('click', () => retryLastSearch());
}

export function retryLastSearch() {
    const params = state.lastParams;
    if (params) {
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
        set('searchQuery', params.query);
        set('yearFrom', params.yearFrom);
        set('yearTo', params.yearTo);
        set('categorySelector', params.category);
    }
    showToast('Retrying search...', 'info', 1500);
    searchAudiobooks(1);
}

function updateResultsInfo() {
    const pageInfo = document.getElementById('pageInfo');
    if (!pageInfo) return;
    if (state.total === 0) {
        pageInfo.textContent = '';
        return;
    }
    const showing = Math.min(state.results.length, state.total);
    pageInfo.textContent = `Showing ${showing.toLocaleString()} of ${state.total.toLocaleString()} audiobooks`;
    setLoadMoreState(state.results.length >= state.total ? 'done' : 'idle');
}

function updateBookCount(total) {
    const pill = document.getElementById('bookCount');
    if (pill && total > 0) pill.textContent = `${total.toLocaleString()} Books`;
}

/* ------------------------------------------------------------------ */
/* Infinite scroll                                                    */
/* ------------------------------------------------------------------ */

function setLoadMoreState(mode) {
    const sentinel = document.getElementById('loadMore');
    if (!sentinel) return;
    sentinel.dataset.state = mode;
    sentinel.querySelector('.load-more-spinner')?.classList.toggle('hidden', mode !== 'loading');
    sentinel.querySelector('.load-more-retry')?.classList.toggle('hidden', mode !== 'error');
    sentinel.querySelector('.load-more-done')?.classList.toggle('hidden', mode !== 'done');
}

function loadNextPage() {
    if (state.loadingMore || state.results.length === 0 || state.results.length >= state.total) return;
    setLoadMoreState('loading');
    searchAudiobooks(state.page + 1, { append: true });
}

function setupInfiniteScroll() {
    const sentinel = document.getElementById('loadMore');
    if (!sentinel || !('IntersectionObserver' in window)) return;

    sentinel.querySelector('.load-more-retry')?.addEventListener('click', loadNextPage);

    const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting) && sentinel.dataset.state !== 'error') loadNextPage();
    }, { rootMargin: '400px 0px' });
    observer.observe(sentinel);
}

/* ------------------------------------------------------------------ */
/* Random book                                                        */
/* ------------------------------------------------------------------ */

export async function pickRandomBook() {
    if (state.randomInFlight) return;
    state.randomInFlight = true;
    const button = document.getElementById('randomBook');
    if (button) button.disabled = true;
    const toast = showToast('Finding a book...', 'info', 0);

    try {
        const params = readSearchParams();
        const category = isSearchMode(params.category) ? 'AllLibriVox' : params.category;
        const lucene = buildSearchQuery({ category, config: getCategoryConfig(category), filters: params.filters });

        let page = Math.floor(Math.random() * RANDOM_POOL_PAGES) + 1;
        let { docs } = parseSearchResponse(await fetchJSON(buildSearchUrl(lucene, { rows: RANDOM_POOL_ROWS, page, fields: ['identifier', 'title', 'creator'] })));
        if (docs.length === 0 && page !== 1) {
            ({ docs } = parseSearchResponse(await fetchJSON(buildSearchUrl(lucene, { rows: RANDOM_POOL_ROWS, page: 1, fields: ['identifier', 'title', 'creator'] }))));
        }
        const candidates = docs.filter(doc => isValidIdentifier(firstValue(doc.identifier)));
        toast.dismiss();
        if (candidates.length === 0) {
            showToast('No books found, try another category', 'warning');
            return;
        }
        const book = candidates[Math.floor(Math.random() * candidates.length)];
        showToast(firstValue(book.title, 'Opening audiobook...'), 'success', 1200);
        setTimeout(() => {
            window.location.href = `player.html?id=${encodeURIComponent(firstValue(book.identifier))}`;
        }, 500);
    } catch (error) {
        console.error('Random book error:', error);
        toast.dismiss();
        showToast('Could not pick a random book right now', 'error');
    } finally {
        state.randomInFlight = false;
        if (button) button.disabled = false;
    }
}

/* ------------------------------------------------------------------ */
/* Continue listening                                                 */
/* ------------------------------------------------------------------ */

function renderContinueListening() {
    const section = document.getElementById('continueListening');
    const list = document.getElementById('continueListeningList');
    if (!section || !list) return;

    const entries = storage.getRecentlyViewed()
        .map(entry => ({ ...entry, progress: storage.getProgress(entry.identifier) }))
        .filter(entry => isValidIdentifier(entry.identifier))
        .slice(0, 6);

    if (entries.length === 0) {
        section.classList.add('hidden');
        return;
    }

    list.innerHTML = entries.map(entry => {
        const track = entry.progress ? entry.progress.track + 1 : 1;
        const href = `player.html?id=${encodeURIComponent(entry.identifier)}${entry.progress ? `&track=${track}` : ''}`;
        const meta = entry.progress
            ? `Chapter ${track}${entry.progress.chapters ? ` of ${entry.progress.chapters}` : ''}`
            : 'Start listening';
        return `
            <a class="continue-chip" href="${href}">
                <img class="continue-cover" src="${coverUrl(entry.identifier)}" alt="" width="40" height="60" loading="lazy" decoding="async">
                <span class="continue-text">
                    <span class="continue-title">${escapeHTML(entry.title)}</span>
                    <span class="continue-meta">${escapeHTML(entry.author ? `${entry.author} · ${meta}` : meta)}</span>
                </span>
            </a>`;
    }).join('');
    section.classList.remove('hidden');
}

/* ------------------------------------------------------------------ */
/* Page setup                                                         */
/* ------------------------------------------------------------------ */

function populateCategorySelect(select) {
    select.innerHTML = getAllCategories().map(group => `
        <optgroup label="${escapeHTML(group.group)}">
            ${group.options.map(option => `<option value="${escapeHTML(option.id)}">${escapeHTML(option.title)}</option>`).join('')}
        </optgroup>`).join('');
}

function applyCategoryToSearchBox(categoryId, searchQuery) {
    if (!searchQuery) return;
    const config = getCategoryConfig(categoryId);
    searchQuery.placeholder = (isSearchMode(categoryId) && config.placeholder) || 'Search by title, author, or keyword...';
}

function isTypingTarget(target) {
    return !!target && (target.matches('input, select, textarea, [contenteditable="true"]'));
}

export function initSearchPage() {
    const form = document.getElementById('searchForm');
    const searchQuery = document.getElementById('searchQuery');
    const yearFrom = document.getElementById('yearFrom');
    const yearTo = document.getElementById('yearTo');
    const categorySelector = document.getElementById('categorySelector');
    const randomButton = document.getElementById('randomBook');
    const resultsDiv = document.getElementById('results');

    const currentYear = new Date().getFullYear();
    [yearFrom, yearTo].forEach(input => { if (input) input.max = String(currentYear); });

    if (categorySelector) {
        populateCategorySelect(categorySelector);
        const saved = storage.getSelectedCategory();
        if (categorySelector.querySelector(`option[value="${CSS.escape(saved)}"]`)) categorySelector.value = saved;
        applyCategoryToSearchBox(categorySelector.value, searchQuery);

        categorySelector.addEventListener('change', () => {
            storage.setSelectedCategory(categorySelector.value);
            applyCategoryToSearchBox(categorySelector.value, searchQuery);
            if (isSearchMode(categorySelector.value) && searchQuery) {
                searchQuery.value = '';
                searchQuery.focus();
                if (state.results.length === 0) searchAudiobooks(1);
                return;
            }
            searchAudiobooks(1);
        });
    }

    if (form) {
        form.addEventListener('submit', event => {
            event.preventDefault();
            searchAudiobooks(1);
        });
    }

    if (yearFrom) yearFrom.addEventListener('change', () => searchAudiobooks(1));
    if (yearTo) yearTo.addEventListener('change', () => searchAudiobooks(1));

    document.querySelectorAll('[data-filter]').forEach(button => {
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
            const filter = button.dataset.filter;
            const active = !state.filters.has(filter);
            if (active) state.filters.add(filter); else state.filters.delete(filter);
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
            searchAudiobooks(1);
        });
    });

    if (randomButton) randomButton.addEventListener('click', event => { event.preventDefault(); pickRandomBook(); });

    if (resultsDiv) {
        // Cover images that fail to load fall back to a placeholder.
        resultsDiv.addEventListener('error', event => {
            const img = event.target;
            if (img instanceof HTMLImageElement && !img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = COVER_PLACEHOLDER;
            }
        }, true);
    }

    document.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
        if (isTypingTarget(event.target)) return;
        if (event.key === '/') {
            event.preventDefault();
            searchQuery?.focus();
        } else if (event.key === 'r' || event.key === 'R') {
            event.preventDefault();
            pickRandomBook();
        }
    });

    renderContinueListening();
    setupInfiniteScroll();
    searchAudiobooks(1);
}
