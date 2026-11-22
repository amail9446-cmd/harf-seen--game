// The 3D world: sky, ground, a closed looping road (CatmullRom curve) and
// instanced scenery. The bike's position is a running distance along the loop.
import * as THREE from 'three';
import { toon, glow } from './models.js';

export const ROAD_HALF = 3.7;
export const LANES = [2.3, 0, -2.3]; // option index 0 = right lane (RTL reading order)

const THEMES = [
  { name: 'طريق النجوم الوردية', ground: 0xbdefc4, road: '#f3dcff', line: '#ffffff', edge: 0xff7ec8, edge2: 0x7ce7ff, fog: 0xffe4f2, decor: ['tree', 'sakura', 'flowers', 'castle', 'lamp', 'cloud'] },
  { name: 'محطات أميرات الضرب', ground: 0xe3d2ff, road: '#ffe3f1', line: '#ffffff', edge: 0xb07cff, edge2: 0xffd34d, fog: 0xf1e4ff, decor: ['crystal', 'sakura', 'flowers', 'castle', 'lamp', 'cloud'] },
  { name: 'منعطفات البطلات', ground: 0xc4f0dc, road: '#e4ecff', line: '#ffffff', edge: 0x45c8e8, edge2: 0xff7eb6, fog: 0xe3f6ff, decor: ['tree', 'sakura', 'flowers', 'lamp', 'cloud', 'floatStar', 'castle'] },
];

function trackPoints(stage) {
  const pts = [];
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    let rx, rz, y = 0, wob;
    if (stage === 0) { rx = 115; rz = 80; wob = 10 * Math.sin(3 * a); }
    else if (stage === 1) { rx = 100; rz = 92; wob = 8 * Math.sin(4 * a + 0.5); }
    else {
      rx = 125; rz = 95; wob = 20 * Math.sin(5 * a + 1);
      const s = Math.sin(3 * a);
      y = s > 0.55 ? ((s - 0.55) / 0.45) * 2.6 : 0; // three bridges
    }
    pts.push(new THREE.Vector3(Math.cos(a) * (rx + wob), y, Math.sin(a) * (rz + wob)));
  }
  return pts;
}

