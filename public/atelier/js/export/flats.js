// Flat pattern diagrams.
//
// The 3D render tells a user what they are getting. This is what a tailor
// actually works from: each pattern piece drawn flat at true proportion, with
// the editable zones outlined and every modification pinned to a numbered mark
// whose measurements appear in the itemised list.
//
// Piece outlines are generated from the same `build` numbers that drive the
// loft, so the paper and the render describe one garment. Output is a plain
// draw list in centimetres, which both the on-screen SVG and the PDF render —
// there is no second copy of this geometry anywhere.

import { getTemplate } from '../catalog/templates.js';
import { itemiseModifications } from '../state/design-state.js';

/** Canonical order pieces are laid out in. */
const PIECE_ORDER = [
  'front', 'back', 'yoke', 'sleeve', 'cuff', 'collar', 'hood', 'hemband',
  'front-hip', 'back-hip', 'leg-left', 'leg-right', 'waistband',
];

const PIECE_LABELS = {
  front: 'Front body', back: 'Back body', yoke: 'Back yoke',
  sleeve: 'Sleeve (cut 2)', cuff: 'Cuff (cut 2)', collar: 'Collar',
  hood: 'Hood (cut 2)', hemband: 'Hem band',
  'front-hip': 'Front hip block', 'back-hip': 'Back hip block',
  'leg-left': 'Left leg', 'leg-right': 'Right leg', waistband: 'Waistband',
};

/**
 * Build the complete flat drawing for a design.
 *
 * @returns {{pieces: object[], legend: {n: number, text: string}[]}}
 */
export function flatDrawing(state) {
  const template = getTemplate(state.templateId);
  if (!template) return { pieces: [], legend: [] };

  const used = new Set(template.zones.map((z) => z.flat?.piece).filter(Boolean));
  const pieces = PIECE_ORDER
    .filter((id) => used.has(id))
    .map((id) => buildPiece(id, template))
    .filter(Boolean);

  // Zone outlines, so a tailor can see which region each instruction addresses.
  for (const piece of pieces) {
    piece.zones = template.zones
      .filter((z) => z.flat?.piece === piece.id)
      .map((z) => ({
        id: z.id,
        name: z.name,
        rect: scaleRect(z.flat.rect, piece.widthCm, piece.heightCm),
      }));
  }

  // Numbered marks, shared with the itemised modification list.
  const { items } = itemiseModifications(state);
  const legend = [];
  let n = 0;
  for (const item of items) {
    if (!item.placement) continue;
    const zone = template.zones.find((z) => z.id === item.zoneId);
    const piece = pieces.find((p) => p.id === zone?.flat?.piece);
    if (!zone || !piece) continue;

    const [x0, y0, x1, y1] = scaleRect(zone.flat.rect, piece.widthCm, piece.heightCm);
    n += 1;
    piece.marks.push({
      n,
      x: x0 + (x1 - x0) * item.placement.x,
      y: y0 + (y1 - y0) * item.placement.y,
    });
    legend.push({
      n,
      text: `${item.label} — ${zone.name}${item.detail ? `, ${item.detail}` : ''}`,
      kind: item.kind,
    });
  }

  return { pieces, legend };
}

const scaleRect = ([x0, y0, x1, y1], w, h) => [x0 * w, y0 * h, x1 * w, y1 * h];

// ── Piece outlines ────────────────────────────────────────────────────────

function buildPiece(id, template) {
  const b = template.build;
  const base = { id, label: PIECE_LABELS[id] || id, marks: [], guides: [] };

  switch (id) {
    case 'front': return { ...base, ...bodyPiece(b, 'front') };
    case 'back': return { ...base, ...bodyPiece(b, 'back') };
    case 'yoke': return { ...base, ...rectPiece(b.chest / 2, 13, 'Cut 1 on fold') };
    case 'sleeve': return { ...base, ...sleevePiece(b) };
    case 'cuff': return { ...base, ...rectPiece(Math.max(14, b.cuff), 7, 'Cut 2, interfaced') };
    case 'collar': return { ...base, ...rectPiece(b.neckW * 3.2, 6.5, 'Cut 2, interfaced') };
    case 'hood': return { ...base, ...hoodPiece(b) };
    case 'hemband': return { ...base, ...rectPiece(b.hem, 6, 'Cut 1, rib' ) };
    case 'front-hip': return { ...base, ...hipPiece(b, 'front') };
    case 'back-hip': return { ...base, ...hipPiece(b, 'back') };
    case 'leg-left': return { ...base, ...legPiece(b) };
    case 'leg-right': return { ...base, ...legPiece(b) };
    case 'waistband': return { ...base, ...rectPiece(b.waist, 4.5, 'Cut 1, interfaced') };
    default: return null;
  }
}

