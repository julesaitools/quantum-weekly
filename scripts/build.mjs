// Builds the static site from briefings/*.md into dist/.
// Usage: node scripts/build.mjs   (or: npm run build)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { stripFollowUps, unwrapGoogleRedirects } from './content-rules.mjs';
import { plate } from './plate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'briefings');
const SITE = join(ROOT, 'site');
const OUT = join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, ''); // e.g. https://julesaitools.github.io/quantum-weekly

const FONTS = {
  'fraunces.woff2': '@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2',
  'newsreader.woff2': '@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2',
  'newsreader-italic.woff2': '@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2',
  'plex-mono-400.woff2': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
  'plex-mono-500.woff2': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Words that signal relevance for the Netherlands / Brainport (drives the plate's accent line).
const NL_TERMS = /\b(Netherlands|Dutch|Brainport|Eindhoven|Brabant|Delft|QuTech|TNO|TU\/e|Twente|PhotonDelta|QuantWare|Qblox|QuiX|QDNL|Quantum Delta|Rijks\w*|NWO|RVO|SMART Photonics|Groove Quantum|OrangeQS|High Tech Campus)\b/g;

// ---------- helpers ----------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad2 = (n) => String(n).padStart(2, '0');

function formatDate(iso, withDay = false) {
  const [y, m, d] = iso.split('-').map(Number);
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${withDay ? day + ' ' : ''}${d} ${MONTHS[m - 1]} ${y}`;
}

// Minimal front matter parser: one `key: value` per line (value may be quoted).
function parseFrontMatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter (--- ... ---)`);
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

// A bare URL as link text is ugly: show "domain.com/…" instead of the whole URL.
function prettifyBareLinks(html) {
  return html.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, (all, href, text) => {
    const decoded = text.replace(/&amp;/g, '&');
    if (decoded !== href.replace(/&amp;/g, '&')) return all;
    try {
      const u = new URL(decoded);
      return `<a href="${href}">${esc(u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? '/…' : ''))}</a>`;
    } catch { return all; }
  });
}

const externalLinks = (html) => html.replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" rel="noopener" target="_blank"');

function htmlToText(html) {
  return html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<\/(p|li|h[1-6]|blockquote|tr)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// The essence paragraph, without its bold label ("The essence:").
function essenceOf(html, text) {
  const m = html.match(/<p class="lede">([\s\S]*?)<\/p>/);
  const plain = m ? htmlToText(m[1].replace(/^\s*<strong>[\s\S]*?<\/strong>\s*/, '')) : (text.split('\n').find((l) => l.length > 60) || text);
  return plain.replace(/^[:.\s]+/, '');
}

function clip(s, max) {
  return s.length <= max ? s : s.slice(0, s.lastIndexOf(' ', max)) + ' …';
}

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// Editorial structure on top of the Markdown output.
function shapeContent(html) {
  const seen = new Map();
  const sections = [];
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, lvl, inner) => {
    let id = slugify(inner) || 'section';
    const n = seen.get(id) || 0;
    seen.set(id, n + 1);
    if (n) id += `-${n + 1}`;
    if (lvl === '2') {
      const m = inner.match(/^(\d+)\.\s*([\s\S]*)$/);
      const title = m ? m[2] : inner;
      sections.push({ id, title: htmlToText(title) });
      return `<h2 id="${id}">${m ? `<span class="sec-no">${pad2(m[1])}</span>` : ''}<span class="sec-title">${title}</span></h2>`;
    }
    const m = inner.match(/^(\d+(?:\.\d+)?)\.?\s+([\s\S]*)$/);
    return `<h3 id="${id}">${m ? `<span class="item-no">${m[1]}</span>` : ''}${m ? m[2] : inner}</h3>`;
  });
  // Source/date line directly under an item heading.
  html = html.replace(/(<\/h3>\s*)<p><em>((?:(?!<\/em>)[\s\S])*)<\/em><\/p>/g, '$1<p class="src">$2</p>');
  // Opening italic tagline and the essence paragraph.
  html = html.replace(/^\s*<p><em>((?:(?!<\/em>)[\s\S])*)<\/em><\/p>/, '<p class="dek">$1</p>');
  html = html.replace(/<p><strong>/, '<p class="lede"><strong>');
  html = html.replace(/(<p class="lede"><strong>[^<]*?)\s*[:.]\s*<\/strong>/, '$1</strong>');
  // Method note after the closing rule.
  html = html.replace(/<hr>\s*<p>([\s\S]*?)<\/p>\s*$/, '<footer class="method"><p>$1</p></footer>');
  return { html, sections };
}

