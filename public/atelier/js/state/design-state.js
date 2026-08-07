// DesignState — the single source of truth.
//
// The renderer, the spec sheet, the assistant and the manual editor all read and
// write this one object. Nothing about a garment lives anywhere else: if it is
// not in here, it does not reach the tailor.
//
// Every mutation goes through `applyOp`, and every op is checked against the
// template's zone map before it lands. That check is the reason a natural
// language request and a click on a panel can never disagree about what is
// possible — they are the same gate.
//
// Placement convention: `placement.x` and `placement.y` are normalised 0–1
// *within the zone's own box*, not the whole garment. That keeps a chest
// graphic at 50%/40% meaningful regardless of size, and converts cleanly to
// centimetres for the spec sheet via export/measure.js.

import {
  getTemplate, getZone, zoneSupports,
} from '../catalog/templates.js';
import { getMaterial, getTreatment } from '../catalog/materials.js';
import { getHardware, getFinish } from '../catalog/hardware.js';
import { getTypeface, getTechnique } from '../catalog/fonts.js';
import { getGraphic } from '../catalog/graphics.js';

export const SCHEMA_VERSION = 1;

let idCounter = 0;
/** Short, stable, sortable ids. Uniqueness only needs to hold within a design. */
export function newId(prefix = 'el') {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** Build a fresh DesignState for a template at a size preset. */
export function createDesignState(templateId, { sizePreset, measurements } = {}) {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);

  const now = new Date().toISOString();
  const d = template.defaults;

  const zones = template.zones.map((zone) => {
    const role = zone.role || 'body';
    const material = d[role] || d.body;
    const color = role === 'trim' && d.trimColor ? d.trimColor
      : role === 'lining' ? getMaterial(d.lining)?.defaultColor || '#4b4f58'
        : d.color;
    return {
      zoneId: zone.id,
      material,
      color,
      treatment: zone.supports.treatment ? (d.treatment || 'none') : 'none',
      hardware: [],
      textElements: [],
      graphics: [],
      structuralMods: [],
    };
  });

  return {
    id: newId('dsn'),
    schemaVersion: SCHEMA_VERSION,
    name: `${template.name} ${template.category === 'tshirts' ? 'Tee' : ''}`.trim(),
    templateId,
    category: template.category,
    fitVariant: template.fitVariant,
    size: {
      preset: sizePreset || 'm',
      unit: 'cm',
      measurements: measurements || {},
      notes: '',
    },
    zones,
    // Uploaded artwork lives inside the design rather than beside it. A JSON
    // export that references `upload:x` without carrying the bytes is useless to
    // a tailor, so the design stays self-contained.
    assets: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function getZoneState(state, zoneId) {
  return state.zones.find((z) => z.zoneId === zoneId) || null;
}

// ── Capability gate ───────────────────────────────────────────────────────

/**
 * Can this op land on this zone? Returns a reason on failure so the assistant
 * can say something useful instead of silently declining.
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function checkOp(state, op) {
  const template = getTemplate(state.templateId);
  if (!template) return { ok: false, reason: 'This design has no template.' };

  // Ops that are not zone-scoped.
  if (op.type === 'setMeasurement' || op.type === 'setSizePreset'
    || op.type === 'rename' || op.type === 'addAsset') {
    return { ok: true };
  }

  const zone = getZone(state.templateId, op.zoneId);
  if (!zone) {
    return { ok: false, reason: `A ${template.name.toLowerCase()} has no “${op.zoneId}” zone.` };
  }
  const zs = getZoneState(state, op.zoneId);
  if (!zs) return { ok: false, reason: `Zone ${op.zoneId} is missing from this design.` };

  switch (op.type) {
    case 'setMaterial': {
      const mat = getMaterial(op.materialId);
      if (!mat) return { ok: false, reason: `No material called “${op.materialId}”.` };
      if (!mat.categories.includes(state.category)) {
        return { ok: false, reason: `${mat.name} is not offered for ${template.category}.` };
      }
      return { ok: true };
    }
    case 'setColor':
      return zone.supports.color
        ? { ok: true }
        : { ok: false, reason: `The ${zone.name.toLowerCase()} colour is fixed.` };

    case 'setTreatment': {
      if (!zone.supports.treatment) {
        return { ok: false, reason: `The ${zone.name.toLowerCase()} does not take a wash treatment.` };
      }
      const mat = getMaterial(zs.material);
      if (op.treatmentId !== 'none' && !mat?.washable) {
        return { ok: false, reason: `${mat?.name || 'This cloth'} cannot be wash-treated — only denim can.` };
      }
      return { ok: true };
    }

    case 'addText':
    case 'updateText':
      if (!zone.supports.text) {
        return { ok: false, reason: `Text cannot be placed on the ${zone.name.toLowerCase()}.` };
      }
      return { ok: true };

    case 'addGraphic':
    case 'updateGraphic':
      if (!zone.supports.graphic) {
        return { ok: false, reason: `Graphics cannot be placed on the ${zone.name.toLowerCase()}.` };
      }
      return { ok: true };

    case 'addStructuralMod':
    case 'updateStructuralMod': {
      const kind = op.mod?.type || op.patch?.type;
      const subtype = op.mod?.subtype ?? op.patch?.subtype;
      if (kind === 'pocket') {
        if (!zoneSupports(state.templateId, zone.id, 'pockets', subtype)) {
          const offered = zone.supports.pockets;
          return {
            ok: false,
            reason: offered.length
              ? `The ${zone.name.toLowerCase()} takes ${listOf(offered)} pockets, not ${subtype}.`
              : `The ${zone.name.toLowerCase()} cannot carry a pocket.`,
          };
        }
      } else if (kind === 'zipper') {
        if (!zoneSupports(state.templateId, zone.id, 'zippers', subtype)) {
          const offered = zone.supports.zippers;
          return {
            ok: false,
            reason: offered.length
              ? `The ${zone.name.toLowerCase()} takes ${listOf(offered)} zips, not ${subtype}.`
              : `The ${zone.name.toLowerCase()} cannot carry a zip.`,
          };
        }
      } else if (kind === 'rip') {
        if (!zone.supports.rip) {
          return { ok: false, reason: `The ${zone.name.toLowerCase()} is not a distressable panel.` };
        }
      } else if (kind === 'seamExposure') {
        if (!zone.supports.seamExposure) {
          return { ok: false, reason: `The ${zone.name.toLowerCase()} has no seam to expose.` };
        }
      } else if (kind === 'patch') {
        if (!zone.supports.patch) {
          return { ok: false, reason: `A patch cannot be sewn to the ${zone.name.toLowerCase()}.` };
        }
      } else {
        return { ok: false, reason: `Unknown modification “${kind}”.` };
      }
      return { ok: true };
    }

    case 'addHardware':
    case 'updateHardware': {
      const part = getHardware(op.item?.hardwareId || op.patch?.hardwareId);
      if (!part) return { ok: false, reason: 'Unknown hardware part.' };
      if (!zone.supports.hardware.includes(part.kind)) {
        const offered = zone.supports.hardware;
        return {
          ok: false,
          reason: offered.length
            ? `The ${zone.name.toLowerCase()} takes ${listOf(offered)}, not ${part.kind}s.`
            : `The ${zone.name.toLowerCase()} carries no hardware.`,
        };
      }
      return { ok: true };
    }

    case 'removeText': case 'removeGraphic':
    case 'removeStructuralMod': case 'removeHardware':
      return { ok: true };

    default:
      return { ok: false, reason: `Unknown operation “${op.type}”.` };
  }
}

const listOf = (arr) => arr.length === 1 ? arr[0]
  : `${arr.slice(0, -1).join(', ')} or ${arr[arr.length - 1]}`;

// ── Op application ────────────────────────────────────────────────────────

const DEFAULT_PLACEMENT = { x: 0.5, y: 0.5, rotation: 0 };

/**
 * Apply an op to a state object, mutating it.
 *
 * @returns {{ok: boolean, reason?: string, summary?: string, zoneId?: string, elementId?: string}}
 *   `summary` is a short past-tense sentence — the assistant echoes it back and
 *   the change log shows it, so both describe the same event in the same words.
 */
export function applyOp(state, op) {
  const check = checkOp(state, op);
  if (!check.ok) return { ok: false, reason: check.reason };

  const zone = op.zoneId ? getZone(state.templateId, op.zoneId) : null;
  const zs = op.zoneId ? getZoneState(state, op.zoneId) : null;
  const where = zone ? zone.name.toLowerCase() : '';
  let summary = '';
  let elementId;

  switch (op.type) {
    case 'rename':
      state.name = String(op.name || '').slice(0, 80) || state.name;
      summary = `renamed the design to “${state.name}”`;
      break;

    case 'setSizePreset':
      state.size.preset = op.preset;
      if (op.measurements) state.size.measurements = { ...op.measurements };
      summary = `set the base size to ${String(op.preset).toUpperCase()}`;
      break;

    case 'setMeasurement':
      state.size.measurements[op.key] = op.value;
      summary = `set ${op.key} to ${op.value} ${state.size.unit}`;
      break;

    case 'addAsset':
      state.assets[op.assetId] = {
        name: String(op.name || 'Artwork').slice(0, 80),
        dataUrl: op.dataUrl,
        width: op.width, height: op.height,
      };
      summary = `uploaded “${state.assets[op.assetId].name}”`;
      break;

    case 'setMaterial': {
      const mat = getMaterial(op.materialId);
      zs.material = op.materialId;
      // A wash that the new cloth cannot take must not silently persist into
      // the spec sheet as an unorderable instruction.
      if (zs.treatment !== 'none' && !mat.washable) zs.treatment = 'none';
      if (op.adoptDefaultColor) zs.color = mat.defaultColor;
      summary = `changed the ${where} to ${mat.name}`;
      break;
    }

    case 'setColor':
      zs.color = normaliseHex(op.color) || zs.color;
      summary = `recoloured the ${where} to ${zs.color}`;
      break;

    case 'setTreatment': {
      zs.treatment = op.treatmentId;
      const finish = getTreatment(op.treatmentId).name.toLowerCase();
      summary = `applied ${article(finish)} ${finish} to the ${where}`;
      break;
    }

    case 'addText': {
      const el = {
        id: newId('txt'),
        text: String(op.text ?? 'TEXT').slice(0, 64),
        font: getTypeface(op.font).id,
        size: clamp(op.size ?? 4, 0.6, 40),          // centimetres of cap height
        color: normaliseHex(op.color) || '#141417',
        placement: { ...DEFAULT_PLACEMENT, ...op.placement },
        technique: getTechnique(op.technique).id,
        curvature: clamp(op.curvature ?? 0, -1, 1),  // -1 arch down … 1 arch up
        tracking: clamp(op.tracking ?? 0, -0.1, 0.6),
      };
      zs.textElements.push(el);
      elementId = el.id;
      summary = `added “${el.text}” to the ${where} in ${getTypeface(el.font).name}, ${getTechnique(el.technique).name.toLowerCase()}`;
      break;
    }

    case 'updateText': {
      const el = zs.textElements.find((t) => t.id === op.elementId);
      if (!el) return { ok: false, reason: 'That text is no longer on the garment.' };
      Object.assign(el, sanitiseTextPatch(op.patch));
      elementId = el.id;
      summary = `edited the text on the ${where}`;
      break;
    }

    case 'removeText':
      zs.textElements = zs.textElements.filter((t) => t.id !== op.elementId);
      summary = `removed a text element from the ${where}`;
      break;

    case 'addGraphic': {
      if (!op.assetId?.startsWith('upload:') && !getGraphic(op.assetId)) {
        return { ok: false, reason: `No graphic called “${op.assetId}”.` };
      }
      const el = {
        id: newId('gfx'),
        assetId: op.assetId,
        color: normaliseHex(op.color) || '#141417',
        placement: { ...DEFAULT_PLACEMENT, ...op.placement },
        scale: clamp(op.scale ?? 0.4, 0.03, 1.6),
        rotation: op.placement?.rotation ?? 0,
        technique: getTechnique(op.technique || 'print').id,
      };
      zs.graphics.push(el);
      elementId = el.id;
      const label = op.assetId.startsWith('upload:') ? 'your uploaded artwork' : getGraphic(op.assetId).name.toLowerCase();
      summary = `placed ${label} on the ${where}`;
      break;
    }

    case 'updateGraphic': {
      const el = zs.graphics.find((g) => g.id === op.elementId);
      if (!el) return { ok: false, reason: 'That graphic is no longer on the garment.' };
      Object.assign(el, sanitiseGraphicPatch(op.patch));
      elementId = el.id;
      summary = `adjusted a graphic on the ${where}`;
      break;
    }

    case 'removeGraphic':
      zs.graphics = zs.graphics.filter((g) => g.id !== op.elementId);
      summary = `removed a graphic from the ${where}`;
      break;

    case 'addStructuralMod': {
      const mod = {
        id: newId('mod'),
        type: op.mod.type,
        subtype: op.mod.subtype || null,
        placement: { ...DEFAULT_PLACEMENT, ...op.mod.placement },
        params: { ...defaultModParams(op.mod.type, op.mod.subtype), ...op.mod.params },
      };
      zs.structuralMods.push(mod);
      elementId = mod.id;
      summary = describeModAdded(mod, where);
      break;
    }

    case 'updateStructuralMod': {
      const mod = zs.structuralMods.find((m) => m.id === op.elementId);
      if (!mod) return { ok: false, reason: 'That modification is no longer on the garment.' };
      if (op.patch.placement) mod.placement = { ...mod.placement, ...op.patch.placement };
      if (op.patch.params) mod.params = { ...mod.params, ...op.patch.params };
      if (op.patch.subtype) mod.subtype = op.patch.subtype;
      elementId = mod.id;
      summary = `adjusted the ${mod.subtype || mod.type} on the ${where}`;
      break;
    }

    case 'removeStructuralMod':
      zs.structuralMods = zs.structuralMods.filter((m) => m.id !== op.elementId);
      summary = `removed a modification from the ${where}`;
      break;

    case 'addHardware': {
      const part = getHardware(op.item.hardwareId);
      const item = {
        id: newId('hw'),
        hardwareId: part.id,
        finish: getFinish(op.item.finish || part.defaultFinish).id,
        size: op.item.size ?? part.defaultSize,
        count: clamp(Math.round(op.item.count ?? 1), 1, 24),
        placement: { ...DEFAULT_PLACEMENT, ...op.item.placement },
      };
      zs.hardware.push(item);
      elementId = item.id;
      summary = `added ${item.count > 1 ? `${item.count} ` : ''}${part.name.toLowerCase()}${item.count > 1 ? 's' : ''} in ${getFinish(item.finish).name.toLowerCase()} to the ${where}`;
      break;
    }

    case 'updateHardware': {
      const item = zs.hardware.find((h) => h.id === op.elementId);
      if (!item) return { ok: false, reason: 'That hardware is no longer on the garment.' };
      if (op.patch.finish) item.finish = getFinish(op.patch.finish).id;
      if (op.patch.size != null) item.size = op.patch.size;
      if (op.patch.count != null) item.count = clamp(Math.round(op.patch.count), 1, 24);
      if (op.patch.placement) item.placement = { ...item.placement, ...op.patch.placement };
      elementId = item.id;
      summary = `adjusted hardware on the ${where}`;
      break;
    }

    case 'removeHardware':
      zs.hardware = zs.hardware.filter((h) => h.id !== op.elementId);
      summary = `removed hardware from the ${where}`;
      break;
  }

  state.updatedAt = new Date().toISOString();
  return { ok: true, summary, zoneId: op.zoneId, elementId };
}

function describeModAdded(mod, where) {
  switch (mod.type) {
    case 'pocket': return `added a ${mod.subtype} pocket to the ${where}`;
    case 'zipper': return `added a ${mod.subtype} zip to the ${where}`;
    case 'rip': return `distressed the ${where} (${severityWord(mod.params.severity)})`;
    case 'seamExposure': return `exposed the seam on the ${where}`;
    case 'patch': return `sewed a patch onto the ${where}`;
    default: return `modified the ${where}`;
  }
}

/** "a" or "an", so generated sentences read like English. */
export function article(word) {
  return /^[aeiou]/i.test(String(word || '')) ? 'an' : 'a';
}

export function severityWord(v) {
  if (v < 0.3) return 'light';
  if (v < 0.6) return 'moderate';
  if (v < 0.85) return 'heavy';
  return 'shredded';
}

/** Sensible starting parameters so a one-word request still produces a real spec. */
export function defaultModParams(type, subtype) {
  switch (type) {
    case 'pocket':
      return {
        width: subtype === 'coin' ? 8 : subtype === 'cargo' ? 17 : subtype === 'kangaroo' ? 34 : 13,
        height: subtype === 'coin' ? 8 : subtype === 'cargo' ? 20 : subtype === 'welt' ? 2 : 15,
        depth: subtype === 'cargo' ? 4 : 0,
        flap: subtype === 'cargo',
        bartack: true,
      };
    case 'zipper':
      return { length: 16, hardwareId: 'zip-metal', finish: 'antique-brass', gauge: 5, orientation: 'vertical' };
    case 'rip':
      return { severity: 0.5, width: 11, height: 4, underLayer: 'frayed', threads: true };
    case 'seamExposure':
      return { width: 1.2, style: 'raw-edge', stitch: 'single-needle', threadColor: '#e8e0cf' };
    case 'patch':
      return { width: 8, height: 8, shape: 'shield', border: 'merrowed', color: '#141417' };
    default:
      return {};
  }
}

function sanitiseTextPatch(patch = {}) {
  const out = {};
  if (patch.text != null) out.text = String(patch.text).slice(0, 64);
  if (patch.font != null) out.font = getTypeface(patch.font).id;
  if (patch.size != null) out.size = clamp(patch.size, 0.6, 40);
  if (patch.color != null) out.color = normaliseHex(patch.color) || '#141417';
  if (patch.technique != null) out.technique = getTechnique(patch.technique).id;
  if (patch.curvature != null) out.curvature = clamp(patch.curvature, -1, 1);
  if (patch.tracking != null) out.tracking = clamp(patch.tracking, -0.1, 0.6);
  if (patch.placement != null) out.placement = { ...DEFAULT_PLACEMENT, ...patch.placement };
  return out;
}

function sanitiseGraphicPatch(patch = {}) {
  const out = {};
  if (patch.assetId != null) out.assetId = patch.assetId;
  if (patch.color != null) out.color = normaliseHex(patch.color) || '#141417';
  if (patch.scale != null) out.scale = clamp(patch.scale, 0.03, 1.6);
  if (patch.rotation != null) out.rotation = patch.rotation;
  if (patch.technique != null) out.technique = getTechnique(patch.technique).id;
  if (patch.placement != null) out.placement = { ...DEFAULT_PLACEMENT, ...patch.placement };
  return out;
}

export function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Accepts `#abc`, `#aabbcc`, or `aabbcc`; returns `#aabbcc` or null. */
export function normaliseHex(value) {
  if (typeof value !== 'string') return null;
  let v = value.trim().toLowerCase();
  if (v.startsWith('#')) v = v.slice(1);
  if (/^[0-9a-f]{3}$/.test(v)) v = v.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(v) ? `#${v}` : null;
}

// ── Summaries used by the review screen and the spec sheet ────────────────

/** Flat, ordered list of every modification, for itemising. */
export function itemiseModifications(state) {
  const template = getTemplate(state.templateId);
  const items = [];
  for (const zs of state.zones) {
    const zone = getZone(state.templateId, zs.zoneId);
    if (!zone) continue;
    const mat = getMaterial(zs.material);
    const base = { zoneId: zone.id, zoneName: zone.name, group: zone.group };

    items.push({
      ...base, kind: 'material',
      label: mat ? mat.name : zs.material,
      code: mat ? mat.code : '—',
      detail: `${zs.color.toUpperCase()}${zs.treatment !== 'none' ? ` · ${getTreatment(zs.treatment).name}` : ''}`,
      spec: mat ? mat.spec : '',
      treatmentCode: zs.treatment !== 'none' ? getTreatment(zs.treatment).code : null,
    });

    for (const t of zs.textElements) {
      const face = getTypeface(t.font);
      const tech = getTechnique(t.technique);
      items.push({
        ...base, kind: 'text', elementId: t.id,
        label: `“${t.text}”`,
        code: tech.code,
        detail: `${face.specName} · ${t.size} cm cap height · ${t.color.toUpperCase()}`,
        spec: `${tech.spec}. Set in ${face.specName}${describeSynth(face)}.`,
        placement: t.placement,
      });
    }

    for (const g of zs.graphics) {
      const asset = getGraphic(g.assetId);
      const tech = getTechnique(g.technique);
      items.push({
        ...base, kind: 'graphic', elementId: g.id,
        label: asset ? asset.name : 'Uploaded artwork',
        code: tech.code,
        detail: `${Math.round(g.scale * 100)}% scale · ${Math.round(g.rotation)}° · ${g.color.toUpperCase()}`,
        spec: tech.spec,
        placement: g.placement,
      });
    }

    for (const m of zs.structuralMods) {
      items.push({
        ...base, kind: 'structural', elementId: m.id,
        label: `${cap(m.subtype || m.type)}${m.type === 'pocket' ? ' pocket' : m.type === 'zipper' ? ' zip' : ''}`,
        code: modCode(m),
        detail: describeModParams(m),
        spec: modSpecText(m),
        placement: m.placement,
      });
    }

    for (const h of zs.hardware) {
      const part = getHardware(h.hardwareId);
      const fin = getFinish(h.finish);
      items.push({
        ...base, kind: 'hardware', elementId: h.id,
        label: `${part.name}${h.count > 1 ? ` ×${h.count}` : ''}`,
        code: `${part.code}/${fin.code}`,
        detail: `${h.size} ${part.sizeUnit || 'mm'} · ${fin.name}`,
        spec: part.spec,
        placement: h.placement,
      });
    }
  }
  return { template, items };
}

function describeSynth(face) {
  const bits = [];
  if (face.synth.case === 'upper') bits.push('all caps');
  if (face.synth.width !== 1) bits.push(`${Math.round(face.synth.width * 100)}% width`);
  if (face.synth.slant) bits.push(`${Math.abs(face.synth.slant)}° oblique`);
  if (face.synth.tracking) bits.push(`${(face.synth.tracking * 1000).toFixed(0)}/1000 em tracking`);
  return bits.length ? `, ${bits.join(', ')}` : '';
}

function modCode(m) {
  const map = {
    pocket: { patch: 'ST-PKP', welt: 'ST-PKW', 'zip-welt': 'ST-PKZ', cargo: 'ST-PKC', slant: 'ST-PKS', coin: 'ST-PKN', kangaroo: 'ST-PKK' },
    zipper: { functional: 'ST-ZPF', decorative: 'ST-ZPD', vent: 'ST-ZPV' },
    rip: { null: 'ST-DST' },
    seamExposure: { null: 'ST-SME' },
    patch: { null: 'ST-PCH' },
  };
  return map[m.type]?.[m.subtype] || map[m.type]?.null || 'ST-GEN';
}

function describeModParams(m) {
  const p = m.params;
  switch (m.type) {
    case 'pocket': return `${p.width} × ${p.height} cm${p.flap ? ', flapped' : ''}${p.bartack ? ', bartacked' : ''}`;
    case 'zipper': return `${p.length} cm, #${p.gauge} ${p.orientation}`;
    case 'rip': return `${severityWord(p.severity)}, ${p.width} × ${p.height} cm, ${p.underLayer} backing`;
    case 'seamExposure': return `${p.width} cm ${p.style}, ${p.stitch}`;
    case 'patch': return `${p.width} × ${p.height} cm, ${p.border} edge`;
    default: return '';
  }
}

function modSpecText(m) {
  const p = m.params;
  switch (m.type) {
    case 'pocket':
      return `Cut and set a ${m.subtype} pocket ${p.width} cm wide × ${p.height} cm deep. `
        + `${p.flap ? 'Add a flap with a closure. ' : ''}${p.bartack ? 'Bartack both top corners.' : 'No bartack.'}`;
    case 'zipper':
      return `Set a ${p.length} cm #${p.gauge} ${m.subtype} zip, ${p.orientation}, tape colour to match the panel.`;
    case 'rip':
      return `Distress to ${severityWord(p.severity)} severity across ${p.width} × ${p.height} cm. `
        + `Back the opening with ${p.underLayer === 'frayed' ? 'retained warp threads' : `${p.underLayer} cloth`}; `
        + `${p.threads ? 'leave weft threads spanning the hole.' : 'clear all loose threads.'}`;
    case 'seamExposure':
      return `Expose the seam allowance ${p.width} cm, ${p.style}, ${p.stitch} in the specified thread.`;
    case 'patch':
      return `Apply a ${p.width} × ${p.height} cm ${p.shape} patch with a ${p.border} border.`;
    default: return '';
  }
}

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/** Round-trip safety for saved or imported designs. */
export function validateDesignState(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Not an object.'] };
  if (!getTemplate(raw.templateId)) errors.push(`Unknown template “${raw.templateId}”.`);
  if (!Array.isArray(raw.zones)) errors.push('Missing zones array.');
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`Schema version ${raw.schemaVersion} does not match ${SCHEMA_VERSION}.`);
  }
  return { ok: errors.length === 0, errors };
}
