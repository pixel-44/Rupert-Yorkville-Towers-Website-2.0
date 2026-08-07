// Garment texture compositor.
//
// Turns a DesignState into the four maps the 3D material samples: albedo,
// normal, roughness and alpha. One set per panel.
//
// The layer order below is the whole design of this file, and it is the order a
// garment is actually made in:
//
//   cloth colour → weave shading → wash/dye treatment → distressing (which
//   reveals what is under the cloth) → construction stitching → applied
//   artwork (print sits flat, embroidery stands up).
//
// Anything raised writes into a separate detail height buffer that becomes a
// normal map at the end. That is what makes embroidery read as thread and a
// screen print read as ink, rather than both being flat pictures.

import { materialTiles, tileRepeatPerMetre } from './texture-lab.js';
import { getMaterial, getTreatment } from '../catalog/materials.js';
import { getZone } from '../catalog/templates.js';
import { getTypeface, getTechnique, canvasFont } from '../catalog/fonts.js';
import { getGraphic } from '../catalog/graphics.js';
import { severityWord } from '../state/design-state.js';

const DETAIL_SCALE = 0.5;   // detail normals at half res — bevels are soft anyway
const NEUTRAL_NORMAL = '#8080ff';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Deterministic noise field, cached — used for washes and abrasion. */
const noiseCache = new Map();
function noiseCanvas(kind, size = 256) {
  const key = `${kind}:${size}`;
  if (noiseCache.has(key)) return noiseCache.get(key);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  let seed = kind === 'acid' ? 991 : kind === 'stone' ? 137 : 613;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Blobby low-frequency field built by accumulating soft discs, then
  // thresholded differently per wash.
  const field = new Float32Array(size * size);
  // Acid wash needs enough overlapping discs that the threshold below carves
  // irregular continents out of them. Too few and each disc survives as its own
  // round spot, which reads as polka dots rather than marbling.
  const blobs = kind === 'acid' ? 160 : 60;
  for (let b = 0; b < blobs; b++) {
    const cx = rand() * size, cy = rand() * size;
    const r = size * (kind === 'acid' ? 0.05 + rand() * 0.12 : 0.05 + rand() * 0.13);
    const amp = 0.4 + rand() * 0.6;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Wrapped distance keeps the field tileable.
        const dx = Math.min(Math.abs(x - cx), size - Math.abs(x - cx));
        const dy = Math.min(Math.abs(y - cy), size - Math.abs(y - cy));
        const d = Math.hypot(dx, dy) / r;
        if (d < 1) field[y * size + x] += amp * (1 - d * d) ** 2;
      }
    }
  }
  let max = 0;
  for (const v of field) if (v > max) max = v;
  for (let i = 0; i < field.length; i++) {
    let v = max > 0 ? field[i] / max : 0;
    if (kind === 'acid') {
      // Sharp but not binary: a narrow ramp keeps the edge crisp while letting
      // neighbouring patches bleed into one another.
      v = v < 0.5 ? (v / 0.5) ** 2 * 0.25
        : v > 0.62 ? 1 : 0.25 + ((v - 0.5) / 0.12) * 0.75;
    }
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
    img.data[o + 3] = Math.round(v * 255);
  }
  ctx.putImageData(img, 0, 0);
  noiseCache.set(key, c);
  return c;
}

/**
 * Tiles are generated at high resolution but usually drawn much smaller. Canvas
 * pattern fills do not mipmap, so squeezing a 512 px weave into ~110 px inside
 * the fill produces moiré that reads as a printed grid rather than as cloth.
 * Pre-resampling by repeated halving removes it. Cached, because the same
 * tile-and-size pair recurs on every panel and every re-render.
 */
const resampleCache = new Map();
let resampleSeq = 0;
function resampled(tile, targetPx) {
  const size = Math.max(16, Math.min(tile.width, Math.round(targetPx)));
  if (size >= tile.width * 0.92) return tile;
  if (!tile.__tileId) tile.__tileId = ++resampleSeq;
  const key = `${tile.__tileId}:${size}`;
  const hit = resampleCache.get(key);
  if (hit) return hit;

  let src = tile;
  let current = tile.width;
  while (current / 2 >= size) {
    const half = makeCanvas(current / 2, current / 2);
    const hctx = half.getContext('2d');
    hctx.imageSmoothingEnabled = true;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(src, 0, 0, current / 2, current / 2);
    src = half;
    current /= 2;
  }
  if (current !== size) {
    const out = makeCanvas(size, size);
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, 0, 0, size, size);
    src = out;
  }
  resampleCache.set(key, src);
  return src;
}

