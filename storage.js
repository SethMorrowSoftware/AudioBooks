/**
 * storage.js - Persistence for the LibriVox Audiobooks app.
 *
 * localStorage can throw (Safari private mode, storage disabled, quota),
 * and this module is imported by both pages, so every access is guarded
 * and falls back to an in-memory store instead of taking the app down.
 */

const PREFIX = 'librivox_';
const KEYS = {
    recentlyViewed: PREFIX + 'recentlyViewed',
    selectedCategory: PREFIX + 'selectedCategory',
    progress: PREFIX + 'progress',
    playerPrefs: PREFIX + 'playerPrefs'
};

const MAX_RECENT = 8;
const MAX_PROGRESS_ENTRIES = 200;

const memory = new Map();
let backend; // undefined = not probed yet, null = unavailable

function getBackend() {
    if (backend !== undefined) return backend;
    try {
        const store = globalThis.localStorage;
        if (!store) { backend = null; return backend; }
        const probe = PREFIX + '__probe__';
        store.setItem(probe, '1');
        store.removeItem(probe);
        backend = store;
    } catch {
        backend = null;
    }
    return backend;
}

function readRaw(key) {
    const store = getBackend();
    try {
        if (store) return store.getItem(key);
    } catch { /* fall through to memory */ }
    return memory.has(key) ? memory.get(key) : null;
}

function writeRaw(key, value) {
    memory.set(key, value);
    const store = getBackend();
    if (!store) return;
    try {
        store.setItem(key, value);
    } catch (e) {
        console.warn('Could not persist', key, e);
    }
}

function removeRaw(key) {
    memory.delete(key);
    const store = getBackend();
    if (!store) return;
    try { store.removeItem(key); } catch { /* ignore */ }
}

function readJSON(key, fallback) {
    const raw = readRaw(key);
    if (raw === null || raw === undefined) return fallback;
    try {
        const parsed = JSON.parse(raw);
        return parsed === null ? fallback : parsed;
    } catch {
        removeRaw(key);
        return fallback;
    }
}

function writeJSON(key, value) {
    writeRaw(key, JSON.stringify(value));
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

class StorageManager {
    /** @returns {Array<{identifier: string, title: string, author: string, updatedAt: number}>} */
    getRecentlyViewed() {
        const list = readJSON(KEYS.recentlyViewed, []);
        if (!Array.isArray(list)) return [];
        return list.filter(entry => isPlainObject(entry) && typeof entry.identifier === 'string');
    }

    updateRecentlyViewed(audiobook) {
        if (!audiobook || typeof audiobook.identifier !== 'string') return this.getRecentlyViewed();
        const entry = {
            identifier: audiobook.identifier,
            title: typeof audiobook.title === 'string' && audiobook.title ? audiobook.title : 'Unknown Audiobook',
            author: typeof audiobook.author === 'string' ? audiobook.author : '',
            updatedAt: Date.now()
        };
        const list = this.getRecentlyViewed().filter(item => item.identifier !== entry.identifier);
        list.unshift(entry);
        writeJSON(KEYS.recentlyViewed, list.slice(0, MAX_RECENT));
        return list;
    }

    getSelectedCategory() {
        const value = readRaw(KEYS.selectedCategory);
        return typeof value === 'string' && value ? value : 'AllLibriVox';
    }

    setSelectedCategory(category) {
        if (typeof category === 'string') writeRaw(KEYS.selectedCategory, category);
    }

    /** All saved listening positions keyed by identifier. */
    getAllProgress() {
        const map = readJSON(KEYS.progress, {});
        return isPlainObject(map) ? map : {};
    }

    /** @returns {{track: number, time: number, chapters: number, updatedAt: number} | null} */
    getProgress(identifier) {
        const entry = this.getAllProgress()[identifier];
        if (!isPlainObject(entry)) return null;
        const track = Number(entry.track);
        const time = Number(entry.time);
        if (!Number.isInteger(track) || track < 0 || !Number.isFinite(time) || time < 0) return null;
        return { track, time, chapters: Number(entry.chapters) || 0, updatedAt: Number(entry.updatedAt) || 0 };
    }

    setProgress(identifier, { track, time, chapters }) {
        if (typeof identifier !== 'string' || !identifier) return;
        const map = this.getAllProgress();
        map[identifier] = {
            track: Math.max(0, Math.floor(Number(track) || 0)),
            time: Math.max(0, Number(time) || 0),
            chapters: Math.max(0, Math.floor(Number(chapters) || 0)),
            updatedAt: Date.now()
        };
        const entries = Object.entries(map).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
        writeJSON(KEYS.progress, Object.fromEntries(entries.slice(0, MAX_PROGRESS_ENTRIES)));
    }

    clearProgress(identifier) {
        const map = this.getAllProgress();
        if (identifier in map) {
            delete map[identifier];
            writeJSON(KEYS.progress, map);
        }
    }

    /** @returns {{playbackRate: number, volume: number}} */
    getPlayerPrefs() {
        const prefs = readJSON(KEYS.playerPrefs, {});
        const rate = Number(prefs.playbackRate);
        const volume = Number(prefs.volume);
        return {
            playbackRate: Number.isFinite(rate) && rate >= 0.5 && rate <= 3 ? rate : 1,
            volume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1
        };
    }

    setPlayerPrefs(partial) {
        if (!isPlainObject(partial)) return;
        writeJSON(KEYS.playerPrefs, { ...this.getPlayerPrefs(), ...partial });
    }

    clearAll() {
        Object.values(KEYS).forEach(removeRaw);
    }
}

export const storage = new StorageManager();
