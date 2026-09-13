/**
 * main.js - Entry point for both pages of LibriVox Audiobooks
 */

import { initSearchPage } from './search.js';
import { Player, renderPlayerFatalError } from './player.js';
import { showToast } from './utils.js';
import { isValidIdentifier } from './archive.js';

let player = null;

async function initializePlayerPage() {
    const params = new URLSearchParams(window.location.search);
    const identifier = params.get('id');

    if (!identifier) {
        renderPlayerFatalError('No audiobook ID provided. Please select an audiobook from the library.');
        return;
    }
    if (!isValidIdentifier(identifier)) {
        renderPlayerFatalError('That audiobook link is not valid. Please select an audiobook from the library.');
        return;
    }

    const trackParam = parseInt(params.get('track') ?? '', 10);
    const startTrack = Number.isInteger(trackParam) && trackParam > 0 ? trackParam - 1 : null;

    player = new Player({
        onTrackChange(index) {
            try {
                const query = new URLSearchParams(window.location.search);
                query.set('track', String(index + 1));
                history.replaceState(null, '', `${window.location.pathname}?${query}`);
            } catch (e) {
                console.warn('Could not update the URL:', e);
            }
        }
    });
    window.player = player; // handy for debugging in the console

    try {
        const ok = await player.initialize(identifier, startTrack);
        if (!ok) return;

        // Only try to auto-play when the listener arrived from our own library
        // (a click there counts as the gesture); a direct load just shows Play.
        let fromLibrary = params.get('autoplay') === '1';
        try {
            fromLibrary ||= !!document.referrer && new URL(document.referrer).origin === window.location.origin;
        } catch { /* opaque referrer */ }
        if (fromLibrary) await player.play({ quiet: true });
    } catch (error) {
        console.error('Fatal error initializing player:', error);
        renderPlayerFatalError(error.message || 'Unknown error loading player');
    }
}

function initializeSearchPageSafely() {
    try {
        initSearchPage();
    } catch (error) {
        console.error('Error initializing search:', error);
        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            resultsDiv.innerHTML = `
                <div class="col-span-full text-center my-8 p-6 bg-gray-800 border-2 border-red-900 rounded-lg" role="alert">
                    <h3 class="text-xl font-semibold text-red-400 mb-2">Initialization Error</h3>
                    <p class="text-gray-400 mb-4">The application failed to start properly.</p>
                    <button type="button" id="reloadPage" class="px-6 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors">Reload Page</button>
                </div>`;
            resultsDiv.querySelector('#reloadPage')?.addEventListener('click', () => location.reload());
        }
        showToast('Application error. Please refresh the page.', 'error', 5000);
    }
}

function start() {
    window.addEventListener('error', event => console.error('Global error:', event.error || event.message));
    window.addEventListener('unhandledrejection', event => console.error('Unhandled promise rejection:', event.reason));

    if (document.getElementById('player-wrapper')) {
        initializePlayerPage();
    } else if (document.getElementById('results')) {
        initializeSearchPageSafely();
    }
}

// Module scripts are deferred, but guard against being loaded late anyway.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}

// pagehide fires on navigation, tab close and when the page enters the
// back/forward cache, so the position gets its final save here. The player is
// deliberately left intact: a bfcache restore brings the page back as it was.
function saveNow() {
    if (player) {
        try { player.saveProgress(true); } catch (e) { console.error('Error saving progress:', e); }
    }
}
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
