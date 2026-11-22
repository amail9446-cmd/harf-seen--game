// Question engine for the 9 times table ONLY (9×1 … 9×10).
// Adaptive: unseen facts first, then weak facts; every mistake is re-asked a
// couple of questions later, in a different form when possible.
import { ar, words, groupsPhrase } from './arabic.js';

export const FACTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const DIFFS = {
  beginner: { id: 'beginner', label: 'مبتدئة', emoji: '🌱', speed: 7.5, maxSpeed: 9.5, think: 7.5, s1: 6, s3: 5, obstacleRate: 0.45, reverse: false, twoStep: false },
  advanced: { id: 'advanced', label: 'متقدمة', emoji: '🌸', speed: 9, maxSpeed: 12, think: 6.5, s1: 8, s3: 6, obstacleRate: 0.7, reverse: true, twoStep: true },
  hero: { id: 'hero', label: 'بطلة', emoji: '👑', speed: 10.5, maxSpeed: 14, think: 5.5, s1: 10, s3: 8, obstacleRate: 0.9, reverse: true, twoStep: true },
};

const shuffle = (a) => {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

export function emptyStats() {
  const s = {};
  FACTS.forEach((n) => { s[n] = { c: 0, w: 0, streak: 0, seen: 0 }; });
  return s;
}

export class Learner {
  constructor(saved) {
    this.stats = saved?.stats ? JSON.parse(JSON.stringify(saved.stats)) : emptyStats();
    FACTS.forEach((n) => { if (!this.stats[n]) this.stats[n] = { c: 0, w: 0, streak: 0, seen: 0 }; });
    this.retry = saved?.retry ? saved.retry.slice() : [];
    this.q = saved?.q || 0;
    this.recent = [];
    this.lastCorrectIdx = [];
  }

  toJSON() { return { stats: this.stats, retry: this.retry, q: this.q }; }

  pickFact() {
    this.q++;
    const last = this.recent[this.recent.length - 1];
    const due = this.retry.findIndex((r) => r.due <= this.q && r.n !== last);
    let n;
    if (due >= 0) {
      n = this.retry[due].n;
      this.retry.splice(due, 1);
    } else {
      const pool = FACTS.filter((f) => !this.recent.slice(-3).includes(f));
      const weights = pool.map((f) => {
        const s = this.stats[f];
        if (s.seen === 0) return 6;            // cover every fact
        return Math.max(0.4, 1 + 2.5 * s.w - 0.6 * Math.min(s.c, 3) + (s.streak === 0 ? 1 : 0));
      });
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      n = pool[pool.length - 1];
      for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { n = pool[i]; break; } }
    }
    this.recent.push(n);
    if (this.recent.length > 4) this.recent.shift();
    return n;
  }

  record(n, ok) {
    const s = this.stats[n];
    s.seen++;
    if (ok) { s.c++; s.streak++; } else {
      s.w++; s.streak = 0;
      if (!this.retry.some((r) => r.n === n)) this.retry.push({ n, due: this.q + 2 });
    }
  }

  isMastered(n) { const s = this.stats[n]; return s.c > 0 && s.streak > 0 && s.c > s.w; }
  mastered() { return FACTS.filter((n) => this.isMastered(n)); }
  needsPractice() { return FACTS.filter((n) => !this.isMastered(n)); }

  // keep the correct answer from landing in the same slot 3 times in a row
  arrange(correct, distractors) {
    let opts, idx;
    for (let tries = 0; tries < 8; tries++) {
      opts = shuffle([correct, ...distractors]);
      idx = opts.indexOf(correct);
      const l = this.lastCorrectIdx;
      if (!(l.length >= 2 && l[l.length - 1] === idx && l[l.length - 2] === idx)) break;
    }
    this.lastCorrectIdx.push(idx);
    if (this.lastCorrectIdx.length > 4) this.lastCorrectIdx.shift();
    return { opts, idx };
  }

  // kind: 'product'  → ٩ × ٣ = ؟   options are numbers
  //       'reverse'  → which gate equals ٥٤ ?  options are "٩ × n"
  makeQuestion(kind = 'product') {
    const n = this.pickFact();
    const answer = 9 * n;
    if (kind === 'reverse') {
      const near = shuffle(FACTS.filter((f) => f !== n && Math.abs(f - n) <= 2));
      const others = shuffle(FACTS.filter((f) => f !== n && !near.includes(f)));
      const dn = [...near, ...others].slice(0, 2);
      const { opts, idx } = this.arrange(n, dn);
      return {
        n, answer, kind,
        text: `أيّ بوابة ناتجها ${ar(answer)}؟`,
        speech: `أيّ بوابة ناتجها ${words(answer)}؟`,
        options: opts.map((f) => ({ value: f, label: `${ar(9)} × ${ar(f)}`, speech: `تسعة في ${words(f)}` })),
        correctIndex: idx,
      };
    }
    const cands = [9 * (n - 1), 9 * (n + 1), answer + 1, answer - 1, answer + 10, answer - 10,
      Number(String(answer).split('').reverse().join('')), 9 * (n + 2), 9 * (n - 2), answer + 2];
    const uniq = [];
    cands.forEach((c) => { if (c > 0 && c <= 100 && c !== answer && !uniq.includes(c)) uniq.push(c); });
    // one table neighbour + one "near miss", both random
    const neighbours = shuffle(uniq.filter((c) => c % 9 === 0));
    const misses = shuffle(uniq.filter((c) => c % 9 !== 0));
    const dn = shuffle([neighbours[0] ?? misses[1], misses[0] ?? neighbours[1]]);
    const { opts, idx } = this.arrange(answer, dn);
    return {
      n, answer, kind,
      text: `${ar(9)} × ${ar(n)} = ؟`,
      speech: `تسعة في ${words(n)} يساوي كم؟`,
      options: opts.map((v) => ({ value: v, label: ar(v), speech: words(v) })),
      correctIndex: idx,
    };
  }

  makeWordProblem(twoStep) {
    // facts 2..9 keep the picture readable; prefer weak ones
    let n;
    for (let i = 0; i < 6; i++) { n = this.pickFact(); if (n >= 2 && n <= 9) break; }
    if (n < 2) n = 3; if (n > 9) n = 8;
    const names = ['سارة', 'ليان', 'جود', 'مريم', 'هيا', 'نورة'];
    const name = names[Math.floor(Math.random() * names.length)];
    const themes = [
      { box: 'صناديق', one: 'صندوق', acc: 'صندوقًا آخر فيه', item: 'نجوم', itemOne: 'نجمة', icon: '⭐', q: 'فكم نجمة' },
      { box: 'سلال', one: 'سلة', acc: 'سلةً أخرى فيها', item: 'زهرات', itemOne: 'زهرة', icon: '🌸', q: 'فكم زهرة' },
      { box: 'علب', one: 'علبة', acc: 'علبةً أخرى فيها', item: 'أقلام ملونة', itemOne: 'قلمًا', icon: '🖍️', q: 'فكم قلمًا' },
    ];
    const t = themes[Math.floor(Math.random() * themes.length)];
    let total = n, base = n, text, speech;
    if (twoStep && n >= 4) {
      base = n - 1;
      text = `مع ${name} ${ar(base)} ${t.box}، في كل ${t.one} ${ar(9)} ${t.item}، ثم أهدتها معلمتها ${t.acc} ${ar(9)} ${t.item}. ${t.q} معها الآن؟`;
      speech = `مع ${name} ${words(base)} ${t.box}، في كل ${t.one} تسعة ${t.item}، ثم أهدتها معلمتها ${t.acc} تسعة ${t.item}. ${t.q} معها الآن؟`;
    } else {
      base = n;
      text = `مع ${name} ${ar(n)} ${t.box}، في كل ${t.one} ${ar(9)} ${t.item}، ${t.q} معها؟`;
      speech = `مع ${name} ${words(n)} ${t.box}، في كل ${t.one} تسعة ${t.item}، ${t.q} معها؟`;
    }
    const answer = 9 * total;
    const dn = shuffle([9 * (total - 1), 9 * (total + 1)].filter((v) => v > 0)).slice(0, 2);
    const { opts, idx } = this.arrange(answer, dn);
    return {
      n: total, answer, kind: 'word', text, speech, icon: t.icon, groups: total, newGroups: total - base,
      options: opts.map((v) => ({ value: v, label: ar(v), speech: words(v) })),
      correctIndex: idx,
    };
  }
}

export function sayCorrect(n) { return `تسعة في ${words(n)} يساوي ${words(9 * n)}`; }
export function explain(n) {
  return `${groupsPhrase(n)}، في كل مجموعة تسعة، المجموع ${words(9 * n)}. إذن تسعة في ${words(n)} يساوي ${words(9 * n)}`;
}
export function hintSpeech(n) {
  return `فكّري معي: ${groupsPhrase(n)}، في كل مجموعة تسعة. عدّي المجموعات تسعة تسعة.`;
}