function bodyPiece(b, side) {
  const W = b.chest / 2;
  const H = b.length;
  const cx = W / 2;
  const neckHalf = b.neckW / 2;
  const drop = side === 'front' ? Math.max(6, b.neckW * 0.42) : 2.6;
  const shoulderHalf = b.shoulder / 2;
  const armDepth = H * 0.3;
  const hemHalf = b.hem / 4;

  const path = [
    ['M', cx - neckHalf, 0.8],
    ['Q', cx, drop * 1.35, cx + neckHalf, 0.8],
    ['L', cx + shoulderHalf, 2.6],
    ['Q', cx + W * 0.46, armDepth * 0.52, W, armDepth],
    ['L', cx + hemHalf, H],
    ['Q', cx, H + (side === 'front' ? 1.6 : 1.0), cx - hemHalf, H],
    ['L', 0, armDepth],
    ['Q', cx - W * 0.46, armDepth * 0.52, cx - shoulderHalf, 2.6],
    ['Z'],
  ];

  return {
    widthCm: W,
    heightCm: H + 2,
    path,
    note: side === 'front' ? 'Cut 1 on fold' : 'Cut 1 on fold',
    guides: [
      { type: 'line', from: [cx, 0], to: [cx, H], dash: [3, 2], label: 'CF/CB' },
      { type: 'line', from: [0, armDepth], to: [W, armDepth], dash: [2, 2], label: 'Chest' },
    ],
    dims: [
      { label: `Chest ${b.chest} cm`, at: [cx, armDepth] },
      { label: `Length ${b.length} cm`, at: [cx, H * 0.75] },
    ],
  };
}

function sleevePiece(b) {
  const W = Math.max(20, b.bicep);
  const H = Math.max(12, b.sleeveLen);
  const capH = Math.min(H * 0.34, W * 0.46);
  const cuffHalf = Math.max(7, b.cuff) / 2;
  const cx = W / 2;

  return {
    widthCm: W,
    heightCm: H,
    path: [
      ['M', 0, capH],
      ['C', W * 0.12, capH * 0.3, W * 0.3, 0, cx, 0.4],
      ['C', W * 0.7, 0, W * 0.88, capH * 0.3, W, capH],
      ['L', cx + cuffHalf, H],
      ['L', cx - cuffHalf, H],
      ['Z'],
    ],
    note: 'Cut 2, mirrored',
    guides: [
      { type: 'line', from: [cx, 0], to: [cx, H], dash: [3, 2], label: 'Grain' },
      { type: 'line', from: [0, capH], to: [W, capH], dash: [2, 2], label: 'Bicep' },
    ],
    dims: [
      { label: `Bicep ${b.bicep} cm`, at: [cx, capH] },
      { label: `Length ${b.sleeveLen} cm`, at: [cx, H * 0.72] },
    ],
  };
}

function hoodPiece(b) {
  const W = b.neckW * 2.3;
  const H = 40;
  return {
    widthCm: W,
    heightCm: H,
    path: [
      ['M', W * 0.06, H],
      ['L', W * 0.06, H * 0.36],
      ['Q', W * 0.1, 2, W * 0.55, 1.5],
      ['Q', W * 0.98, 3, W * 0.96, H * 0.42],
      ['L', W * 0.96, H],
      ['Z'],
    ],
    note: 'Cut 2 shell + 2 lining',
    guides: [
      { type: 'line', from: [W * 0.06, H * 0.36], to: [W * 0.96, H * 0.36], dash: [2, 2], label: 'Face opening' },
    ],
    dims: [{ label: `Height ${H} cm`, at: [W * 0.5, H * 0.7] }],
  };
}

