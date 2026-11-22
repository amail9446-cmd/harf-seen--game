// Procedural anime-style 3D models (toon shaded) built from primitives:
// heroines, bicycle, gates, stations, castle, podium, collectibles.
import * as THREE from 'three';

let GRAD;
export function gradientMap() {
  if (!GRAD) {
    GRAD = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
    GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter;
    GRAD.needsUpdate = true;
  }
  return GRAD;
}
const matCache = new Map();
export function toon(color, extra) {
  const key = extra ? null : color;
  if (key !== null && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...(extra || {}) });
  if (key !== null) matCache.set(key, m);
  return m;
}
export const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });

const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
export function placeTube(mesh, a, b, scaleLen = true) {
  _d.subVectors(b, a);
  const len = _d.length();
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  if (len > 1e-5) mesh.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
  if (scaleLen) mesh.scale.set(1, len, 1);
}
const cylCache = new Map();
function cyl(r) {
  if (!cylCache.has(r)) cylCache.set(r, new THREE.CylinderGeometry(r, r, 1, 10));
  return cylCache.get(r);
}
function tube(a, b, r, mat, parent) {
  const m = new THREE.Mesh(cyl(r), mat);
  placeTube(m, a, b);
  parent.add(m);
  return m;
}
const sph = (r, mat, parent, x = 0, y = 0, z = 0, seg = 16) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75)), mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
};

// ---------------- Heroines ----------------
export const HEROINES = [
  { name: 'لمى', title: 'بطلة الزهور', skin: 0xffe0cc, hair: 0x6b3b22, iris: 0x7a3f1d, outfit: 0xff7eb6, accent: 0xffffff, helmet: 0xff5fa2, bike: 0xff8fc8, bikeAccent: 0xffd34d, style: 'ponytail', css: '#ff7eb6' },
  { name: 'ريم', title: 'بطلة النجوم', skin: 0xc68a63, hair: 0x231a2e, iris: 0x3b2310, outfit: 0xb07cff, accent: 0xffe27a, helmet: 0x8f5bff, bike: 0xb48cff, bikeAccent: 0x7ce7ff, style: 'twintails', css: '#a970ff' },
  { name: 'جنى', title: 'بطلة السماء', skin: 0xffe9d9, hair: 0xf2a33a, iris: 0x2f7bbd, outfit: 0x45c8e8, accent: 0xff9ad5, helmet: 0x2fb6e0, bike: 0x6fd7f2, bikeAccent: 0xff7eb6, style: 'braid', css: '#2fb6e0' },
];

