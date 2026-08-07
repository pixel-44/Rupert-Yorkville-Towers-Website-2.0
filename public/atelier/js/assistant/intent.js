// Intent engine: natural language → DesignState operations.
//
// This is the assistant's reasoning layer, and it runs entirely in the browser
// with no configuration. It is deliberately *not* an open-ended chatbot: it
// parses a request into concrete edits, resolves each edit to a zone, checks
// every one against that zone's capability record, and reports what it could
// not do and why.
//
// The three rules from the product spec are enforced here, in order:
//
//   1. Never propose something the template cannot carry. Every op goes through
//      `checkOp` before it is returned, so "put a hood on these jeans" comes
//      back as a refusal with the reason, not as a broken edit.
//   2. Ask only on genuine ambiguity. A pocket on a zone that offers patch,
//      welt and cargo is genuinely ambiguous, so it asks. Everything else takes
//      the common default and says so.
//   3. Say exactly what changed, in the same words the change log uses.
//
// When a Claude-backed interpreter is configured (see assistant/remote.js) it
// produces the same op list and is validated through the same gate — the model
// is never trusted to know what a garment can carry.

import { getTemplate, getZone } from '../catalog/templates.js';
import {
  MATERIALS, TREATMENTS, SWATCHES, getMaterial, materialsFor,
} from '../catalog/materials.js';
import { HARDWARE, FINISHES } from '../catalog/hardware.js';
import { TYPEFACES, TECHNIQUES } from '../catalog/fonts.js';
import { GRAPHICS } from '../catalog/graphics.js';
import { checkOp, normaliseHex, defaultModParams } from '../state/design-state.js';
import { fitTextSize } from '../render/metrics.js';

// ── Lexicons ──────────────────────────────────────────────────────────────

const COLOR_WORDS = {
  black: '#141417', 'jet black': '#141417', 'off black': '#26262a',
  white: '#fbfbfc', 'off white': '#f2f1ee', ecru: '#e8e0cf', bone: '#e5e1d8',
  cream: '#efe8d9', ivory: '#f4efe3',
  grey: '#b9bcc2', gray: '#b9bcc2', 'light grey': '#d6d8dc', 'light gray': '#d6d8dc',
  'dark grey': '#4a4d55', 'dark gray': '#4a4d55', charcoal: '#3a3d43', graphite: '#4a4d55',
  heather: '#b9bcc2', silver: '#c8ccd2', chrome: '#e9ecf0',
  navy: '#1d2740', indigo: '#22304a', blue: '#3c5c86', 'light blue': '#7e9cc0',
  'sky blue': '#8fb3d9', cobalt: '#22439b', teal: '#20555c', turquoise: '#2e8b8b',
  red: '#a32a2a', crimson: '#8c1f2f', burgundy: '#5c2230', maroon: '#5c2230',
  wine: '#5c2230', brick: '#8f3b32', rust: '#9a4f2c', orange: '#e2591b',
  'safety orange': '#e2591b', peach: '#e9b48f', coral: '#e0715c',
  pink: '#e4a3b4', 'hot pink': '#e0468b', magenta: '#b8318c', fuchsia: '#b8318c',
  purple: '#5f3d78', violet: '#6b4a8f', lilac: '#a89bc4', lavender: '#b7abd4',
  green: '#2f6b3c', forest: '#26402f', 'forest green': '#26402f',
  olive: '#5d6348', 'olive drab': '#5d6348', sage: '#8d9b7e', mint: '#a8ccb4',
  lime: '#c3d63b', 'acid lime': '#c3d63b',
  yellow: '#e3c34a', butter: '#e8d391', mustard: '#c9992e', gold: '#d4af52',
  brown: '#5a4432', chocolate: '#4a3629', tan: '#b6a181', khaki: '#b9a887',
  camel: '#c2a37a', beige: '#d8cdb8', sand: '#d5c4a1', stone: '#7e9cc0',
};

