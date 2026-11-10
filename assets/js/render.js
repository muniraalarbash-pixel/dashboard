// Dashboard renderer: three templates sharing one interactive model.
import { findGeoCol, coordOf, regionOf, saudiOnly, loadLeaflet } from './geo.js';
import { buildSQL } from './sql.js';
import { openSqlEditor } from './sqleditor.js';
import { forecast } from './forecast.js';
import { askQuestions } from './ask.js';
import { setFmt, fmtBase, createModel, autoInsights, targetStats, brandTheme, loadFont, mix, fmt, fmtPct, pLabel, fmtDate, esc, alpha, onColor, T, isEn } from './engine.js';

export const TEMPLATES = {
  tiles: { name: 'مربعات تحليلية', en: 'Analytical tiles', desc: 'شبكة مربعات بأرقام كبيرة ونسب تغير ورسوم صغيرة' },
  executive: { name: 'تقرير تنفيذي', en: 'Executive report', desc: 'شريط بهوية الجهة ومؤشرات ورسم اتجاه كبير' },
  compact: { name: 'ملخص للجوال', en: 'Mobile summary', desc: 'عمود واحد مرتب يناسب الشاشات الصغيرة' }
};

// chart type per slot; the owner can override in project.config.viz
const VIZ_DEFAULT = {
  tiles: { breakdown: 'bar', share: 'doughnut', trend: 'area', kpi: 'gauge', forecast: 'on' },
  executive: { breakdown: 'hbar', share: 'doughnut', trend: 'area', kpi: 'bar', forecast: 'on' },
  compact: { breakdown: 'hbar', share: 'doughnut', trend: 'area', kpi: 'bar', forecast: 'on' }
};
export const vizDefault = (tpl, slot) => (VIZ_DEFAULT[tpl] || VIZ_DEFAULT.tiles)[slot];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const anim = () => reduceMotion ? false : { duration: 350 };

const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const o = chart.options.plugins.valueLabels; if (!o || !o.mode) return;
    const ctx = chart.ctx; ctx.save();
    ctx.font = '600 11px ' + (o.font || 'system-ui'); ctx.textAlign = 'center';
    chart.data.datasets.forEach((ds, di) => {
      const mt = chart.getDatasetMeta(di); if (mt.hidden) return;
      const tot = ds.data.reduce((s, x) => s + (x || 0), 0);
      mt.data.forEach((el, i) => {
        const v = ds.data[i]; if (!v) return;
        const bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor;
        if (o.mode === 'top') { if (el.width < 20 || ctx.measureText(fmt(v)).width > el.width + 10) return; // no overlapping labels on narrow bars
          ctx.fillStyle = o.color; ctx.textBaseline = 'bottom'; ctx.fillText(fmt(v), el.x, el.y - 3); }
        else if (o.mode === 'inside') { const h = Math.abs(el.base - el.y); if (h < 16 || el.width < 26) return; ctx.fillStyle = onColor(bg); ctx.textBaseline = 'middle'; ctx.fillText(fmt(v), el.x, (el.y + el.base) / 2); }
        else if (o.mode === 'end') { ctx.fillStyle = o.color; ctx.textBaseline = 'middle'; ctx.textAlign = isEn() ? 'left' : 'right'; ctx.fillText(fmt(v), el.x + (isEn() ? 6 : -6), el.y); ctx.textAlign = 'center'; }
        else if (o.mode === 'pct') { const p = v / tot * 100; if (p < 5) return; const pos = el.tooltipPosition(); ctx.fillStyle = onColor(bg); ctx.textBaseline = 'middle'; ctx.fillText(p.toFixed(0) + '%', pos.x, pos.y); }
      });
    });
    ctx.restore();
  }
};
const OTHER = () => T('أخرى', 'Other');
const wrapLabel = s => { s = String(s); if (s.length > 24) s = s.slice(0, 22).trim() + '…'; if (s.length <= 10) return s; const w = s.split(' '); if (w.length < 2) return s; const h = Math.ceil(w.length / 2); return [w.slice(0, h).join(' '), w.slice(h).join(' ')]; };
const head = (t, s) => `<div class="d-th"><h3>${esc(t)}</h3>${s ? `<p>${esc(s)}</p>` : ''}</div>`;

