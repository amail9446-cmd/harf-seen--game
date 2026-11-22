// Sound effects + background music synthesised with WebAudio (no files to load),
// and Arabic text-to-speech through the browser's speechSynthesis.
export class Audio {
  constructor() {
    this.muted = false;
    this.musicOn = true;
    this.ctx = null;
    this.voice = null;
    this.hasArabicVoice = false;
    this.speechQueue = Promise.resolve();
    this.pickVoice();
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());
    }
  }

  pickVoice() {
    if (typeof speechSynthesis === 'undefined') return;
    const vs = speechSynthesis.getVoices();
    const arv = vs.filter((v) => /^ar/i.test(v.lang));
    const pref = ['ar-SA', 'ar-AE', 'ar-EG', 'ar-KW', 'ar-QA', 'ar'];
    arv.sort((a, b) => {
      const fa = /female|zariyah|hoda|salma|laila|mariam|amira|google/i.test(a.name) ? 0 : 1;
      const fb = /female|zariyah|hoda|salma|laila|mariam|amira|google/i.test(b.name) ? 0 : 1;
      const pa = pref.findIndex((p) => a.lang.startsWith(p));
      const pb = pref.findIndex((p) => b.lang.startsWith(p));
      return fa - fb || pa - pb;
    });
    this.voice = arv[0] || null;
    this.hasArabicVoice = !!this.voice;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.11;
      this.musicGain.connect(this.master);
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // iOS needs a first utterance inside a user gesture
    if (!this.primed && typeof speechSynthesis !== 'undefined') {
      this.primed = true;
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0; speechSynthesis.speak(u);
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
    if (m && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.11 : 0;
  }

  // ---------- speech ----------
  speak(text, { interrupt = true } = {}) {
    if (this.muted || typeof speechSynthesis === 'undefined' || !text) return Promise.resolve();
    if (interrupt) { speechSynthesis.cancel(); }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.voice?.lang || 'ar-SA';
      if (this.voice) u.voice = this.voice;
      u.rate = 0.88; u.pitch = 1.15;
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      u.onend = fin; u.onerror = fin;
      setTimeout(fin, 900 + text.length * 110);
      // small delay: Chrome drops an utterance spoken right after cancel()
      setTimeout(() => speechSynthesis.speak(u), interrupt ? 60 : 0);
    });
  }

  stopSpeech() { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); }

  // ---------- synth helpers ----------
  tone(freq, start, dur, type = 'sine', vol = 0.25, dest) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(start); o.stop(start + dur + 0.05);
    return o;
  }

  noise(start, dur, vol = 0.2, filterFreq = 1500) {
    const c = this.ctx; if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(start);
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'correct': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.08, 0.3, 'triangle', 0.22)); break;
      case 'wrong': this.tone(330, t, 0.25, 'sine', 0.18); this.tone(262, t + 0.18, 0.35, 'sine', 0.16); break;
      case 'star': this.tone(1319, t, 0.15, 'triangle', 0.15); this.tone(1760, t + 0.07, 0.25, 'triangle', 0.13); break;
      case 'gem': [880, 1109, 1319, 1760, 2217].forEach((f, i) => this.tone(f, t + i * 0.05, 0.4, 'sine', 0.12)); break;
      case 'tap': this.tone(660, t, 0.08, 'triangle', 0.12); break;
      case 'steer': this.tone(520, t, 0.06, 'sine', 0.06); break;
      case 'bump': this.tone(150, t, 0.2, 'sine', 0.3); this.tone(220, t + 0.1, 0.2, 'sine', 0.2); break;
      case 'gate': this.noise(t, 0.7, 0.18, 900); [392, 523, 659, 784].forEach((f, i) => this.tone(f, t + 0.1 + i * 0.1, 0.5, 'sine', 0.12)); break;
      case 'clap':
        for (let i = 0; i < 14; i++) this.noise(t + i * 0.09 + Math.random() * 0.04, 0.06, 0.35, 2200);
        break;
      case 'firework': this.noise(t, 0.5, 0.3, 600); this.tone(900 + Math.random() * 600, t + 0.05, 0.4, 'triangle', 0.06); break;
      case 'fanfare':
        [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.5], [784, 0.75], [1047, 0.9]].forEach(([f, d]) => {
          this.tone(f, t + d, 0.45, 'square', 0.07); this.tone(f / 2, t + d, 0.45, 'triangle', 0.1);
        });
        break;
      default: break;
    }
  }

  startMusic() {
    // gentle looping pentatonic melody with a soft bass
    const c = this.ctx;
    const melody = [784, 659, 587, 659, 784, 880, 784, 659, 587, 523, 587, 659, 523, 440, 523, 587];
    const bass = [262, 262, 196, 196, 220, 220, 175, 196];
    const beat = 0.32;
    let next = c.currentTime + 0.2, i = 0;
    const tick = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 1.2) {
        if (this.musicOn && !this.muted) {
          this.tone(melody[i % melody.length], next, beat * 0.9, 'triangle', 0.5, this.musicGain);
          if (i % 2 === 0) this.tone(bass[(i / 2) % bass.length] / 2, next, beat * 1.8, 'sine', 0.6, this.musicGain);
        }
        next += beat; i++;
      }
    };
    this.musicTimer = setInterval(tick, 300);
    tick();
  }
}
