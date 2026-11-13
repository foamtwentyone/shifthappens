// Title card, main menu ("the shift manager's desk") and its sheets.
import { h, plate, money, keycap } from './dom.js';
import { OUTFIT_COLORS, HATS, FACES } from '../../shared/constants.js';
import { SCHEMES, PAD_KEYS } from '../input/Input.js';

const warnSvg = `<svg class="warn" viewBox="0 0 64 56"><path d="M32 4 L60 52 L4 52 Z" fill="#ffc93c" stroke="#1b1f24" stroke-width="5" stroke-linejoin="round"/><rect x="29" y="20" width="6" height="16" rx="2" fill="#1b1f24"/><circle cx="32" cy="43" r="3.5" fill="#1b1f24"/></svg>`;

export function logo(small = false) {
  const el = h('div', { class: `logo${small ? ' small' : ''}` },
    h('span', { class: 'word' }, 'SHIFT'),
    h('span', { class: 'word second' }, 'HAPPENS'),
    h('span', { class: 'tag dymo red' }, 'PLANT 7 · DEMO'));
  el.insertAdjacentHTML('afterbegin', warnSvg);
  return el;
}

export function titleScreen(app) {
  const el = h('div', { class: 'screen title-card fade-in' },
    h('div', { style: { textAlign: 'center' } },
      logo(),
      h('div', { class: 'press' }, 'PRESS ANY KEY TO CLOCK IN'),
      h('div', { class: 'eyebrow', style: { color: '#f4ebd9', marginTop: '18px' } }, 'A co-op physics comedy for 1–4 workers · keyboard / gamepad')));
  const go = () => { cleanup(); app.audio.init(); app.audio.play('punch'); app.showMenu(); };
  const off = app.input.onPress(() => go());
  el.addEventListener('pointerdown', go);
  const cleanup = () => { off(); };
  return el;
}

export function mainMenu(app) {
  const items = [
    { k: 'start', lbl: 'START SHIFT', sub: 'Solo, couch co-op or host online', act: () => openSheet(app, startSheet(app)) },
    { k: 'join', lbl: 'JOIN FRIENDS', sub: 'Got a room code?', act: () => openSheet(app, joinSheet(app)) },
    { k: 'records', lbl: 'EMPLOYEE RECORDS', sub: 'Your glorious history', act: () => openSheet(app, recordsSheet(app)) },
    { k: 'settings', lbl: 'SETTINGS', sub: 'Volume, graphics, controls', act: () => openSheet(app, settingsSheet(app)) },
    { k: 'quit', lbl: 'QUIT', sub: 'Clock out (if you dare)', act: () => openSheet(app, quitSheet(app)) },
  ];
  let focus = 0;
  const rows = items.map((it, i) => {
    const row = h('button', { class: 'switch-row', onclick: () => pick(i), onmouseenter: () => setFocus(i) },
      h('div', { class: 'toggle' }, h('i', { class: 'knob' }), h('i', { class: 'lamp' })),
      h('div', {}, h('div', { class: 'lbl' }, it.lbl), h('div', { class: 'sub' }, it.sub)));
    return row;
  });
  const setFocus = (i) => {
    if (focus !== i) app.audio.play('ui');
    focus = i;
    rows.forEach((r, j) => r.classList.toggle('focus', j === i));
  };
  const pick = (i) => {
    setFocus(i);
    rows[i].classList.add('on');
    app.audio.play('uiflip');
    setTimeout(() => { rows[i].classList.remove('on'); items[i].act(); }, 260);
  };
  const r = app.records.v;
  const el = h('div', { class: 'screen menu fade-in' },
    h('div', { class: 'left' },
      logo(),
      h('p', { class: 'tagline' }, 'Plant 7 sorts, ships and occasionally launches the world\'s strangest cargo. Run the belts, vent the boiler, catch the gnomes — together. Things will go wrong. That\'s the job.'),
      h('div', { class: 'sign-days' }, h('div', { class: 't' }, 'DAYS WITHOUT AN INCIDENT'), h('div', { class: 'n' }, '0'))),
    h('div', { class: 'panel slide-in-r' },
      plate('',
        h('div', { class: 'head' }, h('span', { class: 'dymo' }, 'SHIFT CONTROL'), h('span', { class: 'lamps' }, h('i', { class: 'on' }), h('i', { class: 'blink' }), h('i', {}))),
        h('div', { class: 'hazard-bar', style: { margin: '0 0 10px' } }),
        ...rows,
        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '12px', gap: '8px', flexWrap: 'wrap' } },
          h('span', { class: 'dymo teal tilt-l' }, `LEDGER ${money(r.total)}`),
          h('span', { class: 'dymo tilt-r' }, `SHIFTS ${r.worked}`)))),
    h('div', { class: 'ticker' }, h('div', { class: 'run' }, 'PLANT 7 BULLETIN ★ REMINDER: THE PNEUMATIC TUBE IS NOT A SLIDE ★ GNOMES ARE FRAGILE, PLEASE STOP THROWING THEM ★ BOILER 7 WILL EXPLODE IF IGNORED ★ THE MAGNET HAS FEELINGS ★ NOBODY ORDERED THE DUCKS ★ BEANS MUST BE TOASTED ★ OVERTIME PAYS ★ CLOCK OUT WHILE YOU STILL CAN ★')));
  setFocus(0);
  const off = app.input.onPress((code) => {
    if (document.querySelector('.modal-back')) return;
    if (code === 'ArrowDown' || code === 'KeyS') setFocus((focus + 1) % items.length);
    else if (code === 'ArrowUp' || code === 'KeyW') setFocus((focus + items.length - 1) % items.length);
    else if (code === 'Enter' || code === 'Space' || code === 'KeyE') pick(focus);
  });
  el.cleanup = off;
  return el;
}

