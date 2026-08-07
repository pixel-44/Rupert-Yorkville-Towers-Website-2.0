// Small DOM helpers. No framework — the interface is mostly static chrome with
// a few panels that rebuild, and a build step would cost more than it saves.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(4)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

/** Trailing-edge debounce; used to keep typing from re-rendering per keystroke. */
export function debounce(fn, ms = 120) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

let toastHost;
export function toast(message, kind = '') {
  toastHost = toastHost || document.getElementById('toasts');
  if (!toastHost) return;
  const el = h('div', { class: `toast ${kind}` }, message);
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms, transform 200ms';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  }, kind === 'warn' ? 4200 : 2600);
}

/** Labelled slider that reports live and coalesces history while dragging. */
export function slider({ label, min, max, step, value, format, onInput, onCommit }) {
  const val = h('span', { class: 'val' }, format ? format(value) : String(value));
  const input = h('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => {
      const v = Number(e.target.value);
      val.textContent = format ? format(v) : String(v);
      onInput?.(v);
    },
    onchange: (e) => onCommit?.(Number(e.target.value)),
  });
  return h('div', { class: 'field' },
    h('label', {}, h('span', {}, label), val),
    input);
}

export function select({ label, options, value, onChange }) {
  const sel = h('select', {
    class: 'select',
    onchange: (e) => onChange(e.target.value),
  }, options.map((o) => h('option', {
    value: o.value, selected: o.value === value,
  }, o.label)));
  return h('div', { class: 'field' },
    label && h('label', {}, h('span', {}, label)),
    h('div', { class: 'select-wrap' }, sel));
}

export function chips({ label, options, value, onChange, multi = false }) {
  return h('div', { class: 'field' },
    label && h('label', {}, h('span', {}, label)),
    h('div', { class: 'chips' }, options.map((o) => h('button', {
      class: `chip${(multi ? value.includes(o.value) : value === o.value) ? ' is-active' : ''}`,
      title: o.title || '',
      onclick: () => onChange(o.value),
    }, o.label))));
}

export function textField({ label, value, placeholder, onInput, maxLength }) {
  return h('div', { class: 'field' },
    label && h('label', {}, h('span', {}, label)),
    h('input', {
      class: 'text-input', type: 'text', value: value ?? '',
      placeholder: placeholder || '', maxLength: maxLength || 64,
      oninput: (e) => onInput(e.target.value),
    }));
}

export function colorField({ label, value, swatches, onChange, onCommit }) {
  const picker = h('input', {
    type: 'color', value,
    style: { width: '30px', height: '26px', padding: '0', border: '1px solid var(--hair-strong)', borderRadius: '6px', background: '#fff' },
    oninput: (e) => onChange(e.target.value),
    onchange: (e) => (onCommit || onChange)(e.target.value),
  });
  const grid = h('div', { class: 'swatches' }, swatches.map((s) => h('button', {
    class: `swatch${s.hex.toLowerCase() === String(value).toLowerCase() ? ' is-active' : ''}`,
    style: { background: s.hex },
    title: s.name,
    onclick: () => (onCommit || onChange)(s.hex),
  })));
  return h('div', { class: 'field' },
    h('label', {}, h('span', {}, label), h('span', { class: 'val' }, String(value).toUpperCase())),
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } },
      picker, h('div', { style: { flex: '1' } }, grid)));
}

export function section(title, ...body) {
  return h('div', { class: 'psec' },
    h('header', {}, h('span', {}, title), h('span', { class: 'rule' })),
    h('div', { class: 'body' }, body));
}

export const fmtCm = (v) => `${Number(v).toFixed(1)} cm`;
export const fmtPct = (v) => `${Math.round(v * 100)}%`;
export const fmtDeg = (v) => `${Math.round(v)}°`;
