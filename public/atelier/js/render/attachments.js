// Attachment meshes: pockets, zips, buttons, rivets, eyelets, drawcords.
//
// Anything with real thickness is geometry, not paint. A patch pocket has to
// throw a shadow and break the silhouette at the edge of the garment, and a
// tack button has to catch a highlight the cloth never could — that separation
// is what keeps hardware reading as metal.
//
// Everything here places itself by sampling the panel surface, so attachments
// sit on the draped, baffled cloth rather than on an idealised cylinder.

import * as THREE from '../../vendor/three.module.min.js';
import { surfacePatchGeometry } from './garment-builder.js';
import { getHardware, getFinish } from '../catalog/hardware.js';
import { getZone } from '../catalog/templates.js';

const finishCache = new Map();

/** Shared metal material per finish — hardware is repeated a lot. */
function finishMaterial(finishId) {
  if (finishCache.has(finishId)) return finishCache.get(finishId);
  const { pbr } = getFinish(finishId);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pbr.color),
    metalness: pbr.metalness,
    roughness: pbr.roughness,
  });
  finishCache.set(finishId, mat);
  return mat;
}

/** Zone-local placement (0–1 within the zone) to panel UV. */
function zoneUV(zone, placement) {
  const [u0, v0, u1, v1] = zone.uv;
  return {
    u: u0 + (u1 - u0) * placement.x,
    v: v0 + (v1 - v0) * placement.y,
  };
}

function spanFor(metrics, widthCm, heightCm) {
  return {
    uSpan: Math.min(0.9, widthCm / metrics.widthCm),
    vSpan: Math.min(0.9, heightCm / metrics.heightCm),
  };
}

/**
 * Build every attachment for a design.
 *
 * @param {object} state         DesignState
 * @param {object} garment       Result of buildGarment()
 * @param {Map<string, THREE.Material>} panelMaterials  Cloth materials by panel id
 * @returns {THREE.Group}
 */
export function buildAttachments(state, garment, panelMaterials, templateId) {
  const group = new THREE.Group();
  group.name = 'attachments';

  for (const zs of state.zones) {
    const zone = getZone(templateId, zs.zoneId);
    if (!zone) continue;
    const panel = garment.panels.get(zone.panel);
    if (!panel) continue;
    const metrics = garment.metrics[zone.panel];
    if (!metrics) continue;
    const cloth = panelMaterials.get(zone.panel);

    for (const mod of zs.structuralMods) {
      const meshes = buildStructural(mod, { zone, panel, metrics, cloth, zoneState: zs });
      for (const m of meshes) {
        m.userData.zoneId = zone.id;
        m.userData.elementId = mod.id;
        group.add(m);
      }
    }

    for (const item of zs.hardware) {
      const meshes = buildHardware(item, { zone, panel, metrics });
      for (const m of meshes) {
        m.userData.zoneId = zone.id;
        m.userData.elementId = item.id;
        group.add(m);
      }
    }
  }

  return group;
}

// ── Structural modifications ──────────────────────────────────────────────

function buildStructural(mod, ctx) {
  switch (mod.type) {
    case 'pocket': return buildPocket(mod, ctx);
    case 'zipper': return buildZipper(mod, ctx);
    case 'patch': return buildPatch(mod, ctx);
    default: return [];   // rips and seam exposure are surface treatments
  }
}

function buildPocket(mod, { zone, panel, metrics, cloth, zoneState }) {
  const p = mod.params;
  const { u, v } = zoneUV(zone, mod.placement);
  const out = [];

  if (mod.subtype === 'welt' || mod.subtype === 'zip-welt' || mod.subtype === 'slant') {
    // A welt is a slit with a lip, not a bag on the surface.
    const { uSpan, vSpan } = spanFor(metrics, p.width, Math.max(1.4, p.height));
    const geom = surfacePatchGeometry(panel, { u, v, uSpan, vSpan, offset: 0.0025, segments: 8 });
    const mat = cloth ? cloth.clone() : new THREE.MeshStandardMaterial({ color: '#333' });
    mat.color = new THREE.Color(0xdddddd);
    out.push(new THREE.Mesh(geom, mat));
    return out;
  }

  const { uSpan, vSpan } = spanFor(metrics, p.width, p.height);
  const depth = mod.subtype === 'cargo' ? Math.max(0.004, p.depth * 0.01) : 0.0045;

  // The pocket face, standing off the body by its depth.
  const face = surfacePatchGeometry(panel, { u, v, uSpan, vSpan, offset: depth, segments: 14 });
  const faceMat = cloth ? cloth.clone() : new THREE.MeshStandardMaterial({ color: '#555' });
  // Slightly deeper tone: two layers of the same cloth read darker than one.
  faceMat.color = new THREE.Color(0xe6e6e6);
  out.push(new THREE.Mesh(face, faceMat));

  // Side walls so the pocket has thickness at its silhouette.
  out.push(...pocketWalls(panel, { u, v, uSpan, vSpan, depth, material: faceMat }));

  if (p.flap) {
    const flap = surfacePatchGeometry(panel, {
      u, v: v - vSpan / 2 - vSpan * 0.14, uSpan: uSpan * 1.06,
      vSpan: vSpan * 0.3, offset: depth + 0.002, segments: 10,
    });
    const flapMat = faceMat.clone();
    flapMat.color = new THREE.Color(0xdadada);
    out.push(new THREE.Mesh(flap, flapMat));
  }

  return out;
}

