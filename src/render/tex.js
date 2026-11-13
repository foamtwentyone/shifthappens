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
  matCache.set(key, m);
  return m;
}
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
  const [c, g] = canvas(256, 256);
  g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 14, seed);
  // soft blotches
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(0,0,0,${0.018 + (i % 3) * 0.008})`;
    g.beginPath(); g.ellipse((i * 97) % 256, (i * 57) % 256, 20 + (i * 13) % 40, 12 + (i * 7) % 30, i, 0, Math.PI * 2); g.fill();
  }
  // tile seams
  g.strokeStyle = 'rgba(30,40,45,0.28)'; g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 253);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
  g.strokeRect(4, 4, 248, 248);
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
