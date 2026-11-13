// End-of-shift factory report (Form 7B).
import { h, money, clock } from './dom.js';
import { ICON } from './hud.js';
import { CARGO } from '../../shared/constants.js';

const RESULT_STYLE = {
  'QUOTA MET': ['green', 'APPROVED'], 'OVERTIME HERO': ['green', 'OVERTIME HERO'],
  'QUOTA MISSED': ['', 'QUOTA MISSED'], 'OVERTIME BUST': ['', 'OVERTIME BUST'],
};

export function showReport(app, rep, onClose) {
  const [stampCls, stampText] = RESULT_STYLE[rep.result] || ['blue', rep.result];
  const mine = app.session?.localIds() || [];
  const players = rep.players;
  const statCols = [
    ['Delivered', (s) => s.delivered], ['Earned', (s) => money(s.earned)], ['Broken', (s) => s.broken], ['Faceplants', (s) => s.knockdowns],
    ['Fixes', (s) => s.fixes], ['Belt rides', (s) => `${Math.round(s.beltTime)}s`], ['Tube rides', (s) => s.tubeRides], ['Yeets', (s) => s.thrownMates], ['Walked', (s) => `${Math.round(s.distance)}m`],
  ];
  const close = () => { off(); wrap.remove(); onClose?.(); };
  const wrap = h('div', { class: 'report-wrap fade-in' },
    h('div', { class: 'report drop-in' },
      h('div', { class: 'clipboard' },
        h('div', { class: 'paper', style: { position: 'relative' } },
          h('div', { class: 'formhead' },
            h('div', {},
              h('div', { class: 'eyebrow' }, 'PLANT 7 · END OF SHIFT'),
              h('h1', {}, 'SHIFT REPORT'),
              h('div', { style: { marginTop: '6px', fontWeight: 600 } }, `${rep.contract} — for ${rep.client}`)),
            h('div', { class: 'formno' }, 'FORM 7B / REV. 13', h('br'), `DURATION ${clock(rep.duration)}`, h('br'), `CREW ${players.length}`, h('br'), rep.overtime ? `OVERTIME ×${rep.overtime}` : 'NO OVERTIME')),
          h('div', { class: `stamp stamp-in result-stamp ${stampCls}` }, stampText),
          h('div', { class: 'cols' },
            h('div', {},
              h('h4', {}, 'Earnings ledger'),
              ...(rep.lines.length ? rep.lines.map((l) => h('div', { class: 'ledger-line' }, h('span', {}, `${l.label}${l.n > 1 ? ` ×${l.n}` : ''}`), h('span', { class: l.amount < 0 ? 'neg' : '' }, money(l.amount)))) : [h('div', { class: 'ledger-line' }, h('span', {}, 'Nothing. Absolutely nothing.'), h('span', {}, '$0'))]),
              h('div', { class: `ledger-total${rep.total < 0 ? ' neg' : ''}` }, h('span', {}, 'TOTAL'), h('span', {}, money(rep.total))),
              h('div', { class: 'eyebrow', style: { marginTop: '6px' } }, `Pay multiplier ×${rep.mult.toFixed(2)}${rep.riders.length ? ' · riders: ' + rep.riders.join(', ') : ''} · company ledger now ${money(rep.ledgerAfter)}`)),
            h('div', {},
              h('h4', {}, 'Floor statistics'),
              h('div', { class: 'stat-grid' },
                h('div', { class: 'stat' }, h('b', {}, rep.delivered), h('span', {}, 'Shipped')),
                h('div', { class: 'stat' }, h('b', {}, rep.broken), h('span', {}, 'Broken')),
                h('div', { class: 'stat' }, h('b', {}, rep.misdelivered), h('span', {}, 'Misrouted')),
                h('div', { class: 'stat' }, h('b', {}, rep.incidents), h('span', {}, 'Incidents'))),
              h('div', { style: { marginTop: '10px', fontSize: '13px', lineHeight: 1.6 } },
                rep.incidentKinds.length ? rep.incidentKinds.map((k) => h('span', { class: 'dymo', style: { marginRight: '6px', display: 'inline-block', marginBottom: '4px' } }, `${k.name} ×${k.n}`)) : 'A suspiciously calm shift.'),
              h('h4', { style: { marginTop: '12px' } }, 'Order'),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, rep.order.map((l) => h('span', { class: 'dymo ' + (l.done >= l.need ? 'teal' : 'red') }, `${ICON[l.type] || ''} ${CARGO[l.type].short} ${l.done}/${l.need}`))))),
          h('h4', { style: { marginTop: '18px' } }, 'Personnel'),
          h('table', { class: 'ptable' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Worker'), ...statCols.map(([n]) => h('th', {}, n)))),
            h('tbody', {}, players.map((p) => h('tr', {}, h('td', {}, h('span', { class: 'dot', style: { background: p.outfit.color } }), p.name, mine.includes(p.id) ? ' (you)' : ''), ...statCols.map(([, f]) => h('td', {}, f(p.stats))))))),
          h('h4', { style: { marginTop: '18px' } }, 'Commendations'),
          h('div', { class: 'awards' }, rep.awards.length ? rep.awards.map((a, i) => h('div', { class: 'award', style: { animationDelay: `${0.3 + i * 0.15}s` } },
            h('span', { class: 'ribbon' }),
            h('img', { src: app.renderer.portrait(a.outfit, players.findIndex((p) => p.id === a.pid)) }),
            h('div', {}, h('div', { class: 't' }, a.title), h('div', { class: 'n' }, a.name), h('div', { class: 'd' }, a.desc)))) : h('p', {}, 'Nobody did anything noteworthy. Impressive, in a way.')),
          h('div', { class: 'actions' },
            h('div', {}, h('span', { class: 'eyebrow' }, 'Foreman signature  '), h('span', { class: 'sig' }, 'B. Grumble')),
            h('button', { class: 'btn', onclick: () => { app.audio.play('paper'); close(); } }, 'BACK TO THE BREAK ROOM →'))))));
  document.getElementById('ui').append(wrap);
  let armed = false;
  setTimeout(() => (armed = true), 1500);
  const off = app.input.onPress((code) => { if (armed && (code === 'Enter' || code === 'Escape')) close(); });
  return wrap;
}
