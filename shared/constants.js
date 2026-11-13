// SHIFT HAPPENS — shared tuning constants.
// Everything here is used by BOTH the authoritative simulation (server / local host)
// and the client renderer, so keep it plain data.

export const TICK_RATE = 60;            // physics + game logic steps per second
export const SNAPSHOT_RATE = 20;        // network snapshots per second (online)
export const LOCAL_SNAPSHOT_RATE = 30;  // snapshots when hosting in-browser
export const MAX_PLAYERS = 4;
export const GRAVITY = 18;              // a bit floaty-snappy, cartoon gravity

// Physics collision groups
export const G_STATIC = 1;
export const G_PLAYER = 2;
export const G_CARGO = 4;
export const G_DOOR = 8;
export const G_HELD = 16;

export const PLAYER = {
  radius: 0.42,
  walk: 4.3,
  run: 6.8,
  accel: 26,
  airAccel: 9,
  jump: 7.2,
  reach: 1.55,        // grab / use distance
  throwSpeed: 11,
  shoveImpulse: 6,
  ragdollHit: 6.2,    // relative speed at which a flying object knocks you down
};

// Bays: where cargo has to end up.
export const BAYS = {
  A: { id: 'A', name: 'BAY A', color: '#e8423f', note: 'Heavy goods' },
  B: { id: 'B', name: 'BAY B', color: '#3b82d6', note: 'Delicate & hot' },
  C: { id: 'C', name: 'SKY DOCK', color: '#ffc93c', note: 'Up top' },
};

// Cargo catalogue — every type has a clear physical personality.
export const CARGO = {
  crate: {
    name: 'Steel Crate', short: 'CRATE', bay: 'A', pay: 60, mass: 60,
    shape: 'box', size: [1.05, 1.05, 1.05],
    carry: [0.38, 0.9, 1.0], // speed multiplier with 1, 2, 3+ carriers
    desc: 'Heavy. Two people carry it properly. One person drags it.',
  },
  wobble: {
    name: 'Wobble Drum', short: 'WOBBLE', bay: 'A', pay: 75, mass: 22,
    shape: 'cyl', size: [0.45, 1.0],
    carry: [0.7, 0.95, 1.0],
    desc: 'Liquid sloshes around inside. It yanks whoever carries it.',
  },
  gnome: {
    name: 'Porcelain Gnome', short: 'GNOME', bay: 'B', pay: 85, mass: 4,
    shape: 'box', size: [0.5, 0.85, 0.5],
    carry: [1.0, 1.0, 1.0], fragile: 7.0, breakPenalty: 60,
    desc: 'Fragile. Hard knocks, long drops and fast tubes break it.',
  },
  beans: {
    name: 'Thermo Beans', short: 'BEANS', bay: 'B', pay: 95, mass: 9,
    shape: 'cyl', size: [0.36, 0.75],
    carry: [0.95, 1.0, 1.0], needsHeat: true,
    desc: 'Must be toasted under the heat lamp. Hot beans jump around.',
  },
  balloon: {
    name: 'Helium Parcel', short: 'HELIUM', bay: 'C', pay: 55, mass: 1.5,
    shape: 'box', size: [0.75, 0.75, 0.75], gravityScale: 0.12,
    carry: [1.0, 1.0, 1.0],
    desc: 'Barely falls. Fans and wind send it flying.',
  },
  magnet: {
    name: 'Magnetic Core', short: 'CORE', bay: 'C', pay: 75, mass: 16,
    shape: 'sphere', size: [0.4],
    carry: [0.8, 0.95, 1.0], magnetic: true,
    desc: 'Pulled by the magnet, by other cores and by steel crates.',
  },
  mystery: {
    name: 'Mystery Box', short: 'MYSTERY', bay: '?', pay: 110, mass: 18,
    shape: 'box', size: [0.85, 0.85, 0.85],
    carry: [0.85, 1.0, 1.0],
    desc: 'Nobody knows where it goes until the scanner reads it.',
  },
  duck: {
    name: 'Rubber Duck', short: 'DUCK', bay: 'X', pay: 0, mass: 0.8,
    shape: 'sphere', size: [0.28],
    carry: [1.0, 1.0, 1.0], junk: true,
    desc: 'Junk. Clogs belts. Burn it in the incinerator.',
  },
  ball: {
    name: 'Break-room Ball', short: 'BALL', bay: 'X', pay: 0, mass: 0.6,
    shape: 'sphere', size: [0.25], toy: true,
    carry: [1.0, 1.0, 1.0],
  },
  soda: {
    name: 'Fizz Soda', short: 'SODA', bay: 'X', pay: 0, mass: 0.4,
    shape: 'cyl', size: [0.12, 0.3], toy: true,
    carry: [1.0, 1.0, 1.0],
  },
};

export const ORDERABLE = ['crate', 'wobble', 'gnome', 'beans', 'balloon', 'magnet', 'mystery'];

// Character customisation
export const OUTFIT_COLORS = ['#ff7a2f', '#1fb5a8', '#8b5cf6', '#7ac943', '#ff5d8f', '#ffc93c', '#3b82d6', '#e8423f'];
export const HATS = ['none', 'hardhat', 'cap', 'cone'];
// Kenney Mini Characters (CC0) — the "model" part of an outfit
export const MODELS = ['worker', 'male-a', 'female-a', 'male-b', 'female-b', 'male-c', 'female-c', 'male-d', 'female-d', 'male-e',
  'female-e', 'male-f', 'female-f', 'male-g', 'robot', 'alien', 'soldier', 'knight', 'raider', 'zombie'];

// Risk riders — signed at the board in the break room.
export const RIDERS = {
  rush: { name: 'RUSH JOB', desc: '-30% shift time', mult: 0.5 },
  careful: { name: 'NO SCRATCHES', desc: '+$300 if nothing breaks, -$40 extra per break', mult: 0 },
  dark: { name: 'LIGHTS OUT', desc: 'Main lights off. Bring a torch.', mult: 0.6 },
  cranky: { name: 'CRANKY GEAR', desc: 'Twice as many breakdowns', mult: 0.45 },
};

export const PENALTY = {
  misdeliver: 15,
  estop: 25,
  burst: 120,
  lostCargo: 30,
};
