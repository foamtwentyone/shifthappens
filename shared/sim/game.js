// Shift flow, contracts, money and the end-of-shift report.
// Lobby → (everyone punches in) → countdown → shift → [quota met → hotline: clock out | overtime]
//       → ending → report → lobby
import { CARGO, RIDERS, PENALTY, ORDERABLE, OUTFIT_COLORS, HATS, MODELS } from '../constants.js';
import { SPOTS, SPAWNS, LOBBY_BALL, PADS } from '../level.js';
import { shuffle, pick, r2 } from './util.js';

const TEMPLATES = [
  { key: 'standard', name: 'STANDARD HAUL', client: 'Grumble & Sons Removals', tier: 0,
    blurb: 'Crates, drums, a couple of gnomes. A nice gentle Monday.',
    lines: { crate: 2, wobble: 1, gnome: 2, balloon: 2 }, time: 330, bonus: 350 },
  { key: 'fragile', name: 'FRAGILE FESTIVAL', client: 'Garden Gnome Society', tier: 0,
    blurb: 'Gnomes, toasted beans and helium. Handle with extreme care.',
    lines: { gnome: 3, beans: 2, balloon: 2 }, time: 330, bonus: 420 },
  { key: 'magnetic', name: 'MAGNETIC MAYHEM', client: 'Polar Opposites Ltd.', tier: 0,
    blurb: 'Cores, crates and mystery boxes. Things will stick together.',
    lines: { magnet: 3, crate: 2, mystery: 2 }, time: 360, bonus: 480 },
  { key: 'hot', name: 'HOT POTATO', client: 'Spicy Bean Co-op', tier: 1,
    blurb: 'Lots of beans. All of them toasted. All of them jumping.',
    lines: { beans: 4, mystery: 2, wobble: 1 }, time: 330, bonus: 620 },
  { key: 'bigone', name: 'THE BIG ONE', client: 'Mega-Corp Universal', tier: 1,
    blurb: 'One of everything. Twice. The whole plant will be screaming.',
    lines: { crate: 2, wobble: 1, gnome: 2, beans: 2, balloon: 2, magnet: 2, mystery: 2 }, time: 480, bonus: 950 },
  { key: 'skyhigh', name: 'SKY HIGH', client: 'Cloud Nine Logistics', tier: 2,
    blurb: 'Everything goes to the Sky Dock. Mind the drop.',
    lines: { balloon: 4, magnet: 3, mystery: 2 }, time: 360, bonus: 800 },
];

const KIND_NAMES = {
  jam: 'Belt jams', reverse: 'Reversed belts', blackout: 'Blackouts', sorter: 'Sorter tantrums',
  overheat: 'Overheats', flux: 'Gravity fluxes', breach: 'Airlock breaches', ducks: 'Duck floods',
  surge: 'Power surges', flip: 'Magnet flips',
};

export class Game {
  constructor(sim) {
    this.sim = sim;
    this.phase = 'lobby';
    this.ledger = 0;
    this.shifts = 0;
    this.riders = { rush: false, careful: false, dark: false, cranky: false };
    this.selected = 0;
    this.countdown = 0;
    this.reportSeq = 0;
    this.lastReport = null;
    this.endT = 0;
    this.resetShiftState();
    this.contracts = this.makeContracts();
    this.buildControls();
  }

  tier() { return Math.min(3, Math.floor(this.ledger / 1500)); }

  makeContracts() {
    const tier = this.tier();
    const pool = TEMPLATES.filter((t) => t.tier <= tier);
    const r = this.sim.rnd;
    const chosen = [];
    // always offer an easy one, plus the riskiest ones unlocked
    chosen.push(pool[Math.floor(r() * Math.min(3, pool.length))]);
    const rest = shuffle(pool.filter((t) => t !== chosen[0]), r);
    rest.sort((a, b) => b.tier - a.tier);
    while (chosen.length < 3 && rest.length) chosen.push(rest.shift());
    return chosen.map((t, i) => ({
      ...t,
      id: i,
      bonus: Math.round(t.bonus * (1 + tier * 0.25)),
      lines: { ...t.lines },
      hazard: Math.min(3, t.tier + (Object.values(t.lines).reduce((a, b) => a + b, 0) > 9 ? 1 : 0)),
    }));
  }

