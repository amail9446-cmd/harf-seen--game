// Backend for the Surat Al-Asr game.
// - Keeps the Nabr API key on the server (never sent to the browser).
// - Receives the child's WAV, holds it in memory only, exposes it to Nabr through a
//   one-time unguessable link (Nabr's offline endpoint downloads audio from a URL),
//   and deletes it as soon as grading returns.
// - Writes no audio to disk and logs no audio.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, qualityProblem, DEFAULT_SETTINGS, TAJWEED_CODES, PHONETIC_CODES, WORDS, CHAPTER } from './evaluate.js';
import { parseWav, measure } from './audio.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(ROOT, '../public');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = +process.env.PORT || 8787;
const NABR_URL = process.env.NABR_API_URL || 'https://api.qurani.ai/gw/qrc/offline';
const NABR_KEY = process.env.NABR_API_KEY || '';
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const PIN = process.env.TEACHER_PIN || '';
const REF_AUDIO = process.env.REFERENCE_AUDIO_BASE || 'https://everyayah.com/data/Alafasy_128kbps/';
const MAX_WAV = 3 * 1024 * 1024; // ~95 s at 16 kHz mono 16-bit

if (!NABR_KEY) console.warn('[warn] NABR_API_KEY is not set: every evaluation will come back neutral (service unavailable).');
if (!PUBLIC_BASE) console.warn('[warn] PUBLIC_BASE_URL is not set: Nabr cannot download recordings, child evaluations will be neutral.');
if (!PIN || PIN.length < 6) console.warn('[warn] TEACHER_PIN missing or shorter than 6 characters: the teacher panel is locked.');

/* ---------- small JSON store (settings + calibration results, never audio) ---------- */
fs.mkdirSync(DATA, { recursive: true });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { const p = path.join(DATA, f); fs.writeFileSync(p + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(p + '.tmp', p); };
let settings = { ...DEFAULT_SETTINGS, ...readJson('settings.json', {}) };
settings.aspects = { ...DEFAULT_SETTINGS.aspects, ...(settings.aspects || {}) };
let calib = readJson('calibration.json', []);
const recent = []; // last evaluations, memory only, no audio, no names

function gate() {
  const t = calib.filter(c => c.source === 'teacher');
  const okGreen = t.filter(c => c.expected === 'correct' && c.light === 'green').length;
  const wrongRed = t.filter(c => c.expected === 'wrong' && c.light === 'red').length;
  const falseRed = t.filter(c => c.expected === 'correct' && c.light === 'red').length;
  const missed = t.filter(c => c.expected === 'wrong' && c.light === 'green').length;
  return { okGreen, wrongRed, falseRed, missed, passed: okGreen >= 1 && wrongRed >= 1,
    rule: 'يلزم تسجيل حقيقي واحد على الأقل صحيح أعطى أخضر، وتسجيل واحد على الأقل خاطئ أعطى أحمر' };
}
if (settings.autoLights && !gate().passed) settings.autoLights = false;

/* ---------- one-time audio links for Nabr ---------- */
const clips = new Map();
function shareClip(buf) {
  const token = crypto.randomBytes(24).toString('hex');
  clips.set(token, { buf, left: 3, timer: setTimeout(() => clips.delete(token), 180_000) });
  return token;
}
function dropClip(token) { const c = clips.get(token); if (c) { clearTimeout(c.timer); c.buf.fill(0); clips.delete(token); } }

/* ---------- Nabr call ---------- */
async function callNabr(audioUrl, from, to) {
  if (!NABR_KEY) return { ok: false, kind: 'config', message: 'مفتاح الخدمة غير مضبوط على الخادم' };
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 180_000);
  const started = Date.now();
  try {
    const r = await fetch(NABR_URL, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': NABR_KEY, 'Accept-Language': 'ar' },
      body: JSON.stringify({ audio_url: audioUrl, chapter_index: CHAPTER, start_verse_index: from, end_verse_index: to, hafz_level: 1, tajweed_level: 1 }),
    });
    const text = await r.text();
    let body = null; try { body = JSON.parse(text); } catch {}
    const ms = Date.now() - started;
    if (!r.ok) {
      const code = body?.detail?.code || body?.message || `http_${r.status}`;
      return { ok: false, kind: 'http', status: r.status, code: String(code).slice(0, 120), ms };
    }
    return { ok: true, body, ms };
  } catch (e) {
    return { ok: false, kind: e.name === 'AbortError' ? 'timeout' : 'network', message: String(e.message || e).slice(0, 200), ms: Date.now() - started };
  } finally { clearTimeout(t); }
}
const HTTP_TEXT = { 400: 'المفتاح غير صالح أو تعذّر تنزيل الصوت', 401: 'انتهت صلاحية المفتاح', 402: 'انتهى الاشتراك أو الرصيد', 422: 'طلب غير صالح', 502: 'تعذّر الوصول إلى المُقيّم', 503: 'الخدمة مشغولة الآن' };

