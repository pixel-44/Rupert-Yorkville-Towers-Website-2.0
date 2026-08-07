// Line-art garment silhouettes for the category and template cards.
//
// Drawn rather than photographed so the whole picker stays monochrome — the
// first colour a user sees anywhere in this app should be one they chose.

const STROKE = 'stroke="currentColor" fill="none" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';

const wrap = (inner, extra = '') => `
<svg viewBox="0 0 120 150" role="img" style="color:#9aa0a8">
  <g ${STROKE} ${extra}>${inner}</g>
</svg>`;

const PATHS = {
  jeans: `
    <path d="M32 14h56l4 26-3 4 2 96H62l-2-62-2 62H29l2-96-3-4z"/>
    <path d="M28 40h64M60 40v54"/>
    <path d="M36 46h14v12H36zM70 46h14v12H70z"/>
    <path d="M60 18v12"/>`,
  pants: `
    <path d="M34 14h52l3 22-2 4 3 94H61l-2-64-2 64H33l3-94-2-4z"/>
    <path d="M31 36h58M60 36v58"/>
    <path d="M38 44c5 5 12 5 17 0M65 44c5 5 12 5 17 0"/>`,
  tshirts: `
    <path d="M42 18l-24 12 9 20 11-5v83h44V45l11 5 9-20-24-12z"/>
    <path d="M42 18c0 9 8 14 18 14s18-5 18-14"/>
    <path d="M38 45v83M82 45v83"/>`,
  shirts: `
    <path d="M44 18L20 30l8 19 10-4v83h44V45l10 4 8-19-24-12z"/>
    <path d="M44 18l16 12 16-12"/>
    <path d="M44 18l6 10-6 6M76 18l-6 10 6 6"/>
    <path d="M60 30v98"/>
    <path d="M52 56h13v13H52z"/>`,
  hoodies: `
    <path d="M42 24L16 38l10 22 12-6v74h44V54l12 6 10-22-26-14z"/>
    <path d="M42 24c2 12 8 18 18 18s16-6 18-18"/>
    <path d="M46 74h28v18H46z"/>
    <path d="M53 34v10M67 34v10"/>
    <path d="M38 118h44"/>`,
  puffers: `
    <path d="M40 22L18 34l8 24 12-5v79h44V53l12 5 8-24-22-12z"/>
    <path d="M60 30v100"/>
    <path d="M38 52h44M38 68h44M38 84h44M38 100h44M38 116h44"/>
    <path d="M44 22h32v8H44z"/>`,
};

export function categorySilhouette(categoryId) {
  return wrap(PATHS[categoryId] || PATHS.tshirts);
}

/**
 * Template cards reuse the category drawing but distort it toward the fit —
 * a skinny leg really is narrower than a wide leg on the card.
 */
export function templateSilhouette(template) {
  const b = template.build;
  let sx = 1, sy = 1;
  if (template.kind === 'bottom') {
    sx = clamp(0.62 + (b.hem / 46) * 0.4, 0.66, 1.34);
    sy = clamp(0.9 + (b.inseam - 80) / 90, 0.9, 1.1);
  } else {
    sx = clamp(0.7 + (b.chest - 96) / 90, 0.78, 1.3);
    sy = clamp(0.78 + (b.length - 58) / 74, 0.8, 1.22);
  }
  const transform = `transform="translate(60 ${template.kind === 'bottom' ? 14 : 18}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-60 ${template.kind === 'bottom' ? -14 : -18})"`;
  return wrap(PATHS[template.category] || PATHS.tshirts, transform);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
