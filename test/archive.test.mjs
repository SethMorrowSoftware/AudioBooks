import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    asList, joinValues, firstValue, isValidIdentifier,
    sanitizeUserQuery, normalizeYear, buildSearchQuery, buildSearchUrl, parseSearchResponse,
    metadataUrl, downloadUrl, coverUrl, parseMetadataResponse,
    parseTrackNumber, parseLength, chapterStem, prettifyFileName, isAudioFile, selectAudioFiles
} from '../archive.js';

test('asList / joinValues / firstValue normalise scalar and array fields', () => {
    assert.deepEqual(asList(undefined), []);
    assert.deepEqual(asList('Jane Austen'), ['Jane Austen']);
    assert.deepEqual(asList(['Jane Austen', '', null, 'Karen Savage']), ['Jane Austen', 'Karen Savage']);
    assert.equal(joinValues(['English', 'French']), 'English, French');
    assert.equal(joinValues(2010), '2010');
    assert.equal(firstValue([], 'Unknown'), 'Unknown');
    assert.equal(firstValue(['A', 'B']), 'A');
});

test('identifiers are validated before being placed in URLs', () => {
    assert.equal(isValidIdentifier('pride_and_prejudice_librivox'), true);
    assert.equal(isValidIdentifier('a.b-c_1'), true);
    assert.equal(isValidIdentifier(''), false);
    assert.equal(isValidIdentifier('../etc'), false);
    assert.equal(isValidIdentifier('x y'), false);
    assert.equal(isValidIdentifier('<script>'), false);
});

test('sanitizeUserQuery balances quotes and parentheses and strips Lucene syntax', () => {
    assert.equal(sanitizeUserQuery('austen (('), 'austen');
    assert.equal(sanitizeUserQuery('"Pride and Prejudice'), 'Pride and Prejudice');
    assert.equal(sanitizeUserQuery('"Pride and Prejudice"'), '"Pride and Prejudice"');
    assert.equal(sanitizeUserQuery('(austen OR dickens)'), '(austen OR dickens)');
    assert.equal(sanitizeUserQuery('austen AND'), 'austen');
    assert.equal(sanitizeUserQuery('AND'), '');
    assert.equal(sanitizeUserQuery('Pride and'), 'Pride and');
    assert.equal(sanitizeUserQuery('a[b]{c}\\d^e~f/g'), 'a b c d e f g');
    assert.equal(sanitizeUserQuery('   '), '');
});

test('normalizeYear accepts four-digit years only', () => {
    assert.equal(normalizeYear('1900'), 1900);
    assert.equal(normalizeYear(' 2024 '), 2024);
    assert.equal(normalizeYear(''), null);
    assert.equal(normalizeYear('19'), null);
    assert.equal(normalizeYear('abcd'), null);
});

test('buildSearchQuery adds no year clause unless the user typed one', () => {
    const config = { query: 'collection:(librivoxaudio)' };
    assert.equal(buildSearchQuery({ category: 'AllLibriVox', config }), 'collection:(librivoxaudio)');
    assert.equal(buildSearchQuery({ category: 'AllLibriVox', config, yearFrom: '1900' }), 'collection:(librivoxaudio) AND year:[1900 TO *]');
    assert.equal(buildSearchQuery({ category: 'AllLibriVox', config, yearTo: '1950' }), 'collection:(librivoxaudio) AND year:[* TO 1950]');
    assert.equal(buildSearchQuery({ category: 'AllLibriVox', config, yearFrom: '1950', yearTo: '1900' }), 'collection:(librivoxaudio) AND year:[1900 TO 1950]');
});

test('buildSearchQuery handles search modes, category queries and filters', () => {
    assert.equal(buildSearchQuery({ category: 'Author_Search', query: 'Jane Austen' }), 'collection:(librivoxaudio) AND creator:(Jane Austen)');
    assert.equal(buildSearchQuery({ category: 'Title_Search', query: 'Emma' }), 'collection:(librivoxaudio) AND title:(Emma)');
    assert.equal(buildSearchQuery({ category: 'Custom', query: 'creator:austen' }), 'collection:(librivoxaudio) AND (creator:austen)');
    assert.equal(buildSearchQuery({ category: 'Author_Search', query: '' }), 'collection:(librivoxaudio)');
    const romance = { query: 'collection:(librivoxaudio) AND subject:(romance)' };
    assert.equal(
        buildSearchQuery({ category: 'Romance', config: romance, query: 'emma', filters: ['solo', 'english', 'bogus'] }),
        'collection:(librivoxaudio) AND subject:(romance) AND (emma) AND subject:(solo) AND language:(English)'
    );
});

