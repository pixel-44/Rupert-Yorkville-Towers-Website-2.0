'use strict';

// XANADU — single-device figure detection and real-time tracing.
//
// Flow: activation gate → camera stream → MoveNet pose detection → skeleton
// drawn onto a canvas laid over the video, once per animation frame.

// ── Tunables ───────────────────────────────────────────────────────────────────
const MAX_FIGURES  = 4;        // how many people to trace at once; set to 1 for a single figure
const MIN_POSE     = .25;      // discard whole figures below this confidence
const MIN_KEYPOINT = .3;       // discard individual joints below this confidence
const TRACE_COLOR  = '#FF1744';

// Skeleton topology: each pair is a bone drawn between two named keypoints.
const BONES = [
  ['left_shoulder','right_shoulder'],
  ['left_shoulder','left_elbow'],['left_elbow','left_wrist'],
  ['right_shoulder','right_elbow'],['right_elbow','right_wrist'],
  ['left_shoulder','left_hip'],['right_shoulder','right_hip'],
  ['left_hip','right_hip'],
  ['left_hip','left_knee'],['left_knee','left_ankle'],
  ['right_hip','right_knee'],['right_knee','right_ankle'],
  ['nose','left_shoulder'],['nose','right_shoulder'],
];

// ── State ──────────────────────────────────────────────────────────────────────
let detector  = null;
let detecting = false;

// ── DOM refs ───────────────────────────────────────────────────────────────────
const $   = id => document.getElementById(id);
const vid = $('video');
const cl  = $('cl');
const ctx = cl.getContext('2d');

// ── UI helpers ─────────────────────────────────────────────────────────────────
function setPill(id, dotClass, pulse, text) {
  const el = $(id); if (!el) return;
  el.innerHTML = `<span class="dot ${dotClass} ${pulse?'pu':''}"></span>${text}`;
}

// ── Drawing ────────────────────────────────────────────────────────────────────
function drawFigures(poses, vw, vh) {
  const sx = cl.width / vw, sy = cl.height / vh;
  ctx.clearRect(0, 0, cl.width, cl.height);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.strokeStyle = TRACE_COLOR; ctx.fillStyle = TRACE_COLOR; ctx.lineWidth = 2.5;

  for (const pose of poses) {
    const kp = {};
    for (const k of pose.keypoints) kp[k.name] = k;

    for (const [a, b] of BONES) {
      if ((kp[a]?.score||0) > MIN_KEYPOINT && (kp[b]?.score||0) > MIN_KEYPOINT) {
        ctx.beginPath();
        ctx.moveTo(kp[a].x * sx, kp[a].y * sy);
        ctx.lineTo(kp[b].x * sx, kp[b].y * sy);
        ctx.stroke();
      }
    }

    // Halo above the head.
    const nose = kp['nose'];
    if ((nose?.score||0) > MIN_KEYPOINT) {
      ctx.beginPath(); ctx.arc(nose.x*sx, nose.y*sy - 18, 14, 0, Math.PI*2);
      ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 2.5;
    }

    // Joint markers: colored disc with a white core.
    for (const k of pose.keypoints) {
      if ((k.score||0) > MIN_KEYPOINT) {
        ctx.beginPath(); ctx.arc(k.x*sx, k.y*sy, 5, 0, Math.PI*2);
        ctx.fillStyle = TRACE_COLOR; ctx.fill();
        ctx.beginPath(); ctx.arc(k.x*sx, k.y*sy, 2, 0, Math.PI*2);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
  }
}

// ── Detection loop ─────────────────────────────────────────────────────────────
function syncCanvasSize() {
  const vw = vid.videoWidth, vh = vid.videoHeight;
  if (!vw || !vh) return false;
  if (cl.width !== vw || cl.height !== vh) { cl.width = vw; cl.height = vh; }
  return true;
}

function detectionLoop() {
  if (!detecting && detector && vid.readyState >= 2 && syncCanvasSize()) {
    detecting = true;
    const vw = vid.videoWidth, vh = vid.videoHeight;
    detector.estimatePoses(vid, { maxPoses: MAX_FIGURES })
      .then(raw => {
        detecting = false;
        drawFigures(raw.filter(p => (p.score ?? 1) > MIN_POSE), vw, vh);
      })
      .catch(() => { detecting = false; });
  }
  requestAnimationFrame(detectionLoop);
}

// ── Detector init ──────────────────────────────────────────────────────────────
async function initDetector() {
  try { await tf.setBackend('webgl'); await tf.ready(); }
  catch { await tf.setBackend('wasm'); await tf.ready(); }

  const pd = window.poseDetection;
  detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
    modelType: pd.movenet.modelType.MULTIPOSE_LIGHTNING,
    enableSmoothing: true,
    minPoseScore: MIN_POSE,
  });
  setPill('ppose', 'dt', false, 'POSE ON');
}

// ── Camera ─────────────────────────────────────────────────────────────────────
async function startCamera() {
  const opts = [
    { video: { width:{ideal:3840}, height:{ideal:2160}, frameRate:{ideal:60} }, audio: false },
    { video: { width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:30} }, audio: false },
    { video: true, audio: false },
  ];
  for (const o of opts) {
    try { vid.srcObject = await navigator.mediaDevices.getUserMedia(o); await vid.play(); return; }
    catch { /* try next */ }
  }
  throw new Error('Camera unavailable');
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot() {
  await startCamera();
  $('perm').style.display = 'none';
  $('app').style.display  = 'flex';

  vid.addEventListener('loadedmetadata', syncCanvasSize);
  requestAnimationFrame(detectionLoop);
  initDetector().catch(console.error);
}

// ── Entry ──────────────────────────────────────────────────────────────────────
$('ballow').onclick = async () => {
  try {
    // Prompt first with a throwaway stream so the browser shows its permission
    // dialog on a real user gesture, then release it and start for real.
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    s.getTracks().forEach(t => t.stop());
    await boot();
  } catch {
    $('perm').innerHTML = `<div class="ico"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><line x1="8" y1="8" x2="40" y2="40" stroke="rgba(255,255,255,0.4)" stroke-width="2"/><line x1="40" y1="8" x2="8" y2="40" stroke="rgba(255,255,255,0.4)" stroke-width="2"/></svg></div>
      <h1 style="font-size:20px">CAMERA DENIED</h1>
      <p style="margin-bottom:20px">Enable camera in browser settings and reload.</p>
      <button class="bprim" onclick="location.reload()">RELOAD</button>`;
  }
};

// Already granted on a previous visit? Skip the gate entirely.
if (navigator.permissions) {
  navigator.permissions.query({ name: 'camera' })
    .then(r => { if (r.state === 'granted') boot().catch(console.error); })
    .catch(() => {});
}
