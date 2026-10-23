// Data model, formatting, insights, targets vs actual, brand theming.

export const AR_M = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nfC = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export function fmt(n) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 100000) return nfC.format(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: a < 10 ? 2 : (a < 1000 ? 1 : 0) });
}
export const fmtPct = (p, d = 0) => (p == null || !isFinite(p)) ? '—' : p.toFixed(d) + '%';
export function pLabel(k) {
  if (/^\d{4}-\d{2}$/.test(k)) { const [y, mm] = k.split('-'); return AR_M[+mm - 1] + ' ' + y.slice(2); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(k)) { const [, mm, dd] = k.split('-'); return (+dd) + ' ' + AR_M[+mm - 1]; }
  return k;
}
let dtf;
try { dtf = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }); }
catch (e) { dtf = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }); }
export const fmtDate = s => { try { return dtf.format(new Date(s)); } catch (e) { return ''; } };

const MEAN_RE = /(rate|ratio|%|percent|avg|average|ctr|cpc|cpm|معدل|نسبة|متوسط)/i;

const MONTHS = [
  ['يناير','جانفي','كانون الثاني','jan','january','محرم'], ['فبراير','فيفري','شباط','feb','february'], ['مارس','آذار','mar','march'],
  ['أبريل','ابريل','إبريل','نيسان','apr','april'], ['مايو','ماي','أيار','may'], ['يونيو','جوان','حزيران','jun','june'],
  ['يوليو','جويلية','تموز','jul','july'], ['أغسطس','اغسطس','أوت','آب','aug','august'], ['سبتمبر','أيلول','sep','sept','september'],
  ['أكتوبر','اكتوبر','تشرين الأول','oct','october'], ['نوفمبر','تشرين الثاني','nov','november'], ['ديسمبر','كانون الأول','dec','december']
];
const MONTH_MAP = new Map(); MONTHS.forEach((names, i) => names.forEach(n => MONTH_MAP.set(n.toLowerCase(), i + 1)));
export function monthIndex(v) {
  if (v == null) return 0;
  const s = String(v).trim().toLowerCase();
  if (MONTH_MAP.has(s)) return MONTH_MAP.get(s);
  const n = Number(s.replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632));
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 0;
}
const YEAR_RE = /(year|سنة|السنة|عام|العام)/i, MONTH_RE = /(month|شهر|الشهر)/i;