function hipPiece(b, side) {
  const W = b.hip / 2;
  const H = b.rise;
  const cx = W / 2;
  const waistHalf = b.waist / 4;
  return {
    widthCm: W,
    heightCm: H,
    path: [
      ['M', cx - waistHalf, 0],
      ['L', cx + waistHalf, 0],
      ['Q', W, H * 0.42, W, H * 0.72],
      ['L', W * 0.62, H],
      ['Q', cx, H * (side === 'back' ? 0.86 : 0.9), W * 0.38, H],
      ['L', 0, H * 0.72],
      ['Q', 0, H * 0.42, cx - waistHalf, 0],
      ['Z'],
    ],
    note: side === 'back' ? 'Cut 2, mirrored' : 'Cut 2, mirrored',
    guides: [
      { type: 'line', from: [cx, 0], to: [cx, H], dash: [3, 2], label: 'Grain' },
      { type: 'line', from: [0, H * 0.72], to: [W, H * 0.72], dash: [2, 2], label: 'Hip' },
    ],
    dims: [
      { label: `Rise ${b.rise} cm`, at: [cx, H * 0.45] },
      { label: `Hip ${b.hip} cm`, at: [cx, H * 0.72] },
    ],
  };
}

function legPiece(b) {
  const W = b.thigh;
  const H = b.inseam;
  const cx = W / 2;
  const kneeHalf = b.knee / 2;
  const hemHalf = b.hem / 2;
  return {
    widthCm: W,
    heightCm: H,
    path: [
      ['M', 0, 0],
      ['L', W, 0],
      ['Q', cx + kneeHalf * 1.06, H * 0.3, cx + kneeHalf, H * 0.5],
      ['L', cx + hemHalf, H],
      ['L', cx - hemHalf, H],
      ['Q', cx - kneeHalf * 1.02, H * 0.75, cx - kneeHalf, H * 0.5],
      ['Q', cx - kneeHalf * 1.06, H * 0.3, 0, 0],
      ['Z'],
    ],
    note: 'Cut 2 per leg (front + back)',
    guides: [
      { type: 'line', from: [cx, 0], to: [cx, H], dash: [3, 2], label: 'Grain' },
      { type: 'line', from: [cx - kneeHalf, H * 0.5], to: [cx + kneeHalf, H * 0.5], dash: [2, 2], label: 'Knee' },
    ],
    dims: [
      { label: `Thigh ${b.thigh} cm`, at: [cx, 4] },
      { label: `Inseam ${b.inseam} cm`, at: [cx, H * 0.72] },
    ],
  };
}

function rectPiece(widthCm, heightCm, note) {
  const W = Math.max(6, widthCm);
  const H = Math.max(3, heightCm);
  return {
    widthCm: W,
    heightCm: H,
    path: [['M', 0, 0], ['L', W, 0], ['L', W, H], ['L', 0, H], ['Z']],
    note,
    guides: [{ type: 'line', from: [0, H / 2], to: [W, H / 2], dash: [2, 2], label: 'Fold' }],
    dims: [{ label: `${round(W)} × ${round(H)} cm`, at: [W / 2, H * 0.75] }],
  };
}

const round = (v) => Math.round(v * 10) / 10;

// ── Renderers ─────────────────────────────────────────────────────────────