/** Quads bridging the pocket face back to the garment surface. */
function pocketWalls(panel, { u, v, uSpan, vSpan, depth, material }) {
  const positions = [];
  const indices = [];
  const steps = 14;
  let idx = 0;

  const edge = (fixed, axis) => {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const uu = axis === 'u' ? u - uSpan / 2 + uSpan * t : fixed;
      const vv = axis === 'u' ? fixed : v - vSpan / 2 + vSpan * t;
      const s = panel.sample(uu, Math.min(0.999, Math.max(0.001, vv)));
      positions.push(...s.position);
      positions.push(
        s.position[0] + s.normal[0] * depth,
        s.position[1] + s.normal[1] * depth,
        s.position[2] + s.normal[2] * depth
      );
    }
    for (let i = 0; i < steps; i++) {
      const a = idx + i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    idx += (steps + 1) * 2;
  };

  edge(v - vSpan / 2, 'u');
  edge(v + vSpan / 2, 'u');
  edge(u - uSpan / 2, 'v');
  edge(u + uSpan / 2, 'v');

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mat = material.clone();
  mat.color = new THREE.Color(0xbdbdbd);
  mat.side = THREE.DoubleSide;
  return [new THREE.Mesh(geom, mat)];
}

function buildZipper(mod, { zone, panel, metrics }) {
  const p = mod.params;
  const { u, v } = zoneUV(zone, mod.placement);
  const out = [];
  const mat = finishMaterial(p.finish || 'gunmetal');
  const vertical = p.orientation !== 'horizontal';
  const lengthSpan = vertical
    ? Math.min(0.94, p.length / metrics.heightCm)
    : Math.min(0.94, p.length / metrics.widthCm);

  const gaugeM = (p.gauge || 5) * 0.0009;
  const teeth = Math.max(8, Math.round(p.length / (p.gauge * 0.09)));
  const toothGeom = new THREE.BoxGeometry(gaugeM * 2.2, gaugeM * 1.5, gaugeM * 0.9);
  const mesh = new THREE.InstancedMesh(toothGeom, mat, teeth * 2);

  const dummy = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < teeth; i++) {
    const t = i / (teeth - 1);
    const uu = vertical ? u : u - lengthSpan / 2 + lengthSpan * t;
    const vv = vertical ? v - lengthSpan / 2 + lengthSpan * t : v;
    const s = panel.sample(uu, Math.min(0.999, Math.max(0.001, vv)));
    // Two staggered rows meeting at the chain.
    for (const side of [-1, 1]) {
      const off = side * gaugeM * 1.1 * (i % 2 ? 1 : 0.55);
      dummy.position.set(
        s.position[0] + s.normal[0] * 0.0035 + (vertical ? off : 0),
        s.position[1] + s.normal[1] * 0.0035 + (vertical ? 0 : off),
        s.position[2] + s.normal[2] * 0.0035
      );
      dummy.lookAt(
        dummy.position.x + s.normal[0],
        dummy.position.y + s.normal[1],
        dummy.position.z + s.normal[2]
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  out.push(mesh);

  // Puller, sitting at the closed end.
  const pullEnd = panel.sample(
    vertical ? u : u - lengthSpan / 2,
    Math.min(0.999, Math.max(0.001, vertical ? v - lengthSpan / 2 : v))
  );
  const pull = new THREE.Mesh(new THREE.BoxGeometry(gaugeM * 3, gaugeM * 7, gaugeM * 1.4), mat);
  pull.position.set(
    pullEnd.position[0] + pullEnd.normal[0] * 0.006,
    pullEnd.position[1] + pullEnd.normal[1] * 0.006,
    pullEnd.position[2] + pullEnd.normal[2] * 0.006
  );
  pull.lookAt(
    pull.position.x + pullEnd.normal[0],
    pull.position.y + pullEnd.normal[1],
    pull.position.z + pullEnd.normal[2]
  );
  out.push(pull);

  return out;
}

function buildPatch(mod, { zone, panel, metrics }) {
  const p = mod.params;
  const { u, v } = zoneUV(zone, mod.placement);
  const { uSpan, vSpan } = spanFor(metrics, p.width, p.height);
  // The patch itself is painted into the texture; this gives it thickness so it
  // catches an edge highlight.
  const geom = surfacePatchGeometry(panel, { u, v, uSpan, vSpan, offset: 0.0018, segments: 10 });
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(p.color || '#141417'),
    roughness: 0.42, metalness: 0,
  });
  return [new THREE.Mesh(geom, mat)];
}

