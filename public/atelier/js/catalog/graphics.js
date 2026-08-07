// Built-in graphic library.
//
// Every graphic is drawn procedurally into a canvas rather than loaded as an
// image, for two reasons that matter downstream: it stays crisp at any print
// size on the spec sheet, and it is single-colour by construction, which is what
// a screen printer or an embroidery digitiser actually needs. Users can also
// upload their own artwork — see `uploadedGraphic` in state/design-state.js.
//
// Draw functions receive a context already translated to the graphic's top-left,
// a size `s` in pixels, and the resolved ink colour. Draw inside [0,s]×[0,s].

const TAU = Math.PI * 2;

/** Regular star polygon path. */
function starPath(ctx, cx, cy, points, outer, inner, rotation = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

/** Deterministic pseudo-random so a graphic looks identical on every render. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const GRAPHICS = [
  {
    id: 'star', name: 'Star', tags: ['shape', 'classic'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      starPath(ctx, s / 2, s / 2, 5, s * 0.48, s * 0.19);
      ctx.fill();
    },
  },
  {
    id: 'starburst', name: 'Starburst', tags: ['shape', 'retro'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      starPath(ctx, s / 2, s / 2, 12, s * 0.48, s * 0.3);
      ctx.fill();
    },
  },
  {
    id: 'flame', name: 'Flame', tags: ['icon', 'street'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.04);
      ctx.bezierCurveTo(s * 0.78, s * 0.3, s * 0.9, s * 0.5, s * 0.82, s * 0.68);
      ctx.bezierCurveTo(s * 0.74, s * 0.92, s * 0.28, s * 0.98, s * 0.2, s * 0.72);
      ctx.bezierCurveTo(s * 0.12, s * 0.5, s * 0.34, s * 0.42, s * 0.36, s * 0.24);
      ctx.bezierCurveTo(s * 0.46, s * 0.36, s * 0.42, s * 0.5, s * 0.5, s * 0.56);
      ctx.bezierCurveTo(s * 0.6, s * 0.42, s * 0.52, s * 0.22, s * 0.5, s * 0.04);
      ctx.fill();
    },
  },
  {
    id: 'lightning', name: 'Lightning', tags: ['icon', 'street'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      poly(ctx, [[s * 0.58, 0], [s * 0.2, s * 0.56], [s * 0.44, s * 0.56], [s * 0.34, s], [s * 0.8, s * 0.38], [s * 0.52, s * 0.38], [s * 0.72, 0]].map(([x, y]) => [x, y]));
      ctx.fill();
    },
  },
  {
    id: 'skull', name: 'Skull', tags: ['icon', 'punk'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.42, s * 0.34, s * 0.36, 0, 0, TAU);
      ctx.fill();
      ctx.fillRect(s * 0.32, s * 0.66, s * 0.36, s * 0.2);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(s * 0.37, s * 0.42, s * 0.1, s * 0.12, 0, 0, TAU);
      ctx.ellipse(s * 0.63, s * 0.42, s * 0.1, s * 0.12, 0, 0, TAU);
      ctx.fill();
      poly(ctx, [[s * 0.5, s * 0.5], [s * 0.44, s * 0.62], [s * 0.56, s * 0.62]]);
      ctx.fill();
      for (let i = 0; i < 3; i++) ctx.fillRect(s * (0.38 + i * 0.09), s * 0.7, s * 0.035, s * 0.14);
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'rose', name: 'Rose', tags: ['icon', 'tattoo'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      ctx.lineWidth = s * 0.05;
      ctx.lineCap = 'round';
      for (let i = 6; i >= 1; i--) {
        const r = (i / 6) * s * 0.4;
        ctx.beginPath();
        ctx.arc(s * 0.5, s * 0.42, r, i * 0.7, i * 0.7 + Math.PI * 1.55);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.78);
      ctx.lineTo(s * 0.5, s * 0.98);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(s * 0.36, s * 0.85, s * 0.13, s * 0.05, -0.5, 0, TAU);
      ctx.fill();
    },
  },
  {
    id: 'heart', name: 'Heart', tags: ['shape', 'classic'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.92);
      ctx.bezierCurveTo(s * -0.05, s * 0.52, s * 0.16, s * 0.04, s * 0.5, s * 0.3);
      ctx.bezierCurveTo(s * 0.84, s * 0.04, s * 1.05, s * 0.52, s * 0.5, s * 0.92);
      ctx.fill();
    },
  },
  {
    id: 'crown', name: 'Crown', tags: ['icon', 'street'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      poly(ctx, [[s * 0.08, s * 0.78], [s * 0.08, s * 0.26], [s * 0.29, s * 0.5], [s * 0.5, s * 0.18],
        [s * 0.71, s * 0.5], [s * 0.92, s * 0.26], [s * 0.92, s * 0.78]]);
      ctx.fill();
      ctx.fillRect(s * 0.08, s * 0.82, s * 0.84, s * 0.1);
    },
  },
  {
    id: 'wings', name: 'Wings', tags: ['icon', 'moto'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      for (const dir of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const y = s * (0.4 + i * 0.11);
          const len = s * (0.44 - i * 0.08);
          ctx.beginPath();
          ctx.ellipse(s * 0.5 + dir * (s * 0.06 + len / 2), y, len / 2, s * 0.045, dir * 0.12, 0, TAU);
          ctx.fill();
        }
      }
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.45, s * 0.07, s * 0.16, 0, 0, TAU);
      ctx.fill();
    },
  },
  {
    id: 'anchor', name: 'Anchor', tags: ['icon', 'classic'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c;
      ctx.lineWidth = s * 0.09;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.2); ctx.lineTo(s * 0.5, s * 0.86);
      ctx.moveTo(s * 0.26, s * 0.34); ctx.lineTo(s * 0.74, s * 0.34);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.62, s * 0.32, 0.35, Math.PI - 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.17, s * 0.1, 0, TAU);
      ctx.stroke();
    },
  },
  {
    id: 'arrow', name: 'Arrow', tags: ['shape'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      poly(ctx, [[s * 0.5, s * 0.06], [s * 0.94, s * 0.5], [s * 0.68, s * 0.5], [s * 0.68, s * 0.94],
        [s * 0.32, s * 0.94], [s * 0.32, s * 0.5], [s * 0.06, s * 0.5]]);
      ctx.fill();
    },
  },
  {
    id: 'cross', name: 'Cross', tags: ['shape'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      ctx.fillRect(s * 0.39, s * 0.04, s * 0.22, s * 0.92);
      ctx.fillRect(s * 0.1, s * 0.28, s * 0.8, s * 0.22);
    },
  },
  {
    id: 'diamond', name: 'Diamond', tags: ['shape'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      poly(ctx, [[s * 0.5, s * 0.04], [s * 0.96, s * 0.5], [s * 0.5, s * 0.96], [s * 0.04, s * 0.5]]);
      ctx.fill();
    },
  },
  {
    id: 'shield', name: 'Shield', tags: ['shape', 'heraldic'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.02);
      ctx.lineTo(s * 0.94, s * 0.18);
      ctx.quadraticCurveTo(s * 0.94, s * 0.72, s * 0.5, s * 0.98);
      ctx.quadraticCurveTo(s * 0.06, s * 0.72, s * 0.06, s * 0.18);
      ctx.fill();
    },
  },
  {
    id: 'laurel', name: 'Laurel', tags: ['icon', 'heraldic'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      for (const dir of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + dir * (0.5 + i * 0.28);
          const cx = s * 0.5 + Math.cos(a) * s * 0.36;
          const cy = s * 0.55 + Math.sin(a) * s * 0.36;
          ctx.beginPath();
          ctx.ellipse(cx, cy, s * 0.11, s * 0.045, a + Math.PI / 2, 0, TAU);
          ctx.fill();
        }
      }
    },
  },
  {
    id: 'sun', name: 'Sun', tags: ['icon', 'nature'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * 0.24, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.save();
        ctx.translate(s * 0.5, s * 0.5);
        ctx.rotate(a);
        poly(ctx, [[-s * 0.035, -s * 0.3], [s * 0.035, -s * 0.3], [0, -s * 0.48]]);
        ctx.fill();
        ctx.restore();
      }
    },
  },
  {
    id: 'moon', name: 'Crescent Moon', tags: ['icon', 'nature'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * 0.46, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(s * 0.68, s * 0.4, s * 0.42, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'mountain', name: 'Mountain', tags: ['icon', 'nature'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      poly(ctx, [[s * 0.02, s * 0.86], [s * 0.34, s * 0.24], [s * 0.5, s * 0.5], [s * 0.64, s * 0.32],
        [s * 0.98, s * 0.86]]);
      ctx.fill();
    },
  },
  {
    id: 'wave', name: 'Wave', tags: ['icon', 'nature'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c;
      ctx.lineWidth = s * 0.08;
      ctx.lineCap = 'round';
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const x = (i / 40) * s;
          const y = s * (0.3 + r * 0.2) + Math.sin((i / 40) * TAU * 1.6) * s * 0.09;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
  },
  {
    id: 'eye', name: 'Eye', tags: ['icon', 'tattoo'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(s * 0.04, s * 0.5);
      ctx.quadraticCurveTo(s * 0.5, s * 0.1, s * 0.96, s * 0.5);
      ctx.quadraticCurveTo(s * 0.5, s * 0.9, s * 0.04, s * 0.5);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.17, 0, TAU); ctx.fill();
    },
  },
  {
    id: 'spade', name: 'Spade', tags: ['icon', 'cards'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.08);
      ctx.bezierCurveTo(s * 0.98, s * 0.44, s * 0.86, s * 0.76, s * 0.6, s * 0.7);
      ctx.bezierCurveTo(s * 0.55, s * 0.68, s * 0.53, s * 0.74, s * 0.62, s * 0.92);
      ctx.lineTo(s * 0.38, s * 0.92);
      ctx.bezierCurveTo(s * 0.47, s * 0.74, s * 0.45, s * 0.68, s * 0.4, s * 0.7);
      ctx.bezierCurveTo(s * 0.14, s * 0.76, s * 0.02, s * 0.44, s * 0.5, s * 0.08);
      ctx.fill();
    },
  },
  {
    id: 'dice', name: 'Dice', tags: ['icon', 'cards'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = s * 0.06;
      const r = s * 0.12;
      ctx.beginPath();
      ctx.roundRect(s * 0.12, s * 0.12, s * 0.76, s * 0.76, r);
      ctx.stroke();
      for (const [px, py] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7], [0.7, 0.3], [0.3, 0.7]]) {
        ctx.beginPath(); ctx.arc(s * px, s * py, s * 0.065, 0, TAU); ctx.fill();
      }
    },
  },
  {
    id: 'barbed', name: 'Barbed Wire', tags: ['pattern', 'punk'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c; ctx.lineWidth = s * 0.03; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const x = (i / 60) * s;
        const y = s * 0.5 + Math.sin((i / 60) * TAU * 3) * s * 0.06;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const x = s * (0.1 + i * 0.2);
        ctx.beginPath();
        ctx.moveTo(x - s * 0.07, s * 0.4); ctx.lineTo(x + s * 0.07, s * 0.6);
        ctx.moveTo(x + s * 0.07, s * 0.4); ctx.lineTo(x - s * 0.07, s * 0.6);
        ctx.stroke();
      }
    },
  },
  {
    id: 'chain', name: 'Chain', tags: ['pattern', 'street'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c; ctx.lineWidth = s * 0.055;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(s * (0.16 + i * 0.23), s * 0.5, s * 0.12, s * 0.2, i % 2 ? Math.PI / 2 : 0, 0, TAU);
        ctx.stroke();
      }
    },
  },
  {
    id: 'checker', name: 'Checkerboard', tags: ['pattern', 'geometric'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      const n = 8, cell = s / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    },
  },
  {
    id: 'camo', name: 'Camo Blobs', tags: ['pattern', 'utility'],
    draw(ctx, s, c) {
      const rand = rng(7);
      ctx.fillStyle = c;
      for (let i = 0; i < 14; i++) {
        const cx = rand() * s, cy = rand() * s, r = s * (0.08 + rand() * 0.12);
        ctx.beginPath();
        for (let a = 0; a <= 12; a++) {
          const ang = (a / 12) * TAU;
          const rr = r * (0.65 + rand() * 0.6);
          const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
          a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      }
    },
  },
  {
    id: 'tiger', name: 'Tiger Stripe', tags: ['pattern', 'utility'],
    draw(ctx, s, c) {
      const rand = rng(19);
      ctx.fillStyle = c;
      for (let i = 0; i < 9; i++) {
        const y = (i / 9) * s + rand() * s * 0.05;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(s * 0.3, y - s * 0.05, s * 0.6, y + s * 0.06, s, y - s * 0.02);
        ctx.lineTo(s, y + s * (0.02 + rand() * 0.04));
        ctx.bezierCurveTo(s * 0.6, y + s * 0.1, s * 0.3, y + s * 0.01, 0, y + s * 0.05);
        ctx.fill();
      }
    },
  },
  {
    id: 'stripes', name: 'Stripes', tags: ['pattern', 'geometric'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      for (let i = 0; i < 6; i++) ctx.fillRect(0, (i / 6) * s, s, s / 12);
    },
  },
  {
    id: 'halftone', name: 'Halftone', tags: ['pattern', 'print'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      const n = 12, cell = s / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const t = 1 - y / n;
        ctx.beginPath();
        ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.48 * t, 0, TAU);
        ctx.fill();
      }
    },
  },
  {
    id: 'grid', name: 'Grid', tags: ['pattern', 'geometric'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c; ctx.lineWidth = s * 0.014;
      for (let i = 0; i <= 8; i++) {
        const p = (i / 8) * s;
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
      }
    },
  },
  {
    id: 'splatter', name: 'Splatter', tags: ['pattern', 'print'],
    draw(ctx, s, c) {
      const rand = rng(53);
      ctx.fillStyle = c;
      for (let i = 0; i < 90; i++) {
        const r = s * (0.005 + rand() ** 3 * 0.07);
        ctx.beginPath();
        ctx.arc(rand() * s, rand() * s, r, 0, TAU);
        ctx.fill();
      }
    },
  },
  {
    id: 'badge', name: 'Circle Badge', tags: ['frame', 'heraldic'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.46, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.38, 0, TAU); ctx.stroke();
      ctx.fillStyle = c;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        ctx.beginPath();
        ctx.arc(s * 0.5 + Math.cos(a) * s * 0.42, s * 0.5 + Math.sin(a) * s * 0.42, s * 0.016, 0, TAU);
        ctx.fill();
      }
    },
  },
  {
    id: 'target', name: 'Bullseye', tags: ['shape', 'geometric'],
    draw(ctx, s, c) {
      ctx.fillStyle = c;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(s * 0.5, s * 0.5, s * (0.48 - i * 0.12), 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = ctx.globalCompositeOperation === 'source-over' ? 'destination-out' : 'source-over';
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'smiley', name: 'Smiley', tags: ['icon', 'retro'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = s * 0.07;
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.44, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s * 0.35, s * 0.4, s * 0.05, s * 0.08, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.65, s * 0.4, s * 0.05, s * 0.08, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.52, s * 0.26, 0.35, Math.PI - 0.35); ctx.stroke();
    },
  },
  {
    id: 'cassette', name: 'Cassette', tags: ['icon', 'retro'],
    draw(ctx, s, c) {
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = s * 0.045;
      ctx.strokeRect(s * 0.08, s * 0.24, s * 0.84, s * 0.52);
      ctx.strokeRect(s * 0.2, s * 0.34, s * 0.6, s * 0.22);
      ctx.beginPath(); ctx.arc(s * 0.34, s * 0.45, s * 0.06, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.66, s * 0.45, s * 0.06, 0, TAU); ctx.fill();
      ctx.fillRect(s * 0.28, s * 0.66, s * 0.44, s * 0.04);
    },
  },
  {
    id: 'paisley', name: 'Paisley', tags: ['pattern', 'bandana'],
    draw(ctx, s, c) {
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = s * 0.02;
      ctx.beginPath();
      ctx.moveTo(s * 0.34, s * 0.86);
      ctx.bezierCurveTo(s * 0.02, s * 0.6, s * 0.2, s * 0.08, s * 0.56, s * 0.16);
      ctx.bezierCurveTo(s * 0.9, s * 0.24, s * 0.86, s * 0.74, s * 0.34, s * 0.86);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(s * 0.46, s * 0.46, s * 0.16, s * 0.22, 0.4, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.arc(s * 0.46 + Math.cos(a) * s * 0.28, s * 0.46 + Math.sin(a) * s * 0.32, s * 0.022, 0, TAU);
        ctx.fill();
      }
    },
  },
];

const BY_ID = new Map(GRAPHICS.map((g) => [g.id, g]));

export function getGraphic(id) {
  return BY_ID.get(id) || null;
}

export function graphicTags() {
  const tags = new Set();
  for (const g of GRAPHICS) g.tags.forEach((t) => tags.add(t));
  return [...tags].sort();
}

/**
 * Render a library graphic to an offscreen canvas at `size` px in `color`.
 * Callers composite the result — the compositor for the 3D texture, the spec
 * sheet for the printed diagram.
 */
export function renderGraphic(id, size, color) {
  const g = getGraphic(id);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.max(2, Math.round(size));
  if (!g) return canvas;
  const ctx = canvas.getContext('2d');
  ctx.save();
  g.draw(ctx, canvas.width, color);
  ctx.restore();
  return canvas;
}