const ZONE_SYNONYMS = [
  { re: /\b(chest|breast|front (?:panel|of the (?:shirt|tee|top))|pec)\b/, zones: ['chest'] },
  { re: /\b(front hem|lower front|belly|stomach|front pouch|pouch)\b/, zones: ['front-lower'] },
  { re: /\b(upper back|back panel|back yoke area|shoulder blade)\b/, zones: ['back-upper', 'back'] },
  { re: /\b(lower back|back hem)\b/, zones: ['back-lower'] },
  { re: /\bback\b/, zones: ['back-upper', 'back-lower', 'seat'] },
  { re: /\b(yoke)\b/, zones: ['yoke'] },
  { re: /\b(left sleeve|left arm)\b/, zones: ['sleeve-left'] },
  { re: /\b(right sleeve|right arm)\b/, zones: ['sleeve-right'] },
  { multi: true, re: /\b(sleeves?|arms?)\b/, zones: ['sleeve-left', 'sleeve-right'] },
  { re: /\b(left cuff)\b/, zones: ['cuff-left'] },
  { re: /\b(right cuff)\b/, zones: ['cuff-right'] },
  { multi: true, re: /\b(cuffs?|wrists?)\b/, zones: ['cuff-left', 'cuff-right'] },
  { re: /\b(hood)\b/, zones: ['hood'] },
  { re: /\b(hood lining|inside of the hood)\b/, zones: ['hood-lining'] },
  { re: /\b(collar|neck ?line|neckband|neck rib|neck)\b/, zones: ['collar', 'neckband'] },
  { re: /\b(placket|button ?front|front zip|zip front)\b/, zones: ['placket'] },
  { re: /\b(hem band|bottom band|waist rib|hem rib)\b/, zones: ['hem-band'] },
  { re: /\b(left side|left side panel)\b/, zones: ['side-left'] },
  { re: /\b(right side|right side panel)\b/, zones: ['side-right'] },
  { multi: true, re: /\b(sides?|side seams?)\b/, zones: ['side-left', 'side-right'] },
  { re: /\b(waist ?band|waist)\b/, zones: ['waistband'] },
  { re: /\b(seat|butt|bum|rear|back pockets?|arcuate)\b/, zones: ['seat'] },
  { re: /\b(front hip|hip|front pockets?|coin pocket|watch pocket)\b/, zones: ['front-hip'] },
  { re: /\b(fly|zip fly|button fly)\b/, zones: ['fly'] },
  { re: /\b(left knee)\b/, zones: ['knee-left'] },
  { re: /\b(right knee)\b/, zones: ['knee-right'] },
  { multi: true, re: /\b(knees?)\b/, zones: ['knee-left', 'knee-right'] },
  { re: /\b(left thigh)\b/, zones: ['thigh-left'] },
  { re: /\b(right thigh)\b/, zones: ['thigh-right'] },
  { multi: true, re: /\b(thighs?|upper legs?|quads?)\b/, zones: ['thigh-left', 'thigh-right'] },
  { re: /\b(left shin|left calf)\b/, zones: ['shin-left'] },
  { re: /\b(right shin|right calf)\b/, zones: ['shin-right'] },
  { multi: true, re: /\b(shins?|calves|calf|lower legs?)\b/, zones: ['shin-left', 'shin-right'] },
  { re: /\b(left (?:hem|ankle|cuff))\b/, zones: ['hem-left'] },
  { re: /\b(right (?:hem|ankle|cuff))\b/, zones: ['hem-right'] },
  { multi: true, re: /\b(hems?|ankles?|leg openings?)\b/, zones: ['hem-left', 'hem-right', 'hem-band'] },
  { multi: true, re: /\b(legs?)\b/, zones: ['thigh-left', 'thigh-right'] },
  { re: /\b(front)\b/, zones: ['chest', 'front-hip', 'front-lower'] },
];

const POCKET_WORDS = {
  patch: /\bpatch\b/, welt: /\bwelt\b/, 'zip-welt': /\bzip(?:ped|per)? ?welt\b/,
  cargo: /\b(cargo|bellow(?:ed)?|utility)\b/, slant: /\b(slant|slash|scoop)\b/,
  coin: /\b(coin|watch|fifth|5th)\b/, kangaroo: /\b(kangaroo|muff|pouch)\b/,
};

const TECHNIQUE_WORDS = {
  embroider: /\b(embroider(?:ed|y)?|stitch(?:ed)?|satin ?stitch)\b/,
  chainstitch: /\bchain ?stitch(?:ed)?\b/,
  puff: /\bpuff\b/,
  flock: /\bflock(?:ed)?\b/,
  applique: /\bappliqu[ée]\b/,
  print: /\b(print(?:ed)?|screen ?print(?:ed)?|silkscreen)\b/,
};

const FONT_HINTS = [
  { re: /\bblack ?letter|gothic script|old english|fraktur\b/, id: 'blackletter' },
  { re: /\b(script|cursive|handwrit|signature)\b/, id: 'script-bold' },
  { re: /\bbrush\b/, id: 'hand-brush' },
  { re: /\bmarker\b/, id: 'hand-marker' },
  { re: /\bstencil\b/, id: 'stencil' },
  { re: /\b(varsity|collegiate|college|athletic)\b/, id: 'varsity' },
  { re: /\b(engraved|copperplate)\b/, id: 'copper' },
  { re: /\b(typewriter)\b/, id: 'typewriter' },
  { re: /\b(mono ?space|mono)\b/, id: 'mono-bold' },
  { re: /\b(slab)\b/, id: 'slab-bold' },
  { re: /\b(didone|didot|bodoni|fashion)\b/, id: 'didone-bold' },
  { re: /\b(condensed|narrow|compressed)\b/, id: 'cond-bold' },
  { re: /\b(poster|impact|heavy display)\b/, id: 'impact' },
  { re: /\b(geometric|futura)\b/, id: 'geo-bold' },
  { re: /\b(humanist|gill)\b/, id: 'hum-bold' },
  { re: /\b(serif|roman|times|garamond|classical)\b/, id: 'trans-bold' },
  { re: /\b(sans[- ]?serif|sans|helvetica|grotesque|clean|modern)\b/, id: 'grot-bold' },
];

