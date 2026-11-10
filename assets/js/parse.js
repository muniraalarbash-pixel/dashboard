// Excel / CSV / pasted-table reader → {columns:[{name,type}], rows:[[...]]}
// Types: number | date | category | text. Dates are stored as "YYYY-MM-DD".

// rows kept per upload; above this the stored JSON gets too heavy for the share link
export const MAX_ROWS = 50000;
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
  // day/month/year by default; month/day/year when the middle part cannot be a month (12/25/2026)
  if (m) { let d = +m[1], mo = +m[2]; const y = +m[3]; if (mo > 12 && d <= 12) [d, mo] = [mo, d]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + '-' + pad(mo) + '-' + pad(d); }
  return null;
}
export function detect(name, vals) {
  const nn = vals.filter(v => v != null && String(v).trim() !== '');
  if (!nn.length) return 'text';
  const dates = nn.filter(v => v instanceof Date || (typeof v === 'string' && parseDateStr(v))).length;
  const nums = nn.filter(v => !(v instanceof Date) && toNum(v) !== null).length;
  const uniq = new Set(nn.map(v => v instanceof Date ? isoDate(v) : String(v).trim())).size;
  if (/^(ملاحظات|ملاحظة|الملاحظات|وصف|الوصف|تعليق|تعليقات|notes?|comments?|description|remarks?|الرابط|رابط|link|url|e-?mail|الإيميل|الايميل|البريد|البريد الإلكتروني)$/i.test(String(name).trim())) return 'text';
  if (dates / nn.length >= 0.7) return 'date';
  if (nums / nn.length >= 0.8) {
    if (/(^id$|\bid\b|رقم|كود|code|phone|mobile|جوال|هاتف)/i.test(name)) return 'text';
    if (/^(#|م|ت|no\.?|n°|s\.?n\.?|serial|seq|index|تسلسل|التسلسل|الرقم)$/i.test(String(name).trim())) return 'text';
    const ns = nn.map(toNum); if (ns.length >= 5 && ns.every((v, i) => v === ns[0] + i)) return 'text';
    if (/(year|سنة|عام)/i.test(name) && uniq <= 30) return 'category';
    if (/^((the[\s_-]*)?(month|week|quarter|day|wk|qtr)[\s_-]*(num(ber)?|no\.?|n|#|idx|index|of[\s_-]*year)?|(رقم[\s_-]*)?(ال)?(شهر|اسبوع|أسبوع|ربع|يوم))$/i.test(String(name).trim()) && nn.every(v => { const x = toNum(v); return Number.isInteger(x) && x >= 1 && x <= 53; })) return /(num|no\b|number|idx|index|_n$|order|ترتيب)/i.test(name) ? 'text' : 'category';
    return 'number';
  }
  const avgLen = nn.reduce((a, v) => a + String(v).length, 0) / nn.length;
  if (avgLen > 40) return 'text';
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
export function extractRaw(aoa, opts = {}) {
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
  const emptyCols = keep.filter(k => !k).length;
  // total rows (e.g. "الإجمالي") would double-count sums
  const isTotal = r => r.some(v => typeof v === 'string' && TOTAL_RE.test(v.trim()));
  const totalRows = body.filter(isTotal);
  const totalLabels = totalRows.map(r => String(r.find(v => typeof v === 'string' && TOTAL_RE.test(v.trim()))).trim());
  if (!opts.keepTotals) body = body.filter(r => !isTotal(r));
  // exact duplicate rows
  const seenRow = new Set(); let dups = 0;
  const dedup = [];
  for (const r of body) { const k = JSON.stringify(r.map(v => v instanceof Date ? v.getTime() : v)); if (seenRow.has(k)) { dups++; if (opts.dedupe) continue; } else seenRow.add(k); dedup.push(r); }
  body = dedup;
  const dropped = opts.keepTotals ? 0 : totalRows.length, truncated = body.length > MAX_ROWS;
  const totalRowsCount = body.length;
  if (truncated) body = body.slice(0, MAX_ROWS);
  if (!body.length) throw new Error('empty');
  return { headers, body, dropped, truncated, headerRow: h + 1, skippedTop: h, totalsFound: totalRows.length, totalLabels, dups, dedupe: !!opts.dedupe, keepTotals: !!opts.keepTotals, emptyCols, rowsBeforeCap: totalRowsCount };
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

// A link to live data: Google Sheets (shared "anyone with the link", or published to the web) or a direct CSV / Excel URL.
export function sourceUrl(u) {
  u = String(u || '').trim(); if (!/^https:\/\//i.test(u)) throw new Error('url');
  const g = u.match(/docs\.google\.com\/spreadsheets\/d\/(e\/)?([\w-]+)/);
  if (g) {
    // the Excel export keeps real dates, numbers and every sheet (CSV would follow the sheet's locale)
    if (g[1]) return `https://docs.google.com/spreadsheets/d/e/${g[2]}/pub?output=xlsx`;
    return `https://docs.google.com/spreadsheets/d/${g[2]}/export?format=xlsx`;
  }
  return u;
}
export async function openUrl(u) {
  const url = sourceUrl(u);
  let res; try { res = await fetch(url, { cache: 'no-store', credentials: 'omit' }); } catch (e) { throw new Error('fetch'); }
  if (!res.ok) throw new Error('http_' + res.status);
  const ct = res.headers.get('content-type') || '', buf = await res.arrayBuffer();
  const csv = /csv|text\/plain/i.test(ct) || (!/sheet|excel|octet/i.test(ct) && /\.csv(\?|$)/i.test(url));
  if (/text\/html/i.test(ct)) throw new Error('html'); // a sign-in page: the sheet is not shared publicly
  const name = csv ? 'source.csv' : 'source.xlsx';
  return openFile(new File([buf], name));
}

export function openPasted(text) {
  const sep = text.includes('\t') ? '\t' : ',';
  const aoa = text.replace(/\r/g, '').split('\n').filter(l => l.trim()).map(l => l.split(sep));
  return { name: 'بيانات ملصوقة', sheets: ['بيانات ملصوقة'], aoa: () => aoa };
}

// What the reader changed or noticed, for the owner to review (and undo).
export function cleanReport(raw, data) {
  const cols = data.columns, n = raw.body.length;
  const blanks = cols.map((c, i) => ({ i, name: c.name, miss: raw.body.filter(r => r[i] == null || String(r[i]).trim() === '').length })).filter(x => x.miss > 0).sort((a, b) => b.miss - a.miss);
  let textNums = 0;
  cols.forEach((c, i) => { if (c.type === 'number') raw.body.forEach(r => { if (typeof r[i] === 'string' && r[i].trim() !== '' && Number.isFinite(toNum(r[i]))) textNums++; }); });
  const asText = cols.map((c, i) => ({ i, name: c.name, type: c.type })).filter(x => x.type === 'text' && raw.body.filter(r => r[x.i] != null && r[x.i] !== '').length > 0 && raw.body.filter(r => r[x.i] != null && r[x.i] !== '' && Number.isFinite(toNum(r[x.i]))).length / raw.body.filter(r => r[x.i] != null && r[x.i] !== '').length >= 0.8);
  return { rows: n, blanks, textNums, asText };
}