  resetShiftState() {
    this.order = [];
    this.otOrder = [];
    this.queue = [];
    this.timeLeft = 0;
    this.shiftT = 0;
    this.entries = [];
    this.money = 0;
    this.overtime = 0;
    this.otDone = false;
    this.quotaMet = false;
    this.quotaBonusPaid = 0;
    this.ringT = 0;
    this.incidentsCount = 0;
    this.incidentKinds = {};
    this.broken = 0;
    this.delivered = 0;
    this.misdelivered = 0;
    this.result = null;
    this.mistakes = [];
    this.contract = null;
  }

  multiplier() {
    let m = 1;
    for (const k in this.riders) if (this.riders[k]) m += RIDERS[k].mult;
    return r2(m);
  }

  playerCount() {
    let n = 0;
    for (const p of this.sim.players.values()) if (p.connected) n++;
    return Math.max(1, n);
  }

  incidentRate() {
    let r = 1 + this.tier() * 0.15;
    if (this.riders.cranky) r *= 2;
    if (this.overtime) r *= 1 + 0.6 * this.overtime;
    if (this.playerCount() === 1) r *= 0.7;
    return r;
  }

  pressureRate() {
    let r = 1;
    if (this.overtime) r *= 1 + 0.2 * this.overtime;
    if (this.riders.cranky) r *= 1.15;
    if (this.playerCount() === 1) r *= 0.8;
    return r;
  }

