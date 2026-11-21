// Unit tests for the verdict rules. The payloads below are hand-written in the documented
// Nabr response shape to exercise each rule; they are NOT real grading results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, expectedWords, DEFAULT_SETTINGS, qualityProblem } from '../server/evaluate.js';

const cw = (v, w) => ({ chapter: 103, verse: v, word: w });
const all = (from, to) => expectedWords(from, to).map(e => cw(e.verse, e.word));
const res = o => ({ exit_code: 6, audio_duration_ms: 4000, chapter_index: 103, verse_index: 2, word_index: 4, confirmed_words: [], skipped_words: [], substituted_words: [], tajweed_mistakes: [], letter_mistakes: [], ...o });

test('word counts follow the Hafs word-by-word edition', () => {
  assert.equal(expectedWords(1, 1).length, 1);
  assert.equal(expectedWords(2, 2).length, 4);
  assert.equal(expectedWords(3, 3).length, 9);
  assert.equal(expectedWords(1, 3).length, 14);
});

test('green only when every word is confirmed and nothing is flagged', () => {
  const r = normalize(res({ confirmed_words: all(2, 2) }), { from: 2, to: 2 });
  assert.equal(r.light, 'green');
  assert.deepEqual(Object.values(r.aspects).map(a => a.status), ['ok', 'ok', 'ok']);
});

test('missing words with no reported mistake is neutral, never green', () => {
  const r = normalize(res({ confirmed_words: all(2, 2).slice(0, 2) }), { from: 2, to: 2 });
  assert.equal(r.light, 'neutral');
  assert.equal(r.coverage.unaccounted, 2);
  assert.equal(r.aspects.tajweed.status, 'unknown');
});

test('an empty successful response is neutral', () => {
  assert.equal(normalize(res({}), { from: 1, to: 1 }).light, 'neutral');
});

test('skipped word is red and names the word', () => {
  const r = normalize(res({ confirmed_words: [cw(2, 1), cw(2, 3), cw(2, 4)], skipped_words: [cw(2, 2)] }), { from: 2, to: 2 });
  assert.equal(r.light, 'red');
  assert.equal(r.aspects.words.status, 'error');
  assert.deepEqual(r.wrongWords.map(w => w.text), ['الْإِنسَانَ']);
});

test('substituted word is red even though it is also confirmed', () => {
  const r = normalize(res({ confirmed_words: all(2, 2), substituted_words: [{ ...cw(2, 4), said: null, speech_like: 'خسر', message: 'x' }] }), { from: 2, to: 2 });
  assert.equal(r.light, 'red');
  assert.equal(r.wrongWords[0].text, 'خُسْرٍ');
});

test('letter mistake is red on the harakat aspect, ignored when that aspect is off', () => {
  const lm = [{ ...cw(1, 1), letter: 3, speech_like: 'وَالْعَصْرِ', message: 'm', error_code: 'letters_mismatch' }];
  const on = normalize(res({ confirmed_words: all(1, 1), letter_mistakes: lm }), { from: 1, to: 1 });
  assert.equal(on.light, 'red'); assert.equal(on.aspects.harakat.status, 'error');
  const off = normalize(res({ confirmed_words: all(1, 1), letter_mistakes: lm }), { from: 1, to: 1 }, { ...DEFAULT_SETTINGS, aspects: { harakat: false, tajweed: true } });
  assert.equal(off.light, 'green'); assert.equal(off.aspects.harakat.status, 'off');
});

test('tajweed code the teacher did not select is not counted', () => {
  const tm = [{ ...cw(3, 9), letter: 2, speech_like: '', message: 'q', error_code: 'qalqala_missed' }];
  const s = { ...DEFAULT_SETTINGS, tajweedCodes: DEFAULT_SETTINGS.tajweedCodes.filter(c => c !== 'qalqala_missed') };
  assert.equal(normalize(res({ confirmed_words: all(3, 3), tajweed_mistakes: tm }), { from: 3, to: 3 }, s).light, 'green');
  assert.equal(normalize(res({ confirmed_words: all(3, 3), tajweed_mistakes: tm }), { from: 3, to: 3 }).light, 'red');
});

test('mistakes outside the requested range are ignored', () => {
  const r = normalize(res({ confirmed_words: all(1, 1), skipped_words: [cw(2, 1)] }), { from: 1, to: 1 });
  assert.equal(r.light, 'green');
});

test('failed check (exit 7), bad codes and garbage are neutral', () => {
  assert.equal(normalize(res({ exit_code: 7 }), { from: 1, to: 1 }).light, 'neutral');
  assert.equal(normalize(res({ exit_code: 5 }), { from: 1, to: 1 }).light, 'neutral');
  assert.equal(normalize(null, { from: 1, to: 1 }).light, 'neutral');
  assert.equal(normalize({ ok: true }, { from: 1, to: 1 }).light, 'neutral');
});

test('no invented confidence number', () => {
  const r = normalize(res({ confirmed_words: all(1, 1) }), { from: 1, to: 1 });
  assert.equal(typeof r.confidence, 'string');
  assert.ok(!/\d/.test(r.confidence));
});

test('quality gate', () => {
  assert.ok(qualityProblem({ durationMs: 300, voicedMs: 200, clippedRatio: 0 }));
  assert.ok(qualityProblem({ durationMs: 3000, voicedMs: 100, clippedRatio: 0 }));
  assert.equal(qualityProblem({ durationMs: 3000, voicedMs: 1500, clippedRatio: 0 }), null);
});