function roadTexture(theme) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = theme.road; g.fillRect(0, 0, 256, 256);
  // subtle sparkles
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 2.5 + 0.5, 0, 7); g.fill(); }
  g.fillStyle = theme.line;
  [256 / 3, (256 * 2) / 3].forEach((x) => { g.fillRect(x - 4, 20, 8, 110); });
  g.fillStyle = '#ffd34d'; g.fillRect(0, 0, 10, 256); g.fillRect(246, 0, 10, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function ribbon(curve, L, half, offset, y, segLen = 1.5) {
  const M = Math.ceil(L / segLen);
  const pos = [], uv = [], idx = [];
  const p = new THREE.Vector3(), t = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= M; i++) {
    const u = (i % M) / M;
    curve.getPointAt(u, p); curve.getTangentAt(u, t);
    s.crossVectors(t, up).normalize();
    const a = p.clone().addScaledVector(s, offset - half), b = p.clone().addScaledVector(s, offset + half);
    pos.push(a.x, a.y + y, a.z, b.x, b.y + y, b.z);
    const v = (i * segLen) / 6;
    uv.push(0, v, 1, v);
    if (i < M) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export class Track {
  constructor(stage) {
    this.stage = stage;
    this.curve = new THREE.CatmullRomCurve3(trackPoints(stage), true, 'centripetal');
    this.length = this.curve.getLength();
    this._p = new THREE.Vector3(); this._t = new THREE.Vector3();
  }
  // frame at a running distance: point, tangent, right vector
  frame(dist, out) {
    const u = (((dist % this.length) + this.length) % this.length) / this.length;
    this.curve.getPointAt(u, out.p);
    this.curve.getTangentAt(u, out.t);
    out.s.crossVectors(out.t, out.up).normalize(); // right side (bike faces +t)
    return out;
  }
  newFrame() { return { p: new THREE.Vector3(), t: new THREE.Vector3(), s: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }; }
}

export function buildStageWorld(stage, quality) {
  const theme = THEMES[stage];
  const group = new THREE.Group();
  const track = new Track(stage);
  const L = track.length;

  // ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 48), toon(theme.ground, {}));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; group.add(ground);
  // pastel meadow patches
  const patchGeo = new THREE.CircleGeometry(1, 20);
  const patchM = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.ground).lerp(new THREE.Color(0xffffff), 0.35), transparent: true, opacity: 0.6, depthWrite: false });
  const patches = new THREE.InstancedMesh(patchGeo, patchM, 60);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    const r = 20 + Math.random() * 300, a = Math.random() * 7; const k = 6 + Math.random() * 18;
    m4.compose(ps.set(Math.cos(a) * r, 0, Math.sin(a) * r), q, sc.set(k, k * 0.6, 1)); patches.setMatrixAt(i, m4);
  }
  group.add(patches);

  // road
  const rt = roadTexture(theme);
  const road = new THREE.Mesh(ribbon(track.curve, L, ROAD_HALF, 0, 0.06), new THREE.MeshLambertMaterial({ map: rt, side: THREE.DoubleSide }));
  group.add(road);
  const edgeL = new THREE.Mesh(ribbon(track.curve, L, 0.22, -ROAD_HALF - 0.22, 0.12), new THREE.MeshBasicMaterial({ color: theme.edge, side: THREE.DoubleSide }));
  const edgeR = new THREE.Mesh(ribbon(track.curve, L, 0.22, ROAD_HALF + 0.22, 0.12), new THREE.MeshBasicMaterial({ color: theme.edge2, side: THREE.DoubleSide }));
  group.add(edgeL, edgeR);

  // sample the track for placement checks
  const samples = [];
  const f = track.newFrame();
  for (let d = 0; d < L; d += 3) { track.frame(d, f); samples.push({ d, p: f.p.clone(), t: f.t.clone(), s: f.s.clone() }); }
  const clearOfRoad = (x, z, margin) => {
    for (const sm of samples) { const dx = sm.p.x - x, dz = sm.p.z - z; if (dx * dx + dz * dz < (ROAD_HALF + margin) ** 2) return false; }
    return true;
  };

  // bridges + river (stage 3)
  if (stage === 2) {
    const pillarG = new THREE.CylinderGeometry(0.25, 0.3, 1, 8), postG = new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6);
    const pm = toon(0xffffff, {}), rm = toon(0xffb3da, {});
    const pillars = [], posts = [];
    let inBridge = false, peak = null;
    for (const sm of samples) {
      if (sm.p.y > 0.25) {
        [-1, 1].forEach((side) => {
          const base = sm.p.clone().addScaledVector(sm.s, side * (ROAD_HALF + 0.4));
          posts.push(base);
          if (Math.round(sm.d / 3) % 2 === 0) pillars.push(base.clone());
        });
        if (!peak || sm.p.y > peak.p.y) peak = sm;
        inBridge = true;
      } else if (inBridge) {
        // river under this bridge
        const river = new THREE.Mesh(new THREE.PlaneGeometry(14, 240), new THREE.MeshLambertMaterial({ color: 0x7fd3ff, side: THREE.DoubleSide }));
        river.rotation.x = -Math.PI / 2;
        river.position.set(peak.p.x, 0.0, peak.p.z);
        river.rotation.z = Math.atan2(peak.t.x, peak.t.z) + Math.PI / 2;
        group.add(river);
        inBridge = false; peak = null;
      }
    }
    const pi = new THREE.InstancedMesh(pillarG, pm, pillars.length);
    pillars.forEach((p, i) => { m4.compose(ps.set(p.x, p.y / 2, p.z), new THREE.Quaternion(), sc.set(1, Math.max(0.1, p.y), 1)); pi.setMatrixAt(i, m4); });
    const po = new THREE.InstancedMesh(postG, rm, posts.length);
    posts.forEach((p, i) => { m4.compose(ps.set(p.x, p.y + 0.5, p.z), new THREE.Quaternion(), sc.set(1, 1, 1)); po.setMatrixAt(i, m4); });
    group.add(pi, po);
  }

  // scenery (instanced)
  const dens = quality === 'low' ? 0.5 : 1;
  const inst = {
    trunk: [], canopy: [], sakura: [], flower: [], bush: [], lampPost: [], lampBulb: [], crystal: [], cloud: [], floatStar: [],
  };
  const flowerCols = [0xff6fae, 0xffe066, 0xffffff, 0xb07cff, 0x7ce7ff, 0xff9a62];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const castles = [];
  for (const sm of samples) {
    if (Math.random() > 0.75 * dens) continue;
    for (const side of [-1, 1]) {
      const dist = rnd(ROAD_HALF + 4, ROAD_HALF + 28);
      const p = sm.p.clone().addScaledVector(sm.s, side * dist); p.y = 0;
      if (!clearOfRoad(p.x, p.z, 3)) continue;
      const kind = Math.random();
      if (theme.decor.includes('tree') && kind < 0.28) { const h = rnd(2.2, 3.6); inst.trunk.push({ p, s: [1, h, 1] }); inst.canopy.push({ p: p.clone().setY(h + 0.8), s: [rnd(1.4, 2), rnd(1.3, 1.8), rnd(1.4, 2)] }); }
      else if (kind < 0.48) { const h = rnd(2, 3.2); inst.trunk.push({ p, s: [0.9, h, 0.9] }); inst.sakura.push({ p: p.clone().setY(h + 0.7), s: [rnd(1.3, 1.9), rnd(1.1, 1.5), rnd(1.3, 1.9)] }); }
      else if (theme.decor.includes('crystal') && kind < 0.6) inst.crystal.push({ p: p.clone().setY(rnd(0.8, 1.6)), s: [rnd(0.6, 1.1), rnd(1.4, 2.6), rnd(0.6, 1.1)], c: [0x7ce7ff, 0xb07cff, 0xff9ad5][Math.floor(Math.random() * 3)] });
      else if (kind < 0.85) {
        for (let k = 0; k < 7; k++) inst.flower.push({ p: p.clone().add(new THREE.Vector3(rnd(-1.6, 1.6), 0.35, rnd(-1.6, 1.6))), s: [0.28, 0.28, 0.28], c: flowerCols[Math.floor(Math.random() * flowerCols.length)] });
        inst.bush.push({ p: p.clone().setY(0.3), s: [rnd(0.8, 1.3), rnd(0.5, 0.8), rnd(0.8, 1.3)] });
      }
    }
    // lamps close to the road edge
    if (theme.decor.includes('lamp') && Math.round(sm.d / 3) % 7 === 0) {
      const side = Math.round(sm.d / 3) % 14 === 0 ? 1 : -1;
      const p = sm.p.clone().addScaledVector(sm.s, side * (ROAD_HALF + 1.4));
      if (clearOfRoad(p.x, p.z, 0.9)) {
        inst.lampPost.push({ p: p.clone().setY(p.y + 1.6), s: [1, 3.2, 1] });
        inst.lampBulb.push({ p: p.clone().setY(p.y + 3.35), s: [1, 1, 1], c: [0xffe066, 0xff9ad5, 0x7ce7ff][Math.round(sm.d) % 3] });
      }
    }
    if (theme.decor.includes('floatStar') && Math.random() < 0.18) inst.floatStar.push({ p: sm.p.clone().addScaledVector(sm.s, rnd(-14, 14)).setY(rnd(7, 12)), s: [1, 1, 1] });
  }
  // distant castles
  if (theme.decor.includes('castle')) {
    const n = quality === 'low' ? 4 : 7;
    for (let i = 0; i < n * 3 && castles.length < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(30, 200);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (clearOfRoad(x, z, 18)) castles.push(makeCastle(x, z, rnd(0.8, 1.5), group));
    }
  }
  // clouds
  for (let i = 0; i < 26 * dens; i++) {
    const a = Math.random() * 7, r = rnd(60, 300), base = new THREE.Vector3(Math.cos(a) * r, rnd(30, 55), Math.sin(a) * r);
    for (let k = 0; k < 4; k++) inst.cloud.push({ p: base.clone().add(new THREE.Vector3(k * 4 - 6, rnd(-1, 1.5), rnd(-2, 2))), s: Array(3).fill(rnd(3, 5.5)) });
  }

  const mk = (geo, mat, list, colored) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const col = new THREE.Color();
    list.forEach((it, i) => {
      m4.compose(it.p, it.rot || new THREE.Quaternion(), sc.set(...it.s)); im.setMatrixAt(i, m4);
      if (colored) im.setColorAt(i, col.setHex(it.c));
    });
    group.add(im);
    return im;
  };
  mk(new THREE.CylinderGeometry(0.18, 0.26, 1, 8).translate(0, 0.5, 0), toon(0xa8724f, {}), inst.trunk);
  mk(new THREE.SphereGeometry(1, 14, 10), toon(0x7fd88a, {}), inst.canopy);
  mk(new THREE.SphereGeometry(1, 14, 10), toon(0xffb7dc, {}), inst.sakura);
  mk(new THREE.SphereGeometry(1, 8, 6), toon(0xffffff, {}), inst.flower, true);
  mk(new THREE.SphereGeometry(1, 10, 8), toon(0x8be39a, {}), inst.bush);
  mk(new THREE.CylinderGeometry(0.08, 0.1, 1, 8), toon(0xffffff, {}), inst.lampPost);
  mk(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), inst.lampBulb, true);
  mk(new THREE.OctahedronGeometry(1), toon(0xffffff, { emissive: 0x332255, emissiveIntensity: 0.5 }), inst.crystal, true);
  mk(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25 }), inst.cloud);
  const fs = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.35 : 0.85, a = (i / 10) * Math.PI * 2 + Math.PI / 2; if (i === 0) fs.moveTo(Math.cos(a) * r, Math.sin(a) * r); else fs.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  const floatStars = mk(new THREE.ShapeGeometry(fs), new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide }), inst.floatStar);

  return { group, track, theme, floatStars };
}

