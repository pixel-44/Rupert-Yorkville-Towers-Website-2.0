// Design Studio — manual click-to-edit.
//
// The inspector is generated from the selected zone's capability record, never
// from a hard-coded list of controls. A zone that does not declare `pockets`
// simply has no pocket section, so the interface cannot offer something the
// garment could not carry — the same gate the assistant answers to.
//
// Edits are dispatched to the store, which re-renders only the panels whose
// zones changed. Continuous controls coalesce into a single undo step and are
// debounced before they reach the renderer, so dragging a slider stays well
// inside the perceived-update budget.

import {
  getTemplate, getZone, zoneGroups, measurementsFor, SIZE_PRESETS, MEASUREMENT_SETS,
} from '../catalog/templates.js';
import {
  materialsFor, getMaterial, treatmentsFor, getTreatment, SWATCHES,
} from '../catalog/materials.js';
import { hardwareOfKind, getHardware, getFinish, FINISHES } from '../catalog/hardware.js';
import { typefacesByClass, getTypeface, TECHNIQUES, getTechnique } from '../catalog/fonts.js';
import { GRAPHICS, getGraphic } from '../catalog/graphics.js';
import { swatchDataUrl } from '../render/texture-lab.js';
import { GarmentViewer, VIEWS } from '../render/scene.js';
import { assetsReady } from '../render/compositor.js';
import { severityWord, newId } from '../state/design-state.js';
import { Assistant } from './assistant.js';
import {
  h, mount, clear, qs, toast, slider, select, chips, textField, colorField, section,
  debounce, fmtPct, fmtDeg,
} from './dom.js';

const POCKET_LABELS = {
  patch: 'Patch', welt: 'Welt', 'zip-welt': 'Zip welt', cargo: 'Cargo',
  slant: 'Slant', coin: 'Coin', kangaroo: 'Kangaroo',
};
const ZIP_LABELS = { functional: 'Functional', decorative: 'Decorative', vent: 'Vent' };
const HW_KIND_LABELS = {
  button: 'Buttons', rivet: 'Rivets', eyelet: 'Eyelets', zipper: 'Zip pulls',
  snap: 'Snaps', drawstring: 'Drawcords', closure: 'Closures', trim: 'Trims',
  cordlock: 'Cord locks',
};

export class Studio {
  constructor({ store, onNavigate }) {
    this.store = store;
    this.onNavigate = onNavigate;
    this.viewer = new GarmentViewer(qs('#viewport'));
    this.selectedZone = null;
    this.openElement = null;
    this.placing = null;
    this.activeView = 'threeQuarter';

    this.viewer.on('zoneclick', (zone) => this.selectZone(zone.id));
    this.viewer.on('zonehover', (zone) => {
      const hint = qs('#stage-hint');
      if (zone && zone.id !== this.selectedZone) {
        hint.textContent = zone.name;
        hint.classList.add('is-visible');
      } else if (!this.placing) {
        hint.classList.remove('is-visible');
      }
    });

    this.assistant = new Assistant({
      store,
      onApplied: (zoneIds) => {
        if (zoneIds?.length) this.selectZone(zoneIds[0], { keepPanel: true });
      },
    });

    this.renderViewBar();

    // The renderer is the slow consumer, so it gets the debounce rather than
    // the store: state stays instantly correct for every other reader.
    this.pushToViewer = debounce((zoneIds) => {
      this.viewer.updateDesign(this.store.state, zoneIds);
    }, 60);

    this.store.subscribe((change) => {
      if (!this.store.state) return;
      const zoneIds = change.type === 'ops' ? change.zoneIds : null;
      this.pushToViewer(zoneIds && zoneIds.length ? zoneIds : null);
      if (change.type === 'history' || change.type === 'load') {
        this.openElement = null;
        this.renderZonebar();
        this.renderInspector();
      } else if (change.source === 'assistant') {
        this.renderZonebar();
        this.renderInspector();
      } else {
        this.refreshZonebarBadges();
      }
    });
  }

  async open(state) {
    qs('#boot').classList.remove('is-done');
    await assetsReady(state);
    this.viewer.setDesign(state);
    if (!this.selectedZone || !getZone(state.templateId, this.selectedZone)) {
      const first = getTemplate(state.templateId).zones[0];
      this.selectedZone = first.id;
    }
    this.viewer.selectZone(this.selectedZone);
    this.viewer.setView(this.activeView);
    this.renderZonebar();
    this.renderInspector();
    this.assistant.bind(state);
    requestAnimationFrame(() => qs('#boot').classList.add('is-done'));
  }

  resize() {
    this.viewer.resize();
  }

