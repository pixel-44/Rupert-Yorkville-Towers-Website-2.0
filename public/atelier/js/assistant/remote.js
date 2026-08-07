// Optional Claude-backed interpreter.
//
// The local intent engine (assistant/intent.js) is the default and needs no
// configuration. When the deployment has an ANTHROPIC_API_KEY set, this module
// routes the request through a serverless function that asks Claude to produce
// the same op list, which handles phrasing the local grammar does not cover.
//
// Two things are non-negotiable about that path:
//
//   1. The model is told what this specific garment can carry, and every op it
//      returns is still checked against the zone map on the way back in. A
//      model that invents a hood on a pair of jeans gets the same refusal a
//      user would.
//   2. It degrades to the local engine on any failure — no key, cold start,
//      timeout, rate limit. The assistant never stops working because a network
//      call did.

import { getTemplate } from '../catalog/templates.js';
import { materialsFor, TREATMENTS, SWATCHES } from '../catalog/materials.js';
import { HARDWARE, FINISHES } from '../catalog/hardware.js';
import { TYPEFACES, TECHNIQUES } from '../catalog/fonts.js';
import { GRAPHICS } from '../catalog/graphics.js';
import { validateOps } from './intent.js';

// Host pages can point this elsewhere, or set it to null to skip the remote
// path entirely — which is what a static embed with no backend behind it wants,
// so it never fires a request that can only fail.
const ENDPOINT = 'ATELIER_ASSISTANT_ENDPOINT' in globalThis
  ? globalThis.ATELIER_ASSISTANT_ENDPOINT
  : '/api/assistant';
const TIMEOUT_MS = 9000;

let availability = null;   // null = unknown, true/false once probed

/** Is a remote interpreter configured for this deployment? Probed once. */
export async function remoteAvailable() {
  if (availability !== null) return availability;
  if (!ENDPOINT) { availability = false; return false; }
  try {
    const res = await fetch(ENDPOINT, { method: 'GET' });
    if (!res.ok) { availability = false; return false; }
    const body = await res.json();
    availability = Boolean(body.configured);
  } catch {
    availability = false;
  }
  return availability;
}

/**
 * Ask the model to interpret a request.
 *
 * @returns {Promise<{ops: object[], notes: string[], rejected: string[],
 *                    clarify: object|null, understood: boolean, reply?: string}|null>}
 *   null when the remote path is unavailable — callers fall back to the local engine.
 */
export async function interpretRemote(input, state, context = {}) {
  if (!(await remoteAvailable())) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input,
        brief: buildBrief(state, context),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || !Array.isArray(body.ops)) return null;

    // The model proposes; the zone map disposes.
    const validated = validateOps(body.ops.map(fromWireOp).filter(Boolean), state);
    validated.reply = typeof body.reply === 'string' ? body.reply : '';
    if (body.clarify && body.clarify.question) {
      validated.clarify = {
        question: String(body.clarify.question).slice(0, 200),
        options: (body.clarify.options || []).slice(0, 4).map((label) => ({
          label: String(label).slice(0, 60),
          patch: { freeText: String(label).slice(0, 60) },
        })),
      };
    }
    if (Array.isArray(body.notes)) {
      validated.notes.push(...body.notes.map((n) => String(n).slice(0, 160)).slice(0, 4));
    }
    return validated;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Everything the model is allowed to choose from, derived from the live catalog
 * so the two can never drift. Sent per request; it is small enough that the
 * clarity is worth more than the bytes.
 */
function buildBrief(state, context) {
  const template = getTemplate(state.templateId);
  return {
    template: {
      id: template.id, name: template.name,
      category: template.category, fit: template.fitVariant,
    },
    selectedZone: context.selectedZone || null,
    zones: template.zones.map((z) => ({
      id: z.id,
      name: z.name,
      role: z.role || 'body',
      can: {
        text: z.supports.text,
        graphic: z.supports.graphic,
        pockets: z.supports.pockets,
        zippers: z.supports.zippers,
        rip: z.supports.rip,
        seamExposure: z.supports.seamExposure,
        patch: z.supports.patch,
        hardware: z.supports.hardware,
        treatment: z.supports.treatment,
      },
      current: summariseZone(state, z.id),
    })),
    catalog: {
      materials: materialsFor(state.category, { includeTrims: true, includeLinings: true })
        .map((m) => ({ id: m.id, name: m.name })),
      treatments: TREATMENTS.map((t) => t.id),
      graphics: GRAPHICS.map((g) => ({ id: g.id, name: g.name })),
      fonts: TYPEFACES.map((f) => ({ id: f.id, name: f.name })),
      techniques: TECHNIQUES.map((t) => t.id),
      hardware: HARDWARE.map((h) => ({ id: h.id, name: h.name, kind: h.kind })),
      finishes: FINISHES.map((f) => f.id),
      swatches: SWATCHES.map((s) => `${s.name} ${s.hex}`),
    },
  };
}