/** On-screen SVG for the review sheet. */
export function flatToSVG(piece, { width = 300 } = {}) {
  const pad = Math.max(6, piece.widthCm * 0.1);
  const vbW = piece.widthCm + pad * 2;
  const vbH = piece.heightCm + pad * 2;
  const scale = width / vbW;
  const stroke = 0.35 / scale * 1.6;

  const d = piece.path.map((c) => {
    if (c[0] === 'M') return `M ${c[1] + pad} ${c[2] + pad}`;
    if (c[0] === 'L') return `L ${c[1] + pad} ${c[2] + pad}`;
    if (c[0] === 'Q') return `Q ${c[1] + pad} ${c[2] + pad} ${c[3] + pad} ${c[4] + pad}`;
    if (c[0] === 'C') return `C ${c[1] + pad} ${c[2] + pad} ${c[3] + pad} ${c[4] + pad} ${c[5] + pad} ${c[6] + pad}`;
    return 'Z';
  }).join(' ');

  const zones = (piece.zones || []).map((z) =>
    `<rect x="${z.rect[0] + pad}" y="${z.rect[1] + pad}" width="${z.rect[2] - z.rect[0]}" `
    + `height="${z.rect[3] - z.rect[1]}" fill="rgba(16,18,22,.035)" stroke="rgba(16,18,22,.16)" `
    + `stroke-width="${stroke * 0.6}" stroke-dasharray="${1.6 / scale} ${1.2 / scale}"/>`
  ).join('');

  const guides = (piece.guides || []).map((g) =>
    `<line x1="${g.from[0] + pad}" y1="${g.from[1] + pad}" x2="${g.to[0] + pad}" y2="${g.to[1] + pad}" `
    + `stroke="rgba(16,18,22,.3)" stroke-width="${stroke * 0.7}" stroke-dasharray="${g.dash.map((v) => v / scale).join(' ')}"/>`
  ).join('');

  const marks = (piece.marks || []).map((m) => {
    const r = 3.4 / scale;
    return `<g><circle cx="${m.x + pad}" cy="${m.y + pad}" r="${r}" fill="#16181c"/>`
      + `<text x="${m.x + pad}" y="${m.y + pad + r * 0.62}" font-size="${r * 1.25}" `
      + `fill="#fff" text-anchor="middle" font-family="system-ui, sans-serif">${m.n}</text></g>`;
  }).join('');

  const dims = (piece.dims || []).map((dm) =>
    `<text x="${dm.at[0] + pad}" y="${dm.at[1] + pad}" font-size="${9 / scale}" fill="rgba(16,18,22,.45)" `
    + `text-anchor="middle" font-family="system-ui, sans-serif">${escapeXml(dm.label)}</text>`
  ).join('');

  return `<svg viewBox="0 0 ${vbW} ${vbH}" width="100%" xmlns="http://www.w3.org/2000/svg">`
    + `<path d="${d}" fill="#ffffff" stroke="#16181c" stroke-width="${stroke}" stroke-linejoin="round"/>`
    + zones + guides + dims + marks
    + '</svg>';
}

/** Same drawing, into a PDF page. Returns the height consumed in points. */
export function flatToPDF(doc, piece, x, y, maxWidth, maxHeight) {
  const pad = Math.max(6, piece.widthCm * 0.08);
  const vbW = piece.widthCm + pad * 2;
  const vbH = piece.heightCm + pad * 2;
  const scale = Math.min(maxWidth / vbW, maxHeight / vbH);
  const px = (cm) => x + (cm + pad) * scale;
  const py = (cm) => y + (cm + pad) * scale;

  for (const z of piece.zones || []) {
    doc.rect(px(z.rect[0]), py(z.rect[1]),
      (z.rect[2] - z.rect[0]) * scale, (z.rect[3] - z.rect[1]) * scale,
      { fill: '#f4f5f6', stroke: '#c9ced5', width: 0.35, dash: [1.6, 1.4] });
  }

  doc.path(piece.path.map((c) => {
    if (c[0] === 'M' || c[0] === 'L') return [c[0], px(c[1]), py(c[2])];
    if (c[0] === 'Q') return ['Q', px(c[1]), py(c[2]), px(c[3]), py(c[4])];
    if (c[0] === 'C') return ['C', px(c[1]), py(c[2]), px(c[3]), py(c[4]), px(c[5]), py(c[6])];
    return ['Z'];
  }), { stroke: '#16181c', width: 0.9 });

  for (const g of piece.guides || []) {
    doc.line(px(g.from[0]), py(g.from[1]), px(g.to[0]), py(g.to[1]),
      { color: '#8b919b', width: 0.4, dash: g.dash.map((v) => v * scale) });
  }

  for (const dm of piece.dims || []) {
    doc.text(dm.label, px(dm.at[0]), py(dm.at[1]) - 3,
      { size: 5.6, color: '#7a8089', align: 'center' });
  }

  for (const m of piece.marks || []) {
    doc.circle(px(m.x), py(m.y), 5, { fill: '#16181c', stroke: null });
    doc.text(String(m.n), px(m.x), py(m.y) - 3.2,
      { size: 6, font: 'Helvetica-Bold', color: '#ffffff', align: 'center' });
  }

  const usedHeight = vbH * scale;
  doc.text(piece.label, x, y + usedHeight + 3, { size: 7, font: 'Helvetica-Bold' });
  if (piece.note) {
    doc.text(piece.note, x, y + usedHeight + 12, { size: 6, color: '#7a8089' });
  }
  return usedHeight + 22;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
  ));
}