  get template() {
    return getTemplate(this.store.state.templateId);
  }

  zoneState(zoneId = this.selectedZone) {
    return this.store.state.zones.find((z) => z.zoneId === zoneId);
  }

  selectZone(zoneId, { keepPanel = false } = {}) {
    if (this.selectedZone !== zoneId) {
      this.selectedZone = zoneId;
      if (!keepPanel) this.openElement = null;
      this.cancelPlacement();
    }
    this.viewer.selectZone(zoneId);
    qs('#stage-hint').classList.remove('is-visible');
    this.renderZonebar();
    this.renderInspector();
  }

  dispatch(ops, opts) {
    const res = this.store.dispatch(ops, opts);
    if (!res.ok) toast(res.reason, 'warn');
    return res;
  }

  // ── Left rail: zones ────────────────────────────────────────────────────

  renderZonebar() {
    const groups = zoneGroups(this.template.id);
    mount(qs('#zonebar'),
      h('div', { class: 'zonehead' },
        h('h2', {}, this.template.name),
        h('p', {}, `${this.template.zones.length} zones · click the garment or pick below`)),
      h('div', { class: 'zonegroup' }, groups.flatMap((g) => [
        h('h4', {}, g.name),
        ...g.zones.map((z) => {
          const zs = this.zoneState(z.id);
          const count = zs
            ? zs.textElements.length + zs.graphics.length + zs.structuralMods.length + zs.hardware.length
            : 0;
          return h('button', {
            class: `zonebtn${z.id === this.selectedZone ? ' is-active' : ''}`,
            dataset: { zone: z.id },
            onclick: () => this.selectZone(z.id),
          },
          h('span', { class: 'dot', style: { background: zs?.color || '#ccc' } }),
          h('span', { class: 'grow' }, z.name),
          count ? h('span', { class: 'badge' }, String(count)) : null);
        }),
      ])),
      section('Design',
        textField({
          label: 'Name',
          value: this.store.state.name,
          onInput: (v) => this.dispatch({ type: 'rename', name: v }, { coalesce: 'rename' }),
        }),
        h('div', { class: 'hintline' },
          'Saved to this browser automatically. Export from Review to keep a copy.'))
    );
  }

  refreshZonebarBadges() {
    for (const btn of document.querySelectorAll('#zonebar .zonebtn')) {
      const zs = this.zoneState(btn.dataset.zone);
      if (!zs) continue;
      const count = zs.textElements.length + zs.graphics.length
        + zs.structuralMods.length + zs.hardware.length;
      btn.querySelector('.dot').style.background = zs.color;
      let badge = btn.querySelector('.badge');
      if (count && !badge) {
        badge = h('span', { class: 'badge' });
        btn.appendChild(badge);
      }
      if (badge) {
        badge.textContent = String(count);
        badge.style.display = count ? '' : 'none';
      }
    }
  }

  // ── View bar ────────────────────────────────────────────────────────────

  renderViewBar() {
    const bar = qs('#viewbar');
    const buttons = Object.entries(VIEWS).map(([key, v]) => h('button', {
      class: `viewbtn${key === this.activeView ? ' is-active' : ''}`,
      dataset: { view: key },
      onclick: () => {
        this.activeView = key;
        this.viewer.setView(key);
        for (const b of bar.querySelectorAll('.viewbtn[data-view]')) {
          b.classList.toggle('is-active', b.dataset.view === key);
        }
      },
    }, v.label));

    mount(bar, ...buttons,
      h('span', { class: 'sep' }),
      h('button', { class: 'viewbtn', title: 'Zoom out', onclick: () => this.viewer.zoom(1.18) }, '−'),
      h('button', { class: 'viewbtn', title: 'Zoom in', onclick: () => this.viewer.zoom(0.85) }, '+'));
  }

  // ── Right rail: contextual inspector ────────────────────────────────────

  renderInspector() {
    const zone = getZone(this.template.id, this.selectedZone);
    const zs = this.zoneState();
    const host = qs('#inspector');
    if (!zone || !zs) return clear(host);

    const s = zone.supports;
    const parts = [
      h('div', { class: 'zonehead' },
        h('h2', {}, zone.name),
        h('p', {}, `${zone.group}${zone.role ? ` · ${zone.role}` : ''} · ${this.capabilitySummary(zone)}`)),
      this.materialSection(zone, zs),
    ];

    if (s.text) parts.push(this.textSection(zone, zs));
    if (s.graphic) parts.push(this.graphicSection(zone, zs));
    if (s.pockets.length || s.zippers.length || s.rip || s.seamExposure || s.patch) {
      parts.push(this.structureSection(zone, zs));
    }
    if (s.hardware.length) parts.push(this.hardwareSection(zone, zs));
    parts.push(this.sizeSection());

    mount(host, ...parts);
  }