function summariseZone(state, zoneId) {
  const zs = state.zones.find((z) => z.zoneId === zoneId);
  if (!zs) return null;
  return {
    material: zs.material, color: zs.color, treatment: zs.treatment,
    counts: {
      text: zs.textElements.length, graphics: zs.graphics.length,
      structural: zs.structuralMods.length, hardware: zs.hardware.length,
    },
  };
}

/**
 * The wire format is deliberately flatter than DesignState's op shape, so the
 * model fills one predictable object rather than a nested union.
 */
function fromWireOp(op) {
  if (!op || typeof op !== 'object' || !op.action) return null;
  const zoneId = op.zoneId;
  const placement = {
    x: num(op.x, 0.5), y: num(op.y, 0.45), rotation: num(op.rotation, 0),
  };

  switch (op.action) {
    case 'setMaterial':
      return { type: 'setMaterial', zoneId, materialId: op.materialId };
    case 'setColor':
      return { type: 'setColor', zoneId, color: op.color };
    case 'setTreatment':
      return { type: 'setTreatment', zoneId, treatmentId: op.treatmentId };
    case 'addText':
      return {
        type: 'addText', zoneId, text: op.text, font: op.font,
        technique: op.technique, size: num(op.sizeCm, 4),
        color: op.color || '#141417', curvature: num(op.curvature, 0), placement,
      };
    case 'addGraphic':
      return {
        type: 'addGraphic', zoneId, assetId: op.assetId,
        color: op.color || '#141417', technique: op.technique,
        scale: num(op.scale, 0.42), placement,
      };
    case 'addPocket':
      return {
        type: 'addStructuralMod', zoneId,
        mod: {
          type: 'pocket', subtype: op.subtype, placement,
          params: sized(op, { flap: op.subtype === 'cargo', bartack: true }),
        },
      };
    case 'addZipper':
      return {
        type: 'addStructuralMod', zoneId,
        mod: {
          type: 'zipper', subtype: op.subtype || 'functional', placement,
          params: {
            length: num(op.widthCm, 16), gauge: 5, orientation: 'vertical',
            hardwareId: op.hardwareId || 'zip-metal', finish: op.finish || 'gunmetal',
          },
        },
      };
    case 'addRip':
      return {
        type: 'addStructuralMod', zoneId,
        mod: {
          type: 'rip', placement,
          params: {
            severity: num(op.severity, 0.5), underLayer: op.subtype || 'frayed',
            threads: true, ...sized(op, {}),
          },
        },
      };
    case 'addSeam':
      return {
        type: 'addStructuralMod', zoneId,
        mod: {
          type: 'seamExposure', placement,
          params: {
            width: num(op.widthCm, 1.2), style: op.subtype || 'raw-edge',
            stitch: 'single-needle', threadColor: op.color || '#e8e0cf',
          },
        },
      };
    case 'addPatch':
      return {
        type: 'addStructuralMod', zoneId,
        mod: {
          type: 'patch', placement,
          params: {
            shape: op.subtype || 'shield', border: 'merrowed',
            color: op.color || '#141417', ...sized(op, {}),
          },
        },
      };
    case 'addHardware':
      return {
        type: 'addHardware', zoneId,
        item: {
          hardwareId: op.hardwareId, finish: op.finish,
          count: num(op.count, 1), placement,
        },
      };
    default:
      return null;
  }
}

function sized(op, extra) {
  const out = { ...extra };
  if (op.widthCm != null) out.width = num(op.widthCm, 12);
  if (op.heightCm != null) out.height = num(op.heightCm, 14);
  return out;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
