// Arabic-Indic digits and spoken number words (used for voice feedback).
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const ar = (v) => String(v).replace(/[0-9]/g, (d) => AR_DIGITS[d]);

const ONES = ['صفر', 'واحد', 'اثنين', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
  'أحد عشر', 'اثني عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = { 20: 'عشرين', 30: 'ثلاثين', 40: 'أربعين', 50: 'خمسين', 60: 'ستين', 70: 'سبعين', 80: 'ثمانين', 90: 'تسعين' };

export function words(n) {
  if (n < 20) return ONES[n];
  if (n === 100) return 'مئة';
  const t = Math.floor(n / 10) * 10;
  const o = n % 10;
  return o ? `${ONES[o]} و${TENS[t]}` : TENS[t];
}

// "٣ مجموعات" style counted nouns for explanations (3..10 take plural, 1/2 special)
export function groupsPhrase(n) {
  if (n === 1) return 'مجموعة واحدة';
  if (n === 2) return 'مجموعتان';
  if (n <= 10) return `${words(n)} مجموعات`;
  return `${words(n)} مجموعة`;
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return ar(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
}
