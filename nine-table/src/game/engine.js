// Game engine: renderer, camera, rider and the three stages' gameplay.
import * as THREE from 'three';
import { HEROINES, buildHeroine, buildBike, buildAnswerGate, buildStar, buildCupcake, buildStationGate, buildFairy, buildCastle, buildPodium } from './models.js';
import { buildStageWorld, buildSky, Particles, LANES, ROAD_HALF } from './world.js';
import { Learner, DIFFS, sayCorrect, explain, hintSpeech } from './learning.js';
import { ar, words } from './arabic.js';

const PRAISE = ['أحسنتِ يا بطلة!', 'إجابة مذهلة!', 'أنتِ نجمة الرياضيات!', 'رائعة!', 'ممتاز يا بطلة!', 'عبقرية!', 'اقتربتِ من الكأس الذهبي!'];
const PRAISE_SPOKEN = ['أحسنتِ يا بطلة!', 'إجابة مذهلة!', 'أنتِ نجمة الرياضيات!', 'رائعة!', 'ممتاز يا بطلة!', 'عبقرية!', 'اقتربتِ من الكأس الذهبي!'];
const STATIONS = 5;

export class Engine {
  constructor(container, { onState, onSave, audio, quality = 'high' }) {
    this.container = container;
    this.onState = onState; this.onSave = onSave; this.audio = audio;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.applyQuality();
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd7b8ff, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-40, 80, 30); this.scene.add(sun);
    this.sky = buildSky(); this.scene.add(this.sky);
    this.particles = new Particles(this.scene);
    this.frame = null; this.frame2 = null;
    this.objects = [];
    this.t = 0; this.dist = 0; this.speed = 0; this.offset = 0; this.laneIdx = 1; this.latVel = 0;
    this.wheelA = 0; this.crankA = 0; this.wobble = 0; this.slowT = 0;
    this.mode = 'showcase'; this.paused = false;
    this.debug = { timeScale: 1, auto: false };
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.heroIdx = 0;
    this.loadStage(0);
    this.setHeroine(0);
    this.showcase();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
    this._onVis = () => { if (document.hidden && this.isPlaying()) this.setPaused(true); };
    document.addEventListener('visibilitychange', this._onVis);
  }

  applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, { low: 1, medium: 1.3, high: 2 }[this.quality] || 1.5));
  }
  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q; this.applyQuality();
    const st = this.stageIdx; this.loadStage(st); this.resize();
    if (this.mode === 'showcase') this.showcase();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 72 : 62;
    this.camera.updateProjectionMatrix();
  }

  // ---------- setup ----------
  loadStage(i) {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.group.traverse((o) => { o.geometry?.dispose?.(); });
    }
    this.clearObjects();
    this.stageIdx = i;
    this.world = buildStageWorld(i, this.quality);
    this.scene.add(this.world.group);
    this.scene.fog = new THREE.Fog(this.world.theme.fog, 70, 330);
    this.frame = this.world.track.newFrame(); this.frame2 = this.world.track.newFrame();
    if (this.rig) this.scene.add(this.rig.root);
  }

  setHeroine(i) {
    this.heroIdx = i;
    if (this.rig) this.scene.remove(this.rig.root);
    const h = HEROINES[i];
    const root = new THREE.Group(), lean = new THREE.Group();
    root.add(lean);
    const bike = buildBike(h), girl = buildHeroine(h);
    lean.add(bike.root); lean.add(girl.root);
    root.add(bike.shadow);
    this.rig = { root, lean, bike, girl };
    this.scene.add(root);
    girl.setPose(this.mode === 'showcase' || this.mode === 'podium' ? 'stand' : 'ride');
    if (this.mode === 'showcase') this.placeStanding();
  }

  placeStanding() {
    const g = this.rig.girl;
    g.setPose('stand');
    this.rig.lean.remove(g.root); this.rig.root.add(g.root);
    g.root.position.set(1.25, 0, 0.25); g.root.rotation.set(0, -0.5, 0);
  }
  placeRiding() {
    const g = this.rig.girl;
    g.setPose('ride');
    this.rig.root.remove(g.root); this.rig.lean.add(g.root);
    g.root.position.set(0, 0, 0); g.root.rotation.set(0, 0, 0);
  }

  clearObjects() {
    for (const o of this.objects) { this.scene.remove(o.mesh); o.dispose?.(); }
    this.objects = [];
  }

  showcase() {
    if (this.stageIdx !== 0) this.loadStage(0);
    this.mode = 'showcase'; this.paused = false;
    this.clearObjects();
    this.dist = 40; this.speed = 0; this.offset = 0; this.laneIdx = 1;
    this.placeStanding();
    this.emit({ playing: false });
  }

  isPlaying() { return ['ride', 'panel', 'stopping'].includes(this.phase) && this.mode === 'play'; }

  emit(p) { this.onState?.(p); }

  // ---------- stages ----------
  startStage(stage, session) {
    this.session = session;
    this.learner = new Learner(session.learner);
    this.diff = DIFFS[session.diff] || DIFFS.beginner;
    this.loadStage(stage);
    this.mode = 'play'; this.paused = false;
    this.placeRiding();
    this.dist = 10; this.speed = 0; this.offset = 0; this.laneIdx = 1; this.latVel = 0;
    this.cruise = this.diff.speed; this.streak = 0;
    this.phase = 'ride';
    this.active = null; this.nextQAt = this.t + 2.6; this.panel = null;
    this.stageCorrect = 0; this.stationsDone = 0; this.stopAt = null;
    this.required = stage === 0 ? this.diff.s1 : stage === 1 ? STATIONS : this.diff.s3;
    this.castleSpawned = false;
    this.camPos.set(0, 0, 0);
    this.emit({ playing: true, finale: false, stage, question: null, panel: null, feedback: null, stageDone: null, finished: false, paused: false, progress: 0, required: this.required, stageCorrect: 0, lane: 1 });
    this.hud();
    const intro = ['هيّا بنا يا بطلة! وجّهي الدراجة نحو الإجابة الصحيحة', 'انطلقي إلى محطات أميرات الضرب! أجيبي لتفتحي البوابات السحرية', 'منعطفات البطلات! اجمعي النجوم، وتجنّبي الكعكات، واختاري البوابة الصحيحة'][stage];
    this.audio.speak(intro);
    if (stage === 1) this.spawnStation(this.dist + 50);
    if (stage !== 1) this.spawnStarRow(this.dist + 16, 1, 5);
  }

  hud() {
    const s = this.session;
    this.emit({
      hud: { score: s.score, stars: s.stars, gems: s.gems, correct: s.correct, attempts: s.attempts, time: s.time },
      progress: Math.min(1, (this.stageIdx === 1 ? this.stationsDone : this.stageCorrect) / this.required),
      stageCorrect: this.stageIdx === 1 ? this.stationsDone : this.stageCorrect,
    });
  }

  save() { this.session.learner = this.learner.toJSON(); this.onSave?.(this.session); }

  frameAt(d, f = this.frame2) { return this.world.track.frame(d, f); }

  placeOnRoad(mesh, d, lateral = 0, face = 1) {
    const f = this.frameAt(d);
    mesh.position.copy(f.p).addScaledVector(f.s, lateral);
    mesh.lookAt(mesh.position.x - f.t.x * face, mesh.position.y - f.t.y * face, mesh.position.z - f.t.z * face);
    return f;
  }

  // ----- stage 1 & 3 gates -----
  spawnGate() {
    let kind = 'product';
    if (this.stageIdx === 2 && this.diff.reverse && Math.random() < 0.6) kind = 'reverse';
    const q = this.learner.makeQuestion(kind);
    const d = this.dist + Math.max(38, this.cruise * this.diff.think + 6);
    const gates = q.options.map((o, i) => {
      const g = buildAnswerGate(o.label, i);
      this.placeOnRoad(g.group, d, LANES[i]);
      this.scene.add(g.group);
      return g;
    });
    const obj = { kind: 'gate', dist: d, q, gates, mesh: new THREE.Group(), dispose: () => gates.forEach((g) => { this.scene.remove(g.group); g.dispose(); }) };
    this.objects.push(obj);
    this.active = obj;
    this.emit({ question: { text: q.text, options: q.options.map((o) => o.label), kind: q.kind, id: Math.random() }, feedback: null });
    this.audio.speak(q.speech, { interrupt: true });
  }

  judgeGate(obj) {
    obj.judged = true;
    const lane = this.laneIdx;
    const q = obj.q;
    const ok = lane === q.correctIndex;
    const s = this.session;
    s.attempts++; s.questions++;
    obj.gates[lane].setResult(ok);
    this.learner.record(q.n, ok);
    const pos = obj.gates[lane].group.position.clone().setY(obj.gates[lane].group.position.y + 2);
    if (ok) {
      s.correct++; s.firstTry++; s.score += this.stageIdx === 2 ? 15 : 10; s.stars++;
      this.stageCorrect++; this.streak++;
      if (this.streak >= 2) this.cruise = Math.min(this.diff.maxSpeed, this.cruise + 0.5);
      this.particles.burst(pos, [0xffd34d, 0x37d67a, 0xffffff], 50, 6, 3);
      this.audio.sfx('correct'); setTimeout(() => this.audio.sfx('star'), 250);
      const pi = Math.floor(Math.random() * PRAISE.length);
      this.emit({ feedback: { ok: true, title: PRAISE[pi], line: `${ar(9)} × ${ar(q.n)} = ${ar(q.answer)}`, id: Math.random() }, question: null });
      this.audio.speak(`${PRAISE_SPOKEN[pi]} ${sayCorrect(q.n)}`);
      this.nextQAt = this.t + 3.2;
    } else {
      this.streak = 0;
      this.cruise = Math.max(this.diff.speed - 1.5, this.cruise - 1);
      this.slowT = 2.2;
      this.audio.sfx('wrong');
      this.emit({ feedback: { ok: false, title: 'حاولي مرة أخرى يا بطلة', line: `${ar(9)} × ${ar(q.n)} = ${ar(q.answer)}`, groups: q.n, id: Math.random() }, question: null });
      this.audio.speak(`حاولي مرة أخرى يا بطلة. ${explain(q.n)}`);
      this.nextQAt = this.t + 7.5;
    }
    this.active = null;
    this.hud(); this.save();
    // sprinkle stars (and in stage 3 an obstacle) before the next gate
    this.spawnStarRow(obj.dist + 14, Math.floor(Math.random() * 3), 4 + Math.floor(Math.random() * 3));
    if (this.stageIdx === 2 && Math.random() < this.diff.obstacleRate) {
      this.spawnObstacle(obj.dist + 26 + Math.random() * 6);
    }
    if (this.stageCorrect >= this.required) {
      if (this.stageIdx === 0) setTimeout(() => this.completeStage(), 2600);
      else this.nextQAt = Infinity, this.spawnCastle();
    }
  }

  spawnStarRow(d0, lane, n) {
    for (let i = 0; i < n; i++) {
      const m = buildStar();
      const d = d0 + i * 2.2;
      this.placeOnRoad(m, d, LANES[lane]);
      m.position.y += 1.1;
      this.scene.add(m);
      this.objects.push({ kind: 'star', dist: d, lane, mesh: m, baseY: m.position.y });
    }
  }

  spawnObstacle(d) {
    const lane = this.laneIdx; // the lane she is in now: she has to steer around it
    const m = buildCupcake();
    this.placeOnRoad(m, d, LANES[lane]);
    this.scene.add(m);
    this.objects.push({ kind: 'obstacle', dist: d, lane, mesh: m });
  }

  // ----- stage 2 stations -----
  spawnStation(d) {
    const idx = this.stationsDone;
    const gate = buildStationGate(ROAD_HALF * 2, idx);
    this.placeOnRoad(gate.group, d, 0);
    this.scene.add(gate.group);
    const fairy = buildFairy([0xff9ad5, 0xb07cff, 0x7ce7ff, 0xffd34d, 0x8be39a][idx % 5]);
    const f = this.frameAt(d - 2);
    fairy.group.position.copy(f.p).addScaledVector(f.s, ROAD_HALF + 2.2);
    fairy.group.lookAt(f.p.x - f.t.x * 6, fairy.group.position.y, f.p.z - f.t.z * 6);
    this.scene.add(fairy.group);
    const obj = { kind: 'station', dist: d, gate, fairy, mesh: gate.group, opening: 0, dispose: () => this.scene.remove(fairy.group) };
    this.objects.push(obj);
    this.station = obj;
    this.stopAt = d - 7;
  }

  spawnCastle() {
    this.castleSpawned = true;
    const d = this.dist + 70;
    const c = buildCastle();
    this.placeOnRoad(c.group, d, 0);
    c.group.position.y -= 0.02;
    this.scene.add(c.group);
    this.castle = { kind: 'castle', dist: d, c, mesh: c.group, open: 0 };
    this.objects.push(this.castle);
    this.stopAt = d - 9;
    this.emit({ toast: 'القصر الذهبي أمامكِ! ✨' });
  }

  arrive() {
    this.speed = 0;
    if (this.stageIdx === 1 && this.station) {
      this.openPanel('station');
    } else if (this.stageIdx === 2 && this.castle) {
      this.openPanel('castle');
    }
  }

  openPanel(kind) {
    this.phase = 'panel';
    const q = kind === 'castle' ? this.learner.makeWordProblem(this.diff.twoStep) : this.learner.makeQuestion('product');
    this.panel = { kind, q, tries: 0, disabled: [], hint: false, reveal: false, solved: false, counted: false };
    this.pushPanel();
    this.speakPanel();
  }

  pushPanel() {
    const P = this.panel;
    if (!P) { this.emit({ panel: null }); return; }
    this.emit({
      panel: {
        kind: P.kind, station: this.stationsDone + 1, text: P.q.text, icon: P.q.icon, groups: P.q.groups, newGroups: P.q.newGroups, n: P.q.n,
        options: P.q.options.map((o) => o.label), disabled: P.disabled.slice(), hint: P.hint, reveal: P.reveal ? { line: `${ar(9)} × ${ar(P.q.n)} = ${ar(P.q.answer)}` } : null,
        solved: P.solved, correctIndex: P.solved ? P.q.correctIndex : -1, id: P.id || (P.id = Math.random()),
      },
    });
  }

  speakPanel(withOptions = true) {
    const P = this.panel; if (!P) return;
    const ord = ['الأول', 'الثاني', 'الثالث'];
    const opts = P.q.options.map((o, i) => (P.disabled.includes(i) ? null : `الخيار ${ord[i]}: ${o.speech}`)).filter(Boolean).join('، ');
    this.audio.speak(withOptions ? `${P.q.speech} ${opts}` : P.q.speech);
  }

  answerPanel(i) {
    const P = this.panel;
    if (!P || P.solved || P.reveal || P.disabled.includes(i)) return;
    const s = this.session;
    const q = P.q;
    s.attempts++;
    if (!P.counted) { s.questions++; P.counted = true; }
    if (i === q.correctIndex) {
      P.solved = true;
      this.learner.record(q.n, true);
      s.correct++; if (P.tries === 0) s.firstTry++;
      if (P.kind === 'station') {
        s.score += 20; s.stars += 3; s.gems += 1;
        this.audio.sfx('correct'); setTimeout(() => this.audio.sfx('gem'), 300);
        this.audio.speak(`${PRAISE_SPOKEN[Math.floor(Math.random() * PRAISE_SPOKEN.length)]} ${sayCorrect(q.n)}. فُتحت البوابة السحرية!`);
        this.pushPanel();
        this.emit({ feedback: { ok: true, title: 'فُتحت البوابة السحرية! 💎', line: `${ar(9)} × ${ar(q.n)} = ${ar(q.answer)}`, id: Math.random() } });
        setTimeout(() => this.openStation(), 1300);
      } else {
        s.score += 50; s.stars += 5; s.gems += 2;
        this.audio.sfx('fanfare'); setTimeout(() => this.audio.sfx('clap'), 600);
        this.audio.speak(`مذهلة! ${words(q.answer)} هي الإجابة الصحيحة. لقد فتحتِ أبواب القصر الذهبي!`);
        this.pushPanel();
        setTimeout(() => this.openCastle(), 1300);
      }
      this.hud(); this.save();
      return;
    }
    // wrong
    P.tries++;
    P.disabled.push(i);
    if (P.tries === 1) this.learner.record(q.n, false);
    this.audio.sfx('wrong');
    if (P.tries === 1) {
      P.hint = true;
      this.pushPanel();
      this.audio.speak(`لا بأس، فرصة ثانية! ${hintSpeech(q.n)}`);
    } else {
      P.reveal = true;
      this.pushPanel();
      this.audio.speak(`حاولي مرة أخرى يا بطلة. ${explain(q.n)}. سنتدرّب عليها مرة أخرى.`);
    }
    this.hud(); this.save();
  }

  // after a reveal: a new (different) question at the same station / castle
  nextPanelQuestion() {
    const P = this.panel; if (!P) return;
    this.openPanel(P.kind);
  }

  openStation() {
    const st = this.station;
    if (!st) return;
    this.panel = null; this.pushPanel();
    st.opening = 0.001; st.cheer = true;
    this.audio.sfx('gate');
    const f = this.frameAt(st.dist);
    this.particles.burst(f.p.clone().setY(f.p.y + 5), [0xffd34d, 0xff7eb6, 0x7ce7ff, 0xffffff], 120, 8, 4);
    this.stationsDone++;
    this.hud();
    setTimeout(() => {
      this.phase = 'ride';
      if (this.stationsDone >= STATIONS) {
        this.stopAt = st.dist + 14; this.finishAfterStop = true;
      } else {
        this.spawnStarRow(st.dist + 10, Math.floor(Math.random() * 3), 5);
        this.spawnStation(st.dist + 62);
      }
    }, 900);
  }

  openCastle() {
    this.panel = null; this.pushPanel();
    this.castle.open = 0.001;
    this.audio.sfx('gate');
    this.fireworksT = 4.5;
    this.emit({ finale: true });
    this.emit({ feedback: { ok: true, title: 'فُتحت أبواب القصر الذهبي! 🏰', line: 'أنتِ بطلة جدول التسعة!', id: Math.random() } });
    setTimeout(() => this.toPodium(), 3600);
  }

  completeStage() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.stopAt = this.dist + 10;
    this.emit({ question: null });
    this.audio.sfx('fanfare'); setTimeout(() => this.audio.sfx('clap'), 500);
    const st = this.stageIdx;
    this.session.unlocked = Math.max(this.session.unlocked || 1, st + 2);
    this.save();
    this.audio.speak(st === 0 ? 'رائع! أنهيتِ طريق النجوم الوردية. هيّا إلى محطات أميرات الضرب!' : 'مذهل! فتحتِ كل البوابات السحرية. هيّا إلى منعطفات البطلات!');
    setTimeout(() => this.emit({ stageDone: { stage: st }, feedback: null }), 1800);
  }

  toPodium() {
    this.phase = 'podium';
    this.mode = 'podium';
    const d = this.castle.dist - 15;
    const pod = buildPodium();
    this.placeOnRoad(pod.group, d, 0);
    this.scene.add(pod.group);
    this.objects.push({ kind: 'podium', dist: d, mesh: pod.group });
    this.podium = pod;
    // heroine stands on the podium, bike parked beside
    this.dist = d - 0.2;
    this.offset = -3.2; this.speed = 0;
    const g = this.rig.girl;
    g.setPose('stand');
    this.rig.lean.remove(g.root); this.scene.add(g.root);
    g.root.position.copy(pod.group.position).setY(pod.group.position.y + pod.top);
    const f = this.frameAt(d);
    g.root.lookAt(g.root.position.x - f.t.x, g.root.position.y, g.root.position.z - f.t.z);
    this.podiumT = 0;
    this.session.completed = true;
    this.session.unlocked = 4;
    this.save();
    this.audio.sfx('fanfare'); setTimeout(() => this.audio.sfx('clap'), 400);
    this.audio.speak(`مبارك يا بطلتنا ${this.session.name}! لقد أنهيتِ مغامرات جدول التسعة بنجاح!`);
    this.emit({ question: null, feedback: null });
    setTimeout(() => this.emit({ finished: true }), 2600);
  }

  // ---------- input ----------
  steer(dir) { // dir +1 = right on screen, -1 = left
    if (this.mode !== 'play' || this.paused || this.phase === 'panel') return;
    const n = Math.max(0, Math.min(2, this.laneIdx - dir));
    if (n !== this.laneIdx) { this.laneIdx = n; this.audio.sfx('steer'); this.emit({ lane: n }); }
  }
  setLane(i) {
    if (this.mode !== 'play' || this.paused || this.phase === 'panel') return;
    if (i !== this.laneIdx) { this.laneIdx = i; this.audio.sfx('steer'); this.emit({ lane: i }); }
  }
  setPaused(p) {
    this.paused = p;
    if (p) this.audio.stopSpeech();
    this.emit({ paused: p });
  }
  replay() {
    if (this.panel) return this.speakPanel(true);
    if (this.active) {
      const q = this.active.q;
      const ord = this.active.q.options.map((o) => o.speech).join('، ');
      this.audio.speak(`${q.speech} الخيارات: ${ord}`);
    }
  }
  quit() {
    this.audio.stopSpeech();
    this.panel = null; this.active = null; this.phase = null; this.castle = null; this.station = null;
    if (this.rig.girl.root.parent === this.scene) { this.scene.remove(this.rig.girl.root); this.rig.lean.add(this.rig.girl.root); }
    this.showcase();
    this.emit({ panel: null, question: null, feedback: null, stageDone: null, finished: false, paused: false });
  }

  // ---------- frame loop ----------
  tick() {
    let dt = Math.min(0.05, this.clock.getDelta());
    dt *= this.debug.timeScale;
    this.t += dt;
    if (!this.paused) this.update(dt);
    this.particles.update(this.paused ? 0 : dt);
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    const t = this.t;
    const track = this.world.track;
    const f = track.frame(this.dist, this.frame);

    if (this.mode === 'play') {
      this.session.time += dt;
      if ((this._hudT = (this._hudT || 0) + dt) > 0.5) { this._hudT = 0; this.emit({ hud: { ...this.session && { score: this.session.score, stars: this.session.stars, gems: this.session.gems, correct: this.session.correct, attempts: this.session.attempts, time: this.session.time } } }); }
      this.updateGameplay(dt);
    }

    // speed control
    let target = 0;
    if (this.mode === 'play' && this.phase !== 'panel') {
      target = this.cruise;
      if (this.slowT > 0) { this.slowT -= dt; target *= 0.45; }
      if (this.stopAt != null) {
        const rem = this.stopAt - this.dist;
        target = Math.min(target, Math.max(0.7, rem * 0.8));
        if (rem <= 0.05) {
          this.dist = this.stopAt; this.stopAt = null; this.speed = 0; target = 0;
          if (this.finishAfterStop) { this.finishAfterStop = false; this.completeStage(); }
          else if (this.phase === 'done') { /* stage end coast */ } else this.arrive();
        }
      }
      if (this.phase === 'done' && this.stopAt == null) target = 0;
    }
    const k = target > this.speed ? 1.6 : 3.2;
    this.speed += (target - this.speed) * Math.min(1, k * dt);
    if (this.speed < 0.02 && target === 0) this.speed = 0;
    this.dist += this.speed * dt;

    // lateral
    if (this.mode === 'play') {
      const tx = LANES[this.laneIdx];
      const prev = this.offset;
      this.offset += (tx - this.offset) * Math.min(1, 9 * dt);
      this.latVel = (this.offset - prev) / Math.max(dt, 1e-4);
    } else this.latVel *= 0.9;

    // rig transform
    track.frame(this.dist, f);
    const rig = this.rig;
    if (this.mode !== 'podium') {
      rig.root.position.copy(f.p).addScaledVector(f.s, this.offset);
      rig.root.position.y += 0.06;
      rig.root.lookAt(rig.root.position.x + f.t.x, rig.root.position.y + f.t.y, rig.root.position.z + f.t.z);
    }
    this.wobble *= Math.exp(-dt * 3);
    rig.lean.rotation.z = THREE.MathUtils.clamp(this.latVel * 0.06, -0.3, 0.3) + Math.sin(t * 25) * this.wobble;
    this.wheelA += (this.speed * dt) / 0.45;
    this.crankA += (this.speed * dt) / 0.45 * 0.55;
    const pedals = rig.bike.setSpin(this.wheelA, this.crankA);
    rig.girl.update(t, pedals, this.mode === 'showcase' ? 1 : 0.6);

    this.updateObjects(dt);
    this.updateCamera(dt, f);

    if (this.fireworksT > 0) {
      this.fireworksT -= dt;
      if (Math.random() < dt * 5) {
        const c = this.castle.mesh.position;
        const p = new THREE.Vector3(c.x + (Math.random() - 0.5) * 30, c.y + 14 + Math.random() * 10, c.z + (Math.random() - 0.5) * 20);
        this.particles.burst(p, [[0xff7eb6, 0xffd34d], [0x7ce7ff, 0xffffff], [0xb07cff, 0xffd34d]][Math.floor(Math.random() * 3)], 90, 9, 1, 0.8);
        this.audio.sfx('firework');
      }
    }
    if (this.mode === 'podium') {
      this.podiumT += dt;
      if (Math.random() < dt * 3) {
        const p = rig.girl.root.position.clone(); p.y += 4; p.x += (Math.random() - 0.5) * 6; p.z += (Math.random() - 0.5) * 6;
        this.particles.burst(p, [0xff7eb6, 0xffd34d, 0x7ce7ff, 0xb07cff, 0x37d67a], 50, 4, 0, 0.5);
      }
    }
  }

  updateGameplay() {
    if (this.phase === 'ride' && (this.stageIdx === 0 || this.stageIdx === 2)) {
      if (!this.active && this.t >= this.nextQAt && this.stageCorrect < this.required) this.spawnGate();
      if (this.active && !this.active.judged) {
        if (this.debug.auto) this.setLane(this.active.q.correctIndex);
        if (this.dist >= this.active.dist - 0.2) this.judgeGate(this.active);
      }
    }
    // debug autopilot dodges obstacles
    if (this.debug.auto && !this.active) {
      const ob = this.objects.find((o) => o.kind === 'obstacle' && !o.hit && o.dist > this.dist && o.dist - this.dist < 14);
      if (ob && ob.lane === this.laneIdx) this.setLane(ob.lane === 1 ? 0 : 1);
    }
  }

  updateObjects(dt) {
    const t = this.t;
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (o.kind === 'star') {
        if (!o.got) {
          o.mesh.rotation.y += dt * 3;
          o.mesh.position.y = o.baseY + Math.sin(t * 3 + o.dist) * 0.15;
          if (this.mode === 'play' && Math.abs(this.dist - o.dist) < 0.9 && Math.abs(this.offset - LANES[o.lane]) < 1.2) {
            o.got = true; this.session.stars++; this.session.score += 2;
            this.audio.sfx('star');
            this.particles.burst(o.mesh.position, [0xffd34d, 0xffffff], 18, 3, 2);
            this.hud();
          }
        } else {
          o.mesh.position.y += dt * 6; o.mesh.scale.multiplyScalar(1 - dt * 3);
          if (o.mesh.scale.x < 0.05) o.gone = true;
        }
      } else if (o.kind === 'obstacle') {
        if (!o.hit) {
          o.mesh.scale.y = 1 + Math.sin(t * 5 + o.dist) * 0.06;
          if (this.mode === 'play' && Math.abs(this.dist - o.dist) < 1.0 && Math.abs(this.offset - LANES[o.lane]) < 1.4) {
            o.hit = true; o.vy = 7; o.vx = (Math.random() < 0.5 ? -1 : 1) * 5;
            this.slowT = 1.6; this.wobble = 0.12;
            this.audio.sfx('bump');
            this.emit({ toast: 'أوه! انتبهي للكعكة يا بطلة 🧁' });
            this.particles.burst(o.mesh.position.clone().setY(o.mesh.position.y + 1), [0xffc2e2, 0xffffff, 0x9fe3ff], 30, 4, 2);
          }
        } else {
          o.vy -= 18 * dt; o.mesh.position.y += o.vy * dt;
          const f = this.frameAt(o.dist); o.mesh.position.addScaledVector(f.s, o.vx * dt);
          o.mesh.rotation.x += dt * 6;
          if (o.mesh.position.y < -3) o.gone = true;
        }
      } else if (o.kind === 'station') {
        o.gate.gem.rotation.y += dt * 1.5;
        if (o.opening > 0 && o.opening < 1) { o.opening = Math.min(1, o.opening + dt * 1.1); o.gate.setOpen(THREE.MathUtils.smoothstep(o.opening, 0, 1)); }
        o.fairy.update(t, o.cheer);
      } else if (o.kind === 'castle') {
        if (o.open > 0 && o.open < 1) { o.open = Math.min(1, o.open + dt * 0.7); o.c.setOpen(THREE.MathUtils.smoothstep(o.open, 0, 1)); }
      }
      if (o.gone || (o.dist < this.dist - 25 && o.kind !== 'podium' && o.kind !== 'castle')) {
        this.scene.remove(o.mesh); o.dispose?.();
        this.objects.splice(i, 1);
      }
    }
  }

  updateCamera(dt, f) {
    const cam = this.camera;
    const rp = this.rig.root.position;
    const desired = new THREE.Vector3(), look = new THREE.Vector3();
    if (this.mode === 'showcase') {
      const a = this.t * 0.18;
      const fwd = f.t.clone(), side = f.s.clone();
      const center = rp.clone().addScaledVector(side, -0.6);
      desired.copy(center).addScaledVector(fwd, Math.cos(a) * 3 + 4.2).addScaledVector(side, Math.sin(a) * 4 - 1.5);
      desired.y = rp.y + 1.9;
      look.copy(center).setY(rp.y + 1.25);
    } else if (this.mode === 'podium') {
      // swing gently in front of the podium (never behind it, where the castle is)
      const gp = this.rig.girl.root.position;
      const pf = this.frameAt(this.castle.dist - 15);
      const a = Math.sin(this.podiumT * 0.4) * 1.0;
      desired.copy(gp).addScaledVector(pf.t, -Math.cos(a) * 7).addScaledVector(pf.s, Math.sin(a) * 7);
      desired.y = gp.y + 2.2;
      look.copy(gp).setY(gp.y + 1.2);
    } else if (this.phase === 'panel') {
      // look past the rider at the gate / castle
      const target = this.castle && this.stageIdx === 2 ? this.castle.dist : (this.station?.dist ?? this.dist + 7);
      const g = this.frameAt(target);
      desired.copy(rp).addScaledVector(f.t, -6).add(new THREE.Vector3(0, 3.4, 0)).addScaledVector(f.s, -this.offset * 0.5);
      look.copy(g.p).setY(g.p.y + (this.stageIdx === 2 ? 6 : 3.5));
    } else {
      const center = f.p.clone().addScaledVector(f.s, this.offset * 0.55);
      desired.copy(center).addScaledVector(f.t, -7.2); desired.y = f.p.y + 3.6;
      const ahead = this.frameAt(this.dist + 9);
      look.copy(ahead.p).addScaledVector(ahead.s, this.offset * 0.4); look.y = ahead.p.y + 1.2;
    }
    if (this.camPos.lengthSq() === 0) { this.camPos.copy(desired); this.camLook.copy(look); }
    const k = 1 - Math.exp(-dt * (this.mode === 'play' ? 5 : 2.5));
    this.camPos.lerp(desired, k); this.camLook.lerp(look, k);
    cam.position.copy(this.camPos); cam.lookAt(this.camLook);
  }

  destroy() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this._onVis);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
