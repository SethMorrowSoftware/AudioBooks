// Mocked Archive.org responses for headless verification.
// Shapes follow documented Archive.org API behaviour: multi-valued fields arrive as arrays,
// the metadata "files" list mixes originals, derivatives and non-audio files.

export const BOOK_ID = 'pride_prejudice_test';
export const TOTAL_RESULTS = 60;
export const ROWS = 24;

const GENRES = ['Fiction', 'Romance', 'Adventure', 'History', 'Poetry', 'Science fiction'];

export function searchDoc(i) {
  const n = i + 1;
  const doc = {
    identifier: i === 0 ? BOOK_ID : `book_${n}`,
    title: `Book ${n}`,
    creator: `Author ${n}`,
    year: String(2005 + (n % 20)),
    date: `${2005 + (n % 20)}-01-0${(n % 9) + 1}T00:00:00Z`,
    language: 'English',
    runtime: `${n}:12:34`,
    subject: [GENRES[n % GENRES.length], 'Audiobook', 'A very long subject name that exceeds twenty characters'],
    description: '<p>Description that is never rendered on the search page but costs bandwidth.</p>'
  };
  if (i === 0) {
    doc.title = 'Pride and "Prejudice" & Others';
    doc.creator = ['Jane Austen', 'Karen Savage'];
    doc.language = ['English', 'French'];
  }
  if (i === 1) {
    // Stored-XSS probe: community metadata containing markup.
    doc.title = 'Evil <img src=x onerror="window.__xssTitle=1"> Book';
    doc.creator = 'Mallory <b>Bold</b>';
    doc.subject = ['Fiction"><img src=x onerror="window.__xssSubject=1">'];
  }
  if (i === 2) {
    delete doc.year; delete doc.date; delete doc.runtime; delete doc.creator;
    doc.subject = 'single string subject';
  }
  return doc;
}

export function searchResponse(page, rows = ROWS) {
  const start = (page - 1) * rows;
  const docs = [];
  for (let i = start; i < Math.min(start + rows, TOTAL_RESULTS); i++) docs.push(searchDoc(i));
  return {
    responseHeader: { status: 0, QTime: 12, params: { query: 'mock', rows: String(rows), start } },
    response: { numFound: TOTAL_RESULTS, start, docs }
  };
}

export function searchErrorResponse() {
  return { error: "org.apache.lucene.queryParser.ParseException: Cannot parse 'collection:(librivoxaudio) AND ((': Encountered \"<EOF>\"" };
}

function chapterFiles(n, { oldStyle }) {
  const base = `pp_0${n}_austen`;
  const title = n === 3 ? `0${n} - Chapter ${n} <b>bold</b> & "quoted"` : `0${n} - Chapter ${n}`;
  const track = n === 4 ? '4/5' : String(n);
  const files = [];
  if (oldStyle) {
    files.push({ name: `${base}_128kb.mp3`, source: 'original', format: '128Kbps MP3', title, track, length: '600.12', size: '9600000' });
    files.push({ name: `${base}_64kb.mp3`, source: 'derivative', original: `${base}_128kb.mp3`, format: '64Kbps MP3', length: '600.12', size: '4800000' });
  } else {
    files.push({ name: `${base}_64kb.mp3`, source: 'original', format: '64Kbps MP3', title, track, length: '600.12', size: '4800000' });
  }
  files.push({ name: `${base}.ogg`, source: 'derivative', original: oldStyle ? `${base}_128kb.mp3` : `${base}_64kb.mp3`, format: 'Ogg Vorbis', length: '600.12', size: '4000000' });
  files.push({ name: `${base}_spectrogram.png`, source: 'derivative', original: oldStyle ? `${base}_128kb.mp3` : `${base}_64kb.mp3`, format: 'Spectrogram', size: '30000' });
  files.push({ name: `${base}.png`, source: 'derivative', original: oldStyle ? `${base}_128kb.mp3` : `${base}_64kb.mp3`, format: 'PNG', size: '20000' });
  files.push({ name: `${base}.afpk`, source: 'derivative', original: oldStyle ? `${base}_128kb.mp3` : `${base}_64kb.mp3`, format: 'Columbia Peaks', size: '1000' });
  return files;
}

export function metadataResponse(identifier = BOOK_ID) {
  // Deliberately out of track order (3, 1, 5, 2, 4) to exercise sorting.
  const files = [
    ...chapterFiles(3, { oldStyle: false }),
    ...chapterFiles(1, { oldStyle: false }),
    ...chapterFiles(5, { oldStyle: true }),
    ...chapterFiles(2, { oldStyle: false }),
    ...chapterFiles(4, { oldStyle: true }),
    { name: `${identifier}_meta.xml`, source: 'original', format: 'Metadata', size: '2000' },
    { name: `${identifier}_files.xml`, source: 'original', format: 'Metadata', size: '2000' },
    { name: `${identifier}_reviews.xml`, source: 'original', format: 'Metadata', size: '200' },
    { name: `${identifier}_archive.torrent`, source: 'metadata', format: 'Archive BitTorrent', size: '5000' },
    { name: `${identifier}_64kb.m3u`, source: 'derivative', format: '64Kbps M3U', size: '300' },
    { name: `${identifier}_64kb_mp3.zip`, source: 'derivative', format: '64Kbps MP3 ZIP', size: '24000000' },
    { name: `${identifier}_vbr_mp3.zip`, source: 'derivative', format: 'VBR MP3 ZIP', size: '24000000' },
    { name: `${identifier}.jpg`, source: 'original', format: 'JPEG', size: '50000' },
    { name: '__ia_thumb.jpg', source: 'original', format: 'Item Tile', size: '5000' },
  ];
  return {
    created: 1700000000,
    d1: 'ia800000.us.archive.org',
    dir: `/1/items/${identifier}`,
    files,
    files_count: files.length,
    item_size: 100000000,
    metadata: {
      identifier,
      title: 'Pride and Prejudice',
      creator: ['Jane Austen', 'Karen Savage'],
      reader: 'Karen Savage',
      description: '<p>Pride and Prejudice is a novel by <b>Jane Austen</b>. Read more at <a href="https://librivox.org/pride-and-prejudice">LibriVox</a>.<br><img src=x onerror="window.__xssDesc=1"><script>window.__xssScript=1</script> Summary by Wikipedia.</p>',
      notes: 'Note with <i>markup</i> and "quotes"',
      language: ['English', 'French'],
      date: '2010-05-03',
      year: '2010',
      runtime: '11:35:22',
      subject: ['Fiction', 'Romance', 'librivox', 'audiobook'],
      licenseurl: 'http://creativecommons.org/publicdomain/zero/1.0/',
      mediatype: 'audio',
      collection: ['librivoxaudio', 'librivox']
    },
    server: 'ia800000.us.archive.org',
    uniq: 1,
    workable_servers: ['ia800000.us.archive.org']
  };
}
