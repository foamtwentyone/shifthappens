// Builds PLANT 7's environment + animated machine visuals, and keeps them in
// sync with the plant snapshot. Only visuals live here: the truth is the sim.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  ZONES, WALLS, CONVEYORS, SORTER, SCANNER, DISPENSER, TUBE, LIFT, FAN, MAGNET, HEATPAD, INCINERATOR,
  BOILER, DOORS, PADS, SPOTS, SKY_DOCK, BOUNDS,
} from '../../shared/level.js';
import { BAYS, RIDERS } from '../../shared/constants.js';
import { PAL, mat, pmat, pbr, uniqueMat, floorTex, hazardTex, beltTex, labelTex, stencilTex, gaugeTex, screenTex } from './tex.js';
import { M, outline } from './models.js';
import { dressPlant, animateDressing } from './dressing.js';

const rb = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (a, b, h, s = 18) => new THREE.CylinderGeometry(a, b, h, s);

function plane(w, h, material, x, y, z, rx = -Math.PI / 2, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0, 'YXZ');
  m.receiveShadow = true;
  return m;
}

function sign(text, w, h, o = {}) {
  const tex = labelTex(text, { w: Math.round(256 * (w / h)), h: 256, size: o.size ?? 120, bg: o.bg, fg: o.fg, hazard: o.hazard, radius: 30, bw: 14 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  return m;
}

export class LevelView {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.t = 0;
    this.belts = {};
    this.levers = {};
    this.lamps = [];
    this.buildGround();
    this.buildWalls();
    this.buildFloorDetails();
    this.buildMachines();
    this.buildLobby();
    this.buildDecor();
    dressPlant(this);
  }

  add(o) { this.root.add(o); return o; }

  // ───────────────────────────── ground & walls ─────────────────────────────
  buildGround() {
    // the diorama table the plant sits on
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat('#163a41', { rough: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.04; outer.receiveShadow = true;
    this.add(outer);
    const base = M(rb(BOUNDS.maxX - BOUNDS.minX + 2.2, 1.2, 34.2, 0.3), mat('#0f2a30'), (BOUNDS.minX + BOUNDS.maxX) / 2, -0.62, -6, { receive: true });
    this.add(base);
    const ctlBase = M(rb(19.2, 1.2, 13, 0.3), mat('#0f2a30'), -5, -0.62, -16.2, { receive: true });
    this.add(ctlBase);
    for (const z of ZONES) {
      const w = z.x1 - z.x0, d = z.z1 - z.z0;
      const tex = floorTex(z.floor, z.id.length * 7);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const f = plane(w, d, pmat('#ffffff', 'concrete', w / 4, d / 4, { map: tex, rough: 1 }), (z.x0 + z.x1) / 2, 0.001, (z.z0 + z.z1) / 2);
      this.add(f);
    }
    // gap fills between zone floors (under walls)
    this.add(plane(76.5, 20.5, mat('#9fa8a6', { rough: 0.9 }), -8, -0.002, 0));
    this.add(plane(18.5, 12.5, mat('#9fa8a6', { rough: 0.9 }), -5, -0.002, -16));
  }

  buildWalls() {
    const upper = mat('#ece4d0', { rough: 0.85 });
    const lower = mat(PAL.teal, { rough: 0.7 });
    const trim = mat('#23303a', { rough: 0.6 });
    const hz = hazardTex();
    for (const w of WALLS) {
      const g = new THREE.Group();
      g.position.set(w.x, 0, w.z);
      if (w.style === 'rail') {
        const tex = hz.clone(); tex.needsUpdate = true;
        tex.repeat.set(Math.max(w.w, w.d) / 2.2, 1);
        const m = M(box(w.w, w.vh, w.d), [mat(PAL.ink), mat(PAL.ink), mat(PAL.ink), mat(PAL.ink),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })], 0, w.vh / 2, 0, { receive: true });
        g.add(m);
        g.add(M(box(w.w + 0.1, 0.12, w.d + 0.1), trim, 0, w.vh + 0.06, 0));
      } else {
        const len = Math.max(w.w, w.d);
        const upper = pmat('#ece4d0', 'plaster', len / 3, Math.max(1, (w.vh - 1.1) / 3), { rough: 0.9 });
        const lower = pmat(PAL.teal, 'metal', len / 2.5, 0.5, { rough: 0.9 });
        const band = Math.min(1.1, w.vh);
        g.add(M(box(w.w, band, w.d), lower, 0, band / 2, 0, { receive: true }));
        if (w.vh > band) g.add(M(box(w.w, w.vh - band, w.d), upper, 0, band + (w.vh - band) / 2, 0, { receive: true }));
        g.add(M(box(w.w + 0.08, 0.14, w.d + 0.08), trim, 0, w.vh + 0.07, 0));
        g.add(M(box(w.w + 0.04, 0.08, w.d + 0.04), mat(PAL.yellow), 0, band, 0));
        if (w.style === 'block') g.add(M(box(w.w - 0.2, 0.05, w.d - 0.2), mat('#33434b'), 0, w.vh + 0.15, 0));
      }
      this.add(g);
    }
    // sky dock platform
    const s = SKY_DOCK;
    const sd = new THREE.Group();
    sd.add(M(box(s.x1 - s.x0, s.top, s.z1 - s.z0), pmat('#7f8f96', 'metal', 4, 1), 0, s.top / 2, 0, { receive: true }));
    const topTex = floorTex('#c7b78f', 9); topTex.wrapS = topTex.wrapT = THREE.RepeatWrapping; topTex.repeat.set(5, 2.5);
    sd.add(plane(s.x1 - s.x0, s.z1 - s.z0, pmat('#ffffff', 'concrete', 2.75, 1.25, { map: topTex, rough: 1 }), 0, s.top + 0.005, 0));
    const edge = hz.clone(); edge.needsUpdate = true; edge.repeat.set(10, 1);
    sd.add(plane(s.x1 - s.x0, 0.4, new THREE.MeshStandardMaterial({ map: edge }), 0, s.top + 0.01, (s.z1 - s.z0) / 2 - 0.2));
    // struts on the face
    for (let x = s.x0 + 1; x < s.x1; x += 2.5) sd.add(M(box(0.25, s.top, 0.15), mat(PAL.teal), x - (s.x0 + s.x1) / 2, s.top / 2, (s.z1 - s.z0) / 2 + 0.05));
    // railing on the east end
    for (let z = s.z0 + 0.4; z < s.z1; z += 1.1) sd.add(M(cyl(0.05, 0.05, 1.0, 8), mat(PAL.yellow), (s.x1 - s.x0) / 2 - 0.4, s.top + 0.5, z - (s.z0 + s.z1) / 2));
    sd.position.set((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2);
    this.add(sd);
    const skySign = sign('SKY DOCK', 3.6, 0.9, { bg: PAL.yellow });
    skySign.position.set(25, 2.0, -4.89);
    this.add(skySign);
  }

  buildStructure() {
    // steel pilasters with bolt plates along the tall walls, plus a kick-plate trim
    const col = pmat('#2c4a52', 'metal', 0.5, 2, { rough: 0.8, metal: 0.4 });
    const bolt = mat('#9aa6aa', { metal: 0.6, rough: 0.35 });
    for (const w of WALLS) {
      if (w.style !== 'wall' || w.vh < 3) continue;
      const alongX = w.w > w.d;
      const len = alongX ? w.w : w.d;
      const n = Math.floor(len / 6);
      for (let i = 1; i <= n; i++) {
        const t = -len / 2 + (i * len) / (n + 1);
        const x = alongX ? w.x + t : w.x;
        const z = alongX ? w.z : w.z + t;
        const pil = M(rb(alongX ? 0.45 : 0.75, w.vh, alongX ? 0.75 : 0.45, 0.06), col, x, w.vh / 2, z, { receive: true });
        this.add(pil);
        for (const y of [0.35, w.vh - 0.35]) this.add(M(box(alongX ? 0.55 : 0.8, 0.14, alongX ? 0.8 : 0.55), bolt, x, y, z));
      }
    }
  }

  buildWalkways() {
    // painted pedestrian lanes with stencilled arrows
    const lane = mat('#ffd447', { rough: 0.7, pbr: false });
    const line = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.12), lane);
      m.rotation.set(-Math.PI / 2, 0, -Math.atan2(z1 - z0, x1 - x0));
      m.position.set((x0 + x1) / 2, 0.008, (z0 + z1) / 2);
      m.receiveShadow = true;
      this.add(m);
    };
    for (const z of [3.4, 5.6]) line(-31, z, -15, z);
    for (const z of [3.4, 5.6]) line(-13, z, 3, z);
    for (const z of [7.2, 9.0]) line(11, z, 15.5, z);
    line(-12.6, -9.5, -12.6, -4); line(-8.4, -9.5, -8.4, -4);
    // floor drains
    const grate = mat('#2b3036', { rough: 0.5, metal: 0.4 });
    for (const [x, z] of [[-20, 6.5], [-2, 4.5], [14, 3.5], [27, 7.5], [-8, -16]]) {
      this.add(M(box(0.9, 0.02, 0.9), grate, x, 0.01, z, { receive: true }));
      for (let i = -3; i <= 3; i++) this.add(M(box(0.06, 0.03, 0.8), mat('#4a545a', { metal: 0.5 }), x + i * 0.11, 0.02, z));
    }
  }

  buildFloorDetails() {
    this.buildStructure();
    this.buildWalkways();
    // room name stencils
    const st = (text, x, z, w = 9, rot = 0) => {
      const m = plane(w, w / 4, new THREE.MeshBasicMaterial({ map: stencilTex(text), transparent: true, depthWrite: false }), x, 0.012, z, -Math.PI / 2, rot);
      m.receiveShadow = false;
      this.add(m);
    };
    st('BREAK ROOM', -39, -2.6, 8);
    st('INTAKE', -23, 6.4, 8);
    st('SORTING', -5, 7, 8);
    st('CONTROL', -5, -13, 7);
    st('SHIPPING', 16.5, 8.2, 8);
    // hazard strips along belts
    const strip = hazardTex(PAL.yellow, PAL.ink, 10);
    for (const b of CONVEYORS) {
      const horiz = b.dir[0] !== 0;
      const len = horiz ? b.x1 - b.x0 : b.z1 - b.z0;
      for (const side of [-1, 1]) {
        const t = strip.clone(); t.needsUpdate = true; t.repeat.set(len / 2, 1);
        const m = horiz
          ? plane(len, 0.22, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), (b.x0 + b.x1) / 2, 0.006, (side < 0 ? b.z0 : b.z1) + side * 0.2)
          : plane(len, 0.22, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), (side < 0 ? b.x0 : b.x1) + side * 0.2, 0.006, (b.z0 + b.z1) / 2, -Math.PI / 2, Math.PI / 2);
        this.add(m);
      }
    }
    // airlock threshold
    for (const x of [DOORS.inner.x, DOORS.outer.x]) {
      const t = strip.clone(); t.needsUpdate = true; t.repeat.set(3, 1);
      this.add(plane(6, 0.8, new THREE.MeshStandardMaterial({ map: t }), x, 0.007, 0, -Math.PI / 2, Math.PI / 2));
    }
    // walking path dots in the dock
    const lift = strip.clone(); lift.needsUpdate = true; lift.repeat.set(2, 1);
    this.add(plane(3.4, 0.35, new THREE.MeshStandardMaterial({ map: lift }), (LIFT.x0 + LIFT.x1) / 2, 0.006, LIFT.z1 + 0.25));
  }

  // ───────────────────────────── machine helpers ─────────────────────────────
  lever(id, at, o = {}) {
    const g = new THREE.Group();
    g.position.set(at[0], 0, at[2] + (o.dz ?? 0));
    if (o.ry) g.rotation.y = o.ry;
    if (!o.wall) {
      g.add(M(rb(0.5, 0.9, 0.4, 0.08), mat(o.base ?? PAL.teal), 0, 0.45, 0));
      g.add(M(rb(0.56, 0.1, 0.46, 0.04), mat(PAL.ink), 0, 0.92, 0));
    } else {
      g.add(M(rb(0.6, 0.7, 0.18, 0.06), mat(o.base ?? PAL.steel2), 0, at[1], 0));
    }
    const pivot = new THREE.Group();
    pivot.position.y = o.wall ? at[1] : 0.97;
    pivot.position.z = o.wall ? 0.1 : 0;
    const arm = M(cyl(0.04, 0.04, 0.55, 8), mat('#cfd6d8', { metal: 0.5, rough: 0.3 }), 0, 0.27, 0);
    const knob = M(new THREE.SphereGeometry(0.1, 14, 10), mat(o.knob ?? PAL.red, { rough: 0.3 }), 0, 0.56, 0);
    outline(knob, 0.02);
    pivot.add(arm, knob);
    g.add(pivot);
    if (o.label) {
      const s = sign(o.label, o.lw ?? 1.1, 0.28, { bg: o.lbg ?? PAL.paper, size: 110 });
      s.position.set(0, o.wall ? at[1] - 0.48 : 0.62, o.wall ? 0.1 : 0.205);
      g.add(s);
    }
    const lamp = M(new THREE.SphereGeometry(0.07, 10, 8), uniqueMat('#333', { emissive: '#000' }), 0.18, o.wall ? at[1] + 0.25 : 0.98, o.wall ? 0.1 : 0.12);
    g.add(lamp);
    this.add(g);
    this.levers[id] = { pivot, lamp, cur: 0 };
    return g;
  }

  setLever(id, on, dt, lampColor) {
    const l = this.levers[id];
    if (!l) return;
    const target = on ? 0.65 : -0.65;
    l.cur += (target - l.cur) * Math.min(1, dt * 14);
    l.pivot.rotation.x = l.cur;
    const c = lampColor ?? (on ? '#49c46b' : '#e8423f');
    if (l.lampCol !== c) { l.lamp.material.color.set(c); l.lamp.material.emissive.set(c); l.lamp.material.emissiveIntensity = 2.5; l.lampCol = c; }
  }

  button(at, color = PAL.red, o = {}) {
    const g = new THREE.Group();
    g.position.set(at[0], 0, at[2]);
    g.add(M(rb(0.55, 0.95, 0.5, 0.08), mat(o.base ?? PAL.yellow), 0, 0.475, 0));
    g.add(M(cyl(0.22, 0.24, 0.08, 20), mat(PAL.ink), 0, 0.99, 0));
    const cap = M(new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), uniqueMat(color, { rough: 0.3 }), 0, 1.02, 0);
    cap.scale.y = 0.7;
    outline(cap, 0.02);
    g.add(cap);
    if (o.label) {
      const s = sign(o.label, o.lw ?? 0.9, 0.26, { bg: PAL.paper, size: 110 });
      s.position.set(0, 0.62, 0.255);
      g.add(s);
    }
    if (o.ry) g.rotation.y = o.ry;
    this.add(g);
    return { g, cap };
  }

  // ───────────────────────────── machines ─────────────────────────────
  buildMachines() {
    // ── conveyors ──
    const frameM = mat(PAL.teal, { rough: 0.55 });
    const railM = mat(PAL.yellow, { rough: 0.5 });
    const legM = mat('#3d4a50', { rough: 0.6 });
    for (const b of CONVEYORS) {
      const horiz = b.dir[0] !== 0;
      const len = horiz ? b.x1 - b.x0 : b.z1 - b.z0;
      const width = horiz ? b.z1 - b.z0 : b.x1 - b.x0;
      const g = new THREE.Group();
      g.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
      if (horiz) g.rotation.y = -Math.PI / 2; // local +z(-?) => align length along x
      // local frame: length along local z
      g.add(M(rb(width, b.top - 0.1, len, 0.06), pmat(PAL.teal, 'metal', 1, len / 2.5, { rough: 0.85 }), 0, (b.top - 0.1) / 2, 0, { receive: true }));
      for (const s of [-1, 1]) g.add(M(rb(0.12, 0.16, len, 0.04), railM, s * (width / 2 + 0.02), b.top + 0.02, 0));
      for (let z = -len / 2 + 0.6; z < len / 2; z += 2.2) for (const s of [-1, 1]) g.add(M(box(0.12, 0.2, 0.12), legM, s * (width / 2 - 0.15), 0.1, z));
      for (const e of [-1, 1]) g.add(M(cyl(0.16, 0.16, width - 0.02, 14), mat('#9aa6aa', { metal: 0.5, rough: 0.3 }), 0, b.top - 0.1, e * (len / 2 - 0.05), { rz: Math.PI / 2 }));
      const tex = beltTex();
      tex.repeat.set(1, len / 1.6);
      const rubN = pbr().rubberN.clone(); rubN.needsUpdate = true; rubN.repeat.set(1, len / 1.6);
      const surf = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.12, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, normalMap: rubN, normalScale: new THREE.Vector2(0.8, 0.8) }));
      surf.rotation.x = -Math.PI / 2;
      surf.position.y = b.top + 0.005;
      surf.receiveShadow = true;
      g.add(surf);
      // status lamp post at the start
      const lampPost = new THREE.Group();
      lampPost.position.set(width / 2 + 0.25, 0, -len / 2 + 0.4);
      lampPost.add(M(cyl(0.04, 0.04, 1.4, 8), legM, 0, 0.7, 0));
      const lamp = M(cyl(0.12, 0.12, 0.22, 12), uniqueMat('#333', { emissive: '#000' }), 0, 1.5, 0);
      lampPost.add(lamp);
      g.add(lampPost);
      const tag = sign(b.name, 1.2, 0.32, { bg: PAL.ink, fg: PAL.yellow, size: 120 });
      tag.position.set(width / 2 + 0.005, 0.33, -len / 2 + 1.5);
      tag.rotation.y = Math.PI / 2;
      g.add(tag);
      this.add(g);
      // forward direction in world: horiz group rotated -90°: local -z → +x? we orient texture by scroll sign
      this.belts[b.id] = { tex, rubN, len, surf, lamp, g };
    }
    // ── sorter ──
    {
      const g = new THREE.Group();
      g.position.set(SORTER.x, 0, SORTER.z);
      g.add(M(rb(SORTER.size, SORTER.top - 0.05, SORTER.size, 0.1), mat(PAL.orange), 0, (SORTER.top - 0.05) / 2, 0));
      const disc = M(cyl(0.82, 0.82, 0.06, 28), mat('#2b3036', { rough: 0.6 }), 0, SORTER.top, 0);
      g.add(disc);
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape()), uniqueMat(PAL.yellow, { emissive: PAL.yellow, ei: 0.4 }));
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.y = SORTER.top + 0.04;
      g.add(arrow);
      // sorter head + screen
      const head = new THREE.Group();
      head.position.set(0, 0, 1.15);
      head.add(M(rb(1.4, 2.0, 0.5, 0.12), mat(PAL.orange), 0, 1.0, 0));
      const scr = M(new THREE.PlaneGeometry(1.0, 0.55), new THREE.MeshBasicMaterial({ map: screenTex(['AUTO']) }), 0, 1.45, -0.26, { ry: Math.PI });
      head.add(scr);
      const scr2 = M(new THREE.PlaneGeometry(1.0, 0.55), new THREE.MeshBasicMaterial({ map: screenTex(['AUTO']) }), 0, 1.45, 0.26);
      head.add(scr2);
      const sorterSign = sign('SORTER 9000', 1.4, 0.36, { bg: PAL.yellow, size: 100 });
      sorterSign.position.set(0, 2.25, 0); head.add(sorterSign);
      const sorterSign2 = sorterSign.clone(); sorterSign2.rotation.y = Math.PI; sorterSign2.position.z = -0.001; head.add(sorterSign2);
      g.add(head);
      this.add(g);
      this.sorter = { g, arrow, scr: [scr, scr2], head, mode: null };
    }
    // ── scanner arch ──
    {
      const g = new THREE.Group();
      g.position.set(SCANNER.x, 0, SCANNER.z);
      this.scannerShell = [];
      for (const s of [-1, 1]) { const leg = M(rb(0.3, 2.4, 0.3, 0.08), mat(PAL.steel2), 0, 1.2, s * 1.15); g.add(leg); this.scannerShell.push(leg); }
      const bar = M(rb(0.5, 0.35, 2.8, 0.1), mat(PAL.blue), 0, 2.45, 0); g.add(bar); this.scannerShell.push(bar);
      const beam = M(new THREE.PlaneGeometry(2.0, 1.6), uniqueMat('#ff4040', { emissive: '#ff2020', ei: 1, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }), 0, 1.5, 0, { ry: Math.PI / 2, shadow: false });
      g.add(beam);
      const s = sign('SCAN', 1.2, 0.3, { bg: PAL.ink, fg: '#7ee0ff', size: 110 });
      s.position.set(0.26, 2.45, 0); s.rotation.y = Math.PI / 2; g.add(s);
      this.add(g);
      this.scanner = { beam };
    }
    // ── dispenser ──
    {
      const g = new THREE.Group();
      g.position.set(DISPENSER.x, 0, DISPENSER.z);
      const funnel = M(new THREE.CylinderGeometry(1.25, 0.55, 1.3, 24, 1, true), mat(PAL.orange, { side: THREE.DoubleSide }), 0, DISPENSER.y, 0);
      g.add(funnel);
      g.add(M(new THREE.TorusGeometry(1.25, 0.08, 8, 24), mat(PAL.ink), 0, DISPENSER.y + 0.65, 0, { rx: Math.PI / 2 }));
      g.add(M(cyl(0.6, 0.6, 2.8, 20), mat(PAL.steel2, { metal: 0.3 }), 0, DISPENSER.y + 2.0, 0));
      g.add(M(cyl(0.5, 0.5, 0.4, 20), mat(PAL.ink), 0, DISPENSER.y - 0.7, 0));
      g.add(M(box(0.3, 3.6, 0.3), mat(PAL.teal), -1.6, 1.8, -1.2));
      g.add(M(box(1.8, 0.25, 0.25), mat(PAL.teal), -0.8, DISPENSER.y, -1.2));
      const s = sign('INTAKE', 2.2, 0.55, { bg: PAL.yellow, hazard: false, size: 120 });
      s.position.set(0, DISPENSER.y + 1.25, 0.62); g.add(s);
      const lamp = M(new THREE.SphereGeometry(0.16, 12, 10), uniqueMat('#333', { emissive: '#000' }), 0.9, DISPENSER.y + 0.9, 0.7);
      g.add(lamp);
      this.add(g);
      this.dispenser = { g, funnel, lamp };
    }
    this.reqBtn = this.button(SPOTS.disp_request, PAL.red, { label: 'REQUEST' });
    this.lever('disp_auto', SPOTS.disp_auto, { label: 'AUTO FEED', knob: PAL.yellow });
    this.lever('belt_a', SPOTS.belt_a_lever, { label: 'BELT A DIR', knob: PAL.blue });
    this.lever('belt_b', SPOTS.belt_b_lever, { label: 'BELT B DIR', knob: PAL.blue });
    this.lever('sorter', SPOTS.sorter_lever, { label: 'SORT MODE', knob: PAL.purple, base: PAL.orange });
    for (const z of ['intake', 'sorting', 'dock']) this.estop(SPOTS[`estop_${z}`], z);

    // ── pneumatic tube ──
    {
      const glass = new THREE.MeshStandardMaterial({ color: '#bff7f2', roughness: 0.1, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
      const ringM = mat(PAL.teal, { metal: 0.2 });
      const pts = TUBE.path.map((p) => new THREE.Vector3(...p));
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = a.distanceTo(b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 20, 1, true), glass);
        m.position.copy(mid);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        m.renderOrder = 2;
        this.add(m);
        const n = Math.floor(len / 1.6);
        for (let k = 0; k <= n; k++) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.06, 6, 20), ringM);
          r.position.copy(a.clone().lerp(b, k / Math.max(1, n)));
          r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
          this.add(r);
        }
        if (i < pts.length - 2) this.add(M(new THREE.SphereGeometry(0.62, 16, 12), mat(PAL.teal), b.x, b.y, b.z));
      }
      // support pylons
      for (const x of [-1, 13, 19.5]) this.add(M(box(0.25, 5.2, 0.25), mat('#3d4a50'), x, 2.6, TUBE.path[1][2] - 0.75));
      // hopper
      const h = new THREE.Group();
      h.position.set(TUBE.mouth[0], 0, TUBE.mouth[2]);
      this.hopperShell = [
        M(new THREE.CylinderGeometry(0.95, 0.6, 0.9, 20, 1, true), mat(PAL.teal, { side: THREE.DoubleSide }), 0, 0.95, 0),
        M(new THREE.TorusGeometry(0.95, 0.07, 8, 24), mat(PAL.yellow), 0, 1.4, 0, { rx: Math.PI / 2 }),
        M(rb(1.5, 0.6, 1.5, 0.08), mat('#3d4a50'), 0, 0.3, 0),
      ];
      h.add(...this.hopperShell);
      const swirl = M(new THREE.CircleGeometry(0.62, 24), uniqueMat('#0d1a1e', { emissive: '#2aa7a2', ei: 0.3 }), 0, 0.62, 0, { rx: -Math.PI / 2, shadow: false });
      h.add(swirl);
      const s = sign('PNEUMA-TUBE', 1.8, 0.42, { bg: PAL.teal, fg: '#fff', size: 100 });
      s.position.set(0, 1.85, 0.8); h.add(s);
      this.add(h);
      this.tube = { swirl };
      // tube exit nozzle on sky dock
      const e = TUBE.path[TUBE.path.length - 1];
      this.add(M(cyl(0.7, 0.55, 0.4, 20), mat(PAL.teal), e[0], e[1] - 0.1, e[2]));
    }

    // ── airlock ──
    this.doors = {};
    const doorTex = hazardTex(PAL.yellow, PAL.ink, 6);
    for (const k of ['lobby', 'inner', 'outer']) {
      const d = DOORS[k];
      const g = new THREE.Group();
      const w = d.z1 - d.z0;
      const t = doorTex.clone(); t.needsUpdate = true; t.repeat.set(2, 1);
      const slab = M(rb(0.36, d.h, w, 0.06), [mat('#6f7d84'), mat('#6f7d84'), mat('#6f7d84'), mat('#6f7d84'), mat('#7f8d94'), mat('#7f8d94')], 0, d.h / 2, 0);
      g.add(slab);
      for (let i = 0; i < 4; i++) g.add(M(box(0.38, 0.06, w - 0.1), mat('#56636a'), 0, 0.5 + i * 0.7, 0));
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.4), new THREE.MeshStandardMaterial({ map: t }));
      stripe.position.set(0.19, 0.2, 0); stripe.rotation.y = Math.PI / 2; g.add(stripe);
      const stripe2 = stripe.clone(); stripe2.position.x = -0.19; stripe2.rotation.y = -Math.PI / 2; g.add(stripe2);
      g.position.set(d.x, 0, (d.z0 + d.z1) / 2);
      this.add(g);
      // frame + lamp
      const fr = new THREE.Group();
      fr.position.set(d.x, 0, (d.z0 + d.z1) / 2);
      for (const s of [-1, 1]) fr.add(M(rb(0.6, d.h + 0.4, 0.3, 0.06), mat('#2c4a52'), 0, (d.h + 0.4) / 2, s * (w / 2 + 0.1)));
      fr.add(M(rb(0.6, 0.4, w + 0.5, 0.08), mat(PAL.yellow), 0, d.h + 0.4, 0));
      const lamp = M(cyl(0.16, 0.16, 0.18, 12), uniqueMat('#333', { emissive: '#000' }), 0, d.h + 0.75, 0);
      fr.add(lamp);
      this.add(fr);
      this.doors[k] = { g, lamp, h: d.h, zc: (d.z0 + d.z1) / 2, travel: w + 0.1 };
    }
    this.airIn = this.panel(SPOTS.air_in, 'AIRLOCK');
    this.airOut = this.panel(SPOTS.air_out, 'AIRLOCK');
    const al = sign('AIRLOCK', 3.0, 0.7, { bg: PAL.yellow, hazard: true, size: 120 });
    al.position.set(7, 3.7, 3.01); this.add(al);

    // ── lift ──
    {
      const g = new THREE.Group();
      const w = LIFT.x1 - LIFT.x0, d = LIFT.z1 - LIFT.z0;
      const t = doorTex.clone(); t.needsUpdate = true; t.repeat.set(3, 3);
      g.add(M(box(w, 0.3, d), mat('#5b6a71', { rough: 0.5 }), 0, -0.15, 0, { receive: true }));
      g.add(plane(w - 0.2, d - 0.2, new THREE.MeshStandardMaterial({ map: floorTex('#9aa3a8', 12), roughness: 0.6 }), 0, 0.006, 0));
      const edgeT = hazardTex(); edgeT.repeat.set(3, 1);
      g.add(plane(w, 0.25, new THREE.MeshStandardMaterial({ map: edgeT }), 0, 0.008, d / 2 - 0.13));
      g.position.set((LIFT.x0 + LIFT.x1) / 2, 0, (LIFT.z0 + LIFT.z1) / 2);
      this.add(g);
      for (const [x, z] of [[LIFT.x0, LIFT.z0], [LIFT.x0, LIFT.z1]]) this.add(M(box(0.22, 6, 0.22), mat(PAL.yellow), x - 0.15, 3, z));
      this.add(M(box(0.3, 0.3, d + 0.4), mat(PAL.yellow), LIFT.x0 - 0.15, 6, (LIFT.z0 + LIFT.z1) / 2));
      this.lift = { g };
      this.liftBtn = this.button(SPOTS.lift_btn, PAL.green, { label: 'LIFT', base: PAL.teal });
      this.liftBtn2 = this.button([19.7, 0, -5.6], PAL.green, { base: PAL.teal });
      this.liftBtn2.g.position.y = SKY_DOCK.top - 0.05;
      this.liftBtn2.g.scale.setScalar(0.8);
    }
    // ── fan ──
    {
      const g = new THREE.Group();
      g.position.set(FAN.x, 0, FAN.z);
      g.add(M(new THREE.CylinderGeometry(1.2, 1.3, 0.35, 28), mat(PAL.teal), 0, 0.17, 0));
      g.add(M(new THREE.TorusGeometry(1.15, 0.08, 8, 28), mat(PAL.ink), 0, 0.36, 0, { rx: Math.PI / 2 }));
      const blades = new THREE.Group();
      blades.position.y = 0.3;
      for (let i = 0; i < 5; i++) {
        const b = M(rb(0.9, 0.04, 0.32, 0.02), mat('#cfd6d8', { metal: 0.4 }), 0.5, 0, 0);
        b.rotation.x = 0.4;
        const p = new THREE.Group(); p.rotation.y = (i / 5) * Math.PI * 2; p.add(b); blades.add(p);
      }
      blades.add(M(cyl(0.15, 0.15, 0.12, 12), mat(PAL.red), 0, 0.03, 0));
      g.add(blades);
      // grill
      for (let i = -3; i <= 3; i++) g.add(M(box(0.03, 0.03, 2.2 * Math.cos(Math.asin(Math.min(0.95, Math.abs(i) / 3.4)))), mat(PAL.ink), i * 0.32, 0.4, 0));
      const column = M(new THREE.CylinderGeometry(1.05, 1.15, 4.8, 24, 1, true), uniqueMat('#dff8ff', { opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }), 0, 2.8, 0, { shadow: false });
      g.add(column);
      const s = sign('UPDRAFT', 1.4, 0.34, { bg: PAL.teal, fg: '#fff', size: 100 });
      s.position.set(0, 0.2, 1.31); g.add(s);
      this.add(g);
      this.fan = { blades, column, spin: 0 };
      this.lever('fan', SPOTS.fan_switch, { label: 'FAN', knob: PAL.teal });
    }
    // ── magnet crane ──
    {
      const g = new THREE.Group();
      g.position.set(MAGNET.x, 0, MAGNET.z);
      g.add(M(box(0.35, 6.8, 0.35), mat(PAL.yellow), 1.2, 3.4, -2.6));
      g.add(M(box(0.35, 0.35, 3.0), mat(PAL.yellow), 1.2, 6.6, -1.2));
      g.add(M(cyl(0.03, 0.03, 1.6, 6), mat(PAL.ink), 1.2, 5.8, 0));
      const mag = new THREE.Group();
      mag.position.set(1.2, MAGNET.y + 0.3, 0);
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 0.6, 0, Math.PI, false);
      shape.lineTo(-0.3, 0); shape.absarc(0, 0, 0.3, Math.PI, 0, true); shape.lineTo(0.6, 0);
      const hg = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
      hg.translate(0, 0, -0.2);
      const horse = M(hg, mat(PAL.red, { rough: 0.35 }), 0, 0, 0, { rz: Math.PI });
      mag.add(horse);
      for (const s of [-1, 1]) mag.add(M(box(0.32, 0.22, 0.44), mat('#cfd6d8', { metal: 0.6 }), s * 0.45, -0.1, 0));
      const glow = M(new THREE.SphereGeometry(0.5, 16, 12), uniqueMat('#7af7ff', { emissive: '#3fd8ff', ei: 1, opacity: 0.0, depthWrite: false }), 0, -0.45, 0, { shadow: false });
      mag.add(glow);
      g.add(mag);
      g.position.x -= 1.2;
      this.add(g);
      this.magnet = { mag, glow };
      this.lever('magnet', SPOTS.magnet_lever, { label: 'MAGNET', knob: PAL.blue });
    }
    // ── delivery pads ──
    this.pads = {};
    for (const [id, p] of Object.entries(PADS)) {
      const g = new THREE.Group();
      g.position.set(p.x, (p.y || 0) + 0.01, p.z);
      const col = BAYS[id].color;
      g.add(M(box(p.size + 0.3, 0.08, p.size + 0.3), mat(PAL.ink), 0, 0.03, 0, { receive: true }));
      const ring = M(box(p.size, 0.1, p.size), uniqueMat(col, { emissive: col, ei: 0.25 }), 0, 0.05, 0, { receive: true });
      g.add(ring);
      g.add(M(box(p.size - 0.5, 0.11, p.size - 0.5), mat('#2b3036'), 0, 0.055, 0, { receive: true }));
      const letter = plane(p.size - 0.8, p.size - 0.8, new THREE.MeshBasicMaterial({ map: labelTex(id, { w: 256, h: 256, bg: 'none', fg: col, size: 200 }), transparent: true }), 0, 0.12, 0);
      g.add(letter);
      // sign post
      const post = new THREE.Group();
      post.position.set(p.size / 2 + 0.4, 0, -p.size / 2 + 0.3);
      post.add(M(cyl(0.06, 0.06, 2.4, 8), mat('#3d4a50'), 0, 1.2, 0));
      const s = sign(`${BAYS[id].name}`, 1.8, 0.5, { bg: col, fg: '#fff', size: 110 });
      s.position.set(0, 2.3, 0); post.add(s);
      g.add(post);
      this.add(g);
      this.pads[id] = { ring, flash: 0 };
    }
    // ── heat pad ──
    {
      const g = new THREE.Group();
      g.position.set(HEATPAD.x, 0, HEATPAD.z);
      g.add(M(rb(1.8, 0.24, 1.8, 0.05), mat('#3d4a50'), 0, 0.12, 0));
      const coil = M(new THREE.TorusGeometry(0.6, 0.06, 8, 30), uniqueMat('#552', { emissive: '#ff5a1f', ei: 0 }), 0, 0.26, 0, { rx: Math.PI / 2 });
      const coil2 = M(new THREE.TorusGeometry(0.32, 0.06, 8, 24), coil.material, 0, 0.26, 0, { rx: Math.PI / 2 });
      g.add(coil, coil2);
      g.add(M(box(0.12, 2.6, 0.12), mat('#3d4a50'), 0, 1.3, 1.0));
      g.add(M(box(0.12, 0.12, 1.0), mat('#3d4a50'), 0, 2.6, 0.5));
      const lampHead = M(new THREE.ConeGeometry(0.45, 0.4, 18, 1, true), mat(PAL.red, { side: THREE.DoubleSide }), 0, 2.4, 0);
      g.add(lampHead);
      const bulb = M(new THREE.SphereGeometry(0.2, 12, 10), uniqueMat('#553', { emissive: '#ff7a2f', ei: 0 }), 0, 2.25, 0);
      g.add(bulb);
      const s = sign('TOASTER', 1.3, 0.32, { bg: PAL.red, fg: '#fff', size: 100 });
      s.position.set(0, 0.13, 0.91); s.rotation.x = -0.3; g.add(s);
      this.add(g);
      this.heat = { coil, bulb };
    }
    // ── incinerator ──
    {
      const g = new THREE.Group();
      g.position.set(INCINERATOR.x, 0, INCINERATOR.z);
      g.add(M(rb(2.0, 0.7, 2.0, 0.12), mat('#4a3c36'), 0, 0.35, 0));
      const grate = M(new THREE.PlaneGeometry(1.5, 1.5), uniqueMat('#2a1a10', { emissive: '#ff5a1f', ei: 0.9 }), 0, 0.71, 0, { rx: -Math.PI / 2, shadow: false });
      g.add(grate);
      for (let i = -2; i <= 2; i++) g.add(M(box(0.06, 0.05, 1.5), mat(PAL.ink), i * 0.3, 0.73, 0));
      g.add(M(cyl(0.35, 0.35, 3.2, 14), mat('#5b4a42'), 0.6, 2.2, -0.6));
      const s = sign('JUNK → FIRE', 1.8, 0.42, { bg: PAL.orange, fg: PAL.ink, size: 100 });
      s.position.set(0, 0.36, 1.01); g.add(s);
      this.add(g);
      this.incin = { grate };
    }
    // ── boiler + control room ──
    {
      const g = new THREE.Group();
      g.position.set(BOILER.x, 0, BOILER.z);
      const tank = M(cyl(1.35, 1.35, 3.0, 26), pmat('#c0583a', 'metal', 3, 1.5, { rough: 0.8, metal: 0.45 }), 0, 1.6, 0);
      outline(tank, 0.04);
      g.add(tank);
      g.add(M(new THREE.SphereGeometry(1.35, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#c0583a', { rough: 0.4, metal: 0.3 }), 0, 3.1, 0));
      for (const y of [0.4, 1.6, 2.8]) g.add(M(new THREE.TorusGeometry(1.37, 0.06, 8, 30), mat('#7d3220', { metal: 0.4 }), 0, y, 0, { rx: Math.PI / 2 }));
      g.add(M(cyl(0.18, 0.18, 1.6, 10), mat(PAL.steel2), 0.6, 4.6, 0));
      // gauge facing the room (south)
      const dial = new THREE.Group();
      dial.position.set(0, 2.2, 1.4);
      dial.add(M(cyl(0.62, 0.62, 0.14, 26), mat(PAL.ink), 0, 0, 0, { rx: Math.PI / 2 }));
      dial.add(M(new THREE.CircleGeometry(0.56, 26), new THREE.MeshBasicMaterial({ map: gaugeTex() }), 0, 0, 0.08));
      const needle = new THREE.Group();
      needle.position.z = 0.1;
      needle.add(M(box(0.04, 0.48, 0.02), mat(PAL.red), 0, 0.2, 0));
      needle.add(M(cyl(0.06, 0.06, 0.04, 10), mat(PAL.ink), 0, 0, 0, { rx: Math.PI / 2 }));
      dial.add(needle);
      g.add(dial);
      const readout = M(new THREE.PlaneGeometry(0.9, 0.36), new THREE.MeshBasicMaterial({ map: screenTex(['35 PSI'], { w: 256, h: 100, size: 46 }) }), 0, 1.35, 1.37);
      g.add(readout);
      const s = sign('BOILER', 1.7, 0.42, { bg: PAL.yellow, size: 110 });
      s.position.set(0, 3.4, 1.37); g.add(s);
      this.add(g);
      // valve wheel
      const v = new THREE.Group();
      v.position.set(SPOTS.valve[0], 0, SPOTS.valve[2] - 0.1);
      v.add(M(cyl(0.12, 0.12, 1.1, 10), mat('#7d3220'), 0, 0.55, 0));
      const wheel = new THREE.Group();
      wheel.position.y = 1.15;
      wheel.add(M(new THREE.TorusGeometry(0.38, 0.06, 8, 24), mat(PAL.red, { rough: 0.3 }), 0, 0, 0, { rx: Math.PI / 2 }));
      for (let i = 0; i < 3; i++) wheel.add(M(box(0.74, 0.05, 0.06), mat(PAL.red), 0, 0, 0, { ry: (i * Math.PI) / 3 }));
      v.add(wheel);
      const vs = sign('VENT', 0.8, 0.24, { bg: PAL.paper, size: 100 });
      vs.position.set(0, 0.6, 0.13); v.add(vs);
      this.add(v);
      // pipe from boiler to valve
      this.add(M(cyl(0.12, 0.12, 2.4, 10), mat('#7d3220'), -1.6, 0.6, -16.6, { rz: Math.PI / 2, ry: 0.5 }));
      this.boiler = { g, needle, readout, wheel, tank, lastP: -1, shake: 0 };
    }
    // power panel on the control room north wall
    {
      const g = new THREE.Group();
      g.position.set(-8.6, 0, -21.72);
      g.add(M(rb(5.2, 2.3, 0.3, 0.1), mat(PAL.steel2), 0, 1.65, 0));
      g.add(M(rb(5.4, 0.36, 0.34, 0.06), mat(PAL.ink), 0, 2.95, 0));
      const s = sign('POWER DISTRIBUTION', 4.2, 0.4, { bg: PAL.ink, fg: PAL.yellow, size: 90 });
      s.position.set(0, 2.95, 0.18); g.add(s);
      this.add(g);
      const names = { intake: 'INTAKE', sorting: 'SORTING', dock: 'DOCK', main: 'MAIN' };
      for (const k of ['intake', 'sorting', 'dock', 'main']) {
        const at = SPOTS[`brk_${k}`];
        this.lever(`brk_${k}`, [at[0], 1.5, -21.55], { wall: true, label: names[k], lw: 0.9, knob: k === 'main' ? PAL.red : PAL.yellow, lbg: k === 'main' ? PAL.yellow : PAL.paper });
      }
      // CCTV/manifest monitor
      const mon = M(rb(1.6, 1.0, 0.2, 0.06), mat(PAL.ink), 1.4, 2.7, -21.62);
      this.add(mon);
      const scr = M(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshBasicMaterial({ map: screenTex(['PLANT 7', 'ALL SYSTEMS', 'NOMINAL-ISH']) }), 1.4, 2.7, -21.51);
      this.add(scr);
    }
    // ── hotline ──
    {
      const g = new THREE.Group();
      g.position.set(17.3, 0, 9.5);
      g.add(M(rb(3.6, 2.6, 0.4, 0.12), mat(PAL.ink), 0, 1.3, 0));
      g.add(M(rb(3.4, 0.6, 0.42, 0.1), mat(PAL.yellow), 0, 2.4, 0));
      const s = sign("FOREMAN'S HOTLINE", 3.2, 0.5, { bg: PAL.yellow, size: 90 });
      s.position.set(0, 2.4, -0.22); s.rotation.y = Math.PI; g.add(s);
      const phone = new THREE.Group();
      phone.position.set(0, 1.55, -0.3);
      phone.add(M(rb(0.6, 0.5, 0.25, 0.1), mat(PAL.red, { rough: 0.3 })));
      phone.add(M(rb(0.75, 0.16, 0.2, 0.08), mat(PAL.red, { rough: 0.3 }), 0, 0.32, 0));
      const bell = M(new THREE.SphereGeometry(0.1, 10, 8), uniqueMat('#333', { emissive: '#000' }), 0.0, 0.62, 0);
      phone.add(bell);
      g.add(phone);
      this.add(g);
      this.hotline = { phone, bell };
      this.lever('hotline_out', [SPOTS.hotline_out[0], 0, SPOTS.hotline_out[2] - 0.6], { label: 'CLOCK OUT', knob: PAL.green, base: PAL.ink, ry: 0 });
      this.lever('hotline_ot', [SPOTS.hotline_ot[0], 0, SPOTS.hotline_ot[2] - 0.6], { label: 'OVERTIME', knob: PAL.orange, base: PAL.ink, ry: 0 });
    }
  }

  estop(at, zone) {
    const g = new THREE.Group();
    const wall = at[2] < -8;
    g.position.set(at[0], 0, at[2] + (wall ? -0.4 : 0));
    g.add(M(rb(0.6, 0.6, 0.4, 0.06), mat(PAL.yellow), 0, 1.25, 0));
    if (!wall) g.add(M(cyl(0.06, 0.06, 1.0, 8), mat('#3d4a50'), 0, 0.5, 0));
    const cap = M(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(PAL.red, { rough: 0.3 }), 0, 1.25, 0.2, { rx: Math.PI / 2 });
    outline(cap, 0.02);
    g.add(cap);
    const s = sign('E-STOP', 0.6, 0.18, { bg: PAL.red, fg: '#fff', size: 100 });
    s.position.set(0, 1.62, 0.21); g.add(s);
    this.add(g);
  }

  panel(at, label) {
    const g = new THREE.Group();
    g.position.set(at[0], 0, at[2]);
    g.add(M(cyl(0.07, 0.07, 1.0, 8), mat('#3d4a50'), 0, 0.5, 0));
    g.add(M(rb(0.7, 0.55, 0.22, 0.06), mat(PAL.yellow), 0, 1.15, 0, { rx: -0.4 }));
    const cap = M(cyl(0.13, 0.13, 0.08, 14), uniqueMat(PAL.green, { emissive: PAL.green, ei: 0.3 }), 0, 1.2, 0.12, { rx: Math.PI / 2 - 0.4 });
    g.add(cap);
    const s = sign(label, 0.7, 0.18, { bg: PAL.ink, fg: PAL.yellow, size: 100 });
    s.position.set(0, 0.85, 0.12); g.add(s);
    this.add(g);
    return { cap };
  }

  // ───────────────────────────── break room ─────────────────────────────
  buildLobby() {
    // contract cork board
    const g = new THREE.Group();
    g.position.set(-39.5, 0, -9.7);
    g.add(M(rb(9.4, 2.8, 0.2, 0.08), mat('#b98a56', { rough: 0.95 }), 0, 1.9, 0));
    g.add(M(rb(9.8, 0.26, 0.3, 0.06), mat(PAL.wood), 0, 3.35, 0));
    const hd = sign('CONTRACTS', 3.4, 0.6, { bg: PAL.yellow, size: 120 });
    hd.position.set(0, 3.0, 0.12); g.add(hd);
    this.add(g);
    this.contractClips = [];
    for (let i = 0; i < 3; i++) {
      const at = SPOTS[`contract${i}`];
      const c = new THREE.Group();
      c.position.set(at[0], 1.75, -9.55);
      c.add(M(rb(1.5, 1.9, 0.06, 0.06), mat(PAL.wood), 0, 0, 0));
      const paper = M(new THREE.PlaneGeometry(1.3, 1.6), new THREE.MeshBasicMaterial({ color: '#fff' }), 0, -0.05, 0.04);
      c.add(paper);
      c.add(M(rb(0.6, 0.18, 0.1, 0.04), mat(PAL.steel2, { metal: 0.5 }), 0, 0.88, 0.05));
      const pin = M(new THREE.SphereGeometry(0.1, 10, 8), uniqueMat(PAL.green, { emissive: PAL.green, ei: 0.0 }), 0.6, 0.8, 0.08);
      c.add(pin);
      this.add(c);
      this.contractClips.push({ c, paper, pin, key: '' });
    }
    // risk riders panel (west wall)
    const rp = new THREE.Group();
    rp.position.set(-45.72, 0, -3.5);
    rp.add(M(rb(0.2, 2.4, 7.4, 0.08), mat(PAL.red), 0, 1.7, 0));
    const rs = sign('RISKY RIDERS', 3.6, 0.5, { bg: PAL.ink, fg: PAL.yellow, size: 100 });
    rs.position.set(0.12, 2.65, 0); rs.rotation.y = Math.PI / 2; rp.add(rs);
    this.add(rp);
    for (const k of Object.keys(RIDERS)) {
      const at = SPOTS[`rider_${k}`];
      this.lever(`rider_${k}`, [at[0] - 0.2, 1.5, at[2]], { wall: true, label: RIDERS[k].name, lw: 1.5, knob: PAL.yellow, ry: Math.PI / 2 });
    }
    // lockers
    const lockers = [['COLOR', SPOTS.locker_color, PAL.blue], ['HAT', SPOTS.locker_hat, PAL.teal], ['FACE', SPOTS.locker_face, PAL.purple]];
    for (const [n, at, col] of lockers) {
      const l = new THREE.Group();
      l.position.set(at[0] - 0.15, 0, at[2]);
      l.add(M(rb(0.9, 2.4, 1.8, 0.08), mat(col), 0, 1.2, 0));
      for (let i = 0; i < 4; i++) l.add(M(box(0.02, 0.05, 0.8), mat(PAL.ink), 0.46, 2.0 - i * 0.08, 0));
      l.add(M(box(0.06, 0.4, 0.08), mat(PAL.steel2), 0.47, 1.3, 0.6));
      const s = sign(n, 1.0, 0.3, { bg: PAL.paper, size: 110 });
      s.position.set(0.47, 1.65, 0); s.rotation.y = Math.PI / 2; l.add(s);
      this.add(l);
    }
    // punch clock
    {
      const p = new THREE.Group();
      p.position.set(SPOTS.punch[0] - 0.4, 0, SPOTS.punch[2]);
      p.add(M(cyl(0.08, 0.08, 1.1, 8), mat('#3d4a50'), 0, 0.55, 0));
      p.add(M(rb(0.7, 0.9, 0.45, 0.1), mat(PAL.orange), 0, 1.4, 0));
      p.add(M(new THREE.CircleGeometry(0.24, 24), mat('#fff'), 0, 1.55, 0.23));
      const hand = M(box(0.03, 0.18, 0.01), mat(PAL.ink), 0, 1.6, 0.24);
      p.add(hand);
      p.add(M(box(0.3, 0.05, 0.05), mat(PAL.ink), 0, 1.15, 0.23));
      const s = sign('PUNCH IN', 0.9, 0.26, { bg: PAL.yellow, size: 110 });
      s.position.set(0, 2.0, 0); p.add(s);
      this.add(p);
      this.punch = { hand };
    }
    // vending machine
    {
      const v = new THREE.Group();
      v.position.set(-44.6, 0, -8.6);
      v.add(M(rb(1.6, 2.2, 1.2, 0.1), mat(PAL.red), 0, 1.1, 0));
      v.add(M(new THREE.PlaneGeometry(1.0, 1.3), uniqueMat('#bff7f2', { emissive: '#7ee0ff', ei: 0.35 }), -0.15, 1.35, 0.61));
      const s = sign('FIZZ', 1.2, 0.35, { bg: PAL.paper, fg: PAL.red, size: 120 });
      s.position.set(0, 2.0, 0.61); v.add(s);
      this.add(v);
    }
    // couch + table
    const couch = new THREE.Group();
    couch.position.set(-40, 0, 6.8);
    couch.add(M(rb(4.2, 0.5, 1.3, 0.2), mat(PAL.teal2), 0, 0.3, 0));
    couch.add(M(rb(4.2, 0.9, 0.35, 0.15), mat(PAL.teal2), 0, 0.75, 0.5));
    for (const s of [-1, 1]) couch.add(M(rb(0.35, 0.75, 1.3, 0.15), mat(PAL.teal2), s * 2.0, 0.55, 0));
    this.add(couch);
    // basketball hoop on the north wall
    const hoop = new THREE.Group();
    hoop.position.set(-34.6, 0, -9.65);
    hoop.add(M(rb(1.4, 1.0, 0.08, 0.04), mat('#ffffff'), 0, 3.0, 0));
    hoop.add(M(new THREE.TorusGeometry(0.3, 0.03, 6, 20), mat(PAL.orange), 0, 2.6, 0.38, { rx: Math.PI / 2 }));
    this.add(hoop);
    // ledger chalkboard
    this.ledgerTexKey = '';
    const lb = M(rb(2.8, 1.6, 0.12, 0.06), mat('#5a3c24'), -33.3, 2.0, -9.6);
    this.add(lb);
    this.ledgerScreen = M(new THREE.PlaneGeometry(2.5, 1.35), new THREE.MeshBasicMaterial({ map: screenTex(['COMPANY LEDGER', '$0'], { bg: '#24382e', fg: '#f4ebd9', size: 26, w: 320, h: 170 }) }), -33.3, 2.0, -9.53);
    this.add(this.ledgerScreen);
    // "days without accident" board
    const daysBoard = sign('DAYS WITHOUT\nINCIDENT: 0', 2.2, 1.1, { bg: '#fff', fg: PAL.red, size: 52 });
    daysBoard.position.set(-23, 2.6, -9.73);
    this.add(daysBoard);
  }

  buildDecor() {
    // pipes along the north walls
    const pipeCols = [PAL.orange, PAL.teal2, PAL.red];
    pipeCols.forEach((c, i) => {
      const y = 2.5 + i * 0.32;
      const p = M(cyl(0.11, 0.11, 47, 10), mat(c, { rough: 0.4 }), -22, y, -9.55 - i * 0.12, { rz: Math.PI / 2 });
      this.add(p);
      for (let x = -44; x < 2; x += 6) this.add(M(cyl(0.16, 0.16, 0.12, 10), mat(PAL.ink), x + i, y, -9.55 - i * 0.12, { rz: Math.PI / 2 }));
    });
    for (let i = 0; i < 2; i++) this.add(M(cyl(0.14, 0.14, 26, 10), mat(i ? PAL.yellow : PAL.teal2, { rough: 0.4 }), 17, 3.2 + i * 0.35, -9.6, { rz: Math.PI / 2 }));
    // vertical pipe drops with valves
    for (const x of [-30, -17, -11, 2.5]) {
      this.add(M(cyl(0.1, 0.1, 2.5, 10), mat(PAL.orange), x, 1.25, -9.55));
      this.add(M(new THREE.TorusGeometry(0.18, 0.04, 6, 14), mat(PAL.red), x, 1.4, -9.35));
    }
    // signage
    const signs = [
      ['INTAKE BAY', -23, 3.1, -9.73, 3.6, PAL.yellow],
      ['SORTING HALL', -5, 3.1, -9.73, 3.8, PAL.yellow],
      ['SHIPPING DOCK', 14, 3.3, -9.73, 4.0, PAL.yellow],
      ['BREAK ROOM', -42, 3.25, -9.6, 3.0, PAL.paper],
      ['CONTROL ROOM', -5, 3.1, -21.73, 3.8, PAL.yellow],
    ];
    for (const [t, x, y, z, w, bg] of signs) {
      const s = sign(t, w, w / 4.6, { bg, size: 110 });
      s.position.set(x, y, z);
      this.add(s);
    }
    const warn = [['MIND THE BELT', -13.74, 1.9, -6], ['HELMETS OPTIONAL\n(SADLY)', -31.74, 2.0, -6]];
    for (const [t, x, y, z] of warn) {
      const s = sign(t, 2.2, 0.8, { bg: '#fff', fg: PAL.red, size: 60 });
      s.position.set(x, y, z); s.rotation.y = Math.PI / 2;
      this.add(s);
    }
    // pallets, barrels and cones to dress corners
    const pallet = (x, z, r = 0, n = 1) => {
      for (let i = 0; i < n; i++) {
        const p = new THREE.Group();
        p.position.set(x, i * 0.18, z); p.rotation.y = r;
        for (let k = -1; k <= 1; k++) p.add(M(box(1.2, 0.06, 0.18), mat(PAL.wood), 0, 0.15, k * 0.5));
        for (let k = -1; k <= 1; k++) p.add(M(box(0.14, 0.12, 1.2), mat('#8a5d33'), k * 0.5, 0.06, 0));
        this.add(p);
      }
    };
    pallet(-30.5, 8.5, 0.1, 3); pallet(-29, 8.6, -0.2, 1); pallet(28.7, 8.5, 0.3, 4); pallet(12, -9, 0, 2);
    const barrel = (x, z, c) => this.add(M(cyl(0.38, 0.38, 1.0, 16), mat(c), x, 0.5, z));
    barrel(-30.6, -8.8, PAL.blue); barrel(-29.8, -8.9, PAL.blue); barrel(3.2, 8.8, PAL.red); barrel(-13.2, -8.8, PAL.yellow);
    const tcone = (x, z) => { const c = M(new THREE.ConeGeometry(0.22, 0.6, 14), mat(PAL.orange), x, 0.3, z); this.add(c); this.add(M(box(0.5, 0.05, 0.5), mat(PAL.orange), x, 0.025, z)); };
    tcone(11, 1.4); tcone(11, -1.4); tcone(-15, 8.5); tcone(14.8, -5.6);
    // control room desk + chair
    this.add(M(rb(3.2, 0.9, 1.2, 0.06), mat(PAL.wood), -10, 0.45, -14.2));
    this.add(M(rb(0.8, 0.5, 0.4, 0.06), mat(PAL.ink), -10.6, 1.15, -14.4));
    this.add(M(rb(0.3, 0.4, 0.3, 0.1), mat('#ffffff'), -9.2, 1.1, -14.1));
    // wall lamps (emissive cages) on north walls
    for (const x of [-42, -36, -27, -19, -9, 0, 14, 21, 27]) {
      const l = M(new THREE.SphereGeometry(0.18, 12, 10), uniqueMat('#fff6d6', { emissive: '#ffe7a8', ei: 3 }), x, 3.2, -9.55);
      this.add(l);
      this.lamps.push(l);
      this.add(M(new THREE.CylinderGeometry(0.28, 0.18, 0.2, 12, 1, true), mat(PAL.ink, { side: THREE.DoubleSide }), x, 3.35, -9.55));
    }
    // red emergency beacons (spin during blackouts / alarms)
    this.beacons = [];
    for (const [x, z] of [[-23, -9.5], [-5, -9.5], [14, -9.5], [-5, -21.5]]) {
      const b = new THREE.Group();
      b.position.set(x + 4, 3.75, z + 0.1);
      b.add(M(cyl(0.18, 0.2, 0.15, 12), mat(PAL.ink)));
      const dome = M(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), uniqueMat('#802020', { emissive: '#ff2020', ei: 0 }), 0, 0.07, 0);
      b.add(dome);
      const light = new THREE.SpotLight('#ff3030', 0, 14, 0.6, 0.5, 1);
      light.position.set(0, 0.1, 0);
      const tgt = new THREE.Object3D(); tgt.position.set(3, -3, 3); b.add(tgt); light.target = tgt;
      b.add(light);
      this.add(b);
      this.beacons.push({ b, dome, light, tgt });
    }
  }

  // ───────────────────────────── per-frame sync ─────────────────────────────
  update(plant, game, dt, t, localPlayers) {
    this.t = t;
    animateDressing(this, t, dt);
    if (!plant) return;
    const powered = (zi) => plant.main && plant.pw[zi] && plant.es[zi] <= 0;
    // belts
    for (const b of CONVEYORS) {
      const v = this.belts[b.id];
      const [dir, jam, speed] = plant.b[b.id];
      v.tex.offset.y -= (speed * dt) / 1.6;
      v.rubN.offset.y = v.tex.offset.y;
      const col = jam ? (Math.sin(t * 12) > 0 ? '#ff3b30' : '#401010') : Math.abs(speed) > 0.1 ? (dir > 0 ? '#49c46b' : '#ffb547') : '#333';
      if (v.lampCol !== col) { v.lamp.material.color.set(col); v.lamp.material.emissive.set(col === '#333' ? '#000' : col); v.lamp.material.emissiveIntensity = 2.5; v.lampCol = col; }
      v.g.position.y = jam ? Math.sin(t * 40) * 0.02 : 0;
    }
    this.setLever('belt_a', plant.b.A[0] > 0, dt);
    this.setLever('belt_b', plant.b.B[0] > 0, dt);
    // sorter
    const [mode, fault, spin] = plant.so;
    const route = mode === 'C' ? 'C' : 'B';
    this.sorter.arrow.rotation.z = fault ? t * 9 : mode === 'C' ? 0 : -Math.PI / 2;
    this.sorter.head.rotation.z = fault ? Math.sin(t * 30) * 0.03 : 0;
    const scrKey = `${mode}${fault}`;
    if (this.sorter.mode !== scrKey) {
      this.sorter.mode = scrKey;
      const lines = fault ? ['ERR#@!', 'BEEP??'] : mode === 'auto' ? ['AUTO', 'C→TUBE B→BELT'] : mode === 'B' ? ['ALL →', 'BELT B'] : ['ALL →', 'TUBE'];
      for (const s of this.sorter.scr) { s.material.map?.dispose(); s.material.map = screenTex(lines, { fg: fault ? '#ff6b62' : '#8cff9a', size: 30 }); s.material.needsUpdate = true; }
    }
    this.setLever('sorter', mode !== 'auto', dt, mode === 'auto' ? '#49c46b' : mode === 'B' ? '#3b82d6' : '#ffc93c');
    // scanner
    this.scanner.beam.material.opacity = powered(1) ? 0.18 + Math.sin(t * 20) * 0.06 : 0;
    // dispenser
    this.setLever('disp_auto', !!plant.di[0], dt);
    const dOk = !plant.oh.includes('dispenser') && powered(0);
    const dc = plant.oh.includes('dispenser') ? (Math.sin(t * 10) > 0 ? '#ff3b30' : '#401010') : dOk ? '#49c46b' : '#333';
    this.dispenser.lamp.material.emissive.set(dc === '#333' ? '#000' : dc);
    this.dispenser.lamp.material.color.set(dc);
    this.dispenser.funnel.position.y = DISPENSER.y + (plant.di[1] ? Math.sin(t * 50) * 0.04 : 0);
    // tube
    this.tube.swirl.rotation.z += dt * (plant.tube ? 8 : 0);
    this.tube.swirl.material.emissiveIntensity = plant.tube ? 0.6 + Math.sin(t * 6) * 0.2 : 0.05;
    // doors
    const dr = plant.dr;
    ['lobby', 'inner', 'outer'].forEach((k, i) => {
      const d = this.doors[k];
      d.g.position.z = d.zc - dr[i] * d.travel;
      const c = dr[i] > 0.95 ? '#49c46b' : dr[i] < 0.05 ? '#e8423f' : (Math.sin(t * 10) > 0 ? '#ffc93c' : '#553');
      d.lamp.material.color.set(c); d.lamp.material.emissive.set(c);
    });
    // lift
    this.lift.g.position.y = plant.lift;
    // fan
    this.fan.spin += dt * (plant.fan ? 28 : plant.oh.includes('fan') ? 3 : 0) ;
    this.fan.blades.rotation.y = this.fan.spin;
    this.fan.column.material.opacity = plant.fan ? 0.12 + Math.sin(t * 7) * 0.03 : 0.02;
    this.setLever('fan', !!plant.fanOn, dt);
    // magnet
    const mg = plant.mag;
    this.magnet.glow.material.opacity = mg ? 0.35 + Math.sin(t * 15) * 0.1 : 0;
    this.magnet.glow.material.emissive.set(mg < 0 ? '#ff4060' : '#3fd8ff');
    this.magnet.glow.material.color.set(mg < 0 ? '#ff8090' : '#7af7ff');
    this.magnet.mag.position.x = 1.2 + (mg ? Math.sin(t * 40) * 0.015 : 0);
    this.setLever('magnet', !!plant.magOn, dt);
    // heat pad
    this.heat.coil.material.emissiveIntensity = plant.hp === 1 ? 1.4 + Math.sin(t * 9) * 0.3 : plant.hp ? 0.45 : 0;
    this.heat.bulb.material.emissiveIntensity = plant.hp ? 1.2 : 0;
    // incinerator flicker
    this.incin.grate.material.emissiveIntensity = 0.8 + Math.sin(t * 13) * 0.2 + Math.sin(t * 7.1) * 0.15;
    // boiler
    const P = plant.P;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const ang = a0 + (a1 - a0) * Math.min(1, P / 100);
    this.boiler.needle.rotation.z = -(ang - Math.PI * 1.5) + (P > 85 ? Math.sin(t * 50) * 0.05 : 0);
    this.boiler.tank.position.x = P > 80 ? Math.sin(t * 60) * 0.02 * (P - 80) / 10 : 0;
    if (Math.round(P) !== this.boiler.lastP) {
      this.boiler.lastP = Math.round(P);
      this.boiler.readout.material.map?.dispose();
      this.boiler.readout.material.map = screenTex([`${Math.round(P)} PSI`], { w: 256, h: 100, size: 46, fg: P > 85 ? '#ff6b62' : P > 70 ? '#ffb547' : '#8cff9a' });
      this.boiler.readout.material.needsUpdate = true;
    }
    if (plant.ctl.valve) this.boiler.wheel.rotation.y += dt * 6;
    // breakers
    ['intake', 'sorting', 'dock'].forEach((z, i) => this.setLever(`brk_${z}`, !!plant.pw[i], dt));
    this.setLever('brk_main', !!plant.main, dt, plant.main ? '#49c46b' : (Math.sin(t * 8) > 0 ? '#ff3b30' : '#401010'));
    // airlock panel lamps
    for (const p of [this.airIn, this.airOut]) {
      const c = plant.inc.some((i) => i.k === 'breach') ? (Math.sin(t * 10) > 0 ? '#ff3b30' : '#401010') : powered(2) ? '#49c46b' : '#ffb547';
      p.cap.material.color.set(c); p.cap.material.emissive.set(c);
    }
    // hotline
    const ring = game && game.ring;
    this.hotline.phone.rotation.z = ring ? Math.sin(t * 40) * 0.12 : 0;
    this.hotline.phone.position.y = 1.55 + (ring ? Math.abs(Math.sin(t * 20)) * 0.05 : 0);
    this.hotline.bell.material.emissive.set(ring ? (Math.sin(t * 12) > 0 ? '#ffc93c' : '#000') : '#000');
    this.setLever('hotline_out', false, dt, game?.qm ? '#49c46b' : '#333');
    this.setLever('hotline_ot', game?.ot > 0 && !game?.otDone, dt, game?.qm ? '#ff7a2f' : '#333');
    // pads
    for (const id in this.pads) {
      const p = this.pads[id];
      p.flash = Math.max(0, p.flash - dt * 2);
      p.ring.material.emissiveIntensity = 0.25 + p.flash * 1.5 + (game?.ph === 'shift' ? Math.sin(t * 3 + id.charCodeAt(0)) * 0.08 : 0);
    }
    // break room
    if (game) {
      for (const k of Object.keys(RIDERS)) this.setLever(`rider_${k}`, !!game.riders?.[k], dt, game.riders?.[k] ? '#e8423f' : '#333');
      if (game.contracts) {
        this.contractClips.forEach((cc, i) => {
          const c = game.contracts[i];
          const sel = game.sel === i;
          const key = c ? c.name + sel : '';
          if (cc.key !== key) {
            cc.key = key;
            cc.paper.material.map?.dispose();
            cc.paper.material.map = c ? contractPaperTex(c, sel) : null;
            cc.paper.material.needsUpdate = true;
          }
          cc.pin.material.emissiveIntensity = sel ? 1 : 0;
          cc.c.rotation.z = sel ? Math.sin(t * 2) * 0.03 : 0;
        });
      }
      const lk = `${game.ledger}`;
      if (this.ledgerTexKey !== lk) {
        this.ledgerTexKey = lk;
        this.ledgerScreen.material.map?.dispose();
        this.ledgerScreen.material.map = screenTex(['COMPANY LEDGER', `$${game.ledger.toLocaleString()}`, `SHIFTS: ${game.shifts}  TIER ${game.tier}`], { bg: '#24382e', fg: '#f4ebd9', size: 26, w: 320, h: 170 });
        this.ledgerScreen.material.needsUpdate = true;
      }
    }
    this.punch.hand.rotation.z = -t * 0.5;
    // lights / beacons
    const alarm = !plant.main || plant.P > 88 || plant.inc.some((i) => i.k === 'breach');
    for (const b of this.beacons) {
      b.b.rotation.y = alarm ? t * 6 : 0;
      b.dome.material.emissiveIntensity = alarm ? 4 : 0;
      b.light.intensity = alarm ? 40 : 0;
    }
    for (const l of this.lamps) l.material.emissiveIntensity = plant.main ? (game?.dark ? 0.4 : 3) : 0.05;
  }

  flashPad(id) { if (this.pads[id]) this.pads[id].flash = 1; }
}

function arrowShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.7); s.lineTo(0.42, 0.18); s.lineTo(0.16, 0.18); s.lineTo(0.16, -0.55); s.lineTo(-0.16, -0.55); s.lineTo(-0.16, 0.18); s.lineTo(-0.42, 0.18); s.closePath();
  return s;
}

function contractPaperTex(c, sel) {
  const cv = document.createElement('canvas');
  cv.width = 260; cv.height = 320;
  const g = cv.getContext('2d');
  g.fillStyle = sel ? '#fff6dc' : '#f4ebd9'; g.fillRect(0, 0, 260, 320);
  g.strokeStyle = '#c9d7e6'; g.lineWidth = 2;
  for (let y = 70; y < 320; y += 26) { g.beginPath(); g.moveTo(10, y); g.lineTo(250, y); g.stroke(); }
  g.fillStyle = '#1b1f24'; g.font = '24px Bungee, Impact'; g.textAlign = 'left';
  const words = c.name.split(' ');
  g.fillText(words.slice(0, 2).join(' '), 14, 36, 232);
  if (words.length > 2) g.fillText(words.slice(2).join(' '), 14, 62, 232);
  g.font = '15px "Space Mono", monospace';
  let y = 92;
  for (const [t, n] of Object.entries(c.lines)) { g.fillText(`${n} × ${t.toUpperCase()}`, 18, y); y += 26; }
  g.font = '22px Bungee, Impact'; g.fillStyle = '#1f7a3a';
  g.fillText(`$${c.bonus}`, 18, 300);
  if (sel) {
    g.save(); g.translate(170, 270); g.rotate(-0.25);
    g.strokeStyle = '#e8423f'; g.lineWidth = 5; g.strokeRect(-56, -22, 112, 44);
    g.fillStyle = '#e8423f'; g.font = '22px Bungee, Impact'; g.textAlign = 'center'; g.fillText('PICKED', 0, 9);
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
