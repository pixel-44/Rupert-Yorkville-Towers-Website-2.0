// Accessory mix-and-match.
//
// A separate mode on purpose: this is styling, not designing. Nothing here
// edits a garment — an Outfit only references designs by id and accessories by
// id, so opening a design in the studio later and changing it updates every
// outfit that uses it.
//
// Garments appear as real renders of the user's own designs (captured from the
// same 3D pipeline the studio uses), while accessories are flat silhouettes.
// That difference is deliberate: it keeps it obvious which pieces are things
// you have specified and which are styling stand-ins.

import { accessoryCategories, getAccessory } from '../catalog/accessories.js';
import { getTemplate } from '../catalog/templates.js';
import { readLibrary, saveOutfit, deleteOutfit } from '../state/store.js';
import { newId } from '../state/design-state.js';
import { GarmentViewer } from '../render/scene.js';
import { assetsReady } from '../render/compositor.js';
import { h, mount, clear, qs, toast, section, slider, colorField, fmtPct } from './dom.js';
import { SWATCHES } from '../catalog/materials.js';

const FIGURE_SLOTS = { top: 'top', bottom: 'bottom' };

export class OutfitBoard {
  constructor({ onNavigate } = {}) {
    this.onNavigate = onNavigate;
    this.outfit = blankOutfit();
    this.selected = null;
    this.renderCache = new Map();
    this.offscreen = null;
  }

  open() {
    this.library = readLibrary();
    this.renderCatalogue();
    this.renderBoard();
    this.renderSide();
  }

  // ── Left rail: what can go on the figure ────────────────────────────────

  renderCatalogue() {
    const groups = accessoryCategories();
    const designs = this.library.designs;

    mount(qs('#outfit-catalogue'),
      h('div', { class: 'zonehead' },
        h('h2', {}, 'Mix & Match'),
        h('p', {}, 'Drop your designs onto the figure, then style them.')),

      section('Your garments',
        designs.length
          ? h('div', { class: 'garment-pick' }, designs.map((d) => {
            const t = getTemplate(d.templateId);
            if (!t) return null;
            const on = this.outfit.garments.some((g) => g.designId === d.id);
            const body = d.zones.find((z) => !t.zones.find((tz) => tz.id === z.zoneId)?.role);
            return h('button', {
              class: `gpick${on ? ' is-on' : ''}`,
              onclick: () => this.toggleGarment(d),
            },
            h('span', { class: 'sw', style: { background: body?.color || '#ccc' } }),
            h('span', { class: 'grow' },
              h('div', {}, d.name || t.name),
              h('div', { class: 'meta' }, `${t.name} · ${t.kind === 'bottom' ? 'bottom' : 'top'}`)));
          }).filter(Boolean))
          : h('div', { class: 'empty' },
            'No saved designs yet. Design something in the studio and it will appear here.'),
        h('div', { style: { height: '9px' } }),
        h('button', {
          class: 'btn btn-sm', style: { width: '100%' },
          onclick: () => this.onNavigate?.('#/'),
        }, 'Open the studio →')),

      ...groups.map((g) => section(g.name,
        h('div', { class: 'acc-grid' }, g.items.map((a) => {
          const on = this.outfit.accessories.some((x) => x.accessoryId === a.id);
          const preview = document.createElement('canvas');
          preview.width = 96; preview.height = 64;
          const ctx = preview.getContext('2d');
          ctx.save();
          ctx.translate(16, 0);
          a.draw(ctx, 64, '#2b2e33', '#9aa0a8');
          ctx.restore();
          return h('button', {
            class: `acc${on ? ' is-on' : ''}`, title: a.name,
            onclick: () => this.toggleAccessory(a),
          }, preview, h('span', {}, a.name));
        }))))
    );
  }

  // ── Centre: the figure ──────────────────────────────────────────────────

  renderBoard() {
    const host = qs('#mannequin');
    mount(host,
      h('div', { html: mannequinSVG() }),
      ...this.outfit.garments.map((g) => this.garmentNode(g)),
      ...this.outfit.accessories.map((a) => this.accessoryNode(a)));
  }

