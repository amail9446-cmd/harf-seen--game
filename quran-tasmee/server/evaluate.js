// Turns a Nabr offline grading result into the game's three-light verdict.
// Field names and codes follow https://qurani.ai/en/docs/2-advanced-tools/qrc/offline
// Nothing here invents a score: Nabr returns no confidence value, so none is produced.

export const CHAPTER = 103; // Surat Al-Asr, Hafs an Asim (Nabr's word numbering is the Hafs word-by-word edition)

// Words per ayah, in the order Nabr numbers them (1-based).
export const WORDS = {
  1: ['وَالْعَصْرِ'],
  2: ['إِنَّ', 'الْإِنسَانَ', 'لَفِي', 'خُسْرٍ'],
  3: ['إِلَّا', 'الَّذِينَ', 'آمَنُوا', 'وَعَمِلُوا', 'الصَّالِحَاتِ', 'وَتَوَاصَوْا', 'بِالْحَقِّ', 'وَتَوَاصَوْا', 'بِالصَّبْرِ'],
};

export const TAJWEED_CODES = {
  ghunna_extra: 'غنة زائدة', ghunna_missed: 'غنة ناقصة',
  qalqala_extra: 'قلقلة زائدة', qalqala_missed: 'قلقلة ناقصة',
  iqlab_missed: 'إقلاب ناقص', idgham_missed: 'إدغام ناقص',
  ikhfa_extra: 'إخفاء في غير موضعه', ikhfa_missed: 'إخفاء ناقص',
  tafkhem_extra: 'تفخيم في موضع ترقيق', tafkhem_missed: 'تفخيم ناقص',
  madd_extra: 'مد زائد', madd_missed_02: 'مد حركتين ناقص', madd_12_02: 'مد أطول من حركتين',
  madd_missed_12: 'مد طويل ناقص', madd_02_12: 'مد قصير بدل طويل',
};
export const PHONETIC_CODES = {
  letters_mismatch: 'إبدال حرف أو حركة (يشمل المخارج المتقاربة وطول الحركة)',
  letters_extra: 'إضافة حرف أو حركة', letters_missed: 'حذف حرف أو حركة',
  tadeef_extra: 'تشديد زائد', tadeef_missed: 'تشديد ناقص',
};

const EXIT = {
  0: 'السورة غير مدعومة', 1: 'الآية غير موجودة', 2: 'الكلمة غير موجودة',
  3: 'مستوى الحفظ غير مدعوم', 4: 'مستوى التجويد غير مدعوم', 5: 'مشكلة غير متوقعة في الخدمة',
  6: 'نجح الفحص', 7: 'لم يطابق الصوت السورة أو انتهت مهلة التعرف', 8: 'انتهت السورة',
};

export const DEFAULT_SETTINGS = {
  autoLights: false,                 // stays off until calibration passes
  aspects: { harakat: true, tajweed: true },
  tajweedCodes: Object.keys(TAJWEED_CODES),
  phoneticCodes: Object.keys(PHONETIC_CODES),
};

const wordText = (v, w) => (WORDS[v] && WORDS[v][w - 1]) || '';
const key = (v, w) => `${v}:${w}`;

export function expectedWords(from, to) {
  const out = [];
  for (let v = from; v <= to; v++) (WORDS[v] || []).forEach((_, i) => out.push({ verse: v, word: i + 1 }));
  return out;
}

/** quality: measured locally from the WAV, see audio.js. Returns null when audio is usable. */
export function qualityProblem(q) {
  if (!q) return null;
  if (q.durationMs < 700) return 'التسجيل قصير جدًا';
  if (q.voicedMs < 400) return 'لم يُسمع صوت واضح';
  if (q.clippedRatio > 0.02) return 'الصوت مرتفع جدًا ومشوّه';
  return null;
}

