// Builds the static site from briefings/*.md into dist/.
// Usage: node scripts/build.mjs   (or: npm run build)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { stripFollowUps, unwrapGoogleRedirects } from './content-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'briefings');
const SITE = join(ROOT, 'site');
const OUT = join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, ''); // e.g. https://julesaitools.github.io/quantum-weekly

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- helpers ----------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
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
      const host = u.hostname.replace(/^www\./, '');
      const path = u.pathname.length > 1 ? '/…' : '';
      return `<a href="${href}">${esc(host + path)}</a>`;
    } catch { return all; }
  });
}

function externalLinks(html) {
  return html.replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" rel="noopener" target="_blank"');
}

function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<\/(p|li|h[1-6]|blockquote|tr)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function excerpt(text, max = 300) {
  const first = text.split('\n').find((l) => l.length > 60) || text;
  if (first.length <= max) return first;
  return first.slice(0, first.lastIndexOf(' ', max)) + ' …';
}

// Headings get an id so sections can be linked to.
function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
function addHeadingIds(html) {
  const seen = new Map();
  return html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, lvl, inner) => {
    let id = slugify(inner) || 'section';
    const n = seen.get(id) || 0;
    seen.set(id, n + 1);
    if (n) id += `-${n + 1}`;
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });
}

// ---------- templates ----------

function layout({ title, description = '', body, depth = 0 }) {
  const base = depth ? '../'.repeat(depth) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<link rel="stylesheet" href="${base}style.css">
<link rel="alternate" type="application/atom+xml" title="Quantum Weekly" href="${base}feed.xml">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='4' fill='%232f5bd3'/><ellipse cx='16' cy='16' rx='13' ry='5' fill='none' stroke='%232f5bd3' stroke-width='2'/><ellipse cx='16' cy='16' rx='13' ry='5' fill='none' stroke='%232f5bd3' stroke-width='2' transform='rotate(60 16 16)'/><ellipse cx='16' cy='16' rx='13' ry='5' fill='none' stroke='%232f5bd3' stroke-width='2' transform='rotate(-60 16 16)'/></svg>">
</head>
<body>
<div class="wrap">
<header class="site-header"><a class="brand" href="${base}./">Quantum Weekly</a></header>
${body}
<footer class="site-footer">A new briefing every Monday · <a href="${base}feed.xml">RSS</a></footer>
</div>
</body>
</html>
`;
}

function indexPage(items) {
  const byYearMonth = new Map();
  for (const it of items) {
    const key = it.date.slice(0, 7);
    if (!byYearMonth.has(key)) byYearMonth.set(key, []);
    byYearMonth.get(key).push(it);
  }
  const groups = [...byYearMonth.entries()].map(([ym, list]) => {
    const [y, m] = ym.split('-').map(Number);
    return `<section class="month">
<h2 class="month-label">${MONTHS[m - 1]} ${y}</h2>
<ol class="list">
${list.map((it) => `<li class="item"><a href="${it.slug}/">
<time datetime="${it.date}">${formatDate(it.date)}</time>
<span class="item-title">${esc(it.period || it.title)}</span>
<span class="item-excerpt">${esc(it.excerpt)}</span>
</a></li>`).join('\n')}
</ol>
</section>`;
  }).join('\n');

  const body = `<main>
<p class="intro">Weekly strategic briefing on quantum technology for Brainport Development. ${items.length} ${items.length === 1 ? 'edition' : 'editions'}.</p>
<form class="search" role="search" onsubmit="return false">
<label for="q" class="visually-hidden">Search the archive</label>
<input id="q" type="search" placeholder="Search all briefings, e.g. &quot;QDNL Brainport Eindhoven&quot;, industrialisation, EuroHPC" autocomplete="off" spellcheck="false">
</form>
<div id="results" class="results" hidden aria-live="polite"></div>
<div id="archive">
${groups || '<p class="empty">No briefings yet.</p>'}
</div>
</main>
<script src="search.js" defer></script>`;
  return layout({ title: 'Quantum Weekly — archive', description: 'Searchable archive of the weekly quantum technology briefing.', body });
}

function briefingPage(it, prev, next) {
  const nav = `<nav class="pager">
${next ? `<a class="newer" href="../${next.slug}/">← ${formatDate(next.date)}</a>` : '<span></span>'}
${prev ? `<a class="older" href="../${prev.slug}/">${formatDate(prev.date)} →</a>` : '<span></span>'}
</nav>`;
  const body = `<main>
<p class="back"><a href="../">← Archive</a></p>
<article class="briefing">
<header>
<time datetime="${it.date}">${formatDate(it.date)}</time>
<h1>${esc(it.title)}</h1>
</header>
<div class="content">
${it.html}
</div>
</article>
${nav}
</main>
<script src="../search.js" defer></script>`;
  return layout({ title: it.title, description: it.excerpt, body, depth: 1 });
}

function atomFeed(items) {
  const base = SITE_URL || '.';
  const updated = items[0] ? `${items[0].date}T08:00:00Z` : new Date().toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Quantum Weekly</title>
<link href="${esc(base)}/"/>
<updated>${updated}</updated>
<id>${esc(base)}/</id>
${items.slice(0, 20).map((it) => `<entry>
<title>${esc(it.title)}</title>
<link href="${esc(base)}/${it.slug}/"/>
<id>${esc(base)}/${it.slug}/</id>
<updated>${it.date}T08:00:00Z</updated>
<summary>${esc(it.excerpt)}</summary>
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
    let html = marked.parse(stripFollowUps(unwrapGoogleRedirects(body)), { gfm: true });
    html = externalLinks(addHeadingIds(prettifyBareLinks(html)));
    const text = htmlToText(html);
    items.push({ slug: file.replace(/\.md$/, ''), ...data, html, text, excerpt: excerpt(text) });
  } catch (e) {
    errors.push(e.message);
  }
}

if (errors.length) {
  console.error('Build failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}

items.sort((a, b) => (a.slug < b.slug ? 1 : -1)); // newest first

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(SITE)) copyFileSync(join(SITE, f), join(OUT, f));

writeFileSync(join(OUT, 'index.html'), indexPage(items));
items.forEach((it, i) => {
  const dir = join(OUT, it.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), briefingPage(it, items[i + 1], items[i - 1]));
});
writeFileSync(join(OUT, 'search-index.json'), JSON.stringify(items.map(({ slug, title, period, date, text }) => ({ slug, title, period, date, text }))));
writeFileSync(join(OUT, 'feed.xml'), atomFeed(items));
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(`Built ${items.length} briefing(s) → dist/`);
