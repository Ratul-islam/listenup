/**
 * Writes the digits in Chinese text out as words ("2026年10月7日" → "二零二六年十月七日"),
 * which the on-device Kokoro can't do itself: its Chinese number rules would
 * also rewrite numbers in every other language.
 */

const DIGITS = '零一二三四五六七八九';
const SMALL_UNITS = ['', '十', '百', '千'];
const BIG_UNITS = ['', '万', '亿', '万亿'];

const digitByDigit = (digits: string) => [...digits].map((d) => DIGITS[Number(d)]).join('');

/** 0–9999 */
function section(n: number) {
  let out = '';
  let gap = false;
  for (let i = 3; i >= 0; i--) {
    const d = Math.floor(n / 10 ** i) % 10;
    if (d === 0) {
      if (out) gap = true;
      continue;
    }
    if (gap) out += '零';
    gap = false;
    out += DIGITS[d] + SMALL_UNITS[i];
  }
  return out;
}

/** A whole number as it's read aloud: 42 → 四十二, 10086 → 一万零八十六 */
function cardinal(digits: string) {
  const trimmed = digits.replace(/^0+(?=\d)/, '');
  // Too long to read as one number (IDs, card numbers): one digit at a time
  if (trimmed.length > 16) return digitByDigit(digits);
  const n = Number(trimmed);
  if (n === 0) return '零';

  const sections: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 10_000)) sections.push(rest % 10_000);
  let out = '';
  let gap = false;
  for (let k = sections.length - 1; k >= 0; k--) {
    const sec = sections[k];
    if (sec === 0) {
      if (out) gap = true;
      continue;
    }
    if (out && (gap || sec < 1000)) out += '零';
    gap = false;
    out += section(sec) + BIG_UNITS[k];
  }
  // 十二, not 一十二
  return out.startsWith('一十') ? out.slice(1) : out;
}

const decimal = (whole: string, fraction?: string) => cardinal(whole) + (fraction ? `点${digitByDigit(fraction)}` : '');

export function writeOutChineseNumbers(text: string) {
  return (
    text
      // 1,000,000 is one number
      .replace(/\d{1,3}(?:,\d{3})+(?!\d)/g, (n) => cardinal(n.replace(/,/g, '')))
      // Years are read digit by digit: 二零二六年
      .replace(/(\d{2,4})(?=\s*年)/g, (_, y: string) => digitByDigit(y))
      .replace(/(\d+)(?:\.(\d+))?\s*%/g, (_, w: string, f?: string) => `百分之${decimal(w, f)}`)
      // Phone numbers and other long codes (big amounts are written with commas): digit by digit
      .replace(/\d{7,}/g, (d) => digitByDigit(d))
      .replace(/(\d+)(?:\.(\d+))?/g, (_, w: string, f?: string) => decimal(w, f))
  );
}
