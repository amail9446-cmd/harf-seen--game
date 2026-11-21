// Plumbing test with a local MOCK in place of Nabr: checks the key stays server-side,
// the one-time clip link works and is deleted, and the calibration gate. Not a grading test.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const port = 20000 + Math.floor(Math.random() * 20000);
const calls = [];
let reply = null;
const mock = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  const body = JSON.parse(b);
  const clip = await fetch(body.audio_url);
  const bytes = Buffer.from(await clip.arrayBuffer());
  calls.push({ key: req.headers['x-api-key'], body, clipStatus: clip.status, riff: bytes.toString('ascii', 0, 4) });
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(reply));
});
await new Promise(r => mock.listen(0, r));

process.env.NABR_API_URL = `http://127.0.0.1:${mock.address().port}/gw/qrc/offline`;
process.env.NABR_API_KEY = 'test-key-123';
process.env.PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;
process.env.TEACHER_PIN = 'pin-123456';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-'));
const { server } = await import('../server/server.js');
await new Promise(r => server.listen(port, r));
const base = `http://127.0.0.1:${port}`;

function wav(seconds, amp = 8000) {
  const n = 16000 * seconds, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(amp * Math.sin(i / 8)), 44 + i * 2);
  return buf;
}
const ok1 = { exit_code: 6, audio_duration_ms: 2000, confirmed_words: [{ chapter: 103, verse: 1, word: 1 }], skipped_words: [], substituted_words: [], tajweed_mistakes: [], letter_mistakes: [] };
const bad1 = { ...ok1, letter_mistakes: [{ chapter: 103, verse: 1, word: 1, letter: 2, speech_like: '', message: 'x', error_code: 'letters_mismatch' }] };
const T = { 'X-Teacher-Pin': 'pin-123456' };

test.after(() => { server.close(); mock.close(); });

test('page never contains the key; config does not leak it', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.ok(!html.includes('test-key-123'));
  const cfg = await (await fetch(base + '/api/config')).text();
  assert.ok(!cfg.includes('test-key-123'));
});

test('evaluate: key sent server-side, clip fetched once then gone', async () => {
  reply = ok1;
  const r = await (await fetch(base + '/api/evaluate?from=1&to=1', { method: 'POST', body: wav(2) })).json();
  assert.equal(r.light, 'green');
  assert.equal(r.autoLights, false);
  const c = calls.at(-1);
  assert.equal(c.key, 'test-key-123'); assert.equal(c.clipStatus, 200); assert.equal(c.riff, 'RIFF');
  assert.equal(c.body.chapter_index, 103); assert.equal(c.body.tajweed_level, 1);
  assert.equal((await fetch(c.body.audio_url)).status, 404);
});

test('silent recording is neutral and not sent to the service', async () => {
  const n = calls.length;
  const r = await (await fetch(base + '/api/evaluate?from=1&to=1', { method: 'POST', body: wav(2, 0) })).json();
  assert.equal(r.light, 'neutral'); assert.equal(calls.length, n);
});

test('wrong format rejected', async () => {
  assert.equal((await fetch(base + '/api/evaluate?from=1&to=1', { method: 'POST', body: Buffer.from('hello world, not audio at all........................') })).status, 415);
});

test('teacher api needs the pin', async () => {
  assert.equal((await fetch(base + '/api/teacher/state')).status, 401);
  assert.equal((await fetch(base + '/api/teacher/state', { headers: T })).status, 200);
});

test('auto lights cannot be enabled before real labelled samples pass', async () => {
  const on = () => fetch(base + '/api/teacher/settings', { method: 'POST', headers: { ...T, 'Content-Type': 'application/json' }, body: JSON.stringify({ autoLights: true }) });
  assert.equal((await on()).status, 409);
  reply = ok1;
  await fetch(base + '/api/teacher/sample?from=1&to=1&expected=correct', { method: 'POST', headers: T, body: wav(2) });
  assert.equal((await on()).status, 409);
  reply = bad1;
  const s = await (await fetch(base + '/api/teacher/sample?from=1&to=1&expected=wrong', { method: 'POST', headers: T, body: wav(2) })).json();
  assert.equal(s.entry.light, 'red'); assert.equal(s.gate.passed, true);
  assert.equal((await on()).status, 200);
  const r = await (await fetch(base + '/api/evaluate?from=1&to=1', { method: 'POST', body: wav(2) })).json();
  assert.equal(r.autoLights, true);
});

test('no audio written to the data dir', () => {
  const files = fs.readdirSync(process.env.DATA_DIR);
  assert.deepEqual(files.sort(), ['calibration.json', 'settings.json']);
  assert.ok(!fs.readFileSync(path.join(process.env.DATA_DIR, 'calibration.json'), 'utf8').includes('RIFF'));
});
