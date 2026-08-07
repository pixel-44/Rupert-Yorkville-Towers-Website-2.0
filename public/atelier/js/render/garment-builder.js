// Procedural garment geometry.
//
// Every panel is a loft: a stack of rings swept along an axis, where each ring
// carries its own centre, radii and frame. That one primitive covers a torso, a
// sleeve angled off the shoulder, a tapering leg, a hood arcing over the head
// and a waistband, so there is a single place where surface parameterisation,
// UV layout and surface sampling are defined — and therefore a single place
// where the zone map, the textures and the attached hardware can agree.
//
// Parameterisation (shared with catalog/templates.js):
//   u runs around the body, 0 at the wearer's right side seam, 0.25 centre
//   front, 0.5 left side seam, 0.75 centre back. v runs 0 at the top of a panel
//   to 1 at the bottom.
//
// Units are metres; garment dimensions in the catalog are centimetres.

import * as THREE from '../../vendor/three.module.min.js';
import { panelMetrics } from './metrics.js';

const CM = 0.01;
const RADIAL = 96;
const RINGS = 64;

/** θ for a given u, per the convention above. */
const theta = (u) => Math.PI - u * Math.PI * 2;

/** Ramanujan ellipse perimeter, used to turn a circumference into radii. */
function ellipsePerimeter(a, b) {
  const h = ((a - b) ** 2) / ((a + b) ** 2);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/**
 * Radii for an elliptical cross-section of a given circumference.
 * `depthRatio` is how deep the body is relative to its width — a torso is
 * markedly flatter than a cylinder, and getting this wrong is the single
 * biggest tell that a garment render is fake.
 */
function radiiFor(circumferenceCm, depthRatio = 0.62) {
  const unit = ellipsePerimeter(1, depthRatio);
  const rx = (circumferenceCm * CM) / unit;
  return { rx, rz: rx * depthRatio };
}

/** Cheap deterministic noise for drape. */
function dnoise(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = dnoise(xi, yi), b = dnoise(xi + 1, yi);
  const c = dnoise(xi, yi + 1), d = dnoise(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * A lofted panel.
 *
 * @param {(t:number) => {c:number[], rx:number, rz:number, right:number[], fwd:number[]}} ring
 * @param {(u:number, v:number) => number} [displace] Multiplier on the radius,
 *   used for drape, wrinkles and puffer baffles. It is applied inside `sample`
 *   too, so anything attached to the surface sits on the displaced cloth.
 */
class Panel {
  constructor(id, ring, opts = {}) {
    this.id = id;
    this.ring = ring;
    this.displace = opts.displace || (() => 1);
    this.rings = opts.rings || RINGS;
    this.radial = opts.radial || RADIAL;
    this.uSpan = opts.uSpan || [0, 1];      // partial sweeps, e.g. a placket
    this.capTop = opts.capTop || null;      // shoulder yoke closure
    this.metrics = opts.metrics;
  }

  /** World-space point and outward normal at (u, v). */
  sample(u, v) {
    const p = this._point(u, v);
    const e = 1e-3;
    const du = sub(this._point(u + e, v), this._point(u - e, v));
    const dv = sub(this._point(u, Math.min(1, v + e)), this._point(u, Math.max(0, v - e)));
    const n = normalize(cross(dv, du));
    return { position: p, normal: n };
  }

  _point(u, v) {
    const t = Math.min(1, Math.max(0, v));
    const r = this.ring(t);
    const k = this.displace(u, t);
    const a = theta(u);
    const cx = Math.cos(a) * r.rx * k;
    const cz = Math.sin(a) * r.rz * k;
    return [
      r.c[0] + r.right[0] * cx + r.fwd[0] * cz,
      r.c[1] + r.right[1] * cx + r.fwd[1] * cz,
      r.c[2] + r.right[2] * cx + r.fwd[2] * cz,
    ];
  }

  buildGeometry() {
    const [u0, u1] = this.uSpan;
    const closed = u1 - u0 >= 0.999;
    const cols = this.radial;
    const rows = this.rings;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      for (let i = 0; i <= cols; i++) {
        const u = u0 + ((u1 - u0) * i) / cols;
        const { position, normal } = this.sample(closed ? u % 1 : u, v);
        positions.push(...position);
        normals.push(...normal);
        // UVs span the panel's own texture, so a partial sweep still maps to
        // the full canvas it owns.
        uvs.push(i / cols, v);
      }
    }

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i;
        const b = a + cols + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const X = [1, 0, 0];
const Z = [0, 0, 1];

const smoothstep = (k) => {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
};

/** Smoothstep-interpolate a value through keyed stops along t. */
function profile(stops) {
  return (t) => {
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, v0] = stops[i];
      const [t1, v1] = stops[i + 1];
      if (t <= t1 || i === stops.length - 2) {
        const k = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-6, t1 - t0)));
        const s = k * k * (3 - 2 * k);
        return v0 + (v1 - v0) * s;
      }
    }
    return stops[stops.length - 1][1];
  };
}

