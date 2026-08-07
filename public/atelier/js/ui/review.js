// Review & handoff screen.
//
// The sizing form lives here rather than in the studio because measurements are
// a handoff concern, not a design one — you draw the garment first and commit
// to a body second. Everything on this screen is what leaves the app: the
// numbers, the itemised construction list, the flat pieces and the reference
// views are exactly what the PDF and the JSON contain.

import { getTemplate, MEASUREMENT_SETS, SIZE_PRESETS, measurementsFor } from '../catalog/templates.js';
import { getMaterial, getTreatment } from '../catalog/materials.js';
import { itemiseModifications } from '../state/design-state.js';
import { describePlacement } from '../render/metrics.js';
import { flatDrawing, flatToSVG } from '../export/flats.js';
import { buildSpecPDF, buildSpecJSON } from '../export/spec-sheet.js';
import { h, mount, toast, chips, debounce } from './dom.js';

const VIEWS = [
  { id: 'front', label: 'Front' },
  { id: 'threeQuarter', label: 'Three-quarter' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left side' },
];

// Held so a control that changes the whole form (a size preset) can rebuild the
// screen without the caller having to re-supply its context.
let lastRender = null;

export function renderReview(host, ctx) {
  lastRender = { host, ctx };
  const { store, viewer, onNavigate } = ctx;
  const state = store.state;
  const template = getTemplate(state.templateId);
  const shots = captureShots(viewer);

  mount(host,
    h('h1', {}, state.name || template.name),
    h('p', { class: 'lede' },
      `${template.name} · ${cap(template.category)}. Everything below travels with the design — `
      + 'download it as a PDF a tailor can work from, or as JSON for a production system.'),

    sizingSlab(store, template),
    shotsSlab(shots),
    modificationsSlab(state, template),
    patternSlab(state),
    actionBar(store, shots, onNavigate)
  );
}

// ── Reference views ───────────────────────────────────────────────────────

function captureShots(viewer) {
  if (!viewer || !viewer.template) return [];
  try {
    return VIEWS.map((v) => ({
      label: v.label,
      dataUrl: viewer.capture(v.id, 760, 980),
      width: 760,
      height: 980,
    }));
  } catch (err) {
    console.warn('[atelier] could not capture views', err);
    return [];
  }
}

function shotsSlab(shots) {
  return slab('Reference views',
    shots.length
      ? h('div', { class: 'shots' }, shots.map((s) => h('div', { class: 'shot' },
        h('img', { src: s.dataUrl, alt: `${s.label} view` }),
        h('span', {}, s.label))))
      : h('p', { class: 'empty' },
        'Open the studio once to generate reference views for the spec sheet.'));
}

// ── Sizing ────────────────────────────────────────────────────────────────

function sizingSlab(store, template) {
  const state = store.state;
  const set = MEASUREMENT_SETS[template.measurements];
  const presets = SIZE_PRESETS[template.measurements];

  const commit = debounce((key, value) => {
    store.dispatch({ type: 'setMeasurement', key, value }, { coalesce: `m:${key}` });
  }, 220);

  const grid = h('div', { class: 'mgrid' }, set.fields.map((f) => h('div', { class: 'mfield' },
    h('label', {}, f.label),
    h('div', { class: 'row' },
      h('input', {
        type: 'number', step: '0.5', min: '1', max: '400',
        value: state.size.measurements?.[f.key] ?? '',
        oninput: (e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v > 0) commit(f.key, v);
        },
      }),
      h('span', { class: 'unit' }, state.size.unit)),
    h('div', { class: 'hint' }, f.hint))));

  return slab('Measurements',
    chips({
      label: 'Start from a standard size',
      options: presets.map((p) => ({ value: p.id, label: p.label })),
      value: state.size.preset,
      onChange: (v) => {
        const m = measurementsFor(template.id, v);
        store.dispatch({ type: 'setSizePreset', preset: v, measurements: m.values });
        toast(`Reset measurements to ${v.toUpperCase()}`);
        // Every field's value changed at once, so rebuild the whole screen.
        if (lastRender) renderReview(lastRender.host, lastRender.ctx);
      },
    }),
    h('p', { class: 'hintline' },
      'These are finished garment measurements, not body measurements. Adjust any of them — '
      + 'the spec sheet carries whatever you enter here.'),
    h('div', { style: { height: '14px' } }),
    grid,
    h('div', { style: { height: '16px' } }),
    h('div', { class: 'mfield' },
      h('label', {}, 'Fit notes for the tailor'),
      h('textarea', {
        class: 'text-input',
        rows: 3,
        placeholder: 'e.g. I have a long rise — favour room through the seat over the thigh.',
        value: state.size.notes || '',
        oninput: (e) => {
          // Notes ride on the size record and are printed under the measurements.
          store.state.size.notes = e.target.value.slice(0, 600);
          store.scheduleSave();
        },
      })));
}

// ── Modifications ─────────────────────────────────────────────────────────