export function buildHeroine(h) {
  const root = new THREE.Group();
  const skin = toon(h.skin), outfit = toon(h.outfit), hair = toon(h.hair), white = toon(0xffffff);
  const accent = toon(h.accent), helmetM = toon(h.helmet), shoe = toon(0xffffff), shorts = toon(new THREE.Color(h.outfit).multiplyScalar(0.75).getHex());

  // torso + tutu
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.3, 6, 14), outfit);
  root.add(torso);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.03, 6, 20), accent);
  stripe.rotation.x = Math.PI / 2; torso.add(stripe);
  const tutu = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.33, 0.16, 18, 1, true), toon(h.outfit, { side: THREE.DoubleSide }));
  root.add(tutu);

  // limbs (cylinders placed each frame between joints)
  const parts = {};
  ['thighL', 'thighR'].forEach((k) => { parts[k] = new THREE.Mesh(cyl(0.085), shorts); root.add(parts[k]); });
  ['shinL', 'shinR'].forEach((k) => { parts[k] = new THREE.Mesh(cyl(0.07), skin); root.add(parts[k]); });
  ['uarmL', 'uarmR'].forEach((k) => { parts[k] = new THREE.Mesh(cyl(0.065), outfit); root.add(parts[k]); });
  ['farmL', 'farmR'].forEach((k) => { parts[k] = new THREE.Mesh(cyl(0.055), skin); root.add(parts[k]); });
  ['kneeL', 'kneeR'].forEach((k) => { parts[k] = sph(0.08, shorts, root, 0, 0, 0, 10); });
  ['footL', 'footR'].forEach((k) => {
    const f = sph(0.09, shoe, root, 0, 0, 0, 10); f.scale.set(1, 0.7, 1.5); parts[k] = f;
  });
  ['handL', 'handR'].forEach((k) => { parts[k] = sph(0.065, skin, root, 0, 0, 0, 10); });

  // head
  const head = new THREE.Group();
  root.add(head);
  sph(0.33, skin, head, 0, 0, 0, 24);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.355, 24, 16, Math.PI, Math.PI), hair);
  back.position.set(0, 0.02, -0.02); head.add(back);
  for (let i = 0; i < 5; i++) {
    const b = sph(0.1, hair, head, -0.2 + i * 0.1, 0.2 - Math.abs(i - 2) * 0.02, 0.24, 10);
    b.scale.set(1, 0.8, 0.7);
  }
  // big anime eyes
  const irisM = toon(h.iris);
  const eyeWhite = toon(0xffffff);
  [-1, 1].forEach((s) => {
    const ew = sph(0.085, eyeWhite, head, s * 0.125, -0.01, 0.285, 14); ew.scale.set(0.9, 1.2, 0.35);
    const e = sph(0.07, irisM, head, s * 0.125, -0.02, 0.305, 14); e.scale.set(0.85, 1.15, 0.35);
    const p = sph(0.035, toon(0x1a1020), head, s * 0.125, -0.03, 0.322, 10); p.scale.set(1, 1.2, 0.3);
    sph(0.022, white, head, s * 0.105, 0.025, 0.33, 8);
    sph(0.011, white, head, s * 0.145, -0.055, 0.33, 6);
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 4, 12, Math.PI), toon(0x2a1a2a));
    lash.position.set(s * 0.125, 0.0, 0.3); lash.scale.set(1, 1.25, 1); head.add(lash);
    const blush = sph(0.055, glow(0xff8fb1, 0.55), head, s * 0.2, -0.1, 0.25, 10); blush.scale.set(1, 0.6, 0.3);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), toon(0xd9466f));
  mouth.position.set(0, -0.13, 0.3); mouth.rotation.z = Math.PI; head.add(mouth);

  // helmet
  const helmet = new THREE.Group(); head.add(helmet);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), helmetM);
  shell.scale.set(1, 0.85, 1.12); helmet.add(shell);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 28), white);
  rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.12, 1); helmet.add(rim);
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.8), white);
  st.position.set(0, 0.34, 0); helmet.add(st);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.14), helmetM);
  visor.position.set(0, 0.03, 0.42); visor.rotation.x = 0.25; helmet.add(visor);
  const heart = sph(0.06, accent, helmet, 0.22, 0.24, 0.22, 10); heart.scale.set(1, 1, 0.4);
  helmet.position.y = 0.06;

  // hair style
  const tails = [];
  const chain = (start, dir, n, r0, parent) => {
    const g = new THREE.Group(); g.position.copy(start); parent.add(g);
    for (let i = 0; i < n; i++) sph(r0 * (1 - i * 0.12), hair, g, dir.x * i * r0 * 1.4, dir.y * i * r0 * 1.4, dir.z * i * r0 * 1.4, 12);
    tails.push(g); return g;
  };
  if (h.style === 'ponytail') {
    chain(new THREE.Vector3(0, 0.02, -0.38), new THREE.Vector3(0, -0.55, -0.75), 4, 0.12, head);
    sph(0.06, accent, head, 0, 0.04, -0.37, 10);
  } else if (h.style === 'twintails') {
    chain(new THREE.Vector3(0.3, -0.02, -0.2), new THREE.Vector3(0.35, -0.85, -0.3), 4, 0.1, head);
    chain(new THREE.Vector3(-0.3, -0.02, -0.2), new THREE.Vector3(-0.35, -0.85, -0.3), 4, 0.1, head);
    sph(0.05, accent, head, 0.3, 0.0, -0.2, 8); sph(0.05, accent, head, -0.3, 0.0, -0.2, 8);
  } else {
    chain(new THREE.Vector3(0.12, -0.12, -0.34), new THREE.Vector3(0.1, -1, -0.25), 6, 0.085, head);
    sph(0.05, accent, head, 0.17, -0.62, -0.5, 8);
  }

  // blob shadow
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x5a3a6a, transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
  root.add(shadow);

  const J = {}; ['hip', 'neck', 'headC', 'hipL', 'hipR', 'kneeL', 'kneeR', 'footL', 'footR', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR'].forEach((k) => { J[k] = new THREE.Vector3(); });
  const tmp = new THREE.Vector3();

  function ik(hp, ft, l1, l2, out, bendSign = 1) {
    tmp.subVectors(ft, hp);
    let dist = tmp.length();
    const max = l1 + l2 - 0.002;
    if (dist > max) { ft.copy(hp).addScaledVector(tmp.normalize(), max); dist = max; tmp.subVectors(ft, hp); }
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const ht = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    tmp.normalize();
    const yz = Math.hypot(tmp.y, tmp.z) || 1;
    out.copy(hp).addScaledVector(tmp, a);
    out.y += (tmp.z / yz) * ht * bendSign;
    out.z += (-tmp.y / yz) * ht * bendSign;
  }

  function apply() {
    placeTube(torso, J.hip, J.neck, false);
    tutu.position.copy(J.hip).lerp(J.neck, 0.12); tutu.quaternion.copy(torso.quaternion);
    head.position.copy(J.headC);
    for (const s of ['L', 'R']) {
      placeTube(parts['thigh' + s], J['hip' + s], J['knee' + s]);
      placeTube(parts['shin' + s], J['knee' + s], J['foot' + s]);
      parts['knee' + s].position.copy(J['knee' + s]);
      parts['foot' + s].position.copy(J['foot' + s]);
      placeTube(parts['uarm' + s], J['sh' + s], J['el' + s]);
      placeTube(parts['farm' + s], J['el' + s], J['ha' + s]);
      parts['hand' + s].position.copy(J['ha' + s]);
    }
  }

  let pose = 'ride';
  const api = {
    root, head, tails,
    setPose(p) { pose = p; shadow.visible = p === 'stand'; },
    // pedals: [Vector3 left, Vector3 right] in root space; t: time
    update(t, pedals, wave = 0) {
      if (pose === 'ride') {
        J.hip.set(0, 1.24, -0.34);
        J.neck.set(0, 1.7, -0.02);
        J.headC.set(0, 2.03, 0.08);
        J.hipL.set(0.12, 1.2, -0.33); J.hipR.set(-0.12, 1.2, -0.33);
        J.footL.copy(pedals[0]).y += 0.06; J.footR.copy(pedals[1]).y += 0.06;
        ik(J.hipL, J.footL, 0.55, 0.52, J.kneeL, 1);
        ik(J.hipR, J.footR, 0.55, 0.52, J.kneeR, 1);
        J.shL.set(0.22, 1.62, 0.0); J.shR.set(-0.22, 1.62, 0.0);
        J.haL.set(0.3, 1.3, 0.43); J.haR.set(-0.3, 1.3, 0.43);
        J.elL.copy(J.shL).lerp(J.haL, 0.5).add(tmp.set(0.07, -0.08, -0.02));
        J.elR.copy(J.shR).lerp(J.haR, 0.5).add(tmp.set(-0.07, -0.08, -0.02));
        head.rotation.set(0, 0, 0);
      } else {
        const breathe = Math.sin(t * 2) * 0.01;
        J.hip.set(0, 0.95, 0); J.neck.set(0, 1.5 + breathe, 0.0); J.headC.set(0, 1.84 + breathe, 0.02);
        J.hipL.set(0.12, 0.92, 0); J.hipR.set(-0.12, 0.92, 0);
        J.footL.set(0.14, 0.07, 0.04); J.footR.set(-0.14, 0.07, 0.04);
        ik(J.hipL, J.footL, 0.55, 0.52, J.kneeL, 1);
        ik(J.hipR, J.footR, 0.55, 0.52, J.kneeR, 1);
        J.shL.set(0.23, 1.42, 0); J.shR.set(-0.23, 1.42, 0);
        // left hand on hip, right hand waving
        J.elL.set(0.42, 1.18, -0.02); J.haL.set(0.26, 1.0, 0.06);
        const w = Math.sin(t * 7) * 0.12 * wave;
        J.elR.set(-0.45, 1.6, 0.05); J.haR.set(-0.55 + w, 1.95, 0.1);
        head.rotation.set(0, 0, Math.sin(t * 1.5) * 0.06);
      }
      apply();
      tails.forEach((g, i) => { g.rotation.x = Math.sin(t * 3 + i) * 0.12; g.rotation.z = Math.sin(t * 2.3 + i) * 0.1; });
    },
  };
  api.update(0, [new THREE.Vector3(0.16, 0.6, 0), new THREE.Vector3(-0.16, 0.3, 0)]);
  return api;
}

