// Three.js viewport: studio lighting, camera, picking, capture.
//
// The lighting rig is a soft-box key with a cool fill and a rim, plus a
// generated studio environment so metal hardware has something real to
// reflect. Chrome with no environment reads as flat grey plastic, which would
// undo the point of specifying finishes at all.
//
// Zone picking works off the raycast UV: a hit gives a panel and a (u, v), and
// the zone map turns that into the zone the user clicked. That is the same
// coordinate space the compositor paints in, so what you click is exactly what
// gets edited.

import * as THREE from '../../vendor/three.module.min.js';
import { buildGarment, surfacePatchGeometry } from './garment-builder.js';
import { buildAttachments } from './attachments.js';
import { GarmentCompositor } from './compositor.js';
import { getMaterial } from '../catalog/materials.js';
import { getTemplate, getZone } from '../catalog/templates.js';

export const VIEWS = {
  front: { azimuth: 0, polar: 78, label: 'Front' },
  back: { azimuth: 180, polar: 78, label: 'Back' },
  threeQuarter: { azimuth: 34, polar: 74, label: '¾' },
  left: { azimuth: 90, polar: 80, label: 'Left' },
  right: { azimuth: -90, polar: 80, label: 'Right' },
  top: { azimuth: 12, polar: 32, label: 'Top' },
};

