// Type library — 48 curated faces.
//
// A deliberate note on how this works, because it affects what a tailor receives:
//
// The studio renders garment text with fonts that are already on the viewer's
// machine, chosen through a stack that resolves to the intended face on macOS and
// Windows and degrades sanely elsewhere. What ships to the tailor is `specName` —
// the actual typeface to set or digitise from — so the handoff never depends on
// what happened to be installed in the browser. `synth` carries the width, slant
// and tracking the studio applies on top, which are reproduced in the spec sheet
// as explicit type instructions rather than being baked invisibly into a picture.
//
// This library is intentionally curated rather than unbounded: 48 faces that
// cover the real range of garment lettering. Adding more is a matter of appending
// entries — nothing else in the app enumerates fonts.

/**
 * @typedef {object} Typeface
 * @property {string} id
 * @property {string} name        Label shown in the studio.
 * @property {string} specName    Typeface a tailor/digitiser should actually use.
 * @property {string} class       Grouping for the picker.
 * @property {string} stack       CSS font-family stack used for canvas rendering.
 * @property {number} weight      CSS numeric weight.
 * @property {'normal'|'italic'} style
 * @property {object} synth       Width scale, extra slant, letter tracking, casing.
 * @property {boolean} [embroiderable] False when strokes are too fine to stitch.
 */

const GEO = `'Futura', 'Century Gothic', 'URW Gothic', 'Avenir Next', 'Questrial', sans-serif`;
const GROT = `'Helvetica Neue', Helvetica, 'Arial', 'Liberation Sans', sans-serif`;
const NEOGROT = `'Inter', 'Segoe UI', system-ui, 'Roboto', 'DejaVu Sans', sans-serif`;
const HUM = `'Gill Sans', 'Gill Sans MT', 'Optima', 'Candara', 'Trebuchet MS', sans-serif`;
const OLD = `'Garamond', 'EB Garamond', 'Palatino', 'Palatino Linotype', 'URW Palladio L', serif`;
const TRANS = `'Times New Roman', 'Liberation Serif', 'Tinos', Times, serif`;
const SCOTCH = `'Georgia', 'Constantia', 'Charter', 'DejaVu Serif', serif`;
const DIDONE = `'Didot', 'Bodoni 72', 'Bodoni MT', 'Playfair Display', 'Georgia', serif`;
const SLAB = `'Rockwell', 'American Typewriter', 'Roboto Slab', 'Courier New', serif`;
const MONO = `'Menlo', 'Consolas', 'Monaco', 'DejaVu Sans Mono', 'Courier New', monospace`;
const IMPACT = `'Impact', 'Haettenschweiler', 'Arial Black', 'Anton', sans-serif`;
const COND = `'Oswald', 'Bahnschrift', 'Arial Narrow', 'Liberation Sans Narrow', sans-serif`;
const SCRIPT = `'Snell Roundhand', 'Segoe Script', 'Brush Script MT', 'Savoye LET', cursive`;
const HAND = `'Bradley Hand', 'Ink Free', 'Marker Felt', 'Comic Sans MS', cursive`;
const BLACK = `'Old English Text MT', 'UnifrakturMaguntia', 'Blackadder ITC', 'Luminari', fantasy`;
const COPPER = `'Copperplate', 'Copperplate Gothic Light', 'Trajan Pro', 'Optima', serif`;
const STENCIL = `'Stencil', 'Phosphate', 'Impact', 'Arial Black', sans-serif`;
const ROUND = `'ui-rounded', 'SF Pro Rounded', 'Varela Round', 'Trebuchet MS', sans-serif`;

/** @param {Partial<Typeface['synth']>} s */
const synth = (s = {}) => ({ width: 1, slant: 0, tracking: 0, case: 'none', ...s });