  capabilitySummary(zone) {
    const s = zone.supports;
    const bits = [];
    if (s.text) bits.push('type');
    if (s.graphic) bits.push('graphics');
    if (s.pockets.length) bits.push('pockets');
    if (s.zippers.length) bits.push('zips');
    if (s.rip) bits.push('distressing');
    if (s.hardware.length) bits.push('hardware');
    return bits.length ? bits.join(', ') : 'cloth only';
  }

  // ── Cloth ───────────────────────────────────────────────────────────────

  materialSection(zone, zs) {
    const role = zone.role || 'body';
    const options = materialsFor(this.store.state.category, {
      includeTrims: true,
      includeLinings: role === 'lining',
    });
    const list = role === 'lining'
      ? options.filter((m) => m.lining)
      : options;

    const grid = h('div', { class: 'mat-grid' }, list.map((m) => h('button', {
      class: `mat${m.id === zs.material ? ' is-active' : ''}`,
      title: `${m.name} — ${m.weight} ${m.weightUnit}, ${m.hand}`,
      onclick: () => this.dispatch({ type: 'setMaterial', zoneId: zone.id, materialId: m.id }),
    },
    h('img', { src: swatchDataUrl(m, zs.color, 84), alt: '' }),
    h('span', {}, m.name))));

    const mat = getMaterial(zs.material);
    const treatments = treatmentsFor(zs.material);

    return section('Cloth',
      grid,
      h('div', { class: 'hintline' },
        mat ? `${mat.code} · ${mat.weight} ${mat.weightUnit} · ${mat.hand}` : ''),
      h('div', { style: { height: '13px' } }),
      colorField({
        label: 'Colour',
        value: zs.color,
        swatches: SWATCHES,
        onChange: (v) => this.dispatch(
          { type: 'setColor', zoneId: zone.id, color: v }, { coalesce: `color:${zone.id}` }
        ),
      }),
      zone.supports.treatment && treatments.length > 1
        ? chips({
          label: 'Finish',
          options: treatments.map((t) => ({ value: t.id, label: t.name, title: t.desc })),
          value: zs.treatment,
          onChange: (v) => this.dispatch({ type: 'setTreatment', zoneId: zone.id, treatmentId: v }),
        })
        : null,
      zone.supports.treatment
        ? h('div', { class: 'hintline' }, getTreatment(zs.treatment).desc)
        : null);
  }

  // ── Type ────────────────────────────────────────────────────────────────

  textSection(zone, zs) {
    const rows = zs.textElements.map((t) => this.elementRow({
      id: t.id,
      name: `“${t.text}”`,
      meta: `${getTypeface(t.font).name} · ${t.size} cm · ${getTechnique(t.technique).name}`,
      zone,
      onRemove: () => this.dispatch({ type: 'removeText', zoneId: zone.id, elementId: t.id }),
      editor: () => this.textEditor(zone, t),
    }));

    return section('Type',
      h('div', { class: 'ellist' }, rows.length ? rows : h('div', { class: 'empty' },
        'No lettering on this zone yet.')),
      h('div', { style: { height: '9px' } }),
      h('button', {
        class: 'btn btn-sm',
        onclick: () => {
          const res = this.dispatch({
            type: 'addText', zoneId: zone.id, text: 'ATELIER',
            font: 'geo-caps', size: this.defaultTextSize(zone), color: '#141417',
            technique: 'print', placement: { x: 0.5, y: 0.45, rotation: 0 },
          });
          if (res.ok) {
            this.openElement = res.results[0].elementId;
            this.renderInspector();
          }
        },
      }, '+ Add text'));
  }

  defaultTextSize(zone) {
    // Cap height that reads at arm's length on the panel it sits on.
    const metrics = this.viewer.garment?.metrics?.[zone.panel];
    if (!metrics) return 4;
    const box = (zone.uv[3] - zone.uv[1]) * metrics.heightCm;
    return Math.max(1.2, Math.min(9, Math.round(box * 0.16 * 10) / 10));
  }