const SEVERITY_WORDS = [
  { re: /\b(subtle|light(?:ly)?|slight(?:ly)?|barely|hint of)\b/, v: 0.22 },
  { re: /\b(moderate(?:ly)?|medium|some)\b/, v: 0.5 },
  { re: /\b(heavy|heavily|hard|serious|badly|really)\b/, v: 0.75 },
  { re: /\b(shred(?:ded)?|destroy(?:ed)?|blown out|thrash(?:ed)?|trash(?:ed)?|wreck(?:ed)?|extreme)\b/, v: 0.95 },
];

// ── Public API ────────────────────────────────────────────────────────────

/**
 * @typedef {object} Interpretation
 * @property {object[]} ops        Validated ops, ready to dispatch.
 * @property {string[]} notes      Assumptions taken, stated to the user.
 * @property {string[]} rejected   Requests the template cannot carry, with reasons.
 * @property {{question: string, options: {label: string, patch: object}[]}|null} clarify
 * @property {boolean} understood  False when nothing at all was recognised.
 */

/**
 * Parse a request into operations against a design.
 *
 * @param {string} input
 * @param {object} state       DesignState
 * @param {{selectedZone?: string}} [context]
 * @returns {Interpretation}
 */
export function interpret(input, state, context = {}) {
  const template = getTemplate(state.templateId);
  const text = normalise(input);
  const result = { ops: [], notes: [], rejected: [], clarify: null, understood: false };
  if (!text || !template) return result;

  const clauses = splitClauses(text);
  for (const clause of clauses) {
    const handled = interpretClause(clause, state, template, context, result);
    if (handled) result.understood = true;
  }
  return result;
}