function countTopSignals(md) {
  const m = md.match(/^##\s+1\.[^\n]*\n([\s\S]*?)(?=^##\s)/m);
  return m ? (m[1].match(/^###\s/gm) || []).length : 0;
}

// ---------- brand ----------

const MARK = `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16.5" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="20" cy="20" rx="16.5" ry="5.6" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5"/><path d="M20 20 30.2 8.6" stroke="var(--signal)" stroke-width="2.4" stroke-linecap="round"/><circle cx="30.2" cy="8.6" r="3.3" fill="var(--signal)"/><circle cx="20" cy="20" r="1.9" fill="currentColor"/></svg>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#15171F"/><circle cx="20" cy="20" r="13" fill="none" stroke="#EDE7DA" stroke-width="2.2"/><ellipse cx="20" cy="20" rx="13" ry="4.4" fill="none" stroke="#EDE7DA" stroke-width="1.3" opacity=".55"/><path d="M20 20 28 11" stroke="#FF5B2E" stroke-width="2.6" stroke-linecap="round"/><circle cx="28" cy="11" r="3.4" fill="#FF5B2E"/></svg>')}`;

// ---------- templates ----------

function layout({ title, description = '', body, depth = 0, bodyClass = '', ogPath = '' }) {
  const base = depth ? '../'.repeat(depth) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#F3EFE6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101116" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">${SITE_URL ? `\n<meta property="og:url" content="${esc(SITE_URL + '/' + ogPath)}">` : ''}
<link rel="preload" href="${base}fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}fonts/newsreader.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${base}style.css">
<link rel="alternate" type="application/atom+xml" title="Quantum Weekly" href="${base}feed.xml">
<link rel="icon" href="${FAVICON}">
</head>
<body class="${bodyClass}">
${body}
<footer class="colophon">
<div class="wrap colophon-inner">
<a class="brand brand-small" href="${base}./">${MARK}<span>Quantum Weekly</span></a>
<p>Signals from quantum computing, networking, sensing and the supply chain, read for Brainport. Compiled every Monday. Each edition carries a signal plate: one peak per top signal; the orange trace shows how much the edition concerns the Netherlands.</p>
<p class="mono">Set in Fraunces, Newsreader &amp; IBM Plex Mono · <a href="${base}feed.xml">RSS</a></p>
</div>
</footer>
</body>
</html>
`;
}

function relevanceWord(a) { return a >= 0.66 ? 'high' : a >= 0.33 ? 'medium' : 'low'; }
function plateLabel(it) { return `Signal plate No. ${it.no}: ${it.peaks} peaks for ${it.peaks} top signals; Dutch relevance ${relevanceWord(it.accent)}.`; }
function meter(a) {
  const n = Math.round(a * 5);
  return `<span class="meter" title="Dutch relevance: ${relevanceWord(a)}">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(5 - n)}</span>`;
}

function indexPage(items) {
  const [latest, ...rest] = items;
  const featured = latest ? `<section class="featured" aria-label="Latest edition">
<a class="featured-plate" href="${latest.slug}/">${latest.plateLarge}</a>
<div class="featured-text">
<p class="kicker"><span class="dot"></span>Latest · No. ${latest.no} · ${formatDate(latest.date, true)}</p>
<h2 class="featured-title"><a href="${latest.slug}/">${esc(latest.period || latest.title)}</a></h2>
<p class="featured-essence">${esc(clip(latest.essence, 420))}</p>
<p class="featured-meta mono">${latest.peaks} top signals · Dutch relevance ${meter(latest.accent)}</p>
<a class="button" href="${latest.slug}/">Read the briefing <span aria-hidden="true">→</span></a>
</div>
</section>` : '<p class="empty">No briefings yet.</p>';

  const list = rest.map((it) => `<li class="row"><a href="${it.slug}/">
<span class="row-no mono">No. ${pad2(it.no)}</span>
<span class="row-plate">${it.plateSmall}</span>
<span class="row-body">
<time class="mono" datetime="${it.date}">${formatDate(it.date, true)}</time>
<span class="row-title">${esc(it.period || it.title)}</span>
<span class="row-essence">${esc(clip(it.essence, 230))}</span>
</span>
</a></li>`).join('\n');

  const body = `<header class="masthead">
<div class="wrap">
<div class="masthead-top mono"><span>Est. ${MONTHS[Number(items.at(-1)?.date.slice(5, 7) || 9) - 1]} ${items.at(-1)?.date.slice(0, 4) || ''}</span><span>${items.length} editions · every Monday</span></div>
<h1 class="wordmark">${MARK}<span>Quantum <em>Weekly</em></span></h1>
<p class="tagline">Signal over noise in quantum technology — read for Brainport.</p>
</div>
</header>
<main class="wrap">
<form class="search" role="search" onsubmit="return false">
<label for="q" class="visually-hidden">Search the archive</label>
<svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
<input id="q" type="search" placeholder="Search all briefings, e.g. &quot;QDNL Brainport Eindhoven&quot;, industrialisation, EuroHPC" autocomplete="off" spellcheck="false">
<kbd class="mono" aria-hidden="true">/</kbd>
</form>
<div id="results" class="results" hidden aria-live="polite"></div>
<div id="archive">
${featured}
${rest.length ? `<h2 class="list-label mono">The archive</h2>\n<ol class="rows">\n${list}\n</ol>` : ''}
</div>
</main>
<script src="search.js" defer></script>`;
  return layout({ title: 'Quantum Weekly', description: 'Signal over noise in quantum technology — a weekly strategic briefing, read for Brainport.', body, bodyClass: 'home' });
}

function briefingPage(it, older, newer) {
  const nav = `<nav class="pager wrap" aria-label="Other editions">
${older ? `<a class="pager-link older" href="../${older.slug}/"><span class="mono">← No. ${older.no}</span><span>${esc(older.period || older.title)}</span></a>` : '<span></span>'}
${newer ? `<a class="pager-link newer" href="../${newer.slug}/"><span class="mono">No. ${newer.no} →</span><span>${esc(newer.period || newer.title)}</span></a>` : '<span></span>'}
</nav>`;
  const toc = it.sections.length ? `<nav class="toc mono" aria-label="Sections">${it.sections.map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join('')}</nav>` : '';
  const body = `<header class="bar">
<div class="wrap bar-inner">
<a class="brand brand-small" href="../">${MARK}<span>Quantum Weekly</span></a>
<a class="mono back" href="../">All editions</a>
</div>
</header>
<main>
<article class="briefing" id="top">
<header class="hero wrap">
<p class="kicker mono"><span class="dot"></span>No. ${it.no} · ${formatDate(it.date, true)}</p>
<h1>${esc(it.period || it.title)}</h1>
<figure class="hero-plate">
${it.plateWide}
<figcaption class="mono">Signal plate No. ${it.no} — ${it.peaks} peaks for ${it.peaks} top signals · Dutch relevance ${meter(it.accent)}</figcaption>
</figure>
${toc}
</header>
<div class="body wrap">
<div class="content">
${it.html}
</div>
<aside class="side" aria-label="In this edition">
<div class="side-inner">
<p class="side-label mono">In this edition</p>
<ol class="side-toc">${it.sections.map((s, i) => `<li><a href="#${s.id}"><span class="mono">${pad2(i + 1)}</span>${esc(s.title)}</a></li>`).join('')}</ol>
<p class="side-meta mono">No. ${it.no} · ${it.peaks} top signals<br>Dutch relevance ${meter(it.accent)}</p>
<a class="side-top mono" href="#top">↑ Back to top</a>
</div>
</aside>
</div>
</article>
${nav}
</main>
<script src="../search.js" defer></script>`;
  return layout({ title: `${it.title} · No. ${it.no}`, description: clip(it.essence, 200), body, depth: 1, bodyClass: 'article', ogPath: `${it.slug}/` });
}

function notFoundPage() {
  const body = `<main class="wrap notfound">
<p class="kicker mono"><span class="dot"></span>Error 404</p>
<h1>This state collapsed.</h1>
<p>The page you were looking for was not observed here. Try the <a href="./">archive</a> or search it.</p>
</main>`;
  // GitHub Pages serves 404.html from the site root for any missing path: use absolute-ish base.
  return layout({ title: 'Not found · Quantum Weekly', body, bodyClass: 'notfound-page' });
}

function atomFeed(items) {
  const base = SITE_URL || '.';
  const updated = items[0] ? `${items[0].date}T08:00:00Z` : new Date().toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Quantum Weekly</title>
<subtitle>Signal over noise in quantum technology — read for Brainport.</subtitle>
<link href="${esc(base)}/"/>
<updated>${updated}</updated>
<id>${esc(base)}/</id>
${items.slice(0, 20).map((it) => `<entry>
<title>No. ${it.no}: ${esc(it.title)}</title>
<link href="${esc(base)}/${it.slug}/"/>
<id>${esc(base)}/${it.slug}/</id>
<updated>${it.date}T08:00:00Z</updated>
<summary>${esc(clip(it.essence, 300))}</summary>
<content type="html">${esc(it.html)}</content>
</entry>`).join('\n')}
</feed>
`;
}

// ---------- build ----------

const files = readdirSync(SRC).filter((f) => /^\d{4}-\d{2}-\d{2}(-[\w-]+)?\.md$/.test(f)).sort();
const errors = [];
const items = [];

for (const file of files) {
  try {
    const raw = readFileSync(join(SRC, file), 'utf8');
    const { data, body } = parseFrontMatter(raw, file);
    if (!data.title) throw new Error(`${file}: 'title' is missing`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) throw new Error(`${file}: 'date' must be YYYY-MM-DD`);
    if (!file.startsWith(data.date)) throw new Error(`${file}: file name must start with the date (${data.date})`);
    if (body.includes(']]>')) console.warn(`Warning: ${file} contains ']]>' (leftover markup from the email?)`);
    const md = stripFollowUps(unwrapGoogleRedirects(body));
    const shaped = shapeContent(externalLinks(prettifyBareLinks(marked.parse(md, { gfm: true }))));
    const text = htmlToText(shaped.html);
    const words = text.split(/\s+/).length;
    const nlDensity = ((text.match(NL_TERMS) || []).length / words) * 1000;
    items.push({
      slug: file.replace(/\.md$/, ''), ...data,
      html: shaped.html, sections: shaped.sections, text,
      essence: essenceOf(shaped.html, text),
      peaks: Math.min(9, Math.max(3, countTopSignals(md) || 6)),
      // Fixed scale (mentions per 1000 words): 8 → low, 30 → max. Fixed so old plates never change.
      accent: Math.min(1, Math.max(0.1, (nlDensity - 8) / 22)), nlDensity,
    });
  } catch (e) {
    errors.push(e.message);
  }
}

if (errors.length) {
  console.error('Build failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}

// Edition numbers in order of appearance; then newest first.
items.forEach((it, i) => { it.no = i + 1; });
items.sort((a, b) => (a.slug < b.slug ? 1 : -1));
for (const it of items) {
  it.plateLarge = plate(it.slug, { peaks: it.peaks, accent: it.accent, size: 'large', label: plateLabel(it) });
  it.plateWide = plate(it.slug, { peaks: it.peaks, accent: it.accent, size: 'wide', label: plateLabel(it) });
  it.plateSmall = plate(it.slug, { peaks: it.peaks, accent: it.accent, size: 'small', label: plateLabel(it) });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'fonts'), { recursive: true });
for (const f of readdirSync(SITE)) copyFileSync(join(SITE, f), join(OUT, f));
for (const [name, src] of Object.entries(FONTS)) copyFileSync(join(ROOT, 'node_modules', src), join(OUT, 'fonts', name));

writeFileSync(join(OUT, 'index.html'), indexPage(items));
items.forEach((it, i) => {
  const dir = join(OUT, it.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), briefingPage(it, items[i + 1], items[i - 1]));
});
writeFileSync(join(OUT, '404.html'), notFoundPage());
writeFileSync(join(OUT, 'search-index.json'), JSON.stringify(items.map(({ slug, no, title, period, date, text }) => ({ slug, no, title, period, date, text }))));
writeFileSync(join(OUT, 'feed.xml'), atomFeed(items));
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(`Built ${items.length} briefing(s) → dist/`);
for (const it of items) console.log(`  No. ${pad2(it.no)}  ${it.slug}  peaks=${it.peaks}  nl=${it.accent.toFixed(2)} density=${it.nlDensity.toFixed(1)}`);
