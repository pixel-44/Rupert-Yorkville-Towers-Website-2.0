// Tailor spec sheet.
//
// This is the deliverable. Everything else in the app exists to produce it, so
// it is written to be handed to someone who has never seen the software: every
// modification carries a zone, a measured placement, a dimension and an
// orderable code, and every number on it comes from the same DesignState the
// 3D view rendered.

import { PDFDoc } from './pdf.js';
import { flatDrawing, flatToPDF } from './flats.js';
import { getTemplate, MEASUREMENT_SETS } from '../catalog/templates.js';
import { getMaterial, getTreatment } from '../catalog/materials.js';
import { itemiseModifications } from '../state/design-state.js';
import { describePlacement, zoneMetrics } from '../render/metrics.js';

const INK = '#16181c';
const MUTED = '#6b717a';
const HAIR = '#d8dbe0';

/**
 * @param {object} state    DesignState
 * @param {{shots?: {label: string, dataUrl: string, width: number, height: number}[]}} opts
 * @returns {Blob}
 */
export function buildSpecPDF(state, { shots = [] } = {}) {
  const template = getTemplate(state.templateId);
  const doc = new PDFDoc({ margin: 44 });
  const W = doc.contentWidth;
  const L = doc.margin;

  header(doc, state, template);
  overview(doc, state, template, L, W);
  if (shots.length) mockups(doc, shots, L, W);
  measurements(doc, state, template, L, W);
  modifications(doc, state, template, L, W);
  patterns(doc, state, L, W);
  notes(doc, L, W);
  paginate(doc);

  return doc.blob();
}

// ── Sections ──────────────────────────────────────────────────────────────

function header(doc, state, template) {
  const L = doc.margin;
  const W = doc.contentWidth;

  doc.text('ATELIER · GARMENT SPECIFICATION', L, doc.y, {
    size: 7.5, font: 'Helvetica-Bold', color: MUTED,
  });
  doc.y += 16;

  doc.text(state.name || template.name, L, doc.y, { size: 21, font: 'Helvetica-Bold' });
  doc.y += 28;

  const sub = `${template.name} · ${cap(template.category)} · ${template.blurb}`;
  doc.y += doc.text(sub, L, doc.y, { size: 8.5, color: MUTED, width: W });
  doc.y += 8;

  doc.line(L, doc.y, L + W, doc.y, { color: INK, width: 1.1 });
  doc.y += 14;
}

function overview(doc, state, template, L, W) {
  const created = new Date(state.createdAt);
  const updated = new Date(state.updatedAt);
  const cols = [
    ['Design ID', state.id],
    ['Base pattern', `${template.name} (${template.id})`],
    ['Fit', cap(template.fitVariant.replace(/-/g, ' '))],
    ['Base size', String(state.size.preset).toUpperCase()],
    ['Units', state.size.unit],
    ['Created', created.toLocaleDateString()],
    ['Last edited', updated.toLocaleDateString()],
  ];

  const colW = W / 4;
  let x = L;
  let row = doc.y;
  cols.forEach((pair, i) => {
    if (i > 0 && i % 4 === 0) { row += 30; x = L; }
    doc.text(pair[0].toUpperCase(), x, row, { size: 6, color: MUTED, font: 'Helvetica-Bold' });
    doc.text(pair[1], x, row + 9, { size: 8.5, width: colW - 10 });
    x += colW;
  });
  doc.y = row + 34;
  rule(doc, L, W);
}

function mockups(doc, shots, L, W) {
  sectionTitle(doc, 'Reference views', L, W);
  const gap = 10;
  const each = (W - gap * (shots.length - 1)) / shots.length;
  const height = each * 1.28;
  doc.ensure(height + 40);

  let x = L;
  for (const shot of shots) {
    doc.rect(x, doc.y, each, height, { fill: '#f7f8f9', stroke: HAIR, width: 0.5 });
    doc.image(shot.dataUrl, x, doc.y, each, height, shot.width, shot.height);
    doc.text(shot.label.toUpperCase(), x + each / 2, doc.y + height + 5,
      { size: 6, color: MUTED, align: 'center', font: 'Helvetica-Bold' });
    x += each + gap;
  }
  doc.y += height + 20;
  rule(doc, L, W);
}

