import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../storage.js';

test('storage works without localStorage (falls back to memory)', () => {
    assert.equal(typeof globalThis.localStorage, 'undefined');
    assert.equal(storage.getSelectedCategory(), 'AllLibriVox');
    storage.setSelectedCategory('Romance');
    assert.equal(storage.getSelectedCategory(), 'Romance');
});

test('recently viewed keeps the newest entry first and caps the list', () => {
    storage.clearAll();
    for (let i = 0; i < 12; i++) storage.updateRecentlyViewed({ identifier: `book_${i}`, title: `Book ${i}`, author: 'A' });
    const list = storage.getRecentlyViewed();
    assert.equal(list.length, 8);
    assert.equal(list[0].identifier, 'book_11');
    storage.updateRecentlyViewed({ identifier: 'book_5', title: 'Book 5' });
    assert.equal(storage.getRecentlyViewed()[0].identifier, 'book_5');
    assert.equal(storage.getRecentlyViewed().filter(e => e.identifier === 'book_5').length, 1);
    storage.updateRecentlyViewed(null);
    storage.updateRecentlyViewed({ title: 'no id' });
    assert.equal(storage.getRecentlyViewed().length, 8);
});

function stubStorage({ throwOnSet = () => false, throwOnGet = () => false, data = new Map() } = {}) {
    return {
        data,
        getItem(key) { if (throwOnGet(key)) throw new Error('SecurityError'); return data.has(key) ? data.get(key) : null; },
        setItem(key, value) { if (throwOnSet(key, value)) throw new Error('QuotaExceededError'); data.set(key, String(value)); },
        removeItem(key) { data.delete(key); }
    };
}

async function freshStorage(stub, tag) {
    globalThis.localStorage = stub;
    try {
        return (await import(`../storage.js?instance=${tag}`)).storage;
    } finally {
        delete globalThis.localStorage;
    }
}

test('a localStorage that throws on every access falls back to memory without breaking', async () => {
    const stub = stubStorage({ throwOnSet: () => true, throwOnGet: () => true });
    const s = await freshStorage(stub, 'throwing');
    globalThis.localStorage = stub;
    try {
        s.setSelectedCategory('Poetry');
        assert.equal(s.getSelectedCategory(), 'Poetry');
        s.setProgress('b', { track: 1, time: 9 });
        assert.equal(s.getProgress('b').track, 1);
    } finally {
        delete globalThis.localStorage;
    }
});

test('a failed persistent write keeps the newer value readable', async () => {
    let full = false;
    const stub = stubStorage({ throwOnSet: () => full });
    const s = await freshStorage(stub, 'quota');
    globalThis.localStorage = stub;
    try {
        s.setProgress('a', { track: 0, time: 1 });
        assert.equal(s.getProgress('a').time, 1);
        full = true;
        s.setProgress('a', { track: 2, time: 50 });
        assert.equal(s.getProgress('a').track, 2, 'memory fallback wins after the failed write');
        full = false;
        s.setProgress('a', { track: 3, time: 60 });
        assert.equal(JSON.parse(stub.data.get('librivox_progress')).a.track, 3, 'persisted again once writes succeed');
    } finally {
        delete globalThis.localStorage;
    }
});

test('corrupt JSON in storage is discarded', async () => {
    const stub = stubStorage();
    stub.data.set('librivox_progress', '{not json');
    stub.data.set('librivox_recentlyViewed', '"a string"');
    const s = await freshStorage(stub, 'corrupt');
    globalThis.localStorage = stub;
    try {
        assert.deepEqual(s.getAllProgress(), {});
        assert.equal(stub.data.has('librivox_progress'), false);
        assert.deepEqual(s.getRecentlyViewed(), []);
    } finally {
        delete globalThis.localStorage;
    }
});

test('two tabs sharing localStorage do not clobber each other\'s progress', async () => {
    const stub = stubStorage();
    const a = await freshStorage(stub, 'tabA');
    const b = await freshStorage(stub, 'tabB');
    globalThis.localStorage = stub;
    try {
        a.setProgress('bookA', { track: 1, time: 10 });
        b.setProgress('bookB', { track: 2, time: 20 });
        a.setProgress('bookA', { track: 1, time: 15 });
        assert.equal(a.getProgress('bookB').track, 2, 'tab A sees tab B\'s book');
        assert.equal(b.getProgress('bookA').time, 15, 'tab B sees tab A\'s latest position');
    } finally {
        delete globalThis.localStorage;
    }
});

test('progress and player preferences are validated on the way out', () => {
    storage.clearAll();
    assert.equal(storage.getProgress('x'), null);
    storage.setProgress('x', { track: 3, time: 12.5, chapters: 10 });
    assert.deepEqual({ ...storage.getProgress('x'), updatedAt: 0 }, { track: 3, time: 12.5, chapters: 10, updatedAt: 0 });
    storage.setProgress('x', { track: -1, time: 'bad' });
    assert.deepEqual({ ...storage.getProgress('x'), updatedAt: 0 }, { track: 0, time: 0, chapters: 0, updatedAt: 0 });
    storage.clearProgress('x');
    assert.equal(storage.getProgress('x'), null);

    assert.deepEqual(storage.getPlayerPrefs(), { playbackRate: 1, volume: 1 });
    storage.setPlayerPrefs({ playbackRate: 1.5 });
    assert.deepEqual(storage.getPlayerPrefs(), { playbackRate: 1.5, volume: 1 });
    storage.setPlayerPrefs({ volume: 0.25 });
    assert.deepEqual(storage.getPlayerPrefs(), { playbackRate: 1.5, volume: 0.25 });
    storage.setPlayerPrefs({ playbackRate: 99, volume: -1 });
    assert.deepEqual(storage.getPlayerPrefs(), { playbackRate: 1, volume: 1 });
});
