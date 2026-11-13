// PLANT 7 machinery. Every machine reads from / writes to shared plant state,
// which is what makes failures cascade: pressure drives speed, speed drives
// crowding, crowding drives jams, bursts drive blackouts, blackouts stop belts…
import * as CANNON from 'cannon-es';
import { CARGO, PENALTY, G_DOOR } from '../constants.js';
import {
  CONVEYORS, SORTER, SCANNER, DISPENSER, TUBE, LIFT, FAN, MAGNET, HEATPAD,
  INCINERATOR, BOILER, DOORS, PADS, SPOTS, zoneAt,
} from '../level.js';
import { clamp, r2, pick } from './util.js';

const BELT_SPEED = 2.3;
const LIFT_FACTOR = { balloon: 1.3, duck: 1.2, ball: 1.2, soda: 1.0, gnome: 0.8, beans: 0.5, magnet: 0.2, mystery: 0.25, wobble: 0.25, crate: 0.05 };
const WIND_FACTOR = { balloon: 3.2, duck: 2.5, ball: 2.5, soda: 2, gnome: 1.3, beans: 1.0, magnet: 0.5, mystery: 0.6, wobble: 0.6, crate: 0.15 };
const MACHINE_NAMES = { dispenser: 'DISPENSER', sorter: 'SORTER', tube: 'PNEUMATIC TUBE', fan: 'UPDRAFT FAN', lift: 'LIFT' };
const MACHINE_SPOT = {
  dispenser: [-26.4, 1.2, 2.4], sorter: SPOTS.sorter_body, tube: [-3.3, 1.1, -7.6],
  fan: [23.4, 1.1, -2.2], lift: [15.4, 1.1, -7.0],
};
const BELT_SERVICE = { A: [-21, 1.0, 1.25], B: [1.2, 1.0, 1.25], C: [-3.9, 1.0, -3.6] };
const INCIDENT_TEXT = {
  jam: (t) => `BELT ${t} JAMMED`,
  reverse: (t) => `BELT ${t} RUNNING BACKWARDS`,
  blackout: () => 'BLACKOUT — RESET MAIN BREAKER',
  sorter: () => 'SORTER HAS LOST ITS MIND',
  overheat: (t) => `${MACHINE_NAMES[t]} OVERHEATING`,
  flux: (t) => `GRAVITY FLUX: ${t.toUpperCase()}`,
  breach: () => 'AIRLOCK BREACH — BOTH DOORS OPEN',
  ducks: () => 'DUCK DELIVERY?! NOBODY ORDERED DUCKS',
  surge: () => 'POWER SURGE — BOILER SPIKING',
  flip: () => 'MAGNET POLARITY FLIPPED',
};

export class Plant {
  constructor(sim) {
    this.sim = sim;
    this.reset(true);
    this.buildBodies();
    this.buildControls();
  }

  reset(first = false) {
    this.power = { intake: true, sorting: true, dock: true };
    this.main = true;
    this.estop = { intake: 0, sorting: 0, dock: 0 };
    this.pressure = 30;
    this.critT = 0;
    this.belts = {};
    for (const b of CONVEYORS) this.belts[b.id] = { dir: 1, jam: false, crowdT: 0, speed: 0, count: 0 };
    this.sorter = { mode: 'auto', fault: false, spin: 0 };
    this.dispenser = { auto: false, cd: 0, autoT: 2, flood: 0, floodT: 0 };
    this.airlock = { state: 'inner', pending: null, breach: false, manual: 0 };
    if (first) this.doorState = { lobby: { open: 0, target: 0 }, inner: { open: 1, target: 1 }, outer: { open: 0, target: 0 } };
    else { this.doorState.inner.target = 1; this.doorState.outer.target = 0; }
    this.lift = { y: LIFT.low, target: LIFT.low };
    this.fan = { on: true };
    this.magnet = { on: false, pol: 1 };
    this.overheat = {};
    this.incidents = [];
    this.nextIncident = 30;
    this.incSeq = 1;
    this.heatPadActive = false;
    this.burstT = 0;
    this.lastBreakerBy = 0;
    if (!first) {
      for (const c of this.sim.controls) c.progress = 0;
      this.sim.zoneGravity = {};
    }
  }

  // ───────────────────────────── bodies ─────────────────────────────
  buildBodies() {
    const sim = this.sim;
    for (const b of CONVEYORS) {
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      sim.staticBox((b.x0 + b.x1) / 2, b.top / 2, (b.z0 + b.z1) / 2, w, b.top, d, sim.mat.belt);
    }
    sim.staticBox(SORTER.x, SORTER.top / 2, SORTER.z, SORTER.size, SORTER.top, SORTER.size, sim.mat.belt);
    // scanner arch legs
    sim.staticBox(SCANNER.x, 1.2, -1.15, 0.3, 2.4, 0.3);
    sim.staticBox(SCANNER.x, 1.2, 1.15, 0.3, 2.4, 0.3);
    // tube hopper grate
    sim.staticBox(TUBE.mouth[0], 0.3, TUBE.mouth[2], 1.5, 0.6, 1.5);
    // incinerator
    sim.staticBox(INCINERATOR.x, 0.35, INCINERATOR.z, 2.0, 0.7, 2.0);
    // boiler + power panel
    sim.staticBox(BOILER.x, 1.6, BOILER.z, 3.0, 3.2, 3.0);
    // dispenser support leg
    sim.staticBox(DISPENSER.x - 1.6, 1.8, -1.2, 0.3, 3.6, 0.3);
    // fan housing (low)
    sim.staticBox(FAN.x, 0.15, FAN.z, 1.8, 0.3, 1.8);
    // hotline + panel posts are thin; skip colliders for small controls
    // heat pad plate
    sim.staticBox(HEATPAD.x, 0.12, HEATPAD.z, 1.8, 0.24, 1.8);

    // doors (kinematic slabs that slide up)
    this.doorBodies = {};
    for (const [k, d] of Object.entries(DOORS)) {
      const body = sim.kinematicBox(d.x, d.h / 2, (d.z0 + d.z1) / 2, 0.4, d.h, d.z1 - d.z0, G_DOOR);
      this.doorBodies[k] = body;
    }
    // lift platform
    this.liftBody = sim.kinematicBox((LIFT.x0 + LIFT.x1) / 2, LIFT.low - 0.15 + 0.05, (LIFT.z0 + LIFT.z1) / 2, LIFT.x1 - LIFT.x0, 0.3, LIFT.z1 - LIFT.z0, G_DOOR);
  }

