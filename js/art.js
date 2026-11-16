/**
 * Stylised SVG artwork for UK coins and notes.
 *
 * IMPORTANT: this art is stylised, NOT to scale for notes, and it is not a copy of any
 * official Bank of England or Royal Mint design. Colours are for telling pieces apart only.
 *
 * Coin diameters are scaled from the real diameters in millimetres (listed below), so the
 * relative sizes are roughly right, but treat the picture as a teaching aid rather than a
 * template. The order by size is 5p, 1p, 20p, £1, 10p, 2p, 50p, £2.
 */
import { denominationById, formatPence } from './money.js';

/** Real diameters in mm, for coins only. Used for the size ratios and the feedback text. */
const COIN_MM = Object.freeze({
  '1p': 20.3,
  '2p': 25.9,
  '5p': 18.0,
  '10p': 24.5,
  '20p': 21.4,
  '50p': 27.3,
  '£1': 23.43,
  '£2': 28.4,
});

/** Number of sides. 0 means round. */
const SIDES = Object.freeze({ '20p': 7, '50p': 7, '£1': 12 });

/** Coin metal families. */
const METAL = Object.freeze({
  '1p': 'copper',
  '2p': 'copper',
  '5p': 'silver',
  '10p': 'silver',
  '20p': 'silver',
  '50p': 'silver',
  '£1': 'bimetal',
  '£2': 'bimetal-reversed',
});

const COPPER = '#b87333';
const SILVER = '#cfd4dc';
const GOLD = '#d9ab3f';
const INK = '#111111';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/** Stylised note colours, chosen to be distinct from each other. */
const NOTE_BASE = Object.freeze({
  '£5': '#2f6fb3',
  '£10': '#9a5a2c',
  '£20': '#2e8b57',
  '£50': '#7b3f8c',
});

function resolve(denom) {
  const d = typeof denom === 'string' ? denominationById(denom) : denom;
  if (!d) throw new RangeError(`unknown denomination: ${String(denom)}`);
  return d;
}

/** Points of a regular polygon with `sides` corners, first corner pointing up. */
function polygonPoints(sides, cx, cy, r) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / sides;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function coinSvg(d, label, size, alt) {
  const cx = 100;
  const cy = 100;
  // 28.4mm (the largest coin, £2) maps to radius 94. Everything else scales from that.
  const r = (94 * COIN_MM[d.id]) / COIN_MM['£2'];
  const sides = SIDES[d.id] || 0;
  const metal = METAL[d.id];
  const outline = sides
    ? `<polygon points="${polygonPoints(sides, cx, cy, r)}"`
    : `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}"`;
  const rim = 'stroke="#000000" stroke-opacity="0.35" stroke-width="3"';

  let body;
  if (metal === 'bimetal' || metal === 'bimetal-reversed') {
    // £1: gold outer ring, silver centre. £2 is the reverse: silver outer ring, gold centre.
    const [outer, centre] = metal === 'bimetal' ? [GOLD, SILVER] : [SILVER, GOLD];
    const inner = r * 0.72;
    body = `${outline} fill="${outer}" ${rim}/>` +
      `<circle cx="${cx}" cy="${cy}" r="${inner.toFixed(2)}" fill="${centre}" stroke="#000000" stroke-opacity="0.25" stroke-width="2"/>`;
  } else {
    const fill = metal === 'copper' ? COPPER : SILVER;
    body = `${outline} fill="${fill}" ${rim}/>`;
  }
  const fontSize = (label.length >= 3 ? 0.44 : 0.6) * r;
  const text = label
    ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${fontSize.toFixed(1)}" font-weight="800" fill="${INK}">${label}</text>`
    : '';
  return svgWrap(`0 0 200 200`, size, size, alt, body + text);
}

function noteSvg(d, label, size, alt) {
  const base = NOTE_BASE[d.id];
  const printed = label
    ? `<text x="160" y="96" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="800" fill="${INK}">${label}</text>` +
      `<text x="28" y="44" font-family="${FONT}" font-size="24" font-weight="700" fill="${INK}">${label}</text>` +
      `<text x="292" y="128" text-anchor="end" font-family="${FONT}" font-size="24" font-weight="700" fill="${INK}">${label}</text>`
    : '';
  const body =
    `<rect x="2" y="2" width="316" height="156" rx="14" fill="${base}" stroke="#000000" stroke-opacity="0.35" stroke-width="2"/>` +
    `<rect x="14" y="14" width="292" height="132" rx="8" fill="#fff8e7" fill-opacity="0.92"/>` +
    `<circle cx="160" cy="80" r="46" fill="${base}" fill-opacity="0.3"/>` +
    printed;
  return svgWrap('0 0 320 160', size, Math.round(size / 2), alt, body);
}

