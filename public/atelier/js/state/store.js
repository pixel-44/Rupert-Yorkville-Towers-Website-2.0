// Reactive store over DesignState.
//
// Manual edits and assistant edits both arrive here as ops, which is what keeps
// the two editing modes from drifting: there is exactly one write path, one
// history, and one change event. Subscribers get told which zone changed so the
// renderer can recomposite a single panel rather than the whole garment.

import { applyOp, createDesignState, validateDesignState } from './design-state.js';

const STORAGE_KEY = 'atelier.library.v1';
const HISTORY_LIMIT = 80;
const COALESCE_WINDOW_MS = 700;

export class DesignStore {
  constructor() {
    /** @type {object|null} */
    this.state = null;
    this.past = [];
    this.future = [];
    this.log = [];                 // human-readable change log, newest last
    this.listeners = new Set();
    this._lastCoalesceKey = null;
    this._lastCoalesceAt = 0;
    this._saveTimer = null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  load(state) {
    this.state = state;
    this.past = [];
    this.future = [];
    this.log = [];
    this.emit({ type: 'load' });
  }

  start(templateId, opts) {
    this.load(createDesignState(templateId, opts));
    return this.state;
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(change) {
    for (const fn of this.listeners) {
      try {
        fn(change, this.state);
      } catch (err) {
        // A broken panel must not stop the renderer from updating.
        console.error('[atelier] subscriber failed', err);
      }
    }
  }

  // ── Writes ──────────────────────────────────────────────────────────────

  /**
   * Apply one op or a batch. A batch is atomic: if any op is rejected, nothing
   * lands, so the assistant can never half-apply a multi-part request.
   *
   * @param {object|object[]} ops
   * @param {{coalesce?: string, silent?: boolean, source?: 'manual'|'assistant'}} [opts]
   * @returns {{ok: boolean, results: object[], reason?: string}}
   */
  dispatch(ops, opts = {}) {
    if (!this.state) return { ok: false, results: [], reason: 'No design open.' };
    const list = Array.isArray(ops) ? ops : [ops];
    if (!list.length) return { ok: true, results: [] };

    const draft = snapshot(this.state);
    const results = [];
    for (const op of list) {
      const res = applyOp(draft, op);
      if (!res.ok) return { ok: false, results, reason: res.reason };
      results.push(res);
    }

    this.pushHistory(opts.coalesce);
    this.state = draft;
    this.future = [];

    const entry = {
      at: new Date().toISOString(),
      source: opts.source || 'manual',
      summaries: results.map((r) => r.summary).filter(Boolean),
    };
    if (entry.summaries.length) this.log.push(entry);

    this.scheduleSave();
    if (!opts.silent) {
      this.emit({
        type: 'ops',
        source: entry.source,
        zoneIds: [...new Set(list.map((o) => o.zoneId).filter(Boolean))],
        results,
      });
    }
    return { ok: true, results };
  }

  /**
   * History push with coalescing: dragging a slider produces one undo step, not
   * one per pixel. A distinct coalesce key or a pause past the window starts a
   * new step.
   */
  pushHistory(coalesceKey) {
    const now = Date.now();
    const sameRun = coalesceKey
      && coalesceKey === this._lastCoalesceKey
      && now - this._lastCoalesceAt < COALESCE_WINDOW_MS;

    this._lastCoalesceKey = coalesceKey || null;
    this._lastCoalesceAt = now;
    if (sameRun) return;

    this.past.push(snapshot(this.state));
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
  }

  undo() {
    if (!this.past.length) return false;
    this.future.push(snapshot(this.state));
    this.state = this.past.pop();
    this._lastCoalesceKey = null;
    this.scheduleSave();
    this.emit({ type: 'history', direction: 'undo' });
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    this.past.push(snapshot(this.state));
    this.state = this.future.pop();
    this._lastCoalesceKey = null;
    this.scheduleSave();
    this.emit({ type: 'history', direction: 'redo' });
    return true;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  // ── Persistence ─────────────────────────────────────────────────────────

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 400);
  }

  save() {
    if (!this.state) return;
    const lib = readLibrary();
    lib.designs = lib.designs.filter((d) => d.id !== this.state.id);
    lib.designs.unshift(snapshot(this.state));
    lib.designs = lib.designs.slice(0, 40);
    lib.lastOpened = this.state.id;
    writeLibrary(lib);
  }
}

function snapshot(obj) {
  // structuredClone is available everywhere this app runs and handles the
  // nested arrays without the JSON round-trip's type loss.
  return typeof structuredClone === 'function'
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

// ── Library (saved designs and outfits) ───────────────────────────────────

export function readLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { designs: [], outfits: [], lastOpened: null };
    const parsed = JSON.parse(raw);
    return {
      designs: Array.isArray(parsed.designs) ? parsed.designs : [],
      outfits: Array.isArray(parsed.outfits) ? parsed.outfits : [],
      lastOpened: parsed.lastOpened || null,
    };
  } catch {
    // Corrupt storage should cost the user their history, not the whole app.
    return { designs: [], outfits: [], lastOpened: null };
  }
}

export function writeLibrary(lib) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
  } catch (err) {
    // Quota is the realistic failure — uploaded artwork is stored inline.
    console.warn('[atelier] could not persist library', err);
  }
}

export function loadDesign(id) {
  const found = readLibrary().designs.find((d) => d.id === id);
  if (!found) return null;
  return validateDesignState(found).ok ? found : null;
}

export function deleteDesign(id) {
  const lib = readLibrary();
  lib.designs = lib.designs.filter((d) => d.id !== id);
  lib.outfits = lib.outfits.map((o) => ({
    ...o,
    garments: o.garments.filter((g) => g.designId !== id),
  }));
  writeLibrary(lib);
}

export function saveOutfit(outfit) {
  const lib = readLibrary();
  lib.outfits = lib.outfits.filter((o) => o.id !== outfit.id);
  lib.outfits.unshift(outfit);
  lib.outfits = lib.outfits.slice(0, 30);
  writeLibrary(lib);
}

export function deleteOutfit(id) {
  const lib = readLibrary();
  lib.outfits = lib.outfits.filter((o) => o.id !== id);
  writeLibrary(lib);
}

export const store = new DesignStore();
