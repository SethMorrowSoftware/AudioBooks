import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryConfig, getCategoryConfig, getAllCategories, isSearchMode } from '../categoryConfig.js';

test('every dropdown option has a config entry and every config entry is listed', () => {
    const ids = getAllCategories().flatMap(group => group.options.map(option => option.id));
    assert.deepEqual(ids.filter(id => !(id in categoryConfig)), []);
    assert.deepEqual(Object.keys(categoryConfig).filter(id => !ids.includes(id)), []);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
});

test('lookups fall back safely and search modes are flagged', () => {
    assert.equal(getCategoryConfig('nope'), categoryConfig.AllLibriVox);
    assert.equal(getCategoryConfig('constructor'), categoryConfig.AllLibriVox);
    assert.equal(getCategoryConfig('Romance').title, 'Romance');
    assert.equal(isSearchMode('Author_Search'), true);
    assert.equal(isSearchMode('Custom'), true);
    assert.equal(isSearchMode('Romance'), false);
    assert.equal('yearRange' in categoryConfig.AllLibriVox, false, 'no default year range');
    for (const [id, config] of Object.entries(categoryConfig)) {
        if (config.customSearch) assert.equal(config.query, null, `${id} has no fixed query`);
        else assert.match(config.query, /^collection:\(librivoxaudio\)/, `${id} is scoped to LibriVox`);
    }
});
