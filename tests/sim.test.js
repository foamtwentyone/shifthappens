import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../shared/room.js';
import { PADS, SPOTS } from '../shared/level.js';

function makeRoom() {
  const out = [];
  const room = new Room({ code: 'TEST', seed: 1234, encode: false, send: (cid, m) => out.push([cid, m]) });
  return { room, out };
}
const run = (room, secs) => { for (let i = 0; i < secs * 60; i++) room.update(1 / 60); };

function startShift(room) {
  for (const p of room.sim.players.values()) p.ready = true;
  run(room, 5);
  assert.equal(room.sim.game.phase, 'shift');
}

test('players join, punch in and a shift starts', () => {
  const { room, out } = makeRoom();
  room.join('c1', { name: 'Ada' });
  room.join('c2', { name: 'Bob' });
  assert.equal(room.sim.players.size, 2);
  run(room, 1);
  assert.ok(out.some(([, m]) => m.t === 'snap'));
  startShift(room);
  assert.ok(room.sim.game.order.length > 0);
  assert.ok(room.sim.game.timeLeft > 100);
});

test('player moves with input and lands on the floor', () => {
  const { room } = makeRoom();
  const { pid } = room.join('c1', { name: 'Ada' });
  const p = room.sim.players.get(pid);
  run(room, 1);
  assert.ok(Math.abs(p.body.position.y - 0.42) < 0.08, `y=${p.body.position.y}`);
  const x0 = p.body.position.x;
  room.message('c1', { t: 'in', p: pid, i: { mx: 1, mz: 0, b: 0, c: [0, 0, 0, 0] } });
  run(room, 1);
  assert.ok(p.body.position.x - x0 > 3, `moved ${p.body.position.x - x0}`);
});

test('dispenser feeds belt A and cargo travels along it', () => {
  const { room } = makeRoom();
  room.join('c1', { name: 'Ada' });
  startShift(room);
  const sim = room.sim;
  sim.plant.spawnFromDispenser('crate');
  run(room, 2);
  const c = [...sim.cargo.values()].find((x) => x.type === 'crate');
  const x0 = c.body.position.x;
  run(room, 2);
  assert.ok(c.body.position.x - x0 > 2.5, `crate moved ${c.body.position.x - x0}`);
});

test('correct delivery pays, wrong bay rejects with a penalty', () => {
  const { room } = makeRoom();
  room.join('c1', { name: 'Ada' });
  startShift(room);
  const sim = room.sim;
  const g = sim.game;
  const crate = sim.spawnCargo('crate', [PADS.A.x, 1, PADS.A.z]);
  run(room, 2.5);
  assert.ok(!sim.cargo.has(crate.id), 'crate shipped');
  assert.ok(g.money > 0, `money ${g.money}`);
  const m = g.money;
  const gnome = sim.spawnCargo('gnome', [PADS.A.x, 0.6, PADS.A.z]);
  run(room, 1.0);
  assert.ok(sim.cargo.has(gnome.id), 'gnome rejected, still exists');
  assert.ok(g.money < m, 'misdelivery penalty');
});

test('grabbing, carrying and two-person carrying a crate', () => {
  const { room } = makeRoom();
  const a = room.join('c1', { name: 'Ada' }).pid;
  const b = room.join('c2', { name: 'Bob' }).pid;
  const sim = room.sim;
  run(room, 0.5);
  const pa = sim.players.get(a), pb = sim.players.get(b);
  pa.body.position.set(-40, 0.45, 0); pa.yaw = Math.PI / 2;
  pb.body.position.set(-37.8, 0.45, 0); pb.yaw = -Math.PI / 2;
  const crate = sim.spawnCargo('crate', [-38.9, 0.6, 0]);
  run(room, 0.5);
  room.message('c1', { t: 'in', p: a, i: { mx: 0, mz: 0, b: 0, c: [0, 1, 0, 0] } });
  run(room, 0.1);
  assert.equal(pa.holding?.id, crate.id, 'A holds crate');
  room.message('c2', { t: 'in', p: b, i: { mx: 0, mz: 0, b: 0, c: [0, 1, 0, 0] } });
  run(room, 0.5);
  assert.equal(crate.holders.size, 2);
  assert.ok(crate.body.position.y > 0.9, `lifted y=${crate.body.position.y}`);
  // heave together
  room.message('c1', { t: 'in', p: a, i: { mx: 0, mz: 0, b: 0, c: [0, 1, 0, 1] } });
  run(room, 0.05);
  assert.equal(crate.holders.size, 0);
});

test('pressure rises, valve vents, burst causes blackout', () => {
  const { room } = makeRoom();
  const pid = room.join('c1', { name: 'Ada' }).pid;
  startShift(room);
  const sim = room.sim;
  sim.game.shiftT = 60;
  const p0 = sim.plant.pressure;
  run(room, 2);
  assert.ok(sim.plant.pressure > p0, 'pressure builds');
  // venting at the valve brings it down
  const pv = sim.players.get(pid);
  const v = SPOTS.valve;
  pv.body.position.set(v[0], 0.45, v[2] + 1.0); pv.yaw = Math.PI;
  sim.plant.pressure = 80;
  room.message('c1', { t: 'in', p: pid, i: { mx: 0, mz: 0, b: 8, c: [0, 0, 1, 0] } });
  run(room, 2);
  assert.ok(sim.plant.pressure < 70, `vented to ${sim.plant.pressure}`);
  room.message('c1', { t: 'in', p: pid, i: { mx: 0, mz: 0, b: 0, c: [0, 0, 1, 0] } });
  sim.plant.pressure = 99.5;
  run(room, 1);
  assert.equal(sim.plant.main, false, 'blackout after burst');
  assert.ok(sim.plant.incidents.some((i) => i.kind === 'blackout'));
  // fix: walk to main breaker & hold use
  const p = sim.players.get(pid);
  const at = SPOTS.brk_main;
  p.body.position.set(at[0], 0.45, at[2] + 1.0); p.body.velocity.set(0, 0, 0); p.yaw = Math.PI; p.state = 0; p.downT = 0;
  room.message('c1', { t: 'in', p: pid, i: { mx: 0, mz: 0, b: 8, c: [0, 0, 1, 0] } });
  run(room, 6);
  assert.equal(sim.plant.main, true, 'main breaker reset');
});