  // ───────────────────────────── lobby controls ─────────────────────────────
  buildControls() {
    const sim = this.sim;
    const game = this;
    const lobby = () => game.phase === 'lobby' || game.phase === 'countdown';
    for (let i = 0; i < 3; i++) {
      sim.addControl({ id: `contract${i}`, pos: SPOTS[`contract${i}`], kind: 'press', snd: 'paper',
        label: () => (lobby() && game.contracts[i] ? (game.selected === i ? `✓ ${game.contracts[i].name}` : `PICK: ${game.contracts[i].name}`) : null),
        act: () => { game.selected = i; game.cancelCountdown(); sim.emit('select', { i }); } });
    }
    for (const k of Object.keys(RIDERS)) {
      sim.addControl({ id: `rider_${k}`, pos: SPOTS[`rider_${k}`], kind: 'press', snd: 'lever',
        label: () => (lobby() ? `${RIDERS[k].name}: ${game.riders[k] ? 'SIGNED' : 'NOT SIGNED'}` : null),
        act: () => { game.riders[k] = !game.riders[k]; game.cancelCountdown(); sim.emit('rider', { k, on: game.riders[k] }); } });
    }
    const cycle = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];
    sim.addControl({ id: 'locker_color', pos: SPOTS.locker_color, kind: 'press', snd: 'locker',
      label: () => 'NEW OVERALLS', act: (s, p) => { p.outfit.color = cycle(OUTFIT_COLORS, p.outfit.color); } });
    sim.addControl({ id: 'locker_hat', pos: SPOTS.locker_hat, kind: 'press', snd: 'locker',
      label: () => 'SWAP HAT', act: (s, p) => { p.outfit.hat = cycle(HATS, p.outfit.hat); } });
    sim.addControl({ id: 'locker_face', pos: SPOTS.locker_face, kind: 'press', snd: 'locker',
      label: () => 'MIRROR: NEW LOOK', act: (s, p) => { p.outfit.model = cycle(MODELS, p.outfit.model); } });
    sim.addControl({ id: 'punch', pos: SPOTS.punch, kind: 'press', snd: 'punch',
      label: (s, p) => (lobby() ? (p.ready ? 'PUNCH OUT (NOT READY)' : 'PUNCH IN (READY)') : null),
      act: (s, p) => { p.ready = !p.ready; sim.emit('punch', { id: p.id, on: p.ready }); if (!p.ready) game.cancelCountdown(); } });
    sim.addControl({ id: 'vending', pos: SPOTS.vending, kind: 'press', snd: 'vend',
      label: () => 'FIZZ SODA ($1)',
      act: () => {
        const sodas = [...sim.cargo.values()].filter((c) => c.type === 'soda');
        if (sodas.length > 6) sim.removeCargo(sodas[0]);
        sim.spawnCargo('soda', [-43.6, 1.0, -7.6], { vel: [1.5, 2, 3], spin: true });
        game.ledger = Math.max(0, game.ledger - 1);
      } });
    // the foreman hotline in the dock: the in-world risk decision
    sim.addControl({ id: 'hotline_out', pos: SPOTS.hotline_out, kind: 'hold', holdTime: 1.3, snd: 'lever',
      label: () => {
        if (game.phase !== 'shift' || !game.quotaMet) return null;
        return game.overtime && !game.otDone ? 'CLOCK OUT (FORFEIT OVERTIME)' : 'CLOCK OUT — TAKE THE MONEY';
      },
      complete: () => game.endShift(game.overtime && !game.otDone ? 'bust' : 'clockout') });
    sim.addControl({ id: 'hotline_ot', pos: SPOTS.hotline_ot, kind: 'hold', holdTime: 1.3, snd: 'lever',
      label: () => (game.phase === 'shift' && game.quotaMet && (!game.overtime || game.otDone) ? `TAKE OVERTIME #${game.overtime + 1} (x${(1.5 + 0.25 * game.overtime).toFixed(2)} PAY)` : null),
      complete: () => game.startOvertime() });
  }

  cancelCountdown() {
    if (this.phase === 'countdown') { this.phase = 'lobby'; this.sim.emit('countdown', { cancel: 1 }); }
  }

  // ───────────────────────────── shift lifecycle ─────────────────────────────
  startShift() {
    const sim = this.sim;
    const c = this.contracts[this.selected] || this.contracts[0];
    this.resetShiftState();
    this.contract = c;
    const n = this.playerCount();
    const scale = [0.7, 1, 1.25, 1.5][Math.min(4, n) - 1];
    this.order = Object.entries(c.lines).map(([type, need]) => ({ type, need: Math.max(1, Math.round(need * scale)), done: 0 }));
    this.queue = this.buildQueue(this.order, 0.25);
    this.timeLeft = Math.round(c.time * (this.riders.rush ? 0.7 : 1));
    this.phase = 'shift';
    sim.plant.reset();
    sim.plant.dispenser.autoT = 1;
    for (const cg of [...sim.cargo.values()]) if (!CARGO[cg.type].toy) sim.removeCargo(cg);
    for (const p of sim.players.values()) {
      p.ready = false;
      for (const k in p.stats) p.stats[k] = typeof p.stats[k] === 'number' ? 0 : '';
    }
    this.startedPlayers = n;
    sim.emit('shift', { name: c.name, time: this.timeLeft });
  }

  buildQueue(lines, extra) {
    const r = this.sim.rnd;
    const q = [];
    for (const l of lines) for (let i = 0; i < l.need; i++) q.push(l.type);
    const extras = Math.round(q.length * extra);
    const types = lines.map((l) => l.type);
    for (let i = 0; i < extras; i++) q.push(pick(types, r));
    q.push('duck');
    shuffle(q, r);
    // never open the shift with junk
    while (q[0] === 'duck' && q.length > 1) q.push(q.shift());
    return q;
  }

  nextFromQueue() {
    if (this.phase !== 'shift') return null;
    if (!this.queue.length) {
      // keep the line fed with whatever is still outstanding
      const open = this.activeLines().filter((l) => l.done < l.need);
      if (!open.length) return pick(ORDERABLE.slice(0, 6), this.sim.rnd);
      return pick(open, this.sim.rnd).type;
    }
    return this.queue.shift();
  }

  activeLines() { return this.overtime && !this.otDone ? this.otOrder : this.order; }

  startOvertime() {
    const sim = this.sim;
    this.overtime++;
    this.otDone = false;
    this.ringT = 0;
    const r = sim.rnd;
    const types = shuffle(ORDERABLE.slice(), r).slice(0, 3);
    const n = this.playerCount();
    this.otOrder = types.map((t, i) => ({ type: t, need: 1 + (i === 0 ? 1 : 0) + (n >= 3 && i === 1 ? 1 : 0) + (this.overtime > 1 ? 1 : 0), done: 0 }));
    this.queue = this.buildQueue(this.otOrder, 0.3).concat(this.queue);
    const extra = 95 + 15 * n;
    this.timeLeft += extra;
    sim.emit('overtime', { n: this.overtime, extra });
  }

  endShift(why) {
    if (this.phase !== 'shift') return;
    const mult = this.multiplier();
    if (why === 'bust' || (why === 'timeout' && this.overtime && !this.otDone)) {
      if (this.quotaBonusPaid) this.addEntry(-Math.round(this.quotaBonusPaid * 0.5), 'Overtime bust: half the quota bonus clawed back');
      this.result = 'OVERTIME BUST';
    } else if (this.quotaMet) this.result = this.overtime ? 'OVERTIME HERO' : 'QUOTA MET';
    else this.result = 'QUOTA MISSED';
    if (this.riders.careful) {
      if (this.broken === 0 && this.quotaMet) this.addEntry(Math.round(300 * mult), 'No Scratches bonus');
    }
    this.phase = 'ending';
    this.endT = 4;
    this.endWhy = why;
    this.sim.emit('shiftend', { result: this.result, why });
  }

  finishShift() {
    const sim = this.sim;
    const report = this.buildReport();
    this.ledger += report.total;
    report.ledgerAfter = this.ledger;
    this.shifts++;
    this.lastReport = report;
    this.reportSeq++;
    report.id = this.reportSeq;
    sim.emit('report', { report });
    // back to the break room
    for (const cg of [...sim.cargo.values()]) sim.removeCargo(cg);
    sim.plant.reset();
    let i = 0;
    for (const p of sim.players.values()) {
      sim.respawnPlayer(p, SPAWNS[i++ % SPAWNS.length]);
      p.ready = false;
    }
    sim.spawnToy('ball', LOBBY_BALL);
    this.contracts = this.makeContracts();
    this.selected = 0;
    this.riders = { rush: false, careful: false, dark: false, cranky: false };
    this.phase = 'lobby';
  }

  // ───────────────────────────── money ─────────────────────────────
  addEntry(amount, label, pid = 0) {
    this.entries.push({ amount, label, pid });
    this.money += amount;
  }

  penalty(amount, label, pid = 0) {
    if (this.phase !== 'shift') return;
    this.addEntry(-amount, label, pid);
    const p = this.sim.players.get(pid);
    if (p && amount > p.stats.maxMistake) { p.stats.maxMistake = amount; p.stats.maxMistakeWhat = label; }
    this.sim.emit('paid', { amt: -amount, label });
  }

  judge(c, pad) {
    const def = CARGO[c.type];
    if (def.junk || def.toy) return { ok: false, why: 'NOT CARGO' };
    if (c.bay !== pad) return { ok: false, why: 'WRONG BAY' };
    if (def.needsHeat && c.heat < 0.4) return { ok: false, why: 'BEANS NOT TOASTED' };
    return { ok: true };
  }

  onRejected(c, why) {
    if (CARGO[c.type].junk || CARGO[c.type].toy) return;
    this.misdelivered++;
    const p = this.sim.players.get(c.lastTouch);
    if (p) p.stats.misdeliveries++;
    this.penalty(PENALTY.misdeliver, `Misdelivery (${why.toLowerCase()})`, c.lastTouch);
  }

  onDelivered(c, pad) {
    const sim = this.sim;
    const def = CARGO[c.type];
    const lines = this.activeLines();
    let line = lines.find((l) => l.type === c.type && l.done < l.need);
    if (!line && lines !== this.order) line = this.order.find((l) => l.type === c.type && l.done < l.need);
    const mult = this.multiplier() * (this.overtime && !this.otDone ? 1.5 + 0.25 * (this.overtime - 1) : 1);
    let pay = Math.round(def.pay * mult * (line ? 1 : 0.4));
    if (line) line.done++;
    this.delivered++;
    this.addEntry(pay, line ? 'Deliveries' : 'Surplus deliveries', c.lastTouch);
    const p = sim.players.get(c.lastTouch);
    if (p) { p.stats.delivered++; p.stats.earned += pay; }
    const pd = PADS[pad];
    sim.emit('paid', { amt: pay, label: def.short, x: pd.x, y: (pd.y || 0) + 1.5, z: pd.z, pad });

    if (!this.quotaMet && this.order.every((l) => l.done >= l.need)) {
      this.quotaMet = true;
      const bonus = Math.round(this.contract.bonus * this.multiplier());
      this.quotaBonusPaid = bonus;
      this.addEntry(bonus, 'Quota bonus');
      this.ringT = 30;
      sim.emit('quota', { bonus });
    } else if (this.overtime && !this.otDone && this.otOrder.every((l) => l.done >= l.need)) {
      this.otDone = true;
      const bonus = Math.round(260 * this.overtime * this.multiplier());
      this.addEntry(bonus, `Overtime #${this.overtime} bonus`);
      this.ringT = 30;
      sim.emit('otdone', { bonus, n: this.overtime });
    }
  }

  onBroken(c, by, def) {
    if (this.phase !== 'shift') return;
    if (def.junk || def.toy) return;
    this.broken++;
    const p = this.sim.players.get(by);
    if (p) p.stats.broken++;
    const extra = this.riders.careful ? 40 : 0;
    this.penalty((def.breakPenalty || PENALTY.lostCargo) + extra, `Broken ${def.short.toLowerCase()}`, by);
    this.queue.push(c.type);
  }

  onLost(c) {
    if (this.phase !== 'shift') { if (CARGO[c.type].toy) this.sim.spawnToy(c.type === 'ball' ? 'ball' : c.type, LOBBY_BALL); return; }
    const def = CARGO[c.type];
    if (def.junk || def.toy) return;
    this.penalty(PENALTY.lostCargo, `Lost ${def.short.toLowerCase()}`, c.lastTouch);
    this.queue.push(c.type);
  }

  onIncinerated(c) {
    const def = CARGO[c.type];
    if (this.phase !== 'shift') return;
    if (def.junk) { this.addEntry(5, 'Recycling'); this.sim.emit('paid', { amt: 5, label: 'RECYCLED' }); return; }
    if (def.toy) return;
    this.penalty(PENALTY.lostCargo, `Incinerated ${def.short.toLowerCase()}`, c.lastTouch);
    this.queue.push(c.type);
  }

  onIncident(inc) {
    if (this.phase !== 'shift') return;
    this.incidentsCount++;
    this.incidentKinds[inc.kind] = (this.incidentKinds[inc.kind] || 0) + 1;
  }

  // ───────────────────────────── tick ─────────────────────────────
  preStep(dt) {
    const sim = this.sim;
    if (this.phase === 'lobby' || this.phase === 'countdown') {
      const ps = [...sim.players.values()].filter((p) => p.connected);
      const allReady = ps.length > 0 && ps.every((p) => p.ready);
      if (this.phase === 'lobby' && allReady) {
        this.phase = 'countdown';
        this.countdown = 4;
        sim.emit('countdown', { t: 4 });
      } else if (this.phase === 'countdown') {
        if (!allReady) this.cancelCountdown();
        else {
          this.countdown -= dt;
          if (this.countdown <= 0) this.startShift();
        }
      }
    } else if (this.phase === 'shift') {
      this.shiftT += dt;
      this.timeLeft -= dt;
      this.ringT = Math.max(0, this.ringT - dt);
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endShift('timeout'); }
    } else if (this.phase === 'ending') {
      this.endT -= dt;
      if (this.endT <= 0) this.finishShift();
    }
  }

  postStep() {}

  // ───────────────────────────── report ─────────────────────────────
  buildReport() {
    const sim = this.sim;
    const groups = new Map();
    for (const e of this.entries) {
      const g = groups.get(e.label) || { label: e.label, amount: 0, n: 0 };
      g.amount += e.amount; g.n++;
      groups.set(e.label, g);
    }
    const lines = [...groups.values()].sort((a, b) => b.amount - a.amount);
    const players = [...sim.players.values()].map((p) => ({ id: p.id, name: p.name, outfit: { ...p.outfit }, stats: { ...p.stats } }));
    const awards = this.awards(players);
    return {
      contract: this.contract?.name, client: this.contract?.client,
      result: this.result, duration: Math.round(this.shiftT),
      lines, total: this.money, delivered: this.delivered, broken: this.broken,
      misdelivered: this.misdelivered, incidents: this.incidentsCount,
      incidentKinds: Object.entries(this.incidentKinds).map(([k, n]) => ({ k, name: KIND_NAMES[k] || k, n })),
      order: this.order.map((l) => ({ ...l })), overtime: this.overtime,
      riders: Object.keys(this.riders).filter((k) => this.riders[k]), mult: this.multiplier(),
      players, awards, ledgerBefore: this.ledger,
    };
  }

  awards(players) {
    const defs = [
      { title: 'EMPLOYEE OF THE SHIFT', score: (s) => s.earned + s.fixes * 30 + s.delivered * 10, desc: (s) => `$${s.earned} delivered, ${s.fixes} fixes` },
      { title: 'WALKING DISASTER', score: (s) => s.knockdowns + s.broken * 3 + s.burnt * 3, desc: (s) => `${s.knockdowns} faceplants, ${s.broken} breakages${s.burnt ? `, ${s.burnt} self-incinerations` : ''}` },
      { title: 'MOST EXPENSIVE MISTAKE', score: (s) => s.maxMistake, desc: (s) => `${s.maxMistakeWhat}: -$${s.maxMistake}` },
      { title: 'CONVEYOR VICTIM', score: (s) => (s.beltTime > 3 ? s.beltTime : 0), desc: (s) => `${Math.round(s.beltTime)} seconds riding the belts` },
      { title: 'FREQUENT FLYER', score: (s) => s.tubeRides * 2 + s.timesThrown, desc: (s) => `${s.tubeRides} tube rides, thrown ${s.timesThrown} times` },
      { title: 'HUMAN CATAPULT', score: (s) => s.thrownMates, desc: (s) => `Threw colleagues ${s.thrownMates} times` },
      { title: 'PRESSURE WHISPERER', score: (s) => (s.valveTime > 4 ? s.valveTime : 0), desc: (s) => `${Math.round(s.valveTime)}s on the boiler valve` },
      { title: 'THE FIXER', score: (s) => s.fixes, desc: (s) => `${s.fixes} breakdowns fixed` },
      { title: 'BIG RED BUTTON ENTHUSIAST', score: (s) => s.estops, desc: (s) => `${s.estops} emergency stops` },
    ];
    const out = [];
    const used = new Map();
    for (const d of defs) {
      let best = null, bestV = 0;
      for (const p of players) {
        const v = d.score(p.stats);
        const penalty = (used.get(p.id) || 0) * 0.35; // spread the glory
        if (v > 0 && v * (1 - penalty) > bestV) { bestV = v * (1 - penalty); best = p; }
      }
      if (best) {
        out.push({ title: d.title, pid: best.id, name: best.name, desc: d.desc(best.stats), outfit: best.outfit });
        used.set(best.id, (used.get(best.id) || 0) + 1);
      }
    }
    return out.slice(0, 6);
  }

  snapshot() {
    const lobby = this.phase === 'lobby' || this.phase === 'countdown';
    return {
      ph: this.phase, cd: r2(this.countdown), tl: r2(this.timeLeft), st: r2(this.shiftT),
      money: this.money, ledger: this.ledger, shifts: this.shifts, tier: this.tier(),
      order: this.order.map((l) => [l.type, l.need, l.done]),
      ot: this.overtime, otDone: this.otDone ? 1 : 0, otOrder: this.otOrder.map((l) => [l.type, l.need, l.done]),
      qm: this.quotaMet ? 1 : 0, ring: this.ringT > 0 ? 1 : 0,
      contract: this.contract ? { name: this.contract.name, client: this.contract.client } : null,
      contracts: lobby ? this.contracts.map((c) => ({ name: c.name, client: c.client, blurb: c.blurb, lines: c.lines, time: c.time, bonus: c.bonus, hazard: c.hazard })) : null,
      sel: this.selected, riders: this.riders, mult: this.multiplier(),
      rep: this.reportSeq, res: this.result, dark: this.riders.dark && this.phase !== 'lobby' && this.phase !== 'countdown' ? 1 : 0,
      queue: this.queue.length,
    };
  }
}