function svgWrap(viewBox, width, height, alt, inner) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" ` +
    `role="img" aria-label="${alt}">` +
    `<title>${alt}</title>${inner}</svg>`
  );
}

/**
 * Stylised SVG string for a coin or note.
 * @param {string|object} denom a denomination id (e.g. "20p") or a denomination object.
 * @param {{ size?: number, quiz?: boolean }} [opts] width in CSS pixels. Notes render at half this height.
 *   quiz: use a neutral accessible name and omit the printed value, so the Identify answer is not
 *   spoken or shown before a choice is made.
 */
export function renderSvg(denom, { size = 160, quiz = false } = {}) {
  const d = resolve(denom);
  const label = formatPence(d.pence);
  const alt = quiz ? 'Coin or note to identify' : `${d.name} (${label})`;
  // In the quiz the printed value is hidden too, so learners recognise size, shape and colour.
  const printed = quiz ? '' : label;
  return d.kind === 'note' ? noteSvg(d, printed, size, alt) : coinSvg(d, printed, size, alt);
}

/** File name (without extension) of the optional real photo in photos/ for each denomination. */
const PHOTO_NAME = Object.freeze({
  '1p': '1p',
  '2p': '2p',
  '5p': '5p',
  '10p': '10p',
  '20p': '20p',
  '50p': '50p',
  '£1': '1pound',
  '£2': '2pound',
  '£5': '5pound',
  '£10': '10pound',
  '£20': '20pound',
  '£50': '50pound',
});

/**
 * Wikipedia file for each denomination, hotlinked as a last resort. These are copyrighted official
 * images (Royal Mint and Bank of England). Use only for personal, local viewing; do not publish
 * the app with these links. Special:FilePath redirects to the current file.
 */
const WIKI_FILE = Object.freeze({
  '1p': 'British_one_penny_coin_2016_obverse.png',
  '2p': 'British_two_pence_coin_2016_obverse.png',
  '5p': 'British_five_pence_coin_2016_obverse.png',
  '10p': 'British_10_pence_coin_obverse_2016.png',
  '20p': '2018_20p_obverse.png',
  '50p': 'British_fifty_pence_coin_2015_obverse.png',
  '£1': 'British_12_sided_pound_coin.png',
  '£2': 'British_two_pound_coin_2016_obverse.png',
  '£5': 'Bank_of_England_£5_obverse.jpg',
  '£10': 'Bank_of_England_£10_obverse.jpeg',
  '£20': 'Bank_of_England_£20_Series_G_obverse.jpg',
  '£50': 'Bank_of_England_£50_Series_G_obverse.jpg',
});

/**
 * Candidate URLs for a photo of a coin or note, tried in order: local .jpg, local .png, then the
 * Wikipedia file. The app falls back to renderSvg() if all fail. Local paths are relative, so they
 * work under a GitHub Pages sub-path such as /money-practice/.
 * @param {string|object} denom a denomination id or object.
 * @returns {string[]}
 */
export function photoUrls(denom) {
  const d = resolve(denom);
  const name = PHOTO_NAME[d.id];
  const wiki = `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(WIKI_FILE[d.id])}?width=600`;
  return [`photos/${name}.jpg`, `photos/${name}.png`, wiki];
}

/**
 * Size of a coin relative to the largest coin (£2 = 1), from its real diameter. Notes return 1.
 * Use it to draw coins to scale in the same picture, so a 5p looks smaller than a 10p.
 * @param {string|object} denom a denomination id or object.
 * @returns {number}
 */
export function coinScale(denom) {
  const d = resolve(denom);
  return d.kind === 'coin' ? COIN_MM[d.id] / COIN_MM['£2'] : 1;
}

const SHAPE_WORD = Object.freeze({ 0: 'round', 7: 'seven-sided', 12: 'twelve-sided' });
const METAL_WORD = Object.freeze({
  copper: 'copper-coloured',
  silver: 'silver-coloured',
  bimetal: 'gold outer ring with a silver centre',
  'bimetal-reversed': 'silver outer ring with a gold centre',
});

/**
 * A short factual sentence for feedback, e.g. "This is the 20p: 21.4mm, seven-sided, silver-coloured."
 * Only uses coin diameters and shapes that are checked against the real pieces.
 */
export function describeDenomination(denom) {
  const d = resolve(denom);
  const label = formatPence(d.pence);
  if (d.kind === 'note') {
    return `This is the ${label} note. All current Bank of England notes are polymer.`;
  }
  const shape = SHAPE_WORD[SIDES[d.id] || 0];
  return `This is the ${label}: ${COIN_MM[d.id]}mm, ${shape}, ${METAL_WORD[METAL[d.id]]}.`;
}
