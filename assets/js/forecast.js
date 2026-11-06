// Simple, transparent forecasting for a monthly series. Several classic methods are back-tested on the
// last few known months; the most accurate one forecasts the next months with an ~80% range.
import { T } from './engine.js';

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

function linear(y, h) {
  const n = y.length, xs = y.map((_, i) => i), mx = mean(xs), my = mean(y);
  let num = 0, den = 0; xs.forEach((x, i) => { num += (x - mx) * (y[i] - my); den += (x - mx) ** 2; });
  const b = den ? num / den : 0, a = my - b * mx;
  return Array.from({ length: h }, (_, k) => a + b * (n + k));
}
function holt(y, h) {
  // double exponential smoothing; alpha/beta picked by one-step error on the training data
  let best = null;
  for (const al of [.2, .4, .6, .8]) for (const be of [.05, .15, .3]) {
    let l = y[0], t = y[1] - y[0], err = 0;
    for (let i = 1; i < y.length; i++) { const f = l + t; err += (y[i] - f) ** 2; const nl = al * y[i] + (1 - al) * (l + t); t = be * (nl - l) + (1 - be) * t; l = nl; }
    if (!best || err < best.err) best = { err, l, t };
  }
  return Array.from({ length: h }, (_, k) => best.l + best.t * (k + 1));
}
const METHODS = [
  { id: 'naive', name: () => T('آخر قيمة', 'Last value'), min: 2, f: (y, h) => Array(h).fill(y[y.length - 1]) },
  { id: 'ma3', name: () => T('متوسط آخر 3 أشهر', '3-month average'), min: 3, f: (y, h) => Array(h).fill(mean(y.slice(-3))) },
  { id: 'linear', name: () => T('خط الاتجاه', 'Linear trend'), min: 3, f: linear },
  { id: 'holt', name: () => T('التمهيد الأُسّي (Holt)', 'Exponential smoothing (Holt)'), min: 4, f: holt },
  { id: 'snaive', name: () => T('نفس الشهر من السنة الماضية', 'Same month last year'), min: 13, f: (y, h) => Array.from({ length: h }, (_, k) => y[y.length - 12 + (k % 12)]) }
];

const nextMonth = k => { let [y, mo] = k.split('-').map(Number); mo++; if (mo > 12) { mo = 1; y++; } return `${y}-${String(mo).padStart(2, '0')}`; };

// series: [{k:'YYYY-MM', v}] sorted. Returns null when there is not enough history.
export function forecast(series, h = 3) {
  const s = series.filter(p => /^\d{4}-\d{2}$/.test(p.k) && isFinite(p.v));
  if (s.length < 6) return null;
  const y = s.map(p => p.v), test = Math.min(3, Math.floor(y.length / 4)), train = y.slice(0, -test), actual = y.slice(-test);
  const nonNeg = y.every(v => v >= 0);
  const scored = METHODS.filter(md => train.length >= md.min && y.length >= md.min).map(md => {
    const p = md.f(train, test);
    const errs = actual.map((a, i) => a - p[i]);
    const mape = actual.every(a => a) ? mean(actual.map((a, i) => Math.abs(errs[i] / a))) * 100 : null;
    const rmse = Math.sqrt(mean(errs.map(e => e * e)));
    return { id: md.id, name: md.name(), mape, rmse, md };
  }).sort((a, b) => (a.mape ?? 1e9) - (b.mape ?? 1e9) || a.rmse - b.rmse);
  if (!scored.length) return null;
  const best = scored[0];
  const pts = best.md.f(y, h).map(v => nonNeg ? Math.max(0, v) : v);
  const keys = []; let k = s[s.length - 1].k; for (let i = 0; i < h; i++) { k = nextMonth(k); keys.push(k); }
  const z = 1.28; // ~80% range
  const band = pts.map((v, i) => { const w = z * best.rmse * Math.sqrt(i + 1); return [nonNeg ? Math.max(0, v - w) : v - w, v + w]; });
  return { keys, pts, band, best, ranking: scored, test, accuracy: best.mape == null ? null : Math.max(0, 100 - best.mape) };
}