export function createModel(data) {
  let cols = data.columns, rows = data.rows;
  const nums = [], cats = []; let date = -1;
  cols.forEach((c, i) => { if (c.type === 'date' && date < 0) date = i; });
  // No date column? Derive one from a month-name column (+ optional year column).
  let monthCol = -1, yearCol = -1;
  if (date < 0 && rows.length) {
    monthCol = cols.findIndex((c, i) => {
      if (c.type === 'number' && !MONTH_RE.test(c.name)) return false;
      const vals = rows.map(r => r[i]).filter(v => v != null && v !== '');
      return vals.length > 0 && vals.filter(v => monthIndex(v) > 0).length / vals.length >= 0.9;
    });
    if (monthCol >= 0) {
      yearCol = cols.findIndex((c, i) => i !== monthCol && YEAR_RE.test(c.name) && rows.every(r => r[i] == null || /^\d{4}$/.test(String(r[i]).trim())));
      const fallbackYear = new Date().getFullYear();
      cols = cols.concat([{ name: 'الفترة', type: 'date', virtual: true }]);
      rows = rows.map(r => { const mo = monthIndex(r[monthCol]); const y = yearCol >= 0 && r[yearCol] ? String(r[yearCol]).trim() : fallbackYear; return r.concat([mo ? `${y}-${String(mo).padStart(2, '0')}-01` : null]); });
      date = cols.length - 1;
    }
  }
  cols.forEach((c, i) => { if (c.type === 'number' && i !== monthCol) nums.push(i); else if (c.type === 'category' || (i === monthCol)) cats.push(i); });
  let monthly = false;
  if (date >= 0) { const ms = new Set(); for (const r of rows) { if (r[date]) ms.add(String(r[date]).slice(0, 7)); if (ms.size > 1) break; } monthly = ms.size > 1; }
  // Rank category columns for default "split by": 2–15 distinct values first, time-like columns last.
  const uniq = i => new Set(rows.map(r => r[i]).filter(v => v != null && v !== '')).size;
  const dims = cats.slice().sort((a, b) => {
    const score = i => { const u = uniq(i); let s = (u >= 2 && u <= 15) ? 0 : (u > 15 ? 2 : 4); if (i === monthCol || i === yearCol || YEAR_RE.test(cols[i].name) || /(quarter|ربع|الربع|week|أسبوع|اسبوع|day|يوم)/i.test(cols[i].name)) s += 3; return s; };
    return score(a) - score(b) || Math.min(uniq(b), 15) - Math.min(uniq(a), 15);
  });
  const m = {
    cols, rows, nums, cats, dims, date, monthly, monthCol, uniq,
    idx: name => cols.findIndex(c => c.name === name),
    isMean: mi => mi >= 0 && !!cols[mi] && MEAN_RE.test(cols[mi].name),
    label: mi => mi < 0 ? 'عدد السجلات' : cols[mi].name,
    agg(rs, mi) {
      if (mi < 0) return rs.length;
      let s = 0, c = 0; for (const r of rs) { const v = r[mi]; if (typeof v === 'number' && isFinite(v)) { s += v; c++; } }
      return m.isMean(mi) ? (c ? s / c : 0) : s;
    },
    groups(rs, keyFn) { const g = new Map(); for (const r of rs) { const k = keyFn(r); if (k == null || k === '') continue; let a = g.get(k); if (!a) g.set(k, a = []); a.push(r); } return g; },
    series(rs, mi) {
      if (date < 0) return [];
      const g = m.groups(rs, r => r[date] ? String(r[date]).slice(0, monthly ? 7 : 10) : null);
      return [...g.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, x]) => ({ k, v: m.agg(x, mi) }));
    },
    breakdown(rs, di, mi) {
      const g = m.groups(rs, r => r[di] == null ? null : String(r[di]));
      const out = [...g.entries()].map(([k, x]) => ({ k, v: m.agg(x, mi) }));
      return di === monthCol ? out.sort((a, b) => monthIndex(a.k) - monthIndex(b.k)) : out.sort((a, b) => b.v - a.v);
    },
    filter(f, q) {
      const fe = Object.entries(f).filter(([, v]) => v != null);
      q = (q || '').trim().toLowerCase();
      return rows.filter(r => {
        for (const [ci, v] of fe) if (String(r[ci] ?? '') !== v) return false;
        return q ? r.some(x => x != null && String(x).toLowerCase().includes(q)) : true;
      });
    }
  };
  return m;
}

export function computeTotals(data) {
  const m = createModel(data), o = {};
  m.nums.forEach(i => { o[m.cols[i].name] = m.agg(m.rows, i); });
  return o;
}

// ---------- Targets vs actual ----------
// cfg: {aKey, tKey, tVal, aVal} — column NAMES
export function guessTargetCfg(data, targets) {
  if (!targets) return null;
  const a = createModel(data), t = createModel(targets);
  const tCats = t.cats.length ? t.cats : t.cols.map((c, i) => i).filter(i => t.cols[i].type === 'text');
  let tKey = -1, aKey = -1;
  for (const ti of tCats) { const ai = a.idx(t.cols[ti].name); if (ai >= 0) { tKey = ti; aKey = ai; break; } }
  if (tKey < 0 && tCats.length && a.cats.length) { tKey = tCats[0]; aKey = a.cats[0]; }
  const tVal = t.nums[0] ?? -1;
  let aVal = -1;
  if (tVal >= 0) { const same = a.idx(t.cols[tVal].name); aVal = same >= 0 && a.cols[same].type === 'number' ? same : -1; }
  if (aVal < 0) aVal = a.nums.find(i => /(مبيعات|sales|فعلي|actual|إيراد|revenue)/i.test(a.cols[i].name)) ?? a.nums[0] ?? -1;
  if (tKey < 0 || aKey < 0 || tVal < 0 || aVal < 0) return null;
  return { aKey: a.cols[aKey].name, tKey: t.cols[tKey].name, tVal: t.cols[tVal].name, aVal: a.cols[aVal].name };
}

