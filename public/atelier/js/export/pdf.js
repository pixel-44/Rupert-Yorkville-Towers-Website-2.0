// Minimal PDF writer.
//
// Hand-rolled rather than pulled from a library, for one reason that matters to
// this product: the spec sheet must contain real vector line-work (the flat
// pattern diagrams a tailor measures off) alongside raster mockups, and it must
// keep working offline with nothing to install. That needs perhaps four hundred
// lines of PDF, and buys a document with selectable text, crisp diagrams at any
// zoom, and no dependency.
//
// Scope is deliberately narrow: the fourteen standard fonts (no embedding),
// vector paths, and JPEG images passed straight through as DCTDecode streams.
//
// Coordinates are exposed top-left origin in points, because every other
// drawing surface in this app works that way; the flip to PDF's bottom-left
// origin happens on the way out.

const A4 = { width: 595.28, height: 841.89 };

// Advance widths per 1000 em for ASCII 32–126. Needed for wrapping, centring
// and right alignment — without them every column would have to be guessed.
const WIDTHS = {
  Helvetica: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ],
  'Helvetica-Bold': [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  ],
};

/** Characters outside Latin-1 that WinAnsiEncoding still carries. */
const WINANSI = {
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '–': 0x96, '—': 0x97, '•': 0x95, '…': 0x85,
  '™': 0x99, '€': 0x80, 'Š': 0x8a, 'Ž': 0x8e,
};

export class PDFDoc {
  constructor({ width = A4.width, height = A4.height, margin = 42 } = {}) {
    this.pageWidth = width;
    this.pageHeight = height;
    this.margin = margin;
    this.pages = [];
    this.images = [];
    this.current = null;
    this.addPage();
  }

  addPage() {
    this.current = { ops: [], images: [] };
    this.pages.push(this.current);
    this.y = this.margin;
    return this.current;
  }

  get contentWidth() {
    return this.pageWidth - this.margin * 2;
  }

  /** Room left before the bottom margin. */
  get remaining() {
    return this.pageHeight - this.margin - this.y;
  }

  ensure(space) {
    if (this.remaining < space) {
      this.addPage();
      return true;
    }
    return false;
  }

  // ── Primitives ──────────────────────────────────────────────────────────

  /** Width of a string at a given size, in points. */
  measure(text, size, font = 'Helvetica') {
    const table = WIDTHS[font] || WIDTHS.Helvetica;
    let total = 0;
    for (const ch of String(text)) {
      const code = ch.charCodeAt(0);
      total += code >= 32 && code <= 126 ? table[code - 32] : 556;
    }
    return (total / 1000) * size;
  }

  text(content, x, y, opts = {}) {
    const {
      size = 9, font = 'Helvetica', color = '#000000',
      align = 'left', width = null, leading = size * 1.35,
    } = opts;
    const lines = width ? this.wrap(String(content), size, font, width) : [String(content)];
    let cursor = y;
    for (const line of lines) {
      let tx = x;
      if (align === 'center') tx = x - this.measure(line, size, font) / 2;
      else if (align === 'right') tx = x - this.measure(line, size, font);
      this.current.ops.push(
        'BT',
        `/${fontKey(font)} ${fmt(size)} Tf`,
        `${rgb(color)} rg`,
        `1 0 0 1 ${fmt(tx)} ${fmt(this.flip(cursor + size * 0.78))} Tm`,
        `(${escapeText(line)}) Tj`,
        'ET'
      );
      cursor += leading;
    }
    return cursor - y;
  }

