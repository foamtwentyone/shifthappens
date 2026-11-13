// Procedural textures and a material cache. No external art assets:
// everything is drawn into canvases at startup, which keeps the look
// consistent and the build tiny.
import * as THREE from 'three';

export const PAL = {
  ink: '#1b1f24', teal: '#1f8a8a', teal2: '#2aa7a2', tealDeep: '#12353d', yellow: '#ffc93c', yellow2: '#f2a91d',
  orange: '#ff7a2f', red: '#e8423f', redDeep: '#a8231f', green: '#49c46b', blue: '#3b82d6', steel: '#d9e2e4',
  steel2: '#b7c4c8', steelDark: '#8a979c', cream: '#efe6d2', paper: '#f4ebd9', rubber: '#2b3036', wood: '#b07a45',
  purple: '#8b5cf6', pink: '#ff5d8f',
};

const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? 0.58, metalness: o.metal ?? 0.04,
    emissive: o.emissive ?? '#000000', emissiveIntensity: o.ei ?? 1,
    transparent: !!o.opacity, opacity: o.opacity ?? 1, flatShading: !!o.flat,
    side: o.side ?? THREE.FrontSide, depthWrite: o.depthWrite ?? true,
  });
  if (o.map) m.map = o.map;
  // every surface gets a little micro-detail (paint orange-peel, wood grain)
  if (o.pbr !== false && !o.opacity) {
    const P = pbr();
    const woody = WOODS.has(color);
    m.normalMap = woody ? P.woodN : P.paintN;
    const ns = woody ? 0.7 : 0.35;
    m.normalScale.set(ns, ns);
  }
  matCache.set(key, m);
  return m;
}
const WOODS = new Set(['#b07a45', '#8a5d33', '#b98a56', '#9a6a3e', '#6e4628', '#a0703f']);
export function uniqueMat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.58, metalness: o.metal ?? 0.04, emissive: o.emissive ?? '#000', emissiveIntensity: o.ei ?? 1, transparent: !!o.opacity, opacity: o.opacity ?? 1, map: o.map ?? null });
}
export const inkMat = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide });

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// seeded noise for consistent concrete
function noise(ctx, w, h, amt, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function floorTex(color, seed = 3) {
  // 2×2 tiles per texture, each tile slightly different in tone, worn edges
  const [c, g] = canvas(512, 512);
  const base = new THREE.Color(color);
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const k = 0.93 + r() * 0.12;
    const col = base.clone().multiplyScalar(k);
    g.fillStyle = '#' + col.getHexString();
    g.fillRect(tx * 256, ty * 256, 256, 256);
  }
  noise(g, 512, 512, 16, seed);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(40,30,20,${0.02 + r() * 0.035})`;
    g.beginPath(); g.ellipse(r() * 512, r() * 512, 15 + r() * 60, 10 + r() * 40, r() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    g.strokeStyle = 'rgba(25,32,36,0.45)'; g.lineWidth = 4;
    g.strokeRect(tx * 256 + 2, ty * 256 + 2, 252, 252);
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2;
    g.strokeRect(tx * 256 + 6, ty * 256 + 6, 244, 244);
  }
  return toTex(c);
}

export function hazardTex(a = PAL.yellow, b = PAL.ink, n = 8) {
  const [c, g] = canvas(256, 64);
  g.fillStyle = a; g.fillRect(0, 0, 256, 64);
  g.fillStyle = b;
  const w = 256 / n;
  for (let i = -2; i < n + 2; i++) {
    g.beginPath();
    g.moveTo(i * w, 64); g.lineTo(i * w + w / 2, 64); g.lineTo(i * w + w / 2 + 32, 0); g.lineTo(i * w + 32, 0); g.closePath(); g.fill();
  }
  const t = toTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function beltTex() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#2a2f35'; g.fillRect(0, 0, 128, 256);
  noise(g, 128, 256, 10, 7);
  for (let y = 0; y < 256; y += 16) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, 128, 3); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y + 3, 128, 2); }
  // chevrons pointing +v (texture v = belt forward)
  g.strokeStyle = PAL.yellow; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const y of [70, 198]) {
    g.beginPath(); g.moveTo(30, y + 22); g.lineTo(64, y - 12); g.lineTo(98, y + 22); g.stroke();
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function labelTex(text, o = {}) {
  const w = o.w ?? 512, h = o.h ?? 128;
  const [c, g] = canvas(w, h);
  const r = o.radius ?? 18;
  if (o.bg !== 'none') {
    g.fillStyle = o.border ?? PAL.ink;
    roundRect(g, 0, 0, w, h, r); g.fill();
    g.fillStyle = o.bg ?? PAL.yellow;
    roundRect(g, o.bw ?? 8, o.bw ?? 8, w - 2 * (o.bw ?? 8), h - 2 * (o.bw ?? 8), Math.max(2, r - 6)); g.fill();
    if (o.hazard) {
      g.save(); roundRect(g, 8, 8, w - 16, h - 16, r - 6); g.clip();
      g.fillStyle = PAL.ink;
      for (let x = -h; x < w; x += 36) { g.beginPath(); g.moveTo(x, h - 8); g.lineTo(x + 18, h - 8); g.lineTo(x + 18 + 14, h - 22); g.lineTo(x + 14, h - 22); g.fill(); }
      g.restore();
    }
  }
  g.fillStyle = o.fg ?? PAL.ink;
  g.font = `${o.weight ?? ''} ${o.size ?? 64}px ${o.font ?? 'Bungee, Impact, sans-serif'}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  const lh = (o.size ?? 64) * 1.05;
  lines.forEach((ln, i) => g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lh + (o.dy ?? 4), w - 24));
  return toTex(c);
}