function normalise(s) {
  return String(s || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();
}

/**
 * Split a request into independent instructions. Splitting on bare "and" would
 * break "black and white", so conjunctions only split when the next fragment
 * actually starts a new instruction.
 */
function splitClauses(text) {
  const rough = text.split(/\s*(?:[;.]|,\s*(?:and|then|also)\b|\band then\b|\balso\b)\s*/i);
  const out = [];
  for (const piece of rough) {
    if (!piece || !piece.trim()) continue;
    const parts = piece.split(/\s+and\s+/i);
    let buffer = '';
    for (const part of parts) {
      if (buffer && startsNewInstruction(part)) {
        out.push(buffer.trim());
        buffer = part;
      } else {
        buffer = buffer ? `${buffer} and ${part}` : part;
      }
    }
    if (buffer.trim()) out.push(buffer.trim());
  }
  return out;
}

const VERB_START = /^\s*(add|put|give|make|set|change|swap|use|apply|place|stick|sew|write|print|embroider|distress|rip|tear|shred|remove|delete|drop|dye|colour|color|wash|turn)\b/i;
const NOUN_START = /^\s*(a|an|the|some)?\s*(pocket|zip|zipper|button|rivet|patch|text|graphic|logo|rips?|holes?|seams?|eyelets?|snaps?|drawcord|drawstring|cord ?lock)\b/i;

function startsNewInstruction(fragment) {
  return VERB_START.test(fragment) || NOUN_START.test(fragment);
}

// ── Clause interpretation ─────────────────────────────────────────────────

function interpretClause(clause, state, template, context, result) {
  const lower = clause.toLowerCase();
  const zones = resolveZones(lower, template);
  let handled = false;

  // Order matters: the most specific readings are tried first, so "patch
  // pocket" is a pocket rather than a sewn-on patch, and a quoted string is
  // lettering rather than a colour name that happens to appear inside it.
  if (matchText(clause, lower, zones, state, template, context, result)) handled = true;
  else if (matchGraphic(lower, zones, state, template, context, result)) handled = true;

  if (matchPocket(lower, zones, state, template, context, result)) handled = true;
  if (matchZipper(lower, zones, state, template, context, result)) handled = true;
  if (matchDistress(lower, zones, state, template, context, result)) handled = true;
  if (matchSeam(lower, zones, state, template, context, result)) handled = true;
  if (matchSewnPatch(lower, zones, state, template, context, result)) handled = true;
  if (matchHardware(lower, zones, state, template, context, result)) handled = true;
  if (matchMaterial(lower, zones, state, template, context, result)) handled = true;
  if (matchTreatment(lower, zones, state, template, context, result)) handled = true;
  if (matchColor(clause, lower, zones, state, template, context, result)) handled = true;

  return handled;
}

/**
 * Zones named in the clause, filtered to those this template actually has.
 *
 * Entries marked `multi` are genuinely plural — "sleeves", "knees" — and fan out
 * across every matching zone. Everything else resolves to a single zone, so
 * "on the back" does not silently print the same graphic three times.
 */
function resolveZones(lower, template) {
  for (const entry of ZONE_SYNONYMS) {
    if (!entry.re.test(lower)) continue;
    const present = entry.zones.filter((id) => template.zones.some((z) => z.id === id));
    if (!present.length) continue;
    return entry.multi ? present : present.slice(0, 1);
  }
  return [];
}

/**
 * Pick the zone an op should land on: what the user named, else what they have
 * selected, else the conventional home for that kind of change.
 */
function pickZone(named, capability, subtype, state, template, context, result) {
  if (named.length) {
    const usable = named.filter((id) => checkOp(state, probeOp(capability, subtype, id)).ok);
    if (usable.length) return usable;
    // Named a zone that cannot take it — report the template's own reason.
    const reason = checkOp(state, probeOp(capability, subtype, named[0])).reason;
    result.rejected.push(reason);
    return [];
  }

  if (context.selectedZone && checkOp(state, probeOp(capability, subtype, context.selectedZone)).ok) {
    const zone = getZone(template.id, context.selectedZone);
    result.notes.push(`used the ${zone.name.toLowerCase()}, the zone you have open`);
    return [context.selectedZone];
  }

  const fallback = template.zones.find((z) => checkOp(state, probeOp(capability, subtype, z.id)).ok);
  if (!fallback) {
    result.rejected.push(`A ${template.name.toLowerCase()} has nowhere that can take that.`);
    return [];
  }
  result.notes.push(`put it on the ${fallback.name.toLowerCase()} — say a different zone to move it`);
  return [fallback.id];
}

/** A minimal op used purely to ask the capability gate a yes/no question. */
function probeOp(capability, subtype, zoneId) {
  switch (capability) {
    case 'text': return { type: 'addText', zoneId, text: 'x' };
    case 'graphic': return { type: 'addGraphic', zoneId, assetId: 'star' };
    case 'pocket': return { type: 'addStructuralMod', zoneId, mod: { type: 'pocket', subtype } };
    case 'zipper': return { type: 'addStructuralMod', zoneId, mod: { type: 'zipper', subtype } };
    case 'rip': return { type: 'addStructuralMod', zoneId, mod: { type: 'rip' } };
    case 'seam': return { type: 'addStructuralMod', zoneId, mod: { type: 'seamExposure' } };
    case 'patch': return { type: 'addStructuralMod', zoneId, mod: { type: 'patch' } };
    case 'hardware': return { type: 'addHardware', zoneId, item: { hardwareId: subtype } };
    case 'material': return { type: 'setMaterial', zoneId, materialId: subtype };
    case 'treatment': return { type: 'setTreatment', zoneId, treatmentId: subtype || 'stonewash' };
    case 'color': return { type: 'setColor', zoneId, color: '#000000' };
    default: return { type: 'setColor', zoneId, color: '#000000' };
  }
}

// ── Individual intents ────────────────────────────────────────────────────

function matchPocket(lower, named, state, template, context, result) {
  if (!/\bpockets?\b/.test(lower)) return false;
  if (/\b(remove|delete|no|without|get rid of)\b[^.]*\bpockets?\b/.test(lower)) return false;

  let subtype = null;
  for (const [id, re] of Object.entries(POCKET_WORDS)) {
    if (re.test(lower)) { subtype = id; break; }
  }

  // Which zones could take a pocket at all?
  const candidates = named.length ? named : null;
  const probeSub = subtype || 'patch';
  let zones = pickZone(candidates || [], 'pocket', probeSub, state, template, context, result);
  if (!zones.length && !subtype) {
    // The default subtype may be wrong for this zone; retry with what it offers.
    const alt = (candidates || template.zones.map((z) => z.id))
      .map((id) => getZone(template.id, id))
      .filter(Boolean)
      .find((z) => z.supports.pockets.length);
    if (alt) {
      result.rejected.pop();
      zones = [alt.id];
    }
  }
  if (!zones.length) return true;

  const zone = getZone(template.id, zones[0]);
  const offered = zone.supports.pockets;

  // Genuine ambiguity: several structurally different pockets are possible and
  // the user named none. This is the one case worth interrupting for.
  if (!subtype && offered.length > 1) {
    result.clarify = {
      question: `Which pocket for the ${zone.name.toLowerCase()}?`,
      options: offered.map((o) => ({
        label: `${cap(o)} pocket`,
        patch: { intent: 'pocket', zoneId: zone.id, subtype: o },
      })),
    };
    return true;
  }

  const chosen = subtype || offered[0];
  const size = readDimensions(lower);
  for (const zoneId of zones) {
    const params = { ...defaultModParams('pocket', chosen), ...size };
    pushOp(state, result, {
      type: 'addStructuralMod', zoneId,
      mod: { type: 'pocket', subtype: chosen, params, placement: pocketPlacement(zoneId) },
    });
  }
  if (!subtype) result.notes.push(`used a ${chosen} pocket, the usual choice there`);
  return true;
}

function pocketPlacement(zoneId) {
  if (zoneId === 'seat') return { x: 0.3, y: 0.4, rotation: 0 };
  if (zoneId === 'chest') return { x: 0.28, y: 0.4, rotation: 0 };
  return { x: 0.5, y: 0.5, rotation: 0 };
}

function matchZipper(lower, named, state, template, context, result) {
  if (!/\bzip(?:per)?s?\b/.test(lower)) return false;
  if (/\bzip(?:ped|per)? ?welt\b/.test(lower)) return false;   // handled as a pocket
  if (/\bpull\b/.test(lower) && /\bzip/.test(lower) && !/\badd\b/.test(lower)) return false;

  const decorative = /\b(decorative|fake|non[- ]?functional|dummy)\b/.test(lower);
  const vent = /\bvent\b/.test(lower);
  const subtype = vent ? 'vent' : decorative ? 'decorative' : 'functional';

  let zones = pickZone(named, 'zipper', subtype, state, template, context, result);
  if (!zones.length) return true;

  const finish = readFinish(lower);
  const chain = readZipChain(lower);
  for (const zoneId of zones) {
    const zone = getZone(template.id, zoneId);
    const sub = zone.supports.zippers.includes(subtype) ? subtype : zone.supports.zippers[0];
    pushOp(state, result, {
      type: 'addStructuralMod', zoneId,
      mod: {
        type: 'zipper', subtype: sub,
        params: { ...defaultModParams('zipper'), hardwareId: chain, finish },
      },
    });
  }
  if (!/\b(brass|chrome|silver|nickel|black|gunmetal|gold|copper)\b/.test(lower)) {
    result.notes.push(`finished the zip in ${FINISHES.find((f) => f.id === finish).name.toLowerCase()}`);
  }
  return true;
}

function matchDistress(lower, named, state, template, context, result) {
  if (!/\b(distress(?:ed|ing)?|rips?|ripped|tears?|torn|holes?|shred(?:ded)?|destroy(?:ed)?|thrash(?:ed)?|blown out)\b/.test(lower)) {
    return false;
  }
  const zones = pickZone(named, 'rip', null, state, template, context, result);
  if (!zones.length) return true;

  let severity = 0.5;
  for (const s of SEVERITY_WORDS) if (s.re.test(lower)) severity = s.v;

  const underLayer = /\bskin\b/.test(lower) ? 'skin'
    : /\b(lining|lined)\b/.test(lower) ? 'lining'
      : /\b(contrast|backing|patch(?:ed)? behind)\b/.test(lower) ? 'contrast' : 'frayed';

  for (const zoneId of zones) {
    pushOp(state, result, {
      type: 'addStructuralMod', zoneId,
      mod: {
        type: 'rip',
        params: { ...defaultModParams('rip'), severity, underLayer, ...readDimensions(lower) },
      },
    });
  }
  return true;
}

function matchSeam(lower, named, state, template, context, result) {
  if (!/\bseams?\b/.test(lower)) return false;
  if (!/\b(expos|raw|outward|external|visible|contrast)\b/.test(lower)) return false;
  const zones = pickZone(named, 'seam', null, state, template, context, result);
  if (!zones.length) return true;

  const style = /\bovlerlock|overlock(?:ed)?\b/.test(lower) ? 'overlock'
    : /\bflat[- ]?fell(?:ed)?\b/.test(lower) ? 'flat-fell' : 'raw-edge';
  const color = readColor(lower);
  for (const zoneId of zones) {
    pushOp(state, result, {
      type: 'addStructuralMod', zoneId,
      mod: {
        type: 'seamExposure',
        params: { ...defaultModParams('seamExposure'), style, threadColor: color || '#e8e0cf' },
      },
    });
  }
  return true;
}

function matchSewnPatch(lower, named, state, template, context, result) {
  if (!/\bpatch(?:es)?\b/.test(lower)) return false;
  if (/\bpatch ?pocket\b/.test(lower)) return false;
  const zones = pickZone(named, 'patch', null, state, template, context, result);
  if (!zones.length) return true;

  const shape = /\bcircle|round\b/.test(lower) ? 'circle'
    : /\brectangle|square\b/.test(lower) ? 'rect'
      : /\bshield\b/.test(lower) ? 'shield' : 'rounded';
  const color = readColor(lower);
  for (const zoneId of zones) {
    pushOp(state, result, {
      type: 'addStructuralMod', zoneId,
      mod: {
        type: 'patch',
        params: {
          ...defaultModParams('patch'), shape,
          color: color || '#141417', ...readDimensions(lower),
        },
      },
    });
  }
  return true;
}

function matchText(clause, lower, named, state, template, context, result) {
  const quoted = clause.match(/["']([^"']{1,64})["']/);
  const initials = lower.match(/\b(?:my )?initials?\b/);
  const verb = /\b(write|writing|say(?:ing)?|spell(?:ing)?|text|lettering|letters|word(?:s|ing)?|type|monogram)\b/.test(lower);
  if (!quoted && !initials && !verb) return false;

  let content = quoted ? quoted[1] : null;
  if (!content) {
    const after = clause.match(/\b(?:that says?|reading|spelling|with the word[s]?)\s+([\w'&.\- ]{1,40})/i);
    if (after) content = after[1].trim();
  }
  if (!content && initials) content = 'A.B.';
  if (!content) return false;

  const zones = pickZone(named, 'text', null, state, template, context, result);
  if (!zones.length) return true;

  const font = readFont(lower);
  const technique = readTechnique(lower);
  const color = readColor(lower);
  const size = readTextSize(lower);
  const curvature = /\b(arch(?:ed)?|curve[d]?|bow(?:ed)?)\b/.test(lower)
    ? (/\bdown(?:ward)?\b/.test(lower) ? -0.5 : 0.5) : 0;

  for (const zoneId of zones) {
    pushOp(state, result, {
      type: 'addText', zoneId,
      text: content,
      font, technique, curvature,
      // No size asked for: fit it to the panel rather than guessing a constant.
      size: size ?? fitTextSize(state.templateId, zoneId, content),
      color: color || '#141417',
      placement: { x: 0.5, y: 0.42, rotation: 0 },
    });
  }
  if (!/(font|serif|script|stencil|varsity|gothic|mono|condensed)/.test(lower)) {
    result.notes.push(`set it in ${TYPEFACES.find((f) => f.id === font).name}`);
  }
  if (!Object.values(TECHNIQUE_WORDS).some((re) => re.test(lower))) {
    result.notes.push(`${TECHNIQUES.find((t) => t.id === technique).name.toLowerCase()}, not embroidery — say “embroider it” to change that`);
  }
  return true;
}

function matchGraphic(lower, named, state, template, context, result) {
  const asset = GRAPHICS.find((g) => {
    const name = g.name.toLowerCase();
    return new RegExp(`\\b${escapeRe(name)}s?\\b`).test(lower)
      || new RegExp(`\\b${escapeRe(g.id)}s?\\b`).test(lower);
  });
  if (!asset) return false;
  // "star" inside "starting" or a colour phrase should not become a graphic.
  if (!/\b(add|put|place|print|embroider|stick|with|graphic|logo|artwork|design)\b/.test(lower)) return false;

  const zones = pickZone(named, 'graphic', null, state, template, context, result);
  if (!zones.length) return true;

  const color = readColor(lower);
  const technique = readTechnique(lower);
  const scale = /\b(big|large|huge|oversized)\b/.test(lower) ? 0.85
    : /\b(small|tiny|little|subtle)\b/.test(lower) ? 0.2 : 0.42;

  for (const zoneId of zones) {
    pushOp(state, result, {
      type: 'addGraphic', zoneId,
      assetId: asset.id,
      color: color || '#141417',
      technique, scale,
      placement: { x: 0.5, y: 0.45, rotation: 0 },
    });
  }
  return true;
}

function matchHardware(lower, named, state, template, context, result) {
  const part = HARDWARE.find((h) => {
    const name = h.name.toLowerCase();
    if (new RegExp(`\\b${escapeRe(name)}s?\\b`).test(lower)) return true;
    if (h.kind === 'rivet' && /\brivets?\b/.test(lower)) return true;
    if (h.kind === 'eyelet' && /\b(eyelets?|grommets?)\b/.test(lower)) return h.id === 'eyelet';
    if (h.kind === 'drawstring' && /\b(draw ?(?:string|cord)|cord)\b/.test(lower)) return h.id === 'cord-flat';
    if (h.kind === 'button' && /\bbuttons?\b/.test(lower)) return h.id === 'button-shank';
    if (h.kind === 'snap' && /\bsnaps?\b/.test(lower)) return true;
    return false;
  });
  if (!part) return false;
  // A zip *chain* was already handled by matchZipper; only pulls land here.
  if (part.kind === 'zipper') return false;

  const zones = pickZone(named, 'hardware', part.id, state, template, context, result);
  if (!zones.length) return true;

  const finish = readFinish(lower, part.defaultFinish);
  const countMatch = lower.match(/\b(\d{1,2})\s*(?:x\s*)?(?:of them|pieces?)?\b/);
  const count = countMatch ? Math.min(12, Math.max(1, Number(countMatch[1]))) : 1;

  for (const zoneId of zones) {
    pushOp(state, result, {
      type: 'addHardware', zoneId,
      item: {
        hardwareId: part.id, finish, size: part.defaultSize, count,
        placement: { x: 0.5, y: 0.5, rotation: 0 },
      },
    });
  }
  return true;
}

function matchMaterial(lower, named, state, template, context, result) {
  const usable = materialsFor(state.category, { includeTrims: true, includeLinings: true });
  let material = usable.find((m) => new RegExp(`\\b${escapeRe(m.name.toLowerCase())}\\b`).test(lower));
  if (!material) {
    const families = [
      { re: /\b(selvedge|selvage)\b/, id: 'denim-16' },
      { re: /\b(raw denim|heavy denim|rigid denim)\b/, id: 'denim-14' },
      { re: /\b(stretch denim)\b/, id: 'denim-12' },
      { re: /\bdenim\b/, id: 'denim-14' },
      { re: /\b(fleece)\b/, id: 'fleece-brushed' },
      { re: /\b(sherpa|shearling)\b/, id: 'fleece-sherpa' },
      { re: /\b(french terry|terry|loopback)\b/, id: 'terry-french' },
      { re: /\b(jersey|cotton knit)\b/, id: 'jersey-combed' },
      { re: /\b(heavyweight cotton|heavy cotton|thick cotton)\b/, id: 'jersey-heavy' },
      { re: /\b(slub)\b/, id: 'jersey-slub' },
      { re: /\b(pima|supima)\b/, id: 'jersey-pima' },
      { re: /\b(rib|ribbing|ribbed)\b/, id: 'rib-2x1' },
      { re: /\b(waffle|thermal)\b/, id: 'waffle' },
      { re: /\b(pique|piqué|polo knit)\b/, id: 'pique' },
      { re: /\b(corduroy|cord|wale)\b/, id: 'corduroy-8w' },
      { re: /\b(canvas|duck)\b/, id: 'canvas-duck' },
      { re: /\b(ripstop)\b/, id: 'ripstop-cotton' },
      { re: /\b(twill|chino cloth)\b/, id: 'twill-cotton' },
      { re: /\b(moleskin)\b/, id: 'moleskin' },
      { re: /\b(wool|gabardine)\b/, id: 'gabardine-wool' },
      { re: /\b(melton)\b/, id: 'melton-wool' },
      { re: /\b(leather|lambskin)\b/, id: 'leather-lamb' },
      { re: /\b(cowhide|waxed leather)\b/, id: 'leather-cow' },
      { re: /\b(oxford)\b/, id: 'oxford' },
      { re: /\b(poplin)\b/, id: 'poplin' },
      { re: /\b(flannel)\b/, id: 'flannel' },
      { re: /\b(linen)\b/, id: 'linen-washed' },
      { re: /\b(chambray)\b/, id: 'chambray' },
      { re: /\b(seersucker)\b/, id: 'seersucker' },
      { re: /\b(silk|charmeuse|satin)\b/, id: 'silk-charmeuse' },
      { re: /\b(nylon|shell)\b/, id: 'nylon-ripstop-20d' },
      { re: /\b(glossy|gloss|shiny|wet ?look)\b/, id: 'nylon-gloss' },
      { re: /\b(matte poly|matte polyester|matte)\b/, id: 'poly-matte' },
      { re: /\b(quilted|quilt)\b/, id: 'quilt-diamond' },
      { re: /\b(mesh)\b/, id: 'mesh-tech' },
    ];
    const hit = families.find((f) => f.re.test(lower));
    material = hit ? getMaterial(hit.id) : null;
  }
  if (!material) return false;
  if (!/\b(in|out of|from|make|made|swap|change|use|switch|to)\b/.test(lower)
    && !MATERIALS.some((m) => lower.startsWith(m.name.toLowerCase()))) return false;

  const zones = pickZone(named, 'material', material.id, state, template, context, result);
  if (!zones.length) return true;
  for (const zoneId of zones) {
    pushOp(state, result, { type: 'setMaterial', zoneId, materialId: material.id });
  }
  return true;
}

function matchTreatment(lower, named, state, template, context, result) {
  const t = TREATMENTS.find((x) => {
    if (x.id === 'none') return false;
    const words = {
      raw: /\braw|unwashed|loom ?state\b/, rinse: /\brinse[d]?\b/,
      stonewash: /\bstone ?wash(?:ed)?\b/, acid: /\bacid ?wash(?:ed)?\b/,
      bleach: /\b(bleach(?:ed)?|faded)\b/, whisker: /\b(whisker|honeycomb|hand ?sand)\b/,
      overdye: /\bover ?dye[d]?\b/, coated: /\b(resin|coated|waxed finish)\b/,
    };
    return words[x.id]?.test(lower);
  });
  if (!t) return false;

  // A wash is a garment-level finish; applying it to one panel and not the
  // rest is almost never what someone means. So an unnamed wash goes everywhere
  // rather than falling back to the open zone.
  let targets;
  if (named.length) {
    targets = pickZone(named, 'treatment', t.id, state, template, context, result);
    if (!targets.length) return true;
  } else {
    targets = template.zones.filter((z) => z.supports.treatment).map((z) => z.id);
  }
  let applied = 0;
  for (const zoneId of targets) {
    if (pushOp(state, result, { type: 'setTreatment', zoneId, treatmentId: t.id }, true)) applied++;
  }
  if (!applied) {
    result.rejected.push(`${t.name} needs denim — this garment is not cut from cloth that takes a wash.`);
  } else if (!named.length && applied > 1) {
    result.notes.push(`applied the ${t.name.toLowerCase()} across the whole garment`);
  }
  return true;
}

function matchColor(clause, lower, named, state, template, context, result) {
  const color = readColor(lower);
  if (!color) return false;
  // Don't recolour the garment because a colour word described a thread or a
  // graphic that another rule already consumed.
  if (result.ops.some((op) => op.color === color || op.mod?.params?.color === color)) return false;
  if (/\b(thread|stitch(?:ing)?|zip|button|rivet|snap|eyelet|hardware|finish)\b/.test(lower)) return false;

  // Recolouring without naming a zone means the garment, not the last panel
  // that happened to be open.
  let targets;
  if (named.length) {
    targets = pickZone(named, 'color', null, state, template, context, result);
    if (!targets.length) return true;
  } else {
    targets = template.zones.filter((z) => !z.role).map((z) => z.id);
  }
  for (const zoneId of targets) {
    pushOp(state, result, { type: 'setColor', zoneId, color }, true);
  }
  if (!named.length && targets.length > 1) {
    result.notes.push('recoloured the main body panels, leaving trims as they were');
  }
  return true;
}

// ── Readers ───────────────────────────────────────────────────────────────

function readColor(lower) {
  const hex = lower.match(/#[0-9a-f]{3,6}\b/);
  if (hex) return normaliseHex(hex[0]);
  const swatch = SWATCHES.find((s) => new RegExp(`\\b${escapeRe(s.name.toLowerCase())}\\b`).test(lower));
  if (swatch) return swatch.hex;
  // Longest name first, so "light blue" beats "blue".
  const names = Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (new RegExp(`\\b${escapeRe(name)}\\b`).test(lower)) return COLOR_WORDS[name];
  }
  return null;
}

function readFinish(lower, fallback = 'antique-brass') {
  const map = [
    { re: /\b(matte black|black)\b/, id: 'matte-black' },
    { re: /\b(polished chrome|chrome|mirror)\b/, id: 'polished-chrome' },
    { re: /\b(brushed silver|silver)\b/, id: 'brushed-silver' },
    { re: /\b(brushed nickel|nickel)\b/, id: 'brushed-nickel' },
    { re: /\b(gunmetal|graphite metal)\b/, id: 'gunmetal' },
    { re: /\b(antique brass|aged brass)\b/, id: 'antique-brass' },
    { re: /\b(brass)\b/, id: 'polished-brass' },
    { re: /\b(copper)\b/, id: 'copper' },
    { re: /\b(gold)\b/, id: 'gold' },
    { re: /\b(white|painted)\b/, id: 'painted-white' },
    { re: /\b(horn)\b/, id: 'horn' },
    { re: /\b(corozo|nut)\b/, id: 'corozo' },
  ];
  const hit = map.find((m) => m.re.test(lower));
  return hit ? hit.id : fallback;
}

function readZipChain(lower) {
  if (/\b(vislon|chunky|plastic|moulded|molded)\b/.test(lower)) return 'zip-vislon';
  if (/\b(coil|nylon|concealed)\b/.test(lower)) return 'zip-coil';
  if (/\b(invisible|hidden)\b/.test(lower)) return 'zip-invisible';
  return 'zip-metal';
}

function readTechnique(lower) {
  for (const [id, re] of Object.entries(TECHNIQUE_WORDS)) {
    if (re.test(lower)) return id;
  }
  return 'print';
}

function readFont(lower) {
  for (const hint of FONT_HINTS) if (hint.re.test(lower)) return hint.id;
  return 'geo-caps';
}

function readTextSize(lower) {
  const cm = lower.match(/\b(\d+(?:\.\d+)?)\s*cm\b/);
  if (cm) return Math.min(24, Math.max(0.6, Number(cm[1])));
  const inch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:in|inch(?:es)?|")\b/);
  if (inch) return Math.min(24, Math.max(0.6, Number(inch[1]) * 2.54));
  if (/\b(tiny|very small)\b/.test(lower)) return 1.5;
  if (/\b(small|subtle|discreet)\b/.test(lower)) return 2.5;
  if (/\b(big|large)\b/.test(lower)) return 9;
  if (/\b(huge|massive|oversized|giant)\b/.test(lower)) return 16;
  return null;
}

function readDimensions(lower) {
  const pair = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(cm|in|inch(?:es)?|")?\b/);
  if (!pair) return {};
  const unit = pair[3] || 'cm';
  const k = /in|"/.test(unit) ? 2.54 : 1;
  return { width: Number(pair[1]) * k, height: Number(pair[2]) * k };
}

// ── Validation gate ───────────────────────────────────────────────────────

/**
 * Every op — parsed locally or returned by a model — lands here first. Nothing
 * reaches the design without passing the zone's own capability record.
 */
function pushOp(state, result, op, quiet = false) {
  const check = checkOp(state, op);
  if (!check.ok) {
    if (!quiet && !result.rejected.includes(check.reason)) result.rejected.push(check.reason);
    return false;
  }
  result.ops.push(op);
  return true;
}

/** Validate an externally-produced op list (used by the remote interpreter). */
export function validateOps(ops, state) {
  const result = { ops: [], notes: [], rejected: [], clarify: null, understood: false };
  for (const op of Array.isArray(ops) ? ops : []) {
    if (pushOp(state, result, op)) result.understood = true;
  }
  return result;
}

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Prompts offered under the composer, tailored to what this garment allows. */
export function suggestionsFor(state) {
  const template = getTemplate(state.templateId);
  const out = [];
  const has = (cap2, sub) => template.zones.some((z) => checkOp(state, probeOp(cap2, sub, z.id)).ok);

  if (has('text')) out.push('Put my initials on the back in a serif font');
  if (has('pocket', 'patch')) out.push('Add a chest pocket with a silver zip');
  if (has('rip')) out.push('Distress the left knee heavily');
  if (has('treatment')) out.push('Give it a stonewash');
  if (has('graphic')) out.push('Print a lightning bolt on the chest');
  if (has('hardware', 'button-tack')) out.push('Antique brass hardware throughout');
  if (has('material', 'fleece-brushed')) out.push('Make it heavyweight fleece');
  return out.slice(0, 4);
}