  garmentNode(placed) {
    const wrap = h('div', {
      class: `placed${this.selected === placed.uid ? ' is-selected' : ''}`,
      style: {
        left: `${placed.x * 100}%`,
        top: `${placed.y * 100}%`,
        width: `${placed.scale * 100}%`,
        zIndex: placed.slot === FIGURE_SLOTS.bottom ? 3 : 4,
      },
    });
    const img = h('img', { alt: placed.name || 'Garment', src: TRANSPARENT_PX });
    wrap.appendChild(img);
    this.captureGarment(placed.designId).then((url) => { if (url) img.src = url; });
    this.makeDraggable(wrap, placed);
    return wrap;
  }

  accessoryNode(placed) {
    const asset = getAccessory(placed.accessoryId);
    if (!asset) return h('span');
    const size = 520 * placed.scale;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.round(size);
    const ctx = canvas.getContext('2d');
    asset.draw(ctx, canvas.width, placed.ink, placed.accent);

    const wrap = h('div', {
      class: `placed${this.selected === placed.uid ? ' is-selected' : ''}`,
      style: {
        left: `${placed.x * 100}%`,
        top: `${placed.y * 100}%`,
        width: `${placed.scale * 100}%`,
        zIndex: String(5 + (placed.z || 0)),
      },
    }, canvas);
    this.makeDraggable(wrap, placed);
    return wrap;
  }