export function openSheet(app, content) {
  closeSheet();
  const back = h('div', { class: 'modal-back fade-in', onclick: (e) => { if (e.target === back) { app.audio.play('ui'); closeSheet(); } } }, content);
  document.getElementById('ui').append(back);
  const off = app.input.onPress((code) => { if (code === 'Escape') { closeSheet(); } });
  back.cleanup = off;
  const first = back.querySelector('input');
  if (first) setTimeout(() => first.focus(), 50);
  return back;
}
export function closeSheet() {
  for (const b of document.querySelectorAll('.modal-back')) { b.cleanup?.(); b.remove(); }
}

function sheetHead(title, sub) {
  return [h('div', { class: 'hazard-bar', style: { marginBottom: '14px' } }), h('h2', {}, title), sub ? h('div', { class: 'eyebrow', style: { marginBottom: '14px' } }, sub) : null];
}

function nameField(app) {
  const inp = h('input', { class: 'input', maxlength: 14, placeholder: 'YOUR NAME', value: app.settings.get('name') || '' });
  inp.addEventListener('input', () => app.settings.set('name', inp.value.trim().slice(0, 14)));
  return h('div', { class: 'field' }, h('label', {}, 'Name on your badge'), inp);
}

export function startSheet(app) {
  const err = h('div', { class: 'eyebrow', style: { color: '#a8231f', minHeight: '16px' } });
  return h('div', { class: 'sheet drop-in' }, plate('',
    ...sheetHead('START A SHIFT', 'Pick how your crew clocks in'),
    nameField(app),
    h('div', { class: 'grid2', style: { marginTop: '16px' } },
      h('button', { class: 'choice', onclick: () => { app.audio.play('uiflip'); closeSheet(); app.startLocal(); } },
        h('div', { class: 'ic' }, '🛋️'), h('div', { class: 't' }, 'SOLO / COUCH'),
        h('div', { class: 'd' }, 'Runs entirely on this computer. Friends join on the same keyboard (WASD + arrows) or with gamepads — press START / ENTER in the break room.')),
      h('button', { class: 'choice', onclick: async () => {
        app.audio.play('uiflip');
        err.textContent = 'Calling the plant server…';
        try { await app.hostOnline(); closeSheet(); } catch (e) { err.textContent = e.message; }
      } },
        h('div', { class: 'ic' }, '📡'), h('div', { class: 't' }, 'HOST ONLINE'),
        h('div', { class: 'd' }, 'Opens a room on the plant server. Share the 4-letter code; up to 4 workers over the network.'))),
    err,
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '8px' } }, h('button', { class: 'btn steel small', onclick: () => closeSheet() }, 'BACK'))));
}