function makeCastle(x, z, s, parent) {
  const g = new THREE.Group();
  const wall = toon(0xffe1f0, {}), roof = toon([0xb07cff, 0xff7eb6, 0x45c8e8][Math.floor(Math.random() * 3)], {});
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 6), wall); body.position.y = 3; g.add(body);
  [[-4, -3], [4, -3], [-4, 3], [4, 3], [0, 0]].forEach(([tx, tz], i) => {
    const h = i === 4 ? 12 : 8;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, h, 12), wall); t.position.set(tx, h / 2, tz); g.add(t);
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.5, 12), roof); c.position.set(tx, h + 1.7, tz); g.add(c);
  });
  const door = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16, 0, Math.PI), toon(0xffd34d, {})); door.position.set(0, 0, 3.02); g.add(door);
  g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = Math.random() * 6;
  parent.add(g);
  return g;
}

export function buildSky() {
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x7cc4ff) }, mid: { value: new THREE.Color(0xc9b8ff) }, bot: { value: new THREE.Color(0xffd9ec) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h>0.15 ? mix(mid, top, smoothstep(0.15,0.7,h)) : mix(bot, mid, smoothstep(-0.05,0.15,h)); gl_FragColor = vec4(c,1.0);}',
  });
  const sky = new THREE.Mesh(geo, mat);
  // sun
  const sun = new THREE.Mesh(new THREE.CircleGeometry(22, 32), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
  sun.position.set(-180, 160, -380); sun.lookAt(0, 0, 0);
  sky.add(sun);
  return sky;
}

// pooled sparkle / firework particles
export class Particles {
  constructor(scene, max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.base = new Float32Array(max * 3); this.maxLife = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const mat = new THREE.PointsMaterial({ size: 0.4, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.i = 0;
    for (let k = 0; k < max; k++) this.pos[k * 3 + 1] = -999;
  }
  burst(p, color, n = 40, speed = 5, up = 2, size) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.i = (this.i + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1), v = speed * (0.4 + Math.random() * 0.6);
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * v; this.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * v * 0.6 + up; this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * v;
      const cc = Array.isArray(color) ? new THREE.Color(color[k % color.length]) : c;
      this.base[i * 3] = cc.r; this.base[i * 3 + 1] = cc.g; this.base[i * 3 + 2] = cc.b;
      this.life[i] = this.maxLife[i] = 0.8 + Math.random() * 0.6;
    }
    if (size) this.points.material.size = size;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 4.5 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] = 0; }
      const fade = Math.min(1, (this.life[i] / this.maxLife[i]) * 1.6); // additive: darker = fades out
      this.col[i * 3] = this.base[i * 3] * fade; this.col[i * 3 + 1] = this.base[i * 3 + 1] * fade; this.col[i * 3 + 2] = this.base[i * 3 + 2] * fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
