// utils.js - Shared DOM and formatting helpers

/**
 * Format seconds as m:ss, or h:mm:ss for chapters longer than an hour.
 */
export function formatTime(seconds) {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total < 0) return '0:00';
    const whole = Math.floor(total);
    const hours = Math.floor(whole / 3600);
    const mins = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    const mm = String(mins).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mins}:${ss}`;
}

/**
 * Shuffle an array (Fisher-Yates), returning a new array.
 */
export function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Escape text for safe interpolation into HTML (element content or attributes).
 */
export function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const RICH_TEXT_TAGS = new Set(['P', 'BR', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'DIV']);

/**
 * Reduce community-submitted HTML (Archive.org descriptions) to a small
 * allowlist of formatting tags with no attributes other than safe links.
 * Everything else is unwrapped to its text content.
 */
export function sanitizeRichText(html) {
    if (typeof DOMParser === 'undefined') return escapeHTML(html);
    const doc = new DOMParser().parseFromString(`<body>${String(html ?? '')}</body>`, 'text/html');
    const output = document.createElement('div');

    const copy = (source, target) => {
        for (const node of Array.from(source.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                target.appendChild(document.createTextNode(node.textContent));
                continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            const tag = node.tagName.toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED') continue;
            if (!RICH_TEXT_TAGS.has(tag)) {
                copy(node, target);
                continue;
            }
            const el = document.createElement(tag.toLowerCase());
            if (tag === 'A') {
                const href = node.getAttribute('href') || '';
                if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
                    el.setAttribute('href', href);
                    el.setAttribute('target', '_blank');
                    el.setAttribute('rel', 'noopener noreferrer');
                }
            }
            copy(node, el);
            target.appendChild(el);
        }
    };

    copy(doc.body, output);
    return output.innerHTML;
}

/**
 * Show/hide the search page loading indicator.
 */
export function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.remove('hidden');
        loading.classList.add('flex');
    }
}

export function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.add('hidden');
        loading.classList.remove('flex');
    }
}

const TOAST_ICONS = {
    success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />',
    error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />',
    warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />',
    info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />'
};

const TOAST_COLORS = {
    success: 'from-green-600 to-emerald-600',
    error: 'from-red-600 to-pink-600',
    warning: 'from-yellow-600 to-orange-600',
    info: 'from-sky-600 to-cyan-600'
};

/**
 * Show a toast notification. The message is treated as plain text.
 * Returns the toast element so callers can dismiss it early.
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer') || createToastContainer();
    const kind = TOAST_ICONS[type] ? type : 'info';

    const toast = document.createElement('div');
    toast.className = `toast toast-${kind} animate-slide-up`;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
        <div class="flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${TOAST_COLORS[kind]} text-white rounded-xl shadow-2xl">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">${TOAST_ICONS[kind]}</svg>
            <span class="font-medium">${escapeHTML(message)}</span>
        </div>
    `;

    container.appendChild(toast);

    const dismiss = () => {
        toast.classList.add('animate-fade-out');
        setTimeout(() => toast.remove(), 300);
    };
    toast.dismiss = dismiss;
    if (duration > 0) setTimeout(dismiss, duration);
    return toast;
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
    return container;
}

/**
 * Show an inline playback error inside the player, with an optional retry action.
 */
export function showPlayerError(message, { onRetry } = {}) {
    const customPlayer = document.getElementById('custom-player');
    if (!customPlayer) return null;

    customPlayer.querySelectorAll('.player-error').forEach(el => el.remove());

    const errorDiv = document.createElement('div');
    errorDiv.className = 'player-error bg-red-800 bg-opacity-20 border-2 border-red-900 rounded-lg p-4 mb-4 animate-slide-up';
    errorDiv.setAttribute('role', 'alert');
    errorDiv.innerHTML = `
        <div class="flex items-start gap-3">
            <svg class="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div class="flex-1 min-w-0">
                <h4 class="text-red-400 font-semibold mb-1">Playback Error</h4>
                <p class="text-gray-300 text-sm">${escapeHTML(message)}</p>
                <div class="mt-3 flex gap-2">
                    ${onRetry ? '<button type="button" class="player-error-retry px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-lg transition-colors">Retry chapter</button>' : ''}
                    <button type="button" class="player-error-dismiss px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-semibold rounded-lg transition-colors">Dismiss</button>
                </div>
            </div>
        </div>
    `;

    errorDiv.querySelector('.player-error-dismiss').addEventListener('click', () => errorDiv.remove());
    const retryButton = errorDiv.querySelector('.player-error-retry');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            errorDiv.remove();
            onRetry();
        });
    }

    customPlayer.insertBefore(errorDiv, customPlayer.firstChild);
    return errorDiv;
}

/**
 * Copy text to the clipboard; resolves to true on success.
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        console.error('Copy failed:', error);
        return false;
    }
}
