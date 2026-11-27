// "Signal plate": the generative image every edition gets.
// A ridgeline of scan lines (an oscilloscope read-out). Out of low-level noise rise
// one peak per top signal; the accent line marks how strongly the edition concerns
// the Netherlands/Brainport. Deterministic: the same edition always yields the same plate.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {string} seed      e.g. the edition slug
 * @param {object} o
 * @param {number} o.peaks   number of signals (peaks)
 * @param {number} o.accent  0..1, Dutch/Brainport relevance
 * @param {'wide'|'large'|'small'} o.size
 * @param {string} o.label   accessible description
 */
export function plate(seed, { peaks = 6, accent = 0.5, size = 'large', label = '' } = {}) {
  const rnd = mulberry32(hash(seed));
  const S = {
    wide: { W: 1200, H: 400, lines: 30, step: 6, top: 70, sx: 1.6 },
    large: { W: 640, H: 360, lines: 30, step: 5, top: 70, sx: 1 },
    small: { W: 640, H: 400, lines: 18, step: 10, top: 90, sx: 1 },
  }[size];
  const large = size !== 'small';
  const { W, H, lines, step, top } = S;
  const marginX = 24, bleed = 12, bottom = H - 26;
  const gap = (bottom - top) / (lines - 1);

  // Peaks: one per signal; the first is the "Dutch" peak whose height follows accent.
  const ps = [];
  for (let k = 0; k < peaks; k++) {
    ps.push({
      x: marginX + (0.12 + 0.76 * rnd()) * (W - 2 * marginX),
      row: (0.18 + 0.7 * rnd()) * (lines - 1),
      amp: (k === 0 ? 0.35 + 0.65 * accent : 0.35 + 0.55 * rnd()) * gap * (large ? 7 : 6),
      sx: (14 + 34 * rnd()) * S.sx,
      sr: 1.2 + 1.8 * rnd(),
    });
  }
  const accentRow = Math.round(ps[0].row);

  // Smooth noise per line: random values on a coarse grid, cosine-interpolated.
  const coarse = 8;
  const n = Math.ceil((W + 2 * bleed) / step);
  const noiseAmp = gap * 0.55;

  const paths = [];
  for (let i = 0; i < lines; i++) {
    const y0 = top + i * gap;
    const grid = Array.from({ length: Math.ceil(n / coarse) + 2 }, () => rnd() * 2 - 1);
    let d = '';
    for (let j = 0; j <= n; j++) {
      const x = -bleed + j * step;
      const g = j / coarse, g0 = Math.floor(g), t = (1 - Math.cos((g - g0) * Math.PI)) / 2;
      const edge = 0.35 + 0.65 * Math.sin((j / n) * Math.PI); // calmer at the edges
      let disp = (grid[g0] * (1 - t) + grid[g0 + 1] * t) * noiseAmp * edge;
      for (const p of ps) {
        const dx = x - p.x, dr = i - p.row;
        disp += p.amp * Math.exp(-(dx * dx) / (2 * p.sx * p.sx)) * Math.exp(-(dr * dr) / (2 * p.sr * p.sr));
      }
      d += `${j ? 'L' : 'M'}${x.toFixed(1)} ${(y0 - Math.max(disp, -gap * 0.8)).toFixed(1)}`;
    }
    const isAccent = i === accentRow && accent > 0.15;
    // Close the shape downwards so later (lower) lines occlude earlier ones.
    // (closing points lie outside the viewBox, so no edge strokes are visible)
    paths.push(`<path class="${isAccent ? 'a' : 'l'}" d="${d}L${W + bleed} ${H + 20}L${-bleed} ${H + 20}Z"/>`);
  }

  return `<svg class="plate plate-${size}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label.replace(/"/g, '&quot;')}" preserveAspectRatio="xMidYMid slice">` +
    `<rect class="bg" width="${W}" height="${H}"/>${paths.join('')}</svg>`;
}