  wrap(text, size, font, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.measure(candidate, size, font) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  /** Height a wrapped block will occupy, without drawing it. */
  textHeight(content, size, font, width, leading = size * 1.35) {
    return this.wrap(String(content), size, font, width).length * leading;
  }

  line(x1, y1, x2, y2, opts = {}) {
    const { color = '#000000', width = 0.6, dash = null } = opts;
    this.current.ops.push(
      'q',
      `${rgb(color)} RG`,
      `${fmt(width)} w`,
      dash ? `[${dash.map(fmt).join(' ')}] 0 d` : '[] 0 d',
      `${fmt(x1)} ${fmt(this.flip(y1))} m ${fmt(x2)} ${fmt(this.flip(y2))} l S`,
      'Q'
    );
  }

  rect(x, y, w, h, opts = {}) {
    const { fill = null, stroke = null, width = 0.6, dash = null, radius = 0 } = opts;
    const ops = ['q'];
    if (fill) ops.push(`${rgb(fill)} rg`);
    if (stroke) ops.push(`${rgb(stroke)} RG`, `${fmt(width)} w`);
    ops.push(dash ? `[${dash.map(fmt).join(' ')}] 0 d` : '[] 0 d');

    if (radius > 0) {
      const r = Math.min(radius, w / 2, h / 2);
      const top = this.flip(y);
      const bottom = this.flip(y + h);
      const k = r * 0.5523;
      ops.push(
        `${fmt(x + r)} ${fmt(top)} m`,
        `${fmt(x + w - r)} ${fmt(top)} l`,
        `${fmt(x + w - r + k)} ${fmt(top)} ${fmt(x + w)} ${fmt(top - r + k)} ${fmt(x + w)} ${fmt(top - r)} c`,
        `${fmt(x + w)} ${fmt(bottom + r)} l`,
        `${fmt(x + w)} ${fmt(bottom + r - k)} ${fmt(x + w - r + k)} ${fmt(bottom)} ${fmt(x + w - r)} ${fmt(bottom)} c`,
        `${fmt(x + r)} ${fmt(bottom)} l`,
        `${fmt(x + r - k)} ${fmt(bottom)} ${fmt(x)} ${fmt(bottom + r - k)} ${fmt(x)} ${fmt(bottom + r)} c`,
        `${fmt(x)} ${fmt(top - r)} l`,
        `${fmt(x)} ${fmt(top - r + k)} ${fmt(x + r - k)} ${fmt(top)} ${fmt(x + r)} ${fmt(top)} c`,
        'h'
      );
    } else {
      ops.push(`${fmt(x)} ${fmt(this.flip(y + h))} ${fmt(w)} ${fmt(h)} re`);
    }

    ops.push(paintOp(fill, stroke), 'Q');
    this.current.ops.push(...ops);
  }

  /**
   * Draw a path from commands in top-left space.
   * Commands: ['M',x,y] ['L',x,y] ['Q',cx,cy,x,y] ['C',c1x,c1y,c2x,c2y,x,y] ['Z']
   */
  path(commands, opts = {}) {
    const { fill = null, stroke = '#000000', width = 0.7, dash = null } = opts;
    const ops = ['q'];
    if (fill) ops.push(`${rgb(fill)} rg`);
    if (stroke) ops.push(`${rgb(stroke)} RG`, `${fmt(width)} w`, '1 j', '1 J');
    ops.push(dash ? `[${dash.map(fmt).join(' ')}] 0 d` : '[] 0 d');

    let cx = 0, cy = 0;
    for (const cmd of commands) {
      const [kind] = cmd;
      if (kind === 'M') {
        [, cx, cy] = cmd;
        ops.push(`${fmt(cx)} ${fmt(this.flip(cy))} m`);
      } else if (kind === 'L') {
        [, cx, cy] = cmd;
        ops.push(`${fmt(cx)} ${fmt(this.flip(cy))} l`);
      } else if (kind === 'Q') {
        // PDF has no quadratic operator; raise the control point to a cubic.
        const [, qx, qy, x, y] = cmd;
        const c1x = cx + (2 / 3) * (qx - cx);
        const c1y = cy + (2 / 3) * (qy - cy);
        const c2x = x + (2 / 3) * (qx - x);
        const c2y = y + (2 / 3) * (qy - y);
        ops.push(`${fmt(c1x)} ${fmt(this.flip(c1y))} ${fmt(c2x)} ${fmt(this.flip(c2y))} ${fmt(x)} ${fmt(this.flip(y))} c`);
        cx = x; cy = y;
      } else if (kind === 'C') {
        const [, c1x, c1y, c2x, c2y, x, y] = cmd;
        ops.push(`${fmt(c1x)} ${fmt(this.flip(c1y))} ${fmt(c2x)} ${fmt(this.flip(c2y))} ${fmt(x)} ${fmt(this.flip(y))} c`);
        cx = x; cy = y;
      } else if (kind === 'Z') {
        ops.push('h');
      }
    }
    ops.push(paintOp(fill, stroke), 'Q');
    this.current.ops.push(...ops);
  }

  circle(cx, cy, r, opts = {}) {
    const k = r * 0.5523;
    this.path([
      ['M', cx, cy - r],
      ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
      ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
      ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
      ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
      ['Z'],
    ], opts);
  }

  /**
   * Place a JPEG. `dataUrl` must be a `data:image/jpeg;base64,` string — canvas
   * JPEG output passes straight through as a DCTDecode stream with no re-encode.
   */
  image(dataUrl, x, y, w, h, pixelW, pixelH) {
    const bytes = base64ToBytes(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const id = this.images.length + 1;
    this.images.push({ id, bytes, width: pixelW, height: pixelH });
    const name = `Im${id}`;
    this.current.images.push(name);
    this.current.ops.push(
      'q',
      `${fmt(w)} 0 0 ${fmt(h)} ${fmt(x)} ${fmt(this.flip(y + h))} cm`,
      `/${name} Do`,
      'Q'
    );
  }

  flip(y) {
    return this.pageHeight - y;
  }

  // ── Serialisation ───────────────────────────────────────────────────────

  build() {
    const objects = [];
    const push = (body) => {
      objects.push(body);
      return objects.length;   // 1-based object number
    };

    const catalogId = push(null);      // reserved, filled below
    const pagesId = push(null);

    const fontIds = {};
    for (const font of ['Helvetica', 'Helvetica-Bold', 'Times-Roman']) {
      fontIds[font] = push(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`
      );
    }

    const imageIds = {};
    for (const img of this.images) {
      const stream = [
        `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height}`,
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',
        ` /Length ${img.bytes.length} >>`,
      ].join('');
      imageIds[`Im${img.id}`] = push({ dict: stream, raw: img.bytes });
    }

    const pageIds = [];
    for (const page of this.pages) {
      const content = page.ops.join('\n');
      const contentId = push({
        dict: `<< /Length ${byteLength(content)} >>`,
        text: content,
      });
      const xobjects = [...new Set(page.images)]
        .map((name) => `/${name} ${imageIds[name]} 0 R`)
        .join(' ');
      const resources = [
        '<< /Font <<',
        Object.entries(fontIds).map(([f, id]) => `/${fontKey(f)} ${id} 0 R`).join(' '),
        '>>',
        xobjects ? ` /XObject << ${xobjects} >>` : '',
        ' >>',
      ].join('');
      pageIds.push(push(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${fmt(this.pageWidth)} ${fmt(this.pageHeight)}]`
        + ` /Resources ${resources} /Contents ${contentId} 0 R >>`
      ));
    }

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    // ── Assemble bytes, recording each object's offset for the xref table ──
    const chunks = [];
    let offset = 0;
    const write = (data) => {
      const bytes = typeof data === 'string' ? encodeLatin1(data) : data;
      chunks.push(bytes);
      offset += bytes.length;
    };

    write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const offsets = [];
    objects.forEach((body, i) => {
      offsets[i] = offset;
      write(`${i + 1} 0 obj\n`);
      if (typeof body === 'string') {
        write(`${body}\n`);
      } else if (body.raw) {
        write(`${body.dict}\nstream\n`);
        write(body.raw);
        write('\nendstream\n');
      } else {
        write(`${body.dict}\nstream\n${body.text}\nendstream\n`);
      }
      write('endobj\n');
    });

    const xrefStart = offset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
    write(xref);
    write(
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`
      + `startxref\n${xrefStart}\n%%EOF\n`
    );

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  blob() {
    return new Blob([this.build()], { type: 'application/pdf' });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function paintOp(fill, stroke) {
  if (fill && stroke) return 'B';
  if (fill) return 'f';
  return 'S';
}

const fontKey = (font) => ({
  Helvetica: 'F1', 'Helvetica-Bold': 'F2', 'Times-Roman': 'F3',
}[font] || 'F1');

function fmt(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isFinite(v) ? String(v) : '0';
}

function rgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => (v / 255).toFixed(3))
    .join(' ');
}

/** PDF literal strings escape their own delimiters and the escape character. */
function escapeText(s) {
  let out = '';
  for (const ch of String(s)) {
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else out += ch;
  }
  return out;
}

/** WinAnsi is Latin-1 plus a handful of typographic characters in 0x80–0x9F. */
function encodeLatin1(str) {
  const out = new Uint8Array(str.length * 2);
  let n = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < 256) out[n++] = code;
    else if (WINANSI[ch] != null) out[n++] = WINANSI[ch];
    else out[n++] = 0x3f;   // '?'
  }
  return out.slice(0, n);
}

function byteLength(str) {
  return encodeLatin1(str).length;
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export { A4 };