// ---------------- Bicycle ----------------
export function buildBike(h) {
  const root = new THREE.Group();
  const frameM = toon(h.bike), acc = toon(h.bikeAccent), dark = toon(0x3b2f52), white = toon(0xffffff);
  const metal = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, metalness: 0.7, roughness: 0.3 });
  const C = new THREE.Vector3(0, 0.42, -0.02);
  const RH = new THREE.Vector3(0, 0.45, -0.68), FH = new THREE.Vector3(0, 0.45, 0.68);
  const S = new THREE.Vector3(0, 1.05, -0.3), H = new THREE.Vector3(0, 1.08, 0.5), HB = new THREE.Vector3(0, 0.86, 0.55);
  tube(C, S, 0.045, frameM, root); tube(S, H, 0.045, frameM, root); tube(C, HB, 0.05, frameM, root);
  tube(H, HB, 0.05, acc, root);
  [0.07, -0.07].forEach((x) => {
    tube(C.clone().setX(x), RH.clone().setX(x), 0.03, frameM, root);
    tube(S.clone().setX(x * 0.6), RH.clone().setX(x), 0.028, frameM, root);
    tube(HB.clone().setX(x * 0.6), FH.clone().setX(x), 0.03, acc, root);
  });
  const stemTop = new THREE.Vector3(0, 1.28, 0.44);
  tube(H, stemTop, 0.035, metal, root);
  tube(new THREE.Vector3(0.34, 1.29, 0.43), new THREE.Vector3(-0.34, 1.29, 0.43), 0.025, metal, root);
  [0.33, -0.33].forEach((x) => {
    const g = new THREE.Mesh(cyl(0.04), acc); placeTube(g, new THREE.Vector3(x - 0.07 * Math.sign(x), 1.29, 0.43), new THREE.Vector3(x + 0.03 * Math.sign(x), 1.29, 0.43)); root.add(g);
    // ribbons on grips
    const rb = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 6), toon(0xffffff)); rb.position.set(x + 0.06 * Math.sign(x), 1.22, 0.4); rb.rotation.z = Math.PI; root.add(rb);
  });
  const seat = sph(0.13, white, root, 0, 1.12, -0.32, 14); seat.scale.set(0.9, 0.35, 1.5);
  tube(S, new THREE.Vector3(0, 1.1, -0.31), 0.03, metal, root);
  // basket with flowers
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.24, 14, 1, true), toon(0xf2c48d, { side: THREE.DoubleSide }));
  basket.position.set(0, 1.04, 0.82); root.add(basket);
  const fc = [0xff6fae, 0xffe066, 0xffffff, 0xb07cff];
  for (let i = 0; i < 5; i++) sph(0.07, toon(fc[i % 4]), root, Math.cos(i * 1.3) * 0.11, 1.16, 0.82 + Math.sin(i * 1.3) * 0.1, 10);
  sph(0.12, toon(0x8fe39a), root, 0, 1.1, 0.82, 10).scale.set(1.4, 0.4, 1.4);

  // wheels
  const wheels = [];
  [RH, FH].forEach((p) => {
    const holder = new THREE.Group(); holder.position.copy(p); root.add(holder);
    const spin = new THREE.Group(); holder.add(spin); wheels.push(spin);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.055, 10, 36), dark); tire.rotation.y = Math.PI / 2; spin.add(tire);
    const rimM = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.022, 6, 36), acc); rimM.rotation.y = Math.PI / 2; spin.add(rimM);
    for (let k = 0; k < 8; k++) {
      const sp = new THREE.Mesh(cyl(0.01), metal); sp.scale.y = 0.72; sp.rotation.x = (k * Math.PI) / 8; spin.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), white); hub.rotation.z = Math.PI / 2; spin.add(hub);
    // a glittery heart on each wheel so rotation is visible
    const hrt = sph(0.06, toon(0xffffff), spin, 0.03, 0.2, 0, 8); hrt.scale.set(0.4, 1, 1);
  });

  // crank + pedals
  const crankHolder = new THREE.Group(); crankHolder.position.copy(C); root.add(crankHolder);
  const crank = new THREE.Group(); crankHolder.add(crank);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 20), metal); ring.rotation.y = Math.PI / 2; ring.position.x = -0.05; crank.add(ring);
  const R = 0.17;
  [[0.16, 0], [-0.16, Math.PI]].forEach(([x, a]) => {
    const tip = new THREE.Vector3(x, -Math.sin(a) * R, Math.cos(a) * R);
    tube(new THREE.Vector3(x * 0.5, 0, 0), tip, 0.022, metal, crank);
    const pd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.08), dark); pd.position.copy(tip).setX(x * 1.25); crank.add(pd);
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x5a3a6a, transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.set(1, 2.4, 1);

  const pedals = [new THREE.Vector3(), new THREE.Vector3()];
  return {
    root, wheels, crank, shadow,
    setSpin(wheelAngle, crankAngle) {
      wheels.forEach((w) => { w.rotation.x = wheelAngle; });
      crank.rotation.x = crankAngle;
      pedals[0].set(0.18, C.y - Math.sin(crankAngle) * R, C.z + Math.cos(crankAngle) * R);
      pedals[1].set(-0.18, C.y - Math.sin(crankAngle + Math.PI) * R, C.z + Math.cos(crankAngle + Math.PI) * R);
      return pedals;
    },
  };
}

