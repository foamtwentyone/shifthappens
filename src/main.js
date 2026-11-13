import '@fontsource/bungee/400.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './ui/styles.css';

import { Renderer } from './render/Renderer.js';
import { Audio } from './audio/Audio.js';
import { Input, SCHEMES } from './input/Input.js';
import { Session, LocalTransport, WebSocketTransport } from './net/Session.js';
import { Settings, Records } from './ui/store.js';
import { h, plate, toast, money } from './ui/dom.js';
import { titleScreen, mainMenu, openSheet, closeSheet, settingsSheet, lockerSheet } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { showReport } from './ui/report.js';
import { CARGO } from '../shared/constants.js';

class App {
  constructor() {
    this.settings = new Settings();
    this.records = new Records();
    this.input = new Input();
    this.audio = new Audio(this.settings);
    this.renderer = new Renderer(document.getElementById('gl'), this.settings);
    this.ui = document.getElementById('ui');
    this.session = null;
    this.hud = null;
    this.screen = null;
    this.paused = false;
    this.last = performance.now();
    this.state = null;
    this.input.onPress((code) => this.onKey(code));
    window.__app = this; // handy for debugging / automated checks
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  setScreen(el) {
    if (this.screen) { this.screen.cleanup?.(); this.screen.remove(); }
    this.screen = el;
    if (el) this.ui.append(el);
  }

  showTitle() {
    this.renderer.setMode('menu');
    this.audio.setMood('off');
    this.setScreen(titleScreen(this));
  }

  showMenu() {
    this.renderer.setMode('menu');
    this.audio.setMood('menu');
    this.setScreen(mainMenu(this));
  }

  quit() {
    this.setScreen(h('div', { class: 'screen title-card fade-in' },
      h('div', { style: { textAlign: 'center', color: '#f4ebd9' } },
        h('div', { class: 'stamp', style: { fontSize: '48px' } }, 'CLOCKED OUT'),
        h('p', { style: { marginTop: '26px', fontSize: '18px' } }, 'You went home. The boiler is fine. Probably.'),
        h('div', { class: 'press' }, 'PRESS ANY KEY TO COME BACK TO WORK'))));
    this.audio.setMood('off');
    setTimeout(() => {
      const off = this.input.onPress(() => { off(); this.showMenu(); });
      this.screen.addEventListener('pointerdown', () => { off(); this.showMenu(); });
    }, 400);
  }

  hello() {
    return { name: this.settings.get('name') || '', outfit: this.settings.get('outfit') };
  }

  async startLocal() {
    const t = new LocalTransport();
    const s = new Session(t);
    s.firstDevice = 'wasd';
    this.attach(s);
    t.open(this.hello());
  }

  wsUrl(server) {
    let host = (server || '').trim() || location.host;
    if (!host) throw new Error('No plant server address. Run `npm start` and open the address it prints.');
    host = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const secure = location.protocol === 'https:' && !server;
    return `${secure ? 'wss' : 'ws'}://${host}/ws`;
  }

  async hostOnline() {
    const t = new WebSocketTransport(this.wsUrl(this.settings.get('server')));
    const s = new Session(t);
    s.firstDevice = 'wasd';
    await t.open({ t: 'create', ...this.hello() });
    this.attach(s);
  }

  async joinOnline(code, server) {
    const t = new WebSocketTransport(this.wsUrl(server));
    const s = new Session(t);
    s.firstDevice = 'wasd';
    const tokenKey = `sh_token_${code}`;
    let token;
    try { token = sessionStorage.getItem(tokenKey) || undefined; } catch {}
    await t.open({ t: 'join', code, token, ...this.hello() });
    this.attach(s);
    try { sessionStorage.setItem(tokenKey, s.token || ''); } catch {}
  }

  attach(s) {
    this.session = s;
    this.state = null;
    this.reportShown = 0;
    this.setScreen(null);
    this.renderer.setMode('game');
    this.renderer.focusCamera(new (this.renderer.camTarget.constructor)(-39, 0, 0), 22, false);
    this.hud = new Hud(this);
    this.hud.mount();
    s.on('event', (e) => this.onEvent(e));
    s.on('error', (m) => toast(m));
    s.on('closed', () => { if (this.session === s) { toast('Lost connection to the plant server.'); this.leaveToMenu(); } });
    s.on('welcome', () => {});
  }

  leaveToMenu() {
    closeSheet();
    document.querySelector('.report-wrap')?.remove();
    document.querySelector('.pause-back')?.remove();
    this.paused = false;
    if (this.session) { this.session.close(); this.session = null; }
    if (this.hud) { this.hud.unmount(); this.hud = null; }
    for (const [id, w] of this.renderer.workers) { this.renderer.scene.remove(w.model, w.model.userData.blob); }
    this.renderer.workers.clear();
    for (const [id, c] of this.renderer.cargo) this.renderer.scene.remove(c.g, c.badge);
    this.renderer.cargo.clear();
    this.renderer.lightLevel = 1;
    this.renderer.updateLighting({ plant: { main: 1 }, game: {}, pl: [] }, 1);
    for (const l of ['belt', 'fan', 'boiler']) this.audio.setLoop(l, 0);
    this.showMenu();
  }

  onKey(code) {
    if (!this.session) return;
    if (code === 'Escape' && !document.querySelector('.modal-back') && !document.querySelector('.report-wrap')) { this.togglePause(); return; }
    // couch join in the break room
    const g = this.state?.game;
    if (g && (g.ph === 'lobby' || g.ph === 'countdown') && !this.paused && !document.querySelector('.modal-back')) {
      const used = this.session.local.map((l) => l.device).concat(this.session.pendingDevices);
      if (SCHEMES.arrows.jump.includes(code) && !used.includes('arrows')) this.addCouch('arrows');
    }
  }

  addCouch(device) {
    if (this.state && this.state.pl.length >= 4) { toast('The shift is full (4 workers).'); return; }
    const n = this.session.local.length + 1;
    const cols = ['#1fb5a8', '#8b5cf6', '#7ac943', '#ff5d8f'];
    const hats = ['cone', 'beanie', 'cap', 'welder'];
    this.session.addLocal(device, `Player ${n}`, { color: cols[n % 4], hat: hats[n % 4], face: ['stache', 'sleepy', 'grumpy', 'happy'][n % 4] });
    this.audio.play('punch');
    toast(`Player ${n} clocked in on ${device.startsWith('pad') ? 'a gamepad' : 'the arrow keys'}!`);
  }

  togglePause() {
    const existing = document.querySelector('.pause-back');
    if (existing) { existing.remove(); this.paused = false; this.setLocalPause(false); this.input.enabled = true; return; }
    this.paused = true;
    this.setLocalPause(true);
    this.input.enabled = false;
    const resume = () => this.togglePause();
    const lobby = this.state?.game?.ph === 'lobby';
    const el = h('div', { class: 'pause-back fade-in' },
      h('div', { class: 'sheet drop-in', style: { width: 'min(440px,92vw)' } }, plate('',
        h('div', { class: 'hazard-bar', style: { marginBottom: '14px' } }),
        h('h2', {}, this.session.isLocal ? 'TEA BREAK' : 'QUICK BREAK'),
        h('div', { class: 'eyebrow', style: { marginBottom: '14px' } }, this.session.isLocal ? 'The plant is paused' : 'Online: the plant keeps running!'),
        h('div', { style: { display: 'grid', gap: '10px' } },
          h('button', { class: 'btn', onclick: resume }, 'BACK TO WORK'),
          lobby ? h('button', { class: 'btn steel', onclick: () => { resume(); openSheet(this, lockerSheet(this, this.session.local[0]?.pid)); } }, 'LOCKER ROOM') : null,
          h('button', { class: 'btn steel', onclick: () => { openSheet(this, settingsSheet(this)); } }, 'SETTINGS'),
          h('button', { class: 'btn red', onclick: () => { this.leaveToMenu(); } }, 'LEAVE SHIFT')))));
    this.ui.append(el);
  }

  setLocalPause(p) {
    const t = this.session?.t;
    if (t?.kind !== 'local') return;
    if (p) { clearInterval(t.timer); t.timer = null; }
    else if (!t.timer) { t.last = performance.now(); t.timer = setInterval(() => t.pump(), 1000 / 120); }
  }

  posOf(id) {
    const p = this.state?.pl.find((q) => q.id === id);
    return p ? { x: p.x, z: p.z } : {};
  }

  onEvent(e) {
    const a = this.audio, hud = this.hud, r = this.renderer;
    r.onEvent(e);
    const P = (id) => this.posOf(id);
    switch (e.type) {
      case 'click': a.play(e.snd, P(e.id)); break;
      case 'grab': a.play('grab', P(e.id)); break;
      case 'drop': a.play('drop', P(e.id)); break;
      case 'throw': a.play('throw', P(e.id)); break;
      case 'shove': a.play('shove', P(e.id)); break;
      case 'jump': a.play('jump', { ...P(e.id), vol: 0.6 }); break;
      case 'knock': a.play('knock', { x: e.x, z: e.z }); break;
      case 'voice': a.voice(e.id, e.kind, P(e.id).x, P(e.id).z); break;
      case 'thud': a.play('thud', { x: e.x, z: e.z, v: e.v }); break;
      case 'break': a.play('break', { x: e.x, z: e.z }); hud?.floaty(`${CARGO[e.t]?.short || ''} SMASHED`, e.x, e.y + 1, e.z, 'neg'); break;
      case 'burn': a.play('burn', { x: e.x, z: e.z }); if (e.t === 'player') hud?.floaty('OUCH!', e.x, 2, e.z, 'neg'); break;
      case 'burst': a.play('burst'); a.play('klaxon'); hud?.pushTransient('BOILER BURST! -$120', 'red', '💥', 5, 'Somebody forgot to vent it…'); break;
      case 'ship': a.play('ship', P(0)); break;
      case 'paid':
        a.play('paid', { x: e.x, z: e.z, vol: e.amt < 0 ? 0.4 : 1 });
        if (e.x !== undefined) hud?.floaty(`${e.amt >= 0 ? '+' : ''}${money(e.amt)}`, e.x, e.y ?? 1.5, e.z, e.amt < 0 ? 'neg' : '');
        else if (e.amt < 0 && !['Boiler burst', 'Emergency stop'].includes(e.label)) hud?.pushTransient(`${e.label}: ${money(e.amt)}`, '', '💸', 3);
        break;
      case 'reject': a.play('reject', { x: e.x, z: e.z }); hud?.floaty(`REJECTED: ${e.why}`, e.x, 2.2, e.z, 'neg'); break;
      case 'scan': a.play('scan', { x: -9.5, z: 0, vol: 0.7 }); break;
      case 'dispense': a.play('dispense', { x: -26, z: 0 }); break;
      case 'tube': a.play('tube', { x: -5, z: -7 }); break;
      case 'tubeout': a.play('tubeout', { x: 21, z: -7 }); break;
      case 'fling': a.play('throw', { x: -5, z: 0 }); break;
      case 'incident': a.play('klaxon', { vol: 0.7 }); break;
      case 'resolved': if (e.by?.length) { a.play('fixed'); const names = e.by.map((id) => this.state?.pl.find((p) => p.id === id)?.n).filter(Boolean); toast(`✔ Fixed by ${names.join(' & ')}`); } break;
      case 'power': a.play(e.on ? 'powerup' : 'powerdown'); break;
      case 'alarm': a.play('alarm', { vol: 0.6 }); break;
      case 'estop': a.play('estop'); hud?.pushTransient(`EMERGENCY STOP: ${e.zone.toUpperCase()} (-$25)`, 'red', '🛑', 3); break;
      case 'airlock': a.play('airlock', { x: 7, z: 0 }); break;
      case 'denied': a.play('denied'); break;
      case 'quota': a.play('quota'); hud?.banner('QUOTA MET!', `+${money(e.bonus)} bonus — answer the hotline!`, 3500); hud?.pushTransient(`QUOTA MET! +${money(e.bonus)}`, 'good', '✅', 6); break;
      case 'otdone': a.play('quota'); hud?.banner('OVERTIME DONE!', `+${money(e.bonus)}`, 3000); break;
      case 'overtime': a.play('horn'); hud?.banner(`OVERTIME #${e.n}`, `+${e.extra}s on the clock · ×1.5 pay · more chaos`, 3000); break;
      case 'shift': a.play('horn'); setTimeout(() => hud?.banner('SHIFT START!', e.name, 2600), 50); break;
      case 'shiftend': a.play(e.result === 'QUOTA MISSED' || e.result === 'OVERTIME BUST' ? 'fail' : 'horn'); break;
      case 'countdown': if (!e.cancel) a.play('beep'); break;
      case 'report': this.onReport(e.report); break;
      case 'join': if (this.state) toast(`👷 ${e.name} clocked in`); a.play('punch'); break;
      case 'rejoin': toast(`🔌 ${e.name} reconnected`); break;
      case 'leave': toast(`👋 ${e.name} went home`); break;
      case 'disconnect': toast(`📵 ${e.name} lost connection — 30s to come back`); break;
      case 'punch': break;
      case 'select': break;
      case 'hop': a.play('hop', { ...P(0), vol: 0.5 }); break;
      case 'slosh': a.play('slosh', { vol: 0.5 }); break;
    }
  }

  onReport(rep) {
    if (this.reportShown === rep.id) return;
    this.reportShown = rep.id;
    this.records.add(rep, this.session?.localIds() || []);
    setTimeout(() => { if (this.session) { showReport(this, rep); this.audio.play('paper'); } }, 200);
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.session) {
      for (const dev of this.input.pollPads()) {
        const g = this.state?.game;
        const used = this.session.local.map((l) => l.device).concat(this.session.pendingDevices);
        if (g && (g.ph === 'lobby' || g.ph === 'countdown') && !used.includes(dev)) this.addCouch(dev);
        else if (used.includes(dev) && !document.querySelector('.report-wrap')) this.togglePause(); // START on an active pad pauses
      }
      if (!this.paused) this.session.sendInputs(this.input);
      const st = this.session.state();
      if (st) {
        this.state = st;
        this.hud?.update(st, dt);
        this.updateSound(st);
        document.getElementById('vignette').className = st.game.dark ? 'dark' : !st.plant.main || st.plant.P > 88 ? 'alarm' : '';
      }
      this.renderer.render(st, dt, this.session.localIds());
    } else {
      this.input.pollPads();
      document.getElementById('vignette').className = '';
      this.renderer.render(null, dt, []);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  updateSound(st) {
    const a = this.audio;
    const ct = this.renderer.camTarget;
    a.listener.x = ct.x; a.listener.z = ct.z;
    const g = st.game;
    const shift = g.ph === 'shift' || g.ph === 'ending';
    a.setMood(g.ph === 'lobby' || g.ph === 'countdown' ? 'lobby' : g.ot && !g.otDone ? 'overtime' : 'shift', Math.min(2, st.plant.inc.length));
    if (!shift) { a.setLoop('belt', 0); a.setLoop('fan', 0); a.setLoop('boiler', 0); return; }
    const moving = Object.values(st.plant.b).reduce((n, b) => n + (Math.abs(b[2]) > 0.3 ? 1 : 0), 0);
    a.setLoop('belt', 0.05 * moving);
    const fanD = Math.hypot(ct.x - 24.6, ct.z + 3.4);
    a.setLoop('fan', st.plant.fan ? Math.max(0, 0.25 - fanD / 80) : 0);
    const bD = Math.hypot(ct.x, ct.z + 18);
    a.setLoop('boiler', (st.plant.P / 100) * Math.max(0.03, 0.35 - bD / 70));
  }
}

async function boot() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('64px Bungee'), document.fonts.load('20px "Space Mono"'), document.fonts.load('16px Rubik')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fonts are a nice-to-have */ }
  new App();
}
boot();