// ── Hardware ──────────────────────────────────────────────────────────────

function buildHardware(item, { zone, panel, metrics }) {
  const part = getHardware(item.hardwareId);
  if (!part) return [];
  const mat = finishMaterial(item.finish);
  const out = [];
  const sizeM = (item.size || part.defaultSize || 12) * 0.001;

  // Multiples spread along the zone rather than stacking in one spot.
  const count = item.count || 1;
  for (let i = 0; i < count; i++) {
    const spread = count === 1 ? 0 : (i / (count - 1) - 0.5);
    const placement = {
      x: clamp01(item.placement.x + (part.kind === 'button' || part.kind === 'eyelet' ? 0 : spread * 0.5)),
      y: clamp01(item.placement.y + (part.kind === 'button' || part.kind === 'eyelet' ? spread * 0.62 : 0)),
    };
    const { u, v } = zoneUV(zone, placement);
    const s = panel.sample(u, Math.min(0.999, Math.max(0.001, v)));
    const mesh = hardwareMesh(part, sizeM, mat);
    if (!mesh) continue;

    mesh.position.set(
      s.position[0] + s.normal[0] * sizeM * 0.28,
      s.position[1] + s.normal[1] * sizeM * 0.28,
      s.position[2] + s.normal[2] * sizeM * 0.28
    );
    // Orient the part's local +Y along the surface normal.
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(s.normal[0], s.normal[1], s.normal[2])
    );
    out.push(mesh);
  }

  if (part.kind === 'drawstring' && part.form !== 'barrel') {
    out.push(...buildDrawcord(item, part, { zone, panel, metrics, mat }));
  }

  return out;
}

function hardwareMesh(part, sizeM, mat) {
  const r = sizeM / 2;
  switch (part.form) {
    case 'domed': {
      const g = new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const m = new THREE.Mesh(g, mat);
      m.scale.set(1, 0.55, 1);
      return m;
    }
    case 'flat':
      return new THREE.Mesh(new THREE.CylinderGeometry(r, r, sizeM * 0.16, 22), mat);
    case 'tack': {
      const group = new THREE.Group();
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
      cap.scale.set(1, 0.5, 1);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, sizeM * 0.1, 22), mat);
      group.add(cap, rim);
      return group;
    }
    case 'ring':
      return new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.3, 10, 24).rotateX(Math.PI / 2), mat);
    case 'toggle': {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(sizeM * 0.16, sizeM * 0.6, 6, 14), mat);
      m.rotation.z = Math.PI / 2;
      return m;
    }
    case 'barrel':
      return new THREE.Mesh(new THREE.CylinderGeometry(sizeM * 2.2, sizeM * 2.6, sizeM * 4.5, 18), mat);
    case 'metal-tooth': case 'coil': case 'vislon': case 'invisible':
      return new THREE.Mesh(new THREE.BoxGeometry(sizeM, sizeM * 0.5, sizeM * 0.4), mat);
    default:
      return new THREE.Mesh(new THREE.CylinderGeometry(r, r, sizeM * 0.2, 16), mat);
  }
}

/** A cord threaded through a channel, hanging out at the front. */
function buildDrawcord(item, part, { zone, panel, mat }) {
  const radius = ((item.size || 5) * 0.001) / 2;
  const points = [];
  const [u0, v0, u1, v1] = zone.uv;
  const v = v0 + (v1 - v0) * item.placement.y;

  // Threaded around the channel from one eyelet to the other.
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const u = u0 + (u1 - u0) * (0.12 + t * 0.76);
    const s = panel.sample(u, Math.min(0.999, Math.max(0.001, v)));
    points.push(new THREE.Vector3(
      s.position[0] + s.normal[0] * radius * 1.5,
      s.position[1] + s.normal[1] * radius * 1.5,
      s.position[2] + s.normal[2] * radius * 1.5
    ));
  }
  // Two free ends falling from the front.
  const front = panel.sample(0.25, Math.min(0.999, v));
  for (const side of [-1, 1]) {
    const tail = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      tail.push(new THREE.Vector3(
        front.position[0] + front.normal[0] * radius * 2 + side * 0.012,
        front.position[1] - t * 0.11,
        front.position[2] + front.normal[2] * radius * 2 + t * 0.004
      ));
    }
    points.push(...(side === -1 ? tail : tail.reverse()));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const geom = new THREE.TubeGeometry(curve, 90, radius, 8, false);
  const cordMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(getFinish(item.finish).pbr.color),
    roughness: 0.82, metalness: 0,
  });
  void mat;
  return [new THREE.Mesh(geom, cordMat)];
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
