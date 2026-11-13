// Lobby overlay + in-shift HUD + world-anchored prompts / floaties.
import { h, plate, money, clock, keycap } from './dom.js';
import { CARGO, BAYS, RIDERS, MAX_PLAYERS } from '../../shared/constants.js';
import { ZONES, CONVEYORS, PADS, SKY_DOCK, BOUNDS } from '../../shared/level.js';
import { lockerSheet, openSheet } from './menu.js';

export const ICON = { crate: '📦', wobble: '🛢️', gnome: '🧙', beans: '🫘', balloon: '🎈', magnet: '🧲', mystery: '❓', duck: '🦆' };
const ICON_BG = { crate: '#9fb3bd', wobble: '#ffb38a', gnome: '#bcd4ff', beans: '#ffe08a', balloon: '#ffd1e6', magnet: '#c7d2da', mystery: '#d9c8ff' };
const FIX_HINT = {
  jam: 'Hold USE at the belt service hatch — or slam the zone E-STOP',
  reverse: 'Flip that belt\'s direction lever back',
  blackout: 'Reset the MAIN breaker in the Control Room (two hands = faster)',
  sorter: 'Whack the sorter (hold USE) — or E-STOP the hall',
  overheat: 'Hold USE on it to cool it down. Hot machines toast beans!',
  flux: 'Low gravity! Jumps go high, cargo drifts',
  breach: 'Seal it at either airlock panel. Hold on to your hats',
  ducks: 'Junk on Belt A — feed it to the incinerator',
  surge: 'Boiler spiking — somebody VENT it!',
  flip: 'Cores repel each other. Wait it out or E-STOP the dock',
};

const SVG_RING = (p) => {
  const r = 12, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 30 30"><circle cx="15" cy="15" r="${r}" fill="rgba(27,31,36,.85)" stroke="#2b333a" stroke-width="5"/><circle cx="15" cy="15" r="${r}" fill="none" stroke="#ffc93c" stroke-width="5" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 15 15)" stroke-linecap="round"/></svg>`;
};

export class Hud {
  constructor(app) {
    this.app = app;
    this.root = h('div', { class: 'screen passthrough' });
    this.world = document.getElementById('world-ui');
    this.mode = null;
    this.prompts = new Map();
    this.tags = new Map();
    this.floaties = [];
    this.alerts = [];
    this.lastMoney = 0;
    this.mapT = 0;
  }

  mount() { document.getElementById('ui').append(this.root); }
  unmount() { this.root.remove(); this.world.innerHTML = ''; this.prompts.clear(); this.tags.clear(); this.floaties = []; }

  // ───────────────────────────── lobby ─────────────────────────────
  buildLobby(state) {
    const app = this.app;
    const s = app.session;
    this.root.innerHTML = '';
    const isLocal = s.isLocal;
    this.lob = {};
    const codeBox = plate('dark',
      h('div', { class: 'eyebrow', style: { color: '#ffc93c' } }, isLocal ? 'THIS COMPUTER' : 'ROOM CODE — SHARE IT'),
      h('div', { class: 'code' }, isLocal ? 'COUCH SHIFT' : s.code),
      !isLocal ? h('div', { class: 'eyebrow', style: { color: '#f4ebd9', textTransform: 'none', letterSpacing: '.04em' } }, `Friends: open ${location.host} → JOIN FRIENDS`) : null,
      h('div', { class: 'row interactive', style: { gap: '8px', marginTop: '10px' } },
        h('button', { class: 'btn small', onclick: () => { app.audio.play('locker'); openSheet(app, lockerSheet(app, s.local[0]?.pid)); } }, '👕 LOCKER'),
        h('button', { class: 'btn small steel', onclick: () => app.leaveToMenu() }, 'LEAVE')));
    codeBox.style.padding = '14px 18px';
    codeBox.classList.add('interactive');
    this.lob.roster = h('div', { class: 'roster' });
    this.lob.contract = h('div', { class: 'paper' });
    this.lob.status = h('div', { class: 'lobby-status' });
    this.lob.help = this.helpCard();
    this.lob.banner = h('div', { class: 'center-banner' });
    this.root.append(h('div', { class: 'lobby-ui' },
      h('div', { class: 'top' }, h('div', { class: 'roomcode' }, codeBox), this.lob.roster),
      h('div', { class: 'bottom' }, h('div', { class: 'clipboard contract-board' }, this.lob.contract), this.lob.help),
      this.lob.status, this.lob.banner));
    this.lob.keys = {};
  }