  textEditor(zone, t) {
    const faces = typefacesByClass();
    return h('div', {},
      textField({
        label: 'Text', value: t.text, maxLength: 64,
        onInput: (v) => this.patchText(zone, t, { text: v }, `text:${t.id}`),
      }),
      h('div', { class: 'field' },
        h('label', {}, h('span', {}, 'Typeface'), h('span', { class: 'val' }, getTypeface(t.font).specName)),
        h('div', { class: 'select-wrap' },
          h('select', {
            class: 'select',
            onchange: (e) => this.patchText(zone, t, { font: e.target.value }),
          }, faces.map((g) => h('optgroup', { label: g.name },
            g.faces.map((f) => h('option', { value: f.id, selected: f.id === t.font }, f.name))))))),
      slider({
        label: 'Cap height', min: 0.6, max: 24, step: 0.1, value: t.size,
        format: (v) => `${v.toFixed(1)} cm`,
        onInput: (v) => this.patchText(zone, t, { size: v }, `size:${t.id}`),
      }),
      colorField({
        label: 'Ink / thread', value: t.color, swatches: SWATCHES,
        onChange: (v) => this.patchText(zone, t, { color: v }, `tcol:${t.id}`),
      }),
      chips({
        label: 'Technique',
        options: TECHNIQUES.map((x) => ({ value: x.id, label: x.name, title: x.spec })),
        value: t.technique,
        onChange: (v) => this.patchText(zone, t, { technique: v }),
      }),
      h('div', { class: 'hintline' }, getTechnique(t.technique).spec),
      slider({
        label: 'Curve to body', min: -1, max: 1, step: 0.02, value: t.curvature,
        format: (v) => (Math.abs(v) < 0.02 ? 'straight' : `${v > 0 ? 'arch up' : 'arch down'} ${Math.abs(Math.round(v * 100))}%`),
        onInput: (v) => this.patchText(zone, t, { curvature: v }, `curve:${t.id}`),
      }),
      slider({
        label: 'Letter spacing', min: -0.06, max: 0.5, step: 0.01, value: t.tracking,
        format: (v) => `${Math.round(v * 1000)}/1000 em`,
        onInput: (v) => this.patchText(zone, t, { tracking: v }, `track:${t.id}`),
      }),
      this.placementControls(zone, t.placement, (p, coalesce) =>
        this.patchText(zone, t, { placement: { ...t.placement, ...p } }, coalesce), t.id));
  }

  patchText(zone, t, patch, coalesce) {
    this.dispatch({ type: 'updateText', zoneId: zone.id, elementId: t.id, patch },
      { coalesce: coalesce || `txt:${t.id}` });
  }

  // ── Graphics ────────────────────────────────────────────────────────────

  graphicSection(zone, zs) {
    const rows = zs.graphics.map((g) => {
      const asset = getGraphic(g.assetId);
      return this.elementRow({
        id: g.id,
        name: asset ? asset.name : (this.store.state.assets?.[g.assetId]?.name || 'Artwork'),
        meta: `${Math.round(g.scale * 100)}% · ${getTechnique(g.technique).name}`,
        zone,
        onRemove: () => this.dispatch({ type: 'removeGraphic', zoneId: zone.id, elementId: g.id }),
        editor: () => this.graphicEditor(zone, g),
      });
    });

    const library = h('div', { class: 'mat-grid' }, GRAPHICS.map((g) => {
      const preview = document.createElement('canvas');
      preview.width = preview.height = 64;
      g.draw(preview.getContext('2d'), 64, '#2b2e33');
      return h('button', {
        class: 'mat', title: g.name,
        onclick: () => {
          const res = this.dispatch({
            type: 'addGraphic', zoneId: zone.id, assetId: g.id,
            color: '#141417', scale: 0.42, technique: 'print',
            placement: { x: 0.5, y: 0.45, rotation: 0 },
          });
          if (res.ok) {
            this.openElement = res.results[0].elementId;
            this.renderInspector();
          }
        },
      }, h('img', { src: preview.toDataURL(), alt: '' }), h('span', {}, g.name));
    }));

    return section('Graphics',
      h('div', { class: 'ellist' }, rows.length ? rows : h('div', { class: 'empty' },
        'Pick from the library below, or upload your own artwork.')),
      h('div', { style: { height: '11px' } }),
      library,
      h('div', { style: { height: '9px' } }),
      h('label', { class: 'btn btn-sm', style: { display: 'inline-block' } },
        'Upload artwork…',
        h('input', {
          type: 'file', accept: 'image/png,image/jpeg,image/svg+xml,image/webp',
          style: { display: 'none' },
          onchange: (e) => this.uploadGraphic(zone, e.target.files?.[0]),
        })),
      h('div', { class: 'hintline' },
        'PNG with transparency reproduces best. Single-colour artwork can be embroidered; '
        + 'full-colour artwork is printed.'));
  }

