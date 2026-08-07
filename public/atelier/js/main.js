// Application shell: routing, landing, template picker.
//
// Screens are plain sections toggled by a hash route. The studio owns the only
// long-lived object in the app (the WebGL viewer), so it is initialised once and
// re-bound to whichever design is open rather than being torn down per route.

import { CATEGORIES, getCategory, getTemplate, measurementsFor } from './catalog/templates.js';
import { getMaterial } from './catalog/materials.js';
import { store, readLibrary, loadDesign, deleteDesign } from './state/store.js';
import { createDesignState } from './state/design-state.js';
import { h, mount, clear, qs, toast } from './ui/dom.js';
import { categorySilhouette, templateSilhouette } from './ui/silhouettes.js';
import { Studio } from './ui/studio.js';
import { renderReview } from './ui/review.js';
import { OutfitBoard } from './ui/outfit.js';

const screens = {
  home: qs('#screen-home'),
  picker: qs('#screen-picker'),
  studio: qs('#screen-studio'),
  review: qs('#screen-review'),
  outfit: qs('#screen-outfit'),
};

let studio = null;
let outfitBoard = null;
let current = null;

// ── Routing ───────────────────────────────────────────────────────────────

function show(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('is-active', key === name);
  }
  current = name;
  // The viewport only has a size once its screen is displayed.
  if (name === 'studio' && studio) studio.resize();
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);

  if (!parts.length) return renderHome();

  switch (parts[0]) {
    case 'c':
      return renderPicker(parts[1]);
    case 'new':
      return startDesign(parts[1]);
    case 'design':
      return openDesign(parts[1]);
    case 'studio':
      if (!store.state) return go('#/');
      openStudio();
      return;
    case 'review':
      if (!store.state) return go('#/');
      return openReview();
    case 'outfit':
      return openOutfit();
    default:
      return renderHome();
  }
}

window.addEventListener('hashchange', route);

// ── Rail ──────────────────────────────────────────────────────────────────

function setRail(crumbs, actions = []) {
  const crumb = qs('#crumb');
  mount(crumb, crumbs.flatMap((c, i) => [
    i > 0 ? h('span', { style: { color: 'var(--ink-3)' } }, '/') : null,
    c.href
      ? h('button', { class: 'btn-ghost btn btn-sm', onclick: () => go(c.href) }, c.label)
      : h('b', {}, c.label),
  ]).filter(Boolean));
  mount(qs('#rail-actions'), actions);
}

// ── Landing ───────────────────────────────────────────────────────────────

function renderHome() {
  show('home');
  setRail([{ label: 'Studio' }], [
    h('button', { class: 'btn', onclick: () => go('#/outfit') }, 'Mix & Match'),
  ]);

  mount(qs('#category-grid'), CATEGORIES.map((cat) => h('button', {
    class: 'card',
    onclick: () => go(`#/c/${cat.id}`),
  },
  h('div', { class: 'count' }, `${cat.templates.length} fits`),
  h('div', { class: 'figure', html: categorySilhouette(cat.id) }),
  h('h3', {}, cat.name),
  h('p', {}, cat.blurb))));

  renderLibrary();
}

function renderLibrary() {
  const host = qs('#library-section');
  const lib = readLibrary();
  if (!lib.designs.length) return clear(host);

  mount(host,
    h('div', { class: 'section-head' },
      h('h2', {}, 'Your designs'), h('div', { class: 'rule' })),
    h('div', { class: 'grid' }, lib.designs.map((d) => {
      const t = getTemplate(d.templateId);
      if (!t) return null;
      const bodyZone = d.zones.find((z) => !t.zones.find((tz) => tz.id === z.zoneId)?.role);
      const mat = getMaterial(bodyZone?.material);
      const mods = d.zones.reduce((n, z) =>
        n + z.textElements.length + z.graphics.length + z.structuralMods.length + z.hardware.length, 0);
      return h('div', { class: 'card' },
        h('div', { class: 'count' }, `${mods} mod${mods === 1 ? '' : 's'}`),
        h('div', { class: 'figure', html: templateSilhouette(t) }),
        h('h3', {}, d.name || t.name),
        h('p', {}, `${t.name} · ${mat ? mat.name : ''}`),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '13px' } },
          h('button', {
            class: 'btn btn-sm', onclick: () => go(`#/design/${d.id}`),
          }, 'Open'),
          h('button', {
            class: 'btn btn-sm', style: { background: 'transparent', border: '1px solid var(--hair)' },
            onclick: () => {
              if (!confirm(`Delete “${d.name || t.name}”? This cannot be undone.`)) return;
              deleteDesign(d.id);
              renderLibrary();
              toast('Design deleted');
            },
          }, 'Delete')),
        h('div', { class: 'sw', style: {
          position: 'absolute', bottom: '18px', right: '18px',
          width: '20px', height: '20px', borderRadius: '5px',
          background: bodyZone?.color || '#ccc', border: '1px solid rgba(0,0,0,.16)',
        } }));
    }).filter(Boolean)));
}