function modificationsSlab(state, template) {
  const { items } = itemiseModifications(state);
  let markNo = 0;

  const rows = items.map((item) => {
    const mark = item.placement ? (markNo += 1) : null;
    const detail = [
      item.detail,
      item.placement ? describePlacement(state.templateId, item.zoneId, item.placement) : null,
      item.spec,
    ].filter(Boolean).join('. ');

    return h('tr', {},
      h('td', { class: 'zone' }, item.zoneName),
      h('td', {}, h('strong', {}, `${mark ? `${mark}. ` : ''}${item.label}`)),
      h('td', { class: 'code' }, item.code || '—'),
      h('td', {}, detail));
  });

  return slab(`Construction & modifications · ${items.length} items`,
    h('div', { style: { overflowX: 'auto' } },
      h('table', { class: 'mtable' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Zone'), h('th', {}, 'Item'),
          h('th', {}, 'Code'), h('th', {}, 'Specification'))),
        h('tbody', {}, rows))),
    h('p', { class: 'hintline' },
      `Base pattern ${template.name} (${template.id}); ${template.zones.length} zones. `
      + 'Numbered items are marked on the pattern pieces below.'));
}

// ── Pattern pieces ────────────────────────────────────────────────────────

function patternSlab(state) {
  const { pieces, legend } = flatDrawing(state);
  return slab('Flat pattern pieces',
    h('div', { class: 'flats' }, pieces.map((p) => h('div', { class: 'flat' },
      h('div', { html: flatToSVG(p, { width: 300 }) }),
      h('b', {}, `${p.label}${p.note ? ` · ${p.note}` : ''}`)))),
    legend.length
      ? h('div', { style: { marginTop: '16px' } },
        h('p', { class: 'hintline', style: { marginBottom: '6px' } }, 'Mark legend'),
        h('ol', { style: { margin: '0', paddingLeft: '18px', fontSize: '12px', color: 'var(--ink-2)' } },
          legend.map((e) => h('li', { style: { margin: '3px 0' } }, e.text))))
      : null);
}

// ── Export ────────────────────────────────────────────────────────────────

function actionBar(store, shots, onNavigate) {
  return h('div', { class: 'actionbar' },
    h('button', {
      class: 'btn', onclick: () => onNavigate('#/studio'),
    }, 'Keep designing'),
    h('button', {
      class: 'btn', onclick: () => copySummary(store.state),
    }, 'Copy summary'),
    h('button', {
      class: 'btn', onclick: () => downloadJSON(store.state),
    }, 'Download JSON'),
    h('button', {
      class: 'btn btn-dark',
      onclick: (e) => downloadPDF(store.state, shots, e.currentTarget),
    }, 'Download spec sheet (PDF)'));
}

function downloadPDF(state, shots, button) {
  const label = button.textContent;
  button.textContent = 'Building…';
  button.disabled = true;
  // Yield a frame so the label paints before the synchronous build starts.
  requestAnimationFrame(() => {
    try {
      const blob = buildSpecPDF(state, { shots });
      save(blob, `${slug(state.name)}-spec.pdf`);
      toast('Spec sheet downloaded');
    } catch (err) {
      console.error('[atelier] PDF build failed', err);
      toast('Could not build the PDF — see the console for details.', 'warn');
    } finally {
      button.textContent = label;
      button.disabled = false;
    }
  });
}

function downloadJSON(state) {
  const json = JSON.stringify(buildSpecJSON(state), null, 2);
  save(new Blob([json], { type: 'application/json' }), `${slug(state.name)}-spec.json`);
  toast('JSON downloaded');
}

/** Plain text for pasting into a message to a tailor — sharing without accounts. */
async function copySummary(state) {
  const template = getTemplate(state.templateId);
  const { items } = itemiseModifications(state);
  const set = MEASUREMENT_SETS[template.measurements];

  const lines = [
    `${state.name || template.name}`,
    `Base pattern: ${template.name} (${template.category}, ${template.fitVariant})`,
    '',
    'MEASUREMENTS (finished garment, cm)',
    ...set.fields.map((f) => `  ${f.label}: ${state.size.measurements?.[f.key] ?? '—'}`),
    state.size.notes ? `  Notes: ${state.size.notes}` : null,
    '',
    'CLOTH',
    ...state.zones.map((zs) => {
      const zone = template.zones.find((z) => z.id === zs.zoneId);
      const mat = getMaterial(zs.material);
      const treat = zs.treatment !== 'none' ? ` · ${getTreatment(zs.treatment).name}` : '';
      return `  ${zone?.name}: ${mat?.name} (${mat?.code}) ${zs.color.toUpperCase()}${treat}`;
    }),
    '',
    'MODIFICATIONS',
    ...items.filter((i) => i.kind !== 'material').map((i, n) =>
      `  ${n + 1}. [${i.zoneName}] ${i.label} — ${i.code} — ${i.detail}`
      + (i.placement ? ` — ${describePlacement(state.templateId, i.zoneId, i.placement)}` : '')),
    '',
    'Full spec sheet with pattern diagrams available as a PDF.',
  ].filter((l) => l !== null);

  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('Summary copied to the clipboard');
  } catch {
    save(new Blob([text], { type: 'text/plain' }), `${slug(state.name)}-summary.txt`);
    toast('Clipboard unavailable — downloaded as a text file instead');
  }
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Shared bits ───────────────────────────────────────────────────────────

function slab(title, ...body) {
  return h('section', { class: 'slab' },
    h('header', {}, h('span', {}, title), h('span', { class: 'rule' })),
    h('div', { class: 'inner' }, body));
}

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const slug = (s) => String(s || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