export function normalize(res, { from, to }, settings = DEFAULT_SETTINGS, quality = null) {
  const exp = expectedWords(from, to);
  const inRange = m => m && m.chapter === CHAPTER && m.verse >= from && m.verse <= to;
  const base = {
    light: 'neutral', reason: '', range: { from, to },
    aspects: {
      words: { status: 'unknown', issues: [] },
      harakat: { status: settings.aspects.harakat ? 'unknown' : 'off', issues: [] },
      tajweed: { status: settings.aspects.tajweed ? 'unknown' : 'off', issues: [] },
    },
    coverage: { expected: exp.length, confirmed: 0, skipped: 0, unaccounted: exp.length },
    service: null, quality,
    confidence: 'الخدمة لا تُرجع درجة ثقة رقمية؛ المعروض هو مؤشرات اكتمال النتيجة وجودة الصوت فقط.',
    wrongWords: [],
  };

  if (!res || typeof res !== 'object' || !Number.isInteger(res.exit_code)) {
    base.reason = 'استجابة غير مفهومة من خدمة التقييم';
    return base;
  }
  base.service = {
    exit_code: res.exit_code, exit_text: EXIT[res.exit_code] || 'رمز غير معروف',
    audio_duration_ms: res.audio_duration_ms ?? null,
  };
  if (res.exit_code !== 6 && res.exit_code !== 8) {
    base.reason = 'لم يكتمل الفحص: ' + base.service.exit_text;
    return base;
  }

  const list = a => (Array.isArray(a) ? a : []).filter(inRange);
  const confirmed = new Set(list(res.confirmed_words).map(m => key(m.verse, m.word)));
  const skipped = list(res.skipped_words);
  const subs = list(res.substituted_words);
  const subKeys = new Set(subs.map(m => key(m.verse, m.word)));

  const words = base.aspects.words;
  skipped.forEach(m => words.issues.push({ verse: m.verse, word: m.word, text: wordText(m.verse, m.word), kind: 'skipped', code: 'skipped_words', message: 'كلمة محذوفة أو لم تُطابق مكانها' }));
  subs.forEach(m => words.issues.push({ verse: m.verse, word: m.word, text: wordText(m.verse, m.word), kind: 'substituted', code: 'substituted_words', heard: m.speech_like || '', message: m.message || 'قُرئت كلمة أخرى مكانها' }));

  const mistake = (m, kind) => ({ verse: m.verse, word: m.word, text: wordText(m.verse, m.word), kind, code: m.error_code || null, letter: m.letter, speech_like: m.speech_like || '', message: m.message || '' });
  const counts = (codes, m) => !m.error_code || codes.includes(m.error_code); // an uncoded mistake is still a reported mistake
  if (settings.aspects.harakat) list(res.letter_mistakes).filter(m => !subKeys.has(key(m.verse, m.word)) && counts(settings.phoneticCodes, m)).forEach(m => base.aspects.harakat.issues.push(mistake(m, 'phonetic')));
  if (settings.aspects.tajweed) list(res.tajweed_mistakes).filter(m => !subKeys.has(key(m.verse, m.word)) && counts(settings.tajweedCodes, m)).forEach(m => base.aspects.tajweed.issues.push(mistake(m, 'tajweed')));

  const accounted = new Set([...confirmed, ...skipped.map(m => key(m.verse, m.word))]);
  const unaccounted = exp.filter(e => !accounted.has(key(e.verse, e.word)));
  base.coverage = { expected: exp.length, confirmed: exp.filter(e => confirmed.has(key(e.verse, e.word))).length, skipped: skipped.length, unaccounted: unaccounted.length };

  const errorAspects = ['words', 'harakat', 'tajweed'].filter(a => base.aspects[a].issues.length);
  const complete = unaccounted.length === 0;
  for (const a of ['words', 'harakat', 'tajweed']) {
    const A = base.aspects[a];
    if (A.status === 'off') continue;
    A.status = A.issues.length ? 'error' : complete ? 'ok' : 'unknown';
  }

  const bad = new Map();
  errorAspects.forEach(a => base.aspects[a].issues.forEach(i => bad.set(key(i.verse, i.word), { verse: i.verse, word: i.word, text: i.text })));
  base.wrongWords = [...bad.values()].sort((x, y) => x.verse - y.verse || x.word - y.word);

  if (errorAspects.length) { base.light = 'red'; base.reason = 'خطأ مؤكد أبلغت عنه الخدمة'; }
  else if (!complete) { base.light = 'neutral'; base.reason = `النتيجة ناقصة: ${unaccounted.length} من ${exp.length} كلمات لم تُسمع أو لم تُفحص`; }
  else { base.light = 'green'; base.reason = 'كل الكلمات مؤكدة ولا أخطاء في الجوانب المختارة'; }
  return base;
}
