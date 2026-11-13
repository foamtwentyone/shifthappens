// The authoritative simulation. Runs on the dedicated server for online rooms
// and inside the browser for solo / couch play — the exact same code path.
import * as CANNON from 'cannon-es';
import {
  GRAVITY, PLAYER, CARGO, G_STATIC, G_PLAYER, G_CARGO, G_DOOR, G_HELD,
  OUTFIT_COLORS, HATS, FACES,
} from '../constants.js';
import { WALLS, SKY_DOCK, SPAWNS, LOBBY_BALL, zoneAt } from '../level.js';
import { mulberry32, clamp, r3, r2 } from './util.js';
import { Plant } from './plant.js';
import { Game } from './game.js';

const UP = new CANNON.Vec3(0, 1, 0);
const tmpA = new CANNON.Vec3();
const tmpB = new CANNON.Vec3();
const rayResult = new CANNON.RaycastResult();

export const STATE = { ok: 0, down: 1, carried: 2, tube: 3, gone: 4 };
export const STATE_NAMES = ['ok', 'down', 'carried', 'tube', 'gone'];
export const BTN = { run: 1, jump: 2, grab: 4, use: 8, throw: 16 };

function newStats() {
  return {
    delivered: 0, earned: 0, broken: 0, knockdowns: 0, beltTime: 0, tubeRides: 0,
    thrownMates: 0, timesThrown: 0, valveTime: 0, fixes: 0, estops: 0, misdeliveries: 0,
    burnt: 0, distance: 0, jumps: 0, maxMistake: 0, maxMistakeWhat: '',
  };
}

