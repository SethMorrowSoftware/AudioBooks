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
