// Excel / CSV / pasted-table reader → {columns:[{name,type}], rows:[[...]]}
// Types: number | date | category | text. Dates are stored as "YYYY-MM-DD".

export const MAX_ROWS = 10000;
export const TYPES = { number: 'رقم', date: 'تاريخ', category: 'فئة', text: 'نص' };

const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const pad = n => String(n).padStart(2, '0');

let xlsxLoading = null;
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  if (!xlsxLoading) xlsxLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = XLSX_SRC; s.onload = res; s.onerror = () => { xlsxLoading = null; rej(new Error('xlsx_load')); };
    document.head.appendChild(s);
  });
  return xlsxLoading;
}

const normDigits = s => s
  .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632)
  .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776)
  .replace(/٫/g, '.');

export function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = normDigits(String(v)).replace(/[,\s٬]/g, '').replace(/(ر\.?س|ريال|sar|usd|\$|%)/gi, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s); return isFinite(n) ? n : null;
}
function isoDate(d) { const t = new Date(d.getTime() + 36e5); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
function parseDateStr(s) {
  s = normDigits(String(s)).trim();
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?/);
  if (m) { const y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 1; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + '-' + pad(mo) + '-' + pad(d); }
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
  if (m) { const d = +m[1], mo = +m[2], y = +m[3]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + '-' + pad(mo) + '-' + pad(d); }
  return null;
}
export function detect(name, vals) {
  const nn = vals.filter(v => v != null && String(v).trim() !== '');
  if (!nn.length) return 'text';
  const dates = nn.filter(v => v instanceof Date || (typeof v === 'string' && parseDateStr(v))).length;
  const nums = nn.filter(v => !(v instanceof Date) && toNum(v) !== null).length;
  const uniq = new Set(nn.map(v => v instanceof Date ? isoDate(v) : String(v).trim())).size;
  if (dates / nn.length >= 0.7) return 'date';
  if (nums / nn.length >= 0.8) {
    if (/(^id$|\bid\b|رقم|كود|code|phone|mobile|جوال|هاتف)/i.test(name)) return 'text';
    if (/(year|سنة|عام)/i.test(name) && uniq <= 30) return 'category';
    return 'number';
  }
  return (uniq <= 50 && (uniq <= nn.length * 0.6 || nn.length < 12)) ? 'category' : 'text';
}
function conv(v, t) {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
  if (t === 'number') { if (v instanceof Date) return null; return toNum(v); }
  if (t === 'date') {
    if (v instanceof Date) return isoDate(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    return parseDateStr(v);
  }
  if (v instanceof Date) return isoDate(v);
  return String(v).trim();
}

const TOTAL_RE = /^(المجموع|مجموع|المجموع الكلي|الإجمالي|الاجمالي|إجمالي|اجمالي|total|totals|grand total|sum)$/i;

// Raw table (array of arrays) → cleaned headers/body
export function extractRaw(aoa) {
  const filled = r => r.filter(v => v != null && String(v).trim() !== '').length;
  const h = aoa.findIndex(r => filled(r) >= 2);
  if (h < 0) throw new Error('empty');
  const width = Math.max(...aoa.slice(h).map(r => r.length));
  const seen = {}; let headers = [];
  for (let i = 0; i < width; i++) {
    let n = aoa[h][i];
    n = (n == null || String(n).trim() === '') ? 'عمود ' + (i + 1) : String(n instanceof Date ? isoDate(n) : n).trim();
    if (seen[n]) { seen[n]++; n = n + ' (' + seen[n] + ')'; } else seen[n] = 1;
    headers.push(n);
  }
  let body = aoa.slice(h + 1).filter(r => filled(r) > 0);
  const keep = headers.map((n, i) => !/^عمود \d+$/.test(n) || body.some(r => r[i] != null && String(r[i]).trim() !== ''));
  headers = headers.filter((_, i) => keep[i]);
  body = body.map(r => { const o = []; for (let i = 0; i < width; i++) if (keep[i]) o.push(r[i] ?? null); return o; });
  const before = body.length;
  body = body.filter(r => !r.some(v => typeof v === 'string' && TOTAL_RE.test(v.trim())));
  const dropped = before - body.length, truncated = body.length > MAX_ROWS;
  if (truncated) body = body.slice(0, MAX_ROWS);
  if (!body.length) throw new Error('empty');
  return { headers, body, dropped, truncated };
}

export function convert(raw, overrides = {}) {
  const columns = raw.headers.map((name, i) => ({ name, type: overrides[i] || detect(name, raw.body.map(r => r[i])) }));
  return { columns, rows: raw.body.map(r => columns.map((c, i) => conv(r[i], c.type))) };
}

// File → {sheets:[name], read(sheetName) → aoa}
export async function openFile(file) {
  await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = /\.csv$/i.test(file.name)
    ? XLSX.read(new TextDecoder('utf-8').decode(buf), { type: 'string', cellDates: true })
    : XLSX.read(buf, { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.filter(n => wb.Sheets[n] && wb.Sheets[n]['!ref']);
  if (!sheets.length) throw new Error('empty');
  return { name: file.name, sheets, aoa: s => XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: null, blankrows: false }) };
}

export function openPasted(text) {
  const sep = text.includes('\t') ? '\t' : ',';
  const aoa = text.replace(/\r/g, '').split('\n').filter(l => l.trim()).map(l => l.split(sep));
  return { name: 'بيانات ملصوقة', sheets: ['بيانات ملصوقة'], aoa: () => aoa };
}