export class Sim {
  constructor(opts = {}) {
    this.seed = opts.seed ?? ((Date.now() ^ 0x5bd1e995) >>> 0);
    this.rnd = mulberry32(this.seed);
    this.time = 0;
    this.tick = 0;
    this.nextId = 100;
    this.events = [];
    this.cargo = new Map();
    this.players = new Map();
    this.controls = [];
    this.controlById = new Map();
    this.collisions = [];
    this.zoneGravity = {}; // zone id -> gravity multiplier (gravity flux incident)

    const world = (this.world = new CANNON.World());
    world.gravity.set(0, -GRAVITY, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 10;
    world.allowSleep = false;

    const M = (this.mat = {
      ground: new CANNON.Material('ground'),
      belt: new CANNON.Material('belt'),
      player: new CANNON.Material('player'),
      cargo: new CANNON.Material('cargo'),
    });
    const cm = (a, b, friction, restitution) =>
      world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
    cm(M.player, M.ground, 0, 0);
    cm(M.player, M.belt, 0, 0);
    cm(M.player, M.cargo, 0.05, 0.05);
    cm(M.player, M.player, 0, 0.25);
    cm(M.cargo, M.ground, 0.45, 0.12);
    cm(M.cargo, M.belt, 0.0, 0.02);
    cm(M.cargo, M.cargo, 0.35, 0.1);

    this.buildStatic();
    this.plant = new Plant(this);
    this.game = new Game(this);
    this.spawnToy('ball', LOBBY_BALL);
  }

  id() { return this.nextId++; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }

  // ───────────────────────────── static world ─────────────────────────────
  staticBox(x, y, z, w, h, d, material = this.mat.ground) {
    const body = new CANNON.Body({ mass: 0, material, collisionFilterGroup: G_STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, y, z);
    this.world.addBody(body);
    return body;
  }

  kinematicBox(x, y, z, w, h, d, group = G_DOOR) {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.mat.ground, collisionFilterGroup: group });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, y, z);
    this.world.addBody(body);
    return body;
  }

  buildStatic() {
    const floor = new CANNON.Body({ mass: 0, material: this.mat.ground, collisionFilterGroup: G_STATIC });
    floor.addShape(new CANNON.Plane());
    floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(floor);
    for (const w of WALLS) this.staticBox(w.x, w.h / 2, w.z, w.w, w.h, w.d);
    const s = SKY_DOCK;
    this.staticBox((s.x0 + s.x1) / 2, s.top / 2, (s.z0 + s.z1) / 2, s.x1 - s.x0, s.top, s.z1 - s.z0);
    // a ceiling so nothing escapes into the void
    this.staticBox(-8, 9, -6, 80, 1, 34);
    // break room furniture
    this.staticBox(-44.6, 1.1, -8.6, 1.6, 2.2, 1.2); // vending machine
    this.staticBox(-40, 0.35, 6.8, 4.2, 0.7, 1.3); // couch
    this.staticBox(-45.55, 1.2, 5, 0.9, 2.4, 6.2); // lockers
  }

  // ───────────────────────────── players ─────────────────────────────
  addPlayer({ name, outfit, slot }) {
    const id = this.id();
    const sp = SPAWNS[this.players.size % SPAWNS.length];
    const body = new CANNON.Body({
      mass: 70, material: this.mat.player, fixedRotation: true,
      collisionFilterGroup: G_PLAYER, collisionFilterMask: G_STATIC | G_PLAYER | G_CARGO | G_DOOR | G_HELD,
      linearDamping: 0.01,
    });
    body.addShape(new CANNON.Sphere(PLAYER.radius));
    body.position.set(sp[0], sp[1], sp[2]);
    body.userData = { kind: 'player', id };
    body.addEventListener('collide', (e) => this.collisions.push({ a: body, b: e.body, e }));
    this.world.addBody(body);
    const n = this.players.size;
    // friends with identical saved outfits still get told apart
    const used = new Set([...this.players.values()].map((q) => q.outfit.color));
    if (outfit && used.has(outfit.color)) {
      outfit = { ...outfit, color: OUTFIT_COLORS.find((c) => !used.has(c)) ?? outfit.color };
      const hats = new Set([...this.players.values()].map((q) => q.outfit.hat));
      if (hats.has(outfit.hat)) outfit.hat = HATS.find((h) => !hats.has(h)) ?? outfit.hat;
    }
    const p = {
      id, name: (name || `Worker ${n + 1}`).slice(0, 14), body, slot: slot ?? n,
      outfit: {
        color: outfit?.color ?? OUTFIT_COLORS.find((c) => !used.has(c)) ?? OUTFIT_COLORS[n % OUTFIT_COLORS.length],
        hat: outfit?.hat ?? HATS[n % HATS.length],
        face: outfit?.face ?? FACES[n % FACES.length],
      },
      yaw: 0, state: STATE.ok, downT: 0, holding: null, carriedBy: null, escape: 0,
      input: { mx: 0, mz: 0, b: 0, c: [0, 0, 0, 0] }, lastC: [0, 0, 0, 0], held: 0,
      grounded: false, using: null, ready: false, connected: true, goneT: 0,
      shoveCd: 0, beltT: 0, lastPos: [sp[0], sp[2]], speed: 0, anim: 0, emote: 0,
      prompt: null, stats: newStats(), tube: null, jumpT: 0, onBelt: null,
    };
    this.players.set(id, p);
    this.emit('join', { id, name: p.name });
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.releaseHold(p);
    if (p.carriedBy) {
      const h = this.players.get(p.carriedBy);
      if (h) h.holding = null;
    }
    this.world.removeBody(p.body);
    this.players.delete(id);
    this.emit('leave', { id, name: p.name });
  }

  setInput(pid, input) {
    const p = this.players.get(pid);
    if (!p || !input) return;
    p.input.mx = clamp(+input.mx || 0, -1, 1);
    p.input.mz = clamp(+input.mz || 0, -1, 1);
    p.input.b = input.b | 0;
    if (Array.isArray(input.c)) p.input.c = input.c.slice(0, 4).map((v) => v | 0);
  }

  pressed(p, k) {
    // edge detection via press counters: robust against network batching
    return p.input.c[k] !== p.lastC[k];
  }

  fwd(p) { return [Math.sin(p.yaw), Math.cos(p.yaw)]; }

  zoneOf(body) { return zoneAt(body.position.x, body.position.z); }

  knockDown(p, vx, vy, vz, dur = 1.4, why = '') {
    if (p.state === STATE.tube || p.state === STATE.gone) return;
    if (p.state === STATE.carried) return;
    this.releaseHold(p);
    if (p.state !== STATE.down) p.stats.knockdowns++;
    p.state = STATE.down;
    p.downT = Math.max(p.downT, dur);
    p.body.velocity.set(p.body.velocity.x + vx, p.body.velocity.y + vy, p.body.velocity.z + vz);
    this.emit('knock', { id: p.id, why, x: r2(p.body.position.x), y: r2(p.body.position.y), z: r2(p.body.position.z) });
  }

  groundCheck(p) {
    const b = p.body;
    tmpA.copy(b.position);
    tmpB.set(b.position.x, b.position.y - PLAYER.radius - 0.18, b.position.z);
    rayResult.reset();
    this.world.raycastClosest(tmpA, tmpB, {
      collisionFilterMask: G_STATIC | G_CARGO | G_DOOR,
      skipBackfaces: true,
    }, rayResult);
    return rayResult.hasHit;
  }

  updatePlayer(p, dt) {
    const b = p.body;
    const inp = p.input;
    p.shoveCd -= dt;
    if (p.state === STATE.gone) return;

    // disconnected players go limp (and can be carried to safety by friends)
    if (!p.connected) { inp.mx = 0; inp.mz = 0; inp.b = 0; }

    if (p.state === STATE.tube) return; // driven by the pneumatic tube

    if (p.state === STATE.carried) {
      if (this.pressed(p, 0)) p.escape++;
      p.held += dt;
      if (p.escape >= 4 || p.held > 5) {
        const h = this.players.get(p.carriedBy);
        if (h) h.holding = null;
        this.dropPlayer(p, 0, 5, 0);
        this.emit('voice', { id: p.id, kind: 'escape' });
      }
      return;
    }

    p.grounded = this.groundCheck(p);

    if (p.state === STATE.down) {
      p.downT -= dt;
      if (p.grounded) {
        b.velocity.x *= 1 - Math.min(1, 4 * dt);
        b.velocity.z *= 1 - Math.min(1, 4 * dt);
      }
      if (p.downT <= 0 && (p.grounded || p.downT < -2)) {
        p.state = STATE.ok;
        this.emit('getup', { id: p.id });
      }
      return;
    }

    // ── movement ──
    let mx = inp.mx, mz = inp.mz;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    let speed = inp.b & BTN.run ? PLAYER.run : PLAYER.walk;
    let carryFactor = 1;
    if (p.holding?.kind === 'cargo') {
      const c = this.cargo.get(p.holding.id);
      if (c) {
        const def = CARGO[c.type];
        carryFactor = def.carry[Math.min(c.holders.size, 3) - 1] ?? 1;
        if (carryFactor < 0.6) speed = Math.min(speed, PLAYER.walk); // no sprinting with a crate
      }
    } else if (p.holding?.kind === 'player') {
      carryFactor = 0.75;
    }
    let tx = mx * speed * carryFactor;
    let tz = mz * speed * carryFactor;

    // ground / environment velocity (belts, wind)
    const env = this.plant.surfaceVelocity(b.position.x, b.position.y - PLAYER.radius, b.position.z, p.grounded);
    if (env.belt) { p.onBelt = env.belt; p.stats.beltTime += dt; } else p.onBelt = null;
    tx += env.vx; tz += env.vz;

    const accel = p.grounded ? PLAYER.accel : PLAYER.airAccel;
    const dvx = tx - b.velocity.x, dvz = tz - b.velocity.z;
    const dvl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dvl > maxDv) {
      b.velocity.x += (dvx / dvl) * maxDv;
      b.velocity.z += (dvz / dvl) * maxDv;
    } else {
      b.velocity.x = tx; b.velocity.z = tz;
    }

    if (len > 0.15) {
      const target = Math.atan2(mx, mz);
      let d = target - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, 14 * dt);
    }

    p.jumpT -= dt;
    if (this.pressed(p, 0) && p.grounded && p.jumpT <= 0) {
      b.velocity.y = PLAYER.jump * (p.holding?.kind === 'cargo' && carryFactor < 0.6 ? 0.55 : 1);
      p.jumpT = 0.25;
      p.stats.jumps++;
      this.emit('jump', { id: p.id });
    }

    // ── grab / drop ──
    if (this.pressed(p, 1)) {
      if (p.holding) this.drop(p);
      else this.tryGrab(p);
    }
    // ── throw / shove ──
    if (this.pressed(p, 3)) {
      if (p.holding) this.throwHeld(p);
      else this.shove(p);
    }
  }

  // ───────────────────────────── holding ─────────────────────────────
  findGrabTarget(p) {
    const [fx, fz] = this.fwd(p);
    const px = p.body.position.x, py = p.body.position.y, pz = p.body.position.z;
    let best = null, bestScore = Infinity;
    for (const c of this.cargo.values()) {
      if (c.tube || c.shipping || c.holders.size >= 3) continue;
      const def = CARGO[c.type];
      const dx = c.body.position.x - px, dz = c.body.position.z - pz, dy = c.body.position.y - py;
      if (dy < -1.3 || dy > 1.9) continue;
      const d = Math.hypot(dx, dz);
      const reach = PLAYER.reach + c.radius * 0.6 + (c.holders.size ? 0.6 : 0);
      if (d > reach) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (facing < -0.3) continue;
      const score = d - facing * 0.6 + (def.toy ? 0.3 : 0);
      if (score < bestScore) { bestScore = score; best = { kind: 'cargo', id: c.id, name: def.short }; }
    }
    for (const q of this.players.values()) {
      if (q === p || q.state === STATE.carried || q.state === STATE.tube || q.state === STATE.gone) continue;
      if (q.holding?.kind === 'player' && q.holding.id === p.id) continue;
      const dx = q.body.position.x - px, dz = q.body.position.z - pz, dy = q.body.position.y - py;
      if (Math.abs(dy) > 1.4) continue;
      const d = Math.hypot(dx, dz);
      if (d > PLAYER.reach) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (facing < 0.2) continue;
      const score = d - facing * 0.6 + 0.5; // cargo preferred
      if (score < bestScore) { bestScore = score; best = { kind: 'player', id: q.id, name: q.name.toUpperCase() }; }
    }
    return best;
  }

  tryGrab(p) {
    const t = this.findGrabTarget(p);
    if (!t) return;
    if (t.kind === 'cargo') {
      const c = this.cargo.get(t.id);
      c.holders.add(p.id);
      c.lastTouch = p.id;
      c.body.collisionFilterGroup = G_HELD;
      c.body.collisionFilterMask = G_STATIC | G_CARGO | G_DOOR;
      c.restT = 0;
      p.holding = { kind: 'cargo', id: c.id };
      this.emit('grab', { id: p.id, t: c.type, co: c.holders.size > 1 });
    } else {
      const q = this.players.get(t.id);
      if (q.holding) this.releaseHold(q);
      q.state = STATE.carried;
      q.carriedBy = p.id;
      q.escape = 0; q.held = 0;
      q.body.collisionFilterGroup = G_HELD;
      q.body.collisionFilterMask = G_STATIC | G_CARGO | G_DOOR;
      p.holding = { kind: 'player', id: q.id };
      this.emit('grab', { id: p.id, t: 'player', who: q.id });
      this.emit('voice', { id: q.id, kind: 'yelp' });
    }
  }

  releaseHold(p) {
    if (!p.holding) return;
    if (p.holding.kind === 'cargo') {
      const c = this.cargo.get(p.holding.id);
      if (c) {
        c.holders.delete(p.id);
        if (c.holders.size === 0) this.resetCargoFilter(c);
      }
    } else {
      const q = this.players.get(p.holding.id);
      if (q) this.dropPlayer(q, 0, 0, 0);
    }
    p.holding = null;
  }

  resetCargoFilter(c) {
    c.body.collisionFilterGroup = G_CARGO;
    c.body.collisionFilterMask = G_STATIC | G_PLAYER | G_CARGO | G_DOOR | G_HELD;
  }

  dropPlayer(q, vx, vy, vz, dur = 0.6) {
    q.carriedBy = null;
    q.body.collisionFilterGroup = G_PLAYER;
    q.body.collisionFilterMask = G_STATIC | G_PLAYER | G_CARGO | G_DOOR | G_HELD;
    q.state = STATE.down;
    q.downT = dur;
    q.body.velocity.set(vx, vy, vz);
  }

  drop(p) {
    const h = p.holding;
    if (!h) return;
    this.releaseHold(p);
    this.emit('drop', { id: p.id });
  }

  throwHeld(p) {
    const h = p.holding;
    const [fx, fz] = this.fwd(p);
    const pv = p.body.velocity;
    if (h.kind === 'cargo') {
      const c = this.cargo.get(h.id);
      if (!c) { p.holding = null; return; }
      const def = CARGO[c.type];
      const n = c.holders.size;
      // heaving heavy things works much better as a team
      const strength = clamp((n * 55) / (def.mass + 12), 0.15, 1.35);
      const sp = PLAYER.throwSpeed * strength;
      for (const hid of [...c.holders]) {
        const hp = this.players.get(hid);
        if (hp) { hp.holding = null; this.emit('throw', { id: hp.id, t: c.type, n }); }
      }
      c.holders.clear();
      this.resetCargoFilter(c);
      c.lastThrower = p.id;
      c.thrownT = 1.5;
      c.body.velocity.set(pv.x * 0.5 + fx * sp, 3.2 + sp * 0.35, pv.z * 0.5 + fz * sp);
      c.body.angularVelocity.set((this.rnd() - 0.5) * 6, (this.rnd() - 0.5) * 6, (this.rnd() - 0.5) * 6);
    } else {
      const q = this.players.get(h.id);
      p.holding = null;
      if (q) {
        this.dropPlayer(q, pv.x * 0.5 + fx * 10.5, 7.5, pv.z * 0.5 + fz * 10.5, 1.6);
        q.thrownBy = p.id;
        q.stats.timesThrown++;
        p.stats.thrownMates++;
        this.emit('throw', { id: p.id, t: 'player', who: q.id });
        this.emit('voice', { id: q.id, kind: 'wee' });
      }
    }
  }

  shove(p) {
    if (p.shoveCd > 0) return;
    p.shoveCd = 0.7;
    const [fx, fz] = this.fwd(p);
    const px = p.body.position.x, pz = p.body.position.z;
    this.emit('shove', { id: p.id });
    for (const q of this.players.values()) {
      if (q === p || q.state !== STATE.ok) continue;
      const dx = q.body.position.x - px, dz = q.body.position.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > 1.35 || (dx * fx + dz * fz) / (d || 1) < 0.3) continue;
      this.knockDown(q, fx * PLAYER.shoveImpulse, 3, fz * PLAYER.shoveImpulse, 0.75, 'shove');
      this.emit('voice', { id: q.id, kind: 'oof' });
    }
    for (const c of this.cargo.values()) {
      if (c.holders.size || c.tube) continue;
      const dx = c.body.position.x - px, dz = c.body.position.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > 1.4 || (dx * fx + dz * fz) / (d || 1) < 0.3) continue;
      const k = clamp(12 / (CARGO[c.type].mass + 4), 0.15, 2.5);
      c.body.velocity.x += fx * 5 * k;
      c.body.velocity.z += fz * 5 * k;
      c.body.velocity.y += 2 * k;
      c.lastTouch = p.id;
    }
  }

  holdPoint(p, c) {
    const [fx, fz] = this.fwd(p);
    const reach = 0.55 + (c ? c.radius : 0.4);
    return [p.body.position.x + fx * reach, p.body.position.y + 0.55, p.body.position.z + fz * reach];
  }

  updateHeld(dt) {
    // cargo held by 1..3 players: PD spring toward the mean hold point
    for (const c of this.cargo.values()) {
      if (!c.holders.size) continue;
      const def = CARGO[c.type];
      let tx = 0, ty = 0, tz = 0, n = 0;
      for (const hid of c.holders) {
        const hp = this.players.get(hid);
        if (!hp || hp.state !== STATE.ok) { c.holders.delete(hid); if (hp) hp.holding = null; continue; }
        const hpnt = this.holdPoint(hp, c);
        tx += hpnt[0]; ty += hpnt[1]; tz += hpnt[2]; n++;
      }
      if (!n) { this.resetCargoFilter(c); continue; }
      tx /= n; ty /= n; tz /= n;
      ty += c.halfH * 0.35 + 0.15;
      const b = c.body;
      const dragging = def.mass >= 40 && n === 1; // one person can only drag heavy crates
      const k = 160, damp = 22;
      const ax = k * (tx - b.position.x) - damp * b.velocity.x;
      const az = k * (tz - b.position.z) - damp * b.velocity.z;
      let ay = dragging ? 0 : k * (ty - b.position.y) - damp * b.velocity.y + GRAVITY * (def.gravityScale ?? 1);
      const maxA = (n * 2600) / def.mass;
      const al = Math.hypot(ax, ay, az);
      const s = al > maxA ? maxA / al : 1;
      b.velocity.x += ax * s * dt;
      b.velocity.y += ay * s * dt;
      b.velocity.z += az * s * dt;
      // keep it upright-ish and facing the carrier
      b.angularVelocity.scale(dragging ? 0.95 : 0.8, b.angularVelocity);
      if (!dragging) {
        const hp = this.players.get([...c.holders][0]);
        tmpQ.setFromAxisAngle(UP, hp.yaw);
        b.quaternion.slerp(tmpQ, 0.12, b.quaternion);
      }
      const err = Math.hypot(tx - b.position.x, tz - b.position.z);
      c.snagT = err > 2.0 ? (c.snagT || 0) + dt : 0;
      if (c.snagT > 0.4) {
        for (const hid of [...c.holders]) { const hp = this.players.get(hid); if (hp) hp.holding = null; }
        c.holders.clear();
        this.resetCargoFilter(c);
        this.emit('drop', { id: 0 });
      }
      if (c.type === 'wobble') c.wobT = (c.wobT ?? 1.2) - dt;
    }
    // players carried by players
    for (const q of this.players.values()) {
      if (q.state !== STATE.carried) continue;
      const h = this.players.get(q.carriedBy);
      if (!h || h.state !== STATE.ok || h.holding?.id !== q.id) {
        if (h && h.holding?.id === q.id) h.holding = null;
        this.dropPlayer(q, 0, 0, 0);
        continue;
      }
      const [fx, fz] = this.fwd(h);
      const tx = h.body.position.x + fx * 0.7, ty = h.body.position.y + 1.05, tz = h.body.position.z + fz * 0.7;
      const b = q.body;
      b.velocity.set((tx - b.position.x) * 18, (ty - b.position.y) * 18, (tz - b.position.z) * 18);
      q.yaw = h.yaw + Math.PI * 0.5;
    }
  }

  // ───────────────────────────── cargo ─────────────────────────────
  spawnCargo(type, pos, opts = {}) {
    const def = CARGO[type];
    const id = this.id();
    const body = new CANNON.Body({
      mass: def.mass, material: this.mat.cargo,
      collisionFilterGroup: G_CARGO, collisionFilterMask: G_STATIC | G_PLAYER | G_CARGO | G_DOOR | G_HELD,
      linearDamping: type === 'balloon' ? 0.35 : 0.04, angularDamping: 0.12,
    });
    let radius, halfH;
    if (def.shape === 'box') {
      body.addShape(new CANNON.Box(new CANNON.Vec3(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2)));
      radius = Math.max(def.size[0], def.size[2]) / 2; halfH = def.size[1] / 2;
    } else if (def.shape === 'cyl') {
      body.addShape(new CANNON.Cylinder(def.size[0], def.size[0], def.size[1], 10));
      radius = def.size[0]; halfH = def.size[1] / 2;
    } else {
      body.addShape(new CANNON.Sphere(def.size[0]));
      radius = def.size[0]; halfH = def.size[0];
    }
    body.position.set(pos[0], pos[1], pos[2]);
    if (opts.spin) body.angularVelocity.set((this.rnd() - 0.5) * 3, (this.rnd() - 0.5) * 3, (this.rnd() - 0.5) * 3);
    if (opts.vel) body.velocity.set(...opts.vel);
    body.userData = { kind: 'cargo', id };
    body.addEventListener('collide', (e) => this.collisions.push({ a: body, b: e.body, e }));
    this.world.addBody(body);
    let bay = def.bay;
    if (type === 'mystery') bay = ['A', 'B', 'C'][Math.floor(this.rnd() * 3)];
    const c = {
      id, type, body, bay, radius, halfH, scanned: type !== 'mystery', heat: 0, holders: new Set(),
      lastTouch: 0, lastThrower: 0, thrownT: 0, restT: 0, padT: 0, tube: null, shipping: 0,
      spawnT: this.time, hopT: 1, wobT: 1.5, ot: !!opts.ot, route: null, onBelt: null,
    };
    this.cargo.set(id, c);
    return c;
  }

  spawnToy(type, pos) { return this.spawnCargo(type, pos); }

  removeCargo(c) {
    for (const hid of c.holders) { const hp = this.players.get(hid); if (hp) hp.holding = null; }
    c.holders.clear();
    this.world.removeBody(c.body);
    this.cargo.delete(c.id);
  }

  breakCargo(c, why = 'smash') {
    if (!this.cargo.has(c.id)) return;
    const def = CARGO[c.type];
    const by = c.lastThrower && c.thrownT > 0 ? c.lastThrower : c.lastTouch;
    this.emit('break', { t: c.type, x: r2(c.body.position.x), y: r2(c.body.position.y), z: r2(c.body.position.z), by, why });
    this.removeCargo(c);
    this.game.onBroken(c, by, def);
  }

  updateCargoBehaviour(dt) {
    for (const c of this.cargo.values()) {
      if (c.tube) continue;
      c.thrownT -= dt;
      const b = c.body;
      if (c.type === 'beans') {
        if (c.heat > 0.35) {
          c.hopT -= dt * c.heat;
          if (c.hopT <= 0) {
            c.hopT = 0.6 + this.rnd() * 0.8;
            const a = this.rnd() * Math.PI * 2;
            const s = 1.5 + c.heat * 2.5;
            b.velocity.x += Math.cos(a) * s;
            b.velocity.z += Math.sin(a) * s;
            b.velocity.y += 3 + c.heat * 3.5;
            b.angularVelocity.set((this.rnd() - 0.5) * 10, (this.rnd() - 0.5) * 4, (this.rnd() - 0.5) * 10);
            this.emit('hop', { id: c.id });
            for (const hid of c.holders) {
              const hp = this.players.get(hid);
              if (hp && this.rnd() < 0.25 * c.heat) { this.knockDown(hp, Math.cos(a) * 3, 3, Math.sin(a) * 3, 0.6, 'beans'); this.emit('voice', { id: hp.id, kind: 'hot' }); }
            }
          }
        }
        c.heat = Math.max(0, c.heat - dt / 28);
      }
      if (c.type === 'wobble') {
        c.wobT -= dt * (c.holders.size ? 0 : 0.5);
        if (c.holders.size && c.wobT <= 0) {
          c.wobT = 1.1 + this.rnd() * 1.2;
          const a = this.rnd() * Math.PI * 2;
          const s = 3.2 / Math.max(1, c.holders.size);
          for (const hid of c.holders) {
            const hp = this.players.get(hid);
            if (!hp) continue;
            hp.body.velocity.x += Math.cos(a) * s * 1.6;
            hp.body.velocity.z += Math.sin(a) * s * 1.6;
            if (c.holders.size === 1 && this.rnd() < 0.18) this.knockDown(hp, Math.cos(a) * 3, 2, Math.sin(a) * 3, 0.7, 'wobble');
          }
          b.velocity.x += Math.cos(a) * s; b.velocity.z += Math.sin(a) * s;
          this.emit('slosh', { id: c.id });
        } else if (!c.holders.size && c.wobT <= 0) {
          c.wobT = 2 + this.rnd() * 3;
          if (b.velocity.length() < 0.5) {
            b.angularVelocity.y += (this.rnd() - 0.5) * 6;
            b.velocity.x += (this.rnd() - 0.5) * 2; b.velocity.z += (this.rnd() - 0.5) * 2;
            this.emit('slosh', { id: c.id });
          }
        }
      }
      // fell through / out of the world
      if (b.position.y < -6 || Math.abs(b.position.x) > 200) {
        this.game.onLost(c);
        this.removeCargo(c);
      }
    }
  }

  // ───────────────────────────── collisions ─────────────────────────────
  processCollisions() {
    const seen = new Set();
    for (const { a, b, e } of this.collisions) {
      const ua = a.userData, ub = b.userData;
      if (!ua) continue;
      const key = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
      if (seen.has(key)) continue;
      seen.add(key);
      let impact = 0;
      try { impact = Math.abs(e.contact.getImpactVelocityAlongNormal()); } catch { impact = 0; }
      if (ua.kind === 'cargo') {
        const c = this.cargo.get(ua.id);
        if (!c) continue;
        const def = CARGO[c.type];
        if (impact > 2.2) this.emit('thud', { t: c.type, v: r2(Math.min(impact, 12)), x: r2(a.position.x), y: r2(a.position.y), z: r2(a.position.z) });
        if (def.fragile && impact > def.fragile && this.time - c.spawnT > 1.2) { this.breakCargo(c, 'smash'); continue; }
        if (ub?.kind === 'player') {
          const p = this.players.get(ub.id);
          if (p && p.state === STATE.ok && !c.holders.has(p.id) && impact > PLAYER.ragdollHit && def.mass > 2.5) {
            const v = a.velocity;
            this.knockDown(p, v.x * 0.5, 4, v.z * 0.5, 1.2, 'cargo');
            this.emit('voice', { id: p.id, kind: 'oof' });
          }
        }
      } else if (ua.kind === 'player' && ub?.kind === 'player') {
        const p = this.players.get(ua.id), q = this.players.get(ub.id);
        // a thrown worker bowls over whoever they land on
        if (p && q && p.state === STATE.down && q.state === STATE.ok && impact > 6) {
          this.knockDown(q, a.velocity.x * 0.4, 3, a.velocity.z * 0.4, 1.0, 'bowled');
          this.emit('voice', { id: q.id, kind: 'oof' });
        }
      }
    }
    this.collisions.length = 0;
  }

  // ───────────────────────────── prompts ─────────────────────────────
  updatePrompts() {
    for (const p of this.players.values()) {
      if (p.state !== STATE.ok) { p.prompt = null; continue; }
      const pr = {};
      if (p.holding) {
        pr.g = 'DROP';
        if (p.holding.kind === 'cargo') {
          const c = this.cargo.get(p.holding.id);
          if (c) pr.t = c.holders.size > 1 ? 'HEAVE!' : CARGO[c.type].mass >= 40 ? 'SHOVE' : 'THROW';
        } else pr.t = 'YEET';
      } else {
        const t = this.findGrabTarget(p);
        if (t) {
          if (t.kind === 'cargo') {
            const c = this.cargo.get(t.id);
            pr.g = c.holders.size ? `HELP CARRY ${t.name}` : `GRAB ${t.name}`;
          } else pr.g = `PICK UP ${t.name}`;
        }
      }
      const ctl = this.findControl(p);
      if (ctl) {
        pr.u = ctl.label;
        pr.k = ctl.c.kind;
        if (ctl.c.kind === 'hold') pr.p = r2(ctl.c.progress || 0);
        pr.cid = ctl.c.id;
      }
      p.prompt = pr.g || pr.u ? pr : null;
    }
  }

  // ───────────────────────────── controls ─────────────────────────────
  addControl(c) {
    c.progress = 0;
    this.controls.push(c);
    this.controlById.set(c.id, c);
    return c;
  }

  controlPos(c) { return typeof c.pos === 'function' ? c.pos(this) : c.pos; }

  findControl(p) {
    const px = p.body.position.x, py = p.body.position.y, pz = p.body.position.z;
    const [fx, fz] = this.fwd(p);
    let best = null, bestScore = Infinity, bestLabel = null;
    for (const c of this.controls) {
      const pos = this.controlPos(c);
      if (!pos) continue;
      const dx = pos[0] - px, dz = pos[2] - pz, dy = pos[1] - py;
      if (dy > 2.0 || dy < -1.6) continue;
      const d = Math.hypot(dx, dz);
      if (d > PLAYER.reach + (c.r || 0.35)) continue;
      const label = c.label(this, p);
      if (!label) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const score = d - facing * 0.5 - (c.priority || 0);
      if (score < bestScore) { bestScore = score; best = c; bestLabel = label; }
    }
    return best ? { c: best, label: bestLabel } : null;
  }

  updateControls(dt) {
    const holders = new Map();
    for (const p of this.players.values()) {
      if (p.state !== STATE.ok) { p.using = null; continue; }
      const useHeld = (p.input.b & BTN.use) !== 0;
      const usePressed = this.pressed(p, 2);
      if (!useHeld && !usePressed) { p.using = null; continue; }
      const found = this.findControl(p);
      if (!found) { p.using = null; continue; }
      const c = found.c;
      if (c.kind === 'press') {
        if (usePressed) {
          c.act(this, p);
          p.using = c.id;
          p.anim = 0.35;
          this.emit('click', { cid: c.id, id: p.id, snd: c.snd || 'button' });
        }
      } else if (useHeld) {
        p.using = c.id;
        if (!holders.has(c)) holders.set(c, []);
        holders.get(c).push(p);
        if (usePressed) this.emit('click', { cid: c.id, id: p.id, snd: c.snd || 'grab' });
      }
    }
    for (const c of this.controls) {
      if (c.kind !== 'hold' && c.kind !== 'stream') continue;
      const hs = holders.get(c);
      if (c.kind === 'stream') {
        if (hs) c.onHold(this, hs, dt);
        c.active = !!hs;
        continue;
      }
      if (hs) {
        const n = hs.length;
        const rate = c.twoHand ? (n === 1 ? 0.45 : 1 + 0.5 * (n - 2)) : 1 + 0.75 * (n - 1);
        c.progress += (dt * rate) / (c.holdTime || 2);
        c.active = true;
        if (c.progress >= 1) {
          c.progress = 0;
          c.complete(this, hs);
          for (const p of hs) p.using = null;
          this.emit('fixed', { cid: c.id, n });
        }
      } else {
        c.active = false;
        c.progress = Math.max(0, c.progress - dt * 0.6);
      }
    }
  }

  // ───────────────────────────── main step ─────────────────────────────
  step(dt) {
    this.time += dt;
    this.tick++;
    this.game.preStep(dt);
    for (const p of this.players.values()) this.updatePlayer(p, dt);
    this.updateControls(dt);
    this.updateHeld(dt);
    this.plant.update(dt);
    this.updateCargoBehaviour(dt);
    this.world.step(dt);
    this.processCollisions();
    for (const p of this.players.values()) {
      p.lastC = p.input.c.slice();
      p.anim = Math.max(0, p.anim - dt);
      const b = p.body;
      const d = Math.hypot(b.position.x - p.lastPos[0], b.position.z - p.lastPos[1]);
      if (d < 2) p.stats.distance += d;
      p.lastPos[0] = b.position.x; p.lastPos[1] = b.position.z;
      p.speed = Math.hypot(b.velocity.x, b.velocity.z);
      if (b.position.y < -5 && p.state !== STATE.tube) this.respawnPlayer(p);
    }
    if (this.tick % 3 === 0) this.updatePrompts();
    this.game.postStep(dt);
  }

  respawnPlayer(p, where) {
    this.releaseHold(p);
    const sp = where || SPAWNS[p.slot % SPAWNS.length];
    p.body.position.set(sp[0], sp[1], sp[2]);
    p.body.velocity.set(0, 0, 0);
    if (p.state !== STATE.gone) p.state = STATE.ok;
  }

  // ───────────────────────────── snapshot ─────────────────────────────
  snapshot() {
    const ents = [];
    for (const c of this.cargo.values()) {
      const b = c.body, q = b.quaternion;
      ents.push([
        c.id, c.type, r3(b.position.x), r3(b.position.y), r3(b.position.z),
        r3(q.x), r3(q.y), r3(q.z), r3(q.w),
        c.scanned ? c.bay : '?', r2(c.heat), (c.holders.size ? 1 : 0) | (c.tube ? 2 : 0) | (c.ot ? 4 : 0), c.shipping ? r2(c.shipping) : 0,
      ]);
    }
    const pl = [];
    for (const p of this.players.values()) {
      const b = p.body;
      pl.push({
        id: p.id, n: p.name, o: p.outfit, slot: p.slot,
        x: r3(b.position.x), y: r3(b.position.y), z: r3(b.position.z),
        vy: r2(b.velocity.y), yaw: r3(p.yaw), s: p.state, sp: r2(p.speed), g: p.grounded ? 1 : 0,
        h: p.holding ? p.holding.id : 0, hk: p.holding ? (p.holding.kind === 'player' ? 2 : 1) : 0,
        u: p.using ? 1 : 0, a: r2(p.anim), r: p.ready ? 1 : 0, c: p.connected ? 1 : 0,
        pr: p.prompt, belt: p.onBelt ? 1 : 0,
      });
    }
    const ev = this.events;
    this.events = [];
    return {
      tick: this.tick, time: r3(this.time), ents, pl,
      plant: this.plant.snapshot(), game: this.game.snapshot(), ev,
    };
  }
}

const tmpQ = new CANNON.Quaternion();
