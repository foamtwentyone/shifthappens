// PLANT 7 — the one (very unstable) production site of the demo.
// Pure data: consumed by the simulation (colliders, machine placement)
// and by the renderer (walls, floors, decoration).
//
//  z- (north)
//                 ┌──────── CONTROL ROOM ────────┐
//  ┌── BREAK ──┬─── INTAKE ───┬──── SORTING ────┬AIR┬────── DOCK ───────┐
//  │   ROOM    │  dispenser → │ scan → sorter → │LCK│ → bays, sky dock  │
//  └───────────┴──────────────┴─────────────────┴───┴───────────────────┘
//  z+ (south, camera side)

export const BOUNDS = { minX: -46, maxX: 30, minZ: -22, maxZ: 10 };

export const ZONES = [
  { id: 'lobby', name: 'BREAK ROOM', x0: -46, x1: -32, z0: -10, z1: 10, floor: '#cdb79e' },
  { id: 'intake', name: 'INTAKE BAY', x0: -32, x1: -14, z0: -10, z1: 10, floor: '#b9c4c6' },
  { id: 'sorting', name: 'SORTING HALL', x0: -14, x1: 4, z0: -10, z1: 10, floor: '#c3c9bd' },
  { id: 'control', name: 'CONTROL ROOM', x0: -14, x1: 4, z0: -22, z1: -10, floor: '#a9b6c2' },
  { id: 'airlock', name: 'AIRLOCK', x0: 4, x1: 10, z0: -3, z1: 3, floor: '#9aa3a8' },
  { id: 'dock', name: 'SHIPPING DOCK', x0: 10, x1: 30, z0: -10, z1: 10, floor: '#c9c1ad' },
];

export function zoneAt(x, z) {
  for (const zn of ZONES) if (x >= zn.x0 && x < zn.x1 && z >= zn.z0 && z < zn.z1) return zn.id;
  return 'outside';
}

// Walls: center x/z, size w (x) d (z), collider height h, visual height vh.
// South-facing geometry is kept low visually so the camera can look into rooms,
// but keeps a tall invisible collider so nobody jumps out of the plant.
const W = 0.5;
function wx(x0, x1, z, h, vh, style = 'wall') {
  return { x: (x0 + x1) / 2, z, w: x1 - x0, d: W, h, vh: vh ?? h, style };
}
function wz(z0, z1, x, h, vh, style = 'wall') {
  return { x, z: (z0 + z1) / 2, w: W, d: z1 - z0, h, vh: vh ?? h, style };
}
function block(x0, x1, z0, z1, h, vh, style = 'block') {
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h, vh: vh ?? h, style };
}

export const WALLS = [
  // outer north
  wx(-46, -14, -10, 3.6),
  wx(-14, -12, -10, 3.6),
  wx(-9, 4, -10, 3.6),
  wx(4, 30, -10, 4.2),
  // control room shell
  wz(-22, -10, -14, 3.6),
  wz(-22, -10, 4, 3.6),
  wx(-14, 4, -22, 3.6),
  // outer south (low visual, tall collider)
  wx(-46, 30, 10, 6, 0.9, 'rail'),
  // outer west / east
  wz(-10, 10, -46, 3.6),
  wz(-10, 10, 30, 4.2),
  // break room | intake (door z -2..2)
  wz(-10, -2, -32, 3.2),
  wz(2, 10, -32, 6, 1.4),
  // intake | sorting (opening z -3..3)
  wz(-10, -3, -14, 3.2),
  wz(3, 10, -14, 6, 1.4),
  // airlock shell blocks
  block(4, 10, -10, -3, 3.6),
  block(4, 10, 3, 10, 6, 1.3, 'block'),
];

// The raised sky dock in the shipping area.
export const SKY_DOCK = { x0: 19, x1: 30, z0: -10, z1: -5, top: 2.8 };

// Conveyors. Direction is the "forward" belt direction.
export const CONVEYORS = [
  { id: 'A', name: 'BELT A', x0: -27.5, x1: -5.9, z0: -0.75, z1: 0.75, dir: [1, 0], zone: 'intake', top: 0.7 },
  { id: 'B', name: 'BELT B', x0: -4.1, x1: 16, z0: -0.75, z1: 0.75, dir: [1, 0], zone: 'dock', top: 0.7 },
  { id: 'C', name: 'BELT C', x0: -5.75, x1: -4.25, z0: -6.4, z1: -0.9, dir: [0, -1], zone: 'sorting', top: 0.7 },
];

