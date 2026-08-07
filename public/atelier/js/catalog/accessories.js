// Accessory library for mix-and-match outfit mode.
//
// Accessories are compositional only: they are never customised here. Each one
// draws as a flat silhouette so an outfit reads as a styling board rather than
// pretending to be another 3D garment. `anchor` is the mannequin attachment
// point the piece snaps to when dropped, and `slot` enforces one-per-slot so a
// figure cannot end up wearing two pairs of shoes.

const TAU = Math.PI * 2;

/**
 * @typedef {object} Accessory
 * @property {string} id
 * @property {string} name
 * @property {string} category  bags | belts | hats | jewelry | footwear | eyewear | scarves
 * @property {string} slot      Mannequin slot; one item per slot.
 * @property {[number,number]} anchor  Normalised mannequin coordinates.
 * @property {number} size      Default draw size as a fraction of figure height.
 * @property {(ctx: CanvasRenderingContext2D, s: number, ink: string, accent: string) => void} draw
 */

/** @type {Accessory[]} */
export const ACCESSORIES = [
  // ── Hats ────────────────────────────────────────────────────────────────
  {
    id: 'cap-6panel', name: '6-Panel Cap', category: 'hats', slot: 'head', anchor: [0.5, 0.055], size: 0.1,
    draw(ctx, s, ink) {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.55, s * 0.36, Math.PI, TAU); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(s * 0.66, s * 0.56, s * 0.34, s * 0.09, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(s * 0.14, s * 0.52, s * 0.72, s * 0.05);
    },
  },
  {
    id: 'beanie', name: 'Ribbed Beanie', category: 'hats', slot: 'head', anchor: [0.5, 0.045], size: 0.095,
    draw(ctx, s, ink) {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.6, s * 0.34, Math.PI, TAU); ctx.fill();
      ctx.fillRect(s * 0.16, s * 0.58, s * 0.68, s * 0.16);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#000'; ctx.lineWidth = s * 0.012;
      for (let i = 1; i < 8; i++) {
        const x = s * (0.16 + (i / 8) * 0.68);
        ctx.beginPath(); ctx.moveTo(x, s * 0.58); ctx.lineTo(x, s * 0.74); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'bucket', name: 'Bucket Hat', category: 'hats', slot: 'head', anchor: [0.5, 0.05], size: 0.11,
    draw(ctx, s, ink) {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.56, s * 0.28, Math.PI, TAU); ctx.fill();
      ctx.fillRect(s * 0.22, s * 0.5, s * 0.56, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(s * 0.06, s * 0.6); ctx.lineTo(s * 0.94, s * 0.6);
      ctx.lineTo(s * 0.8, s * 0.72); ctx.lineTo(s * 0.2, s * 0.72);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'fedora', name: 'Wool Fedora', category: 'hats', slot: 'head', anchor: [0.5, 0.048], size: 0.115,
    draw(ctx, s, ink, accent) {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.62, s * 0.46, s * 0.08, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.26, s * 0.62);
      ctx.quadraticCurveTo(s * 0.3, s * 0.26, s * 0.5, s * 0.28);
      ctx.quadraticCurveTo(s * 0.7, s * 0.26, s * 0.74, s * 0.62);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(s * 0.27, s * 0.52, s * 0.46, s * 0.07);
    },
  },

  // ── Eyewear ─────────────────────────────────────────────────────────────
  {
    id: 'shades-rect', name: 'Rectangular Shades', category: 'eyewear', slot: 'face', anchor: [0.5, 0.078], size: 0.075,
    draw(ctx, s, ink) {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.roundRect(s * 0.04, s * 0.38, s * 0.4, s * 0.24, s * 0.05); ctx.fill();
      ctx.beginPath(); ctx.roundRect(s * 0.56, s * 0.38, s * 0.4, s * 0.24, s * 0.05); ctx.fill();
      ctx.fillRect(s * 0.44, s * 0.46, s * 0.12, s * 0.05);
    },
  },
  {
    id: 'shades-round', name: 'Round Shades', category: 'eyewear', slot: 'face', anchor: [0.5, 0.078], size: 0.075,
    draw(ctx, s, ink) {
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.arc(s * 0.26, s * 0.5, s * 0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.74, s * 0.5, s * 0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * 0.46, s * 0.48); ctx.lineTo(s * 0.54, s * 0.48); ctx.stroke();
    },
  },

  // ── Scarves ─────────────────────────────────────────────────────────────
  {
    id: 'scarf-knit', name: 'Knit Scarf', category: 'scarves', slot: 'neck', anchor: [0.5, 0.14], size: 0.16,
    draw(ctx, s, ink) {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.18, s * 0.3, s * 0.12, 0, 0, TAU); ctx.fill();
      ctx.fillRect(s * 0.34, s * 0.22, s * 0.14, s * 0.72);
      ctx.fillRect(s * 0.52, s * 0.22, s * 0.14, s * 0.6);
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(s * (0.35 + i * 0.023), s * 0.94, s * 0.012, s * 0.06);
        ctx.fillRect(s * (0.53 + i * 0.023), s * 0.82, s * 0.012, s * 0.06);
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'bandana', name: 'Bandana', category: 'scarves', slot: 'neck', anchor: [0.5, 0.135], size: 0.1,
    draw(ctx, s, ink, accent) {
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.14); ctx.lineTo(s * 0.92, s * 0.34);
      ctx.lineTo(s * 0.5, s * 0.9); ctx.lineTo(s * 0.08, s * 0.34);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = accent;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(s * (0.28 + (i % 3) * 0.22), s * (0.36 + Math.floor(i / 3) * 0.2), s * 0.035, 0, TAU);
        ctx.fill();
      }
    },
  },

  // ── Jewelry ─────────────────────────────────────────────────────────────
  {
    id: 'chain-cuban', name: 'Cuban Chain', category: 'jewelry', slot: 'chest', anchor: [0.5, 0.185], size: 0.11,
    draw(ctx, s, ink) {
      ctx.strokeStyle = ink; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.15);
      ctx.quadraticCurveTo(s * 0.5, s * 0.95, s * 0.8, s * 0.15);
      ctx.stroke();
    },
  },
  {
    id: 'pendant', name: 'Pendant Necklace', category: 'jewelry', slot: 'chest', anchor: [0.5, 0.19], size: 0.1,
    draw(ctx, s, ink) {
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = s * 0.028;
      ctx.beginPath();
      ctx.moveTo(s * 0.24, s * 0.12);
      ctx.quadraticCurveTo(s * 0.5, s * 0.78, s * 0.76, s * 0.12);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.7, s * 0.11, 0, TAU); ctx.fill();
    },
  },
  {
    id: 'hoops', name: 'Hoop Earrings', category: 'jewelry', slot: 'ears', anchor: [0.5, 0.09], size: 0.08,
    draw(ctx, s, ink) {
      ctx.strokeStyle = ink; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.arc(s * 0.16, s * 0.55, s * 0.16, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.84, s * 0.55, s * 0.16, 0, TAU); ctx.stroke();
    },
  },
  {
    id: 'watch', name: 'Wristwatch', category: 'jewelry', slot: 'wrist', anchor: [0.19, 0.5], size: 0.055,
    draw(ctx, s, ink, accent) {
      ctx.fillStyle = ink;
      ctx.fillRect(s * 0.36, s * 0.04, s * 0.28, s * 0.92);
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.2, 0, TAU); ctx.fill();
    },
  },
  {
    id: 'signet', name: 'Signet Ring', category: 'jewelry', slot: 'hand', anchor: [0.815, 0.55], size: 0.035,
    draw(ctx, s, ink) {
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = s * 0.14;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.58, s * 0.3, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.2, s * 0.26, s * 0.18, 0, 0, TAU); ctx.fill();
    },
  },

  // ── Belts ───────────────────────────────────────────────────────────────
  {
    id: 'belt-leather', name: 'Leather Belt', category: 'belts', slot: 'waist', anchor: [0.5, 0.475], size: 0.26,
    draw(ctx, s, ink, accent) {
      ctx.fillStyle = ink;
      ctx.fillRect(0, s * 0.42, s, s * 0.16);
      ctx.fillStyle = accent;
      ctx.strokeStyle = accent; ctx.lineWidth = s * 0.03;
      ctx.strokeRect(s * 0.42, s * 0.36, s * 0.16, s * 0.28);
      ctx.fillRect(s * 0.49, s * 0.36, s * 0.02, s * 0.28);
    },
  },
  {
    id: 'belt-web', name: 'Web Belt', category: 'belts', slot: 'waist', anchor: [0.5, 0.475], size: 0.26,
    draw(ctx, s, ink, accent) {
      ctx.fillStyle = ink;
      ctx.fillRect(0, s * 0.44, s, s * 0.12);
      ctx.fillStyle = accent;
      ctx.fillRect(s * 0.44, s * 0.38, s * 0.14, s * 0.24);
      ctx.fillRect(s * 0.58, s * 0.44, s * 0.16, s * 0.12);
    },
  },
  {
    id: 'belt-chain', name: 'Chain Belt', category: 'belts', slot: 'waist', anchor: [0.5, 0.48], size: 0.26,
    draw(ctx, s, ink) {
      ctx.strokeStyle = ink; ctx.lineWidth = s * 0.035;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.ellipse(s * (0.05 + i * 0.1), s * 0.5, s * 0.05, s * 0.075, i % 2 ? Math.PI / 2 : 0, 0, TAU);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(s * 0.72, s * 0.54);
      ctx.quadraticCurveTo(s * 0.78, s * 0.78, s * 0.72, s * 0.92);
      ctx.stroke();
    },
  },

  // ── Bags ────────────────────────────────────────────────────────────────
  {
    id: 'bag-tote', name: 'Canvas Tote', category: 'bags', slot: 'carry', anchor: [0.78, 0.52], size: 0.19,
    draw(ctx, s, ink) {
      ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = s * 0.04;
      ctx.fillRect(s * 0.14, s * 0.38, s * 0.72, s * 0.56);
      ctx.beginPath(); ctx.arc(s * 0.36, s * 0.38, s * 0.13, Math.PI, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.64, s * 0.38, s * 0.13, Math.PI, TAU); ctx.stroke();
    },
  },
  {
    id: 'bag-shoulder', name: 'Shoulder Bag', category: 'bags', slot: 'carry', anchor: [0.76, 0.55], size: 0.17,
    draw(ctx, s, ink, accent) {
      ctx.strokeStyle = ink; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.02); ctx.lineTo(s * 0.5, s * 0.5); ctx.stroke();
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.roundRect(s * 0.2, s * 0.48, s * 0.66, s * 0.44, s * 0.06); ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(s * 0.2, s * 0.48, s * 0.66, s * 0.14);
    },
  },
  {
    id: 'bag-backpack', name: 'Backpack', category: 'bags', slot: 'carry', anchor: [0.24, 0.42], size: 0.21,
    draw(ctx, s, ink, accent) {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.roundRect(s * 0.14, s * 0.14, s * 0.72, s * 0.78, s * 0.14); ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.roundRect(s * 0.26, s * 0.52, s * 0.48, s * 0.26, s * 0.05); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.14, s * 0.12, Math.PI, TAU); ctx.stroke();
    },
  },
  {
    id: 'bag-duffel', name: 'Duffel', category: 'bags', slot: 'carry', anchor: [0.79, 0.6], size: 0.2,
    draw(ctx, s, ink, accent) {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.roundRect(s * 0.04, s * 0.4, s * 0.92, s * 0.42, s * 0.2); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = s * 0.045;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.4, s * 0.18, Math.PI, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.08, s * 0.5); ctx.lineTo(s * 0.92, s * 0.5); ctx.stroke();
    },
  },

  // ── Footwear ────────────────────────────────────────────────────────────
  {
    id: 'shoe-sneaker', name: 'Low Sneaker', category: 'footwear', slot: 'feet', anchor: [0.5, 0.955], size: 0.13,
    draw(ctx, s, ink, accent) {
      for (const dx of [-0.26, 0.26]) {
        ctx.save();
        ctx.translate(s * dx, 0);
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.moveTo(s * 0.28, s * 0.4);
        ctx.quadraticCurveTo(s * 0.34, s * 0.66, s * 0.68, s * 0.7);
        ctx.lineTo(s * 0.68, s * 0.82); ctx.lineTo(s * 0.26, s * 0.82);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.roundRect(s * 0.24, s * 0.8, s * 0.46, s * 0.12, s * 0.05); ctx.fill();
        ctx.restore();
      }
    },
  },
  {
    id: 'shoe-boot', name: 'Work Boot', category: 'footwear', slot: 'feet', anchor: [0.5, 0.94], size: 0.15,
    draw(ctx, s, ink, accent) {
      for (const dx of [-0.24, 0.24]) {
        ctx.save();
        ctx.translate(s * dx, 0);
        ctx.fillStyle = ink;
        ctx.fillRect(s * 0.3, s * 0.24, s * 0.26, s * 0.44);
        ctx.beginPath();
        ctx.moveTo(s * 0.3, s * 0.6);
        ctx.quadraticCurveTo(s * 0.36, s * 0.76, s * 0.7, s * 0.78);
        ctx.lineTo(s * 0.7, s * 0.86); ctx.lineTo(s * 0.28, s * 0.86);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = accent;
        ctx.fillRect(s * 0.26, s * 0.84, s * 0.46, s * 0.1);
        ctx.restore();
      }
    },
  },
  {
    id: 'shoe-loafer', name: 'Loafer', category: 'footwear', slot: 'feet', anchor: [0.5, 0.96], size: 0.12,
    draw(ctx, s, ink, accent) {
      for (const dx of [-0.26, 0.26]) {
        ctx.save();
        ctx.translate(s * dx, 0);
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.moveTo(s * 0.3, s * 0.52);
        ctx.quadraticCurveTo(s * 0.34, s * 0.74, s * 0.7, s * 0.76);
        ctx.lineTo(s * 0.7, s * 0.84); ctx.lineTo(s * 0.28, s * 0.84);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = accent;
        ctx.fillRect(s * 0.38, s * 0.56, s * 0.16, s * 0.04);
        ctx.restore();
      }
    },
  },
  {
    id: 'shoe-runner', name: 'Chunky Runner', category: 'footwear', slot: 'feet', anchor: [0.5, 0.95], size: 0.14,
    draw(ctx, s, ink, accent) {
      for (const dx of [-0.26, 0.26]) {
        ctx.save();
        ctx.translate(s * dx, 0);
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.moveTo(s * 0.26, s * 0.42);
        ctx.quadraticCurveTo(s * 0.32, s * 0.62, s * 0.72, s * 0.66);
        ctx.lineTo(s * 0.72, s * 0.76); ctx.lineTo(s * 0.24, s * 0.76);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.roundRect(s * 0.2, s * 0.72, s * 0.56, s * 0.18, s * 0.08); ctx.fill();
        ctx.restore();
      }
    },
  },
];

const BY_ID = new Map(ACCESSORIES.map((a) => [a.id, a]));

export function getAccessory(id) {
  return BY_ID.get(id) || null;
}

export function accessoryCategories() {
  const order = ['hats', 'eyewear', 'scarves', 'jewelry', 'belts', 'bags', 'footwear'];
  return order
    .map((id) => ({ id, name: cap(id), items: ACCESSORIES.filter((a) => a.category === id) }))
    .filter((g) => g.items.length);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