function fillTiled(ctx, tile, rect, repeatPx, compositeOp = 'source-over', alpha = 1) {
  const source = resampled(tile, repeatPx);
  const pattern = ctx.createPattern(source, 'repeat');
  if (!pattern) return;
  const scale = repeatPx / source.width;
  pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
  ctx.save();
  ctx.globalCompositeOperation = compositeOp;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pattern;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/**
 * Composites and owns the texture canvases for one garment.
 *
 * Panels are updated independently: editing a cuff never re-renders the torso.
 */
export class GarmentCompositor {
  /**
   * @param {object} template
   * @param {Record<string, {widthCm: number, heightCm: number, res?: number}>} metrics
   */
  constructor(template, metrics) {
    this.template = template;
    this.metrics = metrics;
    this.panels = new Map();

    for (const [panelId, m] of Object.entries(metrics)) {
      const res = m.res || 1024;
      // Panels are far taller than wide (a leg) or the reverse (a waistband);
      // matching the aspect keeps texel density even instead of stretching.
      const aspect = m.widthCm / m.heightCm;
      const w = Math.round(aspect >= 1 ? res : res * aspect);
      const h = Math.round(aspect >= 1 ? res / aspect : res);
      this.panels.set(panelId, {
        id: panelId, metrics: m,
        width: Math.max(64, w), height: Math.max(64, h),
        albedo: makeCanvas(Math.max(64, w), Math.max(64, h)),
        normal: makeCanvas(Math.max(64, w), Math.max(64, h)),
        roughness: makeCanvas(Math.max(64, w), Math.max(64, h)),
        alpha: makeCanvas(Math.max(64, w), Math.max(64, h)),
        detail: makeCanvas(Math.round(w * DETAIL_SCALE) || 64, Math.round(h * DETAIL_SCALE) || 64),
        hasHoles: false,
        zones: [],
      });
    }

    for (const zone of template.zones) {
      const panel = this.panels.get(zone.panel);
      if (panel) panel.zones.push(zone);
    }
  }

  panelsForZones(zoneIds) {
    if (!zoneIds || !zoneIds.length) return [...this.panels.keys()];
    const out = new Set();
    for (const zoneId of zoneIds) {
      const zone = getZone(this.template.id, zoneId);
      if (zone && this.panels.has(zone.panel)) out.add(zone.panel);
    }
    return [...out];
  }

  /** Rebuild the given panels (all of them when `zoneIds` is empty). */
  update(state, zoneIds) {
    const ids = this.panelsForZones(zoneIds);
    for (const id of ids) this.renderPanel(this.panels.get(id), state);
    return ids;
  }

  renderPanel(panel, state) {
    const { width: W, height: H } = panel;
    const pxPerCmX = W / panel.metrics.widthCm;
    const pxPerCmY = H / panel.metrics.heightCm;

    const albedo = panel.albedo.getContext('2d');
    const rough = panel.roughness.getContext('2d');
    const normal = panel.normal.getContext('2d');
    const alpha = panel.alpha.getContext('2d');
    const detail = panel.detail.getContext('2d', { willReadFrequently: true });

    albedo.clearRect(0, 0, W, H);
    rough.clearRect(0, 0, W, H);
    detail.clearRect(0, 0, panel.detail.width, panel.detail.height);

    normal.fillStyle = NEUTRAL_NORMAL;
    normal.fillRect(0, 0, W, H);
    alpha.fillStyle = '#ffffff';
    alpha.fillRect(0, 0, W, H);
    panel.hasHoles = false;

    // Zones rarely tile a panel edge to edge — a shoulder yoke, a seam
    // allowance or the strip under a hem band belongs to no zone. Ground the
    // whole panel in its dominant cloth first, so those gaps read as the same
    // fabric rather than as unpainted texture (which samples as black, mirror
    // finish, and looks like a defect).
    const ground = panel.zones.find((z) => !z.role) || panel.zones[0];
    if (ground) {
      const gs = state.zones.find((z) => z.zoneId === ground.id);
      const gm = gs && getMaterial(gs.material);
      if (gm) {
        const tiles = materialTiles(gm);
        const repeat = (panel.metrics.widthCm / 100) * tileRepeatPerMetre(gm);
        this.paintCloth({
          zs: gs, rect: { x: 0, y: 0, w: W, h: H }, tiles,
          tilePx: Math.max(24, W / Math.max(1, repeat)),
          albedo, rough, normal, alpha, material: gm, panel,
        });
      }
    }

    for (const zone of panel.zones) {
      const zs = state.zones.find((z) => z.zoneId === zone.id);
      if (!zs) continue;
      const rect = uvRect(zone.uv, W, H);
      const material = getMaterial(zs.material);
      if (!material) continue;
      const tiles = materialTiles(material);
      const repeatPx = (panel.metrics.widthCm / 100) * tileRepeatPerMetre(material);
      const tilePx = Math.max(24, W / Math.max(1, repeatPx));

      const ctxState = {
        panel, zone, zs, rect, material, tiles, tilePx,
        pxPerCmX, pxPerCmY, albedo, rough, normal, alpha, detail, state,
      };

      this.paintCloth(ctxState);
      this.paintTreatment(ctxState);
      this.paintStructural(ctxState);
      this.paintGraphics(ctxState);
      this.paintText(ctxState);
    }

    this.resolveDetailNormals(panel);
  }

  // ── 1. Cloth: colour, weave shading, roughness ──────────────────────────

  paintCloth({ zs, rect, tiles, tilePx, albedo, rough, normal, alpha, material, panel }) {
    albedo.save();
    albedo.beginPath();
    albedo.rect(rect.x, rect.y, rect.w, rect.h);
    albedo.clip();

    albedo.fillStyle = zs.color;
    albedo.fillRect(rect.x, rect.y, rect.w, rect.h);
    // `overlay` treats mid-grey as neutral, which is exactly how the weave tile
    // is encoded — so the chosen colour survives untouched where the cloth is
    // flat and only picks up light and shade from the weave. (`multiply` would
    // halve every colour, since it reads mid-grey as 50% black.)
    fillTiled(albedo, tiles.luminance, rect, tilePx, 'overlay', 1);
    // Overlay compresses toward the backdrop on very dark cloth, where the
    // weave would otherwise disappear; a whisper of screen keeps it legible.
    fillTiled(albedo, tiles.luminance, rect, tilePx, 'screen', 0.07);
    albedo.restore();

    fillTiled(normal, tiles.normal, rect, tilePx, 'source-over', 1);
    fillTiled(rough, tiles.roughness, rect, tilePx, 'source-over', 1);

    // Mesh is genuinely open cloth. Its apertures belong in the alpha map, not
    // in shading, or it renders as a printed grid on a solid panel.
    if (material.weave === 'mesh') {
      const cells = Math.round(material.grain?.cells ?? 40);
      const pitch = tilePx / cells;
      if (pitch > 1.5) {
        panel.hasHoles = true;
        alpha.save();
        alpha.beginPath();
        alpha.rect(rect.x, rect.y, rect.w, rect.h);
        alpha.clip();
        alpha.fillStyle = '#000000';
        const hole = pitch * 0.52;
        for (let y = rect.y; y < rect.y + rect.h; y += pitch) {
          for (let x = rect.x; x < rect.x + rect.w; x += pitch) {
            alpha.beginPath();
            alpha.roundRect(x + (pitch - hole) / 2, y + (pitch - hole) / 2, hole, hole, hole * 0.3);
            alpha.fill();
          }
        }
        alpha.restore();
      }
    }
  }

  // ── 2. Wash and dye treatments ──────────────────────────────────────────

  paintTreatment({ zs, zone, rect, albedo, rough, pxPerCmX }) {
    if (!zs.treatment || zs.treatment === 'none') return;
    const t = zs.treatment;
    albedo.save();
    albedo.beginPath();
    albedo.rect(rect.x, rect.y, rect.w, rect.h);
    albedo.clip();

    const noiseScale = rect.w / 2.2;
    if (t === 'stonewash' || t === 'rinse') {
      fillTiled(albedo, noiseCanvas('stone'), rect, noiseScale, 'screen', t === 'rinse' ? 0.07 : 0.2);
      fillTiled(albedo, noiseCanvas('stone'), rect, noiseScale * 0.55, 'screen', t === 'rinse' ? 0.04 : 0.1);
    } else if (t === 'acid') {
      // Acid wash is high contrast but fine-grained: broad pale continents read
      // as cow print, not denim. Small marbled patches at moderate strength.
      fillTiled(albedo, noiseCanvas('acid'), rect, noiseScale * 0.5, 'screen', 0.4);
      fillTiled(albedo, noiseCanvas('acid'), rect, noiseScale * 0.22, 'screen', 0.22);
    } else if (t === 'bleach') {
      albedo.globalCompositeOperation = 'screen';
      albedo.globalAlpha = 0.26;
      albedo.fillStyle = '#ffffff';
      albedo.fillRect(rect.x, rect.y, rect.w, rect.h);
    } else if (t === 'raw') {
      albedo.globalCompositeOperation = 'multiply';
      albedo.globalAlpha = 0.22;
      albedo.fillStyle = '#2b3352';
      albedo.fillRect(rect.x, rect.y, rect.w, rect.h);
    } else if (t === 'overdye') {
      albedo.globalCompositeOperation = 'multiply';
      albedo.globalAlpha = 0.4;
      albedo.fillStyle = '#6b6152';
      albedo.fillRect(rect.x, rect.y, rect.w, rect.h);
    } else if (t === 'whisker') {
      this.paintWhiskers(albedo, zone, rect, pxPerCmX);
    } else if (t === 'coated') {
      albedo.globalCompositeOperation = 'multiply';
      albedo.globalAlpha = 0.18;
      albedo.fillStyle = '#3a3a44';
      albedo.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    albedo.restore();

    // A resin coat is shinier; a stonewash is fuzzier. Roughness has to move
    // with the finish or the wash reads as a printed-on picture.
    const shift = t === 'coated' ? -0.22 : t === 'stonewash' || t === 'acid' ? 0.12 : 0;
    if (shift !== 0) {
      rough.save();
      rough.globalCompositeOperation = shift < 0 ? 'multiply' : 'screen';
      rough.globalAlpha = Math.abs(shift);
      rough.fillStyle = shift < 0 ? '#808080' : '#ffffff';
      rough.fillRect(rect.x, rect.y, rect.w, rect.h);
      rough.restore();
    }
  }

  /** Hand-sanded wear: whiskers at the lap, honeycomb behind the knee. */
  paintWhiskers(ctx, zone, rect, pxPerCmX) {
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    const isKnee = zone.id.startsWith('knee');
    const isHip = zone.id === 'front-hip' || zone.id === 'seat';
    if (!isKnee && !isHip) return;

    if (isHip) {
      for (let i = 0; i < 7; i++) {
        const y = rect.y + rect.h * (0.34 + i * 0.055);
        ctx.globalAlpha = 0.3 - i * 0.03;
        ctx.lineWidth = pxPerCmX * (0.9 - i * 0.06);
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.w * 0.06, y);
        ctx.quadraticCurveTo(rect.x + rect.w * 0.3, y - rect.h * 0.05, rect.x + rect.w * 0.46, y - rect.h * 0.02);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.w * 0.94, y);
        ctx.quadraticCurveTo(rect.x + rect.w * 0.7, y - rect.h * 0.05, rect.x + rect.w * 0.54, y - rect.h * 0.02);
        ctx.stroke();
      }
    }
    if (isKnee) {
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = pxPerCmX * 0.7;
      for (let i = 0; i < 6; i++) {
        const y = rect.y + rect.h * (0.24 + i * 0.1);
        ctx.beginPath();
        for (let k = 0; k <= 8; k++) {
          const x = rect.x + rect.w * (0.55 + (k / 8) * 0.4);
          const yy = y + (k % 2 ? rect.h * 0.02 : 0);
          k === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── 3. Structural modifications ─────────────────────────────────────────

  paintStructural(c) {
    for (const mod of c.zs.structuralMods) {
      switch (mod.type) {
        case 'rip': this.paintRip(c, mod); break;
        case 'seamExposure': this.paintSeam(c, mod); break;
        case 'pocket': this.paintPocketStitching(c, mod); break;
        case 'zipper': this.paintZipperTape(c, mod); break;
        case 'patch': this.paintPatch(c, mod); break;
      }
    }
  }

  /**
   * A rip is not a transparent cutout. It abrades the face cloth, exposes the
   * warp threads still spanning the hole, and shows a distinct under-layer
   * behind — which is what a tailor has to reproduce.
   */
  paintRip(c, mod) {
    const { albedo, detail, rect, pxPerCmX, pxPerCmY, alpha, panel } = c;
    const p = mod.params;
    const cx = rect.x + rect.w * mod.placement.x;
    const cy = rect.y + rect.h * mod.placement.y;
    const rw = (p.width * pxPerCmX) / 2;
    const rh = (p.height * pxPerCmY) / 2;
    const sev = p.severity;

    const underColor = p.underLayer === 'skin' ? '#c8a58c'
      : p.underLayer === 'contrast' ? '#1c1c1f'
        : p.underLayer === 'lining' ? '#5a5f6b' : '#d9d2c2';

    albedo.save();
    albedo.translate(cx, cy);
    albedo.rotate((mod.placement.rotation * Math.PI) / 180);

    // Abraded halo: the cloth lightens before it opens.
    const halo = albedo.createRadialGradient(0, 0, rw * 0.5, 0, 0, rw * 1.9);
    halo.addColorStop(0, `rgba(255,255,255,${0.34 * sev})`);
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    albedo.fillStyle = halo;
    albedo.beginPath();
    albedo.ellipse(0, 0, rw * 1.9, rh * 2.1, 0, 0, Math.PI * 2);
    albedo.fill();

    // The opening itself, showing what is behind the cloth.
    albedo.beginPath();
    ellipseWobble(albedo, rw, rh, 13);
    albedo.fillStyle = underColor;
    albedo.fill();
    // Under-layer weave, so the backing does not read as flat paint.
    albedo.save();
    albedo.clip();
    albedo.globalAlpha = 0.5;
    for (let i = -12; i < 12; i++) {
      albedo.strokeStyle = i % 2 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.16)';
      albedo.lineWidth = Math.max(1, pxPerCmY * 0.06);
      albedo.beginPath();
      albedo.moveTo(-rw * 1.2, (i / 12) * rh * 1.2);
      albedo.lineTo(rw * 1.2, (i / 12) * rh * 1.2);
      albedo.stroke();
    }
    albedo.restore();

    // Warp threads still bridging the hole — the detail that sells a rip.
    if (p.threads) {
      const count = Math.max(3, Math.round(9 * (1 - sev * 0.55)));
      albedo.strokeStyle = 'rgba(236,232,220,0.92)';
      albedo.lineWidth = Math.max(1, pxPerCmX * 0.07);
      for (let i = 0; i < count; i++) {
        const x = -rw + ((i + 0.5) / count) * rw * 2;
        albedo.beginPath();
        albedo.moveTo(x, -rh * 1.05);
        albedo.quadraticCurveTo(x + rw * 0.06, 0, x, rh * 1.05);
        albedo.stroke();
      }
    }

    // Frayed edge fibres.
    albedo.strokeStyle = 'rgba(240,236,226,0.8)';
    albedo.lineWidth = Math.max(1, pxPerCmX * 0.05);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const len = (0.1 + ((i * 37) % 11) / 40) * rw * 0.5 * (0.5 + sev);
      albedo.beginPath();
      albedo.moveTo(Math.cos(a) * rw, Math.sin(a) * rh);
      albedo.lineTo(Math.cos(a) * (rw + len), Math.sin(a) * (rh + len));
      albedo.stroke();
    }
    albedo.restore();

    // Height: the hole is a depression, its rim is raised rolled cloth.
    const d = detail;
    d.save();
    d.translate(cx * DETAIL_SCALE, cy * DETAIL_SCALE);
    d.rotate((mod.placement.rotation * Math.PI) / 180);
    const g = d.createRadialGradient(0, 0, 0, 0, 0, rw * 1.5 * DETAIL_SCALE);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    d.fillStyle = g;
    d.beginPath();
    d.ellipse(0, 0, rw * 1.5 * DETAIL_SCALE, rh * 1.7 * DETAIL_SCALE, 0, 0, Math.PI * 2);
    d.fill();
    d.restore();

    // Only a badly shredded panel opens all the way through; below that the
    // backing is what the eye sees, and punching alpha would look like a bug.
    if (sev > 0.78) {
      panel.hasHoles = true;
      alpha.save();
      alpha.translate(cx, cy);
      alpha.rotate((mod.placement.rotation * Math.PI) / 180);
      alpha.fillStyle = '#000000';
      alpha.beginPath();
      ellipseWobble(alpha, rw * 0.82, rh * 0.78, 13);
      alpha.fill();
      if (p.threads) {
        // Threads survive the hole, so they must survive the alpha map too.
        alpha.strokeStyle = '#ffffff';
        alpha.lineWidth = Math.max(1.5, pxPerCmX * 0.09);
        const count = Math.max(3, Math.round(9 * (1 - sev * 0.55)));
        for (let i = 0; i < count; i++) {
          const x = -rw + ((i + 0.5) / count) * rw * 2;
          alpha.beginPath();
          alpha.moveTo(x, -rh * 1.05);
          alpha.quadraticCurveTo(x + rw * 0.06, 0, x, rh * 1.05);
          alpha.stroke();
        }
      }
      alpha.restore();
    }
  }

  paintSeam(c, mod) {
    const { albedo, detail, rect, zs, pxPerCmX } = c;
    const p = mod.params;
    const w = Math.max(2, p.width * pxPerCmX);
    const inset = w * 0.9;

    albedo.save();
    albedo.strokeStyle = shade(zs.color, -0.18);
    albedo.lineWidth = w;
    albedo.strokeRect(rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2);

    if (p.style === 'raw-edge') {
      albedo.strokeStyle = 'rgba(236,232,220,0.55)';
      albedo.lineWidth = Math.max(1, w * 0.28);
      albedo.setLineDash([w * 0.25, w * 0.5]);
      albedo.strokeRect(rect.x + inset * 0.4, rect.y + inset * 0.4, rect.w - inset * 0.8, rect.h - inset * 0.8);
      albedo.setLineDash([]);
    }

    // Topstitching.
    albedo.strokeStyle = p.threadColor || '#e8e0cf';
    albedo.lineWidth = Math.max(1, w * 0.2);
    albedo.setLineDash([w * 0.55, w * 0.4]);
    albedo.strokeRect(rect.x + inset * 1.7, rect.y + inset * 1.7, rect.w - inset * 3.4, rect.h - inset * 3.4);
    albedo.setLineDash([]);
    albedo.restore();

    detail.save();
    detail.strokeStyle = 'rgba(255,255,255,0.75)';
    detail.lineWidth = Math.max(1, w * DETAIL_SCALE);
    detail.strokeRect(
      (rect.x + inset) * DETAIL_SCALE, (rect.y + inset) * DETAIL_SCALE,
      (rect.w - inset * 2) * DETAIL_SCALE, (rect.h - inset * 2) * DETAIL_SCALE
    );
    detail.restore();
  }

  /** Pockets are meshes; what belongs in the texture is their stitching. */
  paintPocketStitching(c, mod) {
    const { albedo, rect, pxPerCmX, pxPerCmY, zs } = c;
    const p = mod.params;
    const x = rect.x + rect.w * mod.placement.x;
    const y = rect.y + rect.h * mod.placement.y;
    const w = p.width * pxPerCmX;
    const h = p.height * pxPerCmY;

    albedo.save();
    albedo.translate(x, y);
    albedo.rotate((mod.placement.rotation * Math.PI) / 180);
    albedo.strokeStyle = shade(zs.color, -0.42);
    albedo.lineWidth = Math.max(1, pxPerCmX * 0.12);
    albedo.setLineDash([pxPerCmX * 0.3, pxPerCmX * 0.22]);

    if (mod.subtype === 'welt' || mod.subtype === 'zip-welt') {
      albedo.strokeRect(-w / 2, -h / 2, w, h);
    } else if (mod.subtype === 'slant') {
      albedo.beginPath();
      albedo.moveTo(-w / 2, -h / 2);
      albedo.lineTo(w / 2, h / 2);
      albedo.stroke();
    } else {
      albedo.strokeRect(-w / 2, -h / 2, w, h);
      albedo.strokeRect(-w / 2 + pxPerCmX * 0.35, -h / 2 + pxPerCmY * 0.35,
        w - pxPerCmX * 0.7, h - pxPerCmY * 0.7);
    }
    albedo.setLineDash([]);

    if (p.bartack) {
      albedo.lineWidth = Math.max(2, pxPerCmX * 0.28);
      for (const sx of [-1, 1]) {
        albedo.beginPath();
        albedo.moveTo((sx * w) / 2, -h / 2);
        albedo.lineTo((sx * w) / 2, -h / 2 + pxPerCmY * 0.7);
        albedo.stroke();
      }
    }
    albedo.restore();
  }

  paintZipperTape(c, mod) {
    const { albedo, rect, pxPerCmX, pxPerCmY, zs } = c;
    const p = mod.params;
    const x = rect.x + rect.w * mod.placement.x;
    const y = rect.y + rect.h * mod.placement.y;
    const len = p.length * (p.orientation === 'vertical' ? pxPerCmY : pxPerCmX);
    const tape = pxPerCmX * 1.6;

    albedo.save();
    albedo.translate(x, y);
    albedo.rotate(((mod.placement.rotation + (p.orientation === 'vertical' ? 0 : 90)) * Math.PI) / 180);
    albedo.fillStyle = shade(zs.color, -0.3);
    albedo.fillRect(-tape / 2, -len / 2, tape, len);
    albedo.strokeStyle = shade(zs.color, -0.5);
    albedo.lineWidth = Math.max(1, pxPerCmX * 0.1);
    albedo.setLineDash([pxPerCmY * 0.25, pxPerCmY * 0.2]);
    albedo.beginPath();
    albedo.moveTo(-tape / 2, -len / 2); albedo.lineTo(-tape / 2, len / 2);
    albedo.moveTo(tape / 2, -len / 2); albedo.lineTo(tape / 2, len / 2);
    albedo.stroke();
    albedo.setLineDash([]);
    albedo.restore();
  }

  paintPatch(c, mod) {
    const { albedo, detail, rect, pxPerCmX, pxPerCmY } = c;
    const p = mod.params;
    const x = rect.x + rect.w * mod.placement.x;
    const y = rect.y + rect.h * mod.placement.y;
    const w = p.width * pxPerCmX, h = p.height * pxPerCmY;

    albedo.save();
    albedo.translate(x, y);
    albedo.rotate((mod.placement.rotation * Math.PI) / 180);
    albedo.fillStyle = p.color || '#141417';
    patchPath(albedo, w, h, p.shape);
    albedo.fill();
    // Merrowed border: a dense overlock ring around the edge.
    albedo.strokeStyle = shade(p.color || '#141417', 0.42);
    albedo.lineWidth = Math.max(2, pxPerCmX * 0.32);
    patchPath(albedo, w, h, p.shape);
    albedo.stroke();
    albedo.restore();

    detail.save();
    detail.translate(x * DETAIL_SCALE, y * DETAIL_SCALE);
    detail.rotate((mod.placement.rotation * Math.PI) / 180);
    detail.fillStyle = 'rgba(255,255,255,0.85)';
    patchPath(detail, w * DETAIL_SCALE, h * DETAIL_SCALE, p.shape);
    detail.fill();
    detail.restore();
  }

  // ── 4. Applied artwork ──────────────────────────────────────────────────

  paintGraphics(c) {
    const { zs, rect, albedo, detail, rough, state, pxPerCmX } = c;
    for (const g of zs.graphics) {
      const tech = getTechnique(g.technique);
      const size = Math.min(rect.w, rect.h) * g.scale;
      const x = rect.x + rect.w * g.placement.x;
      const y = rect.y + rect.h * g.placement.y;

      const art = this.rasteriseGraphic(g, size, state);
      if (!art) continue;

      albedo.save();
      albedo.translate(x, y);
      albedo.rotate((g.rotation * Math.PI) / 180);
      albedo.drawImage(art, -size / 2, -size / 2, size, size);
      if (tech.raised > 0.6) this.overlayStitchTexture(albedo, art, size, g.color);
      albedo.restore();

      if (tech.raised > 0) {
        detail.save();
        detail.translate(x * DETAIL_SCALE, y * DETAIL_SCALE);
        detail.rotate((g.rotation * Math.PI) / 180);
        detail.globalAlpha = tech.raised;
        detail.filter = `blur(${Math.max(0.6, pxPerCmX * 0.05)}px)`;
        detail.drawImage(art, (-size / 2) * DETAIL_SCALE, (-size / 2) * DETAIL_SCALE,
          size * DETAIL_SCALE, size * DETAIL_SCALE);
        detail.filter = 'none';
        detail.restore();
      }

      this.stampRoughness(rough, art, x, y, size, g.rotation, tech.sheen);
    }
  }

  paintText(c) {
    const { zs, rect, albedo, detail, rough, pxPerCmY, pxPerCmX } = c;
    for (const t of zs.textElements) {
      const tech = getTechnique(t.technique);
      const px = t.size * pxPerCmY;
      const art = renderTextArt(t, px, pxPerCmX);
      if (!art) continue;

      const x = rect.x + rect.w * t.placement.x;
      const y = rect.y + rect.h * t.placement.y;

      albedo.save();
      albedo.translate(x, y);
      albedo.rotate((t.placement.rotation * Math.PI) / 180);
      albedo.drawImage(art, -art.width / 2, -art.height / 2);
      if (tech.raised > 0.6) this.overlayStitchTexture(albedo, art, art.width, t.color, art.height);
      albedo.restore();

      if (tech.raised > 0) {
        detail.save();
        detail.translate(x * DETAIL_SCALE, y * DETAIL_SCALE);
        detail.rotate((t.placement.rotation * Math.PI) / 180);
        detail.globalAlpha = tech.raised;
        detail.filter = `blur(${Math.max(0.5, px * 0.02)}px)`;
        detail.drawImage(art, (-art.width / 2) * DETAIL_SCALE, (-art.height / 2) * DETAIL_SCALE,
          art.width * DETAIL_SCALE, art.height * DETAIL_SCALE);
        detail.filter = 'none';
        detail.restore();
      }

      this.stampRoughness(rough, art, x, y, art.width, t.placement.rotation, tech.sheen, art.height);
    }
  }

  /**
   * Diagonal satin striations that read as thread rather than ink.
   *
   * They are built on their own canvas and masked to the artwork's alpha before
   * being composited. Stroking straight onto the target with `source-atop`
   * would land them on the whole rectangle — the cloth underneath is opaque
   * too — which paints a visible box around the lettering.
   */
  overlayStitchTexture(ctx, art, w, color, h = w) {
    const tw = Math.max(2, Math.round(w));
    const th = Math.max(2, Math.round(h));
    const layer = makeCanvas(tw, th);
    const lc = layer.getContext('2d');

    const step = Math.max(3, tw * 0.028);
    lc.lineWidth = Math.max(1, tw * 0.012);
    lc.globalAlpha = 0.34;
    lc.strokeStyle = shade(color, 0.5);
    for (let i = -th; i < tw + th; i += step) {
      lc.beginPath();
      lc.moveTo(i, 0);
      lc.lineTo(i - th, th);
      lc.stroke();
    }
    lc.globalAlpha = 0.26;
    lc.strokeStyle = shade(color, -0.45);
    for (let i = -th; i < tw + th; i += step) {
      lc.beginPath();
      lc.moveTo(i + step * 0.45, 0);
      lc.lineTo(i - th + step * 0.45, th);
      lc.stroke();
    }

    // Keep the striations only where there is actually thread.
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'destination-in';
    lc.drawImage(art, 0, 0, tw, th);

    ctx.drawImage(layer, -w / 2, -h / 2, w, h);
  }

  /** Artwork replaces the cloth's roughness with the technique's own. */
  stampRoughness(rough, art, x, y, w, rotation, sheen, h = w) {
    rough.save();
    rough.translate(x, y);
    rough.rotate((rotation * Math.PI) / 180);
    rough.globalCompositeOperation = 'source-over';
    const tmp = makeCanvas(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)));
    const tctx = tmp.getContext('2d');
    tctx.drawImage(art, 0, 0, tmp.width, tmp.height);
    tctx.globalCompositeOperation = 'source-in';
    const v = Math.round(Math.min(255, Math.max(0, sheen * 255)));
    tctx.fillStyle = `rgb(${v},${v},${v})`;
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    rough.drawImage(tmp, -w / 2, -h / 2, w, h);
    rough.restore();
  }

  rasteriseGraphic(g, size, state) {
    const px = Math.max(8, Math.round(size));
    if (g.assetId.startsWith('upload:')) {
      const asset = state.assets?.[g.assetId];
      const img = asset && uploadedImage(g.assetId, asset.dataUrl);
      if (!img || !img.complete || !img.naturalWidth) return null;
      const c = makeCanvas(px, px);
      const ctx = c.getContext('2d');
      const s = Math.min(px / img.naturalWidth, px / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
      return c;
    }
    const asset = getGraphic(g.assetId);
    if (!asset) return null;
    const c = makeCanvas(px, px);
    const ctx = c.getContext('2d');
    asset.draw(ctx, px, g.color);
    return c;
  }

  // ── 5. Detail height → normal ───────────────────────────────────────────

  /**
   * Everything raised was drawn into `detail` as a height. Convert it to a
   * normal map and lay it over the woven normals so embroidery, puff, patches
   * and rip rims catch the light as geometry rather than as pictures.
   */
  resolveDetailNormals(panel) {
    const dW = panel.detail.width, dH = panel.detail.height;
    const dctx = panel.detail.getContext('2d', { willReadFrequently: true });
    const src = dctx.getImageData(0, 0, dW, dH);
    const data = src.data;

    // Bail out cheaply when nothing raised was drawn on this panel.
    let any = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 4) { any = true; break; }
    }
    if (!any) return;

    const height = new Float32Array(dW * dH);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      // Premultiply by alpha so untouched cloth stays perfectly flat.
      height[p] = (data[i] / 255) * (data[i + 3] / 255);
    }

    const out = dctx.createImageData(dW, dH);
    const strength = 9;
    for (let y = 0; y < dH; y++) {
      for (let x = 0; x < dW; x++) {
        const i = y * dW + x;
        const l = height[y * dW + Math.max(0, x - 1)];
        const r = height[y * dW + Math.min(dW - 1, x + 1)];
        const u = height[Math.max(0, y - 1) * dW + x];
        const d = height[Math.min(dH - 1, y + 1) * dW + x];
        const nx = (l - r) * strength;
        const ny = (u - d) * strength;
        const len = Math.hypot(nx, ny, 1);
        const o = i * 4;
        out.data[o] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
        out.data[o + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
        out.data[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
        // Show the detail normal where the surface is sloped or raised.
        const slope = Math.min(1, Math.hypot(nx, ny) * 0.9 + height[i] * 0.9);
        out.data[o + 3] = Math.round(slope * 255);
      }
    }

    const tmp = makeCanvas(dW, dH);
    tmp.getContext('2d').putImageData(out, 0, 0);
    const nctx = panel.normal.getContext('2d');
    nctx.save();
    nctx.imageSmoothingEnabled = true;
    nctx.drawImage(tmp, 0, 0, panel.width, panel.height);
    nctx.restore();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function uvRect(uv, W, H) {
  const [u0, v0, u1, v1] = uv;
  return { x: u0 * W, y: v0 * H, w: (u1 - u0) * W, h: (v1 - v0) * H };
}

function ellipseWobble(ctx, rw, rh, steps) {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    // A torn edge is never a clean ellipse; a fixed wobble keeps it stable
    // across re-renders so the shape does not crawl while you drag a slider.
    const k = 1 + 0.16 * Math.sin(a * 3.7) + 0.09 * Math.cos(a * 6.1);
    const x = Math.cos(a) * rw * k;
    const y = Math.sin(a) * rh * k;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function patchPath(ctx, w, h, shape) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'shield') {
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, h * 0.1);
    ctx.quadraticCurveTo(w / 2, h / 2, 0, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h * 0.1);
    ctx.closePath();
  } else if (shape === 'rect') {
    ctx.rect(-w / 2, -h / 2, w, h);
  } else {
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.16);
  }
}