// ---------------- Text labels ----------------
export function labelTexture(text, { bg = '#ffffff', fg = '#5b2a86', border = '#ffb3da', w = 512, h = 256, size = 150 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const r = 60;
  g.fillStyle = border; roundRect(g, 0, 0, w, h, r); g.fill();
  g.fillStyle = bg; roundRect(g, 14, 14, w - 28, h - 28, r - 12); g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.direction = 'rtl';
  let fs = size;
  do { g.font = `800 ${fs}px "Baloo Bhaijaan 2", Tajawal, Tahoma, sans-serif`; fs -= 6; } while (g.measureText(text).width > w - 60 && fs > 30);
  g.fillText(text, w / 2, h / 2 + fs * 0.08);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------------- Answer gate (one per lane) ----------------
const GATE_COLORS = [0xff8fc8, 0xb48cff, 0x6fd7f2];
export function buildAnswerGate(label, colorIdx) {
  const g = new THREE.Group();
  const col = GATE_COLORS[colorIdx % 3];
  const postM = toon(col, {}), topM = toon(0xffffff, {});
  const posts = [];
  [-0.95, 0.95].forEach((x) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.7, 10), postM); p.position.set(x, 1.35, 0); g.add(p); posts.push(p);
    const ball = sph(0.17, toon(0xffd34d), g, x, 2.78, 0, 12); posts.push(ball);
  });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 24, Math.PI), postM);
  arch.position.y = 2.7; g.add(arch);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), new THREE.MeshBasicMaterial({ map: labelTexture(label), transparent: true }));
  sign.position.set(0, 2.05, 0.06); g.add(sign);
  const backSign = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.0), topM); backSign.position.set(0, 2.05, 0.03); backSign.rotation.y = Math.PI; g.add(backSign);
  // glowing floor pad that turns green/red
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.07; g.add(pad);
  return {
    group: g,
    setResult(ok) {
      const c = ok ? 0x37d67a : 0xff4d6d;
      postM.color.setHex(c); pad.material.color.setHex(c); pad.material.opacity = 0.75;
    },
    dispose() { sign.material.map.dispose(); },
  };
}

