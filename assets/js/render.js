// Dashboard renderer: three templates sharing one interactive model.
import { findGeoCol, coordOf, loadLeaflet } from './geo.js';
import { createModel, autoInsights, targetStats, brandTheme, loadFont, fmt, fmtPct, pLabel, fmtDate, esc, alpha, onColor, T, isEn } from './engine.js';

export const TEMPLATES = {
  tiles: { name: 'مربعات تحليلية', en: 'Analytical tiles', desc: 'شبكة مربعات بأرقام كبيرة ونسب تغير ورسوم صغيرة' },
  executive: { name: 'تقرير تنفيذي', en: 'Executive report', desc: 'شريط بهوية الجهة ومؤشرات ورسم اتجاه كبير' },
  compact: { name: 'ملخص للجوال', en: 'Mobile summary', desc: 'عمود واحد مرتب يناسب الشاشات الصغيرة' }
};

// chart type per slot; the owner can override in project.config.viz
const VIZ_DEFAULT = {
  tiles: { breakdown: 'bar', share: 'doughnut', trend: 'area', kpi: 'gauge' },
  executive: { breakdown: 'hbar', share: 'doughnut', trend: 'area', kpi: 'bar' },
  compact: { breakdown: 'hbar', share: 'doughnut', trend: 'area', kpi: 'bar' }
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
        if (o.mode === 'top') { if (el.width < 20) return; ctx.fillStyle = o.color; ctx.textBaseline = 'bottom'; ctx.fillText(fmt(v), el.x, el.y - 3); }
        else if (o.mode === 'inside') { const h = Math.abs(el.base - el.y); if (h < 16 || el.width < 26) return; ctx.fillStyle = onColor(bg); ctx.textBaseline = 'middle'; ctx.fillText(fmt(v), el.x, (el.y + el.base) / 2); }
        else if (o.mode === 'end') { ctx.fillStyle = o.color; ctx.textBaseline = 'middle'; ctx.textAlign = isEn() ? 'left' : 'right'; ctx.fillText(fmt(v), el.x + (isEn() ? 6 : -6), el.y); ctx.textAlign = 'center'; }
        else if (o.mode === 'pct') { const p = v / tot * 100; if (p < 5) return; const pos = el.tooltipPosition(); ctx.fillStyle = onColor(bg); ctx.textBaseline = 'middle'; ctx.fillText(p.toFixed(0) + '%', pos.x, pos.y); }
      });
    });
    ctx.restore();
  }
};
const OTHER = () => T('أخرى', 'Other');
const wrapLabel = s => { s = String(s); if (s.length <= 10) return s; const w = s.split(' '); if (w.length < 2) return s; const h = Math.ceil(w.length / 2); return [w.slice(0, h).join(' '), w.slice(h).join(' ')]; };
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
  let geo = -1;
  const st = { filters: {}, metric: null, dim: null, search: '', sortCol: null, sortDir: -1, page: 0 };
  let o = opts, m, theme;

  function kill(k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } }
  function draw(k, cfg) { kill(k); const cv = root.querySelector('[data-cv="' + k + '"]'); if (cv && window.Chart) charts[k] = new Chart(cv, cfg); }

  function setup() {
    m = o.version ? createModel(o.version.data) : null;
    geo = m ? findGeoCol(m) : -1;
    theme = brandTheme(o.project.brand);
    loadFont(theme.font);
    st.filters = {}; st.metric = null; st.dim = null; st.page = 0; st.sortCol = null;
  }
  function metricIdx() { return (st.metric != null && (st.metric === -1 || m.nums.includes(st.metric))) ? st.metric : (m.nums.length ? m.nums[0] : -1); }
  function dimIdx() { return (st.dim != null && m.cats.includes(st.dim)) ? st.dim : (m.dims.length ? m.dims[0] : -1); }
  const vz = slot => { const v = o.project.config && o.project.config.viz && o.project.config.viz[slot]; return v || vizDefault(TEMPLATES[o.project.template] ? o.project.template : 'tiles', slot); };
  const activeF = () => Object.entries(st.filters).filter(([, v]) => v != null);

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
        <div class="d-meta">${(v && v.period) || p.period ? `<span class="d-chip">${esc((v && v.period) || p.period)}</span>` : ''}${v ? `<span class="d-upd"><i></i>${T('آخر تحديث', 'Updated')} ${esc(fmtDate(v.created_at))}</span>` : ''}</div>
      </div></header>
      ${m ? `<div class="d-bar" data-bar></div><div class="d-body" data-body></div>
      <section class="d-card d-tablecard"><div class="d-tablehead">${head(T('البيانات', 'Data'), '')}<span class="d-count" data-count></span><input type="search" class="d-search" data-search placeholder="${T('بحث في الجدول', 'Search table')}" aria-label="${T('بحث في الجدول', 'Search table')}"></div>
        <div class="d-scroll"><table class="d-table"><thead data-thead></thead><tbody data-tbody></tbody></table></div><div class="d-pager" data-pager></div></section>`
      : `<div class="d-empty"><p>${T('لا توجد بيانات بعد.', 'No data yet.')}</p><p class="d-muted">${T('ارفع ملف Excel من صفحة المشروع لتظهر لوحة المؤشرات هنا.', 'Upload an Excel file from the project page to see the dashboard here.')}</p></div>`}
      <footer class="d-foot">${T('صُنع بـ <strong>لوحة المؤشرات</strong>', 'Made with <strong>Dashboard</strong>')}</footer>
    </div>`;
    if (!m) return;
    const q = s => root.querySelector(s);
    q('[data-bar]').addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.k === 'metric') st.metric = +t.value;
      else if (t.dataset.k === 'dim') st.dim = +t.value;
      else if (t.dataset.f != null) { if (t.value) st.filters[t.dataset.f] = t.value; else delete st.filters[t.dataset.f]; st.page = 0; }
      renderData();
    });
    q('[data-bar]').addEventListener('click', e => { if (e.target.closest('[data-clear]')) { st.filters = {}; st.page = 0; renderData(); } });
    const pick = e => { const k = e.target.closest('[data-mi]'); if (!k) return; st.metric = +k.dataset.mi; renderData(); };
    q('[data-body]').addEventListener('click', pick);
    q('[data-body]').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-mi]')) { e.preventDefault(); pick(e); } });
    q('[data-thead]').addEventListener('click', e => { const b = e.target.closest('[data-sort]'); if (!b) return; const i = +b.dataset.sort; if (st.sortCol === i) st.sortDir *= -1; else { st.sortCol = i; st.sortDir = m.cols[i].type === 'number' ? -1 : 1; } renderTable(); });
    q('[data-pager]').addEventListener('click', e => { const b = e.target.closest('[data-pg]'); if (!b) return; st.page += +b.dataset.pg; renderTable(); });
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
      h += `<label class="d-ctl"><span>${esc(m.cols[ci].name)}</span><select data-f="${ci}"><option value="">${T('الكل', 'All')}</option>${vals.map(v => `<option value="${esc(v)}" ${st.filters[ci] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    });
    const n = activeF().length;
    if (n) h += `<button type="button" class="d-clear" data-clear>${T('مسح الفلاتر', 'Clear filters')} (${n})</button>`;
    root.querySelector('[data-bar]').innerHTML = h;
  }

  function ctx() {
    const metric = metricIdx(), dim = dimIdx(), rows = m.filter(st.filters, '');
    const tcfg = o.project.config && o.project.config.target;
    const tstats = o.version.targets ? targetStats(m, rows, o.version.targets, tcfg, st.filters) : null;
    return {
      metric, dim, rows, tstats,
      sd: m.dims.find(c => c !== dim && c !== m.monthCol && m.uniq(c) >= 2) ?? -1,
      ml: m.label(metric), mean: m.isMean(metric), hasF: activeF().length > 0,
      pal: theme.palette, ink: theme.vars['--d-muted'], grid: theme.vars['--d-line'],
      prev: o.previous && o.previous.totals,
      insights: autoInsights(m, rows, metric, dim, tstats, 3)
    };
  }
  // change vs previous period (or previous upload)
  function change(c, mi) {
    const s = m.series(c.rows, mi);
    if (s.length >= 2) { const a = s[s.length - 1], p = s[s.length - 2]; if (p.v) return { pct: (a.v - p.v) / Math.abs(p.v) * 100, sub: pLabel(a.k) + T(' مقارنة بـ', ' vs ') + pLabel(p.k), s }; }
    if (c.prev && !c.hasF && mi >= 0 && c.prev[m.cols[mi].name]) { const pv = c.prev[m.cols[mi].name]; return { pct: (m.agg(c.rows, mi) - pv) / Math.abs(pv) * 100, sub: T('مقارنة بالتحديث السابق', 'vs previous update'), s }; }
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
      const bl = m.breakdown(c.rows, c.dim, c.metric).slice(0, 12), sel = st.filters[c.dim];
      draw(key, { type: 'line', data: { labels: bl.map(x => wrapLabel(x.k)), datasets: [{ label: c.ml, data: bl.map(x => x.v), borderColor: c.pal[0], backgroundColor: c.pal[0], tension: .3, borderWidth: 2.2, pointRadius: bl.map(x => sel === x.k ? 7 : 4), pointHoverRadius: 8, pointBackgroundColor: bl.map(x => sel == null || sel === x.k ? c.pal[0] : alpha(c.pal[0], .3)) }] },
        options: { responsive: true, maintainAspectRatio: false, animation: anim(), onClick: (e, els) => { if (!els.length) return; const k = bl[els[0].index].k; if (st.filters[c.dim] === k) delete st.filters[c.dim]; else st.filters[c.dim] = k; st.page = 0; renderData(); }, onHover: (e, els) => { if (e.native) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
          plugins: { legend: { display: false }, tooltip: tip() }, scales: { x: { reverse: !isEn(), grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } }, y: { position: isEn() ? 'left' : 'right', beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
      return;
    }
    const horizontal = type === 'hbar' || type === true;
    const b = m.breakdown(c.rows, c.dim, c.metric).slice(0, horizontal ? 10 : 8), sel = st.filters[c.dim];
    let ds;
    if (!horizontal && c.sd >= 0 && !c.mean) {
      const sb = m.breakdown(c.rows, c.sd, c.metric), keys = sb.slice(0, 3).map(x => x.k), other = sb.length > 3, labs = keys.concat(other ? [OTHER()] : []);
      ds = labs.map((lab, j) => ({ label: lab, data: b.map(x => m.agg(c.rows.filter(r => String(r[c.dim]) === x.k && (lab === OTHER() ? !keys.includes(String(r[c.sd])) : String(r[c.sd]) === lab)), c.metric)), backgroundColor: lab === OTHER() ? '#A9B4BC' : c.pal[j], maxBarThickness: 48 }));
    } else ds = [{ label: c.ml, data: b.map(x => x.v), backgroundColor: b.map(x => sel == null || sel === x.k ? c.pal[0] : alpha(c.pal[0], .3)), borderRadius: 3, maxBarThickness: horizontal ? 22 : 48 }];
    const click = (e, els) => { if (!els.length) return; const k = b[els[0].index].k; if (st.filters[c.dim] === k) delete st.filters[c.dim]; else st.filters[c.dim] = k; st.page = 0; renderData(); };
    const hover = (e, els) => { if (e.native) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
    if (horizontal) {
      const box = root.querySelector(`[data-cv="${key}"]`); if (box) box.parentElement.style.height = Math.max(200, b.length * 32 + 30) + 'px';
      draw(key, { type: 'bar', data: { labels: b.map(x => x.k), datasets: ds }, plugins: [valueLabels], options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: anim(), onClick: click, onHover: hover, layout: { padding: isEn() ? { right: 44 } : { left: 44 } },
        plugins: { legend: { display: false }, tooltip: tip(), valueLabels: { mode: 'end', color: c.ink, font: theme.font } },
        scales: { x: { reverse: !isEn(), beginAtZero: true, display: false }, y: { position: isEn() ? 'left' : 'right', grid: { display: false }, border: { display: false } } } } });
    } else {
      draw(key, { type: 'bar', data: { labels: b.map(x => wrapLabel(x.k)), datasets: ds }, plugins: [valueLabels], options: { responsive: true, maintainAspectRatio: false, animation: anim(), onClick: click, onHover: hover,
        plugins: { legend: { display: ds.length > 1, position: 'top', align: 'start', rtl: !isEn(), textDirection: isEn() ? 'ltr' : 'rtl', labels: { boxWidth: 10, boxHeight: 10, padding: 10 } }, tooltip: tip(), valueLabels: { mode: 'inside', font: theme.font } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } }, y: { stacked: true, beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
    }
  }
  function chartTargets(c, key) {
    const it = c.tstats.items.slice(0, 10);
    draw(key, { type: 'bar', data: { labels: it.map(x => wrapLabel(x.k)), datasets: [
      { label: T('الفعلي', 'Actual'), data: it.map(x => x.actual), backgroundColor: c.pal[0], borderRadius: 3, maxBarThickness: 30 },
      { label: T('المستهدف', 'Target'), data: it.map(x => x.target), backgroundColor: c.pal[1], borderRadius: 3, maxBarThickness: 30 }] },
      plugins: [valueLabels], options: { responsive: true, maintainAspectRatio: false, animation: anim(), layout: { padding: { top: 16 } },
        plugins: { legend: { position: 'top', align: 'start', rtl: !isEn(), textDirection: isEn() ? 'ltr' : 'rtl', labels: { boxWidth: 10, boxHeight: 10, padding: 10 } }, tooltip: tip(), valueLabels: { mode: 'top', color: c.ink, font: theme.font } },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
  }
  function chartShare(c, key, pd, type, clickable) {
    const b = m.breakdown(c.rows, pd, c.metric); let t5 = b.slice(0, 5); const rest = b.slice(5).reduce((s, x) => s + x.v, 0); if (rest > 0) t5 = t5.concat([{ k: OTHER(), v: rest }]);
    const pc = [c.pal[0], c.pal[2], c.pal[1], c.pal[3], c.pal[6]], sel = st.filters[pd];
    const cols = t5.map((x, i) => { const col = x.k === OTHER() ? '#A9B4BC' : pc[i % pc.length]; return sel == null || sel === x.k ? col : alpha(col, .3); });
    const click = (e, els) => { if (!els.length) return; const k = t5[els[0].index].k; if (k === OTHER()) return; if (st.filters[pd] === k) delete st.filters[pd]; else st.filters[pd] = k; st.page = 0; renderData(); };
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
  function chartLine(c, key, mi) {
    const s = m.series(c.rows, mi), tt = vz('trend');
    if (tt === 'bar') {
      draw(key, { type: 'bar', data: { labels: s.map(p => pLabel(p.k)), datasets: [{ data: s.map(p => p.v), backgroundColor: c.pal[0], borderRadius: 3, maxBarThickness: 40 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: anim(), plugins: { legend: { display: false }, tooltip: tip() }, scales: { x: { reverse: !isEn(), grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { position: isEn() ? 'left' : 'right', beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
      return;
    }
    draw(key, { type: 'line', data: { labels: s.map(p => pLabel(p.k)), datasets: [{ data: s.map(p => p.v), borderColor: c.pal[0], backgroundColor: alpha(c.pal[0], .14), fill: tt !== 'line', tension: .3, borderWidth: 2.2, pointRadius: s.length > 40 ? 0 : 3, pointBackgroundColor: c.pal[0] }] },
      options: { responsive: true, maintainAspectRatio: false, animation: anim(), plugins: { legend: { display: false }, tooltip: tip() }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
  }
  function chartMini(c, key, mi) {
    const pts = m.date >= 0 ? m.series(c.rows, mi).slice(-6).map(p => ({ k: pLabel(p.k), v: p.v })) : (c.dim >= 0 ? m.breakdown(c.rows, c.dim, mi).slice(0, 6) : []);
    draw(key, { type: 'bar', data: { labels: pts.map(p => p.k), datasets: [{ data: pts.map(p => p.v), backgroundColor: c.pal[0], borderRadius: 2, maxBarThickness: 24 }] }, plugins: [valueLabels],
      options: { responsive: true, maintainAspectRatio: false, animation: anim(), layout: { padding: { top: 16 } }, plugins: { legend: { display: false }, tooltip: tip(), valueLabels: { mode: 'top', color: c.ink, font: theme.font } },
        scales: { x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true } }, y: { display: false, beginAtZero: true } } } });
  }

  // ---------- location map ----------
  const mapTitle = c => c.ml + T(' حسب الموقع', ' by location');
  const mapHTML = (c, cls) => geo < 0 ? '' : `<article class="${cls} d-maptile">${head(mapTitle(c), m.cols[geo].name + T(' · اضغط دائرة للفلترة', ' · click a circle to filter'))}<div class="d-map" data-map dir="ltr" role="img" aria-label="${esc(mapTitle(c))}"></div><ol class="d-maprank" data-maprank></ol></article>`;
  function killMaps() { while (maps.length) { try { maps.pop().remove(); } catch (e) {} } }
  function drawMap(c) {
    const box = root.querySelector('[data-map]'); if (!box || geo < 0) return;
    const f = { ...st.filters }; delete f[geo];
    const rows = m.filter(f, ''), sel = st.filters[geo];
    const pts = m.breakdown(rows, geo, c.metric).map(x => ({ ...x, ll: coordOf(x.k) })).filter(x => x.ll && x.v > 0);
    const rank = root.querySelector('[data-maprank]'), tot = pts.reduce((s, x) => s + x.v, 0);
    if (rank) rank.innerHTML = pts.slice(0, 5).map((x, i) => `<li class="${sel == null || sel === x.k ? '' : 'dim'}"><span class="r">${i + 1}</span><bdi>${esc(x.k)}</bdi><b>${fmt(x.v)}</b>${!c.mean && tot ? `<i>${(x.v / tot * 100).toFixed(0)}%</i>` : ''}</li>`).join('');
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
        const on = sel == null || sel === x.k, r = 6 + 22 * Math.sqrt(x.v / max);
        const pt = map.latLngToContainerPoint(x.ll);
        const free = on && i < 8 && placed.every(q => Math.abs(q.x - pt.x) > 74 || Math.abs(q.y - pt.y) > 54);
        if (free) placed.push(pt);
        return { x, i, on, r, free };
      });
      mks.slice().reverse().forEach(({ x, on, r, free }) => {
        const mk = L.circleMarker(x.ll, { radius: r, color: '#fff', weight: 2, fillColor: sel === x.k ? col2 : col, fillOpacity: on ? .8 : .22, opacity: on ? 1 : .5 }).addTo(map);
        mk.bindTooltip(`<bdi>${esc(x.k)}</bdi><b>${fmt(x.v)}</b>`, { permanent: free, direction: 'top', offset: [0, -r + 2], className: 'd-maplbl', opacity: 1 });
        mk.on('click', () => { if (st.filters[geo] === x.k) delete st.filters[geo]; else st.filters[geo] = x.k; st.page = 0; renderData(); });
      });
    }).catch(() => { box.innerHTML = `<p class="d-muted" style="padding:16px">${T('تعذّر تحميل الخريطة.', 'Map could not be loaded.')}</p>`; });
  }

  // ---------- template: tiles ----------
  function tplTiles(c) {
    const total = m.agg(c.rows, c.metric);
    let top = `<article class="d-tile d-num">${head(c.ml, c.mean ? T('المتوسط', 'Average') : (c.hasF ? T('الإجمالي حسب الفلاتر', 'Filtered total') : T('الإجمالي', 'Total')))}<p class="d-big">${fmt(total)}</p>${c.tstats ? `<p class="d-sub">${T('المستهدف', 'Target')} ${fmt(c.tstats.target)}</p>` : ''}</article>`;
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
    if (c.tstats) top += `<article class="d-tile d-wide d-bartile">${head(T('الفعلي مقابل المستهدف', 'Actual vs target'), T('حسب ', 'by ') + c.tstats.keyName)}<div class="d-box"><canvas data-cv="bar" role="img" aria-label="${T('الفعلي مقابل المستهدف', 'Actual vs target')}"></canvas></div></article>`;
    else if (c.dim >= 0) top += `<article class="d-tile d-wide d-bartile">${head(c.ml + T(' حسب ', ' by ') + m.cols[c.dim].name, c.sd >= 0 && !c.mean ? T('مقسّم حسب ', 'Split by ') + m.cols[c.sd].name + T(' · اضغط عمودًا للفلترة', ' · click a bar to filter') : T('اضغط عمودًا للفلترة', 'Click a bar to filter'))}<div class="d-box"><canvas data-cv="bar" role="img" aria-label="${T('التوزيع', 'Breakdown')}"></canvas></div></article>`;
    else if (m.date >= 0) top += `<article class="d-tile d-wide d-bartile">${head(c.ml + T(' عبر الزمن', ' over time'), m.monthly ? T('شهريًا', 'Monthly') : T('يوميًا', 'Daily'))}<div class="d-box"><canvas data-cv="line" role="img" aria-label="${T('الاتجاه', 'Trend')}"></canvas></div></article>`;
    const pd = c.sd >= 0 ? c.sd : c.dim;
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
    const html = `<section class="d-top ${gauge ? 'has-gauge' : ''} ${pd >= 0 && !c.mean ? 'has-pie' : ''}">${top}</section>${geo >= 0 ? `<section class="d-mapsec">${mapHTML(c, 'd-tile')}</section>` : ''}
      <section class="d-bottom" style="--n:${n + 1}">${chg.slice(0, mid).join('')}<article class="d-tile d-hl" style="--mo:0">${hl}</article>${chg.slice(mid).join('')}${mini.slice(0, mid).join('')}<article class="d-tile d-notes" style="--mo:99">${head(T('ملاحظات', 'Insights'), '')}${insList(c)}</article>${mini.slice(mid).join('')}</section>`;
    return { html, after() {
      if (gauge && kv === 'gauge') chartGauge(c, 'gauge', gauge.v, gauge.max);
      if (c.tstats) chartTargets(c, 'bar'); else if (c.dim >= 0) chartBreakdown(c, 'bar', vz('breakdown')); else if (m.date >= 0) chartLine(c, 'line', c.metric);
      if (pd >= 0 && !c.mean) chartPie(c, 'pie', pd);
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
      kpis += `<article class="d-card d-kpi ${mi === c.metric ? 'on' : ''}" data-mi="${mi}" role="button" tabindex="0" aria-pressed="${mi === c.metric}"><p class="d-kl">${esc(m.label(mi))}</p><p class="d-kv">${fmt(m.agg(c.rows, mi))}</p><p class="d-kf"><span class="d-dl ${arrowCls(ch.pct)}">${ch.pct == null ? '' : (ch.pct >= 0 ? '▲ ' : '▼ ') + Math.abs(ch.pct).toFixed(1) + '%'}</span> ${ch.pct == null ? '' : esc(ch.sub)}</p>${spark(ch.s.map(p => p.v))}</article>`;
    });
    const hasLine = m.date >= 0;
    const html = `<section class="d-kpis">${kpis}</section>
      <section class="d-grid">
        ${hasLine ? `<article class="d-card d-span8">${head(c.ml + T(' عبر الزمن', ' over time'), m.monthly ? T('تجميع شهري', 'Monthly') : T('تجميع يومي', 'Daily'))}<div class="d-box"><canvas data-cv="line" role="img" aria-label="${T('الاتجاه', 'Trend')}"></canvas></div></article>` : ''}
        <article class="d-card ${hasLine ? 'd-span4' : 'd-span12'} d-notes-ex">${head(T('أبرز الملاحظات', 'Key insights'), '')}${insList(c)}</article>
        ${mapHTML(c, 'd-card d-span12')}
        ${c.dim >= 0 ? `<article class="d-card d-span6">${head(c.ml + T(' حسب ', ' by ') + m.cols[c.dim].name, T('اضغط أي شريط للفلترة', 'Click a bar to filter'))}<div class="d-box d-hbox"><canvas data-cv="hbar" role="img" aria-label="${T('الترتيب', 'Ranking')}"></canvas></div></article>` : ''}
        ${c.tstats ? `<article class="d-card d-span6">${head(T('الفعلي مقابل المستهدف', 'Actual vs target'), T('حسب ', 'by ') + c.tstats.keyName)}<div class="d-box"><canvas data-cv="tbar" role="img" aria-label="${T('الفعلي مقابل المستهدف', 'Actual vs target')}"></canvas></div></article>`
          : (c.sd >= 0 && !c.mean ? `<article class="d-card d-span6">${head(T('توزيع ', '') + c.ml + T(' حسب ', ' by ') + m.cols[c.sd].name, '')}<div class="d-box"><canvas data-cv="pie" role="img" aria-label="${T('الحصص', 'Shares')}"></canvas></div></article>` : '')}
      </section>`;
    return { html, after() {
      if (hasLine) chartLine(c, 'line', c.metric);
      if (c.dim >= 0) chartBreakdown(c, 'hbar', vz('breakdown'));
      if (c.tstats) chartTargets(c, 'tbar'); else if (c.sd >= 0 && !c.mean) chartPie(c, 'pie', c.sd);
      drawMap(c);
    } };
  }

  // ---------- template: compact ----------
  function tplCompact(c) {
    const total = m.agg(c.rows, c.metric), ch0 = change(c, c.metric);
    const metrics = m.nums.length ? m.nums.slice(0, 6) : [-1];
    const rows = metrics.map(mi => { const ch = change(c, mi); return `<li data-mi="${mi}" role="button" tabindex="0" class="${mi === c.metric ? 'on' : ''}" aria-pressed="${mi === c.metric}"><span class="d-ln">${esc(m.label(mi))}</span><span class="d-lv">${fmt(m.agg(c.rows, mi))}</span>${spark(ch.s.map(p => p.v).slice(-8))}<span class="d-dl ${arrowCls(ch.pct)}">${ch.pct == null ? '' : (ch.pct >= 0 ? '▲' : '▼') + Math.abs(ch.pct).toFixed(0) + '%'}</span></li>`; }).join('');
    const html = `<section class="d-stack">
      <article class="d-card d-hero"><p class="d-kl">${esc(c.ml)}${c.mean ? T(' (متوسط)', ' (avg)') : ''}</p><p class="d-kv">${fmt(total)}</p><p class="d-kf"><span class="d-dl ${arrowCls(ch0.pct)}">${ch0.pct == null ? '' : (ch0.pct >= 0 ? '▲ ' : '▼ ') + Math.abs(ch0.pct).toFixed(1) + '%'}</span> ${ch0.pct == null ? '' : esc(ch0.sub)}</p>
        ${c.tstats && c.tstats.pct != null ? `<div class="d-target"><span>${T(`الإنجاز ${fmtPct(c.tstats.pct, 1)} من المستهدف`, `${fmtPct(c.tstats.pct, 1)} of target achieved`)}</span>${vz('kpi') === 'number' ? '' : `<div class="d-bar-track"><i style="width:${Math.min(100, c.tstats.pct).toFixed(1)}%"></i></div>`}</div>` : ''}</article>
      <article class="d-card">${head(T('المؤشرات', 'Metrics'), T('اضغط مؤشرًا لعرضه', 'Tap a metric to show it'))}<ul class="d-list">${rows}</ul></article>
      ${c.dim >= 0 ? `<article class="d-card">${head(c.ml + T(' حسب ', ' by ') + m.cols[c.dim].name, '')}<div class="d-box d-hbox"><canvas data-cv="hbar" role="img" aria-label="${T('الترتيب', 'Ranking')}"></canvas></div></article>` : ''}
      ${mapHTML(c, 'd-card')}
      ${m.date >= 0 ? `<article class="d-card">${head(c.ml + T(' عبر الزمن', ' over time'), '')}<div class="d-box d-sbox"><canvas data-cv="line" role="img" aria-label="${T('الاتجاه', 'Trend')}"></canvas></div></article>` : ''}
      <article class="d-card">${head(T('ملاحظات', 'Insights'), '')}${insList(c)}</article></section>`;
    return { html, after() { if (c.dim >= 0) chartBreakdown(c, 'hbar', vz('breakdown')); if (m.date >= 0) chartLine(c, 'line', c.metric); drawMap(c); } };
  }

  function renderBody() {
    Object.keys(charts).forEach(kill); killMaps();
    const c = ctx();
    chartBase(c.ink, c.grid);
    const tpl = o.project.template === 'executive' ? tplExecutive : o.project.template === 'compact' ? tplCompact : tplTiles;
    const t = tpl(c);
    root.querySelector('[data-body]').innerHTML = t.html;
    if (window.Chart) t.after(); else drawMap(c);
  }

  function renderTable() {
    let rows = m.filter(st.filters, st.search);
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

  function renderData() { renderBar(); renderBody(); renderTable(); }

  setup(); frame();
  return {
    update(next) { killMaps(); o = { ...o, ...next }; setup(); frame(); },
    setTemplate(t) { killMaps(); o.project = { ...o.project, template: t }; frame(); },
    destroy() { Object.keys(charts).forEach(kill); killMaps(); root.innerHTML = ''; }
  };
}
