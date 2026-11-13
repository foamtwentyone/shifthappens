// Kenney asset library (CC0): Factory Kit, Mini Characters, City Kit Industrial,
// Prototype Kit. Everything is preloaded once, then cloned on demand.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODELS } from '../../shared/constants.js';

const BASE = `${import.meta.env.BASE_URL}assets/kenney/`;

export const MANIFEST = {
  characters: MODELS.map((m) => `character-${m}`),
  factory: ['conveyor-long-stripe-sides', 'conveyor-stripe-sides', 'machine', 'machine-window', 'machine-fortified', 'hopper-round',
    'hopper-high-round', 'scanner-high', 'crane', 'crane-magnet', 'lever-single', 'robot-arm-a', 'robot-arm-b', 'screen-wide',
    'screen-hanging-wide', 'warning-traffic', 'warning-orange', 'cog-a', 'cog-b', 'catwalk-straight', 'pipe-large-long',
    'pipe-large-bend', 'pipe-large-valve', 'pipe-glass-large-long', 'pipe-glass-large-bend', 'structure-tall',
    'structure-yellow-tall', 'box-large', 'box-wide', 'box-small', 'cone', 'piston-round', 'button-floor-round'],
  industrial: ['building-a', 'building-c', 'building-e', 'building-g', 'building-h', 'building-k', 'building-m', 'building-p',
    'chimney-large', 'chimney-medium', 'detail-tank-large', 'detail-tank', 'shipping-container-a', 'shipping-container-b',
    'shipping-container-c', 'water-tower', 'solar-panel-landscape-group', 'windmill'],
  prototype: ['hat-hard', 'hat-cap', 'crate', 'crate-color'],
};

class AssetLib {
  constructor() { this.gltf = new Map(); this.ready = false; }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const jobs = [];
    for (const [pack, names] of Object.entries(MANIFEST)) for (const n of names) jobs.push([pack, n]);
    let done = 0;
    await Promise.all(jobs.map(async ([pack, n]) => {
      try {
        const g = await loader.loadAsync(`${BASE}${pack}/${n}.glb`);
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          const m = o.material;
          if (m && m.map) { m.map.anisotropy = 8; m.map.colorSpace = THREE.SRGBColorSpace; }
          // Kenney glass reads better a little bluer and see-through
          if (m && /glass/i.test(m.name)) { m.transparent = true; m.opacity = 0.35; m.depthWrite = false; m.color.set('#bff7f2'); o.castShadow = false; }
        });
        this.gltf.set(`${pack}/${n}`, g);
      } catch (e) {
        console.warn('asset failed', pack, n, e);
      }
      done++;
      onProgress?.(done / jobs.length);
    }));
    this.ready = true;
  }

  has(key) { return this.gltf.has(key); }

  // static prop clone (shares geometry/materials)
  prop(key, scale = 1) {
    const g = this.gltf.get(key);
    if (!g) return null;
    const o = g.scene.clone(true);
    o.scale.setScalar(scale);
    return o;
  }

  // skinned character clone + its clips
  character(model) {
    const g = this.gltf.get(`characters/character-${model}`) || this.gltf.get('characters/character-worker');
    if (!g) return null;
    const scene = skeletonClone(g.scene);
    return { scene, clips: g.animations };
  }
}

export const assets = new AssetLib();