// ── Drape ─────────────────────────────────────────────────────────────────

/**
 * Cloth never hangs as a clean surface of revolution. Softer fabric folds more,
 * and folds gather toward the hem — this is what stops a render reading as a
 * cylinder with a picture on it.
 */
function drapeFn(amount, { hemGather = 1, baffle = 0, bafflePitch = 0.12 } = {}) {
  return (u, v) => {
    const folds = (smoothNoise(u * 7.3, v * 3.1) - 0.5) * 2;
    const fine = (smoothNoise(u * 19, v * 8) - 0.5) * 2;
    const gather = 0.35 + 0.65 * v * hemGather;
    let k = 1 + amount * (folds * 0.7 + fine * 0.3) * gather;
    if (baffle > 0) {
      // Down chambers: the shell bulges between stitch lines and pinches at them.
      const phase = (v / bafflePitch) * Math.PI * 2;
      k += baffle * (0.5 + 0.5 * Math.cos(phase)) * 0.5;
    }
    return k;
  };
}

/** How much a cloth folds, from its weight and hand. */
function drapeAmountFor(material) {
  if (!material) return 0.018;
  const byFamily = {
    knit: 0.026, denim: 0.014, woven: 0.016, shirting: 0.028,
    shell: 0.02, wool: 0.015, leather: 0.01, pile: 0.024, lining: 0.03,
  };
  return byFamily[material.family] ?? 0.02;
}

// ── Garment assembly ──────────────────────────────────────────────────────

/**
 * Build every panel of a template.
 *
 * @returns {{panels: Map<string, Panel>, metrics: object, bounds: {height:number, centre:number}}}
 */
export function buildGarment(template, { material } = {}) {
  const b = template.build;
  const drape = drapeAmountFor(material);
  return template.kind === 'bottom'
    ? buildBottom(template, b, drape)
    : buildTop(template, b, drape);
}

