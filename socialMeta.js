/**
 * socialMeta.js - Open Graph / Twitter / JSON-LD metadata for the player page.
 */

function setMetaTag(property, content, attr = 'property') {
    if (!content) return;
    let meta = document.head.querySelector(`meta[${attr}="${property}"]`);
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, property);
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
}

function plainText(html, maxLength = 200) {
    // DOMParser documents are inert: nothing in the markup loads or runs.
    const doc = new DOMParser().parseFromString(`<body>${String(html ?? '')}</body>`, 'text/html');
    const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

/**
 * Canonical share URL for a book, optionally pointing at a chapter (1-based).
 */
export function buildShareUrl(identifier, track) {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set('id', identifier);
    if (Number.isInteger(track) && track > 0) url.searchParams.set('track', String(track));
    return url.toString();
}

/**
 * Update the document title, social cards and structured data for an audiobook.
 * @param {{identifier: string, title: string, author: string, narrator?: string, description?: string, coverUrl: string, language?: string}} book
 */
export function updateAudiobookMeta(book) {
    if (!book || !book.identifier) return;
    const title = book.title || 'Audiobook';
    const pageTitle = book.author ? `${title} by ${book.author} - LibriVox Audiobooks` : `${title} - LibriVox Audiobooks`;
    const description = plainText(book.description) || `Listen to ${title}${book.author ? ` by ${book.author}` : ''}, a free public domain audiobook from LibriVox.`;
    const url = buildShareUrl(book.identifier);

    document.title = pageTitle;
    setMetaTag('description', description, 'name');
    setMetaTag('og:type', 'book');
    setMetaTag('og:title', pageTitle);
    setMetaTag('og:description', description);
    setMetaTag('og:url', url);
    setMetaTag('og:image', book.coverUrl);
    setMetaTag('twitter:card', 'summary', 'name');
    setMetaTag('twitter:title', pageTitle, 'name');
    setMetaTag('twitter:description', description, 'name');
    setMetaTag('twitter:image', book.coverUrl, 'name');

    const existing = document.head.querySelector('script[type="application/ld+json"][data-audiobook]');
    if (existing) existing.remove();
    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'Audiobook',
        name: title,
        url,
        image: book.coverUrl,
        isAccessibleForFree: true,
        ...(book.author ? { author: { '@type': 'Person', name: book.author } } : {}),
        ...(book.narrator ? { readBy: { '@type': 'Person', name: book.narrator } } : {}),
        ...(book.language ? { inLanguage: book.language } : {}),
        ...(description ? { description } : {})
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-audiobook', 'true');
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);
}