  // ───────────────────────────── helpers ─────────────────────────────
  powered(zone) { return this.main && this.power[zone] && this.estop[zone] <= 0; }
  pm() { return 0.55 + 0.009 * this.pressure; }
  machineOk(m) { return !this.overheat[m]; }
  hasIncident(kind, target) { return this.incidents.some((i) => i.kind === kind && (target === undefined || i.target === target)); }

  beltVel(id) {
    const def = CONVEYORS.find((c) => c.id === id);
    const s = this.belts[id];
    return [def.dir[0] * s.speed, def.dir[1] * s.speed];
  }

  onBelt(x, footY, z) {
    for (const b of CONVEYORS) {
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 - 0.05 && z <= b.z1 + 0.05 && footY > b.top - 0.3 && footY < b.top + 0.45) return b;
    }
    return null;
  }

  onSorter(x, footY, z) {
    const h = SORTER.size / 2;
    return Math.abs(x - SORTER.x) <= h && Math.abs(z - SORTER.z) <= h && footY > SORTER.top - 0.3 && footY < SORTER.top + 0.45;
  }

  windAt(x, y, z) {
    const d = this.doorState;
    const k = Math.min(d.inner.open, d.outer.open);
    if (k < 0.4 || Math.abs(z) > 5.5 || x < -11 || x > 17 || y > 4) return null;
    const s = (k - 0.3) * 1.4;
    if (x < 4) {
      // sucked toward the airlock mouth
      const dx = 4.5 - x, dz = -z;
      const l = Math.hypot(dx, dz) || 1;
      const fall = clamp(1 - (4 - x) / 15, 0.25, 1);
      return [(dx / l) * 6.5 * s * fall, (dz / l) * 6.5 * s * fall];
    }
    return [7 * s, -z * 0.15 * s];
  }

  surfaceVelocity(x, footY, z, grounded) {
    let vx = 0, vz = 0, belt = null;
    if (grounded) {
      const b = this.onBelt(x, footY, z);
      if (b) { [vx, vz] = this.beltVel(b.id); belt = b.id; }
      else if (this.onSorter(x, footY, z) && this.powered('sorting') && this.machineOk('sorter')) {
        vx = 1.2 * this.pm(); belt = 'S';
      }
    }
    const w = this.windAt(x, footY + 0.5, z);
    if (w) { vx += w[0] * 0.85; vz += w[1] * 0.85; }
    // updraft cross-breeze up high
    if (Math.hypot(x - FAN.x, z - FAN.z) < FAN.r + 0.3 && footY > 2.0 && this.fanActive()) vz -= 3.2;
    return { vx, vz, belt };
  }

  fanActive() { return this.fan.on && this.powered('dock') && this.machineOk('fan'); }
  magnetActive() { return this.magnet.on && this.powered('dock'); }
  tubeActive() { return this.powered('sorting') && this.machineOk('tube'); }

  // ───────────────────────────── controls ─────────────────────────────
  buildControls() {
    const sim = this.sim;
    const plant = this;
    const inShift = () => sim.game.phase === 'shift';
    const ctl = (o) => sim.addControl(o);

    // Intake
    ctl({ id: 'disp_request', pos: SPOTS.disp_request, kind: 'press', snd: 'bigbutton',
      label: () => (!plant.machineOk('dispenser') ? null : plant.powered('intake') ? 'REQUEST CARGO' : 'REQUEST CARGO (NO POWER)'),
      act: (s, p) => plant.dispense(p) });
    ctl({ id: 'disp_auto', pos: SPOTS.disp_auto, kind: 'press', snd: 'lever',
      label: () => `AUTO-FEED: ${plant.dispenser.auto ? 'ON' : 'OFF'}`,
      act: () => { plant.dispenser.auto = !plant.dispenser.auto; plant.dispenser.autoT = 1; } });
    for (const id of ['A', 'B']) {
      ctl({ id: `belt_${id.toLowerCase()}_lever`, pos: SPOTS[`belt_${id.toLowerCase()}_lever`], kind: 'press', snd: 'lever',
        label: () => `BELT ${id}: ${plant.belts[id].dir > 0 ? 'FORWARD' : 'REVERSE'}`,
        act: (s, p) => {
          plant.belts[id].dir *= -1;
          const inc = plant.incidents.find((i) => i.kind === 'reverse' && i.target === id);
          if (inc && plant.belts[id].dir > 0) plant.resolve(inc, p);
        } });
    }
    for (const id of ['A', 'B', 'C']) {
      ctl({ id: `jam_${id}`, pos: BELT_SERVICE[id], kind: 'hold', holdTime: 2.2, priority: 0.4, snd: 'wrench',
        label: () => (plant.belts[id].jam ? `UNJAM BELT ${id}` : null),
        complete: (s, hs) => { const inc = plant.incidents.find((i) => i.kind === 'jam' && i.target === id); plant.belts[id].jam = false; plant.belts[id].crowdT = -4; if (inc) plant.resolve(inc, hs); } });
    }
    for (const z of ['intake', 'sorting', 'dock']) {
      ctl({ id: `estop_${z}`, pos: SPOTS[`estop_${z}`], kind: 'press', snd: 'estop',
        label: () => (inShift() ? 'EMERGENCY STOP' : null), act: (s, p) => plant.emergencyStop(z, p) });
    }
    // Sorting
    ctl({ id: 'sorter_lever', pos: SPOTS.sorter_lever, kind: 'press', snd: 'lever',
      label: () => `SORTER: ${{ auto: 'AUTO', B: 'ALL → BELT B', C: 'ALL → TUBE' }[plant.sorter.mode]}`,
      act: () => { plant.sorter.mode = { auto: 'B', B: 'C', C: 'auto' }[plant.sorter.mode]; } });
    ctl({ id: 'sorter_fix', pos: SPOTS.sorter_body, kind: 'hold', holdTime: 2.4, priority: 0.6, snd: 'wrench',
      label: () => (plant.sorter.fault ? 'WHACK THE SORTER' : null),
      complete: (s, hs) => { plant.sorter.fault = false; const inc = plant.incidents.find((i) => i.kind === 'sorter'); if (inc) plant.resolve(inc, hs); } });
    for (const m of Object.keys(MACHINE_SPOT)) {
      ctl({ id: `cool_${m}`, pos: MACHINE_SPOT[m], kind: 'hold', holdTime: 2.6, priority: 0.7, r: 0.6, snd: 'spray',
        label: () => (plant.overheat[m] ? `COOL DOWN ${MACHINE_NAMES[m]}` : null),
        complete: (s, hs) => { delete plant.overheat[m]; const inc = plant.incidents.find((i) => i.kind === 'overheat' && i.target === m); if (inc) plant.resolve(inc, hs); } });
    }
    // Airlock
    for (const side of ['air_in', 'air_out']) {
      ctl({ id: side, pos: SPOTS[side], kind: 'press', snd: 'bigbutton',
        label: () => {
          if (plant.airlock.breach) return null;
          if (!plant.powered('dock')) return null;
          return plant.airlock.pending ? 'AIRLOCK CYCLING…' : `CYCLE AIRLOCK → ${plant.airlock.state === 'inner' ? 'DOCK SIDE' : 'HALL SIDE'}`;
        },
        act: () => plant.cycleAirlock() });
      ctl({ id: side + '_crank', pos: SPOTS[side], kind: 'hold', holdTime: 2.6, snd: 'wrench',
        label: () => (plant.airlock.breach ? 'SEAL THE AIRLOCK' : !plant.powered('dock') ? 'HAND-CRANK AIRLOCK' : null),
        complete: (s, hs) => {
          if (plant.airlock.breach) {
            plant.airlock.breach = false;
            plant.doorState.outer.target = 0; plant.doorState.inner.target = 1;
            plant.airlock.state = 'inner'; plant.airlock.manual = 4;
            const inc = plant.incidents.find((i) => i.kind === 'breach');
            if (inc) plant.resolve(inc, hs);
          } else { plant.airlock.manual = 6; plant.cycleAirlock(true); }
        } });
    }
    // Control room
    for (const z of ['intake', 'sorting', 'dock']) {
      ctl({ id: `brk_${z}`, pos: SPOTS[`brk_${z}`], kind: 'press', snd: 'breaker',
        label: () => `${z.toUpperCase()} POWER: ${plant.power[z] ? 'ON' : 'OFF'}`,
        act: (s, p) => { plant.power[z] = !plant.power[z]; plant.lastBreakerBy = p.id; } });
    }
    ctl({ id: 'brk_main', pos: SPOTS.brk_main, kind: 'hold', holdTime: 2.2, twoHand: true, priority: 0.5, snd: 'breaker',
      label: () => (plant.main ? null : 'RESET MAIN BREAKER (2 HANDS BETTER)'),
      complete: (s, hs) => { plant.main = true; const inc = plant.incidents.find((i) => i.kind === 'blackout'); if (inc) plant.resolve(inc, hs); sim.emit('power', { on: 1 }); } });
    ctl({ id: 'valve', pos: SPOTS.valve, kind: 'stream', r: 0.6, snd: 'valve',
      label: () => 'VENT BOILER (HOLD)',
      onHold: (s, hs, dt) => {
        plant.pressure = Math.max(5, plant.pressure - (9 + 7 * (hs.length - 1)) * dt);
        for (const p of hs) p.stats.valveTime += dt;
      } });
    // Dock
    ctl({ id: 'lift_low', pos: SPOTS.lift_btn, kind: 'press', snd: 'button',
      label: () => (!plant.machineOk('lift') ? null : plant.powered('dock') ? `LIFT ${plant.lift.target > 1 ? 'DOWN' : 'UP'}` : 'LIFT (NO POWER)'),
      act: () => plant.toggleLift() });
    ctl({ id: 'lift_high', pos: [19.7, 3.9, -5.6], kind: 'press', snd: 'button',
      label: () => (!plant.machineOk('lift') ? null : plant.powered('dock') ? `LIFT ${plant.lift.target > 1 ? 'DOWN' : 'UP'}` : 'LIFT (NO POWER)'),
      act: () => plant.toggleLift() });
    ctl({ id: 'fan_switch', pos: SPOTS.fan_switch, kind: 'press', snd: 'lever',
      label: () => `UPDRAFT FAN: ${plant.fan.on ? 'ON' : 'OFF'}`, act: () => { plant.fan.on = !plant.fan.on; } });
    ctl({ id: 'magnet_lever', pos: SPOTS.magnet_lever, kind: 'press', snd: 'lever',
      label: () => `MAGNET: ${plant.magnet.on ? 'ON' : 'OFF'}`, act: () => { plant.magnet.on = !plant.magnet.on; } });
  }

  // ───────────────────────────── actions ─────────────────────────────
  dispense(p) {
    const d = this.dispenser;
    if (!this.powered('intake') || !this.machineOk('dispenser')) { this.sim.emit('denied', { at: 'disp' }); return; }
    if (d.cd > 0) return;
    const type = this.sim.game.nextFromQueue();
    if (!type) { this.sim.emit('denied', { at: 'disp', why: 'empty' }); return; }
    this.spawnFromDispenser(type);
    d.cd = 1.1;
  }

  spawnFromDispenser(type, ot) {
    const c = this.sim.spawnCargo(type, [DISPENSER.x + (this.sim.rnd() - 0.5) * 0.3, 3.4, DISPENSER.z + (this.sim.rnd() - 0.5) * 0.3], { spin: true, ot: ot ?? this.sim.game.overtime > 0 });
    this.sim.emit('dispense', { t: type });
    return c;
  }

  cycleAirlock(force = false) {
    const a = this.airlock;
    if (a.breach || a.pending) return;
    if (!force && !this.powered('dock')) return;
    if (a.state === 'inner') { this.doorState.inner.target = 0; a.pending = 'outer'; }
    else { this.doorState.outer.target = 0; a.pending = 'inner'; }
    this.sim.emit('airlock', {});
  }

  toggleLift() {
    if (!this.powered('dock') || !this.machineOk('lift')) { this.sim.emit('denied', { at: 'lift' }); return; }
    this.lift.target = this.lift.target > 1 ? LIFT.low : LIFT.high;
  }

  emergencyStop(zone, p) {
    this.estop[zone] = 4;
    this.sim.emit('estop', { zone });
    p.stats.estops++;
    this.sim.game.penalty(PENALTY.estop, 'Emergency stop', p.id);
    const fixes = [];
    for (const inc of [...this.incidents]) {
      if (inc.zone !== zone) continue;
      if (inc.kind === 'jam') { this.belts[inc.target].jam = false; this.belts[inc.target].crowdT = -5; }
      else if (inc.kind === 'reverse') this.belts[inc.target].dir = 1;
      else if (inc.kind === 'sorter') this.sorter.fault = false;
      else if (inc.kind === 'overheat') delete this.overheat[inc.target];
      else if (inc.kind === 'flip') this.magnet.pol = 1;
      else if (inc.kind === 'breach') { this.airlock.breach = false; this.doorState.outer.target = 0; this.doorState.inner.target = 1; this.airlock.state = 'inner'; this.airlock.manual = 4; }
      else continue;
      fixes.push(inc);
    }
    for (const inc of fixes) this.resolve(inc, null);
  }

  // ───────────────────────────── incidents ─────────────────────────────
  start(kind, target, cause = 'random') {
    if (this.hasIncident(kind, target)) return null;
    const inc = { id: this.incSeq++, kind, target, t: 0, cause, zone: 'all', text: INCIDENT_TEXT[kind](target) };
    switch (kind) {
      case 'jam': this.belts[target].jam = true; inc.zone = target === 'A' ? 'intake' : target === 'B' ? 'dock' : 'sorting'; break;
      case 'reverse': this.belts[target].dir = -1; inc.zone = target === 'A' ? 'intake' : 'dock'; break;
      case 'blackout': this.main = false; this.sim.emit('power', { on: 0 }); break;
      case 'sorter': this.sorter.fault = true; inc.zone = 'sorting'; break;
      case 'overheat': this.overheat[target] = true; inc.zone = { dispenser: 'intake', sorter: 'sorting', tube: 'sorting', fan: 'dock', lift: 'dock' }[target]; break;
      case 'flux': this.sim.zoneGravity[target] = 0.22; inc.dur = 14; inc.zone = target; break;
      case 'breach':
        this.airlock.breach = true; this.airlock.pending = null; this.airlock.manual = 3;
        this.doorState.inner.target = 1; this.doorState.outer.target = 1; inc.zone = 'dock'; break;
      case 'ducks': this.dispenser.flood = 7; inc.dur = 3; break;
      case 'surge': this.pressure = Math.min(99, this.pressure + 28); inc.dur = 2.5; break;
      case 'flip': this.magnet.pol = -1; inc.dur = 14; inc.zone = 'dock'; break;
    }
    this.incidents.push(inc);
    this.sim.game.onIncident(inc);
    this.sim.emit('incident', { kind, target: target ?? null, text: inc.text, cause });
    return inc;
  }

  resolve(inc, by) {
    const i = this.incidents.indexOf(inc);
    if (i < 0) return;
    this.incidents.splice(i, 1);
    if (inc.kind === 'flux') delete this.sim.zoneGravity[inc.target];
    if (inc.kind === 'flip') this.magnet.pol = 1;
    const list = Array.isArray(by) ? by : by ? [by] : [];
    for (const p of list) { if (p.stats) p.stats.fixes++; }
    this.sim.emit('resolved', { kind: inc.kind, text: inc.text, by: list.map((p) => p.id) });
  }

  randomIncident() {
    const sim = this.sim;
    const r = sim.rnd;
    const options = [
      ['jam', () => pick(['A', 'B', 'C'], r), 3],
      ['reverse', () => pick(['A', 'B'], r), 3],
      ['sorter', () => undefined, 2],
      ['overheat', () => pick(Object.keys(MACHINE_SPOT), r), 2.5],
      ['flux', () => pick(['intake', 'sorting', 'dock'], r), 2],
      ['breach', () => undefined, 1.5],
      ['ducks', () => undefined, 1.5],
      ['surge', () => undefined, 1.5],
      ['flip', () => undefined, 1],
      ['blackout', () => undefined, 0.7],
    ];
    let total = 0;
    const valid = [];
    for (const [k, tf, w] of options) {
      const t = tf();
      if (this.hasIncident(k, t)) continue;
      if (k === 'overheat' && this.overheat[t]) continue;
      if (k === 'flux' && Object.keys(sim.zoneGravity).length) continue;
      valid.push([k, t, w]); total += w;
    }
    let x = r() * total;
    for (const [k, t, w] of valid) {
      x -= w;
      if (x <= 0) return this.start(k, t, 'random');
    }
    return null;
  }

  // ───────────────────────────── update ─────────────────────────────
  update(dt) {
    const sim = this.sim;
    const game = sim.game;
    const shift = game.phase === 'shift';
    for (const z in this.estop) this.estop[z] = Math.max(0, this.estop[z] - dt);

    // ── boiler pressure ──
    if (shift) {
      const zones = this.main ? Object.keys(this.power).filter((z) => this.power[z]).length : 0;
      // pressure only starts building once the crew has had time to walk in
      const warm = Math.min(1, Math.max(0, (game.shiftT - 15) / 20));
      const rate = (0.16 + 0.26 * zones) * game.pressureRate() * warm;
      this.pressure += rate * dt;
      if (this.pressure > 85) {
        this.critT += dt;
        if (Math.floor(this.critT * 2) !== Math.floor((this.critT - dt) * 2) && Math.floor(this.critT * 2) % 4 === 0) sim.emit('alarm', { what: 'pressure' });
      } else this.critT = 0;
      if (this.critT > 9 && !Object.keys(this.overheat).length) {
        this.critT = 2;
        const m = pick(Object.keys(MACHINE_SPOT), sim.rnd);
        this.start('overheat', m, 'pressure');
      }
      if (this.pressure >= 100) this.burst();
    }
    this.burstT = Math.max(0, this.burstT - dt);
    const pm = this.pm();

    // ── belts ──
    for (const b of CONVEYORS) {
      const s = this.belts[b.id];
      const on = this.powered(b.zone) && !s.jam;
      const target = on ? BELT_SPEED * pm * s.dir : 0;
      s.speed += (target - s.speed) * Math.min(1, dt * 4);
      s.count = 0;
    }

    // ── per-cargo machine effects ──
    const scannerOn = this.powered('sorting');
    const sorterOn = this.powered('sorting') && this.machineOk('sorter');
    const fanOn = this.fanActive();
    const magOn = this.magnetActive();
    const tubeOn = this.tubeActive();
    const padOn = this.powered('sorting');
    this.heatPadActive = false;
    const cores = [];
    for (const c of sim.cargo.values()) {
      if (c.tube) { this.advanceTube(c, null, dt); continue; }
      if (c.shipping) { this.advanceShipping(c, dt); continue; }
      const body = c.body;
      const p = body.position;
      const v = body.velocity;
      const foot = p.y - c.halfH;
      const def = CARGO[c.type];
      const held = c.holders.size > 0;
      const gs = def.gravityScale ?? 1;
      if (gs !== 1) v.y += (1 - gs) * 18 * dt;
      const zg = sim.zoneGravity[zoneAt(p.x, p.z)];
      if (zg !== undefined) v.y += (1 - zg) * 18 * gs * dt;

      if (!held) {
        const belt = this.onBelt(p.x, foot, p.z);
        c.onBelt = belt ? belt.id : null;
        if (belt) {
          const s = this.belts[belt.id];
          s.count++;
          const [bvx, bvz] = this.beltVel(belt.id);
          const k = Math.min(1, dt * 7);
          v.x += (bvx - v.x) * k; v.z += (bvz - v.z) * k;
          const av = body.angularVelocity;
          av.x *= 0.9; av.z *= 0.9;
          // keep things centred on the belt
          if (belt.dir[0]) v.z += (((belt.z0 + belt.z1) / 2) - p.z) * dt * 6;
          else v.x += (((belt.x0 + belt.x1) / 2) - p.x) * dt * 6;
          if (s.jam && sim.rnd() < dt * 3) { v.y += 2.5; v.x += (sim.rnd() - 0.5) * 2; body.angularVelocity.y += (sim.rnd() - 0.5) * 4; }
          // scanner gate
          if (belt.id === 'A' && Math.abs(p.x - SCANNER.x) < 0.5 && !c.scanned && scannerOn) {
            c.scanned = true;
            sim.emit('scan', { id: c.id, bay: c.bay });
          }
        } else if (this.onSorter(p.x, foot, p.z)) {
          if (!c.route) {
            if (this.sorter.fault) c.route = sim.rnd() < 0.5 ? 'B' : 'C';
            else if (this.sorter.mode !== 'auto') c.route = this.sorter.mode;
            else c.route = c.scanned && c.bay === 'C' ? 'C' : 'B';
            if (sorterOn) {
              sim.emit('sort', { id: c.id, r: c.route });
              if (this.sorter.fault && sim.rnd() < 0.45) {
                v.y = 9 + sim.rnd() * 3; v.x = (sim.rnd() - 0.5) * 8; v.z = 2 + sim.rnd() * 4;
                sim.emit('fling', { id: c.id });
              }
            }
          }
          if (sorterOn) {
            const sp = 2.0 * pm;
            const k = Math.min(1, dt * 7);
            if (c.route === 'B') { v.x += (sp - v.x) * k; v.z += ((SORTER.z - p.z) * 3 - v.z) * k; }
            else { v.z += (-sp - v.z) * k; v.x += ((SORTER.x - p.x) * 3 - v.x) * k; }
            body.angularVelocity.scale(0.85, body.angularVelocity);
            this.sorter.spin += dt * 4;
          }
        } else c.route = null;

        // ── pneumatic tube mouth ──
        if (tubeOn && Math.hypot(p.x - TUBE.mouth[0], p.z - TUBE.mouth[2]) < TUBE.mouthR && p.y < 2.4) {
          this.enterTube(c, null);
          continue;
        }
        // ── incinerator ──
        if (Math.hypot(p.x - INCINERATOR.x, p.z - INCINERATOR.z) < INCINERATOR.r && foot > 0.55 && foot < 1.6) {
          sim.emit('burn', { t: c.type, x: r2(p.x), z: r2(p.z) });
          sim.removeCargo(c);
          sim.game.onIncinerated(c);
          continue;
        }
        // ── delivery pads ──
        this.checkPads(c, dt);
      }

      // ── updraft fan ──
      if (fanOn && Math.hypot(p.x - FAN.x, p.z - FAN.z) < FAN.r && p.y < 5.5) {
        const f = LIFT_FACTOR[c.type] ?? 0.3;
        const fall = p.y < 3.4 ? 1 : Math.max(0, 1 - (p.y - 3.4) / 1.6);
        v.y += f * 17 * pm * fall * dt;
        if (v.y > 7) v.y = 7;
        if (p.y > 2.3) v.z -= 7 * dt * Math.min(f + 0.3, 1.2);
      }
      // ── airlock wind ──
      const w = this.windAt(p.x, p.y, p.z);
      if (w && !held) {
        const f = (WIND_FACTOR[c.type] ?? 0.5) * 1.6;
        v.x += (w[0] - v.x) * Math.min(1, f * dt) ;
        v.z += (w[1] - v.z) * Math.min(1, f * dt * 0.5);
      }
      // ── heat ──
      if (c.type === 'beans') {
        if (padOn && Math.hypot(p.x - HEATPAD.x, p.z - HEATPAD.z) < HEATPAD.r && p.y < 1.9) {
          c.heat = Math.min(1, c.heat + dt * 0.24);
          this.heatPadActive = true;
        }
        for (const m in this.overheat) {
          const sp = MACHINE_SPOT[m];
          if (Math.hypot(p.x - sp[0], p.z - sp[2]) < 3.2) c.heat = Math.min(1, c.heat + dt * 0.15);
        }
      }
      if (def.magnetic) cores.push(c);
      // ── magnet ──
      if ((def.magnetic || c.type === 'crate') && magOn) {
        const dx = MAGNET.x - p.x, dy = MAGNET.y - p.y, dz = MAGNET.z - p.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < MAGNET.r && d > 0.01) {
          const pol = this.magnet.pol;
          const f = (def.magnetic ? 1 : 0.1) * pol;
          if (pol > 0 && d < 0.75 && def.magnetic) {
            v.scale(0.6, v);
            v.x += dx * 8 * dt; v.y += dy * 8 * dt + 18 * dt; v.z += dz * 8 * dt;
          } else {
            const a = (36 * (1 - d / MAGNET.r) + 8) * f;
            v.x += (dx / d) * a * dt; v.y += (dy / d) * a * dt + (pol > 0 && def.magnetic ? 12 * dt : 0); v.z += (dz / d) * a * dt;
          }
        }
      }
    }
    // core ↔ core and core ↔ crate attraction (works without power: permanent magnets)
    for (const a of cores) {
      if (a.holders.size) continue;
      for (const b of sim.cargo.values()) {
        if (b === a || (b.type !== 'magnet' && b.type !== 'crate') || b.tube) continue;
        const pa = a.body.position, pb = b.body.position;
        const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 0.3 || d > 2.4) continue;
        const pol = this.magnet.pol;
        const s = (b.type === 'magnet' ? (pol > 0 ? 6 : -14) : 4) * (1 - d / 2.4);
        a.body.velocity.x += (dx / d) * s * dt;
        a.body.velocity.y += (dy / d) * s * dt;
        a.body.velocity.z += (dz / d) * s * dt;
      }
    }
    // crowding → jams (emergent)
    if (shift) {
      for (const b of CONVEYORS) {
        const s = this.belts[b.id];
        if (s.count >= 7 && !s.jam && Math.abs(s.speed) > 0.2) {
          s.crowdT += dt;
          if (s.crowdT > 2.5) { s.crowdT = 0; this.start('jam', b.id, 'overload'); }
        } else s.crowdT = Math.max(Math.min(s.crowdT, 0) , s.crowdT - dt);
        if (s.crowdT < 0) s.crowdT = Math.min(0, s.crowdT + dt);
      }
    }

    // ── players & machines ──
    for (const p of sim.players.values()) {
      if (p.state === 3) { this.advanceTube(null, p, dt); continue; }
      if (p.state === 2 || p.state === 4) continue;
      const b = p.body;
      const pos = b.position;
      const zg = sim.zoneGravity[zoneAt(pos.x, pos.z)];
      if (zg !== undefined) b.velocity.y += (1 - zg) * 18 * dt;
      if (fanOn && Math.hypot(pos.x - FAN.x, pos.z - FAN.z) < FAN.r && pos.y < 5.5) {
        const fall = pos.y < 3.4 ? 1 : Math.max(0, 1 - (pos.y - 3.4) / 1.6);
        b.velocity.y += 18.6 * pm * fall * dt;
        if (b.velocity.y > 5) b.velocity.y = 5;
        p.fanT = (p.fanT || 0) + dt;
      }
      if (tubeOn && Math.hypot(pos.x - TUBE.mouth[0], pos.z - TUBE.mouth[2]) < TUBE.mouthR * 0.8 && pos.y < 2.0 && pos.y > 0.7) {
        this.enterTube(null, p);
        continue;
      }
      if (Math.hypot(pos.x - INCINERATOR.x, pos.z - INCINERATOR.z) < INCINERATOR.r && pos.y - 0.42 > 0.55 && pos.y < 2) {
        sim.knockDown(p, 0, 11, 6, 1.8, 'burn');
        p.stats.burnt++;
        sim.emit('burn', { t: 'player', id: p.id, x: r2(pos.x), z: r2(pos.z) });
        sim.emit('voice', { id: p.id, kind: 'hot' });
      }
    }

    // ── dispenser ──
    const d = this.dispenser;
    d.cd -= dt;
    if (shift && d.auto && this.powered('intake') && this.machineOk('dispenser')) {
      d.autoT -= dt;
      if (d.autoT <= 0) {
        d.autoT = 4.2 / pm;
        const t = game.nextFromQueue();
        if (t) this.spawnFromDispenser(t);
      }
    }
    if (d.flood > 0) {
      d.floodT -= dt;
      if (d.floodT <= 0) { d.floodT = 0.35; d.flood--; this.spawnFromDispenser('duck', false); }
    }

    // ── doors ──
    const ds = this.doorState;
    ds.lobby.target = game.phase === 'shift' || game.phase === 'ending' ? 1 : 0;
    this.airlock.manual = Math.max(0, this.airlock.manual - dt);
    const airMotor = this.powered('dock') ? 0.85 : this.airlock.manual > 0 ? 0.55 : 0;
    for (const k of ['lobby', 'inner', 'outer']) {
      const s = ds[k];
      const speed = k === 'lobby' ? 0.8 : airMotor;
      const prev = s.open;
      s.open += clamp(s.target - s.open, -speed * dt, speed * dt);
      // doors slide sideways (−z) into the tall wall next to them
      const def = DOORS[k];
      const body = this.doorBodies[k];
      const travel = def.z1 - def.z0 + 0.1;
      body.position.z = (def.z0 + def.z1) / 2 - s.open * travel;
      body.velocity.z = (-(s.open - prev) * travel) / dt;
    }
    const a = this.airlock;
    if (a.pending) {
      const closing = a.pending === 'outer' ? ds.inner : ds.outer;
      if (closing.open <= 0.001) {
        const opening = a.pending === 'outer' ? ds.outer : ds.inner;
        opening.target = 1;
        a.state = a.pending;
        a.pending = null;
      }
    }

    // ── lift ──
    const liftOn = this.powered('dock') && this.machineOk('lift');
    const prevY = this.lift.y;
    if (liftOn) this.lift.y += clamp(this.lift.target - this.lift.y, -1.5 * dt, 1.5 * dt);
    this.liftBody.position.y = this.lift.y - 0.15 + 0.05;
    this.liftBody.velocity.y = (this.lift.y - prevY) / dt;

    // ── incidents tick ──
    for (const inc of [...this.incidents]) {
      inc.t += dt;
      if (inc.dur && inc.t >= inc.dur) this.resolve(inc, null);
      else if (inc.kind === 'reverse' && this.belts[inc.target].dir > 0) this.resolve(inc, null);
      else if (inc.kind === 'blackout' && this.main) this.resolve(inc, null);
    }
    if (shift && game.shiftT > 22) {
      this.nextIncident -= dt * game.incidentRate();
      if (this.nextIncident <= 0) {
        this.nextIncident = 26 + sim.rnd() * 20;
        if (this.incidents.length < 3) this.randomIncident();
      }
    }
  }

  burst() {
    const sim = this.sim;
    this.pressure = 22;
    this.burstT = 3;
    sim.emit('burst', { x: BOILER.x, z: BOILER.z });
    for (const p of sim.players.values()) {
      const dx = p.body.position.x - BOILER.x, dz = p.body.position.z - BOILER.z;
      const d = Math.hypot(dx, dz);
      if (d < 9) {
        const k = (1 - d / 9) * 14 + 4;
        sim.knockDown(p, (dx / (d || 1)) * k, 8, (dz / (d || 1)) * k, 2.0, 'burst');
        sim.emit('voice', { id: p.id, kind: 'yelp' });
      }
    }
    for (const c of sim.cargo.values()) {
      const dx = c.body.position.x - BOILER.x, dz = c.body.position.z - BOILER.z;
      const d = Math.hypot(dx, dz);
      if (d < 9 && !c.tube) { c.body.velocity.x += (dx / (d || 1)) * 10; c.body.velocity.y += 7; c.body.velocity.z += (dz / (d || 1)) * 10; }
    }
    sim.game.penalty(PENALTY.burst, 'Boiler burst', this.lastBreakerBy || 0);
    this.start('blackout', undefined, 'burst');
  }

  // ───────────────────────────── tube ─────────────────────────────
  enterTube(c, p) {
    const body = c ? c.body : p.body;
    const ent = c || p;
    if (c) for (const hid of c.holders) { const hp = this.sim.players.get(hid); if (hp) hp.holding = null; }
    if (c) c.holders.clear();
    if (p) { this.sim.releaseHold(p); p.state = 3; p.stats.tubeRides++; }
    ent.tube = { s: 0, mask: body.collisionFilterMask };
    body.collisionFilterMask = 0;
    body.collisionResponse = false;
    this.sim.emit('tube', { id: ent.id, who: p ? 'player' : c.type });
    if (p) this.sim.emit('voice', { id: p.id, kind: 'wee' });
  }

  advanceTube(c, p, dt) {
    const ent = c || p;
    const body = ent.body;
    const pm = this.pm();
    ent.tube.s += dt * 13 * pm;
    const pts = TUBE.path;
    let s = ent.tube.s;
    let pos = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (s <= l) { const t = s / l; pos = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; break; }
      s -= l;
    }
    if (pos) {
      body.position.set(pos[0], pos[1], pos[2]);
      body.velocity.set(0, 0, 0);
      return;
    }
    // exit onto the sky dock
    const end = pts[pts.length - 1];
    body.position.set(end[0], end[1] - 0.3, end[2]);
    body.velocity.set(2.5 * pm, -2, (this.sim.rnd() - 0.5) * 1.5);
    body.collisionResponse = true;
    if (c) { this.sim.resetCargoFilter(c); c.tube = null; }
    else { body.collisionFilterMask = ent.tube.mask; p.tube = null; p.state = 1; p.downT = 0.9; }
    this.sim.emit('tubeout', { id: ent.id });
    if (c && CARGO[c.type].fragile && pm > 1.17) {
      c.spawnT = -10;
      this.sim.breakCargo(c, 'tube');
    }
  }

  // ───────────────────────────── delivery pads ─────────────────────────────
  checkPads(c, dt) {
    const p = c.body.position;
    const foot = p.y - c.halfH;
    let pad = null;
    for (const [id, pd] of Object.entries(PADS)) {
      const h = pd.size / 2;
      if (Math.abs(p.x - pd.x) < h && Math.abs(p.z - pd.z) < h && foot > (pd.y || 0) - 0.3 && foot < (pd.y || 0) + 0.7) { pad = id; break; }
    }
    if (!pad || c.body.velocity.length() > 3.5) { c.padT = Math.min(c.padT, 0); if (!pad) c.padT = Math.min(0, c.padT + dt); return; }
    c.padT += dt;
    if (c.padT < 0.45) return;
    if (this.sim.game.phase !== 'shift') return;
    const verdict = this.sim.game.judge(c, pad);
    if (verdict.ok) {
      c.shipping = 0.001;
      c.shipPad = pad;
      c.body.collisionFilterMask = 0;
      c.body.collisionResponse = false;
      this.sim.emit('ship', { id: c.id, pad, t: c.type });
    } else {
      c.padT = -1.2;
      const pd = PADS[pad];
      const dx = p.x - pd.x || 0.1, dz = p.z - pd.z;
      const l = Math.hypot(dx, dz) || 1;
      c.body.velocity.set((dx / l) * 4 - 3, 6, (dz / l) * 4);
      this.sim.emit('reject', { id: c.id, pad, why: verdict.why, x: r2(p.x), z: r2(p.z) });
      this.sim.game.onRejected(c, verdict.why);
    }
  }

  advanceShipping(c, dt) {
    const pd = PADS[c.shipPad];
    c.shipping += dt / 0.8;
    const b = c.body;
    b.velocity.set(0, 0, 0);
    b.position.x += (pd.x - b.position.x) * Math.min(1, dt * 6);
    b.position.z += (pd.z - b.position.z) * Math.min(1, dt * 6);
    b.position.y = (pd.y || 0) + c.halfH + 0.4 * Math.sin(c.shipping * Math.PI) - c.shipping * 1.0;
    if (c.shipping >= 1) {
      this.sim.removeCargo(c);
      this.sim.game.onDelivered(c, c.shipPad);
    }
  }

  // ───────────────────────────── snapshot ─────────────────────────────
  snapshot() {
    const ctl = {};
    for (const c of this.sim.controls) {
      if (c.kind === 'hold' && c.progress > 0.01) ctl[c.id] = r2(c.progress);
      if (c.kind === 'stream' && c.active) ctl[c.id] = 1;
    }
    const b = {};
    for (const id in this.belts) { const s = this.belts[id]; b[id] = [s.dir, s.jam ? 1 : 0, r2(s.speed)]; }
    return {
      pw: [this.power.intake ? 1 : 0, this.power.sorting ? 1 : 0, this.power.dock ? 1 : 0],
      main: this.main ? 1 : 0,
      es: [r2(this.estop.intake), r2(this.estop.sorting), r2(this.estop.dock)],
      P: r2(this.pressure), b,
      so: [this.sorter.mode, this.sorter.fault ? 1 : 0, r2(this.sorter.spin)],
      di: [this.dispenser.auto ? 1 : 0, this.dispenser.cd > 0 ? 1 : 0],
      dr: [r2(this.doorState.lobby.open), r2(this.doorState.inner.open), r2(this.doorState.outer.open)],
      al: this.airlock.state,
      lift: r2(this.lift.y),
      fan: this.fanActive() ? 1 : 0, fanOn: this.fan.on ? 1 : 0,
      mag: this.magnetActive() ? this.magnet.pol : 0, magOn: this.magnet.on ? 1 : 0,
      tube: this.tubeActive() ? 1 : 0,
      hp: this.heatPadActive ? 1 : this.powered('sorting') ? 0.5 : 0,
      oh: Object.keys(this.overheat),
      inc: this.incidents.map((i) => ({ id: i.id, k: i.kind, tg: i.target ?? null, tx: i.text, t: r2(i.t), d: i.dur || 0 })),
      ctl,
      zg: { ...this.sim.zoneGravity },
      burst: r2(this.burstT),
    };
  }
}