export const SORTER = { x: -5, z: 0, size: 1.8, top: 0.7 };
export const SCANNER = { x: -9.5, z: 0 };
export const DISPENSER = { x: -26.4, z: 0, y: 4.6 };
export const TUBE = {
  // pneumatic tube from the sorting hall hopper to the sky dock
  path: [
    [-5, 1.3, -7.3],
    [-5, 5.4, -7.3],
    [21.4, 5.4, -7.3],
    [21.4, 3.7, -7.3],
  ],
  mouth: [-5, 1.0, -7.25],
  mouthR: 0.85,
};
export const LIFT = { x0: 16, x1: 19, z0: -9.6, z1: -6.4, low: 0, high: 2.8 };
export const FAN = { x: 24.6, z: -3.4, r: 1.15 };
export const MAGNET = { x: 26.2, y: 4.8, z: -7.1, r: 8 };
export const HEATPAD = { x: -10.5, z: 5.2, r: 1.0 };
export const INCINERATOR = { x: -20, z: -8.6, r: 1.1 };
export const BOILER = { x: 0, z: -18.2 };
export const DOORS = {
  lobby: { x: -32, z0: -2, z1: 2, h: 3.0 },
  inner: { x: 4, z0: -3, z1: 3, h: 3.2 },
  outer: { x: 10, z0: -3, z1: 3, h: 3.2 },
};

export const PADS = {
  A: { x: 22, z: 5.4, size: 3 },
  B: { x: 22, z: 1.4, size: 3 },
  C: { x: 26, z: -7.5, size: 2.6, y: SKY_DOCK.top },
};

// Every place a player can press / pull / hold something.
// `at` is the world position of the control (used for reach + prompt placement).
export const SPOTS = {
  // ── break room ──
  contract0: [-42.5, 1.5, -9.4],
  contract1: [-39.5, 1.5, -9.4],
  contract2: [-36.5, 1.5, -9.4],
  rider_rush: [-45.4, 1.3, -6.5],
  rider_careful: [-45.4, 1.3, -4.5],
  rider_dark: [-45.4, 1.3, -2.5],
  rider_cranky: [-45.4, 1.3, -0.5],
  locker_color: [-45.4, 1.3, 3.0],
  locker_hat: [-45.4, 1.3, 5.0],
  locker_face: [-45.4, 1.3, 7.0],
  punch: [-33.4, 1.2, -4.6],
  vending: [-44.2, 1.2, -8.4],
  // ── intake ──
  disp_request: [-25.2, 1.2, 2.4],
  disp_auto: [-27.4, 1.2, 2.4],
  belt_a_lever: [-17.5, 1.1, 2.2],
  estop_intake: [-23.5, 1.2, -9.3],
  incinerator: [-20, 1.0, -8.0],
  // ── sorting ──
  sorter_lever: [-7.2, 1.1, 2.4],
  sorter_body: [-5, 1.0, 1.3],
  belt_b_lever: [-1.5, 1.1, 2.2],
  estop_sorting: [0.5, 1.2, 7.8],
  heat_lamp: [-10.5, 1.1, 6.8],
  air_in: [2.6, 1.2, -3.6],
  // ── control room ──
  brk_intake: [-11.5, 1.4, -21.4],
  brk_sorting: [-9.7, 1.4, -21.4],
  brk_dock: [-7.9, 1.4, -21.4],
  brk_main: [-5.6, 1.4, -21.4],
  valve: [-2.8, 1.1, -16.2],
  // ── dock ──
  air_out: [11.6, 1.2, 4.0],
  lift_btn: [17.5, 1.1, -6.2],
  fan_switch: [22.4, 1.1, -3.3],
  magnet_lever: [27.6, 1.1, -3.1],
  estop_dock: [13.5, 1.2, 7.6],
  hotline_out: [16.2, 1.2, 8.8],
  hotline_ot: [18.4, 1.2, 8.8],
};

export const SPAWNS = [
  [-40, 1, 0], [-38, 1, 1.5], [-40, 1, 3], [-38, 1, -1.5],
];

export const LOBBY_BALL = [-36, 2, 3];