function buildTop(template, b, drape) {
  const panels = new Map();
  // Physical sizes come from the shared table, so the loft, the texture
  // compositor and the printed pattern all measure the same garment.
  const metrics = panelMetrics(template);

  const chest = radiiFor(b.chest, 0.6);
  const waist = radiiFor(b.waist, 0.62);
  const hem = radiiFor(b.hem, 0.64);
  const neck = radiiFor(b.neckW * 2.7, 0.82);
  const shoulderRx = (b.shoulder / 2) * CM;
  const shoulderRz = chest.rz * 0.9;

  const lengthM = b.length * CM;
  const topY = lengthM * 0.5;
  const hasHemBand = template.zones.some((z) => z.id === 'hem-band');
  const bandH = hasHemBand ? 0.055 : 0;
  const bodyBottom = topY - lengthM + bandH;
  const baffle = b.baffle ? 0.11 : 0;
  const bafflePitch = b.baffle ? (b.baffle * CM) / lengthM : 0.12;

  // ── Torso ──
  // The first eighth of the panel is the yoke: it rises from the shoulder line
  // to a neck opening, so the garment closes over the shoulders instead of
  // ending in an open tube. Everything below that is the body proper.
  const SHOULDER_V = 0.085;
  const yokeRise = lengthM * 0.07;
  const shoulderY = topY;

  const torsoRx = profile([
    [0, neck.rx], [0.025, neck.rx * 1.2],
    [SHOULDER_V, shoulderRx], [0.21, chest.rx],
    [0.55, waist.rx], [1, hem.rx],
  ]);
  const torsoRz = profile([
    [0, neck.rz], [0.025, neck.rz * 1.2],
    [SHOULDER_V, shoulderRz], [0.21, chest.rz],
    [0.55, waist.rz], [1, hem.rz],
  ]);
  const torsoY = (t) => (t <= SHOULDER_V
    ? shoulderY + yokeRise * (1 - smoothstep(t / SHOULDER_V))
    : shoulderY - ((t - SHOULDER_V) / (1 - SHOULDER_V)) * (shoulderY - bodyBottom));

  const torsoRing = (t) => ({
    c: [0, torsoY(t), 0],
    rx: torsoRx(t), rz: torsoRz(t), right: X, fwd: Z,
  });
  panels.set('torso', new Panel('torso', torsoRing, {
    // The yoke is a structured area; drape belongs to the body below it.
    displace: (u, v) => (v < SHOULDER_V
      ? 1
      : drapeFn(drape, { baffle, bafflePitch })(u, v)),
    rings: 80,
    metrics: metrics.torso,
  }));

  // ── Sleeves ──
  if (b.sleeveLen > 0) {
    for (const side of ['left', 'right']) {
      const dir = side === 'left' ? 1 : -1;         // +X is the wearer's left
      const id = side === 'left' ? 'sleeveL' : 'sleeveR';
      // Root the sleeve just inside the shoulder rim so the armhole reads as a
      // seam rather than a gap.
      const armY = shoulderY - lengthM * 0.025;
      const shoulderX = dir * shoulderRx * 0.94;
      // Sleeves fall away from the shoulder rather than sticking straight out.
      const drop = Math.PI / 180 * 44;
      const axis = [dir * Math.cos(drop), -Math.sin(drop), 0];
      const len = b.sleeveLen * CM;
      const bicep = radiiFor(b.bicep, 0.86);
      const cuffR = radiiFor(Math.max(14, b.cuff), 0.86);
      const rx = profile([[0, bicep.rx * 1.16], [0.12, bicep.rx], [1, cuffR.rx]]);
      const rz = profile([[0, bicep.rz * 1.16], [0.12, bicep.rz], [1, cuffR.rz]]);
      // Frame perpendicular to the sleeve axis.
      const right = normalize(cross(axis, [0, 0, 1]));
      const ring = (t) => ({
        c: [shoulderX + axis[0] * len * t, armY + axis[1] * len * t, axis[2] * len * t],
        rx: rx(t), rz: rz(t), right, fwd: Z,
      });
      panels.set(id, new Panel(id, ring, {
        displace: drapeFn(drape * 1.2, { hemGather: 0.6, baffle, bafflePitch: bafflePitch * 1.6 }),
        rings: 40,
        metrics: metrics[id],
      }));

      // Cuff band, occupying the last stretch of the sleeve axis.
      const cuffId = side === 'left' ? 'cuffL' : 'cuffR';
      const cuffFrac = 0.06;
      const bandRing = (t) => {
        const at = len * (1 - cuffFrac) + len * cuffFrac * t;
        return {
          c: [shoulderX + axis[0] * at, armY + axis[1] * at, axis[2] * at],
          rx: cuffR.rx * (1.02 - t * 0.05), rz: cuffR.rz * (1.02 - t * 0.05), right, fwd: Z,
        };
      };
      panels.set(cuffId, new Panel(cuffId, bandRing, {
        rings: 10,
        metrics: metrics[cuffId],
      }));
    }
  }

  // ── Neck: collar band or hood ──
  const neckY = topY + yokeRise;
  const hasHood = template.zones.some((z) => z.id === 'hood');

  if (hasHood) {
    // A spine arcing from the front of the neck up and back down behind it.
    const hoodH = 0.3;
    const spine = profile([[0, 0], [0.5, 1], [1, 0.55]]);
    const ring = (t) => {
      const lift = Math.sin(t * Math.PI * 0.92) * hoodH;
      const back = -0.02 - t * 0.16;
      return {
        c: [0, neckY + lift * 0.9, back],
        rx: neck.rx * (1 + spine(t) * 0.5),
        rz: neck.rz * (1 + spine(t) * 1.25),
        right: X, fwd: Z,
      };
    };
    panels.set('hood', new Panel('hood', ring, {
      displace: drapeFn(drape * 1.4, { hemGather: 0.4 }),
      rings: 32,
      metrics: metrics.hood,
    }));

    const liningRing = (t) => {
      const r = ring(t);
      return { ...r, rx: r.rx * 0.93, rz: r.rz * 0.93 };
    };
    panels.set('hoodLining', new Panel('hoodLining', liningRing, {
      rings: 24, metrics: metrics.hoodLining,
    }));
  } else {
    // A shirt collar flares out and up from the neck ring; a knit rib hugs it.
    const isCollar = template.zones.some((z) => z.id === 'collar');
    const collarH = isCollar ? 0.055 : 0.022;
    const flare = isCollar ? 0.55 : 0.04;
    const ring = (t) => ({
      c: [0, neckY - collarH * 0.35 + collarH * t, 0],
      rx: neck.rx * (1.03 + flare * t),
      rz: neck.rz * (1.03 + flare * t * 1.15),
      right: X, fwd: Z,
    });
    panels.set('collar', new Panel('collar', ring, {
      rings: 10, metrics: metrics.collar,
    }));
  }

  // ── Hem band ──
  if (hasHemBand) {
    const ring = (t) => ({
      c: [0, bodyBottom - bandH * t, 0],
      rx: hem.rx * (1 - t * 0.06), rz: hem.rz * (1 - t * 0.06), right: X, fwd: Z,
    });
    panels.set('hemBand', new Panel('hemBand', ring, {
      rings: 10, metrics: metrics.hemBand,
    }));
  }

  // ── Front placket ──
  if (template.zones.some((z) => z.id === 'placket')) {
    const isHalf = template.zones.find((z) => z.id === 'placket').name.includes('Half');
    const width = 0.026;
    const ring = (t) => {
      const vv = isHalf ? t * 0.42 : t;
      const r = torsoRing(vv);
      return { ...r, rx: r.rx * 1.012, rz: r.rz * 1.012 };
    };
    const centreFront = 0.25;
    const half = width / (2 * Math.PI * chest.rx);
    panels.set('placket', new Panel('placket', ring, {
      uSpan: [centreFront - half, centreFront + half],
      radial: 8, rings: 40,
      displace: drapeFn(drape * 0.4),
      metrics: metrics.placket,
    }));
  }

  return {
    panels, metrics,
    bounds: { height: lengthM + 0.34, centre: topY - lengthM * 0.45 },
    torsoRing,
  };
}

