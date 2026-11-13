// Set dressing with the Kenney kits (CC0). Purely visual: no colliders here,
// so nothing placed inside walkable space — props hug walls, corners and the
// world outside the plant.
import * as THREE from 'three';
import { assets } from './assets.js';
import { SORTER, SCANNER, TUBE } from '../../shared/level.js';

function put(view, key, x, y, z, s = 1, ry = 0) {
  const o = assets.prop(key, s);
  if (!o) return null;
  o.position.set(x, y, z);
  o.rotation.y = ry;
  view.add(o);
  return o;
}

export function dressPlant(view) {
  if (!assets.ready) return;
  const anim = (view.kenneyAnim = []);

  // ── machines: swap procedural shells for kit models ──
  if (view.sorter?.head) {
    view.sorter.head.children[0].visible = false;
    const m = assets.prop('factory/machine-window', 1.35);
    if (m) { m.rotation.y = Math.PI; m.position.set(0, 0, 0.05); view.sorter.head.add(m); }
  }
  if (view.scannerShell) {
    for (const o of view.scannerShell) o.visible = false;
    put(view, 'factory/scanner-high', SCANNER.x, 0, SCANNER.z, 1.4);
  }
  if (view.hopperShell) {
    for (const o of view.hopperShell) o.visible = false;
    put(view, 'factory/hopper-round', TUBE.mouth[0], 0, TUBE.mouth[2], 1.5);
  }

  // ── animated robot arms in corners ──
  for (const [x, z, ry, k] of [[-29.6, -8.5, 0.6, 'a'], [2.7, -8.4, -0.5, 'b'], [-16.2, -8.5, 0.3, 'b'], [-0.4, -21.3, 0.2, 'a']]) {
    const r = put(view, `factory/robot-arm-${k}`, x, 0, z, 2.1, ry);
    if (!r) continue;
    put(view, 'factory/box-wide', x + Math.sin(ry) * 1.3, 0, z + Math.cos(ry) * 1.3, 1.6, ry);
    const joints = [];
    r.traverse((o) => { if (o !== r && !o.isMesh && o.children.length) joints.push(o); });
    if (!joints.length) r.traverse((o) => { if (o !== r && o.isMesh) joints.push(o); });
    anim.push({ joints: joints.slice(1), seed: x * 0.37 + z });
  }

  // ── wall cogs (slowly turning) ──
  for (const [x, y, z, s, sp] of [[-27.5, 2.4, -9.68, 2.2, 0.4], [-25.9, 1.7, -9.68, 1.4, -0.65], [6.6, 2.5, -2.95, 1.8, 0.5]]) {
    const c = put(view, 'factory/cog-a', x, y, z, s);
    if (!c) continue;
    c.rotation.x = Math.PI / 2;
    anim.push({ spin: c, sp });
  }

  // ── signal towers + yellow structure frames at openings ──
  put(view, 'factory/warning-traffic', 3.3, 0, 3.35, 1.7);
  put(view, 'factory/warning-traffic', 10.7, 0, -3.35, 1.7);
  put(view, 'factory/warning-orange', -13.7, 0, 3.45, 1.7);
  put(view, 'factory/warning-orange', -31.7, 0, 2.35, 1.6);
  for (const z of [-3.25, 3.25]) put(view, 'factory/structure-yellow-tall', -14, 0, z, 1.6);
  put(view, 'factory/screen-wide', -1.5, 0, -9.35, 1.6);
  put(view, 'factory/piston-round', -25.4, 0, -8.9, 2);
  put(view, 'factory/machine-fortified', -11.6, 0, -8.9, 1.4);
  put(view, 'factory/pipe-large-valve', 2.4, 0, -21.3, 1.6, Math.PI / 2);

  // ── crate & box stacks in corners ──
  const stack = (x, z, ry) => {
    put(view, 'factory/box-large', x, 0, z, 1.8, ry);
    put(view, 'factory/box-small', x + 0.2, 0.99, z + 0.1, 1.8, ry + 0.4);
    put(view, 'prototype/crate-color', x + 1.6, 0, z, 1.8, ry - 0.2);
  };
  stack(-30.3, 7.3, 0.2); stack(12.1, -8.4, -0.1); stack(26.5, 8.6, 0.4); stack(-12.6, 8.6, 0);
  for (const [x, z] of [[11.2, 1.6], [11.2, -1.6], [14.8, -5.5], [-15.2, 8.6]]) put(view, 'factory/cone', x, 0, z, 2.2);

  // ── the industrial estate outside Plant 7 ──
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(150, 90), new THREE.MeshStandardMaterial({ color: '#33464b', roughness: 0.95 }));
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(-8, -0.03, -14);
  yard.receiveShadow = true;
  view.add(yard);
  const north = [['building-a', -40], ['building-e', -28], ['building-k', -16], ['building-c', -4], ['building-g', 8], ['building-p', 20], ['building-h', 32]];
  north.forEach(([n, x], i) => put(view, `industrial/${n}`, x, 0, -31 - (i % 2) * 4, 6, Math.PI));
  put(view, 'industrial/chimney-large', -22, 0, -27, 5);
  put(view, 'industrial/chimney-medium', 14, 0, -27, 5);
  put(view, 'industrial/water-tower', 40, 0, -20, 5);
  put(view, 'industrial/detail-tank-large', 10, 0, -27, 4);
  put(view, 'industrial/detail-tank', 24, 0, -26, 4);
  put(view, 'industrial/windmill', -56, 0, -24, 6);
  put(view, 'industrial/building-m', -56, 0, -6, 6, Math.PI / 2);
  put(view, 'industrial/building-k', -56, 0, 6, 6, Math.PI / 2);
  // container yard beyond the dock
  const cols = ['a', 'b', 'c'];
  for (let i = 0; i < 6; i++) put(view, `industrial/shipping-container-${cols[i % 3]}`, 35 + (i % 2) * 4.6, (i > 3 ? 1 : 0) * 7.7, -6 + Math.floor(i / 2) * 6.4, 6 * (i > 3 ? 1 : 1), i % 3 ? 0 : Math.PI);
  put(view, 'industrial/solar-panel-landscape-group', 44, 0, 8, 5);
  view.chimneys = [[-22, 9.0, -27], [14, 7.0, -27]];
}

export function animateDressing(view, t, dt) {
  for (const a of view.kenneyAnim || []) {
    if (a.spin) { a.spin.rotation.z += dt * a.sp; continue; }
    a.joints.forEach((j, i) => {
      if (j.userData.r0 === undefined) j.userData.r0 = j.rotation.clone();
      const r0 = j.userData.r0;
      const w = Math.sin(t * (0.9 + i * 0.3) + a.seed + i) * 0.35;
      if (i === 0) j.rotation.y = r0.y + w * 2.2; else j.rotation.z = r0.z + w;
    });
  }
}
