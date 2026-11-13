// Characters ("Shifties") and cargo. All procedural, built from rounded
// primitives with an inverted-hull ink outline for that toy-like read.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PAL, mat, pmat, pbr, uniqueMat, inkMat, faceTex, labelTex } from './tex.js';
import { BAYS } from '../../shared/constants.js';
import { assets } from './assets.js';

const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const rbox = (w, h, d, r = 0.08, s = 3) => geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, s, r));
const sphere = (r, w = 20, h = 14) => geo(`s${r},${w}`, () => new THREE.SphereGeometry(r, w, h));
const capsule = (r, l) => geo(`c${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 12));
const cyl = (rt, rb, h, s = 20) => geo(`y${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const cone = (r, h, s = 20) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const torus = (r, t) => geo(`t${r},${t}`, () => new THREE.TorusGeometry(r, t, 10, 24));

export function M(g, m, x = 0, y = 0, z = 0, o = {}) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = o.shadow ?? true;
  mesh.receiveShadow = o.receive ?? false;
  if (o.rx) mesh.rotation.x = o.rx;
  if (o.ry) mesh.rotation.y = o.ry;
  if (o.rz) mesh.rotation.z = o.rz;
  if (o.s) mesh.scale.setScalar(o.s);
  return mesh;
}

export function outline(mesh, t = 0.035) {
  mesh.geometry.computeBoundingSphere();
  const r = mesh.geometry.boundingSphere.radius || 0.5;
  const o = new THREE.Mesh(mesh.geometry, inkMat);
  o.scale.setScalar(1 + t / r);
  o.castShadow = false;
  o.userData.outline = true;
  mesh.add(o);
  return mesh;
}

const SKIN = ['#f5c9a6', '#e0a47e', '#c98a5e', '#9a6142', '#6e432b', '#f2d0b6'];
const faceCache = {};
function faceMat(kind) {
  if (!faceCache[kind]) faceCache[kind] = new THREE.MeshStandardMaterial({ map: faceTex(kind), transparent: true, alphaTest: 0.3, roughness: 0.6 });
  return faceCache[kind];
}

// ─────────────────────────────── hats ───────────────────────────────
function buildHat(kind, color) {
  const g = new THREE.Group();
  if (kind === 'hardhat') {
    const dome = M(new THREE.SphereGeometry(0.31, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(PAL.yellow, { rough: 0.35 }), 0, 0.02, 0);
    outline(dome, 0.03);
    g.add(dome, M(cyl(0.4, 0.4, 0.04, 24), mat(PAL.yellow, { rough: 0.35 }), 0, 0.03, 0.05));
    g.add(M(rbox(0.06, 0.12, 0.42, 0.02), mat(PAL.yellow2), 0, 0.27, 0));
  } else if (kind === 'beanie') {
    const b = M(new THREE.SphereGeometry(0.315, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { rough: 0.9 }), 0, 0.02, 0);
    outline(b, 0.03);
    g.add(b, M(torus(0.29, 0.06), mat(color, { rough: 0.9 }), 0, 0.04, 0, { rx: Math.PI / 2 }));
    g.add(M(sphere(0.09, 10, 8), mat(PAL.paper, { rough: 1 }), 0, 0.34, 0));
  } else if (kind === 'cap') {
    const d = M(new THREE.SphereGeometry(0.31, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(PAL.red), 0, 0.03, 0);
    outline(d, 0.03);
    g.add(d, M(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20, 1, false, -Math.PI / 2, Math.PI), mat(PAL.red), 0, 0.04, 0.22));
    g.add(M(sphere(0.04), mat(PAL.paper), 0, 0.33, 0));
  } else if (kind === 'cone') {
    const c = M(cone(0.24, 0.6), mat(PAL.orange, { rough: 0.4 }), 0, 0.3, 0);
    outline(c, 0.03);
    g.add(c, M(cyl(0.155, 0.19, 0.1), mat('#ffffff', { rough: 0.4 }), 0, 0.27, 0));
    g.add(M(rbox(0.56, 0.06, 0.56, 0.02), mat(PAL.orange), 0, 0.0, 0));
  } else if (kind === 'paper') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.34, 0); shape.lineTo(0, 0.36); shape.lineTo(0.34, 0); shape.lineTo(-0.34, 0);
    const pg = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
    pg.translate(0, 0, -0.09);
    const h = M(pg, mat('#f7f3ea', { rough: 0.95, side: THREE.DoubleSide }), 0, 0.12, 0, { ry: Math.PI / 2 });
    g.add(h);
    g.add(M(rbox(0.04, 0.12, 0.2, 0.01), mat(PAL.red), 0, 0.2, 0.0));
  } else if (kind === 'welder') {
    const m = M(rbox(0.46, 0.34, 0.12, 0.05), mat('#3a4248', { rough: 0.5 }), 0, 0.18, 0.18, { rx: -1.1 });
    outline(m, 0.03);
    g.add(m, M(rbox(0.26, 0.08, 0.04, 0.02), mat('#1d4f4a', { emissive: '#0b5c50', ei: 0.4 }), 0, 0.27, 0.27, { rx: -1.1 }));
    g.add(M(torus(0.3, 0.035), mat('#3a4248'), 0, 0.05, 0, { rx: Math.PI / 2 }));
  } else {
    // hair tuft
    g.add(M(sphere(0.12, 10, 8), mat('#3d2a1e', { rough: 0.9 }), 0.05, 0.24, 0.05, { s: 1 }));
    g.add(M(sphere(0.09, 10, 8), mat('#3d2a1e', { rough: 0.9 }), -0.08, 0.22, 0.12));
  }
  return g;
}