export function joinSheet(app) {
  const code = h('input', { class: 'input code', maxlength: 4, placeholder: 'ABCD' });
  const server = h('input', { class: 'input', placeholder: location.host || 'host:8080', value: app.settings.get('server') || '' });
  const err = h('div', { class: 'eyebrow', style: { color: '#a8231f', minHeight: '16px', marginTop: '8px' } });
  const go = async () => {
    const c = code.value.trim().toUpperCase();
    if (c.length !== 4) { err.textContent = 'Room codes are 4 letters.'; app.audio.play('denied'); return; }
    app.settings.set('server', server.value.trim());
    err.textContent = 'Knocking on the door…';
    try { await app.joinOnline(c, server.value.trim()); closeSheet(); } catch (e) { err.textContent = e.message; app.audio.play('denied'); }
  };
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'sheet drop-in' }, plate('',
    ...sheetHead('JOIN FRIENDS', 'Enter the room code your foreman gave you'),
    h('div', { class: 'field' }, h('label', {}, 'Room code'), code),
    h('div', { style: { height: '12px' } }),
    nameField(app),
    h('details', { style: { marginTop: '12px' } }, h('summary', { class: 'eyebrow', style: { cursor: 'pointer' } }, 'Different plant server?'),
      h('div', { class: 'field', style: { marginTop: '8px' } }, h('label', {}, 'Server address (leave blank for this one)'), server)),
    err,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '10px' } },
      h('button', { class: 'btn steel small', onclick: () => closeSheet() }, 'BACK'),
      h('button', { class: 'btn', onclick: go }, 'CLOCK IN →'))));
}

export function recordsSheet(app) {
  const r = app.records.v;
  const awards = Object.entries(r.awards);
  return h('div', { class: 'sheet drop-in records' }, plate('',
    ...sheetHead('EMPLOYEE RECORDS', 'Personnel file — do not show HR'),
    h('div', { class: 'stat-grid', style: { gridTemplateColumns: 'repeat(3,1fr)' } },
      h('div', { class: 'stat' }, h('b', {}, r.worked), h('span', {}, 'Shifts worked')),
      h('div', { class: 'stat' }, h('b', {}, money(r.total)), h('span', {}, 'Lifetime earnings')),
      h('div', { class: 'stat' }, h('b', {}, money(r.best)), h('span', {}, 'Best shift'))),
    h('h4', { style: { marginTop: '18px' } }, 'Commendations & citations'),
    awards.length ? h('div', { class: 'row' }, awards.map(([t, n]) => h('span', { class: 'dymo yellow' }, `${t} ×${n}`))) : h('p', {}, 'No awards yet. Get out there and break something (on purpose).'),
    h('h4', { style: { marginTop: '18px' } }, 'Recent shifts'),
    r.shifts.length ? r.shifts.map((s) => h('div', { class: 'row-rec' }, h('span', {}, new Date(s.date).toLocaleDateString()), h('span', {}, s.contract), h('span', {}, s.result), h('b', {}, money(s.total)))) : h('p', {}, 'Your file is suspiciously empty.'),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, h('button', { class: 'btn steel small', onclick: () => closeSheet() }, 'CLOSE'))));
}

export function settingsSheet(app) {
  const s = app.settings;
  const fader = (k, label) => {
    const v = h('span', { class: 'v' }, Math.round(s.get(k) * 100));
    const inp = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s.get(k) * 100) });
    inp.addEventListener('input', () => { s.set(k, inp.value / 100); v.textContent = inp.value; app.audio.applyVolumes(); });
    inp.addEventListener('change', () => app.audio.play('button'));
    return h('div', { class: 'fader' }, h('label', { class: 'eyebrow' }, label), inp, v);
  };
  const seg = (k, opts) => {
    const wrap = h('div', { class: 'seg' });
    const draw = () => { wrap.innerHTML = ''; for (const [val, lbl] of opts) wrap.append(h('button', { class: s.get(k) === val ? 'on' : '', onclick: () => { s.set(k, val); app.audio.play('lever'); draw(); app.renderer.applyQuality(); } }, lbl)); };
    draw();
    return wrap;
  };
  const controlsTable = (keys) => h('div', { class: 'ks', style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', alignItems: 'center', fontSize: '13px' } },
    keycap(keys.move), 'Move', keycap(keys.run), 'Run (hold)', keycap(keys.jump), 'Jump / wriggle free',
    keycap(keys.grab), 'Grab · drop · join a carry', keycap(keys.use), 'Use machines (hold for valves & repairs)', keycap(keys.throw), 'Throw · heave together · shove');
  return h('div', { class: 'sheet drop-in' }, plate('',
    ...sheetHead('SETTINGS', 'Maintenance panel'),
    fader('master', 'Master'), fader('music', 'Music'), fader('sfx', 'Effects'),
    h('div', { class: 'row', style: { margin: '14px 0' } }, h('span', { class: 'eyebrow', style: { width: '150px' } }, 'Graphics'), seg('quality', [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']])),
    h('div', { class: 'row', style: { margin: '14px 0' } }, h('span', { class: 'eyebrow', style: { width: '150px' } }, 'Camera shake'), seg('shake', [[true, 'ON'], [false, 'OFF']])),
    h('h4', { style: { marginTop: '18px' } }, 'Controls'),
    h('div', { class: 'grid2' },
      h('div', {}, h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, SCHEMES.wasd.label), controlsTable(SCHEMES.wasd.keys)),
      h('div', {}, h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, 'GAMEPAD'), controlsTable(PAD_KEYS))),
    h('p', { style: { fontSize: '12px', opacity: 0.75 } }, `Couch player 2 on the same keyboard: ${Object.values(SCHEMES.arrows.keys).join(' · ')}`),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '10px' } }, h('button', { class: 'btn small', onclick: () => closeSheet() }, 'DONE'))));
}