function measurements(doc, state, template, L, W) {
  sectionTitle(doc, 'Finished measurements', L, W);
  const set = MEASUREMENT_SETS[template.measurements];
  const values = state.size.measurements || {};

  const colW = W / 3;
  let x = L;
  let row = doc.y;
  set.fields.forEach((f, i) => {
    if (i > 0 && i % 3 === 0) { row += 30; x = L; }
    if (row > doc.pageHeight - doc.margin - 40) {
      doc.addPage();
      row = doc.y;
      x = L;
    }
    const v = values[f.key];
    doc.text(f.label, x, row, { size: 7.6, color: MUTED });
    doc.text(v != null ? `${v} ${state.size.unit}` : '—', x, row + 10,
      { size: 10, font: 'Helvetica-Bold' });
    doc.text(f.hint, x, row + 21, { size: 5.8, color: MUTED, width: colW - 12 });
    x += colW;
  });
  doc.y = row + 36;

  if (state.size.notes) {
    doc.text('Fit notes', L, doc.y, { size: 6.5, color: MUTED, font: 'Helvetica-Bold' });
    doc.y += 10;
    doc.y += doc.text(state.size.notes, L, doc.y, { size: 8.5, width: W });
    doc.y += 6;
  }
  rule(doc, L, W);
}

function modifications(doc, state, template, L, W) {
  sectionTitle(doc, 'Construction & modifications', L, W);
  const { items } = itemiseModifications(state);

  const cols = [
    { key: 'zoneName', label: 'Zone', w: 0.16 },
    { key: 'label', label: 'Item', w: 0.22 },
    { key: 'code', label: 'Code', w: 0.12 },
    { key: 'detail', label: 'Specification', w: 0.5 },
  ];

  tableHead(doc, cols, L, W);

  let markNo = 0;
  for (const item of items) {
    const mark = item.placement ? (markNo += 1) : null;
    const detailParts = [item.detail];
    if (item.placement) {
      detailParts.push(describePlacement(state.templateId, item.zoneId, item.placement));
    }
    if (item.spec) detailParts.push(item.spec);
    const detail = detailParts.filter(Boolean).join('. ');

    const detailW = W * cols[3].w - 8;
    const rowH = Math.max(
      16,
      doc.textHeight(detail, 7.2, 'Helvetica', detailW, 9.4) + 8
    );

    if (doc.remaining < rowH + 20) {
      doc.addPage();
      tableHead(doc, cols, L, W);
    }

    let x = L;
    doc.text(item.zoneName, x, doc.y + 3, { size: 7.2, color: MUTED, width: W * cols[0].w - 8 });
    x += W * cols[0].w;
    doc.text(`${mark ? `${mark}. ` : ''}${item.label}`, x, doc.y + 3,
      { size: 7.6, font: 'Helvetica-Bold', width: W * cols[1].w - 8 });
    x += W * cols[1].w;
    doc.text(item.code || '—', x, doc.y + 3, { size: 7, color: MUTED });
    x += W * cols[2].w;
    doc.text(detail, x, doc.y + 3, { size: 7.2, width: detailW, leading: 9.4 });

    doc.y += rowH;
    doc.line(L, doc.y, L + W, doc.y, { color: '#eceef1', width: 0.4 });
  }

  doc.y += 12;
  rule(doc, L, W);
}

function tableHead(doc, cols, L, W) {
  let x = L;
  for (const c of cols) {
    doc.text(c.label.toUpperCase(), x, doc.y, { size: 5.8, color: MUTED, font: 'Helvetica-Bold' });
    x += W * c.w;
  }
  doc.y += 11;
  doc.line(L, doc.y, L + W, doc.y, { color: HAIR, width: 0.6 });
  doc.y += 4;
}

function patterns(doc, state, L, W) {
  const { pieces, legend } = flatDrawing(state);
  if (!pieces.length) return;

  doc.addPage();
  doc.text('FLAT PATTERN PIECES', L, doc.y, { size: 7.5, font: 'Helvetica-Bold', color: MUTED });
  doc.y += 14;
  doc.text('Cut from these. Numbered marks match the construction list.', L, doc.y,
    { size: 8.5, color: MUTED });
  doc.y += 16;
  doc.line(L, doc.y, L + W, doc.y, { color: INK, width: 1 });
  doc.y += 16;

  const perRow = 3;
  const cellW = (W - 16 * (perRow - 1)) / perRow;
  const cellH = 190;
  let col = 0;

  for (const piece of pieces) {
    if (col === 0 && doc.remaining < cellH + 10) doc.addPage();
    const x = L + col * (cellW + 16);
    flatToPDF(doc, piece, x, doc.y, cellW, cellH - 26);
    col += 1;
    if (col === perRow) {
      col = 0;
      doc.y += cellH;
    }
  }
  if (col !== 0) doc.y += cellH;

  if (legend.length) {
    doc.ensure(60);
    rule(doc, L, W);
    sectionTitle(doc, 'Mark legend', L, W);
    for (const entry of legend) {
      if (doc.remaining < 18) doc.addPage();
      doc.circle(L + 5, doc.y + 4, 5, { fill: INK, stroke: null });
      doc.text(String(entry.n), L + 5, doc.y + 0.8,
        { size: 6, font: 'Helvetica-Bold', color: '#ffffff', align: 'center' });
      doc.y += doc.text(entry.text, L + 16, doc.y, { size: 7.6, width: W - 16 });
      doc.y += 4;
    }
  }
}