  uploadGraphic(zone, file) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      return toast('Artwork must be under 4 MB.', 'warn');
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const assetId = `upload:${newId('img')}`;
        const res = this.dispatch([
          {
            type: 'addAsset', assetId, name: file.name,
            dataUrl: reader.result, width: img.naturalWidth, height: img.naturalHeight,
          },
          {
            type: 'addGraphic', zoneId: zone.id, assetId,
            color: '#141417', scale: 0.45, technique: 'print',
            placement: { x: 0.5, y: 0.45, rotation: 0 },
          },
        ]);
        if (res.ok) {
          this.openElement = res.results[1].elementId;
          this.viewer.updateDesign(this.store.state, [zone.id]);
          this.renderInspector();
          toast('Artwork placed');
        }
      };
      img.onerror = () => toast('That file could not be read as an image.', 'warn');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  graphicEditor(zone, g) {
    const isUpload = g.assetId.startsWith('upload:');
    return h('div', {},
      slider({
        label: 'Scale', min: 0.03, max: 1.4, step: 0.01, value: g.scale,
        format: fmtPct,
        onInput: (v) => this.patchGraphic(zone, g, { scale: v }, `gsc:${g.id}`),
      }),
      slider({
        label: 'Rotation', min: -180, max: 180, step: 1, value: g.rotation,
        format: fmtDeg,
        onInput: (v) => this.patchGraphic(zone, g, { rotation: v }, `grot:${g.id}`),
      }),
      isUpload ? h('div', { class: 'hintline' }, 'Uploaded artwork keeps its own colours.')
        : colorField({
          label: 'Ink / thread', value: g.color, swatches: SWATCHES,
          onChange: (v) => this.patchGraphic(zone, g, { color: v }, `gcol:${g.id}`),
        }),
      chips({
        label: 'Technique',
        options: TECHNIQUES.map((x) => ({ value: x.id, label: x.name, title: x.spec })),
        value: g.technique,
        onChange: (v) => this.patchGraphic(zone, g, { technique: v }),
      }),
      this.placementControls(zone, g.placement, (p, coalesce) =>
        this.patchGraphic(zone, g, { placement: { ...g.placement, ...p } }, coalesce), g.id));
  }

  patchGraphic(zone, g, patch, coalesce) {
    this.dispatch({ type: 'updateGraphic', zoneId: zone.id, elementId: g.id, patch },
      { coalesce: coalesce || `gfx:${g.id}` });
  }

  // ── Structure ───────────────────────────────────────────────────────────

  structureSection(zone, zs) {
    const s = zone.supports;
    const rows = zs.structuralMods.map((m) => this.elementRow({
      id: m.id,
      name: `${POCKET_LABELS[m.subtype] || ZIP_LABELS[m.subtype] || cap(m.type)}${m.type === 'pocket' ? ' pocket' : m.type === 'zipper' ? ' zip' : ''}`,
      meta: m.type === 'rip' ? severityWord(m.params.severity)
        : m.type === 'pocket' ? `${m.params.width} × ${m.params.height} cm`
          : m.type === 'zipper' ? `${m.params.length} cm #${m.params.gauge}`
            : m.type === 'patch' ? `${m.params.width} × ${m.params.height} cm` : m.params.style,
      zone,
      onRemove: () => this.dispatch({ type: 'removeStructuralMod', zoneId: zone.id, elementId: m.id }),
      editor: () => this.modEditor(zone, m),
    }));

    const add = (type, subtype, label) => h('button', {
      class: 'chip',
      onclick: () => {
        const res = this.dispatch({
          type: 'addStructuralMod', zoneId: zone.id,
          mod: { type, subtype, placement: { x: 0.5, y: 0.5, rotation: 0 } },
        });
        if (res.ok) {
          this.openElement = res.results[0].elementId;
          this.renderInspector();
        }
      },
    }, label);

    return section('Structure',
      h('div', { class: 'ellist' }, rows.length ? rows : h('div', { class: 'empty' },
        'Nothing built onto this zone yet.')),
      h('div', { style: { height: '11px' } }),
      s.pockets.length ? h('div', { class: 'field' },
        h('label', {}, h('span', {}, 'Add pocket')),
        h('div', { class: 'chips' }, s.pockets.map((p) => add('pocket', p, POCKET_LABELS[p] || p)))) : null,
      s.zippers.length ? h('div', { class: 'field' },
        h('label', {}, h('span', {}, 'Add zip')),
        h('div', { class: 'chips' }, s.zippers.map((z) => add('zipper', z, ZIP_LABELS[z] || z)))) : null,
      (s.rip || s.seamExposure || s.patch) ? h('div', { class: 'field' },
        h('label', {}, h('span', {}, 'Add treatment')),
        h('div', { class: 'chips' },
          s.rip ? add('rip', null, 'Distressing') : null,
          s.seamExposure ? add('seamExposure', null, 'Exposed seam') : null,
          s.patch ? add('patch', null, 'Sewn patch') : null)) : null);
  }

  modEditor(zone, m) {
    const p = m.params;
    const patch = (params, coalesce) => this.dispatch(
      { type: 'updateStructuralMod', zoneId: zone.id, elementId: m.id, patch: { params } },
      { coalesce: coalesce || `mod:${m.id}` }
    );

    const fields = [];
    if (m.type === 'pocket') {
      fields.push(
        slider({ label: 'Width', min: 4, max: 40, step: 0.5, value: p.width,
          format: (v) => `${v} cm`, onInput: (v) => patch({ width: v }, `pw:${m.id}`) }),
        slider({ label: m.subtype === 'welt' ? 'Opening' : 'Depth', min: 1, max: 34, step: 0.5, value: p.height,
          format: (v) => `${v} cm`, onInput: (v) => patch({ height: v }, `ph:${m.id}`) }),
        m.subtype === 'cargo' ? slider({ label: 'Bellows', min: 0, max: 8, step: 0.5, value: p.depth,
          format: (v) => `${v} cm`, onInput: (v) => patch({ depth: v }, `pd:${m.id}`) }) : null,
        chips({
          label: 'Construction',
          options: [
            { value: 'flap', label: p.flap ? 'Flap ✓' : 'Flap' },
            { value: 'bartack', label: p.bartack ? 'Bartack ✓' : 'Bartack' },
          ],
          value: '',
          onChange: (k) => patch({ [k]: !p[k] }),
        }));
    } else if (m.type === 'zipper') {
      const zips = hardwareOfKind('zipper');
      fields.push(
        slider({ label: 'Length', min: 4, max: 90, step: 1, value: p.length,
          format: (v) => `${v} cm`, onInput: (v) => patch({ length: v }, `zl:${m.id}`) }),
        select({
          label: 'Chain', value: p.hardwareId,
          options: zips.map((z) => ({ value: z.id, label: z.name })),
          onChange: (v) => patch({ hardwareId: v }),
        }),
        select({
          label: 'Finish', value: p.finish,
          options: FINISHES.map((f) => ({ value: f.id, label: f.name })),
          onChange: (v) => patch({ finish: v }),
        }),
        chips({
          label: 'Gauge',
          options: [3, 5, 8, 10].map((g) => ({ value: String(g), label: `#${g}` })),
          value: String(p.gauge),
          onChange: (v) => patch({ gauge: Number(v) }),
        }),
        chips({
          label: 'Run',
          options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }],
          value: p.orientation,
          onChange: (v) => patch({ orientation: v }),
        }));
    } else if (m.type === 'rip') {
      fields.push(
        slider({ label: 'Severity', min: 0.05, max: 1, step: 0.01, value: p.severity,
          format: (v) => severityWord(v), onInput: (v) => patch({ severity: v }, `rs:${m.id}`) }),
        slider({ label: 'Width', min: 2, max: 30, step: 0.5, value: p.width,
          format: (v) => `${v} cm`, onInput: (v) => patch({ width: v }, `rw:${m.id}`) }),
        slider({ label: 'Height', min: 1, max: 20, step: 0.5, value: p.height,
          format: (v) => `${v} cm`, onInput: (v) => patch({ height: v }, `rh:${m.id}`) }),
        chips({
          label: 'Behind the opening',
          options: [
            { value: 'frayed', label: 'Frayed threads' },
            { value: 'lining', label: 'Lining' },
            { value: 'contrast', label: 'Contrast cloth' },
            { value: 'skin', label: 'Open to skin' },
          ],
          value: p.underLayer,
          onChange: (v) => patch({ underLayer: v }),
        }),
        chips({
          label: 'Weft threads',
          options: [{ value: 'yes', label: 'Keep' }, { value: 'no', label: 'Clear' }],
          value: p.threads ? 'yes' : 'no',
          onChange: (v) => patch({ threads: v === 'yes' }),
        }),
        h('div', { class: 'hintline' },
          p.severity > 0.78
            ? 'At this severity the panel opens right through, backed by the layer above.'
            : 'The cloth is abraded and backed, not cut through.'));
    } else if (m.type === 'seamExposure') {
      fields.push(
        slider({ label: 'Allowance', min: 0.4, max: 4, step: 0.1, value: p.width,
          format: (v) => `${v} cm`, onInput: (v) => patch({ width: v }, `sw:${m.id}`) }),
        chips({
          label: 'Edge', options: [
            { value: 'raw-edge', label: 'Raw' },
            { value: 'overlock', label: 'Overlocked' },
            { value: 'flat-fell', label: 'Flat-felled' },
          ],
          value: p.style, onChange: (v) => patch({ style: v }),
        }),
        colorField({
          label: 'Thread', value: p.threadColor, swatches: SWATCHES,
          onChange: (v) => patch({ threadColor: v }, `sc:${m.id}`),
        }));
    } else if (m.type === 'patch') {
      fields.push(
        slider({ label: 'Width', min: 2, max: 30, step: 0.5, value: p.width,
          format: (v) => `${v} cm`, onInput: (v) => patch({ width: v }, `aw:${m.id}`) }),
        slider({ label: 'Height', min: 2, max: 30, step: 0.5, value: p.height,
          format: (v) => `${v} cm`, onInput: (v) => patch({ height: v }, `ah:${m.id}`) }),
        chips({
          label: 'Shape', options: [
            { value: 'shield', label: 'Shield' }, { value: 'circle', label: 'Circle' },
            { value: 'rect', label: 'Rectangle' }, { value: 'rounded', label: 'Rounded' },
          ],
          value: p.shape, onChange: (v) => patch({ shape: v }),
        }),
        colorField({
          label: 'Patch colour', value: p.color, swatches: SWATCHES,
          onChange: (v) => patch({ color: v }, `ac:${m.id}`),
        }));
    }

    fields.push(this.placementControls(zone, m.placement, (pl, coalesce) => this.dispatch(
      { type: 'updateStructuralMod', zoneId: zone.id, elementId: m.id, patch: { placement: { ...m.placement, ...pl } } },
      { coalesce: coalesce || `modp:${m.id}` }
    ), m.id));

    return h('div', {}, fields.filter(Boolean));
  }

  // ── Hardware ────────────────────────────────────────────────────────────

  hardwareSection(zone, zs) {
    const kinds = zone.supports.hardware;
    const rows = zs.hardware.map((item) => {
      const part = getHardware(item.hardwareId);
      return this.elementRow({
        id: item.id,
        name: `${part.name}${item.count > 1 ? ` ×${item.count}` : ''}`,
        meta: `${item.size} ${part.sizeUnit || 'mm'} · ${getFinish(item.finish).name}`,
        zone,
        onRemove: () => this.dispatch({ type: 'removeHardware', zoneId: zone.id, elementId: item.id }),
        editor: () => this.hardwareEditor(zone, item),
      });
    });

    const adders = kinds.flatMap((kind) => {
      const parts = hardwareOfKind(kind);
      if (!parts.length) return [];
      return [h('div', { class: 'field' },
        h('label', {}, h('span', {}, HW_KIND_LABELS[kind] || cap(kind))),
        h('div', { class: 'chips' }, parts.map((part) => h('button', {
          class: 'chip', title: part.spec,
          onclick: () => {
            const res = this.dispatch({
              type: 'addHardware', zoneId: zone.id,
              item: {
                hardwareId: part.id, finish: part.defaultFinish, size: part.defaultSize,
                count: 1, placement: { x: 0.5, y: 0.5, rotation: 0 },
              },
            });
            if (res.ok) {
              this.openElement = res.results[0].elementId;
              this.renderInspector();
            }
          },
        }, part.name))))];
    });

    return section('Hardware',
      h('div', { class: 'ellist' }, rows.length ? rows : h('div', { class: 'empty' },
        'No hardware on this zone yet.')),
      h('div', { style: { height: '11px' } }),
      ...adders);
  }

  hardwareEditor(zone, item) {
    const part = getHardware(item.hardwareId);
    const patch = (p, coalesce) => this.dispatch(
      { type: 'updateHardware', zoneId: zone.id, elementId: item.id, patch: p },
      { coalesce: coalesce || `hw:${item.id}` }
    );
    return h('div', {},
      h('div', { class: 'field' },
        h('label', {}, h('span', {}, 'Finish'), h('span', { class: 'val' }, getFinish(item.finish).code)),
        h('div', { class: 'chips' }, FINISHES.map((f) => h('button', {
          class: `chip${f.id === item.finish ? ' is-active' : ''}`,
          onclick: () => patch({ finish: f.id }),
        },
        h('span', {
          style: {
            display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%',
            background: f.pbr.color, marginRight: '5px',
            border: '1px solid rgba(0,0,0,.25)', verticalAlign: 'middle',
          },
        }),
        f.name)))),
      part.sizes.length > 1 ? chips({
        label: `Size (${part.sizeUnit || 'mm'})`,
        options: part.sizes.map((s) => ({ value: String(s), label: String(s) })),
        value: String(item.size),
        onChange: (v) => patch({ size: Number(v) }),
      }) : null,
      slider({
        label: 'Count', min: 1, max: 12, step: 1, value: item.count,
        format: (v) => String(v),
        onInput: (v) => patch({ count: v }, `hwc:${item.id}`),
      }),
      h('div', { class: 'hintline' }, part.spec),
      this.placementControls(zone, item.placement, (p, coalesce) =>
        patch({ placement: { ...item.placement, ...p } }, coalesce), item.id));
  }

  // ── Shared: placement ───────────────────────────────────────────────────

  /**
   * Placement is expressed as a fraction of the zone, and can be set either
   * numerically or by dragging directly on the garment. Direct placement is the
   * point of a 3D editor, so it is one click away rather than buried.
   */
  placementControls(zone, placement, apply, elementId) {
    const armed = this.placing === elementId;
    return h('div', { style: { borderTop: '1px solid var(--hair)', marginTop: '11px', paddingTop: '11px' } },
      h('button', {
        class: armed ? 'btn btn-dark btn-sm' : 'btn btn-sm',
        style: { width: '100%', marginBottom: '10px' },
        onclick: () => (armed ? this.cancelPlacement() : this.beginPlacement(zone, elementId, apply)),
      }, armed ? 'Placing — click the garment (Esc to stop)' : 'Place on garment'),
      slider({
        label: 'Across', min: 0.02, max: 0.98, step: 0.005, value: placement.x,
        format: fmtPct,
        onInput: (v) => apply({ x: v }, `px:${elementId}`),
      }),
      slider({
        label: 'Down', min: 0.02, max: 0.98, step: 0.005, value: placement.y,
        format: fmtPct,
        onInput: (v) => apply({ y: v }, `py:${elementId}`),
      }),
      slider({
        label: 'Rotation', min: -180, max: 180, step: 1, value: placement.rotation || 0,
        format: fmtDeg,
        onInput: (v) => apply({ rotation: v }, `pr:${elementId}`),
      }));
  }

  beginPlacement(zone, elementId, apply) {
    this.placing = elementId;
    const hint = qs('#stage-hint');
    hint.textContent = `Click or drag on the ${zone.name.toLowerCase()} to position`;
    hint.classList.add('is-visible');
    this.viewer.setPlacementMode(zone.id, (pos, done) => {
      apply({ x: pos.x, y: pos.y }, `place:${elementId}`);
      if (done) {
        // Re-render so the numeric fields catch up with where it landed.
        this.renderInspector();
      }
    });
    this.renderInspector();
    if (!this._escBound) {
      this._escBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.placing) this.cancelPlacement();
      });
    }
  }

  cancelPlacement() {
    if (!this.placing) return;
    this.placing = null;
    this.viewer.setPlacementMode(null);
    qs('#stage-hint').classList.remove('is-visible');
    this.renderInspector();
  }

  /** Collapsed row that expands into its editor when opened. */
  elementRow({ id, name, meta, onRemove, editor }) {
    const open = this.openElement === id;
    const row = h('div', { class: `el${open ? ' is-open' : ''}` },
      h('div', { class: 'grow' },
        h('div', { class: 'name' }, name),
        h('div', { class: 'meta' }, meta)),
      h('button', {
        class: 'iconbtn', title: open ? 'Close' : 'Edit',
        onclick: () => {
          this.openElement = open ? null : id;
          if (this.placing && !open) this.cancelPlacement();
          this.renderInspector();
        },
      }, open ? '▾' : '▸'),
      h('button', {
        class: 'iconbtn', title: 'Remove',
        onclick: () => {
          if (this.openElement === id) this.openElement = null;
          this.cancelPlacement();
          onRemove();
          this.renderInspector();
        },
      }, '✕'));

    return open
      ? h('div', {}, row, h('div', { class: 'el-editor' }, editor()))
      : row;
  }

  // ── Sizing ──────────────────────────────────────────────────────────────

  sizeSection() {
    const state = this.store.state;
    const setId = this.template.measurements;
    const presets = SIZE_PRESETS[setId];
    const fields = MEASUREMENT_SETS[setId].fields;

    return section('Size',
      chips({
        label: 'Base size',
        options: presets.map((p) => ({ value: p.id, label: p.label })),
        value: state.size.preset,
        onChange: (v) => {
          const m = measurementsFor(this.template.id, v);
          this.dispatch({ type: 'setSizePreset', preset: v, measurements: m.values });
          this.renderInspector();
        },
      }),
      h('div', { class: 'hintline' },
        `${fields.length} measurements travel with the spec sheet. Edit them under Review before exporting.`),
      h('div', { style: { height: '9px' } }),
      h('button', {
        class: 'btn btn-sm', style: { width: '100%' },
        onclick: () => this.onNavigate('#/review'),
      }, 'Open spec sheet →'));
  }
}

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