function serviceDown(range, call, quality) {
  const r = normalize(null, range, settings, quality);
  r.reason = 'الخدمة غير متاحة: ' + (call.kind === 'http' ? (HTTP_TEXT[call.status] || 'خطأ ' + call.status) + ` (${call.code})` : call.kind === 'timeout' ? 'انتهت المهلة' : call.message || call.kind);
  r.serviceError = { kind: call.kind, status: call.status || null, code: call.code || null };
  return r;
}

async function gradeWav(buf, from, to) {
  let wav; try { wav = parseWav(buf); } catch (e) { return { status: 415, body: { error: e.message } }; }
  const quality = measure(wav);
  const range = { from, to };
  const qp = qualityProblem(quality);
  if (qp) { const r = normalize(null, range, settings, quality); r.reason = 'الصوت غير واضح: ' + qp; r.unclear = true; return { status: 200, body: r }; }
  if (!PUBLIC_BASE) return { status: 200, body: serviceDown(range, { kind: 'config', message: 'PUBLIC_BASE_URL غير مضبوط' }, quality) };
  const token = shareClip(buf);
  try {
    const call = await callNabr(`${PUBLIC_BASE}/clip/${token}.wav`, from, to);
    if (!call.ok) return { status: 200, body: serviceDown(range, call, quality) };
    const r = normalize(call.body, range, settings, quality);
    r.service.processing_ms = call.ms;
    if (r.light === 'green' && r.service.audio_duration_ms != null && r.service.audio_duration_ms < quality.durationMs * 0.5) {
      r.light = 'neutral'; r.reason = 'الخدمة فكّت جزءًا فقط من التسجيل';
    }
    return { status: 200, body: r };
  } finally { dropClip(token); }
}

