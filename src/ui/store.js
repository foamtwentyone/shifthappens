// Persistent settings + employee records (localStorage, best-effort).
const DEFAULTS = {
  master: 0.8, music: 0.55, sfx: 0.9, quality: 'medium', shake: true, prompts: true,
  name: '', outfit: { color: '#ff7a2f', hat: 'none', model: 'worker' }, server: '',
};

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : { ...fallback }; } catch { return { ...fallback }; }
}
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }

export class Settings {
  constructor() { this.v = load('sh_settings', DEFAULTS); this.subs = []; }
  get(k) { return this.v[k]; }
  set(k, val) { this.v[k] = val; save('sh_settings', this.v); for (const s of this.subs) s(k, val); }
  onChange(fn) { this.subs.push(fn); }
}

export class Records {
  constructor() { this.v = load('sh_records', { shifts: [], total: 0, best: 0, awards: {}, worked: 0 }); }
  add(report, myIds) {
    const v = this.v;
    v.worked++;
    v.total += report.total;
    v.best = Math.max(v.best, report.total);
    v.shifts.unshift({ date: Date.now(), contract: report.contract, result: report.result, total: report.total, crew: report.players.length });
    v.shifts = v.shifts.slice(0, 12);
    for (const a of report.awards) if (myIds.includes(a.pid)) v.awards[a.title] = (v.awards[a.title] || 0) + 1;
    save('sh_records', v);
  }
}
