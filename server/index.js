// SHIFT HAPPENS dedicated server.
// Serves the built client (dist/) and hosts authoritative rooms over WebSocket.
//   PORT=8080 node server/index.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../shared/room.js';
import { SNAPSHOT_RATE } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const PORT = +(process.env.PORT || 8080);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.room.playerCount, 0) }));
    return;
  }
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(DIST, p);
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Client not built. Run `npm run build` first (or `npm start`).');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'max-age=3600' });
  fs.createReadStream(file).pipe(res);
});

const rooms = new Map(); // code -> { room, sockets: Map<clientId, ws> }
let clientSeq = 1;

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}

function createRoom() {
  const code = makeCode();
  const entry = { sockets: new Map() };
  entry.room = new Room({
    code, snapshotRate: SNAPSHOT_RATE,
    send: (cid, msg) => {
      const ws = entry.sockets.get(cid);
      if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    },
  });
  rooms.set(code, entry);
  console.log(`[room ${code}] opened`);
  return entry;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  const cid = 'c' + clientSeq++;
  let entry = null;
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!entry) {
      if (msg.t === 'create') entry = createRoom();
      else if (msg.t === 'join') {
        entry = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!entry) { ws.send(JSON.stringify({ t: 'error', msg: `No shift running with code "${msg.code}".` })); return; }
      } else return;
      entry.sockets.set(cid, ws);
      const r = entry.room.join(cid, { name: String(msg.name || '').slice(0, 14), outfit: msg.outfit, token: msg.token });
      if (!r.ok) { entry.sockets.delete(cid); entry = null; return; }
      console.log(`[room ${entry.room.code}] ${cid} joined (${entry.room.playerCount} workers)`);
      return;
    }
    entry.room.message(cid, msg);
  });
  ws.on('close', () => {
    if (!entry) return;
    entry.room.leave(cid);
    entry.sockets.delete(cid);
    console.log(`[room ${entry.room.code}] ${cid} left`);
  });
});

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  for (const [code, e] of rooms) {
    try { e.room.update(dt); } catch (err) { console.error(`[room ${code}] tick error`, err); }
    if (e.room.emptyT > 120 && e.room.playerCount === 0) { rooms.delete(code); console.log(`[room ${code}] closed`); }
    else if (e.room.emptyT > 300) { rooms.delete(code); console.log(`[room ${code}] closed (abandoned)`); }
  }
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`\n  SHIFT HAPPENS plant server on http://localhost:${PORT}`);
  console.log(`  Friends on your network: http://<your-ip>:${PORT}\n`);
});