  makeDraggable(el, placed) {
    let dragging = false;
    let startX = 0, startY = 0, originX = 0, originY = 0;
    const board = () => qs('#mannequin').getBoundingClientRect();

    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.selected = placed.uid;
      startX = e.clientX; startY = e.clientY;
      originX = placed.x; originY = placed.y;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
      this.renderSide();
      for (const node of document.querySelectorAll('#mannequin .placed')) {
        node.classList.remove('is-selected');
      }
      el.classList.add('is-selected');
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = board();
      placed.x = clamp01(originX + (e.clientX - startX) / rect.width);
      placed.y = clamp01(originY + (e.clientY - startY) / rect.height);
      el.style.left = `${placed.x * 100}%`;
      el.style.top = `${placed.y * 100}%`;
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = 'grab';
      el.releasePointerCapture?.(e.pointerId);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ── Right rail: the outfit itself ───────────────────────────────────────

  renderSide() {
    const selected = [...this.outfit.garments, ...this.outfit.accessories]
      .find((p) => p.uid === this.selected);

    mount(qs('#outfit-side'),
      h('div', { class: 'zonehead' },
        h('h2', {}, this.outfit.name),
        h('p', {}, `${this.outfit.garments.length} garment${this.outfit.garments.length === 1 ? '' : 's'} · `
          + `${this.outfit.accessories.length} accessor${this.outfit.accessories.length === 1 ? 'y' : 'ies'}`)),

      section('Outfit',
        h('input', {
          class: 'text-input', value: this.outfit.name,
          oninput: (e) => { this.outfit.name = e.target.value.slice(0, 60); },
        }),
        h('div', { style: { height: '9px' } }),
        h('div', { style: { display: 'flex', gap: '6px' } },
          h('button', { class: 'btn btn-sm', onclick: () => this.save() }, 'Save outfit'),
          h('button', { class: 'btn btn-sm', onclick: () => this.clearAll() }, 'Clear')),
        h('div', { class: 'hintline' },
          'Outfits reference your designs — edit a garment in the studio and every outfit '
          + 'using it updates.')),

      selected
        ? section('Selected piece', ...this.pieceControls(selected))
        : section('Selected piece',
          h('div', { class: 'empty' }, 'Click a piece on the figure to move, scale or recolour it.')),

      this.savedOutfitsSection()
    );
  }

  pieceControls(placed) {
    const isAccessory = Boolean(placed.accessoryId);
    const asset = isAccessory ? getAccessory(placed.accessoryId) : null;

    const out = [
      h('p', { class: 'hintline', style: { marginTop: '0' } },
        isAccessory ? asset?.name : (placed.name || 'Garment')),
      slider({
        label: 'Size', min: 0.05, max: 1.2, step: 0.01, value: placed.scale,
        format: fmtPct,
        onInput: (v) => { placed.scale = v; this.renderBoard(); },
      }),
    ];

    if (isAccessory) {
      out.push(
        colorField({
          label: 'Main', value: placed.ink, swatches: SWATCHES,
          onChange: (v) => { placed.ink = v; this.renderBoard(); },
        }),
        colorField({
          label: 'Accent', value: placed.accent, swatches: SWATCHES,
          onChange: (v) => { placed.accent = v; this.renderBoard(); },
        }),
        h('div', { class: 'hintline' },
          'Accessories are styling stand-ins — recolouring one here does not create a spec. '
          + 'To specify an accessory properly, design it as a garment.')
      );
    } else {
      out.push(h('button', {
        class: 'btn btn-sm', style: { width: '100%', marginTop: '4px' },
        onclick: () => this.onNavigate?.(`#/design/${placed.designId}`),
      }, 'Open in the studio →'));
    }

    out.push(h('button', {
      class: 'btn btn-sm', style: { width: '100%', marginTop: '8px' },
      onclick: () => this.remove(placed),
    }, 'Remove from outfit'));
    return out;
  }

  savedOutfitsSection() {
    const outfits = this.library.outfits || [];
    if (!outfits.length) {
      return section('Saved outfits',
        h('div', { class: 'empty' }, 'Nothing saved yet.'));
    }
    return section('Saved outfits',
      h('div', { class: 'garment-pick' }, outfits.map((o) => h('div', {
        class: 'gpick',
      },
      h('span', { class: 'grow' },
        h('div', {}, o.name),
        h('div', { class: 'meta' },
          `${o.garments.length} garments · ${o.accessories.length} accessories`)),
      h('button', {
        class: 'iconbtn', title: 'Load',
        onclick: () => { this.outfit = reviveOutfit(o); this.open(); },
      }, '↺'),
      h('button', {
        class: 'iconbtn', title: 'Delete',
        onclick: () => { deleteOutfit(o.id); this.library = readLibrary(); this.renderSide(); },
      }, '✕')))));
  }

  // ── Mutations ───────────────────────────────────────────────────────────

  toggleGarment(design) {
    const existing = this.outfit.garments.find((g) => g.designId === design.id);
    if (existing) {
      this.outfit.garments = this.outfit.garments.filter((g) => g !== existing);
    } else {
      const template = getTemplate(design.templateId);
      const slot = template.kind === 'bottom' ? FIGURE_SLOTS.bottom : FIGURE_SLOTS.top;
      // Same slot twice would just hide one behind the other.
      this.outfit.garments = this.outfit.garments.filter((g) => g.slot !== slot);
      this.outfit.garments.push({
        uid: newId('pg'),
        designId: design.id,
        name: design.name || template.name,
        slot,
        x: 0.5,
        y: slot === FIGURE_SLOTS.bottom ? 0.68 : 0.33,
        scale: slot === FIGURE_SLOTS.bottom ? 0.95 : 1.0,
      });
    }
    this.renderCatalogue();
    this.renderBoard();
    this.renderSide();
  }

  toggleAccessory(asset) {
    const existing = this.outfit.accessories.find((a) => a.accessoryId === asset.id);
    if (existing) {
      this.outfit.accessories = this.outfit.accessories.filter((a) => a !== existing);
    } else {
      // One item per slot — no two hats, no two pairs of shoes.
      this.outfit.accessories = this.outfit.accessories.filter((a) => {
        const other = getAccessory(a.accessoryId);
        return other?.slot !== asset.slot;
      });
      this.outfit.accessories.push({
        uid: newId('pa'),
        accessoryId: asset.id,
        x: asset.anchor[0],
        y: asset.anchor[1],
        scale: asset.size,
        ink: '#22242a',
        accent: '#b9bcc2',
        z: this.outfit.accessories.length,
      });
    }
    this.renderCatalogue();
    this.renderBoard();
    this.renderSide();
  }

  remove(placed) {
    this.outfit.garments = this.outfit.garments.filter((g) => g !== placed);
    this.outfit.accessories = this.outfit.accessories.filter((a) => a !== placed);
    this.selected = null;
    this.renderCatalogue();
    this.renderBoard();
    this.renderSide();
  }

  clearAll() {
    this.outfit = blankOutfit();
    this.selected = null;
    this.open();
  }

  save() {
    if (!this.outfit.garments.length && !this.outfit.accessories.length) {
      return toast('Add something to the figure first.', 'warn');
    }
    this.outfit.updatedAt = new Date().toISOString();
    saveOutfit(structuredCloneSafe(this.outfit));
    this.library = readLibrary();
    this.renderSide();
    return toast(`Saved “${this.outfit.name}”`);
  }

  // ── Garment renders ─────────────────────────────────────────────────────

  /**
   * Render a saved design's front view once and reuse it. The offscreen viewer
   * is created lazily and shared, because standing up a WebGL context is the
   * expensive part, not drawing into it.
   */
  async captureGarment(designId) {
    const design = this.library.designs.find((d) => d.id === designId);
    if (!design) return null;
    const key = `${designId}:${design.updatedAt}`;
    if (this.renderCache.has(key)) return this.renderCache.get(key);

    try {
      const viewer = this.ensureOffscreen();
      await assetsReady(design);
      viewer.setDesign(design);
      viewer.setView('front');
      const url = viewer.capture('front', 520, 700, { transparent: true });
      this.renderCache.set(key, url);
      return url;
    } catch (err) {
      console.warn('[atelier] could not render garment for the outfit board', err);
      return null;
    }
  }

  ensureOffscreen() {
    if (this.offscreen) return this.offscreen;
    const holder = document.createElement('div');
    // Off-screen but laid out, so the renderer gets a real size.
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:520px;height:700px;';
    const canvas = document.createElement('canvas');
    holder.appendChild(canvas);
    document.body.appendChild(holder);
    this.offscreen = new GarmentViewer(canvas);
    return this.offscreen;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function blankOutfit() {
  return {
    id: newId('fit'),
    name: 'Untitled outfit',
    garments: [],
    accessories: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function reviveOutfit(saved) {
  return {
    ...blankOutfit(),
    ...saved,
    garments: (saved.garments || []).map((g) => ({ uid: newId('pg'), ...g })),
    accessories: (saved.accessories || []).map((a) => ({ uid: newId('pa'), ...a })),
  };
}

function structuredCloneSafe(obj) {
  return typeof structuredClone === 'function'
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** A plain figure to style against — deliberately anonymous and monochrome. */
function mannequinSVG() {
  return `
<svg viewBox="0 0 100 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="mq" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e7e9ec"/>
      <stop offset=".45" stop-color="#f6f7f8"/>
      <stop offset="1" stop-color="#d9dce0"/>
    </linearGradient>
  </defs>
  <g fill="url(#mq)" stroke="#c8ccd2" stroke-width=".7" stroke-linejoin="round">
    <ellipse cx="50" cy="18" rx="11" ry="13.5"/>
    <path d="M45 30h10v8l14 6c5 2 8 6 8 11v34c0 4-2 7-5 8l-3 1v40c0 3-1 6-2 9l-6 38c-1 5-2 8-4 10h-9c-1-3-1-6-1-9l-2-42-2 42c0 3 0 6-1 9h-9c-2-2-3-5-4-10l-6-38c-1-3-2-6-2-9v-40l-3-1c-3-1-5-4-5-8V55c0-5 3-9 8-11l14-6z"/>
  </g>
  <ellipse cx="50" cy="236" rx="26" ry="4" fill="rgba(16,18,22,.09)"/>
</svg>`;
}

export { blankOutfit };
export function clearOutfitHost() {
  clear(qs('#mannequin'));
}