// ─────────────────────────────── worker ───────────────────────────────
function buildProcWorker(outfit, seed = 0) {
  const color = outfit?.color ?? PAL.orange;
  const root = new THREE.Group();
  const overall = uniqueMat(color, { rough: 0.8 });
  const overallDark = uniqueMat(new THREE.Color(color).multiplyScalar(0.72).getStyle(), { rough: 0.85 });
  for (const m of [overall, overallDark]) { m.normalMap = pbr().fabricN; m.normalScale.set(0.6, 0.6); }
  const shirt = mat(PAL.paper, { rough: 0.85 });
  const glove = mat(PAL.yellow, { rough: 0.6 });
  const boot = mat('#3a2a22', { rough: 0.7 });
  const skin = mat(SKIN[seed % SKIN.length], { rough: 0.7 });

  const body = new THREE.Group();
  body.position.y = 0.3;
  root.add(body);

  const torso = M(rbox(0.66, 0.52, 0.5, 0.2, 4), overall, 0, 0.24, 0);
  outline(torso, 0.04);
  body.add(torso);
  // shirt shoulders peeking out
  body.add(M(rbox(0.6, 0.18, 0.44, 0.08), shirt, 0, 0.48, -0.01));
  // bib + pocket + buttons
  body.add(M(rbox(0.36, 0.26, 0.06, 0.04), overallDark, 0, 0.34, 0.24));
  body.add(M(rbox(0.14, 0.1, 0.03, 0.02), overall, 0.05, 0.36, 0.275));
  body.add(M(sphere(0.035, 8, 6), glove, -0.14, 0.44, 0.27));
  body.add(M(sphere(0.035, 8, 6), glove, 0.14, 0.44, 0.27));
  // straps
  body.add(M(rbox(0.08, 0.2, 0.5, 0.03), overall, -0.15, 0.5, 0));
  body.add(M(rbox(0.08, 0.2, 0.5, 0.03), overall, 0.15, 0.5, 0));
  // name badge
  const badge = M(rbox(0.12, 0.07, 0.02, 0.01), mat('#ffffff'), -0.18, 0.27, 0.255);
  body.add(badge);

  // head
  const head = new THREE.Group();
  head.position.y = 0.82;
  body.add(head);
  const skull = M(sphere(0.3, 24, 18), skin, 0, 0, 0);
  outline(skull, 0.035);
  head.add(skull);
  const face = M(new THREE.SphereGeometry(0.303, 24, 12, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.6, 1.2), faceMat(outfit?.face ?? 'happy'), 0, 0, 0, { shadow: false });
  face.rotation.y = 0;
  head.add(face);
  head.add(M(sphere(0.06, 10, 8), mat(new THREE.Color(SKIN[seed % SKIN.length]).multiplyScalar(0.88).getStyle()), 0, -0.03, 0.3));
  // ears
  head.add(M(sphere(0.07, 10, 8), skin, -0.29, 0, 0));
  head.add(M(sphere(0.07, 10, 8), skin, 0.29, 0, 0));
  const hat = buildHat(outfit?.hat ?? 'hardhat', color);
  hat.position.y = 0.1;
  head.add(hat);

  const mkArm = (side) => {
    const a = new THREE.Group();
    a.position.set(side * 0.36, 0.44, 0);
    const sleeve = M(capsule(0.09, 0.16), shirt, 0, -0.14, 0);
    outline(sleeve, 0.025);
    a.add(sleeve);
    const hand = M(sphere(0.1, 12, 10), glove, 0, -0.3, 0);
    outline(hand, 0.025);
    a.add(hand);
    a.rotation.z = side * 0.25;
    body.add(a);
    return a;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const mkLeg = (side) => {
    const l = new THREE.Group();
    l.position.set(side * 0.15, 0.32, 0);
    l.add(M(capsule(0.1, 0.12), overallDark, 0, -0.14, 0));
    const b = M(rbox(0.18, 0.12, 0.26, 0.05), boot, 0, -0.26, 0.04);
    outline(b, 0.02);
    l.add(b);
    root.add(l);
    return l;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // blob shadow helps read height while jumping
  const blob = new THREE.Mesh(geo('blob', () => new THREE.CircleGeometry(0.45, 20)), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  blob.renderOrder = 1;

  root.userData = {
    body, head, armL, armR, legL, legR, torso, blob, hat,
    phase: Math.random() * 10, squash: 1, squashV: 0, flop: 0, flopV: 0, wasGrounded: true, blink: 2,
    outfitKey: JSON.stringify(outfit), lean: 0, flail: 0,
  };
  root.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = true; });
  return root;
}

// st: { speed, grounded, vy, state, carrying, carryingPlayer, using, anim, belt }
function animateProcWorker(model, st, dt, t) {
  const u = model.userData;
  const { body, head, armL, armR, legL, legR } = u;
  const down = st.state === 1, carried = st.state === 2;
  const sp = Math.min(st.speed, 8);
  const moving = sp > 0.4 && st.grounded && !down && !carried;
  u.phase += dt * (moving ? 3.2 + sp * 1.55 : 0);
  const ph = u.phase;
  const amp = moving ? Math.min(1, sp / 4.3) * (sp > 5.5 ? 1.25 : 0.9) : 0;

  // landing squash
  if (st.grounded && !u.wasGrounded && st.prevVy < -4) { u.squashV -= Math.min(6, -st.prevVy * 0.7); }
  u.wasGrounded = st.grounded;
  u.squashV += (1 - u.squash) * 180 * dt;
  u.squashV *= Math.exp(-11 * dt);
  u.squash += u.squashV * dt;
  const airStretch = !st.grounded && !down && !carried ? Math.min(0.12, Math.abs(st.vy) * 0.015) : 0;
  const sq = u.squash + airStretch;
  body.scale.set(1 / Math.sqrt(Math.max(0.5, sq)), sq, 1 / Math.sqrt(Math.max(0.5, sq)));

  // flop (ragdoll) spring – overshoots for comedy
  const flopTarget = down ? -1.45 : carried ? -1.5 : 0;
  u.flopV += (flopTarget - u.flop) * 90 * dt;
  u.flopV *= Math.exp(-7 * dt);
  u.flop += u.flopV * dt;
  body.rotation.x = u.flop + (moving ? 0.06 + (sp > 5.5 ? 0.12 : 0) : 0) + (st.carrying ? -0.05 : 0);
  body.position.y = 0.3 + (moving ? Math.abs(Math.sin(ph)) * 0.07 * amp : Math.sin(t * 2.2) * 0.008) + (down ? -0.1 : 0);
  if (carried) body.rotation.z = Math.sin(t * 9) * 0.15;
  else body.rotation.z = moving ? Math.sin(ph) * 0.05 * amp : 0;

  // legs
  const flail = down || carried || (!st.grounded && st.vy < -6);
  if (flail) {
    legL.rotation.x = Math.sin(t * 17) * 0.7 - 0.4;
    legR.rotation.x = Math.sin(t * 17 + 2) * 0.7 - 0.4;
  } else if (!st.grounded) {
    legL.rotation.x = -0.6; legR.rotation.x = 0.35;
  } else {
    legL.rotation.x = Math.sin(ph) * 0.75 * amp;
    legR.rotation.x = -Math.sin(ph) * 0.75 * amp;
  }
  legL.position.y = legR.position.y = 0.32;
  if (down || carried) { legL.position.y = legR.position.y = 0.32 + 0.0; }
  // legs follow the body flop roughly
  legL.rotation.x += u.flop * 0.6; legR.rotation.x += u.flop * 0.6;

  // arms
  if (st.carrying || st.carryingPlayer) {
    armL.rotation.x = armR.rotation.x = -1.45 + Math.sin(ph) * 0.05;
    armL.rotation.z = -0.25; armR.rotation.z = 0.25;
  } else if (st.using || st.anim > 0) {
    const pump = Math.sin(t * 22) * 0.35;
    armL.rotation.x = -1.2 + pump; armR.rotation.x = -1.2 - pump;
    armL.rotation.z = -0.1; armR.rotation.z = 0.1;
  } else if (flail) {
    armL.rotation.x = Math.sin(t * 15) * 1.2 - 1.5; armR.rotation.x = Math.sin(t * 15 + 1.7) * 1.2 - 1.5;
    armL.rotation.z = -0.9; armR.rotation.z = 0.9;
  } else if (!st.grounded) {
    armL.rotation.x = armR.rotation.x = -2.4;
    armL.rotation.z = -0.5; armR.rotation.z = 0.5;
  } else {
    armL.rotation.x = -Math.sin(ph) * 0.8 * amp;
    armR.rotation.x = Math.sin(ph) * 0.8 * amp;
    armL.rotation.z = -0.22 - (moving ? 0 : Math.sin(t * 2.2) * 0.03);
    armR.rotation.z = 0.22 + (moving ? 0 : Math.sin(t * 2.2) * 0.03);
  }

  // head
  u.blink -= dt;
  head.rotation.x = moving ? -0.05 : Math.sin(t * 0.9) * 0.04;
  head.rotation.y = !moving && !down ? Math.sin(t * 0.5 + u.phase) * 0.25 : 0;
  head.scale.y = 1;
  if (u.blink < 0) { head.children[1].scale.y = 0.15; if (u.blink < -0.12) { u.blink = 2 + Math.random() * 3; head.children[1].scale.y = 1; } }
  if (st.belt) head.rotation.z = Math.sin(t * 6) * 0.1;
  else head.rotation.z = 0;
}

// ─────────────────────────────── cargo ───────────────────────────────
const bayBadgeCache = {};
export function bayBadge(bay) {
  if (!bayBadgeCache[bay]) {
    const color = bay === '?' ? '#8b5cf6' : bay === 'X' ? '#6b7280' : BAYS[bay].color;
    const tx = labelTex(bay === '?' ? '?' : bay === 'X' ? '✕' : bay, { w: 128, h: 128, bg: color, fg: '#fff', size: 80, radius: 64, bw: 10 });
    bayBadgeCache[bay] = new THREE.SpriteMaterial({ map: tx, depthTest: true, transparent: true });
  }
  return bayBadgeCache[bay];
}

const stenCache = {};
function sten(text, bg, fg, w = 256, h = 128, size = 48) {
  const k = text + bg + fg;
  if (!stenCache[k]) stenCache[k] = new THREE.MeshStandardMaterial({ map: labelTex(text, { w, h, bg, fg, size, radius: 10, bw: 6 }), roughness: 0.6 });
  return stenCache[k];
}

export function buildCargo(type) {
  const g = new THREE.Group();
  let badgeY = 0.9;
  switch (type) {
    case 'crate': {
      const b = M(rbox(1.05, 1.05, 1.05, 0.08), pmat('#5d7480', 'metal', 1, 1, { rough: 0.8, metal: 0.5 }));
      outline(b, 0.03);
      g.add(b);
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(M(rbox(0.16, 1.09, 0.16, 0.04), mat(PAL.yellow, { rough: 0.5 }), x * 0.47, 0, z * 0.47));
      for (const y of [-0.38, 0.38]) g.add(M(rbox(1.09, 0.1, 1.09, 0.03), mat('#3f525c', { metal: 0.3, rough: 0.5 }), 0, y, 0));
      const lab = M(new THREE.PlaneGeometry(0.62, 0.31), sten('HEAVY', PAL.red, '#fff'), 0, 0, 0.531, { shadow: false });
      const lab2 = lab.clone(); lab2.position.set(0, 0, -0.531); lab2.rotation.y = Math.PI;
      g.add(lab, lab2);
      badgeY = 0.95;
      break;
    }
    case 'wobble': {
      const b = M(cyl(0.45, 0.45, 1.0, 22), mat(PAL.orange, { rough: 0.45 }));
      outline(b, 0.03);
      g.add(b);
      for (const y of [-0.32, 0.32]) g.add(M(torus(0.455, 0.04), mat('#8c3a12'), 0, y, 0, { rx: Math.PI / 2 }));
      g.add(M(cyl(0.12, 0.12, 0.06, 12), mat('#8c3a12'), 0.18, 0.52, 0));
      const w = M(new THREE.PlaneGeometry(0.5, 0.25), sten('~SLOSH~', PAL.paper, PAL.ink, 256, 128, 40), 0, 0, 0.452, { shadow: false });
      g.add(w);
      badgeY = 0.9;
      break;
    }
    case 'gnome': {
      const coat = M(cone(0.25, 0.5, 18), mat(PAL.blue, { rough: 0.25 }), 0, -0.17, 0);
      outline(coat, 0.03);
      g.add(coat);
      g.add(M(cyl(0.2, 0.22, 0.08, 18), mat('#5a3a22', { rough: 0.3 }), 0, -0.4, 0));
      const head = M(sphere(0.14, 16, 12), mat('#f6cfb0', { rough: 0.25 }), 0, 0.12, 0);
      outline(head, 0.02);
      g.add(head);
      g.add(M(cone(0.13, 0.26, 14), mat('#ffffff', { rough: 0.4 }), 0, 0.0, 0.07, { rx: Math.PI }));
      const hat = M(cone(0.15, 0.36, 16), mat(PAL.red, { rough: 0.25 }), 0, 0.33, -0.02, { rx: -0.18 });
      outline(hat, 0.02);
      g.add(hat);
      g.add(M(sphere(0.035, 8, 6), mat('#ff9a8a'), 0, 0.1, 0.14));
      badgeY = 0.75;
      break;
    }
    case 'beans': {
      const b = M(cyl(0.36, 0.36, 0.75, 22), mat(PAL.yellow, { rough: 0.35 }));
      outline(b, 0.03);
      g.add(b);
      g.add(M(cyl(0.37, 0.37, 0.06, 22), mat('#c9c9c9', { metal: 0.5, rough: 0.3 }), 0, 0.36, 0));
      g.add(M(cyl(0.37, 0.37, 0.06, 22), mat('#c9c9c9', { metal: 0.5, rough: 0.3 }), 0, -0.36, 0));
      const lab = M(new THREE.CylinderGeometry(0.365, 0.365, 0.4, 22, 1, true, -1.2, 2.4), sten('BEANS', '#7a3e1d', PAL.yellow, 256, 128, 52), 0, 0, 0, { shadow: false });
      g.add(lab);
      g.userData.heatMat = b.material = uniqueMat(PAL.yellow, { rough: 0.35, emissive: '#ff3b10', ei: 0 });
      badgeY = 0.75;
      break;
    }
    case 'balloon': {
      const b = M(rbox(0.75, 0.75, 0.75, 0.05), mat('#c79a62', { rough: 0.9 }));
      outline(b, 0.025);
      g.add(b);
      g.add(M(rbox(0.77, 0.12, 0.77, 0.02), mat('#a87b45', { rough: 0.9 }), 0, 0.0, 0));
      const cols = ['#ff7eb6', '#7ee0ff', '#ffe066'];
      cols.forEach((c, i) => {
        const a = (i / 3) * Math.PI * 2;
        const bx = Math.cos(a) * 0.2, bz = Math.sin(a) * 0.2, by = 0.95 + i * 0.08;
        const bl = M(sphere(0.24, 16, 12), mat(c, { rough: 0.2 }), bx, by, bz);
        bl.scale.y = 1.15;
        outline(bl, 0.02);
        g.add(bl);
        const str = M(cyl(0.008, 0.008, by - 0.4, 4), mat('#ffffff'), bx / 2, (by + 0.38) / 2 - 0.1, bz / 2, { shadow: false });
        str.rotation.z = -Math.atan2(bx, by) * 0.5;
        g.add(str);
      });
      badgeY = 1.55;
      break;
    }
    case 'magnet': {
      const core = M(sphere(0.4, 24, 18), mat('#3f4a52', { metal: 0.6, rough: 0.3 }));
      outline(core, 0.03);
      g.add(core);
      g.add(M(new THREE.SphereGeometry(0.405, 24, 9, 0, Math.PI * 2, 0, 0.9), mat(PAL.red, { rough: 0.35 })));
      g.add(M(new THREE.SphereGeometry(0.405, 24, 9, 0, Math.PI * 2, Math.PI - 0.9, 0.9), mat(PAL.blue, { rough: 0.35 })));
      const ring = M(torus(0.42, 0.035), uniqueMat('#7af7ff', { emissive: '#3fd8ff', ei: 0.8 }), 0, 0, 0, { rx: Math.PI / 2 });
      g.add(ring);
      g.userData.ring = ring;
      badgeY = 0.75;
      break;
    }
    case 'mystery': {
      const b = M(rbox(0.85, 0.85, 0.85, 0.07), mat(PAL.purple, { rough: 0.5 }));
      outline(b, 0.03);
      g.add(b);
      const q = sten('?', PAL.purple, PAL.yellow, 128, 128, 100);
      for (let i = 0; i < 4; i++) {
        const p = M(new THREE.PlaneGeometry(0.6, 0.6), q, Math.sin((i * Math.PI) / 2) * 0.43, 0, Math.cos((i * Math.PI) / 2) * 0.43, { shadow: false });
        p.rotation.y = (i * Math.PI) / 2;
        g.add(p);
      }
      const top = M(new THREE.PlaneGeometry(0.6, 0.6), q, 0, 0.43, 0, { rx: -Math.PI / 2, shadow: false });
      g.add(top);
      g.add(M(rbox(0.87, 0.12, 0.87, 0.03), mat(PAL.yellow), 0, 0, 0));
      badgeY = 0.85;
      break;
    }
    case 'duck': {
      const b = M(sphere(0.28, 16, 12), mat(PAL.yellow, { rough: 0.3 }), 0, -0.04, 0);
      b.scale.set(1, 0.8, 1.2);
      outline(b, 0.02);
      g.add(b);
      const h = M(sphere(0.16, 14, 10), mat(PAL.yellow, { rough: 0.3 }), 0, 0.2, 0.16);
      outline(h, 0.02);
      g.add(h);
      g.add(M(cone(0.06, 0.14, 10), mat(PAL.orange), 0, 0.18, 0.34, { rx: Math.PI / 2 }));
      g.add(M(sphere(0.03, 6, 6), mat(PAL.ink), 0.08, 0.26, 0.28));
      g.add(M(sphere(0.03, 6, 6), mat(PAL.ink), -0.08, 0.26, 0.28));
      badgeY = 0.6;
      break;
    }
    case 'ball': {
      const b = M(sphere(0.25, 20, 14), mat(PAL.orange, { rough: 0.6 }));
      outline(b, 0.02);
      g.add(b);
      g.add(M(torus(0.252, 0.012), mat(PAL.ink)));
      g.add(M(torus(0.252, 0.012), mat(PAL.ink), 0, 0, 0, { ry: Math.PI / 2 }));
      badgeY = -10;
      break;
    }
    case 'soda': {
      const b = M(cyl(0.12, 0.12, 0.3, 14), mat(PAL.red, { rough: 0.3, metal: 0.3 }));
      g.add(b);
      g.add(M(cyl(0.1, 0.12, 0.04, 14), mat('#c9c9c9', { metal: 0.6 }), 0, 0.16, 0));
      badgeY = -10;
      break;
    }
  }
  g.userData.badgeY = badgeY;
  g.userData.type = type;
  return g;
}


// ─────────────────────────────── Kenney skinned workers ───────────────────────────────
const CHAR_SCALE = 1.9;
const ARM = /^arm-/;
const clipCache = new Map();
function variant(clip, kind) {
  const key = clip.uuid + kind;
  if (!clipCache.has(key)) {
    const tracks = clip.tracks.filter((t) => (kind === 'arms' ? ARM.test(t.name) : !ARM.test(t.name)));
    clipCache.set(key, new THREE.AnimationClip(`${clip.name}-${kind}`, clip.duration, tracks));
  }
  return clipCache.get(key);
}

function hatFor(kind) {
  if (kind === 'hardhat') return assets.prop('prototype/hat-hard', 0.95);
  if (kind === 'cap') return assets.prop('prototype/hat-cap', 0.95);
  if (kind === 'cone') {
    const g = new THREE.Group();
    const c = M(cone(0.13, 0.32, 16), mat(PAL.orange, { rough: 0.4 }), 0, 0.16, 0);
    g.add(c, M(cyl(0.085, 0.105, 0.05), mat('#ffffff'), 0, 0.15, 0), M(rbox(0.3, 0.03, 0.3, 0.01), mat(PAL.orange), 0, 0.01, 0));
    return g;
  }
  return null;
}

export function buildWorker(outfit, seed = 0) {
  const ch = assets.ready ? assets.character(outfit?.model ?? 'worker') : null;
  if (!ch) return buildProcWorker(outfit, seed);
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  ch.scene.scale.setScalar(CHAR_SCALE);
  inner.add(ch.scene);
  const head = ch.scene.getObjectByName('head');
  const hat = hatFor(outfit?.hat);
  if (head && hat) { hat.position.set(0, 0.13, 0.0); head.add(hat); }
  // team colour ring on the floor: instantly tells couch players apart
  const ring = new THREE.Mesh(geo('ring', () => new THREE.RingGeometry(0.42, 0.52, 32)), new THREE.MeshBasicMaterial({ color: outfit?.color ?? PAL.orange, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  ring.renderOrder = 2;
  const blob = new THREE.Mesh(geo('blob', () => new THREE.CircleGeometry(0.45, 20)), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  blob.renderOrder = 1;
  blob.add(ring);
  ring.rotation.x = 0; ring.position.set(0, 0, 0.003);
  const mixer = new THREE.AnimationMixer(ch.scene);
  const clips = Object.fromEntries(ch.clips.map((c) => [c.name, c]));
  const act = (name, kind = 'full') => {
    const c = clips[name];
    if (!c) return null;
    return mixer.clipAction(kind === 'full' ? c : variant(c, kind));
  };
  const A = {
    idle: act('idle'), walk: act('walk'), sprint: act('sprint'), jump: act('jump'), fall: act('fall'), die: act('die'),
    idleL: act('idle', 'legs'), walkL: act('walk', 'legs'), sprintL: act('sprint', 'legs'),
    hold: act('holding-both', 'arms'), use: act('interact-right', 'arms'), cheer: act('emote-yes'),
  };
  for (const k of ['jump', 'die']) if (A[k]) { A[k].setLoop(THREE.LoopOnce); A[k].clampWhenFinished = true; }
  root.userData = { kenney: true, inner, mixer, A, base: null, arms: null, blob, ring, squash: 1, squashV: 0, wasGrounded: true, hat };
  return root;
}

function crossfade(u, slot, action, fade = 0.15) {
  if (u[slot] === action) return;
  if (u[slot]) u[slot].fadeOut(fade);
  if (action) action.reset().setEffectiveWeight(1).fadeIn(fade).play();
  u[slot] = action;
}

export function animateWorker(model, st, dt, t) {
  const u = model.userData;
  if (!u.kenney) return animateProcWorker(model, st, dt, t);
  const A = u.A;
  const down = st.state === 1, carried = st.state === 2 || st.state === 3;
  const sp = st.speed || 0;
  const busyArms = (st.carrying || st.carryingPlayer) ? A.hold : (st.using || st.anim > 0) ? A.use : null;
  let base;
  if (down) base = A.die;
  else if (carried) base = A.fall;
  else if (!st.grounded) base = st.vy > 0.5 ? A.jump : A.fall;
  else if (sp > 0.4) base = sp > 5.3 ? (busyArms ? A.sprintL : A.sprint) : (busyArms ? A.walkL : A.walk);
  else base = busyArms ? A.idleL : A.idle;
  crossfade(u, 'base', base, down ? 0.08 : 0.15);
  crossfade(u, 'arms', down || carried ? null : busyArms, 0.12);
  if (base === A.walk || base === A.walkL) base.timeScale = Math.max(0.6, sp / 3.0);
  if (base === A.sprint || base === A.sprintL) base.timeScale = Math.max(0.8, sp / 5.5);
  // cartoon squash on landing
  if (st.grounded && !u.wasGrounded && (st.prevVy ?? 0) < -4) u.squashV -= Math.min(5, -(st.prevVy ?? 0) * 0.6);
  u.wasGrounded = st.grounded;
  u.squashV += (1 - u.squash) * 170 * dt;
  u.squashV *= Math.exp(-11 * dt);
  u.squash += u.squashV * dt;
  const sq = Math.max(0.6, u.squash);
  u.inner.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  u.inner.rotation.z = carried ? Math.sin(t * 9) * 0.25 : 0;
  u.mixer.update(dt);
}