test('buildSearchUrl encodes the query and requests only the fields that are rendered', () => {
    const url = new URL(buildSearchUrl('collection:(librivoxaudio) AND (a "b")', { rows: 24, page: 2 }));
    assert.equal(url.origin + url.pathname, 'https://archive.org/advancedsearch.php');
    assert.equal(url.searchParams.get('q'), 'collection:(librivoxaudio) AND (a "b")');
    assert.equal(url.searchParams.get('rows'), '24');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.get('output'), 'json');
    assert.equal(url.searchParams.get('sort[]'), 'downloads desc');
    const fields = url.searchParams.getAll('fl[]');
    assert.ok(fields.includes('identifier') && fields.includes('title'));
    assert.ok(!fields.includes('description'), 'description is never rendered on the search page');
});

test('parseSearchResponse surfaces Archive.org error payloads', () => {
    assert.throws(() => parseSearchResponse({ error: 'ParseException' }), /rejected the query/);
    assert.throws(() => parseSearchResponse(null));
    assert.throws(() => parseSearchResponse({ response: {} }));
    assert.deepEqual(parseSearchResponse({ response: { numFound: '2', docs: [{ identifier: 'a' }] } }), { docs: [{ identifier: 'a' }], numFound: 2 });
});

test('item URLs are encoded', () => {
    assert.equal(metadataUrl('abc'), 'https://archive.org/metadata/abc');
    assert.equal(downloadUrl('abc', 'a b#1.mp3'), 'https://archive.org/download/abc/a%20b%231.mp3');
    assert.equal(downloadUrl('abc', 'dir/one.mp3'), 'https://archive.org/download/abc/dir/one.mp3');
    assert.equal(coverUrl('abc'), 'https://archive.org/services/img/abc');
});

test('parseMetadataResponse rejects the empty object Archive.org returns for missing items', () => {
    assert.throws(() => parseMetadataResponse({}), /could not be found/);
    assert.deepEqual(parseMetadataResponse({ metadata: { title: 'x' } }), { metadata: { title: 'x' }, files: [] });
});

test('track numbers and lengths are parsed from the formats Archive.org uses', () => {
    assert.equal(parseTrackNumber('01'), 1);
    assert.equal(parseTrackNumber('4/5'), 4);
    assert.equal(parseTrackNumber(7), 7);
    assert.equal(parseTrackNumber(undefined), null);
    assert.equal(parseTrackNumber('n/a'), null);
    assert.equal(parseLength('600.12'), 600.12);
    assert.equal(parseLength('12:34'), 754);
    assert.equal(parseLength('1:02:03'), 3723);
    assert.equal(parseLength(''), null);
});

test('chapterStem and prettifyFileName strip extensions and bitrate suffixes', () => {
    assert.equal(chapterStem('pp_01_austen_64kb.mp3'), 'pp_01_austen');
    assert.equal(chapterStem('pp_01_austen.ogg'), 'pp_01_austen');
    assert.equal(chapterStem('PP_01_austen_VBR.mp3'), 'pp_01_austen');
    assert.equal(prettifyFileName('pp_01_austen_64kb.mp3'), 'pp 01 austen');
});

test('isAudioFile keeps playable audio and drops packaging, images and metadata', () => {
    assert.equal(isAudioFile({ name: 'a_64kb.mp3', format: '64Kbps MP3' }), true);
    assert.equal(isAudioFile({ name: 'a.ogg', format: 'Ogg Vorbis' }), true);
    assert.equal(isAudioFile({ name: 'a.mp3' }), true);
    assert.equal(isAudioFile({ name: 'a_64kb_mp3.zip', format: '64Kbps MP3 ZIP' }), false);
    assert.equal(isAudioFile({ name: 'a_64kb.m3u', format: '64Kbps M3U' }), false);
    assert.equal(isAudioFile({ name: 'a_spectrogram.png', format: 'Spectrogram' }), false);
    assert.equal(isAudioFile({ name: 'a_meta.xml', format: 'Metadata' }), false);
    assert.equal(isAudioFile({ name: 'a.mp3', format: 'Metadata' }), false);
    assert.equal(isAudioFile({ format: 'VBR MP3' }), false);
});

