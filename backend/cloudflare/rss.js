// Dynamic RSS 2.0 serialization for the already-public ishare timeline.
// The Worker queries the existing ShareStore on each request; no static XML,
// polling job, new database, or media-provider URL is involved.
function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
    .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

const publishedAt = seconds => new Date(Number(seconds) * 1000);
const updatedAt = item => Math.max(Number(item.published) || 0, Number(item.updated) || 0);
const concise = (value, length) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);
const titleFor = item => concise(item.caption, 120) || concise(item.media?.[0]?.title, 120) || 'Shared post';

function itemHtml(item, site) {
  const caption = String(item.caption ?? '').trim();
  const paragraphs = caption ? caption.split(/\r?\n\s*\r?\n/).map(part => '<p>' + escapeXml(part).replace(/\r?\n/g, '<br>') + '</p>').join('') : '';
  const media = (item.media || []).map(child => {
    const alt = escapeXml(child.title || (child.kind === 'video' ? 'Video' : 'Image'));
    // All paths are opaque, same-origin public delivery routes. Never include
    // signed Cloudflare image URLs, upstream Stream URLs, or player scripts.
    const id = child.id;
    if (!/^[a-f0-9]{32}$/.test(id)) return '';
    if (child.kind === 'image') return '<figure><img src="' + site + '/i/' + id + '/public" alt="' + alt + '"></figure>';
    if (child.kind === 'video') return '<figure><a href="' + site + '/s/' + id + '"><img src="' + site + '/v/' + id + '/thumbnail" alt="' + alt + '"></a><figcaption>' + alt + '</figcaption></figure>';
    return '';
  }).join('');
  return paragraphs + media;
}

export function renderRss(items, site, { owner = null } = {}) {
  const authorFeed = owner !== null;
  const url = site + (authorFeed ? '/u/' + owner.id + '/rss.xml' : '/rss.xml');
  const pageUrl = site + (authorFeed ? '/u/' + owner.id : '/');
  const title = authorFeed ? owner.displayName + ' — ishare' : 'ishare — Public shares';
  const description = authorFeed ? 'Public posts by ' + owner.displayName : 'Public posts opted into the ishare homepage';
  const entries = items.map(item => {
    const authorId = String(item.author?.id ?? '');
    if (!/^[1-9]\d{0,19}$/.test(authorId)) return '';
    const authorName = item.author.name || item.author.login || 'Publisher ' + authorId;
    const authorUrl = site + '/u/' + authorId;
    const postUrl = site + '/s/' + item.id;
    const categories = [...new Set((item.media || []).map(child => child.kind).filter(kind => ['image', 'video'].includes(kind)))];
    const summary = concise(item.caption, 240) || (item.media || []).map(child => concise(child.title, 80)).filter(Boolean).join(' · ') || 'Shared post';
    return '<item><title>' + escapeXml(titleFor(item)) + '</title>' +
      '<link>' + escapeXml(postUrl) + '</link>' +
      '<guid isPermaLink="true">' + escapeXml(postUrl) + '</guid>' +
      '<pubDate>' + publishedAt(item.published).toUTCString() + '</pubDate>' +
      '<dc:date>' + publishedAt(updatedAt(item)).toISOString() + '</dc:date>' +
      '<dc:creator>' + escapeXml(authorName) + '</dc:creator>' +
      '<atom:link href="' + escapeXml(authorUrl) + '" rel="author" type="text/html"/>' +
      '<description>' + escapeXml(summary) + '</description>' +
      categories.map(kind => '<category>' + escapeXml(kind) + '</category>').join('') +
      '<content:encoded>' + escapeXml(itemHtml(item, site)) + '</content:encoded></item>';
  }).join('');
  const timestamp = items.reduce((latest, item) => Math.max(latest, updatedAt(item)), 0);
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>' +
    '<title>' + escapeXml(title) + '</title><link>' + escapeXml(pageUrl) + '</link>' +
    '<description>' + escapeXml(description) + '</description><language>en</language>' +
    '<atom:link href="' + escapeXml(url) + '" rel="self" type="application/rss+xml"/>' +
    (timestamp ? '<lastBuildDate>' + publishedAt(timestamp).toUTCString() + '</lastBuildDate>' : '') +
    entries + '</channel></rss>';
}