/* ---------- http helpers ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob: data: https://everyayah.com; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('too_large'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}
const hits = new Map();
function limited(ip, bucket, max, windowMs) {
  const k = bucket + ip, now = Date.now(), h = (hits.get(k) || []).filter(t => now - t < windowMs);
  h.push(now); hits.set(k, h); return h.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (!h.some(t => now - t < 600_000)) hits.delete(k); }, 600_000).unref();
function teacherOk(req) {
  if (!PIN || PIN.length < 6) return false;
  const got = Buffer.from(String(req.headers['x-teacher-pin'] || '')), want = Buffer.from(PIN);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
function rangeOf(q) {
  const from = +q.get('from'), to = +q.get('to');
  return Number.isInteger(from) && Number.isInteger(to) && WORDS[from] && WORDS[to] && from <= to ? { from, to } : null;
}
function remember(kind, r, extra = {}) {
  recent.unshift({ at: new Date().toISOString(), kind, ...extra, result: r });
  recent.length = Math.min(recent.length, 50);
}
const publicSettings = () => ({ autoLights: settings.autoLights, aspects: settings.aspects, serviceConfigured: !!(NABR_KEY && PUBLIC_BASE) });

/* ---------- routes ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.socket.remoteAddress || '';
  try {
    // Nabr fetches the child's clip here. One-time, short-lived, unguessable.
    let m = url.pathname.match(/^\/clip\/([a-f0-9]{48})\.wav$/);
    if (m && (req.method === 'GET' || req.method === 'HEAD')) {
      const c = clips.get(m[1]);
      if (!c || c.left <= 0) return send(res, 404, { error: 'gone' });
      if (req.method === 'GET') c.left--;
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': c.buf.length, 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex' });
      return res.end(req.method === 'HEAD' ? undefined : c.buf);
    }

    if (url.pathname === '/api/config' && req.method === 'GET') return send(res, 200, publicSettings());

    if (url.pathname === '/api/evaluate' && req.method === 'POST') {
      if (limited(ip, 'ev', 30, 60_000)) return send(res, 429, { error: 'rate_limited' });
      const range = rangeOf(url.searchParams); if (!range) return send(res, 400, { error: 'bad_range' });
      const buf = await readBody(req, MAX_WAV);
      const out = await gradeWav(buf, range.from, range.to);
      if (out.status === 200) {
        remember('child', out.body, { step: String(url.searchParams.get('step') || '').slice(0, 40) });
        out.body.autoLights = settings.autoLights;
      }
      return send(res, out.status, out.body);
    }

    if (url.pathname.startsWith('/api/teacher/')) {
      if (limited(ip, 'pin', 60, 60_000)) return send(res, 429, { error: 'rate_limited' });
      if (!teacherOk(req)) return send(res, 401, { error: 'pin' });
      const op = url.pathname.slice('/api/teacher/'.length);

      if (op === 'state' && req.method === 'GET')
        return send(res, 200, { settings, gate: gate(), calibration: calib.slice(-60).reverse(), recent, codes: { tajweed: TAJWEED_CODES, phonetic: PHONETIC_CODES }, words: WORDS, config: { nabrKey: !!NABR_KEY, publicBaseUrl: PUBLIC_BASE || null, endpoint: NABR_URL } });

      if (op === 'settings' && req.method === 'POST') {
        const b = JSON.parse((await readBody(req, 20_000)).toString('utf8') || '{}');
        if (b.aspects) settings.aspects = { harakat: !!b.aspects.harakat, tajweed: !!b.aspects.tajweed };
        if (Array.isArray(b.tajweedCodes)) settings.tajweedCodes = b.tajweedCodes.filter(c => c in TAJWEED_CODES);
        if (Array.isArray(b.phoneticCodes)) settings.phoneticCodes = b.phoneticCodes.filter(c => c in PHONETIC_CODES);
        if (typeof b.autoLights === 'boolean') {
          if (b.autoLights && !gate().passed) return send(res, 409, { error: 'calibration_required', gate: gate() });
          settings.autoLights = b.autoLights;
        }
        writeJson('settings.json', settings);
        return send(res, 200, { settings, gate: gate() });
      }

      // A real recording by the teacher or a child, labelled correct/wrong, graded for real.
      if (op === 'sample' && req.method === 'POST') {
        const range = rangeOf(url.searchParams); if (!range) return send(res, 400, { error: 'bad_range' });
        const expected = url.searchParams.get('expected');
        if (!['correct', 'wrong'].includes(expected)) return send(res, 400, { error: 'bad_label' });
        const out = await gradeWav(await readBody(req, MAX_WAV), range.from, range.to);
        if (out.status !== 200) return send(res, out.status, out.body);
        const entry = { at: new Date().toISOString(), source: 'teacher', expected, range, light: out.body.light, reason: out.body.reason, note: String(url.searchParams.get('note') || '').slice(0, 80), result: out.body };
        if (!out.body.serviceError && !out.body.unclear) { calib.push(entry); calib = calib.slice(-200); writeJson('calibration.json', calib); }
        remember('sample', out.body, { expected });
        return send(res, 200, { entry, gate: gate() });
      }

      // The sheikh's own recordings (correct) and deliberately mismatched ones (wrong).
      if (op === 'reference' && req.method === 'POST') {
        const cases = [
          { name: 'الآية ١ بصوت الشيخ', file: '103001.mp3', from: 1, to: 1, expected: 'correct' },
          { name: 'الآية ٢ بصوت الشيخ', file: '103002.mp3', from: 2, to: 2, expected: 'correct' },
          { name: 'الآية ٣ بصوت الشيخ', file: '103003.mp3', from: 3, to: 3, expected: 'correct' },
          { name: 'صوت الآية ٢ مقيَّم على أنه الآية ٣', file: '103002.mp3', from: 3, to: 3, expected: 'wrong' },
          { name: 'صوت الآية ١ مقيَّم على أنه الآيتان ١–٢', file: '103001.mp3', from: 1, to: 2, expected: 'wrong' },
        ];
        const results = [];
        for (const c of cases) {
          const call = await callNabr(REF_AUDIO + c.file, c.from, c.to);
          const r = call.ok ? normalize(call.body, c, settings) : serviceDown(c, call, null);
          if (call.ok) r.service.processing_ms = call.ms;
          const entry = { at: new Date().toISOString(), source: 'reference', name: c.name, expected: c.expected, range: { from: c.from, to: c.to }, light: r.light, reason: r.reason, result: r };
          results.push(entry);
          if (call.ok) calib.push(entry);
        }
        calib = calib.slice(-200); writeJson('calibration.json', calib);
        return send(res, 200, { results, gate: gate() });
      }

      if (op === 'calibration' && req.method === 'DELETE') {
        calib = []; writeJson('calibration.json', calib); settings.autoLights = false; writeJson('settings.json', settings);
        return send(res, 200, { gate: gate(), settings });
      }
      return send(res, 404, { error: 'not_found' });
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
      const file = path.resolve(PUBLIC, '.' + p);
      if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'forbidden' });
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) return send(res, 404, { error: 'not_found' });
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': p.startsWith('/aud/') ? 'public, max-age=86400' : 'no-cache', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()' });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).pipe(res);
      });
      return;
    }
    send(res, 404, { error: 'not_found' });
  } catch (e) {
    send(res, e.status || 500, { error: e.status === 413 ? 'too_large' : 'server_error' });
    if (!e.status) console.error('[error]', e.message);
  }
});

export { server, gradeWav, settings };
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, () => console.log(`Al-Asr tasmee server on http://localhost:${PORT}  (teacher panel: /teacher.html)`));