const imageCache = new Map();
function uploadedImage(id, dataUrl) {
  let img = imageCache.get(id);
  if (!img) {
    img = new Image();
    img.src = dataUrl;
    imageCache.set(id, img);
  }
  return img;
}

/** Has an uploaded asset finished decoding? The studio waits before rendering. */
export function assetsReady(state) {
  const pending = [];
  for (const [id, asset] of Object.entries(state.assets || {})) {
    const img = uploadedImage(id, asset.dataUrl);
    if (!img.complete) pending.push(new Promise((res) => { img.onload = res; img.onerror = res; }));
  }
  return Promise.all(pending);
}

/**
 * Render a text element to its own canvas, honouring curvature, tracking and
 * the width/slant synthesis a typeface entry declares.
 */
export function renderTextArt(t, capPx, pxPerCmX) {
  const face = getTypeface(t.font);
  const content = face.synth.case === 'upper' ? t.text.toUpperCase()
    : face.synth.case === 'lower' ? t.text.toLowerCase() : t.text;
  if (!content) return null;

  // Cap height is roughly 0.7 em for the faces in this library.
  const fontPx = Math.max(6, capPx / 0.7);
  const measure = makeCanvas(4, 4).getContext('2d');
  measure.font = canvasFont(face.id, fontPx);
  const tracking = (face.synth.tracking + (t.tracking || 0)) * fontPx;
  const chars = [...content];
  const widths = chars.map((ch) => measure.measureText(ch).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  const curve = t.curvature || 0;

  const padding = fontPx * 0.5;
  const arcSagitta = Math.abs(curve) * totalW * 0.3;
  const W = Math.ceil(totalW * face.synth.width + padding * 2 + Math.abs(face.synth.slant) * fontPx * 0.03);
  const H = Math.ceil(fontPx * 1.25 + arcSagitta + padding);
  const c = makeCanvas(Math.max(4, W), Math.max(4, H));
  const ctx = c.getContext('2d');

  ctx.translate(W / 2, H / 2);
  // Width and slant are synthesised because the face list is deliberately
  // built from what a browser actually has; the spec sheet states them.
  ctx.transform(face.synth.width, 0, Math.tan((-face.synth.slant * Math.PI) / 180), 1, 0, 0);
  ctx.font = canvasFont(face.id, fontPx);
  ctx.fillStyle = t.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (Math.abs(curve) < 0.02) {
    let x = -totalW / 2;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], x + widths[i] / 2, 0);
      x += widths[i] + tracking;
    }
  } else {
    // Arc radius from the chord and the requested sagitta.
    const radius = Math.max(totalW * 0.6, (totalW * totalW) / (8 * Math.max(1, arcSagitta)) + arcSagitta / 2);
    const dir = curve > 0 ? -1 : 1;
    const totalAngle = totalW / radius;
    let angle = -totalAngle / 2;
    for (let i = 0; i < chars.length; i++) {
      const step = (widths[i] + tracking) / radius;
      const a = angle + step / 2;
      ctx.save();
      ctx.rotate(a * -dir);
      ctx.translate(0, dir * radius);
      ctx.fillText(chars[i], 0, -dir * radius);
      ctx.restore();
      angle += step;
    }
  }

  void pxPerCmX;
  return c;
}

/** Lighten (t > 0) or darken (t < 0) a hex colour. */
export function shade(hex, t) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (t >= 0) {
    r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t;
  } else {
    r *= 1 + t; g *= 1 + t; b *= 1 + t;
  }
  const to = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export { severityWord };