  helpCard() {
    const dev = this.app.session.local[0]?.device || 'wasd';
    const k = this.app.input.keysFor(dev);
    return plate('help-card',
      h('span', { class: 'dymo' }, 'HOW TO WORK HERE'),
      h('div', { class: 'ks' },
        keycap(k.move), 'Move', keycap(k.jump), 'Jump', keycap(k.grab), 'Grab / drop (also friends)',
        keycap(k.use), 'Use machines (hold to repair)', keycap(k.throw), 'Throw / heave / shove', keycap(k.run), 'Run'),
      h('div', { class: 'goal' },
        h('b', {}, 'Break room: '), 'pick a contract on the cork board, sign risky riders on the red wall for more pay, then everyone ', h('b', {}, 'PUNCH IN'), ' at the time clock.',
        this.app.session.isLocal ? h('div', { style: { marginTop: '6px' } }, h('b', {}, 'Couch co-op: '), 'press ', keycap('ENTER'), ' (arrow keys) or ', keycap('START'), ' on a gamepad to add a worker.') : null));
  }

  updateLobby(state) {
    const g = state.game;
    const app = this.app;
    // roster
    const rosterKey = JSON.stringify(state.pl.map((p) => [p.id, p.n, p.o, p.r, p.c]));
    if (this.lob.keys.roster !== rosterKey) {
      this.lob.keys.roster = rosterKey;
      this.lob.roster.innerHTML = '';
      const mine = app.session.localIds();
      for (const p of state.pl) {
        this.lob.roster.append(h('div', { class: `card-worker${p.c ? '' : ' off'}` },
          mine.includes(p.id) ? h('span', { class: 'dymo yellow you' }, mine.length > 1 ? `P${mine.indexOf(p.id) + 1}` : 'YOU') : null,
          h('img', { class: 'portrait', src: app.renderer.portrait(p.o, p.slot ?? p.id) }),
          h('div', { class: 'nm' }, p.n),
          h('div', { class: 'st' }, !p.c ? h('span', { class: 'dymo' }, 'RECONNECTING') : p.r ? h('span', { class: 'dymo teal' }, '✓ PUNCHED IN') : h('span', { class: 'dymo red' }, 'NOT READY'))));
      }
      for (let i = state.pl.length; i < MAX_PLAYERS; i++) this.lob.roster.append(h('div', { class: 'card-worker empty' }, app.session.isLocal ? 'ENTER / START\nTO JOIN' : 'WAITING FOR\nA WORKER'));
    }
    // contract
    const c = g.contracts?.[g.sel];
    const ckey = JSON.stringify([c, g.riders, g.mult, g.ledger]);
    if (c && this.lob.keys.contract !== ckey) {
      this.lob.keys.contract = ckey;
      const el = this.lob.contract;
      el.innerHTML = '';
      el.append(
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' } },
          h('div', {}, h('h3', {}, c.name), h('div', { class: 'client' }, `for ${c.client}`)),
          h('span', { class: 'hazard-meter', title: 'Hazard' }, [0, 1, 2, 3].map((i) => h('i', { class: i <= c.hazard ? 'on' : '' })))),
        h('div', { style: { fontSize: '13px', marginTop: '6px' } }, c.blurb),
        h('div', { class: 'lines' }, Object.entries(c.lines).map(([t, n]) => h('div', { class: 'order-line' },
          h('span', { class: 'ic', style: { background: ICON_BG[t] } }, ICON[t]),
          h('span', {}, CARGO[t].short, h('span', { class: 'bay', style: { background: t === 'mystery' ? '#8b5cf6' : BAYS[CARGO[t].bay].color } }, t === 'mystery' ? '?' : CARGO[t].bay)),
          h('span', { class: 'cnt' }, `×${n}`)))),
        h('div', { class: 'meta' },
          h('span', { class: 'dymo' }, `⏱ ${clock(c.time * (g.riders.rush ? 0.7 : 1))}`),
          h('span', { class: 'dymo teal' }, `BONUS ${money(Math.round(c.bonus * g.mult))}`),
          h('span', { class: 'dymo red' }, `PAY ×${g.mult.toFixed(2)}`)),
        h('div', { class: 'riders' }, Object.entries(RIDERS).map(([k, r]) => h('span', { class: `rider-chip${g.riders[k] ? ' on' : ''}`, title: r.desc }, `${r.name}${g.riders[k] ? ' ✓' : ''}`))),
        h('div', { class: 'eyebrow', style: { marginTop: '8px', textTransform: 'none', letterSpacing: '.03em' } }, `Contract ${g.sel + 1} of ${g.contracts.length} · change it at the cork board · company ledger ${money(g.ledger)}`));
    }
    // status / countdown
    const ready = state.pl.filter((p) => p.r).length;
    const total = state.pl.filter((p) => p.c).length;
    const skey = `${g.ph}${ready}${total}${Math.ceil(g.cd)}`;
    if (this.lob.keys.status !== skey) {
      this.lob.keys.status = skey;
      this.lob.status.innerHTML = '';
      this.lob.banner.innerHTML = '';
      if (g.ph === 'countdown') {
        this.lob.banner.append(h('div', { class: 'small' }, 'SHIFT STARTS IN'), h('div', { class: 'big' }, String(Math.ceil(g.cd))));
      } else {
        this.lob.status.append(h('div', { class: 'msg' }, `⏰ ${ready}/${total} PUNCHED IN — walk to the TIME CLOCK by the door and press USE`));
      }
    }
  }

  // ───────────────────────────── shift HUD ─────────────────────────────
  buildShift() {
    this.root.innerHTML = '';
    this.sh = {};
    this.sh.manifest = h('div', { class: 'paper' });
    this.sh.time = h('div', { class: 'lcd' }, '0:00');
    this.sh.phase = h('div', { class: 'phase' }, 'SHIFT');
    this.sh.money = h('div', { class: 'lcd amber' }, '$0');
    this.sh.mult = h('span', { class: 'dymo red' }, '×1.00');
    this.sh.alerts = h('div', { class: 'alerts' });
    this.sh.hotline = h('div', {});
    this.sh.map = h('canvas', { width: 480, height: 230 });
    this.sh.banner = h('div', { class: 'center-banner' });
    this.root.append(h('div', { class: 'hud' },
      h('div', { class: 'manifest clipboard' }, this.sh.manifest),
      h('div', { class: 'clock' }, this.sh.time, this.sh.phase),
      h('div', { class: 'wallet' }, this.sh.money, h('div', { class: 'row', style: { gap: '6px' } }, this.sh.mult)),
      this.sh.alerts, this.sh.hotline,
      h('div', { class: 'minimap plate dark no-rivets', style: { padding: '8px' } }, this.sh.map),
      this.sh.banner));
    this.sh.keys = {};
    this.sh.transient = [];
  }

  updateShift(state, dt) {
    const g = state.game, plant = state.plant;
    const sh = this.sh;
    // manifest
    const mkey = JSON.stringify([g.order, g.otOrder, g.ot, g.otDone, g.qm, g.contract]);
    if (sh.keys.m !== mkey) {
      sh.keys.m = mkey;
      const line = ([t, need, done]) => h('div', { class: `order-line${done >= need ? ' done' : ''}` },
        h('span', { class: 'ic', style: { background: ICON_BG[t] } }, ICON[t]),
        h('span', {}, CARGO[t].short, h('span', { class: 'bay', style: { background: t === 'mystery' ? '#8b5cf6' : BAYS[CARGO[t].bay].color } }, t === 'mystery' ? 'SCAN' : CARGO[t].bay)),
        h('span', { class: 'cnt' }, `${Math.min(done, need)}/${need}`));
      sh.manifest.innerHTML = '';
      sh.manifest.append(h('div', { class: 'ttl' }, h('b', {}, g.contract?.name || 'ORDER'), g.qm ? h('span', { class: 'dymo teal' }, 'QUOTA MET') : null));
      sh.manifest.append(...g.order.map(line));
      if (g.ot) {
        sh.manifest.append(h('span', { class: 'dymo red ot-tag' }, `OVERTIME #${g.ot}${g.otDone ? ' ✓' : ''}`));
        sh.manifest.append(...g.otOrder.map(line));
      }
    }
    // clock
    const tl = g.tl;
    sh.time.textContent = clock(tl);
    sh.time.className = `lcd${tl < 30 ? ' red' : tl < 60 ? ' amber' : ''}`;
    if (tl < 10 && Math.ceil(tl) !== sh.keys.beep) { sh.keys.beep = Math.ceil(tl); this.app.audio.play('beep'); }
    sh.phase.textContent = g.ph === 'ending' ? 'SHIFT OVER' : g.ot ? (g.otDone ? `OVERTIME #${g.ot} DONE` : `OVERTIME #${g.ot}`) : g.qm ? 'QUOTA MET — BONUS TIME' : 'TIME LEFT';
    // money
    if (g.money !== this.lastMoney) {
      sh.money.textContent = money(g.money);
      sh.money.classList.toggle('neg', g.money < 0);
      sh.money.classList.remove('bump'); void sh.money.offsetWidth; sh.money.classList.add('bump');
      this.lastMoney = g.money;
    }
    sh.mult.textContent = `PAY ×${g.mult.toFixed(2)}`;
    // alerts: active incidents + pressure + transients
    const items = [];
    for (const inc of plant.inc) items.push({ key: 'i' + inc.id, cls: inc.k === 'blackout' || inc.k === 'breach' ? 'red' : '', ic: '⚠', text: inc.tx, hint: FIX_HINT[inc.k], dur: inc.d, t: inc.t });
    if (plant.P > 85) items.push({ key: 'pressure', cls: 'red', ic: '♨', text: 'BOILER PRESSURE CRITICAL', hint: 'Get to the Control Room and VENT the boiler!' });
    for (const tr of sh.transient) items.push(tr);
    const akey = items.map((i) => i.key + (i.dur ? Math.floor((i.dur - i.t)) : '')).join('|');
    if (sh.keys.a !== akey) {
      sh.keys.a = akey;
      const existing = new Map([...sh.alerts.children].map((c) => [c.dataset.k, c]));
      const keep = new Set();
      for (const it of items.slice(0, 5)) {
        keep.add(it.key);
        let el = existing.get(it.key);
        const body = [h('span', { class: 'stripe' }), h('span', { class: 'ic' }, it.ic), h('div', {}, h('div', {}, it.text + (it.dur ? ` (${Math.max(0, Math.ceil(it.dur - it.t))}s)` : '')), it.hint ? h('div', { class: 'hint' }, it.hint) : null)];
        if (!el) { el = h('div', { class: `alert ${it.cls || ''}`, 'data-k': it.key }, ...body); sh.alerts.append(el); }
        else { el.innerHTML = ''; el.append(...body); }
      }
      for (const [k, el] of existing) if (!keep.has(k)) el.remove();
    }
    sh.transient = sh.transient.filter((t) => (t.life -= dt) > 0);
    // hotline
    const showHot = g.ring && g.ph === 'shift';
    if (sh.keys.hot !== showHot) {
      sh.keys.hot = showHot;
      sh.hotline.innerHTML = '';
      if (showHot) sh.hotline.append(h('div', { class: 'hotline-banner' }, h('span', { class: 'phone' }, '☎'),
        h('div', {}, h('div', { class: 't' }, 'THE FOREMAN IS CALLING'), h('div', { class: 'd' }, 'Quota met. Go to the HOTLINE in the Shipping Dock: pull CLOCK OUT to bank it, or OVERTIME for ×1.5 pay — fail overtime and half the quota bonus is clawed back. Discuss!'))));
    }
    // ending banner
    if (sh.keys.end !== g.ph) {
      sh.keys.end = g.ph;
      sh.banner.innerHTML = '';
      if (g.ph === 'ending') sh.banner.append(h('div', { class: 'big' }, g.res === 'QUOTA MISSED' || g.res === 'OVERTIME BUST' ? 'WHISTLE!' : 'CLOCKED OUT!'), h('div', { class: 'small' }, g.res || ''));
    }
    // minimap
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.1; this.drawMap(state); }
  }

  pushTransient(text, cls = '', ic = '★', life = 4, hint) {
    if (!this.sh) return;
    this.sh.transient.push({ key: 't' + Math.random(), cls, ic, text, life, hint });
    if (this.sh.transient.length > 3) this.sh.transient.shift();
  }

  banner(big, small, ms = 2200) {
    const target = this.sh?.banner || this.lob?.banner;
    if (!target) return;
    target.innerHTML = '';
    target.append(h('div', { class: 'big drop-in' }, big), small ? h('div', { class: 'small' }, small) : null);
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { if (target.firstChild?.classList?.contains('drop-in')) target.innerHTML = ''; }, ms);
  }

  drawMap(state) {
    const cv = this.sh.map;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const sx = W / (BOUNDS.maxX - BOUNDS.minX + 2), sz = H / (BOUNDS.maxZ - BOUNDS.minZ + 2);
    const s = Math.min(sx, sz);
    const ox = (W - (BOUNDS.maxX - BOUNDS.minX) * s) / 2, oz = (H - (BOUNDS.maxZ - BOUNDS.minZ) * s) / 2;
    const X = (x) => ox + (x - BOUNDS.minX) * s, Z = (z) => oz + (z - BOUNDS.minZ) * s;
    g.clearRect(0, 0, W, H);
    for (const zn of ZONES) {
      const dark = state.plant && !state.plant.main;
      g.fillStyle = dark ? '#3a2626' : zn.id === 'lobby' ? '#3d5a5a' : '#2c4a50';
      g.fillRect(X(zn.x0) + 1, Z(zn.z0) + 1, (zn.x1 - zn.x0) * s - 2, (zn.z1 - zn.z0) * s - 2);
      if (state.plant?.zg?.[zn.id] !== undefined) { g.fillStyle = 'rgba(201,165,255,.35)'; g.fillRect(X(zn.x0), Z(zn.z0), (zn.x1 - zn.x0) * s, (zn.z1 - zn.z0) * s); }
    }
    g.fillStyle = '#56707a';
    g.fillRect(X(SKY_DOCK.x0), Z(SKY_DOCK.z0), (SKY_DOCK.x1 - SKY_DOCK.x0) * s, (SKY_DOCK.z1 - SKY_DOCK.z0) * s);
    for (const b of CONVEYORS) {
      const jam = state.plant?.b[b.id][1];
      g.fillStyle = jam ? '#ff3b30' : '#ffc93c';
      g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    }
    for (const [id, p] of Object.entries(PADS)) {
      g.strokeStyle = BAYS[id].color; g.lineWidth = 3;
      g.strokeRect(X(p.x - p.size / 2), Z(p.z - p.size / 2), p.size * s, p.size * s);
      g.fillStyle = BAYS[id].color; g.font = 'bold 13px Bungee, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(id, X(p.x), Z(p.z));
    }
    for (const e of state.ents) {
      const bay = e[9];
      g.fillStyle = bay === 'A' ? '#e8423f' : bay === 'B' ? '#3b82d6' : bay === 'C' ? '#ffc93c' : bay === '?' ? '#c9a5ff' : '#999';
      g.fillRect(X(e[2]) - 2.5, Z(e[4]) - 2.5, 5, 5);
    }
    const mine = this.app.session.localIds();
    for (const p of state.pl) {
      g.beginPath(); g.arc(X(p.x), Z(p.z), mine.includes(p.id) ? 6 : 5, 0, Math.PI * 2);
      g.fillStyle = p.o.color; g.fill();
      g.lineWidth = 2; g.strokeStyle = mine.includes(p.id) ? '#fff' : '#1b1f24'; g.stroke();
    }
    g.fillStyle = '#f4ebd9'; g.font = '10px "Space Mono", monospace'; g.textAlign = 'left';
    g.fillText('PLANT 7', 6, 12);
  }

  // ───────────────────────────── world-anchored bits ─────────────────────────────
  updateWorld(state, dt) {
    const app = this.app;
    const mine = app.session.local;
    const r = app.renderer;
    const seen = new Set();
    const multi = mine.length > 1;
    for (const p of state.pl) {
      const local = mine.find((l) => l.pid === p.id);
      const sc = r.toScreen(p.x, p.y + 1.55 + (p.s === 1 ? -0.8 : 0), p.z);
      // name tag (everyone)
      let tag = this.tags.get(p.id);
      if (!tag) { tag = h('div', { class: 'wprompt' }, h('span', { class: 'tagname' })); this.world.append(tag); this.tags.set(p.id, tag); }
      const tn = tag.firstChild;
      const label = local && multi ? `P${mine.indexOf(local) + 1} ${p.n}` : p.n;
      if (tn.textContent !== label) tn.textContent = label;
      tn.style.background = p.o.color;
      tag.style.left = sc.x + 'px'; tag.style.top = sc.y + 'px';
      tag.style.opacity = local || state.game.ph !== 'shift' || state.pl.length > 1 ? (p.c ? 1 : 0.5) : 0;
      seen.add(p.id);
      // prompts (local workers only)
      let pr = this.prompts.get(p.id);
      if (!local) { if (pr) { pr.remove(); this.prompts.delete(p.id); } continue; }
      if (!pr) { pr = h('div', { class: 'wprompt' }); this.world.append(pr); this.prompts.set(p.id, pr); }
      const k = app.input.keysFor(local.device);
      const pp = p.pr;
      const key = pp ? JSON.stringify(pp) + local.device : '';
      if (pr.dataset.key !== key) {
        pr.dataset.key = key;
        pr.innerHTML = '';
        if (pp) {
          if (pp.u) {
            const chip = h('div', { class: 'chip use' }, keycap(k.use), pp.u);
            if (pp.k === 'hold' && pp.p > 0) chip.insertAdjacentHTML('afterbegin', SVG_RING(pp.p));
            pr.append(chip);
          }
          if (pp.g) pr.append(h('div', { class: 'chip' }, keycap(k.grab), pp.g));
          if (pp.t) pr.append(h('div', { class: 'chip' }, keycap(k.throw), pp.t));
        }
      }
      const sc2 = r.toScreen(p.x, p.y + 2.05, p.z);
      pr.style.left = sc2.x + 'px'; pr.style.top = (sc2.y - 14) + 'px';
      pr.style.opacity = pp && p.s === 0 ? 1 : 0;
    }
    for (const [id, el] of this.tags) if (!seen.has(id)) { el.remove(); this.tags.delete(id); }
    for (const [id, el] of this.prompts) if (!seen.has(id)) { el.remove(); this.prompts.delete(id); }
    // floaties
    for (let i = this.floaties.length - 1; i >= 0; i--) {
      const f = this.floaties[i];
      f.life -= dt;
      f.y += dt * 1.2;
      const sc = r.toScreen(f.x, f.y, f.z);
      f.el.style.left = sc.x + 'px'; f.el.style.top = sc.y + 'px';
      f.el.style.opacity = Math.min(1, f.life * 2);
      f.el.style.transform = `translate(-50%,-50%) scale(${1 + Math.max(0, f.life - 1.3) * 1.5})`;
      if (f.life <= 0) { f.el.remove(); this.floaties.splice(i, 1); }
    }
  }

  floaty(text, x, y, z, cls = '') {
    const el = h('div', { class: `floaty ${cls}` }, text);
    this.world.append(el);
    this.floaties.push({ el, x, y, z, life: 1.6 });
  }

  update(state, dt) {
    const ph = state.game.ph;
    const mode = ph === 'lobby' || ph === 'countdown' ? 'lobby' : 'shift';
    if (mode !== this.mode) {
      this.mode = mode;
      if (mode === 'lobby') { this.sh = null; this.buildLobby(state); } else { this.lob = null; this.buildShift(); }
    }
    if (mode === 'lobby') this.updateLobby(state); else this.updateShift(state, dt);
    this.updateWorld(state, dt);
  }
}
