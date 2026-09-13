import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, escapeHTML, shuffleArray } from '../utils.js';

test('formatTime handles minutes, hours and bad input', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(65), '1:05');
    assert.equal(formatTime(3599.9), '59:59');
    assert.equal(formatTime(3600), '1:00:00');
    assert.equal(formatTime(45296), '12:34:56');
    assert.equal(formatTime(NaN), '0:00');
    assert.equal(formatTime(-5), '0:00');
    assert.equal(formatTime(undefined), '0:00');
});

test('escapeHTML neutralises markup and attribute breakouts', () => {
    assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(escapeHTML(`Tom & Jerry's "quote"`), 'Tom &amp; Jerry&#39;s &quot;quote&quot;');
    assert.equal(escapeHTML(null), '');
    assert.equal(escapeHTML(42), '42');
});

test('shuffleArray returns a permutation without mutating its input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffleArray(input);
    assert.deepEqual(input, [1, 2, 3, 4, 5]);
    assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
});