/** Soft studio environment, generated rather than loaded. */
function studioEnvironment(renderer) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.42, '#e9ecef');
  sky.addColorStop(0.55, '#9aa1ab');
  sky.addColorStop(1, '#2b2e33');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);

  // Two overhead soft boxes — the highlights that make chrome look like chrome.
  for (const [x, w] of [[110, 150], [330, 110]]) {
    const g = ctx.createRadialGradient(x, 40, 0, x, 40, w);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w, 0, w * 2, 140);
  }
  // A dark card opposite, so edges read against something.
  const dark = ctx.createRadialGradient(470, 120, 0, 470, 120, 120);
  dark.addColorStop(0, 'rgba(20,22,26,0.85)');
  dark.addColorStop(1, 'rgba(20,22,26,0)');
  ctx.fillStyle = dark;
  ctx.fillRect(350, 0, 162, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

/** Minimal orbit control. Deliberately damped and unplayful. */
class Orbit {
  constructor(camera, dom, target) {
    this.camera = camera;
    this.dom = dom;
    this.target = target;
    this.azimuth = 0;
    this.polar = 78;
    this.distance = 2.2;
    this.minDistance = 0.55;
    this.maxDistance = 5;
    this.goal = { azimuth: 0, polar: 78, distance: 2.2 };
    this.dragging = false;
    this.moved = false;
    this._bind();
  }

  _bind() {
    const dom = this.dom;
    let lastX = 0, lastY = 0, pointerId = null;

    this._onDown = (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointerId = e.pointerId;
      this.dragging = true;
      this.moved = false;
      lastX = e.clientX; lastY = e.clientY;
      dom.setPointerCapture?.(e.pointerId);
    };
    this._onMove = (e) => {
      if (!this.dragging || e.pointerId !== pointerId) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      lastX = e.clientX; lastY = e.clientY;
      this.goal.azimuth -= dx * 0.32;
      this.goal.polar = Math.min(150, Math.max(20, this.goal.polar - dy * 0.26));
    };
    this._onUp = (e) => {
      if (e.pointerId !== pointerId) return;
      this.dragging = false;
      pointerId = null;
    };
    this._onWheel = (e) => {
      e.preventDefault();
      const k = Math.exp(e.deltaY * 0.0011);
      this.goal.distance = Math.min(this.maxDistance, Math.max(this.minDistance, this.goal.distance * k));
    };

    dom.addEventListener('pointerdown', this._onDown);
    dom.addEventListener('pointermove', this._onMove);
    dom.addEventListener('pointerup', this._onUp);
    dom.addEventListener('pointercancel', this._onUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  setView({ azimuth, polar }, distance) {
    // Take the short way round, so a jump from 350° to 10° does not spin.
    const current = this.goal.azimuth;
    const delta = ((azimuth - current + 540) % 360) - 180;
    this.goal.azimuth = current + delta;
    this.goal.polar = polar;
    if (distance) this.goal.distance = distance;
  }

  update() {
    // Critically damped enough to feel precise: no overshoot, no float.
    const k = 0.18;
    this.azimuth += (this.goal.azimuth - this.azimuth) * k;
    this.polar += (this.goal.polar - this.polar) * k;
    this.distance += (this.goal.distance - this.distance) * k;

    const a = (this.azimuth * Math.PI) / 180;
    const p = (this.polar * Math.PI) / 180;
    this.camera.position.set(
      this.target.x + this.distance * Math.sin(p) * Math.sin(a),
      this.target.y + this.distance * Math.cos(p),
      this.target.z + this.distance * Math.sin(p) * Math.cos(a)
    );
    this.camera.lookAt(this.target);
  }

  dispose() {
    const dom = this.dom;
    dom.removeEventListener('pointerdown', this._onDown);
    dom.removeEventListener('pointermove', this._onMove);
    dom.removeEventListener('pointerup', this._onUp);
    dom.removeEventListener('pointercancel', this._onUp);
    dom.removeEventListener('wheel', this._onWheel);
  }
}

export class GarmentViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(this.renderer);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);
    this.target = new THREE.Vector3(0, 0, 0);
    this.orbit = new Orbit(this.camera, canvas, this.target);

    this._addLights();
    this._addShadowPlane();

    this.garmentGroup = new THREE.Group();
    this.scene.add(this.garmentGroup);

    this.panelMeshes = new Map();
    this.panelMaterials = new Map();
    this.textures = new Map();
    this.compositor = null;
    this.garment = null;
    this.template = null;
    this.state = null;

    this.highlight = null;
    this.selectionZone = null;
    this.hoverZone = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.listeners = { zoneclick: [], zonehover: [], ready: [] };

    this._pendingPanels = new Set();
    this._needsRender = true;
    this._running = true;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    this._bindPicking();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
  }

  on(event, fn) {
    this.listeners[event]?.push(fn);
    return () => {
      this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
    };
  }

  emit(event, payload) {
    for (const fn of this.listeners[event] || []) fn(payload);
  }

  _addLights() {
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(1.4, 2.2, 2.0);
    const fill = new THREE.DirectionalLight(0xdfe7f2, 0.5);
    fill.position.set(-2.2, 0.7, 1.1);
    const rim = new THREE.DirectionalLight(0xffffff, 1.15);
    rim.position.set(-0.9, 1.6, -2.4);
    const ambient = new THREE.HemisphereLight(0xffffff, 0x9099a6, 0.5);
    this.scene.add(key, fill, rim, ambient);
    this.keyLight = key;
  }

  /** A painted contact shadow — softer and cheaper than a shadow map here. */
  _addShadowPlane() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(18,20,24,0.42)');
    g.addColorStop(0.55, 'rgba(18,20,24,0.16)');
    g.addColorStop(1, 'rgba(18,20,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.3),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadowPlane);
  }

  // ── Design binding ──────────────────────────────────────────────────────

  setDesign(state) {
    this.state = state;
    const template = getTemplate(state.templateId);
    const rebuildGeometry = !this.template || this.template.id !== template.id;
    this.template = template;

    if (rebuildGeometry) {
      this._disposeGarment();
      const bodyZone = state.zones.find((z) => !getZone(template.id, z.zoneId)?.role);
      const material = getMaterial(bodyZone?.material);
      this.garment = buildGarment(template, { material });
      this.compositor = new GarmentCompositor(template, this.garment.metrics);
      this._buildMeshes();
      this._frameGarment();
    }

    this.compositor.update(state, null);
    this._uploadTextures(null);
    this._rebuildAttachments();
    this._needsRender = true;
    this.emit('ready', { template });
  }

  /** Incremental update: only the panels owning the changed zones re-render. */
  updateDesign(state, zoneIds) {
    if (!this.compositor) return this.setDesign(state);
    this.state = state;
    const changed = this.compositor.update(state, zoneIds);
    this._uploadTextures(changed);
    this._rebuildAttachments();
    this._needsRender = true;
  }

  _buildMeshes() {
    for (const [panelId, panel] of this.garment.panels) {
      const geometry = panel.buildGeometry();
      const bundle = this.compositor.panels.get(panelId);
      const maps = this._makeTextures(panelId, bundle);
      const material = new THREE.MeshStandardMaterial({
        map: maps.map,
        normalMap: maps.normalMap,
        roughnessMap: maps.roughnessMap,
        alphaMap: bundle.hasHoles ? maps.alphaMap : null,
        alphaTest: bundle.hasHoles ? 0.5 : 0,
        side: THREE.DoubleSide,
        metalness: 0,
        roughness: 1,
        normalScale: new THREE.Vector2(1, 1),
        envMapIntensity: 0.55,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.panelId = panelId;
      mesh.name = `panel:${panelId}`;
      this.garmentGroup.add(mesh);
      this.panelMeshes.set(panelId, mesh);
      this.panelMaterials.set(panelId, material);
    }
  }

  _makeTextures(panelId, bundle) {
    const mk = (canvas, srgb) => {
      const t = new THREE.CanvasTexture(canvas);
      // The compositor paints with (0,0) at the top-left, matching the v-down
      // convention the zone map uses, so flipY has to be off.
      t.flipY = false;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    };
    const set = {
      map: mk(bundle.albedo, true),
      normalMap: mk(bundle.normal, false),
      roughnessMap: mk(bundle.roughness, false),
      alphaMap: mk(bundle.alpha, false),
    };
    this.textures.set(panelId, set);
    return set;
  }

  _uploadTextures(panelIds) {
    const ids = panelIds || [...this.textures.keys()];
    for (const id of ids) {
      const set = this.textures.get(id);
      if (!set) continue;
      for (const t of Object.values(set)) t.needsUpdate = true;
      const bundle = this.compositor.panels.get(id);
      const mat = this.panelMaterials.get(id);
      if (mat && bundle) {
        const wantsAlpha = bundle.hasHoles;
        const hasAlpha = Boolean(mat.alphaMap);
        if (wantsAlpha !== hasAlpha) {
          mat.alphaMap = wantsAlpha ? set.alphaMap : null;
          mat.alphaTest = wantsAlpha ? 0.5 : 0;
          mat.needsUpdate = true;
        }
      }
    }
  }

  _rebuildAttachments() {
    if (this.attachments) {
      this.garmentGroup.remove(this.attachments);
      disposeTree(this.attachments);
    }
    this.attachments = buildAttachments(
      this.state, this.garment, this.panelMaterials, this.template.id
    );
    this.garmentGroup.add(this.attachments);
  }

  _frameGarment() {
    const box = new THREE.Box3().setFromObject(this.garmentGroup);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    this.bounds = { size, centre };
    this.target.copy(centre);
    const distance = Math.max(size.x, size.y) * 1.9 + 0.25;
    this.orbit.goal.distance = distance;
    this.orbit.distance = distance;
    this.orbit.maxDistance = distance * 2.6;
    this.orbit.minDistance = distance * 0.28;
    this.shadowPlane.position.set(centre.x, box.min.y - 0.012, centre.z);
    this.shadowPlane.scale.setScalar(Math.max(0.7, size.x * 1.5));
  }

  // ── Views and capture ───────────────────────────────────────────────────

  setView(name) {
    const v = VIEWS[name];
    if (v) this.orbit.setView(v);
    this._needsRender = true;
  }

  zoom(factor) {
    this.orbit.goal.distance = Math.min(
      this.orbit.maxDistance,
      Math.max(this.orbit.minDistance, this.orbit.goal.distance * factor)
    );
    this._needsRender = true;
  }

  /**
   * Render one view off-screen at high resolution.
   *
   * The spec sheet wants JPEG on a light card (JPEG has no alpha, so a
   * transparent clear colour would flatten to black); the outfit board wants a
   * cut-out PNG it can lay over a mannequin.
   */
  capture(viewName, width = 1000, height = 1300, { transparent = false } = {}) {
    const saved = {
      azimuth: this.orbit.azimuth, polar: this.orbit.polar, distance: this.orbit.distance,
      goal: { ...this.orbit.goal },
      size: this.renderer.getSize(new THREE.Vector2()),
      pixelRatio: this.renderer.getPixelRatio(),
    };
    const v = VIEWS[viewName] || VIEWS.front;
    this.orbit.azimuth = this.orbit.goal.azimuth = v.azimuth;
    this.orbit.polar = this.orbit.goal.polar = v.polar;

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // The capture aspect is rarely the viewport's, so reframe rather than
    // inheriting a distance that crops the garment.
    this.orbit.distance = this._fitDistance(width / height);
    this.orbit.update();

    const hl = this.highlight?.visible;
    if (this.highlight) this.highlight.visible = false;
    const savedBackground = this.scene.background;
    const savedShadow = this.shadowPlane.visible;
    if (transparent) {
      this.shadowPlane.visible = false;
    } else {
      this.scene.background = new THREE.Color(0xf7f8f9);
    }
    this.renderer.render(this.scene, this.camera);
    const url = transparent
      ? this.canvas.toDataURL('image/png')
      : this.canvas.toDataURL('image/jpeg', 0.92);
    this.scene.background = savedBackground;
    this.shadowPlane.visible = savedShadow;
    if (this.highlight) this.highlight.visible = hl;

    this.orbit.azimuth = saved.azimuth;
    this.orbit.polar = saved.polar;
    this.orbit.distance = saved.distance;
    this.orbit.goal = saved.goal;
    this.renderer.setPixelRatio(saved.pixelRatio);
    this.renderer.setSize(saved.size.x, saved.size.y, false);
    this.camera.aspect = saved.size.x / saved.size.y;
    this.camera.updateProjectionMatrix();
    this._needsRender = true;
    return url;
  }

  /** Camera distance that fits the whole garment at a given aspect ratio. */
  _fitDistance(aspect) {
    if (!this.bounds) return this.orbit.distance;
    const { size } = this.bounds;
    const fov = (this.camera.fov * Math.PI) / 180;
    // A rotated garment presents up to its diagonal, so fit on that rather than
    // on width alone or a three-quarter view clips at the shoulders.
    const spread = Math.hypot(size.x, size.z);
    const forHeight = size.y / 2 / Math.tan(fov / 2);
    const forWidth = spread / 2 / Math.tan(fov / 2) / aspect;
    return Math.max(forHeight, forWidth) * 1.22;
  }

  // ── Picking ─────────────────────────────────────────────────────────────

  _bindPicking() {
    this._onPointerMove = (e) => {
      if (this._placementZone) return;
      const zone = this._zoneAt(e);
      if (zone?.id !== this.hoverZone) {
        this.hoverZone = zone?.id || null;
        this.canvas.style.cursor = zone ? 'pointer' : 'grab';
        this.emit('zonehover', zone);
        this._updateHighlight();
      }
    };
    this._onClick = (e) => {
      // A click that ended a drag is a camera move, not a selection.
      if (this.orbit.moved || this._placementZone) return;
      const zone = this._zoneAt(e);
      if (zone) {
        this.selectZone(zone.id);
        this.emit('zoneclick', zone);
      }
    };
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('click', this._onClick);
  }

  _zoneAt(event) {
    return this._hitAt(event)?.zone || null;
  }

  /** Raycast to a zone plus the zone-local (0–1) coordinates of the hit. */
  _hitAt(event) {
    if (!this.template) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.garmentGroup.children, true);
    for (const hit of hits) {
      if (hit.object === this.highlight) continue;
      // Attachments answer for the zone they belong to.
      const attached = hit.object.userData.zoneId;
      if (attached) {
        const zone = getZone(this.template.id, attached);
        return zone ? { zone, x: 0.5, y: 0.5 } : null;
      }

      const panelId = hit.object.userData.panelId;
      if (!panelId || !hit.uv) continue;
      const u = hit.uv.x, v = hit.uv.y;
      const candidates = this.template.zones.filter((z) => z.panel === panelId);
      const local = (z) => {
        const [u0, v0, u1, v1] = z.uv;
        return {
          zone: z,
          x: Math.min(1, Math.max(0, (u - u0) / Math.max(1e-6, u1 - u0))),
          y: Math.min(1, Math.max(0, (v - v0) / Math.max(1e-6, v1 - v0))),
        };
      };
      for (const z of candidates) {
        const [u0, v0, u1, v1] = z.uv;
        if (u >= u0 && u <= u1 && v >= v0 && v <= v1) return local(z);
      }
      if (candidates.length) return local(candidates[0]);
    }
    return null;
  }

  /**
   * Arm direct placement: while a zone is armed, dragging on the garment
   * reports zone-local coordinates instead of orbiting the camera, which is
   * what makes "drag a text box onto the chest" work on a 3D surface.
   *
   * @param {string|null} zoneId  Pass null to disarm.
   * @param {(pos: {x: number, y: number}, done: boolean) => void} [onPlace]
   */
  setPlacementMode(zoneId, onPlace) {
    this._placementZone = zoneId || null;
    this._onPlace = onPlace || null;
    this.canvas.style.cursor = zoneId ? 'crosshair' : 'grab';

    if (!this._placementBound) {
      this._placementBound = true;
      let dragging = false;
      const report = (e, done) => {
        if (!this._placementZone || !this._onPlace) return;
        const hit = this._hitAt(e);
        if (!hit || hit.zone.id !== this._placementZone) return;
        this._onPlace({ x: hit.x, y: hit.y }, done);
      };
      // Capture phase plus stopPropagation: while placement is armed the orbit
      // controller must not also see the drag, or the camera swings away from
      // whatever the user is trying to position.
      this.canvas.addEventListener('pointerdown', (e) => {
        if (!this._placementZone) return;
        e.stopPropagation();
        dragging = true;
        report(e, false);
      }, true);
      this.canvas.addEventListener('pointermove', (e) => {
        if (!this._placementZone) return;
        e.stopPropagation();
        if (dragging) report(e, false);
      }, true);
      this.canvas.addEventListener('pointerup', (e) => {
        if (!this._placementZone) return;
        e.stopPropagation();
        if (!dragging) return;
        dragging = false;
        report(e, true);
      }, true);
    }
  }

  selectZone(zoneId) {
    this.selectionZone = zoneId;
    this._updateHighlight();
    this._needsRender = true;
  }

  _updateHighlight() {
    const zoneId = this.selectionZone || this.hoverZone;
    if (this.highlight) {
      this.garmentGroup.remove(this.highlight);
      disposeTree(this.highlight);
      this.highlight = null;
    }
    if (!zoneId || !this.garment) return;
    const zone = getZone(this.template.id, zoneId);
    const panel = this.garment.panels.get(zone?.panel);
    if (!panel) return;

    const [u0, v0, u1, v1] = zone.uv;
    const geom = surfacePatchGeometry(panel, {
      u: (u0 + u1) / 2, v: (v0 + v1) / 2,
      uSpan: u1 - u0, vSpan: v1 - v0,
      offset: 0.0022, segments: 20,
    });
    const isSelected = zoneId === this.selectionZone;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(isSelected ? 0x1c1c1f : 0x8a8f98),
      transparent: true,
      opacity: isSelected ? 0.07 : 0.045,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.highlight = new THREE.Mesh(geom, mat);
    this.highlight.renderOrder = 3;
    this.garmentGroup.add(this.highlight);
    this._needsRender = true;
  }

  // ── Loop ────────────────────────────────────────────────────────────────

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._needsRender = true;
  }

  _loop() {
    if (!this._running) return;
    requestAnimationFrame(this._loop);
    const before = { a: this.orbit.azimuth, p: this.orbit.polar, d: this.orbit.distance };
    this.orbit.update();
    const settled = Math.abs(before.a - this.orbit.azimuth) < 0.002
      && Math.abs(before.p - this.orbit.polar) < 0.002
      && Math.abs(before.d - this.orbit.distance) < 0.0002;
    if (!settled) this._needsRender = true;
    if (this._needsRender) {
      this.renderer.render(this.scene, this.camera);
      this._needsRender = settled ? false : true;
    }
  }

  _disposeGarment() {
    for (const mesh of this.panelMeshes.values()) {
      this.garmentGroup.remove(mesh);
      disposeTree(mesh);
    }
    this.panelMeshes.clear();
    this.panelMaterials.clear();
    for (const set of this.textures.values()) {
      for (const t of Object.values(set)) t.dispose();
    }
    this.textures.clear();
    if (this.attachments) {
      this.garmentGroup.remove(this.attachments);
      disposeTree(this.attachments);
      this.attachments = null;
    }
  }

  dispose() {
    this._running = false;
    this._resizeObserver?.disconnect();
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('click', this._onClick);
    this.orbit.dispose();
    this._disposeGarment();
    this.renderer.dispose();
  }
}

function disposeTree(root) {
  root.traverse?.((obj) => {
    obj.geometry?.dispose?.();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) m.dispose?.();
  });
  root.geometry?.dispose?.();
}