function notes(doc, L, W) {
  doc.ensure(120);
  rule(doc, L, W);
  sectionTitle(doc, 'Production notes', L, W);
  const lines = [
    'Measurements are finished garment dimensions in centimetres, not body measurements. Add seam allowance per house standard; 1 cm is assumed throughout unless a modification states otherwise.',
    'Placements are given as a distance across and down within the named zone, and each zone is outlined on its pattern piece. Where a placement is critical, mark it before cutting.',
    'Material and hardware codes identify the specification, not a supplier. Substitute like for like on weight, hand and finish, and note any substitution on the returned sheet.',
    'Typeface names identify the face to set or digitise from. Width, slant and letter spacing are stated with each text item and are part of the specification.',
    'Wash and distressing effects are shown at their intended final appearance. Sequence them after construction unless the panel would be inaccessible.',
  ];
  for (const line of lines) {
    if (doc.remaining < 34) doc.addPage();
    doc.circle(L + 2, doc.y + 4, 1.6, { fill: MUTED, stroke: null });
    doc.y += doc.text(line, L + 10, doc.y, { size: 7.6, width: W - 10, leading: 10 });
    doc.y += 5;
  }
}

function paginate(doc) {
  doc.pages.forEach((page, i) => {
    const saved = doc.current;
    const savedY = doc.y;
    doc.current = page;
    doc.y = doc.pageHeight - 26;
    doc.line(doc.margin, doc.y - 8, doc.margin + doc.contentWidth, doc.y - 8,
      { color: HAIR, width: 0.4 });
    doc.text('Generated by Atelier', doc.margin, doc.y, { size: 6, color: MUTED });
    doc.text(`${i + 1} / ${doc.pages.length}`,
      doc.margin + doc.contentWidth, doc.y, { size: 6, color: MUTED, align: 'right' });
    doc.current = saved;
    doc.y = savedY;
  });
}

// ── Small helpers ─────────────────────────────────────────────────────────

function sectionTitle(doc, title, L, W) {
  doc.ensure(40);
  doc.text(title.toUpperCase(), L, doc.y, { size: 6.5, font: 'Helvetica-Bold', color: MUTED });
  doc.y += 13;
  void W;
}

function rule(doc, L, W) {
  doc.line(L, doc.y, L + W, doc.y, { color: HAIR, width: 0.6 });
  doc.y += 14;
}

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/**
 * Machine-readable export. A superset of DesignState: the raw design plus every
 * code and measurement resolved, so a downstream system never has to re-derive
 * them from the catalog.
 */
export function buildSpecJSON(state) {
  const template = getTemplate(state.templateId);
  const { items } = itemiseModifications(state);
  const set = MEASUREMENT_SETS[template.measurements];

  return {
    format: 'atelier.spec/1',
    generatedAt: new Date().toISOString(),
    design: state,
    resolved: {
      template: {
        id: template.id, name: template.name, category: template.category,
        fitVariant: template.fitVariant, kind: template.kind,
        build: template.build,
      },
      size: {
        preset: state.size.preset,
        unit: state.size.unit,
        fields: set.fields.map((f) => ({
          key: f.key, label: f.label, hint: f.hint,
          value: state.size.measurements?.[f.key] ?? null,
        })),
        notes: state.size.notes || '',
      },
      zones: state.zones.map((zs) => {
        const zone = template.zones.find((z) => z.id === zs.zoneId);
        const mat = getMaterial(zs.material);
        const metrics = zoneMetrics(state.templateId, zs.zoneId);
        return {
          zoneId: zs.zoneId,
          name: zone?.name,
          group: zone?.group,
          role: zone?.role || 'body',
          panel: zone?.panel,
          sizeCm: metrics
            ? { width: metrics.widthCm, height: metrics.heightCm }
            : null,
          material: mat ? { id: mat.id, name: mat.name, code: mat.code, spec: mat.spec } : null,
          color: zs.color,
          treatment: zs.treatment === 'none' ? null : {
            id: zs.treatment,
            name: getTreatment(zs.treatment).name,
            code: getTreatment(zs.treatment).code,
          },
        };
      }),
      modifications: items.map((item) => ({
        zoneId: item.zoneId,
        zone: item.zoneName,
        kind: item.kind,
        label: item.label,
        code: item.code,
        detail: item.detail,
        instruction: item.spec,
        placement: item.placement
          ? {
            ...item.placement,
            described: describePlacement(state.templateId, item.zoneId, item.placement),
          }
          : null,
      })),
      patternPieces: flatDrawing(state).pieces.map((p) => ({
        id: p.id, label: p.label, note: p.note,
        widthCm: p.widthCm, heightCm: p.heightCm,
        zones: (p.zones || []).map((z) => ({ id: z.id, name: z.name, rectCm: z.rect })),
        marks: p.marks,
      })),
    },
  };
}