// ── Template picker ───────────────────────────────────────────────────────

function renderPicker(categoryId) {
  const cat = getCategory(categoryId);
  if (!cat) return go('#/');
  show('picker');
  setRail([{ label: 'Studio', href: '#/' }, { label: cat.name }]);

  qs('#picker-eyebrow').textContent = `${cat.templates.length} base patterns`;
  qs('#picker-title').textContent = cat.name;
  qs('#picker-blurb').textContent = cat.blurb;

  mount(qs('#template-grid'), cat.templates.map((t) => {
    const mat = getMaterial(t.defaults.body);
    return h('button', {
      class: 'card',
      onclick: () => go(`#/new/${t.id}`),
    },
    h('div', { class: 'figure', html: templateSilhouette(t) }),
    h('h3', {}, t.name),
    h('p', {}, t.blurb),
    h('p', { style: { marginTop: '9px', color: 'var(--ink-3)', fontSize: '11px' } },
      `${t.zones.length} editable zones · default ${mat ? mat.name : ''}`));
  }));
}

// ── Design lifecycle ──────────────────────────────────────────────────────

function startDesign(templateId) {
  const template = getTemplate(templateId);
  if (!template) return go('#/');
  const preset = template.measurements === 'bottoms' ? 'w32' : 'm';
  const m = measurementsFor(templateId, preset);
  store.load(createDesignState(templateId, { sizePreset: preset, measurements: m.values }));
  go('#/studio');
}

function openDesign(id) {
  const found = loadDesign(id);
  if (!found) {
    toast('That design could not be opened.', 'warn');
    return go('#/');
  }
  store.load(found);
  go('#/studio');
}

function openStudio() {
  show('studio');
  const template = getTemplate(store.state.templateId);
  setRail(
    [{ label: 'Studio', href: '#/' },
      { label: template.name, href: `#/c/${template.category}` },
      { label: store.state.name || template.name }],
    [
      h('button', { class: 'btn btn-sm', onclick: () => store.undo(), disabled: !store.canUndo, id: 'rail-undo' }, 'Undo'),
      h('button', { class: 'btn btn-sm', onclick: () => store.redo(), disabled: !store.canRedo, id: 'rail-redo' }, 'Redo'),
      h('button', { class: 'btn btn-sm', onclick: () => go('#/outfit') }, 'Mix & Match'),
      h('button', { class: 'btn btn-dark btn-sm', onclick: () => go('#/review') }, 'Review & Export'),
    ]
  );

  if (!studio) studio = new Studio({ store, onNavigate: go });
  studio.open(store.state);
}

function openReview() {
  show('review');
  const template = getTemplate(store.state.templateId);
  setRail(
    [{ label: 'Studio', href: '#/' },
      { label: store.state.name || template.name, href: '#/studio' },
      { label: 'Spec sheet' }],
    [h('button', { class: 'btn btn-sm', onclick: () => go('#/studio') }, 'Back to studio')]
  );
  renderReview(qs('#sheet'), { store, viewer: studio?.viewer, onNavigate: go });
}

function openOutfit() {
  show('outfit');
  setRail([{ label: 'Studio', href: '#/' }, { label: 'Mix & Match' }],
    store.state
      ? [h('button', { class: 'btn btn-sm', onclick: () => go('#/studio') }, 'Back to studio')]
      : []);
  if (!outfitBoard) outfitBoard = new OutfitBoard({ onNavigate: go });
  outfitBoard.open();
}

// Keep the rail's undo/redo state honest as edits land.
store.subscribe(() => {
  if (current !== 'studio') return;
  const u = qs('#rail-undo'), r = qs('#rail-redo');
  if (u) u.disabled = !store.canUndo;
  if (r) r.disabled = !store.canRedo;
});

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (typing) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? store.redo() : store.undo();
  }
});

route();