function chapter(n, { oldStyle = false } = {}) {
    const base = `pp_0${n}_austen`;
    const original = oldStyle ? `${base}_128kb.mp3` : `${base}_64kb.mp3`;
    const files = [];
    if (oldStyle) {
        files.push({ name: `${base}_128kb.mp3`, source: 'original', format: '128Kbps MP3', title: `Chapter ${n}`, track: String(n), length: '600' });
        files.push({ name: `${base}_64kb.mp3`, source: 'derivative', original, format: '64Kbps MP3', length: '600' });
    } else {
        files.push({ name: `${base}_64kb.mp3`, source: 'original', format: '64Kbps MP3', title: `Chapter ${n}`, track: String(n), length: '600' });
    }
    files.push({ name: `${base}.ogg`, source: 'derivative', original, format: 'Ogg Vorbis', length: '600' });
    files.push({ name: `${base}_spectrogram.png`, source: 'derivative', original, format: 'Spectrogram' });
    files.push({ name: `${base}.png`, source: 'derivative', original, format: 'PNG' });
    return files;
}

test('selectAudioFiles keeps exactly one file per chapter, preferring the original MP3, sorted by track', () => {
    const files = [
        ...chapter(3), ...chapter(1), ...chapter(5, { oldStyle: true }), ...chapter(2), ...chapter(4, { oldStyle: true }),
        { name: 'x_meta.xml', source: 'original', format: 'Metadata' },
        { name: 'x_64kb_mp3.zip', source: 'derivative', format: '64Kbps MP3 ZIP' },
        { name: 'x.jpg', source: 'original', format: 'JPEG' }
    ];
    const chapters = selectAudioFiles(files);
    assert.deepEqual(chapters.map(c => c.track), [1, 2, 3, 4, 5]);
    assert.deepEqual(chapters.map(c => c.title), ['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5']);
    assert.deepEqual(chapters.map(c => c.name), ['pp_01_austen_64kb.mp3', 'pp_02_austen_64kb.mp3', 'pp_03_austen_64kb.mp3', 'pp_04_austen_128kb.mp3', 'pp_05_austen_128kb.mp3']);
    assert.equal(chapters[0].length, 600);
});

test('selectAudioFiles falls back to Ogg only when no MP3 exists and to name order without track numbers', () => {
    const chapters = selectAudioFiles([
        { name: 'b_part2.ogg', format: 'Ogg Vorbis', source: 'original' },
        { name: 'b_part10.ogg', format: 'Ogg Vorbis', source: 'original' },
        { name: 'b_part1.ogg', format: 'Ogg Vorbis', source: 'original' }
    ]);
    assert.deepEqual(chapters.map(c => c.name), ['b_part1.ogg', 'b_part2.ogg', 'b_part10.ogg']);
    assert.deepEqual(chapters.map(c => c.title), ['b part1', 'b part2', 'b part10']);
    assert.deepEqual(selectAudioFiles(null), []);
    assert.deepEqual(selectAudioFiles([{ name: 'only.zip', format: 'ZIP' }]), []);
});

test('selectAudioFiles gives derivative-only chapters a title even when only the original carried metadata', () => {
    const chapters = selectAudioFiles([
        { name: 'c_01_64kb.mp3', source: 'original', format: '64Kbps MP3', title: 'One', track: '1' },
        { name: 'c_01.ogg', source: 'derivative', original: 'c_01_64kb.mp3', format: 'Ogg Vorbis' },
        { name: 'c_02.ogg', source: 'derivative', original: 'c_02_64kb.mp3', format: 'Ogg Vorbis' }
    ]);
    assert.deepEqual(chapters.map(c => [c.name, c.title, c.track]), [['c_01_64kb.mp3', 'One', 1], ['c_02.ogg', 'c 02', null]]);
});