function buildBottom(template, b, drape) {
  const panels = new Map();
  const metrics = panelMetrics(template);

  const waist = radiiFor(b.waist, 0.68);
  const hip = radiiFor(b.hip, 0.72);
  const riseM = b.rise * CM;
  const inseamM = b.inseam * CM;

  const waistY = riseM * 0.5 + inseamM * 0.5;
  const crotchY = waistY - riseM;
  const hemY = crotchY - inseamM;
  const bandH = 0.045;

  // ── Waistband ──
  const wbRing = (t) => ({
    c: [0, waistY - bandH * t, 0],
    rx: waist.rx, rz: waist.rz, right: X, fwd: Z,
  });
  panels.set('waistband', new Panel('waistband', wbRing, {
    rings: 8, metrics: metrics.waistband,
  }));

  // ── Hip block, waistband down to the crotch ──
  const hipRx = profile([[0, waist.rx], [0.55, hip.rx], [1, hip.rx * 1.02]]);
  const hipRz = profile([[0, waist.rz], [0.55, hip.rz], [1, hip.rz * 1.06]]);
  const hipRing = (t) => ({
    c: [0, waistY - bandH - t * (waistY - bandH - crotchY), 0],
    rx: hipRx(t), rz: hipRz(t), right: X, fwd: Z,
  });
  panels.set('hip', new Panel('hip', hipRing, {
    displace: drapeFn(drape * 0.8, { hemGather: 0.5 }),
    rings: 28,
    metrics: metrics.hip,
  }));

  // ── Legs ──
  const thigh = radiiFor(b.thigh, 0.88);
  const knee = radiiFor(b.knee, 0.9);
  const hemR = radiiFor(b.hem, 0.92);
  const legRx = profile([[0, thigh.rx * 1.06], [0.08, thigh.rx], [0.5, knee.rx], [1, hemR.rx]]);
  const legRz = profile([[0, thigh.rz * 1.06], [0.08, thigh.rz], [0.5, knee.rz], [1, hemR.rz]]);
  const straddle = hip.rx * 0.46;

  for (const side of ['left', 'right']) {
    const dir = side === 'left' ? 1 : -1;
    const id = side === 'left' ? 'legL' : 'legR';
    const ring = (t) => ({
      // Legs converge slightly toward the ankle, as real trousers do.
      c: [dir * straddle * (1 - t * 0.22), crotchY - t * (crotchY - hemY), 0],
      rx: legRx(t), rz: legRz(t), right: X, fwd: Z,
    });
    panels.set(id, new Panel(id, ring, {
      displace: drapeFn(drape, { hemGather: 1.25 }),
      rings: 56,
      metrics: metrics[id],
    }));
  }

  // ── Fly ──
  if (template.zones.some((z) => z.id === 'fly')) {
    const ring = (t) => {
      const r = hipRing(0.18 + t * 0.66);
      return { ...r, rx: r.rx * 1.014, rz: r.rz * 1.014 };
    };
    const half = 0.02 / (2 * Math.PI * hip.rx);
    panels.set('fly', new Panel('fly', ring, {
      uSpan: [0.25 - half, 0.25 + half],
      radial: 6, rings: 20,
      metrics: metrics.fly,
    }));
  }

  return {
    panels, metrics,
    bounds: { height: waistY - hemY + 0.2, centre: (waistY + hemY) / 2 },
  };
}

/**
 * A small patch of surface, offset along the normal — the base for anything
 * applied to the cloth: pockets, patches, zip tape.
 */
export function surfacePatchGeometry(panel, { u, v, uSpan, vSpan, offset = 0.004, segments = 12 }) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let j = 0; j <= segments; j++) {
    const vv = v - vSpan / 2 + (vSpan * j) / segments;
    for (let i = 0; i <= segments; i++) {
      const uu = u - uSpan / 2 + (uSpan * i) / segments;
      const s = panel.sample(uu, Math.min(0.999, Math.max(0.001, vv)));
      positions.push(
        s.position[0] + s.normal[0] * offset,
        s.position[1] + s.normal[1] * offset,
        s.position[2] + s.normal[2] * offset
      );
      normals.push(...s.normal);
      // UVs are the panel's own coordinates, not 0–1 across the patch. A patch
      // pocket is cut from the cloth it sits on, so it has to sample the same
      // region of the same texture — mapping 0–1 would squeeze the entire
      // garment's artwork onto a 13 cm pocket.
      uvs.push(uu, vv);
    }
  }
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export { Panel, radiiFor, CM };
