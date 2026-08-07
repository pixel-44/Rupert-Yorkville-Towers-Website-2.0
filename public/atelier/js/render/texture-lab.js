// Procedural fabric textures.
//
// Every cloth is generated from a single tileable height field. Shading,
// normals and roughness are all derived from that one field, which is why denim
// reads as a diagonal twill under a moving light while fleece reads as matted
// pile — the geometry of the surface is actually different, not just its colour.
//
// The height field is deliberately produced *without* colour. Zone colour is
// applied later by the compositor as a tint, so recolouring a panel never
// requires regenerating a texture, and interface colours can never leak into
// fabric shading.
//
// Tiles are cached per material; generation costs 20–60 ms and happens once.

const TILE = 512;
const cache = new Map();

// ── Tileable value noise ──────────────────────────────────────────────────

function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Value noise on a wrapped lattice, so the tile joins itself seamlessly. */
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const wrap = (v) => ((v % period) + period) % period;
  const x0 = wrap(xi), x1 = wrap(xi + 1);
  const y0 = wrap(yi), y1 = wrap(yi + 1);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal sum. `period` is in lattice cells across the whole tile. */
function fbm(x, y, period, octaves, seed) {
  let sum = 0, amp = 0.5, p = period, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x * p, y * p, p, seed + o * 71) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

// ── Height fields, one per weave ──────────────────────────────────────────
//
// All take normalised (u, v) in [0,1) and return a height in [0,1].
// `g` is the material's `grain` record.