// ---------------- Star collectible ----------------
let STAR_GEO;
export function starGeometry() {
  if (!STAR_GEO) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.2 : 0.48, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    STAR_GEO = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
    STAR_GEO.center();
  }
  return STAR_GEO;
}
export function buildStar() {
  const m = new THREE.Mesh(starGeometry(), toon(0xffd34d, { emissive: 0x8a5a00, emissiveIntensity: 0.6 }));
  return m;
}

// ---------------- Cute obstacle: giant cupcake ----------------
export function buildCupcake() {
  const g = new THREE.Group();
  const liner = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.6, 14), toon(0x9fe3ff));
  liner.position.y = 0.3; g.add(liner);
  const fro = sph(0.6, toon(0xffc2e2), g, 0, 0.75, 0, 16); fro.scale.set(1, 0.7, 1);
  sph(0.38, toon(0xffd9ee), g, 0, 1.08, 0, 14).scale.set(1, 0.7, 1);
  sph(0.13, toon(0xff3b6b), g, 0, 1.38, 0, 12);
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.08, 2, 4), toon([0xffe066, 0x7ce7ff, 0xb07cff, 0xffffff][i % 4]));
    sp.position.set(Math.cos(i) * 0.45, 0.9, Math.sin(i) * 0.45); sp.rotation.set(i, i * 2, 0); g.add(sp);
  }
  // little smile
  [-0.15, 0.15].forEach((x) => sph(0.05, toon(0x3b2f52), g, x, 0.38, 0.5, 8));
  return g;
}