export function targetStats(m, rows, targets, cfg, filters) {
  if (!targets || !cfg) return null;
  const t = createModel(targets);
  const aKey = m.idx(cfg.aKey), aVal = m.idx(cfg.aVal), tKey = t.idx(cfg.tKey), tVal = t.idx(cfg.tVal);
  if (aKey < 0 || aVal < 0 || tKey < 0 || tVal < 0) return null;
  let trows = t.rows;
  const fk = filters && filters[aKey];
  if (fk != null) trows = trows.filter(r => String(r[tKey] ?? '') === fk);
  const tg = new Map(); for (const r of trows) { const k = r[tKey] == null ? null : String(r[tKey]); if (k == null) continue; tg.set(k, (tg.get(k) || 0) + (typeof r[tVal] === 'number' ? r[tVal] : 0)); }
  const ag = new Map(); for (const r of rows) { const k = r[aKey] == null ? null : String(r[aKey]); if (k == null) continue; ag.set(k, (ag.get(k) || 0) + (typeof r[aVal] === 'number' ? r[aVal] : 0)); }
  const keys = [...new Set([...tg.keys(), ...ag.keys()])];
  const items = keys.map(k => ({ k, actual: ag.get(k) || 0, target: tg.get(k) || 0 }))
    .map(x => ({ ...x, pct: x.target ? x.actual / x.target * 100 : null }))
    .sort((a, b) => b.actual - a.actual);
  const actual = items.reduce((s, x) => s + x.actual, 0), target = items.reduce((s, x) => s + x.target, 0);
  return { items, actual, target, pct: target ? actual / target * 100 : null, keyName: cfg.aKey, valName: cfg.aVal };
}

// ---------- Insights ----------
export function autoInsights(m, rows, metric, dim, tstats, max = 3) {
  const out = [], ml = m.label(metric), mean = m.isMean(metric);
  if (!rows.length) return [{ title: 'لا توجد نتائج', body: 'لا توجد صفوف تطابق الفلاتر الحالية.' }];
  if (tstats && tstats.pct != null) {
    const done = tstats.items.filter(x => x.pct != null && x.pct >= 100).length, withT = tstats.items.filter(x => x.target).length;
    out.push({ title: 'نسبة الإنجاز ' + fmtPct(tstats.pct, 1), body: `${done} من ${withT} حققوا المستهدف أو تجاوزوه.` });
    const low = tstats.items.filter(x => x.pct != null).sort((a, b) => a.pct - b.pct)[0];
    if (low && low.pct < 100) out.push({ title: 'الأبعد عن المستهدف: ' + low.k, body: `حقق ${fmtPct(low.pct)} من المستهدف (${fmt(low.actual)} من ${fmt(low.target)}).` });
  }
  if (dim >= 0) {
    const b = m.breakdown(rows, dim, metric), tot = b.reduce((s, x) => s + x.v, 0);
    if (b.length) {
      const t = b[0];
      out.push({ title: 'الأعلى: ' + t.k, body: mean ? `${ml}: ${fmt(t.v)}.` : `${fmt(t.v)} من ${ml}، أي ${tot ? (t.v / tot * 100).toFixed(0) : 0}% من الإجمالي.` });
      if (b.length >= 3) { const l = b[b.length - 1]; out.push({ title: 'الأقل: ' + l.k, body: `${fmt(l.v)}${!mean && tot ? `، أي ${(l.v / tot * 100).toFixed(1)}% من الإجمالي` : ''}.` }); }
    }
  }
  if (m.date >= 0) {
    const s = m.series(rows, metric);
    if (s.length >= 2) {
      const a = s[s.length - 1], p = s[s.length - 2];
      if (p.v) { const ch = (a.v - p.v) / Math.abs(p.v) * 100; out.push({ title: pLabel(a.k) + ' مقابل ' + pLabel(p.k), body: `${ch >= 0 ? 'ارتفاع' : 'انخفاض'} بنسبة ${Math.abs(ch).toFixed(1)}% في ${ml}.` }); }
      const best = s.reduce((x, y) => y.v > x.v ? y : x);
      out.push({ title: 'أفضل فترة', body: `${pLabel(best.k)} بقيمة ${fmt(best.v)}.` });
    }
  }
  if (!out.length) out.push({ title: 'الإجمالي', body: `${ml}: ${fmt(m.agg(rows, metric))} عبر ${rows.length} سجل.` });
  return out.slice(0, max);
}

