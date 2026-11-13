// A Room owns one authoritative simulation and the set of connected clients.
// The Node server runs Rooms for online play; the browser runs a Room directly
// for solo / couch play. Clients only ever talk to a Room through messages.
import { Sim } from './sim/Sim.js';
import { TICK_RATE, SNAPSHOT_RATE, MAX_PLAYERS } from './constants.js';

const RECONNECT_GRACE = 30;

export class Room {
  constructor({ code, send, snapshotRate = SNAPSHOT_RATE, seed, encode = true }) {
    this.code = code;
    this.send = send; // (clientId, msgOrString) => void
    this.encode = encode;
    this.sim = new Sim({ seed });
    this.clients = new Map(); // clientId -> { players: Set<playerId> }
    this.tokens = new Map(); // reconnect token -> playerId
    this.acc = 0;
    this.snapAcc = 0;
    this.snapInterval = 1 / snapshotRate;
    this.dt = 1 / TICK_RATE;
    this.emptyT = 0;
  }

  get playerCount() { return this.sim.players.size; }

  join(clientId, { name, outfit, token } = {}) {
    // reconnect?
    if (token && this.tokens.has(token)) {
      const pid = this.tokens.get(token);
      const p = this.sim.players.get(pid);
      if (p && !p.connected) {
        for (const c of this.clients.values()) c.players.delete(pid);
        p.connected = true;
        p.goneT = 0;
        this.clientOf(clientId).players.add(pid);
        this.sim.emit('rejoin', { id: pid, name: p.name });
        this.send(clientId, { t: 'welcome', code: this.code, players: [pid], token });
        return { ok: true, pid };
      }
    }
    if (this.sim.players.size >= MAX_PLAYERS) {
      this.send(clientId, { t: 'error', msg: 'This shift is full (4 workers max).' });
      return { ok: false };
    }
    const p = this.sim.addPlayer({ name, outfit });
    const tk = token || Math.random().toString(36).slice(2, 12);
    this.tokens.set(tk, p.id);
    this.clientOf(clientId).players.add(p.id);
    this.send(clientId, { t: 'welcome', code: this.code, players: [p.id], token: tk });
    return { ok: true, pid: p.id };
  }

  clientOf(clientId) {
    if (!this.clients.has(clientId)) this.clients.set(clientId, { players: new Set() });
    return this.clients.get(clientId);
  }

  owns(clientId, pid) {
    return this.clients.get(clientId)?.players.has(pid);
  }

  leave(clientId) {
    const c = this.clients.get(clientId);
    if (!c) return;
    for (const pid of c.players) {
      const p = this.sim.players.get(pid);
      if (p) {
        p.connected = false;
        p.goneT = RECONNECT_GRACE;
        p.ready = false;
        this.sim.releaseHold(p);
        this.sim.emit('disconnect', { id: pid, name: p.name });
      }
    }
    this.clients.delete(clientId);
  }

  message(clientId, msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'in':
        if (this.owns(clientId, msg.p)) this.sim.setInput(msg.p, msg.i);
        break;
      case 'outfit': {
        const p = this.owns(clientId, msg.p) && this.sim.players.get(msg.p);
        if (p && msg.o) {
          if (typeof msg.o.color === 'string') p.outfit.color = msg.o.color.slice(0, 9);
          if (typeof msg.o.hat === 'string') p.outfit.hat = msg.o.hat.slice(0, 12);
          if (typeof msg.o.face === 'string') p.outfit.face = msg.o.face.slice(0, 12);
        }
        break;
      }
      case 'name': {
        const p = this.owns(clientId, msg.p) && this.sim.players.get(msg.p);
        if (p && typeof msg.n === 'string') p.name = msg.n.slice(0, 14) || p.name;
        break;
      }
      case 'addLocal': {
        if (this.sim.players.size >= MAX_PLAYERS) { this.send(clientId, { t: 'error', msg: 'Shift is full.' }); break; }
        const p = this.sim.addPlayer({ name: msg.name, outfit: msg.outfit });
        this.clientOf(clientId).players.add(p.id);
        this.send(clientId, { t: 'local', pid: p.id, slot: msg.slot });
        break;
      }
      case 'removeLocal':
        if (this.owns(clientId, msg.p)) { this.sim.removePlayer(msg.p); this.clients.get(clientId).players.delete(msg.p); }
        break;
      case 'ping':
        this.send(clientId, { t: 'pong', ts: msg.ts });
        break;
    }
  }

  update(realDt) {
    this.acc += Math.min(realDt, 0.25);
    let steps = 0;
    while (this.acc >= this.dt && steps < 8) {
      this.sim.step(this.dt);
      this.acc -= this.dt;
      steps++;
    }
    if (steps === 8) this.acc = 0;
    // reconnect grace
    for (const p of [...this.sim.players.values()]) {
      if (!p.connected) {
        p.goneT -= realDt;
        if (p.goneT <= 0) {
          for (const [tk, pid] of this.tokens) if (pid === p.id) this.tokens.delete(tk);
          this.sim.removePlayer(p.id);
        }
      }
    }
    this.snapAcc += realDt;
    if (this.snapAcc >= this.snapInterval) {
      this.snapAcc = 0;
      const snap = this.sim.snapshot();
      snap.t = 'snap';
      snap.code = this.code;
      const payload = this.encode ? JSON.stringify(snap) : snap;
      for (const cid of this.clients.keys()) this.send(cid, payload);
    }
    this.emptyT = this.clients.size ? 0 : this.emptyT + realDt;
  }
}