// ---------------- Magic station gate (stage 2) ----------------
export function buildStationGate(width, idx) {
  const g = new THREE.Group();
  const cols = [0xb07cff, 0xff7eb6, 0x45c8e8, 0xffb84d, 0x7be08a];
  const col = cols[idx % cols.length];
  const pillarM = toon(0xffffff), archM = toon(col), gemM = toon(0x7ce7ff, { emissive: 0x2a8fb0, emissiveIntensity: 0.6 });
  const hw = width / 2 + 0.6;
  [-hw, hw].forEach((x) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 5.4, 14), pillarM); p.position.set(x, 2.7, 0); g.add(p);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 14), archM); cap.position.set(x, 6.1, 0); g.add(cap);
    sph(0.22, toon(0xffd34d), g, x, 6.95, 0, 12);
  });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(hw, 0.35, 10, 40, Math.PI), archM); arch.position.y = 5.4; g.add(arch);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), gemM); gem.position.set(0, 5.4 + hw, 0); g.add(gem);
  // two doors with hinge pivots
  const doorM = toon(new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.45).getHex(), { side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const doors = [];
  [-1, 1].forEach((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * hw, 0, 0); g.add(pivot);
    const d = new THREE.Mesh(new THREE.BoxGeometry(hw, 5.2, 0.15), doorM); d.position.set(-s * hw / 2, 2.6, 0); pivot.add(d);
    const star = buildStar(); star.scale.setScalar(1.3); star.position.set(-s * hw / 2, 3.2, 0.12); pivot.add(star);
    const star2 = buildStar(); star2.scale.setScalar(1.3); star2.position.set(-s * hw / 2, 3.2, -0.12); pivot.add(star2);
    doors.push({ pivot, s });
  });
  return {
    group: g, gem, open: 0,
    setOpen(v) { this.open = v; doors.forEach(({ pivot, s }) => { pivot.rotation.y = s * v * 1.9; }); },
  };
}

// cute fairy princess who cheers at each station
export function buildFairy(color) {
  const g = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 16), toon(color)); dress.position.y = 0.75; g.add(dress);
  const head = new THREE.Group(); head.position.y = 1.6; g.add(head);
  sph(0.32, toon(0xffe3d1), head, 0, 0, 0, 18);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.35, 18, 12, Math.PI, Math.PI), toon(0xffd166)); head.add(hair);
  sph(0.25, toon(0xffd166), head, 0, 0.17, 0.05, 12).scale.set(1.2, 0.6, 1);
  [-1, 1].forEach((s) => {
    const e = sph(0.06, toon(0x3b2f52), head, s * 0.11, 0, 0.28, 10); e.scale.set(0.9, 1.3, 0.5);
    sph(0.018, toon(0xffffff), head, s * 0.1, 0.03, 0.32, 6);
    const b = sph(0.05, glow(0xff8fb1, 0.6), head, s * 0.19, -0.09, 0.25, 8); b.scale.set(1, 0.6, 0.3);
  });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI), toon(0xd9466f)); smile.position.set(0, -0.1, 0.29); smile.rotation.z = Math.PI; head.add(smile);
  const crown = new THREE.Group(); crown.position.y = 0.3; head.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 14, 1, true), toon(0xffd34d, { side: THREE.DoubleSide })); crown.add(band);
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), toon(0xffd34d)); const a = (i / 5) * Math.PI * 2;
    sp.position.set(Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2); crown.add(sp);
  }
  const wingM = new THREE.MeshBasicMaterial({ color: 0xc9f3ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const wings = [];
  [-1, 1].forEach((s) => {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), wingM); w.scale.set(1, 0.6, 1);
    const p = new THREE.Group(); p.position.set(0, 1.2, -0.2); w.position.x = s * 0.45; p.add(w); g.add(p); wings.push({ p, s });
  });
  const wand = new THREE.Group(); wand.position.set(0.45, 1.1, 0.2); g.add(wand);
  const stick = new THREE.Mesh(cyl(0.02), toon(0xffffff)); stick.scale.y = 0.6; stick.position.y = 0.3; wand.add(stick);
  const ws = buildStar(); ws.scale.setScalar(0.35); ws.position.y = 0.65; wand.add(ws);
  return {
    group: g,
    update(t, cheer) {
      g.position.y = 0.4 + Math.sin(t * 2.2) * 0.12 + (cheer ? Math.abs(Math.sin(t * 8)) * 0.3 : 0);
      wings.forEach(({ p, s }) => { p.rotation.y = s * (0.4 + Math.sin(t * 12) * 0.35); });
      wand.rotation.z = Math.sin(t * (cheer ? 10 : 2)) * 0.4;
    },
  };
}

