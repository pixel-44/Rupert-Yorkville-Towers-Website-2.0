// Hardware library — buttons, rivets, zippers, cords, eyelets.
//
// Hardware is the one part of a garment that is genuinely metal, so unlike cloth
// it renders with real metalness/roughness rather than a woven texture. Finishes
// are kept separate from parts on purpose: a tailor orders "shank button, 17 mm,
// antique brass", which is a part code plus a finish code, and any part may be
// had in any finish.

/** Physical metal finishes. `pbr` feeds the Three.js material directly. */
export const FINISHES = [
  { id: 'matte-black', name: 'Matte Black', code: 'FN-MBK', pbr: { color: '#1a1a1c', metalness: 0.85, roughness: 0.62 } },
  { id: 'polished-chrome', name: 'Polished Chrome', code: 'FN-CHR', pbr: { color: '#e9ecf0', metalness: 1, roughness: 0.06 } },
  { id: 'brushed-silver', name: 'Brushed Silver', code: 'FN-BSV', pbr: { color: '#c8ccd2', metalness: 1, roughness: 0.34 } },
  { id: 'brushed-nickel', name: 'Brushed Nickel', code: 'FN-BNK', pbr: { color: '#b6b3ab', metalness: 1, roughness: 0.4 } },
  { id: 'gunmetal', name: 'Gunmetal', code: 'FN-GUN', pbr: { color: '#4a4e55', metalness: 1, roughness: 0.28 } },
  { id: 'antique-brass', name: 'Antique Brass', code: 'FN-ABR', pbr: { color: '#8d6b34', metalness: 1, roughness: 0.42 } },
  { id: 'polished-brass', name: 'Polished Brass', code: 'FN-PBR', pbr: { color: '#c39b45', metalness: 1, roughness: 0.14 } },
  { id: 'copper', name: 'Aged Copper', code: 'FN-CPR', pbr: { color: '#94553a', metalness: 1, roughness: 0.38 } },
  { id: 'gold', name: 'Gold Plate', code: 'FN-GLD', pbr: { color: '#d4af52', metalness: 1, roughness: 0.1 } },
  // Not metal at all — moulded parts. Metalness drops to zero or the shader
  // gives plastic an unearned mirror.
  { id: 'painted-white', name: 'Painted White', code: 'FN-PWH', pbr: { color: '#f0f0f2', metalness: 0.1, roughness: 0.5 } },
  { id: 'horn', name: 'Natural Horn', code: 'FN-HRN', pbr: { color: '#5a4432', metalness: 0, roughness: 0.44 } },
  { id: 'corozo', name: 'Corozo Nut', code: 'FN-CRZ', pbr: { color: '#d8cdb8', metalness: 0, roughness: 0.52 } },
];

/**
 * Hardware parts.
 *
 * `form` selects the mesh builder in render/attachments.js.
 * `sizes` are millimetre options — a tailor needs the actual ligne/mm, not "medium".
 */