export const TYPEFACES = [
  // ── Geometric sans ──────────────────────────────────────────────────────
  { id: 'geo-book', name: 'Geometric Book', specName: 'Futura Book', class: 'Geometric Sans', stack: GEO, weight: 400, style: 'normal', synth: synth({ tracking: 0.02 }) },
  { id: 'geo-med', name: 'Geometric Medium', specName: 'Futura Medium', class: 'Geometric Sans', stack: GEO, weight: 500, style: 'normal', synth: synth() },
  { id: 'geo-bold', name: 'Geometric Bold', specName: 'Futura Bold', class: 'Geometric Sans', stack: GEO, weight: 700, style: 'normal', synth: synth() },
  { id: 'geo-caps', name: 'Geometric Caps Wide', specName: 'Futura Bold, letterspaced', class: 'Geometric Sans', stack: GEO, weight: 700, style: 'normal', synth: synth({ tracking: 0.24, case: 'upper' }) },
  { id: 'geo-oblique', name: 'Geometric Oblique', specName: 'Futura Bold Oblique', class: 'Geometric Sans', stack: GEO, weight: 700, style: 'normal', synth: synth({ slant: -12 }) },

  // ── Grotesque / neo-grotesque ───────────────────────────────────────────
  { id: 'grot-reg', name: 'Grotesque Regular', specName: 'Helvetica Neue Regular', class: 'Grotesque', stack: GROT, weight: 400, style: 'normal', synth: synth() },
  { id: 'grot-bold', name: 'Grotesque Bold', specName: 'Helvetica Neue Bold', class: 'Grotesque', stack: GROT, weight: 700, style: 'normal', synth: synth() },
  { id: 'grot-black', name: 'Grotesque Black', specName: 'Helvetica Neue Black', class: 'Grotesque', stack: GROT, weight: 900, style: 'normal', synth: synth() },
  { id: 'grot-italic', name: 'Grotesque Italic', specName: 'Helvetica Neue Bold Italic', class: 'Grotesque', stack: GROT, weight: 700, style: 'italic', synth: synth() },
  { id: 'neo-reg', name: 'Neo Grotesque', specName: 'Inter Regular', class: 'Grotesque', stack: NEOGROT, weight: 400, style: 'normal', synth: synth() },
  { id: 'neo-bold', name: 'Neo Grotesque Bold', specName: 'Inter Bold', class: 'Grotesque', stack: NEOGROT, weight: 700, style: 'normal', synth: synth({ tracking: -0.01 }) },
  { id: 'neo-tight', name: 'Neo Tight Caps', specName: 'Inter Black, tight', class: 'Grotesque', stack: NEOGROT, weight: 900, style: 'normal', synth: synth({ tracking: -0.04, case: 'upper' }) },

  // ── Humanist sans ───────────────────────────────────────────────────────
  { id: 'hum-reg', name: 'Humanist Regular', specName: 'Gill Sans Regular', class: 'Humanist Sans', stack: HUM, weight: 400, style: 'normal', synth: synth() },
  { id: 'hum-bold', name: 'Humanist Bold', specName: 'Gill Sans Bold', class: 'Humanist Sans', stack: HUM, weight: 700, style: 'normal', synth: synth() },
  { id: 'hum-caps', name: 'Humanist Caps', specName: 'Gill Sans Caps', class: 'Humanist Sans', stack: HUM, weight: 600, style: 'normal', synth: synth({ case: 'upper', tracking: 0.12 }) },
  { id: 'round-med', name: 'Soft Rounded', specName: 'SF Pro Rounded Medium', class: 'Humanist Sans', stack: ROUND, weight: 600, style: 'normal', synth: synth() },
  { id: 'round-bold', name: 'Soft Rounded Bold', specName: 'SF Pro Rounded Bold', class: 'Humanist Sans', stack: ROUND, weight: 800, style: 'normal', synth: synth() },

  // ── Condensed & compressed ──────────────────────────────────────────────
  { id: 'cond-reg', name: 'Condensed', specName: 'Oswald Regular', class: 'Condensed', stack: COND, weight: 400, style: 'normal', synth: synth({ width: 0.92 }) },
  { id: 'cond-bold', name: 'Condensed Bold', specName: 'Oswald Bold', class: 'Condensed', stack: COND, weight: 700, style: 'normal', synth: synth({ width: 0.9 }) },
  { id: 'cond-compress', name: 'Compressed Caps', specName: 'Oswald Bold, compressed', class: 'Condensed', stack: COND, weight: 700, style: 'normal', synth: synth({ width: 0.72, case: 'upper' }) },
  { id: 'impact', name: 'Poster Gothic', specName: 'Impact', class: 'Condensed', stack: IMPACT, weight: 400, style: 'normal', synth: synth({ case: 'upper' }) },
  { id: 'impact-wide', name: 'Poster Gothic Wide', specName: 'Impact, extended', class: 'Condensed', stack: IMPACT, weight: 400, style: 'normal', synth: synth({ width: 1.28, case: 'upper', tracking: 0.04 }) },
  { id: 'impact-slant', name: 'Poster Gothic Slant', specName: 'Impact, obliqued 15°', class: 'Condensed', stack: IMPACT, weight: 400, style: 'normal', synth: synth({ slant: -15, case: 'upper' }) },

  // ── Serifs ──────────────────────────────────────────────────────────────
  { id: 'old-reg', name: 'Old Style', specName: 'Garamond Regular', class: 'Serif', stack: OLD, weight: 400, style: 'normal', synth: synth() },
  { id: 'old-italic', name: 'Old Style Italic', specName: 'Garamond Italic', class: 'Serif', stack: OLD, weight: 400, style: 'italic', synth: synth() },
  { id: 'trans-reg', name: 'Transitional', specName: 'Times New Roman Regular', class: 'Serif', stack: TRANS, weight: 400, style: 'normal', synth: synth() },
  { id: 'trans-bold', name: 'Transitional Bold', specName: 'Times New Roman Bold', class: 'Serif', stack: TRANS, weight: 700, style: 'normal', synth: synth() },
  { id: 'scotch-reg', name: 'Scotch Roman', specName: 'Georgia Regular', class: 'Serif', stack: SCOTCH, weight: 400, style: 'normal', synth: synth() },
  { id: 'scotch-bold', name: 'Scotch Roman Bold', specName: 'Georgia Bold', class: 'Serif', stack: SCOTCH, weight: 700, style: 'normal', synth: synth() },
  { id: 'scotch-caps', name: 'Scotch Caps', specName: 'Georgia Bold Caps', class: 'Serif', stack: SCOTCH, weight: 700, style: 'normal', synth: synth({ case: 'upper', tracking: 0.1 }) },
  { id: 'didone', name: 'Didone', specName: 'Didot Regular', class: 'Serif', stack: DIDONE, weight: 400, style: 'normal', synth: synth(), embroiderable: false },
  { id: 'didone-bold', name: 'Didone Bold', specName: 'Didot Bold', class: 'Serif', stack: DIDONE, weight: 700, style: 'normal', synth: synth() },
  { id: 'didone-italic', name: 'Didone Italic', specName: 'Didot Italic', class: 'Serif', stack: DIDONE, weight: 400, style: 'italic', synth: synth(), embroiderable: false },

  // ── Slab & typewriter ───────────────────────────────────────────────────
  { id: 'slab-reg', name: 'Slab Regular', specName: 'Rockwell Regular', class: 'Slab', stack: SLAB, weight: 400, style: 'normal', synth: synth() },
  { id: 'slab-bold', name: 'Slab Bold', specName: 'Rockwell Bold', class: 'Slab', stack: SLAB, weight: 700, style: 'normal', synth: synth() },
  { id: 'slab-caps', name: 'Slab Caps Wide', specName: 'Rockwell Bold, letterspaced', class: 'Slab', stack: SLAB, weight: 700, style: 'normal', synth: synth({ case: 'upper', tracking: 0.18 }) },
  { id: 'typewriter', name: 'Typewriter', specName: 'American Typewriter', class: 'Slab', stack: SLAB, weight: 400, style: 'normal', synth: synth({ tracking: 0.04 }) },

  // ── Monospace ───────────────────────────────────────────────────────────
  { id: 'mono-reg', name: 'Mono Regular', specName: 'Menlo Regular', class: 'Monospace', stack: MONO, weight: 400, style: 'normal', synth: synth() },
  { id: 'mono-bold', name: 'Mono Bold', specName: 'Menlo Bold', class: 'Monospace', stack: MONO, weight: 700, style: 'normal', synth: synth() },
  { id: 'mono-wide', name: 'Mono Wide Caps', specName: 'Menlo Bold, letterspaced', class: 'Monospace', stack: MONO, weight: 700, style: 'normal', synth: synth({ case: 'upper', tracking: 0.2 }) },

  // ── Display, engraved, institutional ────────────────────────────────────
  { id: 'copper', name: 'Engraved Caps', specName: 'Copperplate Gothic', class: 'Display', stack: COPPER, weight: 600, style: 'normal', synth: synth({ case: 'upper', tracking: 0.14 }) },
  { id: 'copper-light', name: 'Engraved Light', specName: 'Copperplate Gothic Light', class: 'Display', stack: COPPER, weight: 400, style: 'normal', synth: synth({ case: 'upper', tracking: 0.2 }), embroiderable: false },
  { id: 'stencil', name: 'Stencil', specName: 'Stencil Std Bold', class: 'Display', stack: STENCIL, weight: 700, style: 'normal', synth: synth({ case: 'upper', tracking: 0.06 }) },
  { id: 'varsity', name: 'Varsity Block', specName: 'Collegiate Block', class: 'Display', stack: IMPACT, weight: 900, style: 'normal', synth: synth({ case: 'upper', width: 1.1, tracking: 0.08 }) },
  { id: 'blackletter', name: 'Blackletter', specName: 'Old English Text MT', class: 'Display', stack: BLACK, weight: 400, style: 'normal', synth: synth() },
  { id: 'blackletter-bold', name: 'Blackletter Heavy', specName: 'Fette Fraktur', class: 'Display', stack: BLACK, weight: 700, style: 'normal', synth: synth() },

  // ── Script & hand ───────────────────────────────────────────────────────
  { id: 'script-formal', name: 'Formal Script', specName: 'Snell Roundhand', class: 'Script', stack: SCRIPT, weight: 400, style: 'italic', synth: synth(), embroiderable: false },
  { id: 'script-bold', name: 'Bold Script', specName: 'Snell Roundhand Bold', class: 'Script', stack: SCRIPT, weight: 700, style: 'italic', synth: synth() },
  { id: 'hand-marker', name: 'Marker Hand', specName: 'Marker Felt', class: 'Script', stack: HAND, weight: 400, style: 'normal', synth: synth() },
  { id: 'hand-brush', name: 'Brush Hand', specName: 'Brush Script MT', class: 'Script', stack: SCRIPT, weight: 400, style: 'italic', synth: synth({ slant: -6 }) },
];