export function quitSheet(app) {
  return h('div', { class: 'sheet drop-in' }, plate('yellow',
    ...sheetHead('CLOCK OUT?', 'Form 99-B: Voluntary Departure'),
    h('p', {}, 'Are you sure? The boiler will miss you. The gnomes will not.'),
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '14px' } },
      h('button', { class: 'btn steel', onclick: () => closeSheet() }, 'KEEP WORKING'),
      h('button', { class: 'btn red', onclick: () => { closeSheet(); app.quit(); } }, 'GO HOME'))));
}

export function lockerSheet(app, pid) {
  const outfit = { ...(app.settings.get('outfit') || {}) };
  const mirror = h('div', { class: 'mirror' });
  const img = h('img', { alt: 'Your worker' });
  mirror.append(img);
  const refresh = () => {
    img.src = app.renderer.portrait(outfit, 0);
    app.settings.set('outfit', { ...outfit });
    if (app.session && pid) app.session.send({ t: 'outfit', p: pid, o: outfit });
  };
  const swatches = h('div', { class: 'swatches' });
  const hats = h('div', { class: 'opt-row' });
  const faces = h('div', { class: 'opt-row' });
  const draw = () => {
    swatches.innerHTML = ''; hats.innerHTML = ''; faces.innerHTML = '';
    for (const c of OUTFIT_COLORS) swatches.append(h('button', { class: `swatch${outfit.color === c ? ' on' : ''}`, style: { background: c }, onclick: () => { outfit.color = c; app.audio.play('locker'); draw(); refresh(); } }));
    for (const ht of HATS) hats.append(h('button', { class: `opt${outfit.hat === ht ? ' on' : ''}`, onclick: () => { outfit.hat = ht; app.audio.play('locker'); draw(); refresh(); } }, ht === 'none' ? 'BARE' : ht));
    for (const f of FACES) faces.append(h('button', { class: `opt${outfit.face === f ? ' on' : ''}`, onclick: () => { outfit.face = f; app.audio.play('locker'); draw(); refresh(); } }, f));
  };
  draw();
  refresh();
  const name = h('input', { class: 'input', maxlength: 14, value: app.settings.get('name') || '', placeholder: 'NAME' });
  name.addEventListener('change', () => { app.settings.set('name', name.value.trim()); if (app.session && pid) app.session.send({ t: 'name', p: pid, n: name.value.trim() }); });
  return h('div', { class: 'sheet drop-in', style: { width: 'min(800px, 94vw)' } }, plate('',
    ...sheetHead('LOCKER ROOM', 'Choose your worker'),
    h('div', { class: 'locker' },
      mirror,
      h('div', {},
        h('div', { class: 'field' }, h('label', {}, 'Badge name'), name),
        h('h4', { style: { marginTop: '14px' } }, 'Overalls'), swatches,
        h('h4', { style: { marginTop: '14px' } }, 'Headwear'), hats,
        h('h4', { style: { marginTop: '14px' } }, 'Face'), faces,
        h('p', { style: { fontSize: '12px', opacity: 0.75 } }, 'Tip: the lockers in the break room work too — walk up and press USE.'))),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => closeSheet() }, 'LOOKING GOOD'))));
}