// ---------------- Golden castle (end of stage 3) ----------------
export function buildCastle() {
  const g = new THREE.Group();
  const gold = toon(0xffd34d, { emissive: 0x6b4a00, emissiveIntensity: 0.35 });
  const pink = toon(0xffb3da), white = toon(0xfff7fb), roof = toon(0xb07cff);
  const body = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 5), white); body.position.set(0, 4, -2); g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 4), pink); top.position.set(0, 10.5, -2.5); g.add(top);
  for (let i = -3; i <= 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 5.2), gold); b.position.set(i * 2.3, 8.4, -2); g.add(b); }
  [[-8.5, 0], [8.5, 0], [-4.5, -2.5], [4.5, -2.5]].forEach(([x, z], i) => {
    const h = i < 2 ? 12 : 15;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, h, 18), i < 2 ? white : pink); t.position.set(x, h / 2, z - 2); g.add(t);
    const c = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.5, 18), roof); c.position.set(x, h + 2.2, z - 2); g.add(c);
    const ball = sph(0.45, gold, g, x, h + 4.7, z - 2, 12);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), toon(0xff5fa2, { side: THREE.DoubleSide })); flag.position.set(x + 0.7, h + 5.6, z - 2); g.add(flag);
    for (let k = 0; k < 3; k++) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14, 0, Math.PI), gold); w.position.set(x, 3 + k * 3, z - 0.15 + 0.03); g.add(w); }
    ball.userData.spin = true;
  });
  // golden gate frame + doors
  const frame = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.4, 10, 30, Math.PI), gold); frame.position.set(0, 4.6, 0.6); g.add(frame);
  [-3.2, 3.2].forEach((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.6, 0.8), gold); p.position.set(x, 2.3, 0.6); g.add(p); });
  const doorM = toon(0xffc94d, { emissive: 0x5a3c00, emissiveIntensity: 0.3 });
  const doors = [];
  [-1, 1].forEach((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 2.9, 0, 0.6); g.add(pivot);
    const d = new THREE.Mesh(new THREE.BoxGeometry(2.9, 6.6, 0.3), doorM); d.position.set(-s * 1.45, 3.3, 0); pivot.add(d);
    const st = buildStar(); st.scale.setScalar(1.6); st.position.set(-s * 1.45, 4.2, 0.25); pivot.add(st);
    doors.push({ pivot, s });
  });
  // title banner
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: labelTexture('تحدي العبقريات', { w: 1024, h: 200, size: 120, fg: '#8a4b00', border: '#ffd34d', bg: '#fff6d6' }), transparent: true }));
  banner.position.set(0, 9.8, 0.75); g.add(banner);
  return { group: g, setOpen(v) { doors.forEach(({ pivot, s }) => { pivot.rotation.y = s * v * 1.7; }); } };
}

export function buildPodium() {
  const g = new THREE.Group();
  const gold = toon(0xffd34d, { emissive: 0x6b4a00, emissiveIntensity: 0.4 });
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.6, 28), toon(0xffffff)); t1.position.y = 0.3; g.add(t1);
  const t2 = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.6, 28), gold); t2.position.y = 0.9; g.add(t2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 6, 36), toon(0xff7eb6)); ring.rotation.x = Math.PI / 2; ring.position.y = 1.2; g.add(ring);
  // trophy
  const cup = new THREE.Group(); cup.position.set(1.9, 0, 0.6); g.add(cup);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.3, 16), gold); base.position.y = 0.15; cup.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 10), gold); stem.position.y = 0.55; cup.add(stem);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(0xffd34d, { side: THREE.DoubleSide, emissive: 0x6b4a00, emissiveIntensity: 0.4 }));
  bowl.position.y = 1.25; cup.add(bowl);
  return { group: g, top: 1.2 };
}
