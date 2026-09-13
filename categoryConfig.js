// categoryConfig.js - LibriVox audiobook category configuration

export const categoryConfig = {
    // === SPECIAL OPTIONS ===
    'AllLibriVox': {
        query: 'collection:(librivoxaudio)',
        title: 'All LibriVox Audiobooks',
        customSearch: false
    },

    // === FICTION GENRES ===
    'ClassicLiterature': {
        query: 'collection:(librivoxaudio) AND subject:(fiction) AND (subject:(classic) OR subject:(literature))',
        title: 'Classic Literature'
    },
    'Romance': {
        query: 'collection:(librivoxaudio) AND subject:(romance)',
        title: 'Romance'
    },
    'Mystery': {
        query: 'collection:(librivoxaudio) AND (subject:(mystery) OR subject:(detective))',
        title: 'Mystery & Detective'
    },
    'ScienceFiction': {
        query: 'collection:(librivoxaudio) AND subject:("science fiction")',
        title: 'Science Fiction'
    },
    'Fantasy': {
        query: 'collection:(librivoxaudio) AND subject:(fantasy)',
        title: 'Fantasy'
    },
    'Adventure': {
        query: 'collection:(librivoxaudio) AND subject:(adventure)',
        title: 'Adventure'
    },
    'Horror': {
        query: 'collection:(librivoxaudio) AND (subject:(horror) OR subject:(ghost))',
        title: 'Horror & Gothic'
    },
    'ShortStories': {
        query: 'collection:(librivoxaudio) AND subject:("short stories")',
        title: 'Short Stories'
    },
    'Humor': {
        query: 'collection:(librivoxaudio) AND (subject:(humor) OR subject:(humorous))',
        title: 'Humor & Satire'
    },

    // === NON-FICTION ===
    'History': {
        query: 'collection:(librivoxaudio) AND subject:(history)',
        title: 'History'
    },
    'Biography': {
        query: 'collection:(librivoxaudio) AND (subject:(biography) OR subject:(autobiography))',
        title: 'Biography & Memoir'
    },
    'Philosophy': {
        query: 'collection:(librivoxaudio) AND subject:(philosophy)',
        title: 'Philosophy'
    },
    'Science': {
        query: 'collection:(librivoxaudio) AND subject:(science) -subject:(fiction)',
        title: 'Science & Nature'
    },
    'Religion': {
        query: 'collection:(librivoxaudio) AND (subject:(religion) OR subject:(theology))',
        title: 'Religion & Spirituality'
    },
    'Travel': {
        query: 'collection:(librivoxaudio) AND subject:(travel)',
        title: 'Travel & Exploration'
    },
    'Essays': {
        query: 'collection:(librivoxaudio) AND subject:(essays)',
        title: 'Essays & Letters'
    },

    // === POETRY & DRAMA ===
    'Poetry': {
        query: 'collection:(librivoxaudio) AND subject:(poetry)',
        title: 'Poetry'
    },
    'Drama': {
        query: 'collection:(librivoxaudio) AND (subject:(drama) OR subject:(plays))',
        title: 'Drama & Plays'
    },
    'Shakespeare': {
        query: 'collection:(librivoxaudio) AND creator:(Shakespeare)',
        title: 'William Shakespeare'
    },

    // === CHILDREN'S BOOKS ===
    'Childrens': {
        query: 'collection:(librivoxaudio) AND subject:("children\'s literature")',
        title: "Children's Literature"
    },
    'FairyTales': {
        query: 'collection:(librivoxaudio) AND (subject:("fairy tales") OR subject:(folklore))',
        title: 'Fairy Tales & Folklore'
    },

    // === BY AUTHOR (Popular) ===
    'JaneAusten': {
        query: 'collection:(librivoxaudio) AND creator:("Jane Austen")',
        title: 'Jane Austen'
    },
    'CharlesDickens': {
        query: 'collection:(librivoxaudio) AND creator:("Charles Dickens")',
        title: 'Charles Dickens'
    },
    'MarkTwain': {
        query: 'collection:(librivoxaudio) AND creator:("Mark Twain")',
        title: 'Mark Twain'
    },
    'ArthurConanDoyle': {
        query: 'collection:(librivoxaudio) AND creator:("Arthur Conan Doyle")',
        title: 'Arthur Conan Doyle'
    },
    'EdgarAllanPoe': {
        query: 'collection:(librivoxaudio) AND creator:("Edgar Allan Poe")',
        title: 'Edgar Allan Poe'
    },
    'HGWells': {
        query: 'collection:(librivoxaudio) AND creator:("H. G. Wells")',
        title: 'H.G. Wells'
    },
    'JulesVerne': {
        query: 'collection:(librivoxaudio) AND creator:("Jules Verne")',
        title: 'Jules Verne'
    },
    'LouisaMayAlcott': {
        query: 'collection:(librivoxaudio) AND creator:("Louisa May Alcott")',
        title: 'Louisa May Alcott'
    },
    'OscarWilde': {
        query: 'collection:(librivoxaudio) AND creator:("Oscar Wilde")',
        title: 'Oscar Wilde'
    },
    'LFrankBaum': {
        query: 'collection:(librivoxaudio) AND creator:("L. Frank Baum")',
        title: 'L. Frank Baum (Oz Books)'
    },

    // === BY LANGUAGE ===
    'French': {
        query: 'collection:(librivoxaudio) AND language:(French)',
        title: 'French Audiobooks'
    },
    'German': {
        query: 'collection:(librivoxaudio) AND language:(German)',
        title: 'German Audiobooks'
    },
    'Spanish': {
        query: 'collection:(librivoxaudio) AND language:(Spanish)',
        title: 'Spanish Audiobooks'
    },
    'Italian': {
        query: 'collection:(librivoxaudio) AND language:(Italian)',
        title: 'Italian Audiobooks'
    },
    'Russian': {
        query: 'collection:(librivoxaudio) AND language:(Russian)',
        title: 'Russian Audiobooks'
    },

    // === SEARCH OPTIONS ===
    'Author_Search': {
        query: null,
        title: 'Search by Author',
        customSearch: true,
        placeholder: 'Enter author name (e.g., "Jane Austen", "Mark Twain")'
    },
    'Title_Search': {
        query: null,
        title: 'Search by Title',
        customSearch: true,
        placeholder: 'Enter book title'
    },
    'Custom': {
        query: null,
        title: 'Custom Search (All LibriVox)',
        customSearch: true,
        placeholder: 'Search all LibriVox audiobooks'
    }
};