const WEAVES = {
  // Diagonal rib. Denim, chino, gabardine, moleskin.
  twill(u, v, g) {
    const ribs = g.ribs ?? 30;
    const angle = ((g.angle ?? 27) * Math.PI) / 180;
    // Rounding the rib count keeps the diagonal continuous across the seam.
    const rx = Math.round(ribs * Math.cos(angle));
    const ry = Math.round(ribs * Math.sin(angle));
    const diag = u * rx + v * ry;
    const rib = 0.5 + 0.5 * Math.cos(diag * Math.PI * 2);
    // Individual warp and weft yarns crossing under the rib.
    const warp = 0.5 + 0.5 * Math.cos(u * Math.round(ribs * 1.7) * Math.PI * 2);
    const weft = 0.5 + 0.5 * Math.cos(v * Math.round(ribs * 1.7) * Math.PI * 2);
    return rib * 0.62 + warp * 0.18 + weft * 0.2;
  },

  // Simple over-under. Poplin, taffeta, duck.
  plain(u, v, g) {
    const n = Math.round(g.ribs ?? 48);
    const warp = 0.5 + 0.5 * Math.cos(u * n * Math.PI * 2);
    const weft = 0.5 + 0.5 * Math.cos(v * n * Math.PI * 2);
    const cross = Math.abs(warp - weft);
    return 0.35 + 0.4 * cross + 0.25 * Math.max(warp, weft);
  },

  // Grouped yarns give oxford its basketweave.
  oxford(u, v, g) {
    const n = Math.round(g.ribs ?? 30);
    const gu = Math.floor(u * n * 2) % 2;
    const gv = Math.floor(v * n) % 2;
    const warp = 0.5 + 0.5 * Math.cos(u * n * Math.PI * 2);
    const weft = 0.5 + 0.5 * Math.cos(v * n * Math.PI * 2);
    return gu === gv ? 0.3 + 0.6 * warp : 0.3 + 0.6 * weft;
  },

  // Interlocking V loops. All jersey knits.
  jersey(u, v, g) {
    const w = Math.round(g.wales ?? 40), c = Math.round(g.courses ?? 48);
    const col = u * w, row = v * c;
    const fx = col - Math.floor(col);
    const fy = row - Math.floor(row);
    // Two legs of the loop meeting at the bottom of the V.
    const legs = Math.min(Math.abs(fx - fy), Math.abs(fx - (1 - fy)));
    const loop = 1 - Math.min(1, legs * 3.4);
    const shade = 0.32 + 0.55 * loop;
    return shade + 0.13 * (0.5 + 0.5 * Math.cos(row * Math.PI * 2));
  },

  // Deep vertical ridges with a rounded crown.
  rib(u, v, g) {
    const w = Math.round(g.wales ?? 22);
    const t = u * w;
    const f = t - Math.floor(t);
    const ridge = Math.sin(f * Math.PI) ** 1.6;
    const course = 0.5 + 0.5 * Math.cos(v * Math.round(w * 1.6) * Math.PI * 2);
    return 0.18 + 0.68 * ridge + 0.14 * course * ridge;
  },

  // Recessed square cells.
  waffle(u, v, g) {
    const n = Math.round(g.cells ?? 16);
    const fx = (u * n) % 1, fy = (v * n) % 1;
    const wall = Math.max(edgeFalloff(fx), edgeFalloff(fy));
    return 0.22 + 0.72 * wall;
  },

  // Small raised diamonds.
  pique(u, v, g) {
    const n = Math.round(g.cells ?? 30);
    const fx = (u * n) % 1, fy = (v * n) % 1;
    const d = Math.abs(fx - 0.5) + Math.abs(fy - 0.5);
    return 0.3 + 0.6 * (1 - Math.min(1, d * 1.9));
  },

  // Looped back. Flat face, dense small loops.
  terry(u, v, g) {
    const n = Math.round(g.courses ?? 34);
    const loops = fbm(u, v, n, 2, 11);
    const rows = 0.5 + 0.5 * Math.cos(v * n * Math.PI * 2);
    return 0.32 + 0.44 * loops + 0.24 * rows;
  },

  // Matted pile — no weave visible, only clumped fibre.
  fleece(u, v) {
    const coarse = fbm(u, v, 12, 3, 23);
    const fine = fbm(u, v, 48, 3, 37);
    return 0.3 + 0.45 * coarse + 0.25 * fine;
  },

  // Curled pile. Sherpa and faux shearling.
  sherpa(u, v, g) {
    const curl = g.curl ?? 1;
    // Warping the sample point before summing produces loops rather than lumps.
    const wx = u + 0.06 * curl * Math.sin(v * 34);
    const wy = v + 0.06 * curl * Math.cos(u * 30);
    return 0.24 + 0.5 * fbm(wx, wy, 16, 3, 5) + 0.26 * fbm(wx, wy, 60, 2, 61);
  },

  // Vertical wales with a nap between them.
  corduroy(u, v, g) {
    const w = Math.round(g.wales ?? 8);
    const t = u * w;
    const f = t - Math.floor(t);
    const wale = Math.sin(Math.min(1, f / 0.86) * Math.PI) ** 0.75;
    const nap = fbm(u, v, 60, 2, 91);
    return 0.12 + 0.72 * wale + 0.16 * nap * wale;
  },

  // Cellular grain: distance to the nearest of a scattered set of pore points.
  leather(u, v, g) {
    const n = Math.round(g.cells ?? 20);
    let best = 1, second = 1;
    const cx = Math.floor(u * n), cy = Math.floor(v * n);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gy = cy + dy;
        const wx = ((gx % n) + n) % n, wy = ((gy % n) + n) % n;
        const px = (gx + hash2(wx, wy, 3)) / n;
        const py = (gy + hash2(wx, wy, 17)) / n;
        const d = Math.hypot(u - px, v - py) * n;
        if (d < best) { second = best; best = d; } else if (d < second) second = d;
      }
    }
    const ridge = Math.min(1, (second - best) * 1.4);
    return 0.42 + 0.4 * ridge + 0.18 * fbm(u, v, 70, 2, 13);
  },

  // Felted wool: no thread structure, only fibre.
  melton(u, v) {
    return 0.36 + 0.4 * fbm(u, v, 26, 3, 43) + 0.24 * fbm(u, v, 90, 2, 77);
  },

  // Long floats: almost flat, faint directional filaments.
  satin(u, v, g) {
    const n = Math.round(g.ribs ?? 90);
    const float = 0.5 + 0.5 * Math.cos((u * 0.3 + v) * n * Math.PI * 2);
    return 0.44 + 0.12 * float + 0.06 * fbm(u, v, 120, 2, 29);
  },

  // Plain weave plus a heavier reinforcement grid.
  ripstop(u, v, g) {
    const base = WEAVES.plain(u, v, g);
    const every = g.gridEvery ?? 8;
    const n = Math.round((g.ribs ?? 60) / every);
    const gx = Math.abs(((u * n) % 1) - 0.5), gy = Math.abs(((v * n) % 1) - 0.5);
    const grid = (gx > 0.44 ? 1 : 0) + (gy > 0.44 ? 1 : 0);
    return Math.min(1, base * 0.78 + grid * 0.22);
  },

  // Coarse plain weave with visible slubs.
  canvas(u, v, g) {
    return Math.min(1, WEAVES.plain(u, v, g) * 0.82 + 0.24 * fbm(u, v, 34, 2, 101));
  },

  // Twill under a heavy nap that half-hides it.
  flannel(u, v, g) {
    return WEAVES.twill(u, v, g) * 0.45 + 0.55 * fbm(u, v, 30, 3, 53);
  },

  // Open apertures.
  mesh(u, v, g) {
    const n = Math.round(g.cells ?? 40);
    const fx = Math.abs(((u * n) % 1) - 0.5), fy = Math.abs(((v * n) % 1) - 0.5);
    const thread = Math.max(fx, fy);
    return thread > 0.36 ? 0.85 : 0.12;
  },

  // Big lofted panels between stitch channels.
  quilt(u, v, g) {
    const n = Math.max(2, Math.round((TILE / (g.cell ?? 46)) / 4));
    const a = (u + v) * n, b = (u - v) * n;
    const fa = Math.abs(((a % 1) + 1) % 1 - 0.5) * 2;
    const fb = Math.abs(((b % 1) + 1) % 1 - 0.5) * 2;
    const channel = Math.min(fa, fb);
    const loft = Math.sin(Math.min(1, channel * 1.15) * Math.PI * 0.5) ** 0.7;
    return 0.1 + 0.8 * loft + 0.1 * fbm(u, v, 40, 2, 67);
  },

  // Fine warp knit — the flattest cloth in the library.
  tricot(u, v, g) {
    const w = Math.round(g.wales ?? 60);
    const wale = 0.5 + 0.5 * Math.cos(u * w * Math.PI * 2);
    return 0.42 + 0.18 * wale + 0.08 * fbm(u, v, 100, 2, 83);
  },

  // Alternating slack and tight stripes, so the cloth puckers.
  seersucker(u, v, g) {
    const stripe = Math.round(g.stripe ?? 14);
    const band = Math.floor(u * stripe) % 2;
    const base = WEAVES.plain(u, v, g);
    if (!band) return base * 0.6 + 0.2;
    const pucker = 0.5 + 0.5 * Math.sin(v * 26 * Math.PI * 2 + u * 40);
    return 0.28 + 0.5 * pucker + 0.22 * base;
  },

  // Irregular yarns with pronounced slubs.
  linen(u, v, g) {
    const base = WEAVES.plain(u, v, g);
    const slub = (g.slub ?? 0.8) * fbm(u * 0.25, v * 3, 24, 2, 137);
    return Math.min(1, base * 0.72 + slub * 0.4);
  },
};