test('full shift ends with a report and returns to the lobby', () => {
  const { room, out } = makeRoom();
  room.join('c1', { name: 'Ada' });
  startShift(room);
  room.sim.game.timeLeft = 2;
  run(room, 8);
  assert.equal(room.sim.game.phase, 'lobby');
  const rep = out.flatMap(([, m]) => (m.ev || [])).find((e) => e.type === 'report');
  assert.ok(rep, 'report event');
  assert.equal(rep.report.result, 'QUOTA MISSED');
  assert.ok(rep.report.players.length === 1);
});

test('long chaotic shift with random incidents does not crash', () => {
  const { room } = makeRoom();
  const ids = [room.join('c1', {}).pid, room.join('c2', {}).pid, room.join('c3', {}).pid];
  startShift(room);
  const sim = room.sim;
  sim.plant.dispenser.auto = true;
  sim.game.riders.cranky = true;
  let t = 0;
  for (let s = 0; s < 150; s++) {
    for (const [k, id] of ids.entries()) {
      t++;
      room.message('c' + (k + 1), { t: 'in', p: id, i: { mx: Math.sin(s + k), mz: Math.cos(s * 1.3 + k), b: s % 3 === 0 ? 9 : 1, c: [t % 4, t % 5, t % 7, t % 9] } });
    }
    run(room, 1);
  }
  for (const inc of ['jam', 'reverse', 'sorter', 'breach', 'flip', 'ducks', 'surge']) sim.plant.start(inc, inc === 'jam' || inc === 'reverse' ? 'A' : undefined);
  sim.plant.start('flux', 'sorting');
  sim.plant.start('overheat', 'tube');
  run(room, 20);
  assert.ok(sim.game.incidentsCount > 3, `incidents ${sim.game.incidentsCount}`);
});

test('pneumatic tube carries cargo to the sky dock', () => {
  const { room } = makeRoom();
  room.join('c1', {});
  startShift(room);
  const sim = room.sim;
  const c = sim.spawnCargo('balloon', [-5, 1.6, -7.25]);
  run(room, 0.2);
  assert.ok(c.tube, 'entered tube');
  run(room, 3.5);
  assert.ok(!c.tube);
  assert.ok(c.body.position.x > 19 && c.body.position.y > 2.6, `landed ${c.body.position.x},${c.body.position.y}`);
});

test('disconnect keeps the worker for a grace period, reconnect restores it', () => {
  const { room, out } = makeRoom();
  room.join('c1', { name: 'Ada' });
  const tok = out.find(([, m]) => m.t === 'welcome')[1].token;
  room.leave('c1');
  run(room, 2);
  assert.equal(room.sim.players.size, 1);
  room.join('c9', { token: tok });
  assert.equal([...room.sim.players.values()][0].connected, true);
  room.leave('c9');
  run(room, 31);
  assert.equal(room.sim.players.size, 0);
});

test('lift carries a worker up to the sky dock', () => {
  const { room } = makeRoom();
  const pid = room.join('c1', {}).pid;
  startShift(room);
  const sim = room.sim;
  const p = sim.players.get(pid);
  p.body.position.set(17.5, 0.6, -8); p.body.velocity.set(0, 0, 0);
  run(room, 0.5);
  sim.plant.toggleLift();
  run(room, 3);
  assert.ok(p.body.position.y > 3.0, `worker on lift at y=${p.body.position.y}`);
});

test('updraft fan floats helium parcels onto the sky dock', () => {
  const { room } = makeRoom();
  room.join('c1', {});
  startShift(room);
  const sim = room.sim;
  const c = sim.spawnCargo('balloon', [24.6, 0.8, -3.4]);
  run(room, 6);
  const p = c.body.position;
  assert.ok(!sim.cargo.has(c.id) || (p.y > 2.7 && p.z < -5), `balloon at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
});

test('magnet hoists cores up and drops them on the sky dock', () => {
  const { room } = makeRoom();
  room.join('c1', {});
  startShift(room);
  const sim = room.sim;
  const c = sim.spawnCargo('magnet', [26, 0.5, -2.5]);
  sim.plant.magnet.on = true;
  run(room, 4);
  assert.ok(c.body.position.y > 3.2, `core pulled up to y=${c.body.position.y.toFixed(2)}`);
  sim.plant.magnet.on = false;
  run(room, 3);
  assert.ok(!sim.cargo.has(c.id) || c.body.position.y > 2.7, 'core landed on the sky dock (or shipped)');
});

test('online friends with the same saved outfit get distinct colours', () => {
  const { room } = makeRoom();
  const o = { color: '#ff7a2f', hat: 'hardhat', face: 'happy' };
  room.join('a', { outfit: { ...o } });
  room.join('b', { outfit: { ...o } });
  const [p1, p2] = [...room.sim.players.values()];
  assert.notEqual(p1.outfit.color, p2.outfit.color);
});
