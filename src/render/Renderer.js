import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LevelView } from './levelView.js';
import { FX } from './fx.js';
import { buildWorker, animateWorker, buildCargo, bayBadge, M, outline } from './models.js';
import { PAL, mat, uniqueMat, labelTex, screenTex } from './tex.js';
import { BOUNDS, CONVEYORS, DISPENSER, TUBE, FAN, BOILER, PADS, INCINERATOR, HEATPAD, SORTER, ZONES, zoneAt } from '../../shared/level.js';
import { CARGO } from '../../shared/constants.js';

const CAM_DIR = new THREE.Vector3(0, 0.74, 0.67).normalize();
const MACHINE_FX = { dispenser: [-26.4, 2.5, 0.3], sorter: [-5, 2.0, 1.2], tube: [-5, 1.6, -7.2], fan: [24.6, 0.8, -3.4], lift: [17.5, 0.6, -8] };

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    const r = (this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyQuality();

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#0f2a30');
    scene.fog = new THREE.Fog('#0f2a30', 55, 110);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.3, 300);
    this.camPos = new THREE.Vector3(-20, 30, 30);
    this.camTarget = new THREE.Vector3(-20, 0, 0);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.shake = 0;

    // lights: soft sky + warm sun + cool fill
    this.hemi = new THREE.HemisphereLight('#e6f4ff', '#6d6255', 1.15);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff0d8', 2.3));
    sun.position.set(-10, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);
    this.fill = new THREE.DirectionalLight('#9fd6ff', 0.45);
    this.fill.position.set(20, 12, -20);
    scene.add(this.fill);
    this.lightLevel = 1;

    this.level = new LevelView(scene);
    this.fx = new FX(scene);
    this.workers = new Map();
    this.cargo = new Map();
    this.torches = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.SpotLight('#fff4d6', 0, 16, 0.55, 0.45, 1.2);
      const tgt = new THREE.Object3D();
      scene.add(s, tgt);
      s.target = tgt;
      this.torches.push(s);
    }
    this.mode = 'menu';
    this.time = 0;
    this.emitT = {};
    this.buildMenuDesk();
    this.buildMenuDemo();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  applyQuality() {
    const q = this.settings.get('quality');
    const dpr = Math.min(devicePixelRatio || 1, q === 'high' ? 2 : q === 'low' ? 1 : 1.5);
    this.gl.setPixelRatio(dpr);
    this.gl.shadowMap.enabled = q !== 'low';
    if (this.sun) {
      this.sun.castShadow = q !== 'low';
      const s = q === 'high' ? 4096 : 2048;
      if (this.sun.shadow.mapSize.x !== s) { this.sun.shadow.mapSize.set(s, s); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ───────────────────────────── menu diorama ─────────────────────────────
  buildMenuDesk() {
    const g = (this.desk = new THREE.Group());
    const wood = mat('#9a6a3e', { rough: 0.6 });
    const desk = M(new RoundedBoxGeometry(11, 0.4, 3.6, 3, 0.12), wood, 0, 0, 0, { receive: true });
    g.add(desk);
    g.add(M(new RoundedBoxGeometry(11.2, 0.12, 0.2, 2, 0.05), mat('#6e4628'), 0, -0.1, 1.8));
    // blotter
    g.add(M(new RoundedBoxGeometry(4.2, 0.04, 2.2, 2, 0.02), mat('#2f5d4f', { rough: 0.9 }), -0.2, 0.22, 0.3, { receive: true }));
    // clipboard with a shift sheet
    const cb = new THREE.Group();
    cb.position.set(-0.4, 0.26, 0.4); cb.rotation.y = 0.12;
    cb.add(M(new RoundedBoxGeometry(1.5, 0.05, 2.0, 2, 0.05), mat(PAL.wood)));
    const paper = M(new THREE.PlaneGeometry(1.3, 1.7), new THREE.MeshStandardMaterial({ map: screenTex(['SHIFT ROSTER', '--------', 'WORKERS: ?', 'QUOTA: YES', 'CHAOS: LIKELY'], { bg: '#f4ebd9', fg: '#1b1f24', size: 22, w: 260, h: 340 }), roughness: 0.9 }), 0, 0.03, 0.05, { rx: -Math.PI / 2 });
    cb.add(paper);
    cb.add(M(new RoundedBoxGeometry(0.6, 0.1, 0.2, 2, 0.04), mat(PAL.steel2, { metal: 0.5 }), 0, 0.06, -0.9));
    g.add(cb);
    // coffee mug
    const mug = new THREE.Group();
    mug.position.set(2.6, 0.2, 0.5);
    const mm = M(new THREE.CylinderGeometry(0.28, 0.25, 0.6, 20), mat(PAL.yellow, { rough: 0.3 }), 0, 0.3, 0);
    outline(mm, 0.02);
    mug.add(mm);
    mug.add(M(new THREE.TorusGeometry(0.17, 0.05, 8, 16), mat(PAL.yellow, { rough: 0.3 }), 0.3, 0.32, 0, { rz: 0 }));
    mug.add(M(new THREE.CircleGeometry(0.25, 18), mat('#3b2416', { rough: 0.2 }), 0, 0.55, 0, { rx: -Math.PI / 2 }));
    g.add(mug);
    this.mug = mug;
    // rotary phone
    const ph = new THREE.Group();
    ph.position.set(-3.6, 0.2, 0.2); ph.rotation.y = 0.4;
    const pb = M(new RoundedBoxGeometry(1.1, 0.5, 0.9, 3, 0.2), mat(PAL.red, { rough: 0.35 }), 0, 0.25, 0);
    outline(pb, 0.03);
    ph.add(pb);
    ph.add(M(new RoundedBoxGeometry(1.3, 0.22, 0.3, 3, 0.1), mat(PAL.red, { rough: 0.35 }), 0, 0.62, -0.05));
    ph.add(M(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 20), mat('#f4ebd9'), 0, 0.52, 0.22, { rx: 0.5 }));
    g.add(ph);
    this.deskPhone = ph;
    // lamp
    const lamp = new THREE.Group();
    lamp.position.set(4.3, 0.2, -0.6);
    lamp.add(M(new THREE.CylinderGeometry(0.4, 0.45, 0.12, 20), mat(PAL.teal)));
    const arm = M(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), mat(PAL.teal), 0, 0.8, 0, { rz: 0.25 });
    lamp.add(arm);
    const shade = M(new THREE.ConeGeometry(0.45, 0.6, 20, 1, true), mat(PAL.teal, { side: THREE.DoubleSide }), -0.45, 1.55, 0.2, { rz: 0.9 });
    lamp.add(shade);
    const bulb = M(new THREE.SphereGeometry(0.15, 10, 8), uniqueMat('#fff', { emissive: '#ffe7a8', ei: 2 }), -0.6, 1.4, 0.25);
    lamp.add(bulb);
    const pl = new THREE.PointLight('#ffd99a', 18, 9, 1.6);
    pl.position.set(-0.8, 1.2, 0.4);
    lamp.add(pl);
    g.add(lamp);
    // nameplate
    const np = M(new THREE.PlaneGeometry(1.8, 0.42), new THREE.MeshStandardMaterial({ map: labelTex('SHIFT MANAGER', { w: 512, h: 120, bg: '#1b1f24', fg: '#ffc93c', size: 56, radius: 10, bw: 6 }) }), 1.0, 0.42, 1.25, { rx: -0.35 });
    g.add(M(new THREE.BoxGeometry(1.9, 0.45, 0.22), mat('#6e4628'), 1.0, 0.36, 1.33, { rx: -0.35 }));
    g.add(np);
    np.position.z = 1.22;
    // paper stack + stamp
    for (let i = 0; i < 4; i++) g.add(M(new THREE.BoxGeometry(1.1, 0.05, 1.4), mat(i % 2 ? '#f4ebd9' : '#ece2cc'), 3.4, 0.24 + i * 0.05, -0.4 + i * 0.02, { ry: i * 0.08 }));
    const stamp = new THREE.Group();
    stamp.position.set(1.5, 0.2, -0.6);
    stamp.add(M(new THREE.CylinderGeometry(0.25, 0.25, 0.15, 16), mat(PAL.red)));
    stamp.add(M(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 10), mat(PAL.wood), 0, 0.27, 0));
    stamp.add(M(new THREE.SphereGeometry(0.16, 12, 10), mat(PAL.wood), 0, 0.52, 0));
    g.add(stamp);
    // window frame between desk and plant
    const fr = new THREE.Group();
    const fm = mat('#1b2a30', { rough: 0.6 });
    g.add(fr);
    // the desk rides with the menu camera so the composition is always the same:
    // manager's desk in the foreground, the running plant out of the window
    g.position.set(0.3, -2.42, -6.3);
    g.rotation.x = 0.62;
    g.scale.setScalar(0.9);
    this.scene.add(this.camera);
    this.camera.add(g);
    g.visible = true;
  }

  buildMenuDemo() {
    // a few workers wandering and cargo riding belts, purely for show on the title screen
    this.demo = { workers: [], cargo: [], t: 0 };
    const paths = [
      [[-24, 3], [-16, 3], [-16, -4], [-24, -4]],
      [[-2, 4], [3, 4], [3, -5], [-2, -5]],
      [[14, 5], [22, 5], [22, 0], [14, 0]],
      [[-10, -14], [-2, -14], [-2, -12], [-10, -12]],
    ];
    const outfits = [
      { color: '#ff7a2f', hat: 'hardhat', face: 'happy' }, { color: '#1fb5a8', hat: 'cone', face: 'stache' },
      { color: '#8b5cf6', hat: 'beanie', face: 'sleepy' }, { color: '#7ac943', hat: 'cap', face: 'grumpy' },
    ];
    paths.forEach((p, i) => {
      const w = buildWorker(outfits[i], i);
      this.scene.add(w);
      this.demo.workers.push({ w, path: p, s: i * 3, carry: i === 2 ? buildCargo('crate') : null });
      if (this.demo.workers[i].carry) { this.demo.workers[i].carry.scale.setScalar(0.8); this.scene.add(this.demo.workers[i].carry); }
    });
    const types = ['crate', 'gnome', 'balloon', 'mystery', 'beans', 'magnet', 'wobble'];
    for (let i = 0; i < 9; i++) {
      const c = buildCargo(types[i % types.length]);
      this.scene.add(c);
      this.demo.cargo.push({ c, s: i * 4.4 });
    }
    this.demoPlant = {
      pw: [1, 1, 1], main: 1, es: [0, 0, 0], P: 55, b: { A: [1, 0, 2.3], B: [1, 0, 2.3], C: [1, 0, 2.3] },
      so: ['auto', 0, 0], di: [1, 0], dr: [0, 1, 0], al: 'inner', lift: 0, fan: 1, fanOn: 1, mag: 0, magOn: 0,
      tube: 1, hp: 1, oh: [], inc: [], ctl: {}, zg: {}, burst: 0,
    };
  }

  setDemoVisible(v) {
    for (const d of this.demo.workers) { d.w.visible = v; if (d.carry) d.carry.visible = v; }
    for (const d of this.demo.cargo) d.c.visible = v;
  }

  updateDemo(dt) {
    const d = this.demo;
    d.t += dt;
    for (const wk of d.workers) {
      wk.s += dt * 3.2;
      const p = wk.path;
      const seglens = p.map((a, i) => { const b = p[(i + 1) % p.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
      const total = seglens.reduce((a, b) => a + b, 0);
      let s = wk.s % total, i = 0;
      while (s > seglens[i]) { s -= seglens[i]; i++; }
      const a = p[i], b = p[(i + 1) % p.length];
      const t = s / seglens[i];
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      wk.w.position.set(x, 0, z);
      wk.w.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      animateWorker(wk.w, { speed: 3.2, grounded: true, vy: 0, state: 0, carrying: !!wk.carry, using: false, anim: 0 }, dt, this.time);
      if (wk.carry) { wk.carry.position.set(x + Math.sin(wk.w.rotation.y) * 0.9, 1.1, z + Math.cos(wk.w.rotation.y) * 0.9); wk.carry.rotation.y = wk.w.rotation.y; }
    }
    // cargo loop: belt A → sorter → belt B
    const total = 21.6 + 20.1;
    for (const c of d.cargo) {
      c.s = (c.s + dt * 2.3) % (total + 4);
      const s = c.s;
      const half = CARGO[c.c.userData.type].size[1] ? CARGO[c.c.userData.type].size[1] / 2 : CARGO[c.c.userData.type].size[0];
      if (s < 21.6) c.c.position.set(-27.5 + s, 0.7 + half, 0);
      else if (s < total) c.c.position.set(-4.1 + (s - 21.6), 0.7 + half, 0);
      else c.c.position.set(16 + (s - total) * 0.5, half, (s - total) * 0.4 - 0.8);
      c.c.visible = s < total + 3.5 && !(s > 8.5 + 4 && s < 8.5 + 10.5); // hide under the airlock doors
    }
  }

  // ───────────────────────────── portraits ─────────────────────────────
  portrait(outfit, seed = 0) {
    const key = JSON.stringify(outfit) + seed;
    this.portraitCache ??= new Map();
    if (this.portraitCache.has(key)) return this.portraitCache.get(key);
    if (!this.pr) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      this.pr = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.pr.outputColorSpace = THREE.SRGBColorSpace;
      this.pr.toneMapping = THREE.ACESFilmicToneMapping;
      this.prScene = new THREE.Scene();
      this.prScene.add(new THREE.HemisphereLight('#ffffff', '#887766', 2.0));
      const dl = new THREE.DirectionalLight('#fff3e0', 1.8); dl.position.set(2, 3, 4); this.prScene.add(dl);
      this.prCam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      this.prCam.position.set(0.9, 1.5, 3.0);
      this.prCam.lookAt(0, 1.0, 0);
    }
    const w = buildWorker(outfit, seed);
    w.rotation.y = 0.35;
    animateWorker(w, { speed: 0, grounded: true, vy: 0, state: 0 }, 0.016, 1.3);
    this.prScene.add(w);
    this.pr.setClearColor(0x000000, 0);
    this.pr.render(this.prScene, this.prCam);
    const url = this.pr.domElement.toDataURL('image/png');
    this.prScene.remove(w);
    this.portraitCache.set(key, url);
    return url;
  }

  // ───────────────────────────── per frame ─────────────────────────────
  setMode(m) {
    this.mode = m;
    this.desk.visible = m === 'menu';
    this.setDemoVisible(m === 'menu');
  }

  focusCamera(target, dist, snap = false) {
    const pos = target.clone().addScaledVector(CAM_DIR, dist);
    if (snap) { this.camPos.copy(pos); this.camTarget.copy(target); }
    this.camGoal = { pos, target };
  }

  render(state, dt, localIds) {
    this.time += dt;
    const t = this.time;
    if (this.mode === 'menu') {
      this.updateDemo(dt);
      this.level.update(this.demoPlant, { ph: 'menu', riders: {}, contracts: null, ledger: 0, shifts: 0, tier: 0 }, dt, t);
      const sway = Math.sin(t * 0.15) * 1.2;
      this.camGoal = { pos: new THREE.Vector3(-6 + sway, 19.5, 31), target: new THREE.Vector3(-4 + sway * 0.6, 0, -4) };
      if (Math.random() < dt * 2) { const wp = this.mug.getWorldPosition(new THREE.Vector3()); this.fx.steam(wp.x, wp.y + 0.6, wp.z, 1, 0.6); }
      this.ambientFx(this.demoPlant, null, dt);
    } else if (state) {
      this.syncPlayers(state, dt, localIds);
      this.syncCargo(state, dt);
      this.level.update(state.plant, state.game, dt, t, localIds);
      this.updateLighting(state, dt);
      this.ambientFx(state.plant, state, dt);
      this.updateCamera(state, localIds);
    }
    // smooth camera
    if (this.camGoal) {
      const far = this.camTarget.distanceTo(this.camGoal.target) > 14;
      const k = 1 - Math.exp(-dt * (this.mode === 'menu' ? 1.5 : far ? 9 : 4));
      this.camPos.lerp(this.camGoal.pos, k);
      this.camTarget.lerp(this.camGoal.target, k);
    }
    this.camera.position.copy(this.camPos);
    if (this.shake > 0 && this.settings.get('shake')) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camTarget);
    // keep the shadow frustum near the action
    this.sun.position.set(this.camTarget.x - 10, 30, this.camTarget.z + 14);
    this.sun.target.position.copy(this.camTarget);
    this.fx.update(dt);
    this.gl.render(this.scene, this.camera);
  }

  updateCamera(state, localIds) {
    const pts = [];
    for (const p of state.pl) if (localIds.includes(p.id) && p.s !== 4) pts.push(p);
    if (!pts.length) for (const p of state.pl) pts.push(p);
    if (!pts.length) return;
    let cx = 0, cz = 0, cy = 0;
    for (const p of pts) { cx += p.x; cz += p.z; cy += Math.min(p.y, 4); }
    cx /= pts.length; cz /= pts.length; cy /= pts.length;
    let spread = 0;
    for (const a of pts) for (const b of pts) spread = Math.max(spread, Math.hypot(a.x - b.x, (a.z - b.z) * 1.6));
    const dist = Math.min(42, 21 + spread * 0.8);
    cx = Math.max(BOUNDS.minX + 6, Math.min(BOUNDS.maxX - 6, cx));
    cz = Math.max(-18, Math.min(4, cz - 1));
    this.camGoal = { pos: new THREE.Vector3(cx, cy * 0.5, cz).addScaledVector(CAM_DIR, dist), target: new THREE.Vector3(cx, cy * 0.5, cz) };
  }

  updateLighting(state, dt) {
    const plant = state.plant, game = state.game;
    const dark = !!game?.dark;
    const black = !plant.main;
    const target = black ? 0.12 : dark ? 0.02 : 1;
    this.lightLevel += (target - this.lightLevel) * Math.min(1, dt * 3);
    const L = this.lightLevel;
    this.hemi.intensity = 0.12 + 1.03 * L;
    this.sun.intensity = 0.1 + 2.2 * L;
    this.fill.intensity = 0.1 + 0.35 * L;
    this.hemi.color.set(black ? '#ff9a9a' : '#e6f4ff');
    // torches (head lamps) for everyone when it's dark
    let i = 0;
    for (const p of state.pl) {
      if (i >= 4) break;
      const s = this.torches[i++];
      const on = L < 0.6 && p.s !== 4;
      s.intensity = on ? 160 * (1 - L) : 0;
      if (on) {
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        s.position.set(p.x, p.y + 1.6, p.z);
        s.target.position.set(p.x + fx * 4, 0, p.z + fz * 4);
      }
    }
    for (; i < 4; i++) this.torches[i].intensity = 0;
  }

  ambientFx(plant, state, dt) {
    const tick = (k, rate) => { this.emitT[k] = (this.emitT[k] || 0) + dt * rate; if (this.emitT[k] >= 1) { this.emitT[k] -= 1; return true; } return false; };
    if (plant.fan && tick('fan', 10)) this.fx.spawnSprite(new THREE.Vector3(FAN.x + (Math.random() - 0.5) * 1.6, 0.5, FAN.z + (Math.random() - 0.5) * 1.6), { color: '#dff8ff', size: 0.25, life: 0.8, vel: new THREE.Vector3(0, 6, -0.5), grow: 1.8, opacity: 0.4, drag: 0.4 });
    if (plant.P > 75 && tick('boil', (plant.P - 70) / 4)) this.fx.steam(BOILER.x + 0.6, 5.4, BOILER.z, 1, 3);
    if (plant.burst > 2.5 && tick('burst', 30)) this.fx.steam(BOILER.x, 3, BOILER.z, 2, 6);
    for (const m of plant.oh) {
      const p = MACHINE_FX[m];
      if (p && tick('oh' + m, 8)) { this.fx.spawnSprite(new THREE.Vector3(p[0], p[1] + 0.5, p[2]), { color: '#555', size: 0.5, life: 1.3, vel: new THREE.Vector3((Math.random() - 0.5), 2, (Math.random() - 0.5)), grow: 3, opacity: 0.55 }); if (Math.random() < 0.3) this.fx.sparks(p[0], p[1], p[2], 3); }
    }
    for (const b of CONVEYORS) {
      if (plant.b[b.id][1] && tick('jam' + b.id, 3)) this.fx.sparks(b.x0 + Math.random() * (b.x1 - b.x0), 0.8, (b.z0 + b.z1) / 2, 4);
    }
    if (plant.so[1] && tick('sorter', 4)) this.fx.sparks(SORTER.x, 1.8, SORTER.z + 1.2, 4, '#7ee0ff');
    if (plant.hp === 1 && tick('heat', 6)) this.fx.spawnSprite(new THREE.Vector3(HEATPAD.x + (Math.random() - 0.5), 0.4, HEATPAD.z + (Math.random() - 0.5)), { color: '#ffb56b', size: 0.2, life: 0.7, vel: new THREE.Vector3(0, 1.5, 0), grow: 2, opacity: 0.4, add: true });
    if (tick('incin', 5)) this.fx.flames(INCINERATOR.x, 0.8, INCINERATOR.z, 1);
    if (plant.dr && plant.dr[1] > 0.4 && plant.dr[2] > 0.4 && tick('wind', 25)) {
      const x = -6 + Math.random() * 20;
      this.fx.spawnSprite(new THREE.Vector3(x, 0.4 + Math.random() * 2, (Math.random() - 0.5) * 6), { color: '#ffffff', size: 0.18, life: 0.6, vel: new THREE.Vector3(14, 0, 0), grow: 0.5, opacity: 0.6, drag: 0 });
    }
    for (const zid in plant.zg || {}) {
      const z = ZONES.find((zz) => zz.id === zid);
      if (z && tick('zg' + zid, 14)) this.fx.spawnSprite(new THREE.Vector3(z.x0 + Math.random() * (z.x1 - z.x0), 0.2, z.z0 + Math.random() * (z.z1 - z.z0)), { color: '#c9a5ff', size: 0.22, life: 2, vel: new THREE.Vector3(0, 1.2, 0), grow: 0.6, opacity: 0.8, add: true, drag: 0 });
    }
  }

  syncPlayers(state, dt, localIds) {
    const seen = new Set();
    for (const p of state.pl) {
      seen.add(p.id);
      let w = this.workers.get(p.id);
      const key = JSON.stringify(p.o);
      if (w && w.key !== key) { this.scene.remove(w.model, w.model.userData.blob); this.workers.delete(p.id); w = null; }
      if (!w) {
        const model = buildWorker(p.o, p.slot ?? p.id);
        this.scene.add(model, model.userData.blob);
        w = { model, key, yaw: p.yaw, prevVy: 0, lastS: p.s };
        this.workers.set(p.id, w);
      }
      const m = w.model;
      m.visible = true;
      m.position.set(p.x, p.y - 0.42, p.z);
      let dy = p.yaw - w.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      w.yaw += dy * Math.min(1, dt * 18);
      m.rotation.y = w.yaw;
      const inTube = p.s === 3;
      m.scale.setScalar(inTube ? 0.7 : 1);
      if (inTube) m.rotation.x = Math.sin(this.time * 10) * 0.5;
      else m.rotation.x = 0;
      // transparency for disconnected workers
      const ghost = !p.c;
      if (ghost !== w.ghost) { w.ghost = ghost; m.traverse((o) => { if (o.isMesh && !o.userData.outline) { o.material = o.material.clone(); o.material.transparent = ghost; o.material.opacity = ghost ? 0.4 : 1; } }); }
      animateWorker(m, { speed: p.sp, grounded: !!p.g, vy: p.vy, prevVy: w.prevVy, state: p.s, carrying: p.hk === 1, carryingPlayer: p.hk === 2, using: !!p.u, anim: p.a, belt: !!p.belt }, dt, this.time + p.id);
      w.prevVy = p.vy;
      // blob shadow on whatever is below (approx: floor or sky dock or lift)
      const blob = m.userData.blob;
      let floorY = 0.02;
      if (p.x > 19 && p.x < 30 && p.z > -10 && p.z < -5) floorY = 2.82;
      blob.position.set(p.x, floorY, p.z);
      const h = Math.max(0, p.y - 0.42 - floorY);
      blob.scale.setScalar(Math.max(0.3, 1 - h * 0.15));
      blob.material.opacity = 0.22 * Math.max(0.2, 1 - h * 0.2);
      blob.visible = !inTube;
      if (w.lastS !== p.s && p.s === 1) this.fx.stars(p.x, p.y + 1.2, p.z);
      w.lastS = p.s;
    }
    for (const [id, w] of this.workers) if (!seen.has(id)) { this.fx.puff(w.model.position.x, 0.6, w.model.position.z, 10); this.scene.remove(w.model, w.model.userData.blob); this.workers.delete(id); }
  }

  syncCargo(state, dt) {
    const seen = new Set();
    for (const e of state.ents) {
      const [id, type, x, y, z, qx, qy, qz, qw, bay, heat, flags, ship] = e;
      seen.add(id);
      let c = this.cargo.get(id);
      if (!c) {
        const g = buildCargo(type);
        const badge = new THREE.Sprite(bayBadge(bay));
        badge.scale.setScalar(0.42);
        this.scene.add(g, badge);
        c = { g, badge, bay, type };
        this.cargo.set(id, c);
      }
      c.g.position.set(x, y, z);
      c.g.quaternion.set(qx, qy, qz, qw);
      const s = ship ? Math.max(0.05, 1 - ship) : 1;
      c.g.scale.setScalar(s * ((flags & 2) ? 0.8 : 1));
      if (c.bay !== bay) { c.badge.material = bayBadge(bay); c.bay = bay; if (bay !== '?') this.fx.sparks(x, y + 0.8, z, 6, '#c9a5ff'); }
      const by = c.g.userData.badgeY;
      c.badge.visible = by > -5 && !ship && !(flags & 2) && type !== 'duck';
      c.badge.position.set(x, y + by, z);
      c.badge.scale.setScalar(0.42 + ((flags & 1) ? 0.06 : 0) + Math.sin(this.time * 4 + id) * 0.02);
      if (type === 'beans') {
        const hm = c.g.userData.heatMat;
        if (hm) hm.emissiveIntensity = heat * 1.1;
        if (heat > 0.45 && Math.random() < dt * heat * 6) this.fx.spawnSprite(new THREE.Vector3(x, y + 0.4, z), { color: '#ffffff', size: 0.25, life: 0.8, vel: new THREE.Vector3(0, 1.5, 0), grow: 2.5, opacity: 0.5 });
      }
      if (type === 'magnet' && c.g.userData.ring) {
        c.g.userData.ring.material.emissiveIntensity = 0.6 + Math.sin(this.time * 6 + id) * 0.4;
      }
    }
    for (const [id, c] of this.cargo) {
      if (!seen.has(id)) {
        if (!c.gone) this.fx.puff(c.g.position.x, c.g.position.y, c.g.position.z, 6, '#f4ebd9', 0.4);
        this.scene.remove(c.g, c.badge);
        this.cargo.delete(id);
      }
    }
  }

  // ───────────────────────────── events → effects ─────────────────────────────
  onEvent(e) {
    const fx = this.fx;
    switch (e.type) {
      case 'dispense': fx.puff(DISPENSER.x, 3.6, DISPENSER.z, 6, '#f4ebd9', 0.45); break;
      case 'ship': {
        const pd = PADS[e.pad];
        this.level.flashPad(e.pad);
        fx.confetti(pd.x, (pd.y || 0) + 0.6, pd.z, 26, 5);
        const c = this.cargo.get(e.id); if (c) c.gone = true;
        break;
      }
      case 'reject': fx.puff(e.x, 0.8, e.z, 8, '#ff8a80', 0.5); fx.sparks(e.x, 0.6, e.z, 8, '#ff6b62'); break;
      case 'break': {
        const col = e.t === 'gnome' ? '#f6f1ea' : '#cccccc';
        fx.shards(e.x, e.y, e.z, col, 16); fx.shards(e.x, e.y, e.z, '#3b82d6', 6); fx.puff(e.x, e.y, e.z, 6, '#ffffff', 0.5);
        this.shake = Math.max(this.shake, 0.3);
        break;
      }
      case 'burn': fx.flames(INCINERATOR.x, 0.9, INCINERATOR.z, 14); fx.sparks(INCINERATOR.x, 1, INCINERATOR.z, 10, '#ff9a3c'); break;
      case 'burst': fx.steam(BOILER.x, 2.5, BOILER.z, 40, 7); fx.sparks(BOILER.x, 2.5, BOILER.z, 30); this.shake = 1.2; break;
      case 'thud': if (e.v > 4) fx.puff(e.x, e.y - 0.3, e.z, 3, '#e8e0d0', 0.35, 1); if (e.v > 7) this.shake = Math.max(this.shake, 0.15); break;
      case 'tube': fx.puff(TUBE.mouth[0], 1.2, TUBE.mouth[2], 6, '#bff7f2', 0.4); break;
      case 'tubeout': { const p = TUBE.path[TUBE.path.length - 1]; fx.puff(p[0], p[1] - 0.6, p[2], 8, '#bff7f2', 0.5, 2.5); break; }
      case 'fling': fx.sparks(SORTER.x, 1.0, SORTER.z, 12, '#7ee0ff'); break;
      case 'estop': this.shake = Math.max(this.shake, 0.2); break;
      case 'knock': if (e.why === 'burst' || e.why === 'cargo') this.shake = Math.max(this.shake, 0.25); break;
      case 'hop': { const c = this.cargo.get(e.id); if (c) fx.puff(c.g.position.x, c.g.position.y - 0.3, c.g.position.z, 3, '#ffd2a0', 0.3); break; }
      case 'incident': this.shake = Math.max(this.shake, 0.25); break;
      case 'jump': { const w = this.workers.get(e.id); if (w) fx.puff(w.model.position.x, 0.1 + w.model.position.y, w.model.position.z, 3, '#e8e0d0', 0.3, 0.8); break; }
      case 'quota': case 'otdone': {
        for (const pd of Object.values(PADS)) fx.confetti(pd.x, (pd.y || 0) + 1, pd.z, 40, 7);
        break;
      }
      case 'scan': { const c = this.cargo.get(e.id); if (c) fx.sparks(c.g.position.x, c.g.position.y + 0.6, c.g.position.z, 8, '#c9a5ff'); break; }
    }
  }

  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, behind: v.z > 1 };
  }

  cargoPos(id) { const c = this.cargo.get(id); return c ? c.g.position : null; }
}
