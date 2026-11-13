export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function plate(cls, ...children) {
  return h('div', { class: `plate ${cls || ''}` }, h('span', { class: 'rivets' }), ...children);
}

export function money(n) {
  const s = Math.abs(Math.round(n)).toLocaleString('en-US');
  return (n < 0 ? '-$' : '$') + s;
}

export function clock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function toast(text, ms = 3200) {
  const el = h('div', { class: 'toast' }, text);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 450);
}

export function keycap(k) {
  const pad = { A: 'a', B: 'b', X: 'x', Y: 'y' }[k];
  return h('span', { class: `key${pad ? ' pad ' + pad : ''}` }, k);
}