// ---------- Brand ----------
export const FONTS = {
  'IBM Plex Sans Arabic': 'IBM+Plex+Sans+Arabic:wght@400;500;600;700',
  'Tajawal': 'Tajawal:wght@400;500;700',
  'Cairo': 'Cairo:wght@400;500;600;700',
  'Almarai': 'Almarai:wght@400;700',
  'Noto Kufi Arabic': 'Noto+Kufi+Arabic:wght@400;500;600;700',
  'Readex Pro': 'Readex+Pro:wght@400;500;600;700'
};
export const DEFAULT_BRAND = { primary: '#6C151E', secondary: '#0F3D3A', accent: '#D9B48F', font: 'IBM Plex Sans Arabic', logo_url: '' };

const hex2rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r, g, b) => '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
export function mix(a, b, t) { const x = hex2rgb(a), y = hex2rgb(b); if (!x || !y) return a; return rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
export function lum(h) { const c = hex2rgb(h); if (!c) return 1; const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
export function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
export const onColor = h => contrast(h, '#FFFFFF') >= 3 ? '#FFFFFF' : '#16212B';
export function alpha(h, a) { const c = hex2rgb(h); return c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : h; }

// Readable "ink" version of a brand color (for text on light backgrounds)
const inkOf = h => { let c = h; for (let i = 0; i < 6 && contrast(c, '#FFFFFF') < 4.5; i++) c = mix(c, '#000000', 0.18); return c; };

export function brandTheme(brand) {
  const b = { ...DEFAULT_BRAND, ...(brand || {}) };
  const primary = hex2rgb(b.primary) ? b.primary : DEFAULT_BRAND.primary;
  const secondary = hex2rgb(b.secondary) ? b.secondary : DEFAULT_BRAND.secondary;
  const accent = hex2rgb(b.accent) ? b.accent : DEFAULT_BRAND.accent;
  const palette = [primary, secondary, accent, mix(primary, '#FFFFFF', 0.45), mix(secondary, '#FFFFFF', 0.45), mix(accent, '#000000', 0.25), '#F2665C', '#8A6BC8'];
  return {
    font: FONTS[b.font] ? b.font : DEFAULT_BRAND.font,
    logo: b.logo_url || '',
    palette,
    vars: {
      '--d-primary': primary, '--d-secondary': secondary, '--d-accent': accent,
      '--d-ink-primary': inkOf(primary),
      '--d-on-primary': onColor(primary),
      '--d-bg': mix('#F4F6F8', primary, 0.04), '--d-surface': '#FFFFFF', '--d-surface-2': mix('#EEF1F4', primary, 0.06),
      '--d-ink': '#16212B', '--d-muted': '#5B6875', '--d-line': mix('#DDE3E9', primary, 0.08),
      '--d-good': '#1C7F54', '--d-bad': '#C0433B'
    }
  };
}

export function loadFont(name) {
  const fam = FONTS[name]; if (!fam) return;
  const id = 'font-' + name.replace(/\s+/g, '-');
  if (document.getElementById(id)) return;
  const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
  document.head.appendChild(l);
}

// Dominant colors from a logo image (HTMLImageElement) → ['#RRGGBB', ...]
export function extractColors(img, k = 4) {
  const S = 72, c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const r = Math.min(S / img.naturalWidth, S / img.naturalHeight) || 1;
  ctx.drawImage(img, 0, 0, img.naturalWidth * r, img.naturalHeight * r);
  const d = ctx.getImageData(0, 0, S, S).data, buckets = new Map(), neutral = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    const sat = mx ? (mx - mn) / mx : 0, key = ((R >> 4) << 8) | ((G >> 4) << 4) | (B >> 4);
    const tgt = (sat < 0.18 || mx < 30 || mn > 235) ? neutral : buckets;
    const e = tgt.get(key) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += R; e.g += G; e.b += B; tgt.set(key, e);
  }
  const pick = (map) => [...map.values()].sort((a, b) => b.n - a.n).map(e => rgb2hex(e.r / e.n, e.g / e.n, e.b / e.n));
  const out = [];
  const dist = (a, b) => { const x = hex2rgb(a), y = hex2rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  for (const h of pick(buckets)) { if (out.every(o => dist(o, h) > 70)) out.push(h); if (out.length >= k) break; }
  if (out.length < 2) for (const h of pick(neutral)) { const l = lum(h); if (l > 0.85) continue; if (out.every(o => dist(o, h) > 70)) out.push(h); if (out.length >= k) break; }
  return out;
}