// Get category configuration (unknown ids fall back to the full collection)
export function getCategoryConfig(categoryId) {
    return Object.prototype.hasOwnProperty.call(categoryConfig, categoryId)
        ? categoryConfig[categoryId]
        : categoryConfig['AllLibriVox'];
}

// Search modes that take the text box as their only input
export function isSearchMode(categoryId) {
    const config = getCategoryConfig(categoryId);
    return !!(config && config.customSearch);
}

// Category options for the dropdown, grouped. This is the single source of
// truth for the <select> on index.html, which is rendered from it.
export function getAllCategories() {
    return [
        { group: 'Browse', options: [
            { id: 'AllLibriVox', title: 'All Audiobooks' },
            { id: 'Author_Search', title: 'Search by Author' },
            { id: 'Title_Search', title: 'Search by Title' },
            { id: 'Custom', title: 'Advanced Search' }
        ]},
        { group: 'Fiction Genres', options: [
            { id: 'ClassicLiterature', title: 'Classic Literature' },
            { id: 'Romance', title: 'Romance' },
            { id: 'Mystery', title: 'Mystery & Detective' },
            { id: 'ScienceFiction', title: 'Science Fiction' },
            { id: 'Fantasy', title: 'Fantasy' },
            { id: 'Adventure', title: 'Adventure' },
            { id: 'Horror', title: 'Horror & Gothic' },
            { id: 'ShortStories', title: 'Short Stories' },
            { id: 'Humor', title: 'Humor & Satire' }
        ]},
        { group: 'Non-Fiction', options: [
            { id: 'History', title: 'History' },
            { id: 'Biography', title: 'Biography & Memoir' },
            { id: 'Philosophy', title: 'Philosophy' },
            { id: 'Science', title: 'Science & Nature' },
            { id: 'Religion', title: 'Religion & Spirituality' },
            { id: 'Travel', title: 'Travel & Exploration' },
            { id: 'Essays', title: 'Essays & Letters' }
        ]},
        { group: 'Poetry & Drama', options: [
            { id: 'Poetry', title: 'Poetry' },
            { id: 'Drama', title: 'Drama & Plays' },
            { id: 'Shakespeare', title: 'Shakespeare' }
        ]},
        { group: "Children's Books", options: [
            { id: 'Childrens', title: "Children's Literature" },
            { id: 'FairyTales', title: 'Fairy Tales & Folklore' }
        ]},
        { group: 'Popular Authors', options: [
            { id: 'JaneAusten', title: 'Jane Austen' },
            { id: 'CharlesDickens', title: 'Charles Dickens' },
            { id: 'MarkTwain', title: 'Mark Twain' },
            { id: 'ArthurConanDoyle', title: 'Arthur Conan Doyle' },
            { id: 'EdgarAllanPoe', title: 'Edgar Allan Poe' },
            { id: 'HGWells', title: 'H.G. Wells' },
            { id: 'JulesVerne', title: 'Jules Verne' },
            { id: 'LouisaMayAlcott', title: 'Louisa May Alcott' },
            { id: 'OscarWilde', title: 'Oscar Wilde' },
            { id: 'LFrankBaum', title: 'L. Frank Baum (Oz)' }
        ]},
        { group: 'By Language', options: [
            { id: 'French', title: 'French' },
            { id: 'German', title: 'German' },
            { id: 'Spanish', title: 'Spanish' },
            { id: 'Italian', title: 'Italian' },
            { id: 'Russian', title: 'Russian' }
        ]}
    ];
}
