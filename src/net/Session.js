// A Session is the client's view of one Room — either hosted in this browser
// (LocalTransport) or on the dedicated server (WebSocketTransport). The rest of
// the client only ever sees Session, so both modes share every line of
// rendering / UI code.
import { Room } from '../../shared/room.js';
import { LOCAL_SNAPSHOT_RATE } from '../../shared/constants.js';

export class LocalTransport {
  constructor() {
    this.kind = 'local';
    this.handler = null;
    const code = 'SOLO';
    this.room = new Room({ code, snapshotRate: LOCAL_SNAPSHOT_RATE, encode: false, send: (cid, msg) => this.deliver(msg) });
    this.last = performance.now();
    this.timer = setInterval(() => this.pump(), 1000 / 120);
  }
  deliver(msg) { if (this.handler) queueMicrotask(() => this.handler(msg)); }
  pump() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.room.update(dt);
  }
  open(hello) { this.room.join('me', hello); }
  send(msg) { this.room.message('me', msg); }
  onMessage(fn) { this.handler = fn; }
  close() { clearInterval(this.timer); this.handler = null; }
}

export class WebSocketTransport {
  constructor(url) {
    this.kind = 'online';
    this.url = url;
    this.handler = null;
    this.queue = [];
    this.closed = false;
  }
  open(hello) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = (this.ws = new WebSocket(this.url));
      const t = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Could not reach the plant server.')); try { ws.close(); } catch {} } }, 6000);
      ws.onopen = () => { ws.send(JSON.stringify(hello)); };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!settled) {
          if (msg.t === 'welcome') { settled = true; clearTimeout(t); resolve(msg); }
          else if (msg.t === 'error') { settled = true; clearTimeout(t); reject(new Error(msg.msg)); return; }
        }
        if (this.handler) this.handler(msg);
      };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(t); reject(new Error('Connection failed. Is the server running?')); } };
      ws.onclose = () => { this.closed = true; if (this.handler) this.handler({ t: 'closed' }); };
    });
  }
  send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  onMessage(fn) { this.handler = fn; }
  close() { this.closed = true; try { this.ws.close(); } catch {} }
}

export class Session {
  constructor(transport) {
    this.t = transport;
    this.local = []; // [{ pid, device }]
    this.snaps = [];
    this.offset = null;
    this.code = null;
    this.token = null;
    this.listeners = {};
    this.pendingDevices = [];
    this.ping = 0;
    this.lastPing = 0;
    transport.onMessage((m) => this.onMessage(m));
  }

  on(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, data) { for (const fn of this.listeners[type] || []) fn(data); }

  get isLocal() { return this.t.kind === 'local'; }
  get interpDelay() { return this.isLocal ? 0.045 : 0.11; }

  onMessage(m) {
    switch (m.t) {
      case 'welcome':
        this.code = m.code;
        this.token = m.token;
        if (!this.local.length) this.local.push({ pid: m.players[0], device: this.firstDevice || 'wasd' });
        else this.local[0].pid = m.players[0];
        this.emit('welcome', m);
        break;
      case 'local': {
        const dev = this.pendingDevices.shift();
        if (dev) this.local.push({ pid: m.pid, device: dev });
        this.emit('local', m);
        break;
      }
      case 'snap': {
        const now = performance.now() / 1000;
        const off = m.time - now;
        this.offset = this.offset === null ? off : this.offset + (off - this.offset) * 0.08;
        if (off > this.offset + 0.25 || off < this.offset - 0.5) this.offset = off; // resync after stalls
        this.snaps.push(m);
        if (this.snaps.length > 30) this.snaps.shift();
        for (const e of m.ev || []) this.emit('event', e);
        this.latest = m;
        break;
      }
      case 'pong':
        this.ping = performance.now() - m.ts;
        break;
      case 'error':
        this.emit('error', m.msg);
        break;
      case 'closed':
        this.emit('closed');
        break;
    }
  }

  addLocal(device, name, outfit) {
    this.pendingDevices.push(device);
    this.t.send({ t: 'addLocal', name, outfit });
  }

  removeLocal(pid) {
    this.t.send({ t: 'removeLocal', p: pid });
    this.local = this.local.filter((l) => l.pid !== pid);
  }

  sendInputs(input) {
    for (const l of this.local) this.t.send({ t: 'in', p: l.pid, i: input.read(l.device) });
    const now = performance.now();
    if (!this.isLocal && now - this.lastPing > 2000) { this.lastPing = now; this.t.send({ t: 'ping', ts: now }); }
  }

  send(msg) { this.t.send(msg); }

  // interpolated world state at render time
  state() {
    if (!this.snaps.length) return null;
    const now = performance.now() / 1000;
    const rt = now + (this.offset ?? 0) - this.interpDelay;
    let a = null, b = null;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].time <= rt) { a = this.snaps[i]; b = this.snaps[i + 1] || null; break; }
    }
    if (!a) a = this.snaps[0];
    if (!b) return a;
    const k = Math.max(0, Math.min(1, (rt - a.time) / Math.max(1e-4, b.time - a.time)));
    const ents = [];
    const amap = new Map(a.ents.map((e) => [e[0], e]));
    for (const eb of b.ents) {
      const ea = amap.get(eb[0]);
      if (!ea) { ents.push(eb); continue; }
      const e = eb.slice();
      for (let i = 2; i <= 4; i++) e[i] = ea[i] + (eb[i] - ea[i]) * k;
      // nlerp quaternion (shortest path)
      let dot = ea[5] * eb[5] + ea[6] * eb[6] + ea[7] * eb[7] + ea[8] * eb[8];
      const s = dot < 0 ? -1 : 1;
      let qx = ea[5] + (eb[5] * s - ea[5]) * k, qy = ea[6] + (eb[6] * s - ea[6]) * k, qz = ea[7] + (eb[7] * s - ea[7]) * k, qw = ea[8] + (eb[8] * s - ea[8]) * k;
      const l = Math.hypot(qx, qy, qz, qw) || 1;
      e[5] = qx / l; e[6] = qy / l; e[7] = qz / l; e[8] = qw / l;
      ents.push(e);
    }
    const pmap = new Map(a.pl.map((p) => [p.id, p]));
    const pl = b.pl.map((pb) => {
      const pa = pmap.get(pb.id);
      if (!pa) return pb;
      let dy = pb.yaw - pa.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      return { ...pb, x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k, z: pa.z + (pb.z - pa.z) * k, yaw: pa.yaw + dy * k };
    });
    return { ...b, ents, pl, plant: b.plant, game: b.game };
  }

  localIds() { return this.local.map((l) => l.pid); }

  close() { this.t.close(); }
}
