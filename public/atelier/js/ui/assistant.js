// Design assistant overlay.
//
// The overlay dims the canvas rather than covering it, because watching the
// garment change while you are still typing is the point of putting the
// assistant here instead of on its own page.
//
// Every reply names exactly what changed, using the same sentences the change
// log records, so the chat and the history can never tell different stories.

import { store } from '../state/store.js';
import { interpret, suggestionsFor } from '../assistant/intent.js';
import { interpretRemote, remoteAvailable } from '../assistant/remote.js';
import { getZone } from '../catalog/templates.js';
import { h, mount, clear, qs } from './dom.js';

export class Assistant {
  constructor({ store: designStore = store, onApplied } = {}) {
    this.store = designStore;
    this.onApplied = onApplied;
    this.el = qs('#assist');
    this.thread = qs('#assist-thread');
    this.input = qs('#assist-input');
    this.busy = false;
    this.greeted = false;

    qs('#assist-open').addEventListener('click', () => this.open());
    qs('#assist-close').addEventListener('click', () => this.close());
    qs('#assist-scrim').addEventListener('click', () => this.close());
    qs('#assist-send').addEventListener('click', () => this.submit());

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
      if (e.key === 'Escape') this.close();
    });
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = `${Math.min(110, this.input.scrollHeight)}px`;
    });

    // Say which interpreter is in play rather than implying a model is
    // involved when none is configured.
    remoteAvailable().then((remote) => {
      qs('#assist-sub').textContent = remote
        ? 'Describe a change in plain words.'
        : 'Describe a change in plain words. Running on-device.';
    });
  }

  bind(state) {
    this.state = state;
    this.renderSuggestions();
    if (!this.greeted) {
      this.greeted = true;
      this.say('bot', 'Tell me what you want changed — cloth, colour, wash, lettering, pockets, hardware, distressing. I only work within what this pattern can actually carry.');
    }
  }

  open() {
    this.el.classList.add('is-open');
    this.renderSuggestions();
    setTimeout(() => this.input.focus(), 60);
  }

  close() {
    this.el.classList.remove('is-open');
  }

  renderSuggestions() {
    if (!this.store.state) return;
    const host = qs('#assist-suggests');
    const list = suggestionsFor(this.store.state);
    mount(host, list.map((s) => h('button', {
      class: 'chip',
      onclick: () => { this.input.value = s; this.submit(); },
    }, s)));
  }

  say(who, text, extras = {}) {
    const msg = h('div', { class: `msg ${who}` }, text);
    if (extras.applied?.length) {
      msg.appendChild(h('ul', { class: 'applied' },
        extras.applied.map((line) => h('li', {}, line))));
    }
    if (extras.notes?.length) {
      msg.appendChild(h('ul', { class: 'applied' },
        extras.notes.map((line) => h('li', {}, line))));
    }
    if (extras.warnings?.length) {
      msg.appendChild(h('ul', { class: 'applied warn' },
        extras.warnings.map((line) => h('li', {}, line))));
    }
    if (extras.options?.length) {
      msg.appendChild(h('div', { class: 'qopts' }, extras.options.map((o) => h('button', {
        class: 'chip',
        onclick: () => this.answer(o),
      }, o.label))));
    }
    this.thread.appendChild(msg);
    this.thread.scrollTop = this.thread.scrollHeight;
    return msg;
  }

  async submit() {
    const text = this.input.value.trim();
    if (!text || this.busy || !this.store.state) return;
    this.input.value = '';
    this.input.style.height = 'auto';
    this.say('user', text);
    await this.handle(text);
  }

  /** A clarifying question was answered by tapping one of its options. */
  answer(option) {
    if (option.patch?.freeText) return this.handle(option.patch.freeText);
    if (option.patch?.intent === 'pocket') {
      const res = this.store.dispatch({
        type: 'addStructuralMod',
        zoneId: option.patch.zoneId,
        mod: { type: 'pocket', subtype: option.patch.subtype, placement: { x: 0.5, y: 0.45, rotation: 0 } },
      }, { source: 'assistant' });
      if (res.ok) {
        this.say('bot', 'Done.', { applied: res.results.map((r) => cap(r.summary)) });
        this.onApplied?.([option.patch.zoneId]);
      } else {
        this.say('bot', res.reason);
      }
    }
    return undefined;
  }

  async handle(text) {
    this.busy = true;
    const thinking = this.say('bot', 'Working…');
    const context = { selectedZone: this.selectedZone() };

    let out = null;
    try {
      out = await interpretRemote(text, this.store.state, context);
    } catch {
      out = null;
    }
    const usedRemote = Boolean(out && (out.understood || out.clarify || out.reply));
    if (!usedRemote) out = interpret(text, this.store.state, context);

    thinking.remove();
    this.busy = false;

    if (out.clarify) {
      this.say('bot', out.clarify.question, { options: out.clarify.options });
      return;
    }

    if (!out.ops.length) {
      if (out.rejected.length) {
        this.say('bot', out.rejected.length === 1
          ? out.rejected[0]
          : 'I could not do that on this pattern:', {
          warnings: out.rejected.length > 1 ? out.rejected : [],
        });
      } else {
        this.say('bot', out.reply || "I didn't catch a change in that. Try naming a zone and what to do to it — “add a welt pocket on the chest”, “stonewash the whole thing”, “write ‘EST. 2026’ on the back in a serif”.");
      }
      return;
    }

    const res = this.store.dispatch(out.ops, { source: 'assistant' });
    if (!res.ok) {
      this.say('bot', res.reason);
      return;
    }

    const applied = collapse(res.results.map((r) => r.summary).filter(Boolean)).map(cap);
    this.say('bot', out.reply || (applied.length === 1 ? 'Done.' : `Done — ${res.results.length} changes.`), {
      applied,
      notes: out.notes.map(cap),
      warnings: out.rejected,
    });

    this.onApplied?.([...new Set(out.ops.map((o) => o.zoneId).filter(Boolean))]);
    this.renderSuggestions();
  }

  selectedZone() {
    const active = document.querySelector('#zonebar .zonebtn.is-active');
    const id = active?.dataset.zone;
    return id && getZone(this.store.state.templateId, id) ? id : null;
  }

  reset() {
    clear(this.thread);
    this.greeted = false;
  }
}

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);

/**
 * A garment-wide change produces one summary per zone. Listing all twelve is
 * noise, so identical actions across several zones fold into a single line that
 * still says how many panels it touched.
 */
function collapse(summaries) {
  const groups = new Map();
  const order = [];
  for (const line of summaries) {
    // Everything before " to the …" / " on the …" is the action itself.
    const key = line.replace(/\s(?:to|on|from|onto)\sthe\s.+$/, '');
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(line);
  }
  return order.map((key) => {
    const lines = groups.get(key);
    if (lines.length < 3) return lines;
    return [`${key} across ${lines.length} panels`];
  }).flat();
}
