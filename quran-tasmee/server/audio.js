// Strict WAV check (16 kHz, mono, 16-bit PCM — the format Nabr documents) and simple
// measured audio-quality stats. These are measurements of the signal, not a grade.

export function parseWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44) throw new Error('not_wav');
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not_wav');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4), body = off + 8;
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    else if (id === 'data') { data = buf.subarray(body, Math.min(buf.length, body + size)); break; }
    off = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('not_wav');
  if (fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== 16000 || fmt.bits !== 16) throw new Error('wrong_format');
  const samples = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1)));
  return { rate: fmt.rate, samples };
}

export function measure({ rate, samples }) {
  const frame = Math.round(rate * 0.02);
  let voiced = 0, clipped = 0, peak = 0, sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    if (a >= 32700) clipped++;
    sum += samples[i] * samples[i];
  }
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let e = 0;
    for (let j = i; j < i + frame; j++) e += samples[j] * samples[j];
    const db = 20 * Math.log10(Math.sqrt(e / frame) / 32768 + 1e-9);
    if (db > -42) voiced++;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length)) / 32768;
  return {
    durationMs: Math.round((samples.length / rate) * 1000),
    voicedMs: voiced * 20,
    rmsDb: Math.round(20 * Math.log10(rms + 1e-9)),
    peakDb: Math.round(20 * Math.log10(peak / 32768 + 1e-9)),
    clippedRatio: +(clipped / Math.max(1, samples.length)).toFixed(4),
  };
}