export function stencilTex(text, color = 'rgba(27,31,36,0.22)', size = 120) {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = color;
  g.font = `${size}px Bungee, Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 132, 1000);
  return toTex(c);
}

export function gaugeTex() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f7f1e3'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.lineWidth = 10; g.strokeStyle = PAL.ink; g.stroke();
  const arc = (a0, a1, col) => { g.strokeStyle = col; g.lineWidth = 22; g.beginPath(); g.arc(128, 128, 92, a0, a1); g.stroke(); };
  const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
  const at = (f) => A0 + (A1 - A0) * f;
  arc(at(0), at(0.2), '#7cc4e0'); arc(at(0.2), at(0.7), '#49c46b'); arc(at(0.7), at(0.85), '#ffc93c'); arc(at(0.85), at(1), '#e8423f');
  g.strokeStyle = PAL.ink; g.lineWidth = 4;
  for (let i = 0; i <= 10; i++) {
    const a = at(i / 10);
    g.beginPath(); g.moveTo(128 + Math.cos(a) * 72, 128 + Math.sin(a) * 72); g.lineTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104); g.stroke();
  }
  g.fillStyle = PAL.ink; g.font = '26px Bungee, Impact'; g.textAlign = 'center';
  g.fillText('PSI', 128, 196);
  g.font = '15px "Space Mono", monospace';
  g.fillText('BOILER 7', 128, 218);
  return toTex(c);
}

export function screenTex(lines, o = {}) {
  const [c, g] = canvas(o.w ?? 256, o.h ?? 160);
  g.fillStyle = o.bg ?? '#10201b'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = o.fg ?? '#8cff9a';
  g.font = `${o.size ?? 22}px "Space Mono", monospace`;
  lines.forEach((l, i) => g.fillText(l, 12, 30 + i * (o.size ?? 22) * 1.2));
  for (let y = 0; y < c.height; y += 4) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, c.width, 1); }
  return toTex(c);
}

export function faceTex(kind) {
  const [c, g] = canvas(256, 128);
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = PAL.ink;
  const eye = (x, y, sx, sy) => { g.beginPath(); g.ellipse(x, y, sx, sy, 0, 0, Math.PI * 2); g.fill(); };
  if (kind === 'sleepy') {
    g.lineWidth = 8; g.strokeStyle = PAL.ink; g.lineCap = 'round';
    g.beginPath(); g.arc(98, 56, 14, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.beginPath(); g.arc(158, 56, 14, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  } else {
    eye(98, 58, 11, 16); eye(158, 58, 11, 16);
    g.fillStyle = '#fff'; eye(102, 51, 4, 5); eye(162, 51, 4, 5);
    g.fillStyle = PAL.ink;
  }
  g.lineCap = 'round'; g.strokeStyle = PAL.ink; g.lineWidth = 7;
  if (kind === 'grumpy') {
    g.beginPath(); g.moveTo(80, 30); g.lineTo(112, 40); g.stroke();
    g.beginPath(); g.moveTo(176, 30); g.lineTo(144, 40); g.stroke();
    g.beginPath(); g.arc(128, 112, 16, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
  } else if (kind === 'stache') {
    g.fillStyle = '#4a2e1f';
    g.beginPath(); g.ellipse(110, 96, 22, 10, 0.25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(146, 96, 22, 10, -0.25, 0, Math.PI * 2); g.fill();
  } else {
    g.beginPath(); g.arc(128, 86, 18, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  }
  // cheeks
  g.fillStyle = 'rgba(255,110,110,0.35)';
  eye(76, 84, 12, 8); eye(180, 84, 12, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ───────────────────────────── procedural PBR maps ─────────────────────────────
// Height fields are painted on canvases and converted to normal maps, so every
// surface gets real micro-detail (tile seams, pores, rivets, weave, rubber ribs)
// without any image assets.
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function valueNoise(size, cells, seed) {
  const r = rng(seed);
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = r();
  for (let i = 0; i <= cells; i++) { g[i * (cells + 1) + cells] = g[i * (cells + 1)]; g[cells * (cells + 1) + i] = g[i]; }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[iy * (cells + 1) + ix], b = g[iy * (cells + 1) + ix + 1], c = g[(iy + 1) * (cells + 1) + ix], d = g[(iy + 1) * (cells + 1) + ix + 1];
    out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  return out;
}
function fbm(size, seed, octaves = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]]) {
  const out = new Float32Array(size * size);
  octaves.forEach(([cells, amp], i) => { const n = valueNoise(size, cells, seed + i * 977); for (let k = 0; k < out.length; k++) out[k] += n[k] * amp; });
  return out;
}

function heightCanvas(size, fn) {
  const h = new Float32Array(size * size);
  fn(h, size);
  return h;
}

function toNormalTex(h, size, strength, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
    img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
    img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function toGreyTex(v, size, lo = 0, hi = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let k = 0; k < v.length; k++) {
    const x = Math.max(0, Math.min(255, (lo + (hi - lo) * v[k]) * 255));
    img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = x; img.data[k * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

let PBR = null;
export function pbr() {
  if (PBR) return PBR;
  const S = 256;
  PBR = {};
  // concrete tile: pores + soft undulation + seam grooves at the border
  {
    const n = fbm(S, 11);
    const r = rng(5);
    const h = heightCanvas(S, (h) => {
      for (let k = 0; k < h.length; k++) h[k] = n[k] * 0.6;
      for (let i = 0; i < 900; i++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); h[y * S + x] -= 0.6 + r(); }
      for (let i = 0; i < S; i++) for (const e of [0, 1, 2, S - 3, S - 2, S - 1]) { h[e * S + i] -= 1.2; h[i * S + e] -= 1.2; }
    });
    PBR.concreteN = toNormalTex(h, S, 1.6);
    const rough = fbm(S, 23);
    PBR.concreteR = toGreyTex(rough, S, 0.6, 1.0);
  }
  // painted steel: big panel seams, rivets, dents; roughness has scratches & grime
  {
    const n = fbm(S, 31, [[6, 0.4], [24, 0.08]]);
    const h = heightCanvas(S, (h) => {
      for (let k = 0; k < h.length; k++) h[k] = n[k] * 0.35;
      const half = S / 2;
      for (let i = 0; i < S; i++) for (const e of [0, 1, half - 1, half]) { h[e * S + i] -= 1.4; h[i * S + e] -= 1.4; }
      for (const cy of [10, half - 10, half + 10, S - 10]) for (const cx of [10, 40, 88, 118, half + 10, half + 40, half + 88, S - 10]) {
        for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const d = Math.hypot(x, y); if (d < 4) h[((cy + y + S) % S) * S + ((cx + x + S) % S)] += Math.cos((d / 4) * Math.PI / 2) * 1.6; }
      }
    });
    PBR.metalN = toNormalTex(h, S, 1.2);
    const r = rng(9);
    const rough = fbm(S, 41);
    for (let i = 0; i < 70; i++) {
      let x = r() * S, y = r() * S; const a = r() * Math.PI, len = 10 + r() * 40;
      for (let t = 0; t < len; t++) { x += Math.cos(a); y += Math.sin(a); rough[(((y | 0) + S) % S) * S + (((x | 0) + S) % S)] *= 0.35; }
    }
    PBR.metalR = toGreyTex(rough, S, 0.3, 0.75);
  }
  // plaster for upper walls
  PBR.plasterN = toNormalTex(fbm(S, 51, [[16, 0.3], [64, 0.2]]), S, 1.0);
  // rubber belt ribs
  {
    const n = fbm(S, 61, [[32, 0.15]]);
    const h = heightCanvas(S, (h) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = n[y * S + x] + (y % 16 < 4 ? -1.2 : 0); });
    PBR.rubberN = toNormalTex(h, S, 1.4);
  }
  // fabric weave for overalls
  {
    const h = heightCanvas(S, (h) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = Math.sin(x * 0.8) * Math.sin(y * 0.8 + (Math.floor(x / 4) % 2) * 1.5) * 0.5; });
    PBR.fabricN = toNormalTex(h, S, 1.0);
  }
  // wood grain
  {
    const n = fbm(S, 71, [[3, 1], [12, 0.3]]);
    const h = heightCanvas(S, (h) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = Math.sin(y * 0.35 + n[y * S + x] * 14) * 0.4; });
    PBR.woodN = toNormalTex(h, S, 1.2);
  }
  // generic micro-scratch for plastic / paint
  PBR.paintN = toNormalTex(fbm(S, 81, [[24, 0.12], [96, 0.08]]), S, 1.0);
  return PBR;
}

const pbrCache = new Map();
// Material with procedural normal/roughness detail; repeat in texture tiles.
export function pmat(color, kind, rx = 1, ry = 1, o = {}) {
  const key = `${color}|${kind}|${rx.toFixed(1)}|${ry.toFixed(1)}|${JSON.stringify(o)}`;
  if (pbrCache.has(key)) return pbrCache.get(key);
  const P = pbr();
  const maps = {
    concrete: [P.concreteN, P.concreteR, 0.55], metal: [P.metalN, P.metalR, 0.6], plaster: [P.plasterN, null, 0.5],
    rubber: [P.rubberN, null, 0.7], fabric: [P.fabricN, null, 0.6], wood: [P.woodN, null, 0.8], paint: [P.paintN, null, 0.5],
  }[kind];
  const m = new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? (kind === 'metal' ? 1 : 0.62), metalness: o.metal ?? (kind === 'metal' ? 0.25 : 0.03),
    emissive: o.emissive ?? '#000', emissiveIntensity: o.ei ?? 1, map: o.map ?? null,
  });
  const rep = (t) => { if (!t) return null; const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); return c; };
  m.normalMap = rep(maps[0]);
  m.normalScale.set(maps[2] * (o.ns ?? 1), maps[2] * (o.ns ?? 1));
  if (maps[1]) m.roughnessMap = rep(maps[1]);
  if (m.map) { m.map = m.map.clone(); m.map.needsUpdate = true; m.map.repeat.set(rx, ry); m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; }
  pbrCache.set(key, m);
  return m;
}