function spark(vals) {
  if (vals.length < 2) return '';
  const w = 120, h = 30, mn = Math.min(...vals), mx = Math.max(...vals), r = (mx - mn) || 1;
  const pts = vals.map((v, i) => [i / (vals.length - 1) * (w - 4) + 2, h - 3 - ((v - mn) / r) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const l = pts[pts.length - 1];
  return `<svg class="d-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path class="a" d="${d} L${l[0].toFixed(1)} ${h} L2 ${h} Z"/><path class="l" d="${d}"/><circle cx="${l[0].toFixed(1)}" cy="${l[1].toFixed(1)}" r="2.5"/></svg>`;
}

export function mountDashboard(root, opts) {
  const charts = {}, maps = [];
  let geo = -1, saudi = false;
  const st = { view: 'overview', ask: null, filters: {}, region: null, mapMode: null, metric: null, dim: null, search: '', sortCol: null, sortDir: -1, page: 0 };
  let o = opts, m, theme;
  // SQL behind each chart (key -> spec), rebuilt on every render
  let sqlReg = {};
  const sqlSet = (key, spec) => { sqlReg[key] = spec; };
  function sqlText(key) { const spec = sqlReg[key]; return spec ? sqlFor(spec) : ''; }
  function sqlFor(spec) {
    const f = { ...st.filters }; if (st.range) f.__range = { ...st.range, len: pLen() }; if (st.region && geo >= 0 && f[geo] == null) f[geo] = regionVals(); if (spec.exclude != null) delete f[spec.exclude];
    const tc = o.project.config && o.project.config.target;
    return buildSQL(m, spec, f, tc);
  }
  function addSqlButtons() {
    Object.keys(sqlReg).forEach(key => {
      const el = key === 'map' ? root.querySelector('[data-map]') : root.querySelector(`[data-cv="${key}"]`);
      const card = el && el.closest('article'); const th = card && card.querySelector('.d-th');
      if (!th || th.querySelector('.d-sqlbtn') || !sqlText(key)) return;
      th.insertAdjacentHTML('beforeend', `<button type="button" class="d-sqlbtn no-export" data-sql="${key}" title="${T('افتح استعلام هذا الرسم في محرر SQL', 'Open this chart\'s query in the SQL editor')}" aria-label="${T('استعلام SQL', 'SQL query')}"><span dir="ltr">{ } SQL</span></button>`);
    });
  }
  let tModel = null, tModelFor = null;
  function openSql(key, given, gtitle) {
    const txt = given || (key ? sqlText(key) : ''); if (key && !txt) return;
    if (o.version && o.version.targets && tModelFor !== o.version) { tModel = createModel(o.version.targets); tModelFor = o.version; }
    const cs = getComputedStyle(root.querySelector('.dash') || root), vars = {};
    ['--d-surface', '--d-surface-2', '--d-ink', '--d-muted', '--d-line', '--d-primary', '--d-on-primary', '--d-font'].forEach(v => { vars[v] = cs.getPropertyValue(v); });
    openSqlEditor({ m, tm: o.version && o.version.targets ? tModel : null, sql: txt, title: gtitle || (key ? T('استعلام SQL لهذا الرسم', 'SQL for this chart') : T('محرر SQL', 'SQL editor')), vars, dir: isEn() ? 'ltr' : 'rtl' });
  }
  root.addEventListener('click', e => {
    const mm = e.target.closest('[data-mapmode]'); if (mm && root.contains(mm)) { st.mapMode = mm.dataset.mapmode; if (st.mapMode === 'cities') st.region = null; renderData(); return; }
    const aq = e.target.closest('[data-ask]'); if (aq && root.contains(aq)) { st.ask = aq.dataset.ask; renderAsk(); return; }
    const as = e.target.closest('[data-asksql]'); if (as && root.contains(as) && lastAnswer) { openSql('', lastAnswer.sql, lastAnswer.q); return; }
    const rg = e.target.closest('[data-rg]'); if (rg && root.contains(rg) && !rg.classList.contains('nodata')) { st.region = st.region === rg.dataset.rg ? null : rg.dataset.rg; st.page = 0; renderData(); }
  });
  root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-rg]')) { e.preventDefault(); e.target.closest('[data-rg]').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  root.addEventListener('click', e => { const b = e.target.closest('[data-sql]'); if (b && root.contains(b)) openSql(b.dataset.sql); else if (e.target.closest('[data-sqled]')) openSql(''); });

  function kill(k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } }
  function draw(k, cfg) { kill(k); const cv = root.querySelector('[data-cv="' + k + '"]'); if (cv && window.Chart) charts[k] = new Chart(cv, cfg); }

  function setup() {
    m = o.version ? createModel(o.version.data, (({ agg, measures, fmt }) => ({ agg, measures, fmt }))((o.project && o.project.config) || {})) : null;
    geo = m ? findGeoCol(m) : -1;
    saudi = geo >= 0 && saudiOnly(m, geo);
    theme = brandTheme(o.project.brand);
    loadFont(theme.font);
    st.view = 'overview'; st.filters = {}; st.range = null; st.openMs = null; st.region = null; st.metric = null; st.dim = null; st.page = 0; st.sortCol = null;
  }
  // owner-chosen defaults are stored by column name so they survive new uploads
  const dflt = k => o.project.config && o.project.config.defaults && o.project.config.defaults[k];
  const colIdx = name => { if (!name) return null; if (name === '__count') return -1; if (name === '__none') return -2; const i = m.cols.findIndex(c => c.name === name); return i >= 0 ? i : null; };
  function metricIdx() {
    if (st.metric != null && (st.metric === -1 || m.nums.includes(st.metric))) return st.metric;
    const d = colIdx(dflt('metric')); if (d === -1 || (d != null && m.nums.includes(d))) return d;
    // no owner choice: prefer the outcome column (revenue / sales) over the first number
    const pref = m.nums.find(i => /(إيراد|الإيراد|ايراد|مبيعات|المبيعات|revenue|sales)/i.test(m.cols[i].name));
    return pref != null ? pref : m.nums.length ? m.nums[0] : -1;
  }
  function dimIdx() {
    if (st.dim != null && m.cats.includes(st.dim)) return st.dim;
    const d = colIdx(dflt('dim')); if (d != null && m.cats.includes(d)) return d;
    return m.dims.length ? m.dims[0] : -1;
  }
  function sdIdx(dim) {
    const d = colIdx(dflt('sd')); if (d === -2) return -1;
    if (d != null && d !== dim && m.cats.includes(d)) return d;
    return m.dims.find(c => c !== dim && c !== m.monthCol && m.uniq(c) >= 2) ?? -1;
  }
  function pieIdx(dim, sd) { const d = colIdx(dflt('pie')); if (d != null && m.cats.includes(d)) return d; return sd >= 0 ? sd : dim; }
  const vz = slot => { const v = o.project.config && o.project.config.viz && o.project.config.viz[slot]; return v || vizDefault(TEMPLATES[o.project.template] ? o.project.template : 'tiles', slot); };
  const activeF = () => Object.entries(st.filters).filter(([, v]) => v != null).concat(st.region ? [['region', st.region]] : []).concat(st.range ? [['range', st.range]] : []);
  // a filter value is one string or an array of strings (multi-select)
  const isSel = (s, k) => s != null && (Array.isArray(s) ? s.includes(k) : s === k);
  const isOn = (s, k) => s == null || isSel(s, k);
  function togF(ci, k) {
    const cur = st.filters[ci];
    if (Array.isArray(cur)) { const a = cur.includes(k) ? cur.filter(x => x !== k) : cur.concat([k]); if (!a.length) delete st.filters[ci]; else st.filters[ci] = a.length === 1 ? a[0] : a; }
    else if (cur === k) delete st.filters[ci]; else st.filters[ci] = k;
    st.page = 0; renderData();
  }
  // date range (from/to period keys, YYYY-MM or YYYY-MM-DD)
  const pLen = () => m.monthly ? 7 : 10;
  const rangeRows = rs => { if (!st.range || m.date < 0) return rs; const { from, to } = st.range, L = pLen(); return rs.filter(r => { const k = r[m.date] ? String(r[m.date]).slice(0, L) : null; return k && (!from || k >= from) && (!to || k <= to); }); };
  const periodKeys = () => m.date < 0 ? [] : [...new Set(m.rows.map(r => r[m.date] ? String(r[m.date]).slice(0, pLen()) : null).filter(Boolean))].sort();
  // optional region filter (clicking a region on the map); applied on top of the column filters
  const regionRows = rs => st.region && geo >= 0 ? rs.filter(r => regionOf(r[geo]) === st.region) : rs;
  const regionVals = () => [...new Set(m.rows.map(r => r[geo]).filter(v => v != null && regionOf(v) === st.region).map(String))];

  function chartBase(ink, grid) {
    window.Chart.defaults.font.family = `'${theme.font}', system-ui, sans-serif`;
    window.Chart.defaults.color = ink;
    return { grid };
  }
  const tip = () => ({ rtl: !isEn(), textDirection: isEn() ? 'ltr' : 'rtl', callbacks: { label: c => ' ' + (c.dataset.label ? c.dataset.label + ': ' : '') + fmt(typeof c.parsed === 'number' ? c.parsed : (c.chart.options.indexAxis === 'y' ? c.parsed.x : c.parsed.y)) } });

  // ---------- frame ----------
  function frame() {
    const p = o.project, tpl = TEMPLATES[p.template] ? p.template : 'tiles';
    const style = Object.entries(theme.vars).map(([k, v]) => `${k}:${v}`).join(';') + `;--d-font:'${theme.font}',system-ui,sans-serif`;
    const v = o.version;
    root.innerHTML = `<div class="dash t-${tpl}" dir="${isEn() ? 'ltr' : 'rtl'}" style="${esc(style)}">
      <header class="d-head"><div class="d-head-in">
        ${theme.logo ? `<span class="d-logo"><img src="${esc(theme.logo)}" alt=""></span>` : ''}
        <div class="d-titles">${p.topic ? `<p class="d-topic">${esc(p.topic)}</p>` : ''}<h2 class="d-title">${esc(p.title || T('بدون عنوان', 'Untitled'))}</h2>${p.description ? `<p class="d-desc">${esc(p.description)}</p>` : ''}</div>
        <div class="d-meta">${p.restricted ? `<span class="d-chip d-restr" title="${T('هذا الرابط يعرض جزء من البيانات فقط', 'This link shows only part of the data')}">🔒 ${esc(p.restricted.label || (p.restricted.col + ': ' + (p.restricted.vals || []).join('، ')))}</span>` : ''}${v && v.truncated ? `<span class="d-chip d-restr" title="${T('المصدر أكبر من الحد المسموح', 'The source is larger than the allowed limit')}">⚠️ ${T(`أول ${v.row_count.toLocaleString('en-US')} من ${v.truncated.toLocaleString('en-US')} صف`, `First ${v.row_count.toLocaleString('en-US')} of ${v.truncated.toLocaleString('en-US')} rows`)}</span>` : ''}${(v && v.period) || p.period ? `<span class="d-chip">${esc((v && v.period) || p.period)}</span>` : ''}${v ? `<span class="d-upd ${v.live ? 'live' : ''}"><i></i>${v.live ? T('مباشر من المصدر', 'Live from source') + ' · ' + esc(new Date(v.created_at).toLocaleTimeString(isEn() ? 'en-GB' : 'ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })) : T('آخر تحديث', 'Updated') + ' ' + esc(fmtDate(v.created_at))}</span>` : ''}</div>
      </div></header>
      ${m ? `<div class="d-layout" data-layout><nav class="d-pages no-export" data-pages aria-label="${T('صفحات اللوحة', 'Dashboard pages')}" hidden></nav><div class="d-main">
      <div class="d-bms no-export" data-bms hidden></div><div class="d-bar" data-bar></div><div class="d-body" data-body></div>
      <section class="d-card d-tablecard" data-tablecard><div class="d-tablehead">${head(T('البيانات', 'Data'), '')}<span class="d-count" data-count></span><input type="search" class="d-search" data-search placeholder="${T('بحث في الجدول', 'Search table')}" aria-label="${T('بحث في الجدول', 'Search table')}"></div>
        <div class="d-scroll"><table class="d-table"><thead data-thead></thead><tbody data-tbody></tbody></table></div><div class="d-pager" data-pager></div></section></div></div>`
      : `<div class="d-empty"><p>${T('لا توجد بيانات بعد.', 'No data yet.')}</p><p class="d-muted">${T('ارفع ملف Excel من صفحة المشروع لتظهر لوحة المؤشرات هنا.', 'Upload an Excel file from the project page to see the dashboard here.')}</p></div>`}
      <footer class="d-foot">${T('صُنع بـ <strong>لوحة المؤشرات</strong>', 'Made with <strong>Dashboard</strong>')}</footer>
    </div>`;
    if (!m) return;
    const q = s => root.querySelector(s);
    q('[data-bar]').addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.k === 'metric') st.metric = +t.value;
      else if (t.dataset.k === 'dim') st.dim = +t.value;
      else if (t.dataset.msv != null) { const ci = t.dataset.msv, a = [...q(`[data-ms="${ci}"]`).querySelectorAll('input[data-msv]:checked')].map(x => x.value);
        if (!a.length) delete st.filters[ci]; else st.filters[ci] = a.length === 1 ? a[0] : a; st.openMs = ci; st.page = 0; }
      else if (t.dataset.r) { const r = { ...(st.range || {}) }; r[t.dataset.r] = t.value || null; if (r.from && r.to && r.from > r.to) [r.from, r.to] = [r.to, r.from]; st.range = r.from || r.to ? r : null; st.page = 0; }
      else if (t.dataset.mss != null) return;
      renderData();
    });
    q('[data-bar]').addEventListener('input', e => { const t = e.target; if (t.dataset.mss == null) return; const v = t.value.trim().toLowerCase();
      t.closest('.d-msp').querySelectorAll('.d-msl label').forEach(l => { l.hidden = !!v && !l.textContent.toLowerCase().includes(v); }); });
    q('[data-bar]').addEventListener('toggle', e => { const d = e.target; if (!d.classList || !d.classList.contains('d-ms')) return;
      if (d.open) { st.openMs = d.dataset.ms; root.querySelectorAll('.d-ms[open]').forEach(x => { if (x !== d) x.open = false; }); const s = d.querySelector('[data-mss]'); if (s) s.focus(); }
      else if (String(st.openMs) === d.dataset.ms) st.openMs = null; }, true);
    document.addEventListener('click', e => { if (!root.isConnected) return; const op = root.querySelector('.d-ms[open]'); if (op && !op.contains(e.target)) { op.open = false; st.openMs = null; } });
    root.addEventListener('keydown', e => { if (e.key === 'Escape') { const op = root.querySelector('.d-ms[open]'); if (op) { op.open = false; st.openMs = null; op.querySelector('summary').focus(); } } });
    q('[data-bar]').addEventListener('click', e => { if (e.target.closest('[data-clear]')) { st.filters = {}; st.range = null; st.openMs = null; st.region = null; st.page = 0; renderData(); return; }
      const all = e.target.closest('[data-msall]'); if (all) { delete st.filters[all.dataset.msall]; st.openMs = all.dataset.msall; st.page = 0; renderData(); } });
    const pick = e => { const k = e.target.closest('[data-mi]'); if (!k) return; st.metric = +k.dataset.mi; renderData(); };
    q('[data-body]').addEventListener('click', pick);
    q('[data-body]').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-mi]')) { e.preventDefault(); pick(e); } });
    q('[data-thead]').addEventListener('click', e => { const b = e.target.closest('[data-sort]'); if (!b) return; const i = +b.dataset.sort; if (st.sortCol === i) st.sortDir *= -1; else { st.sortCol = i; st.sortDir = m.cols[i].type === 'number' ? -1 : 1; } renderTable(); });
    q('[data-pager]').addEventListener('click', e => { const b = e.target.closest('[data-pg]'); if (!b) return; st.page += +b.dataset.pg; renderTable(); });
    q('[data-pages]').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; st.view = b.dataset.view; renderData(); const nav = q('[data-pages]'); if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' }); });
    q('[data-search]').addEventListener('input', e => { st.search = e.target.value; st.page = 0; renderTable(); });
    renderData();
  }

  function renderBar() {
    const mi = metricIdx(), di = dimIdx();
    const mo = (m.nums.length ? m.nums.concat([-1]) : [-1]).map(i => `<option value="${i}" ${i === mi ? 'selected' : ''}>${esc(m.label(i))}</option>`).join('');
    let h = `<label class="d-ctl"><span>${T('المؤشر', 'Metric')}</span><select data-k="metric">${mo}</select></label>`;
    if (m.cats.length > 1) h += `<label class="d-ctl"><span>${T('التقسيم حسب', 'Split by')}</span><select data-k="dim">${m.dims.map(i => `<option value="${i}" ${i === di ? 'selected' : ''}>${esc(m.cols[i].name)}</option>`).join('')}</select></label>`;
    m.cats.slice(0, 4).forEach(ci => {
      const freq = new Map(); for (const r of m.rows) { const v = r[ci]; if (v == null) continue; const k = String(v); freq.set(k, (freq.get(k) || 0) + 1); }
      const vals = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
      const cur = st.filters[ci], selA = cur == null ? [] : [].concat(cur);
      const lab = !selA.length ? T('الكل', 'All') : selA.length === 1 ? esc(selA[0]) : `${selA.length} ${T('مختارة', 'selected')}`;
      h += `<div class="d-ctl"><span>${esc(m.cols[ci].name)}</span><details class="d-ms ${selA.length ? 'on' : ''}" data-ms="${ci}" ${String(st.openMs) === String(ci) ? 'open' : ''}><summary><bdi>${lab}</bdi></summary><div class="d-msp">${vals.length > 8 ? `<input type="search" data-mss="${ci}" placeholder="${T('بحث…', 'Search…')}" aria-label="${T('بحث', 'Search')}">` : ''}<div class="d-msl">${vals.map(v => `<label><input type="checkbox" data-msv="${ci}" value="${esc(v)}" ${selA.includes(v) ? 'checked' : ''}><bdi>${esc(v)}</bdi></label>`).join('')}</div>${selA.length ? `<button type="button" class="d-msall" data-msall="${ci}">${T('عرض الكل', 'Show all')}</button>` : ''}</div></details></div>`;
    });
    const pk = periodKeys();
    if (pk.length >= 3) { const r = st.range || {}, op = (sel, ph) => `<option value="">${ph}</option>` + pk.map(k => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(pLabel(k))}</option>`).join('');
      h += `<div class="d-ctl d-range ${st.range ? 'on' : ''}"><span>${T('الفترة', 'Period')}</span><div><select data-r="from" aria-label="${T('من', 'From')}">${op(r.from, T('من البداية', 'From start'))}</select><select data-r="to" aria-label="${T('إلى', 'To')}">${op(r.to, T('إلى النهاية', 'To end'))}</select></div></div>`; }
    const n = activeF().length;
    if (n) h += `<button type="button" class="d-clear" data-clear>${T('مسح الفلاتر', 'Clear filters')} (${n})</button>`;
    h += `<button type="button" class="d-sqled no-export" data-sqled title="${T('اكتب استعلامات SQL على بيانات اللوحة', 'Write SQL queries on this data')}">{ } ${T('محرر SQL', 'SQL editor')}</button>`;
    root.querySelector('[data-bar]').innerHTML = h;
  }

  function ctx() {
    const metric = metricIdx(), dim = dimIdx(), rows = rangeRows(regionRows(m.filter(st.filters, '')));
    const tcfg = o.project.config && o.project.config.target;
    const tstats = o.version.targets ? targetStats(m, rows, o.version.targets, tcfg, st.filters, st.range ? { ...st.range, len: pLen() } : null) : null;
    const sd = sdIdx(dim), dimChosen = st.dim != null || colIdx(dflt('dim')) != null;
    return {
      metric, dim, rows, tstats, sd, pie: pieIdx(dim, sd),
      // in the tiles layout the big chart shows targets unless another split was chosen
      showT: !!tstats && (!dimChosen || (dim >= 0 && m.cols[dim].name === tstats.keyName)),
      ml: m.label(metric), mean: metric >= 0 && m.aggOf(metric) !== 'sum', // non-additive: no shares/pies/stacks
       hasF: activeF().length > 0,
      pal: theme.palette, ink: theme.vars['--d-muted'], grid: theme.vars['--d-line'],
      prev: o.previous && o.previous.totals,
      insights: autoInsights(m, rows, metric, dim, tstats, 3)
    };
  }
  // change vs previous period (or previous upload)
  function change(c, mi) {
    const s = m.series(c.rows, mi);
    if (s.length >= 2 && s[s.length - 1].k === m.partial) { const a = s[s.length - 1], p = s[s.length - 2], pv = m.sameDays(c.rows, mi, p.k);
      if (pv) return { pct: (a.v - pv) / Math.abs(pv) * 100, sub: T(`${pLabel(a.k)} (أول ${m.partialDay} يوم) مقارنة بنفس الأيام من ${pLabel(p.k)}`, `${pLabel(a.k)} (first ${m.partialDay} days) vs same days of ${pLabel(p.k)}`), s }; }
    if (s.length >= 2) { const a = s[s.length - 1], p = s[s.length - 2]; if (p.v) return { pct: (a.v - p.v) / Math.abs(p.v) * 100, sub: pLabel(a.k) + T(' مقارنة بـ', ' vs ') + pLabel(p.k), s }; }
    // the previous upload's total is only comparable if it was aggregated the same way (sum vs average…)
    const sameAgg = c.prev && mi >= 0 && (c.prev.__agg ? c.prev.__agg[m.cols[mi].name] === m.aggOf(mi) : m.aggOf(mi) === m.autoAgg(mi) && !m.cols[mi].measure);
    if (c.prev && !c.hasF && mi >= 0 && sameAgg && typeof c.prev[m.cols[mi].name] === 'number' && c.prev[m.cols[mi].name]) { const pv = c.prev[m.cols[mi].name]; return { pct: (m.agg(c.rows, mi) - pv) / Math.abs(pv) * 100, sub: T('مقارنة بالتحديث السابق', 'vs previous update'), s }; }
    if (s.length >= 2 && !s[s.length - 2].v) return { pct: null, sub: s[s.length - 1].v ? T(`${pLabel(s[s.length - 2].k)} كان صفرًا، فلا تُحسب نسبة`, `${pLabel(s[s.length - 2].k)} was zero — no % change`) : T(`لا قيمة في ${pLabel(s[s.length - 1].k)} ولا ${pLabel(s[s.length - 2].k)}`, `Nothing in ${pLabel(s[s.length - 1].k)} or ${pLabel(s[s.length - 2].k)}`), s };
    return { pct: null, sub: T('لا توجد فترة سابقة للمقارنة', 'No earlier period to compare'), s };
  }
  const arrowCls = p => p == null ? '' : (p >= 0 ? 'up' : 'down');
  const pctTxt = p => p == null ? '—' : (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(0) + '%';
  const insList = c => `<ul class="d-ins">${c.insights.map(i => `<li><strong>${esc(i.title)}</strong><span>${esc(i.body)}</span></li>`).join('')}</ul>`;

  // ---------- shared charts ----------
  function chartBreakdown(c, key, type) {
    const box0 = root.querySelector(`[data-cv="${key}"]`); if (box0) box0.parentElement.style.height = '';
    if (type === 'pie' || type === 'doughnut') return chartShare(c, key, c.dim, 'doughnut', true);
    if (type === 'line') {
      sqlSet(key, { kind: 'breakdown', dim: c.dim, metric: c.metric, limit: 12 });
      const bl = m.breakdown(c.rows, c.dim, c.metric).slice(0, 12), sel = st.filters[c.dim];
      draw(key, { type: 'line', data: { labels: bl.map(x => wrapLabel(x.k)), datasets: [{ label: c.ml, data: bl.map(x => x.v), borderColor: c.pal[0], backgroundColor: c.pal[0], tension: .3, borderWidth: 2.2, pointRadius: bl.map(x => isSel(sel, x.k) ? 7 : 4), pointHoverRadius: 8, pointBackgroundColor: bl.map(x => isOn(sel, x.k) ? c.pal[0] : alpha(c.pal[0], .3)) }] },
        options: { responsive: true, maintainAspectRatio: false, animation: anim(), onClick: (e, els) => { if (!els.length) return; const k = bl[els[0].index].k; togF(c.dim, k); }, onHover: (e, els) => { if (e.native) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
          plugins: { legend: { display: false }, tooltip: tip() }, scales: { x: { reverse: !isEn(), grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } }, y: { position: isEn() ? 'left' : 'right', beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
      return;
    }
    if (type === 'bar' && !(o.project.config && o.project.config.viz && o.project.config.viz.breakdown)) {
      const bb = m.breakdown(c.rows, c.dim, c.metric).slice(0, 8);
      if (bb.length > 4 && bb.reduce((a, x) => a + String(x.k).length, 0) / bb.length > 12) type = 'hbar';
    }
    const horizontal = type === 'hbar' || type === true;
    sqlSet(key, { kind: 'breakdown', dim: c.dim, sd: !horizontal && c.sd >= 0 && !c.mean ? c.sd : null, metric: c.metric, limit: horizontal ? 10 : 8 });
    const b = m.breakdown(c.rows, c.dim, c.metric).slice(0, horizontal ? 10 : 8), sel = st.filters[c.dim];
    let ds;
    if (!horizontal && c.sd >= 0 && !c.mean) {
      const sb = m.breakdown(c.rows, c.sd, c.metric), keys = sb.slice(0, 3).map(x => x.k), other = sb.length > 3, labs = keys.concat(other ? [OTHER()] : []);
      ds = labs.map((lab, j) => ({ label: lab, data: b.map(x => m.agg(c.rows.filter(r => String(r[c.dim]) === x.k && (lab === OTHER() ? !keys.includes(String(r[c.sd])) : String(r[c.sd]) === lab)), c.metric)), backgroundColor: lab === OTHER() ? '#A9B4BC' : c.pal[j], maxBarThickness: 48 }));
    } else ds = [{ label: c.ml, data: b.map(x => x.v), backgroundColor: b.map(x => isOn(sel, x.k) ? c.pal[0] : alpha(c.pal[0], .3)), borderRadius: 3, maxBarThickness: horizontal ? 22 : 48 }];
    const click = (e, els) => { if (!els.length) return; const k = b[els[0].index].k; togF(c.dim, k); };
    const hover = (e, els) => { if (e.native) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
    if (horizontal) {
      const box = root.querySelector(`[data-cv="${key}"]`); if (box) box.parentElement.style.height = Math.max(200, b.length * 32 + 30) + 'px';
      draw(key, { type: 'bar', data: { labels: b.map(x => { const k = String(x.k); return k.length > 18 ? k.slice(0, 17).trim() + '…' : k; }), datasets: ds }, plugins: [valueLabels], options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: anim(), onClick: click, onHover: hover, layout: { padding: isEn() ? { right: 44 } : { left: 44 } },
        plugins: { legend: { display: false }, tooltip: tip(), valueLabels: { mode: 'end', color: c.ink, font: theme.font } },
        scales: { x: { reverse: !isEn(), beginAtZero: true, display: false }, y: { position: isEn() ? 'left' : 'right', grid: { display: false }, border: { display: false } } } } });
    } else {
      draw(key, { type: 'bar', data: { labels: b.map(x => wrapLabel(x.k)), datasets: ds }, plugins: [valueLabels], options: { responsive: true, maintainAspectRatio: false, animation: anim(), onClick: click, onHover: hover,
        plugins: { legend: { display: ds.length > 1, position: 'top', align: 'start', rtl: !isEn(), textDirection: isEn() ? 'ltr' : 'rtl', labels: { boxWidth: 10, boxHeight: 10, padding: 10 } }, tooltip: tip(), valueLabels: { mode: 'inside', font: theme.font } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } }, y: { stacked: true, beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
    }
  }
  function chartTargets(c, key) {
    sqlSet(key, { kind: 'targets', metric: c.metric });
    const it = c.tstats.items.slice(0, 10);
    draw(key, { type: 'bar', data: { labels: it.map(x => wrapLabel(x.k)), datasets: [
      { label: T('الفعلي', 'Actual'), data: it.map(x => x.actual), backgroundColor: c.pal[0], borderRadius: 3, maxBarThickness: 30 },
      { label: T('المستهدف', 'Target'), data: it.map(x => x.target), backgroundColor: c.pal[1], borderRadius: 3, maxBarThickness: 30 }] },
      plugins: [valueLabels], options: { responsive: true, maintainAspectRatio: false, animation: anim(), layout: { padding: { top: 16 } },
        plugins: { legend: { position: 'top', align: 'start', rtl: !isEn(), textDirection: isEn() ? 'ltr' : 'rtl', labels: { boxWidth: 10, boxHeight: 10, padding: 10 } }, tooltip: tip(), valueLabels: { mode: 'top', color: c.ink, font: theme.font } },
        scales: { x: { reverse: !isEn(), grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } }, y: { position: isEn() ? 'left' : 'right', beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
  }
  function chartShare(c, key, pd, type, clickable) {
    sqlSet(key, { kind: 'share', dim: pd, metric: c.metric });
    const b = m.breakdown(c.rows, pd, c.metric); let t5 = b.slice(0, 5); const rest = b.slice(5).reduce((s, x) => s + x.v, 0); if (rest > 0) t5 = t5.concat([{ k: OTHER(), v: rest }]);
    const pc = [c.pal[0], c.pal[2], c.pal[1], c.pal[3], c.pal[6]], sel = st.filters[pd];
    const cols = t5.map((x, i) => { const col = x.k === OTHER() ? '#A9B4BC' : pc[i % pc.length]; return isOn(sel, x.k) ? col : alpha(col, .3); });
    const click = (e, els) => { if (!els.length) return; const k = t5[els[0].index].k; if (k === OTHER()) return; togF(pd, k); };
    const hover = (e, els) => { if (e.native) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
    if (type === 'bar' || type === 'hbar') {
      const h = type === 'hbar';
      draw(key, { type: 'bar', data: { labels: t5.map(x => h ? x.k : wrapLabel(x.k)), datasets: [{ label: c.ml, data: t5.map(x => x.v), backgroundColor: cols, borderRadius: 3, maxBarThickness: h ? 24 : 48 }] }, plugins: [valueLabels],
        options: { indexAxis: h ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: anim(), onClick: click, onHover: hover, layout: h ? { padding: isEn() ? { right: 44 } : { left: 44 } } : { padding: { top: 16 } },
          plugins: { legend: { display: false }, tooltip: tip(), valueLabels: { mode: h ? 'end' : 'top', color: c.ink, font: theme.font } },
          scales: h ? { x: { reverse: !isEn(), beginAtZero: true, display: false }, y: { position: isEn() ? 'left' : 'right', grid: { display: false }, border: { display: false } } }
            : { x: { reverse: !isEn(), grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } }, y: { display: false, beginAtZero: true } } } });
      return;
    }
    draw(key, { type: 'doughnut', data: { labels: t5.map(x => x.k), datasets: [{ data: t5.map(x => x.v), backgroundColor: cols, borderColor: '#FFFFFF', borderWidth: 2 }] }, plugins: [valueLabels],
      options: { responsive: true, maintainAspectRatio: false, cutout: type === 'pie' ? 0 : '45%', animation: anim(), onClick: click, onHover: hover, plugins: { legend: { position: 'bottom', rtl: !isEn(), textDirection: isEn() ? 'ltr' : 'rtl', labels: { boxWidth: 10, boxHeight: 10, padding: 10 } }, tooltip: tip(), valueLabels: { mode: 'pct', font: theme.font } } } });
  }
  const chartPie = (c, key, pd) => chartShare(c, key, pd, vz('share'));
  function chartGauge(c, key, value, max) {
    draw(key, { type: 'doughnut', data: { datasets: [{ data: [Math.min(value, max), Math.max(0, max - value)], backgroundColor: [c.pal[0], theme.vars['--d-surface-2']], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '70%', animation: anim(), plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
  }
  // forecast for the trend chart (monthly data, 6+ months, owner can switch it off)
  const fcFor = c => (m.date >= 0 && m.monthly && vz('forecast') !== 'off') ? forecast(m.series(c.rows, c.metric), 3) : null;
  function fcNote(key, F, c) {
    const cv = root.querySelector(`[data-cv="${key}"]`), card = cv && cv.closest('article'); if (!card) return;
    let el = card.querySelector('.d-fcnote'); if (!el) { el = document.createElement('div'); el.className = 'd-fcnote'; card.appendChild(el); }
    if (!F) { el.remove(); return; }
    const acc = F.accuracy == null ? '' : ` · ${T('الدقة', 'accuracy')} ~${F.accuracy.toFixed(0)}%`;
    if (F.unreliable) { el.innerHTML = `<p class="d-fcvals"><span aria-hidden="true">⚠️</span>${T('ما عرضنا توقعًا: الأرقام متذبذبة كثير، وأفضل طريقة أخطأت بأكثر من النصف عند اختبارها على آخر الأشهر.', 'No forecast shown: the numbers swing too much — the best method was off by more than half when tested on recent months.')}</p>`; return; }
    el.innerHTML = `<p class="d-fcvals"><span class="d-fckey" aria-hidden="true"></span>${T('التوقع', 'Forecast')}: ${F.keys.map((k, i) => `<span><bdi>${esc(pLabel(k))}</bdi> <b>${fmt(F.pts[i])}</b></span>`).join('<i>·</i>')}</p>
      <details><summary>${T('الطريقة', 'Method')}: ${esc(F.best.name)}${acc} <small>(${T(F.test === 2 ? 'اختُبرت على آخر شهرين معروفين' : F.test === 1 ? 'اختُبرت على آخر شهر معروف' : `اختُبرت على آخر ${F.test} أشهر معروفة`, `tested on the last ${F.test} known months`)})</small></summary>
      <table class="d-fctbl"><thead><tr><th>${T('الطريقة', 'Method')}</th><th>${T('الدقة', 'Accuracy')}</th><th>${T('متوسط الخطأ', 'Avg. error')}</th></tr></thead><tbody>${F.ranking.map((r, i) => `<tr class="${i ? '' : 'on'}"><td>${esc(r.name)}${i ? '' : ' ✓'}</td><td>${r.mape == null ? '—' : Math.max(0, 100 - r.mape).toFixed(1) + '%'}</td><td>${fmt(r.rmse)}</td></tr>`).join('')}</tbody></table>
      <p class="d-fchelp">${T('النطاق المظلل يوضّح المدى المتوقع بثقة ~80%. التوقع مبني على الأرقام السابقة فقط ولا يعرف عن أي حدث قادم.', 'The shaded band is the ~80% expected range. The forecast uses past numbers only and knows nothing about upcoming events.')}</p></details>`;
  }
  function chartLine(c, key, mi, ti) {
    sqlSet(key, { kind: 'trend', metric: mi });
    const s = m.series(c.rows, mi), tt = vz('trend');
    const F0 = mi === c.metric ? fcFor(c) : null, F = F0 && !F0.unreliable ? F0 : null, n = s.length, fl = F ? F.keys.length : 0;
    const labels = s.map(p => pLabel(p.k)).concat(F ? F.keys.map(pLabel) : []);
    const pad = (arr) => arr.concat(Array(fl).fill(null));
    const fcCol = c.pal[1] || c.pal[0];
    const fcSets = !F ? [] : tt === 'bar'
      ? [{ label: T('التوقع', 'Forecast'), data: Array(n).fill(null).concat(F.pts), backgroundColor: alpha(fcCol, .45), borderColor: fcCol, borderWidth: 1.5, borderDash: [4, 3], borderRadius: 3, maxBarThickness: 40, grouped: false }]
      : [{ label: T('التوقع', 'Forecast'), data: Array(n - 1).fill(null).concat([s[n - 1].v], F.pts), borderColor: fcCol, backgroundColor: fcCol, borderDash: [6, 4], borderWidth: 2.2, tension: .3, pointRadius: Array(n - 1).fill(0).concat([0], F.pts.map(() => 3)), pointBackgroundColor: fcCol, fill: false },
         { label: 'lo', band: true, data: Array(n - 1).fill(null).concat([s[n - 1].v], F.band.map(b => b[0])), borderWidth: 0, pointRadius: 0, fill: false, tension: .3 },
         { label: 'hi', band: true, data: Array(n - 1).fill(null).concat([s[n - 1].v], F.band.map(b => b[1])), borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: alpha(fcCol, .16), tension: .3 }];
    const tp = { ...tip(), filter: it => !it.dataset.band };
    if (tt === 'bar') {
      draw(key, { type: 'bar', data: { labels, datasets: [{ label: F ? c.ml : '', data: pad(s.map(p => p.v)), backgroundColor: c.pal[0], borderRadius: 3, maxBarThickness: 40, grouped: false }].concat(fcSets) },
        options: { responsive: true, maintainAspectRatio: false, animation: anim(), plugins: { legend: { display: false }, tooltip: tp }, scales: { x: { reverse: !isEn(), grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { position: isEn() ? 'left' : 'right', beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
    } else {
      const lyD = ti && ti.hasLY && mi === c.metric ? s.map(p => /^\d{4}-\d{2}$/.test(p.k) ? ti.lyOf(p.k) : null) : null;
      const lySet = lyD && lyD.filter(v => v != null).length >= 3 ? [{ label: T('السنة الماضية', 'Last year'), data: pad(lyD), borderColor: alpha(c.ink, .55), backgroundColor: alpha(c.ink, .55), borderDash: [3, 3], borderWidth: 1.6, pointRadius: 0, tension: .3, fill: false }] : [];
      if (lySet.length) { const lg = root.querySelector(`[data-cv="${key}"]`); const card = lg && lg.closest('article'); if (card && !card.querySelector('.d-lylg')) card.querySelector('.d-box').insertAdjacentHTML('beforebegin', `<p class="d-lylg"><i></i>${T('السنة الماضية (نفس الشهر)', 'Last year (same month)')}</p>`); }
      draw(key, { type: 'line', data: { labels, datasets: [{ label: F || lySet.length ? c.ml : '', data: pad(s.map(p => p.v)), borderColor: c.pal[0], backgroundColor: alpha(c.pal[0], .14), fill: tt !== 'line', tension: .3, borderWidth: 2.2, pointRadius: n > 40 ? 0 : 3, pointBackgroundColor: c.pal[0] }].concat(lySet, fcSets) },
        options: { responsive: true, maintainAspectRatio: false, animation: anim(), interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: tp }, scales: { x: { reverse: !isEn(), grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { position: isEn() ? 'left' : 'right', beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
    }
    fcNote(key, F0, c);
  }
  function chartMini(c, key, mi) {
    sqlSet(key, m.date >= 0 ? { kind: 'trend', metric: mi, last: 6 } : { kind: 'breakdown', dim: c.dim, metric: mi, limit: 6 });
    const pts = m.date >= 0 ? m.series(c.rows, mi).slice(-6).map(p => ({ k: pLabel(p.k), v: p.v })) : (c.dim >= 0 ? m.breakdown(c.rows, c.dim, mi).slice(0, 6) : []);
    draw(key, { type: 'bar', data: { labels: pts.map(p => p.k), datasets: [{ data: pts.map(p => p.v), backgroundColor: c.pal[0], borderRadius: 2, maxBarThickness: 24 }] }, plugins: [valueLabels],
      options: { responsive: true, maintainAspectRatio: false, animation: anim(), layout: { padding: { top: 16, left: 10, right: 10 } }, plugins: { legend: { display: false }, tooltip: tip(), valueLabels: { mode: 'top', color: c.ink, font: theme.font } },
        scales: { x: { reverse: !isEn() && m.date >= 0, grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true } }, y: { display: false, beginAtZero: true } } } });
  }

  // ---------- recommendations ----------
  const recItems = () => ((o.project.config && o.project.config.recs) || []).filter(r => r && r.text && String(r.text).trim());
  const recsHTML = cls => { const l = recItems(); return l.length ? `<article class="${cls} d-recs">${head(T('التوصيات', 'Recommendations'), '')}<ol class="d-reclist">${l.map(r => `<li><span class="d-recn" aria-hidden="true"></span><span>${esc(r.text)}</span></li>`).join('')}</ol></article>` : ''; };

  // ---------- notes & decisions (owner-written, read-only for viewers) ----------
  const noteItems = () => ((o.project.config && o.project.config.notes) || []).filter(n => n && n.text && String(n.text).trim());
  const NTL = { note: T('ملاحظة', 'Note'), decision: T('قرار', 'Decision'), action: T('إجراء مطلوب', 'Action') };
  const notesHTML = cls => { const l = noteItems(); return l.length ? `<article class="${cls} d-notesx">${head(T('الملاحظات والقرارات', 'Notes & decisions'), '')}<ol class="d-notelist">${l.map(n => `<li class="nt-${esc(n.type || 'note')}"><div class="d-nmeta"><span class="d-ntag">${NTL[n.type] || NTL.note}</span>${n.date ? `<time>${esc(fmtDate(n.date))}</time>` : ''}</div><p>${esc(n.text)}</p></li>`).join('')}</ol></article>` : ''; };

  // ---------- location map ----------
  const mapTitle = c => c.ml + T(' حسب الموقع', ' by location');
  const mapMode = () => saudi ? (st.mapMode || 'regions') : 'cities';
  const mapHTML = (c, cls) => {
    if (geo < 0) return '';
    const md = mapMode();
    const tog = saudi ? `<div class="d-mapmode no-export" role="group" aria-label="${T('نوع الخريطة', 'Map type')}"><button type="button" data-mapmode="regions" aria-pressed="${md === 'regions'}">${T('المناطق', 'Regions')}</button><button type="button" data-mapmode="cities" aria-pressed="${md === 'cities'}">${T('المدن', 'Cities')}</button></div>` : '';
    const sub = md === 'regions' ? T('المناطق الإدارية · اضغط منطقة للفلترة', 'Administrative regions · click a region to filter') : m.cols[geo].name + T(' · اضغط دائرة للفلترة', ' · click a circle to filter');
    return `<article class="${cls} d-maptile">${head(mapTitle(c), sub)}${tog}<div class="d-map ${md === 'regions' ? 'd-rmap' : ''}" data-map dir="ltr" role="img" aria-label="${esc(mapTitle(c))}"></div><ol class="d-maprank" data-maprank></ol></article>`;
  };
  function killMaps() { while (maps.length) { try { maps.pop().remove(); } catch (e) {} } }
  function drawRegions(c, box) {
    const f = { ...st.filters }; delete f[geo];
    const rows = rangeRows(m.filter(f, '')), sel = st.region;
    sqlSet('map', { kind: 'breakdown', dim: geo, metric: c.metric, exclude: geo });
    const g = new Map(); for (const r of rows) { const rg = regionOf(r[geo]); if (!rg) continue; if (!g.has(rg)) g.set(rg, []); g.get(rg).push(r); }
    import('./sa-regions.js').then(({ VIEWBOX, REGIONS }) => {
      if (!box.isConnected) return;
      const name = id => { const x = REGIONS.find(r => r.id === id); return x ? T(x.ar, x.en) : id; };
      const vals = [...g.entries()].map(([id, rs]) => ({ id, v: m.agg(rs, c.metric) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
      const max = vals.length ? vals[0].v : 1, min = vals.length ? vals[vals.length - 1].v : 0, tot = vals.reduce((s, x) => s + x.v, 0);
      const vOf = id => (vals.find(x => x.id === id) || {}).v;
      const prim = theme.vars['--d-primary'], base = '#F1F3F5';
      const fill = v => v == null ? base : mix('#FFFFFF', prim, .18 + .82 * (max > min ? (v - min) / (max - min) : 1));
      const rank = root.querySelector('[data-maprank]');
      if (rank) rank.innerHTML = vals.slice(0, 5).map((x, i) => `<li class="${sel == null || sel === x.id ? '' : 'dim'}" data-rg="${x.id}" role="button" tabindex="0"><span class="r">${i + 1}</span><bdi>${esc(name(x.id))}</bdi><b>${fmt(x.v)}</b>${!c.mean && tot ? `<i>${(x.v / tot * 100).toFixed(0)}%</i>` : ''}</li>`).join('');
      box.innerHTML = `<svg viewBox="${VIEWBOX}" class="d-rsvg" role="group" aria-label="${esc(mapTitle(c))}">${REGIONS.map(r => { const v = vOf(r.id); return `<path d="${r.d}" data-rg="${r.id}" fill="${fill(v)}" class="${v == null ? 'nodata' : ''} ${sel && sel !== r.id ? 'dim' : ''} ${sel === r.id ? 'sel' : ''}" tabindex="${v == null ? -1 : 0}"><title>${esc(name(r.id))}: ${v == null ? T('لا توجد بيانات', 'no data') : fmt(v)}</title></path>`; }).join('')}<g class="d-rlbl"></g></svg>
        <div class="d-rlegend"><span>${fmt(min)}</span><i style="background:linear-gradient(to right,${fill(min)},${fill(max)})"></i><span>${fmt(max)}</span></div><p class="d-rattr">© mapsvg.com · CC BY 4.0</p>`;
      const svg = box.querySelector('svg'), lg = svg.querySelector('.d-rlbl');
      // labels for the larger values, at each region's visual centre
      const NUDGE = { 'mecca': [-2, -38], 'eastern-province': [20, -30], 'ryiadh': [0, 10], 'medina': [0, 0], 'asir': [6, 0], 'tabuk': [10, 10] };
      vals.slice(0, 7).forEach(x => {
        const p = svg.querySelector(`path[data-rg="${x.id}"]`); if (!p) return; const b = p.getBBox(); if (b.width < 30) return;
        const [dx, dy] = NUDGE[x.id] || [0, 0], cx = b.x + b.width / 2 + dx, cy = b.y + b.height / 2 + dy;
        const t = max > min ? (x.v - min) / (max - min) : 1, light = t > .45;
        lg.insertAdjacentHTML('beforeend', `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" class="${light ? 'on' : ''}"><tspan x="${cx.toFixed(1)}" class="n">${esc(name(x.id))}</tspan><tspan x="${cx.toFixed(1)}" dy="1.25em" class="v">${fmt(x.v)}</tspan></text>`);
      });
    });
  }
  function drawMap(c) {
    const box = root.querySelector('[data-map]'); if (!box || geo < 0) return;
    if (mapMode() === 'regions') return drawRegions(c, box);
    const f = { ...st.filters }; delete f[geo];
    const rows = rangeRows(m.filter(f, '')), sel = st.filters[geo];
    sqlSet('map', { kind: 'breakdown', dim: geo, metric: c.metric, exclude: geo });
    const pts = m.breakdown(rows, geo, c.metric).map(x => ({ ...x, ll: coordOf(x.k) })).filter(x => x.ll && x.v > 0);
    const rank = root.querySelector('[data-maprank]'), tot = pts.reduce((s, x) => s + x.v, 0);
    if (rank) rank.innerHTML = pts.slice(0, 5).map((x, i) => `<li class="${isOn(sel, x.k) ? '' : 'dim'}"><span class="r">${i + 1}</span><bdi>${esc(x.k)}</bdi><b>${fmt(x.v)}</b>${!c.mean && tot ? `<i>${(x.v / tot * 100).toFixed(0)}%</i>` : ''}</li>`).join('');
    if (!pts.length) return;
    loadLeaflet().then(L => {
      if (!box.isConnected) return;
      const map = L.map(box, { scrollWheelZoom: false, attributionControl: true, zoomSnap: 0.25 });
      maps.push(map);
      map.attributionControl.setPrefix(false);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 12, crossOrigin: '', attribution: '© OpenStreetMap © CARTO' }).addTo(map);
      const max = Math.max(...pts.map(x => x.v)), col = c.pal[0], col2 = c.pal[1] || col;
      const bnd = L.latLngBounds(pts.map(x => x.ll));
      if (pts.length === 1) map.setView(pts[0].ll, 7); else map.fitBounds(bnd.pad(0.2), { maxZoom: 8, padding: [30, 30] });
      const placed = [];
      const mks = pts.map((x, i) => {
        const on = isOn(sel, x.k), r = 6 + 22 * Math.sqrt(x.v / max);
        const pt = map.latLngToContainerPoint(x.ll);
        const free = on && i < 8 && placed.every(q => Math.abs(q.x - pt.x) > 74 || Math.abs(q.y - pt.y) > 54);
        if (free) placed.push(pt);
        return { x, i, on, r, free };
      });
      mks.slice().reverse().forEach(({ x, on, r, free }) => {
        const mk = L.circleMarker(x.ll, { radius: r, color: '#fff', weight: 2, fillColor: isSel(sel, x.k) ? col2 : col, fillOpacity: on ? .8 : .22, opacity: on ? 1 : .5 }).addTo(map);
        mk.bindTooltip(`<bdi>${esc(x.k)}</bdi><b>${fmt(x.v)}</b>`, { permanent: free, direction: 'top', offset: [0, -r + 2], className: 'd-maplbl', opacity: 1 });
        mk.on('click', () => { togF(geo, x.k); });
      });
    }).catch(() => { box.innerHTML = `<p class="d-muted" style="padding:16px">${T('تعذّر تحميل الخريطة.', 'Map could not be loaded.')}</p>`; });
  }

  // ---------- template: tiles ----------
  function tplTiles(c) {
    const total = m.agg(c.rows, c.metric);
    let top = `<article class="d-tile d-num">${head(c.ml, m.aggOf(c.metric) === 'max' ? T('أعلى قيمة', 'Highest value') : m.aggOf(c.metric) === 'min' ? T('أدنى قيمة', 'Lowest value') : m.aggOf(c.metric) === 'ratio' ? T('مقياس محسوب', 'Calculated measure') : c.mean ? T('المتوسط', 'Average') : (c.hasF ? T('الإجمالي حسب الفلاتر', 'Filtered total') : T('الإجمالي', 'Total')))}<p class="d-big">${fmt(total)}</p>${c.tstats && m.cols[c.metric] && m.cols[c.metric].name === c.tstats.valName ? `<p class="d-sub">${T('المستهدف', 'Target')} ${fmt(c.tstats.target)}</p>` : ''}</article>`;
    let gauge = null;
    if (c.tstats && c.tstats.pct != null) gauge = { title: T('نسبة الإنجاز', 'Achievement'), sub: c.tstats.valName + T(' مقابل المستهدف', ' vs target'), v: c.tstats.pct, max: 100, label: fmtPct(c.tstats.pct, 1), lo: '0%', hi: '100%' };
    else if (c.dim >= 0 && !c.mean && c.rows.length) { const b = m.breakdown(c.rows, c.dim, c.metric), t = b.reduce((s, x) => s + x.v, 0); if (b.length >= 2 && t > 0) gauge = { title: T('حصة ', 'Share of ') + b[0].k, sub: T('من إجمالي ', 'of total ') + c.ml, v: b[0].v, max: t, label: fmt(b[0].v), lo: '0', hi: fmt(t) }; }
    const kv = vz('kpi');
    if (gauge) {
      const gp = gauge.max ? Math.max(0, Math.min(100, gauge.v / gauge.max * 100)) : 0;
      const inner = kv === 'number' ? `<p class="d-big d-kpinum">${gauge.label}</p>`
        : kv === 'bar' ? `<div class="d-kpibar"><p class="d-big">${gauge.label}</p><div class="d-bar-track"><i style="width:${gp.toFixed(1)}%"></i></div><div class="d-gscale"><span>${gauge.lo}</span><span>${gauge.hi}</span></div></div>`
        : `<div class="d-gbox"><canvas data-cv="gauge" role="img" aria-label="${esc(gauge.title)}"></canvas><p class="d-gval">${gauge.label}</p></div><div class="d-gscale"><span>${gauge.lo}</span><span>${gauge.hi}</span></div>`;
      top += `<article class="d-tile d-gauge">${head(gauge.title, gauge.sub)}${inner}</article>`;
    }
    if (c.showT) top += `<article class="d-tile d-wide d-bartile">${head(T('الفعلي مقابل المستهدف', 'Actual vs target'), T('حسب ', 'by ') + c.tstats.keyName)}<div class="d-box"><canvas data-cv="bar" role="img" aria-label="${T('الفعلي مقابل المستهدف', 'Actual vs target')}"></canvas></div></article>`;
    else if (c.dim >= 0) top += `<article class="d-tile d-wide d-bartile">${head(c.ml + T(' حسب ', ' by ') + m.cols[c.dim].name, c.sd >= 0 && !c.mean ? T('مقسّم حسب ', 'Split by ') + m.cols[c.sd].name + T(' · اضغط عمودًا للفلترة', ' · click a bar to filter') : T('اضغط عمودًا للفلترة', 'Click a bar to filter'))}<div class="d-box"><canvas data-cv="bar" role="img" aria-label="${T('التوزيع', 'Breakdown')}"></canvas></div></article>`;
    else if (m.date >= 0) top += `<article class="d-tile d-wide d-bartile">${head(c.ml + T(' عبر الزمن', ' over time'), m.monthly ? T('شهريًا', 'Monthly') : T('يوميًا', 'Daily'))}<div class="d-box"><canvas data-cv="line" role="img" aria-label="${T('الاتجاه', 'Trend')}"></canvas></div></article>`;
    const pd = c.pie;
    if (pd >= 0 && !c.mean) top += `<article class="d-tile d-wide d-pietile">${head(T('توزيع ', '') + c.ml + T(' حسب ', ' by ') + m.cols[pd].name, T('أكبر خمس قيم والباقي في «أخرى»', 'Top five, the rest in “Other”'))}<div class="d-box"><canvas data-cv="pie" role="img" aria-label="${T('الحصص', 'Shares')}"></canvas></div></article>`;

    const metrics = m.nums.length ? m.nums.slice(0, 4) : [-1], n = metrics.length, mid = Math.floor(n / 2), chg = [], mini = [];
    metrics.forEach((mi, idx) => {
      const ch = change(c, mi);
      chg.push(`<article class="d-tile d-chg ${mi === c.metric ? 'on' : ''}" data-mi="${mi}" role="button" tabindex="0" aria-pressed="${mi === c.metric}" style="--mo:${idx * 2 + 1}">${head(m.label(mi), ch.sub)}<p class="d-delta ${arrowCls(ch.pct)}"><span class="n">${pctTxt(ch.pct)}</span><span class="a" aria-hidden="true">${ch.pct == null ? '' : (ch.pct >= 0 ? '⇧' : '⇩')}</span></p></article>`);
      mini.push(`<article class="d-tile d-mini" style="--mo:${idx * 2 + 2}">${head(m.label(mi), m.date >= 0 ? (m.monthly ? T('آخر 6 أشهر', 'Last 6 months') : T('آخر 6 أيام', 'Last 6 days')) : (c.dim >= 0 ? T('حسب ', 'by ') + m.cols[c.dim].name : ''))}<div class="d-minibox"><canvas data-cv="mini${idx}" role="img" aria-label="${esc(m.label(mi))}"></canvas></div></article>`);
    });
    let hl;
    if (m.date >= 0) { const s = m.series(c.rows, c.metric); const avg = s.length ? s.reduce((a, x) => a + x.v, 0) / s.length : 0; hl = `<p class="d-big">${fmt(avg)}</p><p class="d-hlt">${T(`${esc(c.ml)} ${m.monthly ? 'شهريًا' : 'يوميًا'} في المتوسط`, `Average ${m.monthly ? 'monthly' : 'daily'} ${esc(c.ml)}`)}</p>`; }
    else hl = `<p class="d-big">${c.rows.length.toLocaleString('en-US')}</p><p class="d-hlt">${T('سجل في البيانات', 'records')}</p>`;
    const lineTop = !c.showT && c.dim < 0 && m.date >= 0, fcTile = !lineTop && !!fcFor(c);
    const fcHTML = fcTile ? `<section class="d-recsec"><article class="d-tile d-fctile">${head(T('الاتجاه والتوقع', 'Trend & forecast'), c.ml + T(' · الأشهر القادمة بخط متقطع', ' · coming months dashed'))}<div class="d-box"><canvas data-cv="line" role="img" aria-label="${T('الاتجاه والتوقع', 'Trend and forecast')}"></canvas></div></article></section>` : '';
    const html = `<section class="d-top ${gauge ? 'has-gauge' : ''} ${pd >= 0 && !c.mean ? 'has-pie' : ''}">${top}</section>${fcHTML}${geo >= 0 ? `<section class="d-mapsec">${mapHTML(c, 'd-tile')}</section>` : ''}
      <section class="d-bottom" style="--n:${n + 1}">${chg.slice(0, mid).join('')}<article class="d-tile d-hl" style="--mo:0">${hl}</article>${chg.slice(mid).join('')}${mini.slice(0, mid).join('')}<article class="d-tile d-notes" style="--mo:99">${head(T('ملاحظات', 'Insights'), '')}${insList(c)}</article>${mini.slice(mid).join('')}</section>${recItems().length ? `<section class="d-recsec">${recsHTML('d-tile')}</section>` : ''}${noteItems().length ? `<section class="d-recsec">${notesHTML('d-tile')}</section>` : ''}`;
    return { html, after() {
      if (gauge && kv === 'gauge') chartGauge(c, 'gauge', gauge.v, gauge.max);
      if (c.showT) chartTargets(c, 'bar'); else if (c.dim >= 0) chartBreakdown(c, 'bar', vz('breakdown')); else if (m.date >= 0) chartLine(c, 'line', c.metric);
      if (pd >= 0 && !c.mean) chartPie(c, 'pie', pd);
      if (fcTile) chartLine(c, 'line', c.metric);
      metrics.forEach((mi, idx) => chartMini(c, 'mini' + idx, mi));
      drawMap(c);
    } };
  }

  // ---------- template: executive ----------
  function tplExecutive(c) {
    const metrics = m.nums.length ? m.nums.slice(0, c.tstats ? 3 : 4) : [-1];
    let kpis = '';
    if (c.tstats && c.tstats.pct != null) kpis += `<article class="d-card d-kpi d-kpi-hero"><p class="d-kl">${T('نسبة الإنجاز', 'Achievement')}</p><p class="d-kv">${fmtPct(c.tstats.pct, 1)}</p><p class="d-kf">${fmt(c.tstats.actual)} ${T('من', 'of')} ${fmt(c.tstats.target)}</p>${vz('kpi') === 'number' ? '' : `<div class="d-bar-track"><i style="width:${Math.min(100, c.tstats.pct).toFixed(1)}%"></i></div>`}</article>`;
    metrics.forEach(mi => {
      const ch = change(c, mi);
      kpis += `<article class="d-card d-kpi ${mi === c.metric ? 'on' : ''}" data-mi="${mi}" role="button" tabindex="0" aria-pressed="${mi === c.metric}"><p class="d-kl">${esc(m.label(mi))}</p><p class="d-kv">${m.fmtOf(mi)(m.agg(c.rows, mi))}</p><p class="d-kf"><span class="d-dl ${arrowCls(ch.pct)}">${ch.pct == null ? '' : (ch.pct >= 0 ? '▲ ' : '▼ ') + Math.abs(ch.pct).toFixed(1) + '%'}</span> ${ch.pct == null ? '' : esc(ch.sub)}</p>${spark(ch.s.map(p => p.v))}</article>`;
    });
    const hasLine = m.date >= 0;
    const html = `<section class="d-kpis">${kpis}</section>
      <section class="d-grid">
        ${hasLine ? `<article class="d-card d-span8">${head(c.ml + T(' عبر الزمن', ' over time'), m.monthly ? T('تجميع شهري', 'Monthly') : T('تجميع يومي', 'Daily'))}<div class="d-box"><canvas data-cv="line" role="img" aria-label="${T('الاتجاه', 'Trend')}"></canvas></div></article>` : ''}
        <article class="d-card ${hasLine ? 'd-span4' : 'd-span12'} d-notes-ex">${head(T('أبرز الملاحظات', 'Key insights'), '')}${insList(c)}</article>
        ${mapHTML(c, 'd-card d-span12')}
        ${recsHTML('d-card d-span12')}
        ${notesHTML('d-card d-span12')}
        ${c.dim >= 0 ? `<article class="d-card d-span6">${head(c.ml + T(' حسب ', ' by ') + m.cols[c.dim].name, T('اضغط أي شريط للفلترة', 'Click a bar to filter'))}<div class="d-box d-hbox"><canvas data-cv="hbar" role="img" aria-label="${T('الترتيب', 'Ranking')}"></canvas></div></article>` : ''}
        ${c.tstats ? `<article class="d-card d-span6">${head(T('الفعلي مقابل المستهدف', 'Actual vs target'), T('حسب ', 'by ') + c.tstats.keyName)}<div class="d-box"><canvas data-cv="tbar" role="img" aria-label="${T('الفعلي مقابل المستهدف', 'Actual vs target')}"></canvas></div></article>`
          : (c.pie >= 0 && !c.mean ? `<article class="d-card d-span6">${head(T('توزيع ', '') + c.ml + T(' حسب ', ' by ') + m.cols[c.pie].name, '')}<div class="d-box"><canvas data-cv="pie" role="img" aria-label="${T('الحصص', 'Shares')}"></canvas></div></article>` : '')}
      </section>`;
    return { html, after() {
      if (hasLine) chartLine(c, 'line', c.metric);
      if (c.dim >= 0) chartBreakdown(c, 'hbar', vz('breakdown'));
      if (c.tstats) chartTargets(c, 'tbar'); else if (c.pie >= 0 && !c.mean) chartPie(c, 'pie', c.pie);
      drawMap(c);
    } };
  }

  // ---------- template: compact ----------
  function tplCompact(c) {
    const total = m.agg(c.rows, c.metric), ch0 = change(c, c.metric);
    const metrics = m.nums.length ? m.nums.slice(0, 6) : [-1];
    const rows = metrics.map(mi => { const ch = change(c, mi); return `<li data-mi="${mi}" role="button" tabindex="0" class="${mi === c.metric ? 'on' : ''}" aria-pressed="${mi === c.metric}"><span class="d-ln">${esc(m.label(mi))}</span><span class="d-lv">${m.fmtOf(mi)(m.agg(c.rows, mi))}</span>${spark(ch.s.map(p => p.v).slice(-8))}<span class="d-dl ${arrowCls(ch.pct)}">${ch.pct == null ? '' : (ch.pct >= 0 ? '▲' : '▼') + Math.abs(ch.pct).toFixed(0) + '%'}</span></li>`; }).join('');
    const html = `<section class="d-stack">
      <article class="d-card d-hero"><p class="d-kl">${esc(c.ml)}${m.aggOf(c.metric) === 'avg' ? T(' (متوسط)', ' (avg)') : ''}</p><p class="d-kv">${fmt(total)}</p><p class="d-kf"><span class="d-dl ${arrowCls(ch0.pct)}">${ch0.pct == null ? '' : (ch0.pct >= 0 ? '▲ ' : '▼ ') + Math.abs(ch0.pct).toFixed(1) + '%'}</span> ${ch0.pct == null ? '' : esc(ch0.sub)}</p>
        ${c.tstats && c.tstats.pct != null ? `<div class="d-target"><span>${m.cols[c.metric] && m.cols[c.metric].name === c.tstats.valName ? T(`الإنجاز ${fmtPct(c.tstats.pct, 1)} من المستهدف`, `${fmtPct(c.tstats.pct, 1)} of target achieved`) : T(`${esc(c.tstats.valName)}: الإنجاز ${fmtPct(c.tstats.pct, 1)} من المستهدف`, `${esc(c.tstats.valName)}: ${fmtPct(c.tstats.pct, 1)} of target`)}</span>${vz('kpi') === 'number' ? '' : `<div class="d-bar-track"><i style="width:${Math.min(100, c.tstats.pct).toFixed(1)}%"></i></div>`}</div>` : ''}</article>
      <article class="d-card">${head(T('المؤشرات', 'Metrics'), T('اضغط مؤشرًا لعرضه', 'Tap a metric to show it'))}<ul class="d-list">${rows}</ul></article>
      ${c.dim >= 0 ? `<article class="d-card">${head(c.ml + T(' حسب ', ' by ') + m.cols[c.dim].name, '')}<div class="d-box d-hbox"><canvas data-cv="hbar" role="img" aria-label="${T('الترتيب', 'Ranking')}"></canvas></div></article>` : ''}
      ${mapHTML(c, 'd-card')}
      ${m.date >= 0 ? `<article class="d-card">${head(c.ml + T(' عبر الزمن', ' over time'), '')}<div class="d-box d-sbox"><canvas data-cv="line" role="img" aria-label="${T('الاتجاه', 'Trend')}"></canvas></div></article>` : ''}
      <article class="d-card">${head(T('ملاحظات', 'Insights'), '')}${insList(c)}</article>${recsHTML('d-card')}${notesHTML('d-card')}</section>`;
    return { html, after() { if (c.dim >= 0) chartBreakdown(c, 'hbar', vz('breakdown')); if (m.date >= 0) chartLine(c, 'line', c.metric); drawMap(c); } };
  }

  // ---------- ask the data ----------
  let askCtx = null, lastAnswer = null;
  function renderAsk() {
    const qb = root.querySelector('[data-askq]'), ab = root.querySelector('[data-askans]'); if (!qb || !askCtx) return;
    const qs = askQuestions({ m, c: askCtx, F: fcFor(askCtx), sqlFor, ti: timeIntel(askCtx) });
    if (!qs.length) { qb.innerHTML = ''; ab.innerHTML = `<p class="d-muted">${T('لا توجد بيانات كافية للأسئلة مع الفلاتر الحالية.', 'Not enough data for questions with the current filters.')}</p>`; return; }
    if (!qs.some(x => x.id === st.ask)) st.ask = qs[0].id;
    qb.innerHTML = qs.map(x => `<button type="button" data-ask="${x.id}" aria-pressed="${x.id === st.ask}">${esc(x.q)}</button>`).join('');
    const q = qs.find(x => x.id === st.ask), a = q.a();
    lastAnswer = { sql: a.sql, q: q.q };
    const safe = h => esc(h).replace(/&lt;(\/?)b&gt;/g, '<$1b>').replace(/([+−-]?\d[\d.,]*%)/g, '<bdi dir="ltr">$1</bdi>');
    ab.innerHTML = `<div class="d-askhead"><span class="d-askicon" aria-hidden="true">💡</span><p>${safe(a.head)}</p></div>
      ${a.items && a.items.length ? `${a.itemsTitle ? `<p class="d-askst">${esc(a.itemsTitle)}</p>` : ''}<ul class="d-askbars">${a.items.map(i => `<li class="${i.cls || ''}"><span class="k"><bdi>${esc(i.k)}</bdi></span><span class="bar"><i style="width:${Math.max(2, Math.round((i.w || 0) * 100))}%"></i>${a.avgLine != null ? `<em style="inset-inline-start:${Math.round(a.avgLine * 100)}%" title="${T('المتوسط', 'Average')}"></em>` : ''}</span><b><bdi dir="ltr">${i.pct ? (i.v > 0 ? '+' : i.v < 0 ? '−' : '') + Math.abs(i.v).toFixed(1) + '%' : (i.signed && i.v > 0 ? '+' : '') + fmt(i.v).replace(/^-/, '−')}</bdi></b><small>${esc(i.sub || '')}</small></li>`).join('')}</ul>` : ''}
      ${a.note ? `<p class="d-asknote">${esc(a.note)}</p>` : ''}
      ${a.sql ? `<button type="button" class="d-asksql no-export" data-asksql><span dir="ltr">{ } SQL</span> ${T('شوف الاستعلام وشغّله', 'See and run the query')}</button>` : ''}`;
  }

  // ---------- funnel (owner picks ordered stages, e.g. Impressions → Clicks → Leads → Clients) ----------
  function funnelStages() {
    const f = (o.project.config && o.project.config.funnel) || [];
    return f.map(n => m.idx(n)).filter(i => i >= 0 && m.nums.includes(i));
  }
  const pctS = (a, b) => { if (!a) return '—'; const p = b / a * 100; return fmtPct(p, p === 0 || p >= 10 ? 0 : p >= 1 ? 1 : p >= 0.1 ? 2 : 3); };
  // a funnel spans orders of magnitude, so bar widths use a log scale (labels keep the real numbers)
  const fW = (v, top) => v <= 0 ? 3 : Math.max(6, Math.log10(v + 1) / Math.log10(top + 1) * 100);
  function funnelHTML(c, cls) {
    const stg = funnelStages(); if (stg.length < 2) return '';
    const v = stg.map(i => m.agg(c.rows, i)), top = Math.max(...v.map(Math.abs), 1);
    let worst = -1, wr = Infinity; v.slice(1).forEach((x, k) => { const r = v[k] ? x / v[k] : Infinity; if (r < wr && r < 1) { wr = r; worst = k; } });
    const rowsH = stg.map((mi, k) => `${k ? `<div class="d-fstep ${k - 1 === worst ? 'worst' : ''}"><span>↓ ${pctS(v[k - 1], v[k])}</span>${k - 1 === worst ? `<em>${T('أكبر تسرّب', 'Biggest drop')}</em>` : ''}</div>` : ''}
      <div class="d-frow" style="--w:${fW(v[k], top).toFixed(1)}%;--k:${k}"><span class="d-fn"><bdi>${esc(m.cols[mi].name)}</bdi></span><span class="d-fbar"><i></i></span><b class="d-fv">${m.fmtOf(mi)(v[k])}</b></div>`).join('');
    sqlSet('funnel', { kind: 'funnel', stages: stg, metric: -1 });
    const last = v[v.length - 1], first = v[0];
    let per = 100; while (first && last > 0 && last / first * per < 1 && per < 1e7) per *= 10;
    const n0 = esc(m.cols[stg[0]].name), n1 = esc(m.cols[stg[stg.length - 1]].name), got = first ? Math.round(last / first * per) : 0;
    const sum = first ? T(`من كل ${per.toLocaleString("en-US")} في «${n0}» يوصل ${fmtBase(got)} إلى «${n1}».`, `Of every ${per.toLocaleString("en-US")} “${n0}”, ${fmtBase(got)} reach “${n1}”.`) + (top / Math.max(1, Math.abs(last)) > 50 ? `<br><small>${T('عرض الأشرطة بمقياس لوغاريتمي عشان تبان كل المراحل؛ الأرقام حقيقية.', 'Bar widths use a log scale so every stage stays visible; the numbers are real.')}</small>` : '') : '';
    return `<article class="${cls} d-funnel">${head(T('قمع التحويل', 'Conversion funnel'), T('التحويل الكلي ', 'Overall conversion ') + pctS(first, last))}<div data-cv="funnel" class="d-fbody">${rowsH}</div>${sum ? `<p class="d-fsum">${sum}</p>` : ''}</article>`;
  }
  function funnelPage(c) {
    const stg = funnelStages(), dim = c.dim;
    let tbl = '';
    if (dim >= 0) {
      const g = m.groups(c.rows, r => r[dim] == null ? null : String(r[dim]));
      const rs = [...g.entries()].map(([k, x]) => ({ k, v: stg.map(i => m.agg(x, i)) })).sort((a, b) => b.v[0] - a.v[0]).slice(0, 12);
      const best = Math.max(...rs.map(r => r.v[0] ? r.v[r.v.length - 1] / r.v[0] : -1));
      tbl = `<article class="d-card d-periods">${head(T('التحويل حسب ', 'Conversion by ') + esc(m.cols[dim].name), T('نسبة كل مرحلة من اللي قبلها', 'Each stage as a share of the one before'))}<div class="d-pscroll" data-cv="funneltbl"><table class="d-ptbl"><thead><tr><th>${esc(m.cols[dim].name)}</th><th>${esc(m.cols[stg[0]].name)}</th>${stg.slice(1).map(i => `<th>→ ${esc(m.cols[i].name)}</th>`).join('')}<th>${T('الكلي', 'Overall')}</th></tr></thead><tbody>${rs.map(r => { const ov = r.v[0] ? r.v[r.v.length - 1] / r.v[0] : -1; return `<tr><td><bdi>${esc(r.k)}</bdi></td><td>${m.fmtOf(stg[0])(r.v[0])}</td>${r.v.slice(1).map((x, k) => `<td>${m.fmtOf(stg[k + 1])(x)} <small>${pctS(r.v[k], x)}</small></td>`).join('')}<td class="${ov === best && rs.length > 1 ? 'up' : ''}"><b>${pctS(r.v[0], r.v[r.v.length - 1])}</b></td></tr>`; }).join('')}</tbody></table></div></article>`;
      sqlSet('funneltbl', { kind: 'funnel', stages: stg, dim, metric: -1 });
    }
    return { html: `<section class="d-pagegrid one">${funnelHTML(c, 'd-card d-funnelbig')}${tbl}</section>`, after() {} };
  }

  // ---------- pages ----------
  const PI = {
    overview: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
    trend: '<path d="M3 17l5-5 4 3 4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 11l5-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="2 3"/>',
    map: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="9.5" r="2.5"/>',
    notes: '<path d="M5 4h14v16l-4-3H5z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M8 9h8M8 12.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    ask: '<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="13.6" r="1"/>',
    data: '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3 9.5h18M3 14.5h18M9.5 4v16" stroke="currentColor" stroke-width="1.8"/>',
    funnel: '<path d="M3 4h18l-7 8v6l-4 2v-8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
    all: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
  };
  function pages() {
    const l = [['overview', T('نظرة عامة', 'Overview')], ['ask', T('اسأل البيانات', 'Ask the data')]];
    if (m.date >= 0 && m.series(m.rows, -1).length >= 2) l.push(['trend', (f => f && !f.unreliable)(fcFor({ rows: m.rows, metric: metricIdx() })) ? T('الاتجاه والتوقع', 'Trend & forecast') : T('الاتجاه', 'Trend')]);
    if (funnelStages().length >= 2) l.push(['funnel', T('القمع', 'Funnel')]);
    if (geo >= 0) l.push(['map', T('المواقع', 'Locations')]);
    if (recItems().length || noteItems().length) l.push(['notes', T('التوصيات والملاحظات', 'Recommendations & notes')]);
    l.push(['data', T('البيانات', 'Data')]);
    return l.length > 2 ? l.concat([['all', T('عرض الكل', 'Show all')]]) : null;
  }
  function renderNav() {
    const nav = root.querySelector('[data-pages]'), lay = root.querySelector('[data-layout]'), tc = root.querySelector('[data-tablecard]');
    const pl = pages();
    if (!pl) { st.view = 'all'; nav.hidden = true; lay.classList.remove('has-pages'); tc.hidden = false; return; }
    if (!pl.some(p => p[0] === st.view)) st.view = 'overview';
    nav.hidden = false; lay.classList.add('has-pages');
    nav.innerHTML = pl.map(([k, l]) => `<button type="button" data-view="${k}" class="${k === 'all' ? 'd-pall' : ''}" aria-current="${st.view === k ? 'page' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true">${PI[k]}</svg><span>${esc(l)}</span></button>`).join('');
    tc.hidden = !(st.view === 'data' || st.view === 'all');
  }
  // ---------- time intelligence: month vs previous month / same month last year, YTD vs last year's YTD ----------
  const addM = (k, n) => { let [y, mo] = k.split('-').map(Number); mo += n; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return `${y}-${String(mo).padStart(2, '0')}`; };
  const chPct = (a, b) => b ? (a - b) / Math.abs(b) * 100 : null;
  function timeIntel(c) {
    if (m.date < 0 || !m.monthly) return null;
    const base = regionRows(m.filter(st.filters, '')), mi = c.metric; // last year must stay reachable even when a period range is set
    const key = r => r[m.date] ? String(r[m.date]).slice(0, 7) : null;
    const byK = m.groups(base, key), keys = [...byK.keys()].sort(); if (keys.length < 2) return null;
    let end = keys[keys.length - 1]; if (st.range && st.range.to && st.range.to < end) end = keys.filter(k => k <= st.range.to).pop() || end;
    // a running last month is compared with the same days of the other periods
    const cap = end === m.partial ? m.partialDay : 0, capK = new Set([addM(end, -1), addM(end, -12)]);
    const day = r => +String(r[m.date]).slice(8, 10);
    const val = (ks, capped) => { const rs = []; let n = 0; ks.forEach((k, i) => { let x = byK.get(k); if (x) { if (cap && capped && (i === ks.length - 1 || capK.has(k))) x = x.filter(r => day(r) <= cap); rs.push(...x); n++; } }); return n ? m.agg(rs, mi) : null; };
    const span = (from, to) => { const out = []; for (let k = from; k <= to; k = addM(k, 1)) out.push(k); return out; };
    const have = ks => ks.filter(k => byK.has(k)).length;
    const y = end.slice(0, 4), ytd = span(`${y}-01`, end), ytdLY = ytd.map(k => addM(k, -12));
    const cur = val([end]), pm = val([addM(end, -1)], true), ly = val([addM(end, -12)], true);
    const r3 = span(addM(end, -2), end), p3 = r3.map(k => addM(k, -3));
    const out = [];
    out.push({ id: 'month', label: pLabel(end), sub: cap ? T(`شهر جاري · لين يوم ${cap}، والمقارنة بنفس الأيام`, `Month in progress · to day ${cap}, compared on the same days`) : T('آخر شهر', 'Latest month'), v: cur, vs: [{ lab: T('عن ', 'vs ') + pLabel(addM(end, -1)), pct: pm == null ? null : chPct(cur, pm) }, { lab: T('عن ', 'vs ') + pLabel(addM(end, -12)), pct: ly == null ? null : chPct(cur, ly), yoy: true }] });
    const ytdV = val(ytd), ytdL = have(ytdLY) ? val(ytdLY, true) : null;
    out.push({ id: 'ytd', label: T('من بداية ', 'YTD ') + y, sub: ytd.length > 1 ? `${pLabel(ytd[0])} – ${pLabel(end)}` : pLabel(end), v: ytdV, vs: [{ lab: T('عن نفس الفترة ', 'vs same period ') + (+y - 1), pct: ytdL == null ? null : chPct(ytdV, ytdL), yoy: true, partial: ytdL != null && have(ytdLY) < ytdLY.length }] });
    if (have(r3) === 3 && have(p3) === 3) out.push({ id: 'q', label: T('آخر 3 أشهر', 'Last 3 months'), sub: `${pLabel(r3[0])} – ${pLabel(end)}`, v: val(r3), vs: [{ lab: T('عن الـ3 أشهر اللي قبلها', 'vs the 3 months before'), pct: chPct(val(r3), val(p3, true)) }, ...(have(r3.map(k => addM(k, -12))) === 3 ? [{ lab: T('عن نفس الفترة السنة الماضية', 'vs same period last year'), pct: chPct(val(r3), val(r3.map(k => addM(k, -12)), true)), yoy: true }] : [])] });
    const r12 = span(addM(end, -11), end), p12 = r12.map(k => addM(k, -12));
    if (have(r12) === 12 && have(p12) === 12) out.push({ id: 'r12', label: T('آخر 12 شهر', 'Last 12 months'), sub: `${pLabel(r12[0])} – ${pLabel(end)}`, v: val(r12), vs: [{ lab: T('عن الـ12 شهر اللي قبلها', 'vs the previous 12 months'), pct: chPct(val(r12), val(p12, true)), yoy: true }] });
    const lyOf = k => val([addM(k, -12)]);
    return { end, items: out, hasLY: out.some(x => x.vs.some(v => v.yoy && v.pct != null)), lyOf, byK };
  }
  function tiHTML(c, ti) {
    if (!ti) return '';
    const chip = v => `<li class="${v.pct == null ? 'na' : arrowCls(v.pct)}"><b>${v.pct == null ? '—' : (v.pct > 0 ? '▲ ' : v.pct < 0 ? '▼ ' : '') + Math.abs(v.pct).toFixed(1) + '%'}</b> <span>${esc(v.lab)}${v.pct == null ? T(' · لا توجد بيانات', ' · no data') : ''}${v.partial ? T(' · بيانات ناقصة', ' · partial data') : ''}</span></li>`;
    return `<article class="d-card d-ti">${head(T('مقارنة الفترات', 'Period comparison'), c.ml + (ti.hasLY ? '' : T(' · المقارنة بالسنة الماضية تطلع لما يكون فيه بيانات سنة كاملة قبلها', ' · year-over-year appears once there is a year of earlier data')))}<div class="d-tigrid">${ti.items.map(x => `<div class="d-tibox"><p class="d-til">${esc(x.label)}</p><p class="d-tis">${esc(x.sub)}</p><p class="d-tiv">${x.v == null ? '—' : fmt(x.v)}</p><ul class="d-tic">${x.vs.map(chip).join('')}</ul></div>`).join('')}</div></article>`;
  }
  function trendPage(c) {
    const s = m.series(c.rows, c.metric), F0 = fcFor(c), F = F0 && !F0.unreliable ? F0 : null;
    const ti = timeIntel(c), yo = ti && ti.hasLY, pc = ch => ch == null ? '—' : (ch > 0 ? '+' : ch < 0 ? '−' : '') + Math.abs(ch).toFixed(1) + '%';
    const rowsH = s.map((p, i) => { const pv = i ? s[i - 1].v : null, ch = pv ? (p.v - pv) / Math.abs(pv) * 100 : null; const lv = yo && /^\d{4}-\d{2}$/.test(p.k) ? ti.lyOf(p.k) : null, yc = lv ? chPct(p.v, lv) : null; return `<tr><td>${esc(pLabel(p.k))}</td><td>${fmt(p.v)}</td><td class="${arrowCls(ch)}">${pc(ch)}</td>${yo ? `<td class="${arrowCls(yc)}">${pc(yc)}</td>` : ''}</tr>`; }).reverse().join('');
    const fcRows = F ? F.keys.map((k, i) => `<tr class="fc"><td>${esc(pLabel(k))} <small>${T('متوقع', 'forecast')}</small></td><td>${fmt(F.pts[i])}</td><td${yo ? ' colspan="2"' : ''}><small>${fmt(F.band[i][0])} – ${fmt(F.band[i][1])}</small></td></tr>`).reverse().join('') : '';
    return { html: `<section class="d-pagegrid">
      ${tiHTML(c, ti)}
      <article class="d-card d-trendbig">${head(F ? T('الاتجاه والتوقع', 'Trend & forecast') : T('الاتجاه', 'Trend'), c.ml + (m.monthly ? T(' · شهريًا', ' · monthly') : T(' · يوميًا', ' · daily')) + (F ? T(' · الأشهر القادمة بخط متقطع', ' · coming months dashed') : ''))}<div class="d-box"><canvas data-cv="trend" role="img" aria-label="${T('الاتجاه', 'Trend')}"></canvas></div></article>
      <article class="d-card d-periods">${head(T('الأرقام حسب الفترة', 'By period'), T('الأحدث أولًا', 'Newest first'))}<div class="d-pscroll"><table class="d-ptbl"><thead><tr><th>${T('الفترة', 'Period')}</th><th>${esc(c.ml)}</th><th>${T('عن الشهر السابق', 'vs prev.')}</th>${yo ? `<th>${T('عن السنة الماضية', 'vs last year')}</th>` : ''}</tr></thead><tbody>${fcRows}${rowsH}</tbody></table></div></article>
    </section>`, after() { chartLine(c, 'trend', c.metric, ti); } };
  }
  function pageOf(c) {
    const v = st.view;
    if (v === 'trend') return trendPage(c);
    if (v === 'funnel') return funnelPage(c);
    if (v === 'map') return { html: `<section class="d-pagegrid one">${mapHTML(c, 'd-card d-mapbig')}</section>`, after() { drawMap(c); } };
    if (v === 'notes') return { html: `<section class="d-pagegrid one">${recsHTML('d-card')}${notesHTML('d-card')}</section>`, after() {} };
    if (v === 'data') return { html: '', after() {} };
    if (v === 'ask') return { html: `<section class="d-pagegrid one"><article class="d-card d-ask">${head(T('اسأل البيانات', 'Ask the data'), T('اختر سؤالًا، والإجابة تُحسب مباشرة من بياناتك حسب الفلاتر الحالية', 'Pick a question — answered instantly from your data and current filters'))}<div class="d-askq" data-askq role="group"></div><div class="d-askans" data-askans aria-live="polite"></div></article></section>`, after() { askCtx = c; renderAsk(); } };
    return null;
  }

  function renderBody() {
    Object.keys(charts).forEach(kill); killMaps(); sqlReg = {};
    const c = ctx();
    setFmt(m.fmtOf(c.metric));
    chartBase(c.ink, c.grid);
    const tpl = o.project.template === 'executive' ? tplExecutive : o.project.template === 'compact' ? tplCompact : tplTiles;
    renderNav();
    const t = pageOf(c) || tpl(c), body = root.querySelector('[data-body]');
    body.innerHTML = t.html; body.hidden = !t.html;
    if ((st.view === 'overview' || st.view === 'all') && t.html && funnelStages().length >= 2 && !body.querySelector('.d-funnel')) {
      const first = body.querySelector('section'); const fh = `<section class="d-recsec d-fsec">${funnelHTML(c, ['executive', 'compact'].includes(o.project.template) ? 'd-card' : 'd-tile')}</section>`;
      if (first) first.insertAdjacentHTML('afterend', fh); else body.insertAdjacentHTML('afterbegin', fh);
    }
    if (st.view === 'overview') {
      // the other pages carry these, so the overview stays short
      body.querySelectorAll('.d-maptile, .d-recs, .d-notesx, .d-fctile').forEach(el => el.remove());
      body.querySelectorAll('.d-mapsec, .d-recsec').forEach(el => { if (!el.children.length) el.remove(); });
    }
    if (window.Chart) t.after(); else drawMap(c);
    addSqlButtons();
  }

  function renderTable() {
    let rows = rangeRows(regionRows(m.filter(st.filters, st.search)));
    if (st.sortCol != null && st.sortCol < m.cols.length) {
      const c = st.sortCol, d = st.sortDir;
      rows = rows.slice().sort((a, b) => { const x = a[c], y = b[c]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), isEn() ? 'en' : 'ar')) * d; });
    }
    const PAGE = 15, pages = Math.max(1, Math.ceil(rows.length / PAGE)); if (st.page >= pages) st.page = pages - 1; if (st.page < 0) st.page = 0;
    const slice = rows.slice(st.page * PAGE, st.page * PAGE + PAGE), q = s => root.querySelector(s);
    const vis = m.cols.map((c, i) => i).filter(i => !m.cols[i].virtual);
    q('[data-thead]').innerHTML = '<tr>' + vis.map(i => `<th scope="col"><button type="button" data-sort="${i}">${esc(m.cols[i].name)}${st.sortCol === i ? (st.sortDir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('') + '</tr>';
    q('[data-tbody]').innerHTML = slice.length ? slice.map(r => '<tr>' + vis.map(i => m.cols[i].type === 'number' ? `<td class="num">${typeof r[i] === 'number' ? r[i].toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''}</td>` : `<td>${esc(r[i] ?? '')}</td>`).join('') + '</tr>').join('') : `<tr><td class="d-none" colspan="${vis.length}">${T('لا توجد صفوف مطابقة.', 'No matching rows.')}</td></tr>`;
    q('[data-count]').textContent = rows.length.toLocaleString('en-US') + T(' سجل', ' records');
    q('[data-pager]').innerHTML = pages > 1 ? `<button type="button" data-pg="-1" ${st.page === 0 ? 'disabled' : ''}>${T('السابق', 'Previous')}</button><span>${st.page + 1} / ${pages}</span><button type="button" data-pg="1" ${st.page >= pages - 1 ? 'disabled' : ''}>${T('التالي', 'Next')}</button>` : '';
  }

  // ---------- saved views (bookmarks) and view links ----------
  function capture() {
    const nm = i => m.cols[i] ? m.cols[i].name : null, s = {};
    if (st.view && st.view !== 'overview') s.v = st.view;
    if (st.metric != null) s.mt = st.metric === -1 ? '__count' : nm(st.metric);
    if (st.dim != null) s.d = nm(st.dim);
    const f = {}; Object.entries(st.filters).forEach(([ci, v]) => { if (v != null && nm(+ci)) f[nm(+ci)] = v; }); if (Object.keys(f).length) s.f = f;
    if (st.range) s.r = st.range; if (st.region) s.rg = st.region;
    return s;
  }
  function applyState(s) {
    if (!s || !m) return;
    st.view = s.v || 'overview';
    st.metric = s.mt == null ? null : s.mt === '__count' ? -1 : (m.idx(s.mt) >= 0 ? m.idx(s.mt) : null);
    st.dim = s.d && m.idx(s.d) >= 0 ? m.idx(s.d) : null;
    st.filters = {}; Object.entries(s.f || {}).forEach(([n, v]) => { const i = m.idx(n); if (i >= 0) st.filters[i] = v; });
    st.range = s.r || null; st.region = s.rg || null; st.page = 0; st.openMs = null;
  }
  const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const enc = s => { try { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))).replace(/=+$/, ''); } catch (e) { return ''; } };
  const bms = () => (o.project.config && o.project.config.bookmarks) || [];
  let bmForm = false;
  function renderBms() {
    const box = root.querySelector('[data-bms]'); if (!box) return;
    const list = bms(), cur = capture(), ed = !!o.editable;
    if (!list.length && !ed && !o.shareUrl) { box.hidden = true; return; }
    box.hidden = false;
    const chips = list.length ? [`<button type="button" class="d-bm ${sameState(cur, {}) ? 'on' : ''}" data-bm="-1" aria-pressed="${sameState(cur, {})}">${T('العرض الأساسي', 'Default view')}</button>`]
      .concat(list.map((b, i) => `<span class="d-bmw"><button type="button" class="d-bm ${sameState(cur, b.state || {}) ? 'on' : ''}" data-bm="${i}" aria-pressed="${sameState(cur, b.state || {})}"><bdi>${esc(b.name)}</bdi></button>${ed ? `<button type="button" class="d-bmx" data-bmdel="${i}" aria-label="${T('حذف', 'Delete')} ${esc(b.name)}">✕</button>` : ''}</span>`)) : [];
    const add = ed ? (bmForm ? `<span class="d-bmform"><input data-bmname maxlength="30" placeholder="${T('اسم العرض (مثل: Meta آخر 3 أشهر)', 'View name (e.g. Meta, last 3 months)')}" aria-label="${T('اسم العرض', 'View name')}"><button type="button" class="d-bm on" data-bmsave>${T('حفظ', 'Save')}</button><button type="button" class="d-bm" data-bmcancel>${T('إلغاء', 'Cancel')}</button></span>`
      : `<button type="button" class="d-bm d-bmadd" data-bmadd>+ ${T('احفظ هذا العرض', 'Save this view')}</button>`) : '';
    const link = o.shareUrl ? `<button type="button" class="d-bm d-bmlink" data-bmlink title="${T('انسخ رابط يفتح اللوحة بنفس الفلاتر والصفحة', 'Copy a link that opens the dashboard with these filters and page')}">🔗 ${T('رابط هذا العرض', 'Link to this view')}</button>` : '';
    box.innerHTML = `${list.length ? `<span class="d-bml">${T('المشاهد:', 'Views:')}</span>` : ''}${chips.join('')}${add}${link}<span class="d-bmmsg" data-bmmsg role="status"></span>`;
    if (bmForm) { const i = box.querySelector('[data-bmname]'); if (i) i.focus(); }
  }
  root.addEventListener('click', async e => {
    const t = e.target; if (!root.contains(t) || !t.closest('[data-bms]')) return;
    const b = t.closest('[data-bm]'); if (b) { const i = +b.dataset.bm; applyState(i < 0 ? {} : (bms()[i] || {}).state); renderData(); return; }
    if (t.closest('[data-bmadd]')) { bmForm = true; renderBms(); return; }
    if (t.closest('[data-bmcancel]')) { bmForm = false; renderBms(); return; }
    const del = t.closest('[data-bmdel]'); if (del && o.onBookmarks) { const l = bms().slice(); l.splice(+del.dataset.bmdel, 1); o.onBookmarks(l); return; }
    if (t.closest('[data-bmsave]')) {
      const inp = root.querySelector('[data-bmname]'), name = inp && inp.value.trim(), msg = root.querySelector('[data-bmmsg]');
      if (!name) { if (msg) msg.textContent = T('اكتب اسم للعرض.', 'Type a name for the view.'); return; }
      bmForm = false; if (o.onBookmarks) o.onBookmarks(bms().filter(x => x.name !== name).concat([{ name, state: capture() }])); return;
    }
    if (t.closest('[data-bmlink]')) {
      const st0 = capture(), url = o.shareUrl.split('#')[0] + (Object.keys(st0).length ? '#v=' + enc(st0) : ''), msg = root.querySelector('[data-bmmsg]');
      try { await navigator.clipboard.writeText(url); if (msg) msg.textContent = T('تم نسخ الرابط ✓', 'Link copied ✓'); }
      catch (err) { if (msg) msg.innerHTML = `<input readonly value="${esc(url)}" onfocus="this.select()" aria-label="${T('الرابط', 'Link')}">`; }
      return;
    }
  });
  root.addEventListener('keydown', e => { if (e.target.matches && e.target.matches('[data-bmname]') && e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-bmsave]').click(); } });

  function renderData() { renderBms(); renderBar(); renderBody(); renderTable(); }

  // phones (in-app browsers especially) can change the page width after the first draw: refit every chart
  let rzT = null;
  const refit = () => { clearTimeout(rzT); rzT = setTimeout(() => Object.values(charts).forEach(ch => { try { ch.resize(); } catch (e) {} }), 120); };
  window.addEventListener('resize', refit); window.addEventListener('orientationchange', refit); window.addEventListener('pageshow', refit);
  if (window.ResizeObserver) new ResizeObserver(refit).observe(root);
  setup(); if (o.state) applyState(o.state); frame();
  return {
    // keep the viewer's filters/page across data refreshes and editor changes
    update(next) { killMaps(); const keep = m ? capture() : null; o = { ...o, ...next }; setup(); if (keep) applyState(keep); frame(); },
    setTemplate(t) { killMaps(); o.project = { ...o.project, template: t }; frame(); },
    destroy() { Object.keys(charts).forEach(kill); killMaps(); root.innerHTML = ''; }
  };
}
