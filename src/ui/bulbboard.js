// Chunky bulb scoreboard — an old stadium board made of fat cartoon light bulbs.
// Digits are drawn from a 5×7 dot grid, so every glyph (incl. $ and -) matches
// the round, toy-like look of the rest of the game.
const GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ':': ['0', '0', '1', '0', '1', '0', '0'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

const COLORS = {
  amber: { on: '#ffb02e', core: '#fff1c2', off: 'rgba(255,176,46,0.075)', glow: 'rgba(255,150,30,0.85)' },
  green: { on: '#5cf07a', core: '#e3ffe8', off: 'rgba(92,240,122,0.07)', glow: 'rgba(60,240,100,0.8)' },
  red: { on: '#ff4a3d', core: '#ffd9d4', off: 'rgba(255,74,61,0.11)', glow: 'rgba(255,50,40,0.9)' },
};

export class BulbBoard {
  // cells: how many 5-wide characters fit; pitch: CSS px between bulbs
  constructor({ label, color = 'amber', cells = 5, pitch = 7, colon = false }) {
    this.color = color;
    this.pitch = pitch;
    this.cells = cells;
    this.colon = colon;
    this.cols = cells * 6 - 1 + (colon ? 2 : 0);
    this.canvas = document.createElement('canvas');
    this.el = document.createElement('div');
    this.el.className = 'board';
    const lab = document.createElement('div');
    lab.className = 'board-label';
    lab.textContent = label;
    const face = document.createElement('div');
    face.className = 'board-face';
    face.append(this.canvas);
    this.el.append(lab, face);
    this.text = null;
    this.blink = false;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = this.cols * this.pitch, hgt = 7 * this.pitch;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(hgt * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${hgt}px`;
    this.dpr = dpr;
  }

  set(text, color = this.color, blinkOff = false) {
    const key = `${text}|${color}|${blinkOff}`;
    if (key === this.key) return;
    this.key = key;
    this.text = text;
    this.drawText(text, COLORS[color], blinkOff);
  }

  // lay out right-aligned glyph columns
  layout(text) {
    const cols = [];
    for (const ch of text) {
      const g = GLYPHS[ch] || GLYPHS[' '];
      if (cols.length) cols.push(null); // 1-col gap
      for (let x = 0; x < g[0].length; x++) cols.push(g.map((row) => row[x] === '1'));
    }
    while (cols.length < this.cols) cols.unshift(null);
    return cols.slice(-this.cols);
  }

  drawText(text, C, blinkOff) {
    const g = this.canvas.getContext('2d');
    const p = this.pitch * this.dpr;
    const r = p * 0.44;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const cols = this.layout(text);
    // unlit bulbs first (the whole grid is always visible, like a real board)
    for (let x = 0; x < this.cols; x++) for (let y = 0; y < 7; y++) {
      const cx = (x + 0.5) * p, cy = (y + 0.5) * p;
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = C.off;
      g.beginPath(); g.arc(cx, cy, r * 0.82, 0, Math.PI * 2); g.fill();
    }
    if (blinkOff) return;
    // lit bulbs: glow → body → hot core → cartoon highlight
    g.save();
    g.shadowColor = C.glow;
    g.shadowBlur = p * 1.1;
    g.fillStyle = C.on;
    for (let x = 0; x < cols.length; x++) {
      const col = cols[x];
      if (!col) continue;
      for (let y = 0; y < 7; y++) if (col[y]) { g.beginPath(); g.arc((x + 0.5) * p, (y + 0.5) * p, r, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
    for (let x = 0; x < cols.length; x++) {
      const col = cols[x];
      if (!col) continue;
      for (let y = 0; y < 7; y++) {
        if (!col[y]) continue;
        const cx = (x + 0.5) * p, cy = (y + 0.5) * p;
        const grd = g.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
        grd.addColorStop(0, C.core); grd.addColorStop(0.55, C.on); grd.addColorStop(1, C.on);
        g.fillStyle = grd;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.beginPath(); g.arc(cx - r * 0.35, cy - r * 0.38, r * 0.22, 0, Math.PI * 2); g.fill();
      }
    }
  }
}
