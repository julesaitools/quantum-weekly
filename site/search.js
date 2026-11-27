// Archive search (index page) and search-term highlighting (briefing page).
(function () {
  'use strict';

  // ---- gedeeld ----

  // Lowercase and strip accents, with a map back to positions in the original text.
  function fold(str) {
    let out = '';
    const map = [];
    for (let i = 0; i < str.length; i++) {
      const f = str[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      for (let k = 0; k < f.length; k++) { out += f[k]; map.push(i); }
    }
    map.push(str.length);
    return { out, map };
  }

  // "quoted phrases" stay whole; everything else is matched per word.
  function parseQuery(q) {
    const terms = [];
    q.replace(/"([^"]+)"|(\S+)/g, function (_, phrase, word) {
      const t = fold((phrase || word).trim()).out;
      if (t) terms.push(t);
    });
    return terms;
  }

  function findAll(hay, needle) {
    const hits = [];
    let i = hay.indexOf(needle);
    while (i !== -1) { hits.push(i); i = hay.indexOf(needle, i + needle.length); }
    return hits;
  }

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDate = (iso) => { const p = iso.split('-').map(Number); return p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + p[0]; };

  // ---- archive page ----

  const input = document.getElementById('q');
  if (input) initSearch();

  function initSearch() {
    const results = document.getElementById('results');
    const archive = document.getElementById('archive');
    let docs = null;
    let loading = null;

    function load() {
      if (!loading) {
        loading = fetch('search-index.json')
          .then((r) => r.json())
          .then((data) => {
            docs = data.map((d) => {
              const f = fold(d.text);
              return Object.assign(d, { folded: f.out, map: f.map, foldedTitle: fold(d.title + ' ' + (d.period || '')).out });
            });
          })
          .catch(() => { results.innerHTML = '<p class="empty">Could not load the search index.</p>'; });
      }
      return loading;
    }

    function snippet(doc, pos, len) {
      const start = doc.map[pos], end = doc.map[pos + len];
      let from = Math.max(0, start - 90), to = Math.min(doc.text.length, end + 110);
      if (from > 0) from = doc.text.indexOf(' ', from) + 1 || from;
      if (to < doc.text.length) to = doc.text.lastIndexOf(' ', to) > end ? doc.text.lastIndexOf(' ', to) : to;
      return { from, to };
    }

    function renderSnippet(doc, range, terms) {
      const part = doc.text.slice(range.from, range.to).replace(/\n+/g, ' · ');
      const f = fold(part);
      const marks = [];
      terms.forEach((t) => findAll(f.out, t).forEach((p) => marks.push([f.map[p], f.map[p + t.length]])));
      marks.sort((a, b) => a[0] - b[0]);
      let html = '', last = 0;
      marks.forEach(([s, e]) => { if (s < last) return; html += esc(part.slice(last, s)) + '<mark>' + esc(part.slice(s, e)) + '</mark>'; last = e; });
      html += esc(part.slice(last));
      return (range.from > 0 ? '… ' : '') + html + (range.to < doc.text.length ? ' …' : '');
    }

    function run() {
      const q = input.value.trim();
      const url = new URL(location.href);
      if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
      history.replaceState(null, '', url);

      if (!q) { results.hidden = true; archive.hidden = false; return; }
      archive.hidden = true;
      results.hidden = false;
      if (!docs) { results.innerHTML = '<p class="empty">Searching…</p>'; load().then(run); return; }

      const terms = parseQuery(q);
      const found = [];
      docs.forEach((doc) => {
        let total = 0;
        const firstHits = [];
        for (const t of terms) {
          const hits = findAll(doc.folded, t);
          const inTitle = doc.foldedTitle.includes(t);
          if (!hits.length && !inTitle) return; // every term must match
          total += hits.length;
          if (hits.length) firstHits.push([hits[0], t.length]);
        }
        found.push({ doc, total, firstHits });
      });

      if (!found.length) {
        results.innerHTML = '<p class="empty">No briefings found for <strong>' + esc(q) + '</strong>.</p>';
        return;
      }

      const qs = '?q=' + encodeURIComponent(q);
      results.innerHTML =
        '<p class="count">' + found.length + (found.length === 1 ? ' briefing' : ' briefings') + ' for <strong>' + esc(q) + '</strong></p>' +
        '<ol class="list">' + found.map(({ doc, total, firstHits }) => {
          // at most 2 non-overlapping snippets
          const ranges = [];
          firstHits.sort((a, b) => a[0] - b[0]).forEach(([p, l]) => {
            const r = snippet(doc, p, l);
            if (ranges.length < 2 && !ranges.some((x) => r.from < x.to && r.to > x.from)) ranges.push(r);
          });
          return '<li class="item"><a href="' + doc.slug + '/' + qs + '">' +
            '<time datetime="' + doc.date + '">' + fmtDate(doc.date) + '</time>' +
            '<span class="item-title">' + esc(doc.period || doc.title) + '<span class="hits">' + total + '×</span></span>' +
            ranges.map((r) => '<span class="item-excerpt">' + renderSnippet(doc, r, terms) + '</span>').join('') +
            '</a></li>';
        }).join('') + '</ol>';
    }

    let timer;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    input.addEventListener('focus', load, { once: true });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
      if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; run(); }
    });

    const initial = new URL(location.href).searchParams.get('q');
    if (initial) { input.value = initial; run(); }
  }

  // ---- briefing page: highlight ?q= ----

  const content = document.querySelector('.briefing .content');
  const q = new URL(location.href).searchParams.get('q');
  if (content && q) highlight(content, q);

  function highlight(root, q) {
    const terms = parseQuery(q);
    if (!terms.length) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let count = 0;
    nodes.forEach((node) => {
      const text = node.nodeValue;
      const f = fold(text);
      const ranges = [];
      terms.forEach((t) => findAll(f.out, t).forEach((p) => ranges.push([f.map[p], f.map[p + t.length]])));
      if (!ranges.length) return;
      ranges.sort((a, b) => a[0] - b[0]);
      const frag = document.createDocumentFragment();
      let last = 0;
      ranges.forEach(([s, e]) => {
        if (s < last) return;
        frag.appendChild(document.createTextNode(text.slice(last, s)));
        const m = document.createElement('mark');
        m.textContent = text.slice(s, e);
        frag.appendChild(m);
        count++;
        last = e;
      });
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });

    const bar = document.createElement('p');
    bar.className = 'hitbar';
    bar.innerHTML = count + (count === 1 ? ' match' : ' matches') + ' for <strong>' + esc(q) + '</strong> · ' +
      '<a href="../?q=' + encodeURIComponent(q) + '">back to results</a> · <a href="./">clear highlights</a>';
    const article = document.querySelector('.briefing');
    article.parentNode.insertBefore(bar, article);

    const first = root.querySelector('mark');
    if (first) first.scrollIntoView({ block: 'center' });
  }
})();
