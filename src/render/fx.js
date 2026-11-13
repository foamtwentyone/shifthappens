// Lightweight particle effects: puffs, steam, sparks, confetti, shards, flames, stars.
import * as THREE from 'three';
import { radialTex } from './tex.js';

const softTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
function starTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffc93c'; g.strokeStyle = '#1b1f24'; g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 28; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.closePath(); g.fill(); g.stroke();
  return new THREE.CanvasTexture(c);
}
const starT = starTex();
const confGeo = new THREE.PlaneGeometry(0.12, 0.07);
const shardGeo = new THREE.TetrahedronGeometry(0.09);
const CONF = ['#ffc93c', '#ff7a2f', '#49c46b', '#3b82d6', '#ff5d8f', '#8b5cf6', '#ffffff'];

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  spawnSprite(pos, o) {
    const m = new THREE.SpriteMaterial({ map: o.tex ?? softTex, color: o.color ?? '#ffffff', transparent: true, depthWrite: false, opacity: o.opacity ?? 0.8, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(m);
    s.position.copy(pos);
    s.scale.setScalar(o.size ?? 0.5);
    this.group.add(s);
    this.parts.push({ obj: s, vel: o.vel ?? new THREE.Vector3(), life: o.life ?? 1, max: o.life ?? 1, grow: o.grow ?? 1.5, size: o.size ?? 0.5, grav: o.grav ?? 0, drag: o.drag ?? 1.5, fade: o.fade ?? 0.8, spin: o.spin ?? 0, sprite: true });
  }

  spawnMesh(geo, material, pos, o) {
    const m = new THREE.Mesh(geo, material);
    m.position.copy(pos);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.group.add(m);
    this.parts.push({ obj: m, vel: o.vel, life: o.life ?? 2, max: o.life ?? 2, grav: o.grav ?? 9, drag: o.drag ?? 0.3, spinV: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12), floor: o.floor ?? 0.02, mesh: true });
  }

  puff(x, y, z, n = 6, color = '#f4ebd9', size = 0.5, spread = 1.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawnSprite(new THREE.Vector3(x, y, z), { color, size: size * (0.6 + Math.random() * 0.6), life: 0.6 + Math.random() * 0.4, vel: new THREE.Vector3(Math.cos(a) * spread, 0.5 + Math.random(), Math.sin(a) * spread), grow: 2.2, opacity: 0.7 });
    }
  }

  steam(x, y, z, n = 10, up = 3) {
    for (let i = 0; i < n; i++) this.spawnSprite(new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6), { color: '#ffffff', size: 0.6 + Math.random() * 0.5, life: 1 + Math.random() * 0.6, vel: new THREE.Vector3((Math.random() - 0.5) * 2, up + Math.random() * up, (Math.random() - 0.5) * 2), grow: 3, opacity: 0.55, drag: 1.2 });
  }

  sparks(x, y, z, n = 12, color = '#ffd36b') {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 6 + 1, (Math.random() - 0.5) * 7);
      this.spawnSprite(new THREE.Vector3(x, y, z), { color, size: 0.14, life: 0.35 + Math.random() * 0.3, vel: v, grow: 0.2, grav: 14, drag: 0.5, add: true, opacity: 1, fade: 0.3 });
    }
  }

  flames(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) this.spawnSprite(new THREE.Vector3(x + (Math.random() - 0.5) * 1.0, y, z + (Math.random() - 0.5) * 1.0), { color: Math.random() < 0.5 ? '#ff7a2f' : '#ffc93c', size: 0.5, life: 0.5 + Math.random() * 0.4, vel: new THREE.Vector3(0, 2.5 + Math.random() * 2, 0), grow: 0.4, add: true, opacity: 0.9 });
  }

  confetti(x, y, z, n = 30, power = 5) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.MeshBasicMaterial({ color: CONF[i % CONF.length], side: THREE.DoubleSide });
      const a = Math.random() * Math.PI * 2;
      this.spawnMesh(confGeo, m, new THREE.Vector3(x, y, z), { vel: new THREE.Vector3(Math.cos(a) * power * Math.random(), power * (0.8 + Math.random()), Math.sin(a) * power * Math.random()), life: 2.2, grav: 7, drag: 1.6 });
    }
  }

  shards(x, y, z, color = '#ffffff', n = 14) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawnMesh(shardGeo, m, new THREE.Vector3(x, y, z), { vel: new THREE.Vector3(Math.cos(a) * 4 * Math.random(), 3 + Math.random() * 4, Math.sin(a) * 4 * Math.random()), life: 2.5, grav: 16, drag: 0.4 });
    }
  }

  stars(x, y, z) {
    for (let i = 0; i < 3; i++) this.spawnSprite(new THREE.Vector3(x, y, z), { tex: starT, size: 0.32, life: 1.2, vel: new THREE.Vector3(Math.cos(i * 2.1) * 1.2, 1.4, Math.sin(i * 2.1) * 1.2), grow: 0.3, drag: 2.5, opacity: 1, fade: 0.4 });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.obj);
        if (p.sprite) p.obj.material.dispose();
        else if (p.obj.material.map === undefined || p.obj.material.isMeshBasicMaterial) p.obj.material.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.obj.position.addScaledVector(p.vel, dt);
      const k = 1 - p.life / p.max;
      if (p.sprite) {
        p.obj.scale.setScalar(p.size * (1 + (p.grow - 1) * k));
        p.obj.material.opacity = Math.min(p.obj.material.opacity, (p.life / p.max) / p.fade) * 1;
      } else {
        if (p.obj.position.y < p.floor) { p.obj.position.y = p.floor; p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spinV.multiplyScalar(0.5); }
        p.obj.rotation.x += p.spinV.x * dt; p.obj.rotation.y += p.spinV.y * dt; p.obj.rotation.z += p.spinV.z * dt;
        if (p.life < 0.5) p.obj.scale.setScalar(p.life / 0.5);
      }
    }
  }
}