const BY_ID = new Map(TYPEFACES.map((f) => [f.id, f]));

export function getTypeface(id) {
  return BY_ID.get(id) || BY_ID.get('grot-bold');
}

/** Picker groupings, in the order the classes appear above. */
export function typefacesByClass() {
  const groups = new Map();
  for (const f of TYPEFACES) {
    if (!groups.has(f.class)) groups.set(f.class, []);
    groups.get(f.class).push(f);
  }
  return [...groups.entries()].map(([name, faces]) => ({ name, faces }));
}

/**
 * Canvas `font` shorthand for a face at a given pixel size. Width, slant and
 * tracking are not expressible here — the text renderer applies those as a
 * transform, so it needs `synth` separately.
 */
export function canvasFont(typefaceId, pxSize) {
  const f = getTypeface(typefaceId);
  return `${f.style} ${f.weight} ${pxSize}px ${f.stack}`;
}

/** Thread and print treatments a text element can be produced with. */
export const TECHNIQUES = [
  {
    id: 'print', name: 'Screen Print', code: 'TQ-SCR',
    spec: 'Plastisol screen print, standard cure',
    raised: 0, sheen: 0.62,
  },
  {
    id: 'embroider', name: 'Embroidery', code: 'TQ-EMB',
    spec: 'Satin-stitch embroidery, 40 wt rayon, 3.5 mm density',
    raised: 1, sheen: 0.24,
  },
  {
    id: 'puff', name: 'Puff Print', code: 'TQ-PUF',
    spec: 'Puff-additive plastisol, raised cure',
    raised: 0.6, sheen: 0.7,
  },
  {
    id: 'chainstitch', name: 'Chain Stitch', code: 'TQ-CHN',
    spec: 'Single-needle chainstitch, 30 wt cotton',
    raised: 0.7, sheen: 0.3,
  },
  {
    id: 'flock', name: 'Flock Transfer', code: 'TQ-FLK',
    spec: 'Heat-applied flock, suede hand',
    raised: 0.45, sheen: 0.88,
  },
  {
    id: 'applique', name: 'Appliqué', code: 'TQ-APL',
    spec: 'Cut-cloth appliqué, zigzag edge-stitched',
    raised: 0.85, sheen: 0.5,
  },
];

export function getTechnique(id) {
  return TECHNIQUES.find((t) => t.id === id) || TECHNIQUES[0];
}