function edgeFalloff(f) {
  const d = Math.min(f, 1 - f);
  return Math.min(1, d * 6);
}

// ── Derived maps ──────────────────────────────────────────────────────────

function buildHeight(material) {
  const weave = WEAVES[material.weave] || WEAVES.plain;
  const g = material.grain || {};
  const scale = material.scale || 1;
  const h = new Float32Array(TILE * TILE);
  const fuzz = g.fuzz ?? 0.2;

  for (let y = 0; y < TILE; y++) {
    const v = y / TILE;
    for (let x = 0; x < TILE; x++) {
      const u = x / TILE;
      // `scale` stretches the pattern; sampling on a wrapped lattice keeps it
      // tileable at any scale because every generator is periodic in u and v.
      let value = weave(u / scale % 1, v / scale % 1, g);
      if (fuzz > 0) {
        value = value * (1 - fuzz * 0.5) + fuzz * 0.5 * fbm(u, v, 96, 3, 151);
      }
      h[y * TILE + x] = Math.min(1, Math.max(0, value));
    }
  }
  return h;
}

function canvasOf(size = TILE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Grayscale shading tile. Mid-grey is neutral; the compositor multiplies it. */
function luminanceTile(h, depth) {
  const c = canvasOf();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  const contrast = 0.28 + depth * 0.42;
  for (let i = 0; i < h.length; i++) {
    // Centre on 1.0 so the tint survives untouched where the cloth is flat.
    const l = 1 + (h[i] - 0.5) * contrast * 2;
    const v = Math.round(Math.min(255, Math.max(0, l * 128)));
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Tangent-space normal map from the height field, by central difference. */
function normalTile(h, strength) {
  const c = canvasOf();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  const s = strength * 6;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = y * TILE + x;
      const l = h[y * TILE + ((x - 1 + TILE) % TILE)];
      const r = h[y * TILE + ((x + 1) % TILE)];
      const u = h[((y - 1 + TILE) % TILE) * TILE + x];
      const d = h[((y + 1) % TILE) * TILE + x];
      const nx = (l - r) * s;
      const ny = (u - d) * s;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const o = i * 4;
      img.data[o] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      img.data[o + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      img.data[o + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Roughness: raised fibre scatters light, compressed weave reflects it. */
function roughnessTile(h, sheen, fuzz) {
  const c = canvasOf();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  for (let i = 0; i < h.length; i++) {
    const r = sheen + (h[i] - 0.5) * (0.1 + fuzz * 0.3);
    const v = Math.round(Math.min(255, Math.max(0, r * 255)));
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Tiles for a material, generated once and cached.
 *
 * @returns {{luminance: HTMLCanvasElement, normal: HTMLCanvasElement,
 *            roughness: HTMLCanvasElement, height: Float32Array, material: object}}
 */
export function materialTiles(material) {
  if (!material) return null;
  const hit = cache.get(material.id);
  if (hit) return hit;

  const height = buildHeight(material);
  const g = material.grain || {};
  const tiles = {
    material,
    height,
    luminance: luminanceTile(height, g.depth ?? 0.5),
    normal: normalTile(height, g.depth ?? 0.5),
    roughness: roughnessTile(height, material.sheen ?? 0.6, g.fuzz ?? 0.2),
  };
  cache.set(material.id, tiles);
  return tiles;
}

/**
 * How many times a material tile repeats across one metre of cloth. Driven by
 * yarn count so a 21 oz denim's twill is visibly coarser than a poplin's.
 */
export function tileRepeatPerMetre(material) {
  const g = material.grain || {};
  const threads = g.ribs || g.wales || g.courses || g.cells || 30;
  return Math.max(2.5, Math.min(22, threads / 3.2)) / (material.scale || 1);
}

/** Small swatch for the material picker, tinted to a colour. */
export function swatchDataUrl(material, color, size = 96) {
  const tiles = materialTiles(material);
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  const pattern = ctx.createPattern(tiles.luminance, 'repeat');
  const zoom = size / (TILE / 3.2);
  pattern.setTransform(new DOMMatrix([zoom, 0, 0, zoom, 0, 0]));
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, size, size);
  // Multiply alone darkens; a soft highlight puts the mid-tone back.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return c.toDataURL('image/png');
}

export const TILE_SIZE = TILE;
export { fbm as _fbm };
