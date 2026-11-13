// Keyboard (two layouts on one keyboard) + gamepads.
// Buttons are sent as press COUNTERS so a tap can never be lost between
// network packets; held state (run / use) is sent as bits.
export const SCHEMES = {
  wasd: {
    label: 'KEYBOARD (WASD)', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    run: ['ShiftLeft'], jump: ['Space'], grab: ['KeyE'], use: ['KeyF'], throw: ['KeyQ'],
    keys: { move: 'WASD', run: 'SHIFT', jump: 'SPACE', grab: 'E', use: 'F', throw: 'Q' },
  },
  arrows: {
    label: 'KEYBOARD (ARROWS)', up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    run: ['ShiftRight'], jump: ['Enter', 'NumpadEnter', 'Numpad0'], grab: ['Period', 'Numpad1'], use: ['Slash', 'Numpad2'], throw: ['Comma', 'Numpad3'],
    keys: { move: '↑←↓→', run: 'R-SHIFT', jump: 'ENTER', grab: '.', use: '/', throw: ',' },
  },
};
export const PAD_KEYS = { move: 'L-STICK', run: 'RT', jump: 'A', grab: 'X', use: 'B', throw: 'Y' };

const ACTIONS = ['jump', 'grab', 'use', 'throw'];

export class Input {
  constructor() {
    this.down = new Set();
    this.counters = {}; // deviceId -> [jump, grab, use, throw]
    this.padPrev = {};
    this.listeners = [];
    this.enabled = true;
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => this.down.clear());
  }

  onKey(e, isDown) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (isDown) {
      if (!e.repeat) {
        for (const [id, s] of Object.entries(SCHEMES)) {
          ACTIONS.forEach((a, i) => { if (s[a].includes(e.code)) this.bump(id, i); });
        }
        for (const l of this.listeners) l(e.code, e);
      }
      this.down.add(e.code);
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Tab'].includes(e.code)) e.preventDefault();
    } else this.down.delete(e.code);
  }

  onPress(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }

  bump(dev, i) {
    if (!this.counters[dev]) this.counters[dev] = [0, 0, 0, 0];
    this.counters[dev][i] = (this.counters[dev][i] + 1) & 0xffff;
  }

  any(codes) { return codes.some((c) => this.down.has(c)); }

  pads() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    return list;
  }

  // poll gamepads for edges; returns ids of pads pressing START (for joining)
  pollPads() {
    const joins = [];
    for (const gp of this.pads()) {
      const id = `pad${gp.index}`;
      const prev = this.padPrev[id] || [];
      const btn = (i) => !!gp.buttons[i]?.pressed;
      const map = [0, 2, 1, 3]; // jump=A grab=X use=B throw=Y
      map.forEach((b, i) => { if (btn(b) && !prev[b]) this.bump(id, i); });
      if (btn(9) && !prev[9]) joins.push(id);
      this.padPrev[id] = gp.buttons.map((b) => b.pressed);
    }
    return joins;
  }

  read(dev) {
    let mx = 0, mz = 0, b = 0;
    if (SCHEMES[dev]) {
      const s = SCHEMES[dev];
      if (this.any(s.left)) mx -= 1;
      if (this.any(s.right)) mx += 1;
      if (this.any(s.up)) mz -= 1;
      if (this.any(s.down)) mz += 1;
      if (this.any(s.run)) b |= 1;
      if (this.any(s.jump)) b |= 2;
      if (this.any(s.grab)) b |= 4;
      if (this.any(s.use)) b |= 8;
      if (this.any(s.throw)) b |= 16;
    } else if (dev.startsWith('pad')) {
      const gp = this.pads().find((g) => `pad${g.index}` === dev);
      if (gp) {
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        const l = Math.hypot(ax, ay);
        if (l > 0.22) { mx = ax; mz = ay; }
        if (gp.buttons[14]?.pressed) mx = -1;
        if (gp.buttons[15]?.pressed) mx = 1;
        if (gp.buttons[12]?.pressed) mz = -1;
        if (gp.buttons[13]?.pressed) mz = 1;
        if (gp.buttons[7]?.value > 0.3 || gp.buttons[6]?.value > 0.3 || gp.buttons[5]?.pressed) b |= 1;
        if (gp.buttons[0]?.pressed) b |= 2;
        if (gp.buttons[2]?.pressed) b |= 4;
        if (gp.buttons[1]?.pressed) b |= 8;
        if (gp.buttons[3]?.pressed) b |= 16;
      }
    }
    if (!this.enabled) { mx = 0; mz = 0; b = 0; }
    return { mx: Math.round(mx * 100) / 100, mz: Math.round(mz * 100) / 100, b, c: (this.counters[dev] || [0, 0, 0, 0]).slice() };
  }

  keysFor(dev) {
    if (SCHEMES[dev]) return SCHEMES[dev].keys;
    return PAD_KEYS;
  }
}
