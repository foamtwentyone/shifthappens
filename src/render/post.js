// Post-processing stack: ambient occlusion → bloom → tone map → colour grade → SMAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// Warm highlights, teal shadows, a touch of saturation, vignette and grain:
// the "toy factory under work lights" look.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uSat: { value: 1.1 },
    uContrast: { value: 1.1 },
    uAlarm: { value: 0 },
    uDark: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uSat, uContrast, uAlarm, uDark;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // split toning
      vec3 shadowTint = vec3(0.90, 1.00, 1.04);
      vec3 highTint = vec3(1.04, 1.01, 0.95);
      col *= mix(shadowTint, highTint, smoothstep(0.15, 0.8, l));
      // saturation + contrast around mid grey
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      // alarm pulse tints the frame red
      col = mix(col, col * vec3(1.25, 0.72, 0.7), uAlarm * (0.5 + 0.5 * sin(uTime * 6.0)) * 0.35);
      // vignette
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.25, 1.0)));
      col *= mix(1.0 - uVignette - uDark * 0.4, 1.0, v);
      // subtle grain
      col += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) * 0.018;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export class Post {
  constructor(gl, scene, camera) {
    this.gl = gl;
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
    this.build();
  }

  build() {
    const gl = this.gl;
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    const composer = (this.composer = new EffectComposer(gl, rt));
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.ao.blendIntensity = 1.0;
    this.ao.updateGtaoMaterial({ radius: 1.8, distanceExponent: 1.4, thickness: 2.0, scale: 1.4, samples: 12 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    // particles, badges and glass must not write into the AO depth/normal pass
    const aoRender = this.ao.render.bind(this.ao);
    this.hidden = [];
    this.ao.render = (...args) => {
      this.collectTransparent();
      for (const o of this.hidden) o.visible = false;
      aoRender(...args);
      for (const o of this.hidden) o.visible = true;
    };
    this.collectT = 0;
    composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.5, 1.35);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    this.smaa = new SMAAPass(size.x, size.y);
    composer.addPass(this.smaa);
  }

  collectTransparent() {
    this.hidden.length = 0;
    this.scene.traverseVisible((o) => {
      if (o.isSprite || o.isPoints || (o.isMesh && (o.material.transparent || o.userData.outline))) this.hidden.push(o);
    });
  }

  setQuality(q) {
    this.enabled = q !== 'low';
    this.ao.enabled = q !== 'low';
    this.ao.blendIntensity = 1.0;
    this.bloom.enabled = q !== 'low';
    this.halfAO = q !== 'high';
  }

  setSize(w, h) {
    const pr = this.gl.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    // AO at half resolution: most of the look for a quarter of the cost
    if (this.halfAO) this.ao.setSize(Math.round((w * pr) / 2), Math.round((h * pr) / 2));
  }

  render(dt, { alarm = 0, dark = 0, menu = false } = {}) {
    const u = this.grade.uniforms;
    u.uTime.value += dt;
    u.uAlarm.value += (alarm - u.uAlarm.value) * Math.min(1, dt * 4);
    u.uDark.value += (dark - u.uDark.value) * Math.min(1, dt * 3);
    u.uVignette.value = menu ? 0.42 : 0.3;
    this.composer.render(dt);
  }
}