export const HARDWARE = [
  // Buttons
  { id: 'button-shank', name: 'Shank Button', code: 'HW-BTS', kind: 'button', form: 'domed',
    sizes: [15, 17, 20, 23], defaultSize: 17, defaultFinish: 'antique-brass',
    spec: 'Metal shank button, set with rear tack' },
  { id: 'button-4hole', name: '4-Hole Button', code: 'HW-BT4', kind: 'button', form: 'flat',
    sizes: [11, 13, 15, 18], defaultSize: 13, defaultFinish: 'corozo',
    spec: '4-hole sew-through button, cross-stitched' },
  { id: 'button-tack', name: 'Tack Button', code: 'HW-BTK', kind: 'button', form: 'tack',
    sizes: [17, 20], defaultSize: 17, defaultFinish: 'antique-brass',
    spec: 'Two-piece jeans tack button, hammer-set' },
  { id: 'button-toggle', name: 'Toggle', code: 'HW-TGL', kind: 'button', form: 'toggle',
    sizes: [40, 50], defaultSize: 40, defaultFinish: 'horn',
    spec: 'Barrel toggle with leather loop' },
  { id: 'snap-ring', name: 'Ring Snap', code: 'HW-SNR', kind: 'snap', form: 'ring',
    sizes: [12, 15], defaultSize: 15, defaultFinish: 'brushed-nickel',
    spec: 'Four-part ring snap, prong set' },

  // Rivets and eyelets
  { id: 'rivet-standard', name: 'Burr Rivet', code: 'HW-RVT', kind: 'rivet', form: 'domed',
    sizes: [8, 9, 11], defaultSize: 9, defaultFinish: 'antique-brass',
    spec: 'Two-piece burr rivet at pocket stress points' },
  { id: 'rivet-flat', name: 'Flat Rivet', code: 'HW-RVF', kind: 'rivet', form: 'flat',
    sizes: [8, 10], defaultSize: 8, defaultFinish: 'gunmetal',
    spec: 'Low-profile flat rivet, hidden set' },
  { id: 'eyelet', name: 'Eyelet', code: 'HW-EYL', kind: 'eyelet', form: 'ring',
    sizes: [5, 8, 12], defaultSize: 8, defaultFinish: 'brushed-silver',
    spec: 'Two-part eyelet with washer' },
  { id: 'grommet', name: 'Grommet', code: 'HW-GRM', kind: 'eyelet', form: 'ring',
    sizes: [12, 16], defaultSize: 12, defaultFinish: 'gunmetal',
    spec: 'Rolled-rim grommet, self-piercing' },

  // Closures
  { id: 'zip-metal', name: 'Metal Tooth Zip', code: 'HW-ZMT', kind: 'zipper', form: 'metal-tooth',
    sizes: [3, 5, 8], defaultSize: 5, defaultFinish: 'antique-brass', sizeUnit: 'gauge',
    spec: 'Brass-tooth zipper on cotton tape' },
  { id: 'zip-coil', name: 'Coil Zip', code: 'HW-ZCL', kind: 'zipper', form: 'coil',
    sizes: [3, 5], defaultSize: 5, defaultFinish: 'gunmetal', sizeUnit: 'gauge',
    spec: 'Nylon coil zipper, concealed pull' },
  { id: 'zip-vislon', name: 'Vislon Zip', code: 'HW-ZVS', kind: 'zipper', form: 'vislon',
    sizes: [5, 8, 10], defaultSize: 8, defaultFinish: 'matte-black', sizeUnit: 'gauge',
    spec: 'Moulded plastic-tooth zipper, chunky' },
  { id: 'zip-invisible', name: 'Invisible Zip', code: 'HW-ZIV', kind: 'zipper', form: 'invisible',
    sizes: [3], defaultSize: 3, defaultFinish: 'matte-black', sizeUnit: 'gauge',
    spec: 'Concealed coil zip set in a seam' },
  { id: 'hook-bar', name: 'Hook & Bar', code: 'HW-HKB', kind: 'closure', form: 'flat',
    sizes: [1], defaultSize: 1, defaultFinish: 'gunmetal',
    spec: 'Trouser hook-and-bar at waistband extension' },

  // Cords and trims
  { id: 'cord-flat', name: 'Flat Drawcord', code: 'HW-CDF', kind: 'drawstring', form: 'flat-cord',
    sizes: [8, 12], defaultSize: 8, defaultFinish: 'painted-white', sizeUnit: 'mm width',
    spec: 'Flat woven drawcord, cut ends heat-sealed' },
  { id: 'cord-round', name: 'Round Drawcord', code: 'HW-CDR', kind: 'drawstring', form: 'round-cord',
    sizes: [4, 5, 6], defaultSize: 5, defaultFinish: 'painted-white', sizeUnit: 'mm dia',
    spec: 'Braided round drawcord with metal aglets' },
  { id: 'cordlock', name: 'Cord Lock', code: 'HW-CLK', kind: 'drawstring', form: 'barrel',
    sizes: [1], defaultSize: 1, defaultFinish: 'matte-black',
    spec: 'Spring-loaded barrel cord lock' },
  { id: 'dring', name: 'D-Ring', code: 'HW-DRG', kind: 'trim', form: 'ring',
    sizes: [20, 25, 32], defaultSize: 25, defaultFinish: 'brushed-silver',
    spec: 'Welded D-ring on a webbing keeper' },
];

const HW_BY_ID = new Map(HARDWARE.map((h) => [h.id, h]));
const FN_BY_ID = new Map(FINISHES.map((f) => [f.id, f]));

export function getHardware(id) {
  return HW_BY_ID.get(id) || null;
}

export function getFinish(id) {
  return FN_BY_ID.get(id) || FN_BY_ID.get('brushed-silver');
}

/** Parts of a given kind, e.g. every zipper style. */
export function hardwareOfKind(kind) {
  return HARDWARE.filter((h) => h.kind === kind);
}

/** Human-readable one-liner for the spec sheet: part, size, finish. */
export function describeHardware({ hardwareId, size, finish }) {
  const part = getHardware(hardwareId);
  if (!part) return 'Unknown part';
  const fin = getFinish(finish);
  const unit = part.sizeUnit || 'mm';
  const dim = size ?? part.defaultSize;
  return `${part.name} — ${dim} ${unit}, ${fin.name} (${part.code}/${fin.code})`;
}
