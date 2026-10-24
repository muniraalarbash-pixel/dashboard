// Personal home: greeting, date tiles, project chart, quick stats, activity, projects, calendar + secondary views.
import { sb, $, requireUser, setupNotice, toast, signOut, modeSwitchHTML, MODES, getMode, setMode } from './sb.js';
import { esc, fmt, fmtDate, pLabel, createModel, DEFAULT_BRAND, FONTS, AR_M } from './engine.js';

if (setupNotice($('#setup'))) throw new Error('not configured');
const user = await requireUser();
let meta = user.user_metadata || {};

const S = { projects: [], versions: [], selected: null, view: 'home', calY: 0, calM: 0, calDay: null, filter: 'all', q: '', metric: null };
const latestCache = new Map();
let chart = null, drawToken = 0;
const now = new Date();
S.calY = now.getFullYear(); S.calM = now.getMonth();

/* ---------- helpers ---------- */
const pad = n => String(n).padStart(2, '0');
const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
const name = () => (meta.full_name || '').trim() || user.email.split('@')[0];
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const projById = id => S.projects.find(p => p.id === id);
const color = p => (p && p.brand && /^#[0-9a-f]{6}$/i.test(p.brand.primary || '')) ? p.brand.primary : DEFAULT_BRAND.primary;
const shareUrl = p => new URL('view.html?s=' + p.share_slug, location.href).href;
function plural(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : (n >= 3 && n <= 10) ? `${n} ${few}` : `${n} ${many}`; }
function rel(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60); if (m < 60) return 'قبل ' + plural(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
  const h = Math.floor(m / 60); if (h < 24) return 'قبل ' + plural(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  const dd = Math.floor(h / 24); if (dd < 7) return 'قبل ' + plural(dd, 'يوم', 'يومين', 'أيام', 'يوم');
  return fmtDate(d);
}
let hijriFmt = null, hijriYear = null, weekdayFmt;
try { hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long' }); hijriYear = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { year: 'numeric' }); } catch (e) {}
try { weekdayFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { weekday: 'long' }); } catch (e) { weekdayFmt = new Intl.DateTimeFormat('ar', { weekday: 'long' }); }
const weekNo = d => { const s = new Date(d.getFullYear(), 0, 1); return Math.ceil(((d - s) / 864e5 + s.getDay() + 1) / 7); };

const ICON = {
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V5M7 10l5-5 5 5M5 19h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>'
};

/* ---------- data ---------- */
async function load() {
  const [p, v] = await Promise.all([
    sb.from('projects').select('id,title,topic,brand,template,is_published,share_slug,share_pass_hash,created_at,updated_at').order('updated_at', { ascending: false }),
    sb.from('versions').select('id,project_id,period,file_name,row_count,created_at').order('created_at', { ascending: false }).limit(500)
  ]);
  if (p.error) { $('#view').innerHTML = `<div class="notice err">تعذّر تحميل المشاريع: ${esc(p.error.message)}</div>`; return; }
  S.projects = p.data || []; S.versions = v.data || [];
  if (!S.selected || !projById(S.selected)) S.selected = S.projects[0] ? S.projects[0].id : null;
  renderAll();
}
function events() {
  const ev = S.versions.map(v => ({ type: 'upload', at: v.created_at, pid: v.project_id, text: `تم رفع ملف`, file: v.file_name || '' }))
    .concat(S.projects.map(p => ({ type: 'create', at: p.created_at, pid: p.id, text: 'تم إنشاء المشروع' })));
  return ev.sort((a, b) => new Date(b.at) - new Date(a.at));
}

async function createProject() {
  const row = { title: 'مشروع جديد' };
  if (meta.default_brand) row.brand = { ...DEFAULT_BRAND, ...meta.default_brand };
  const { data, error } = await sb.from('projects').insert(row).select('id').single();
  if (error) { toast('تعذّر إنشاء المشروع'); return; }
  location.href = 'project.html?id=' + data.id;
}

/* ---------- nav ---------- */
function renderNav() {
  $('#avatar').textContent = name().trim().charAt(0).toUpperCase();
  $('#me-name').textContent = name();
  $('#me-email').textContent = user.email;
  document.querySelectorAll('.navlink[data-view]').forEach(a => { if (a.dataset.view === S.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#modes-side').innerHTML = modeSwitchHTML();
  $('#modes-top').innerHTML = modeSwitchHTML();
}

/* ---------- right panel ---------- */
function renderProjList() {
  const list = S.projects.slice(0, 8);
  $('#plist').innerHTML = list.length ? list.map(p => `<div class="pwrap"><button type="button" class="pitem" data-pid="${p.id}" aria-pressed="${p.id === S.selected}">
      <span class="bar" style="background:${esc(color(p))}"></span>
      <span class="nm"><b><bdi>${esc(p.title)}</bdi></b><span><bdi>${esc(p.topic || (p.is_published ? 'منشور' : 'مسودة'))}</bdi> · ${esc(rel(p.updated_at))}</span></span>
    </button><a class="iconbtn" href="project.html?id=${p.id}" aria-label="فتح ${esc(p.title)}" title="فتح المشروع"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></a></div>`).join('')
    : `<div class="empty2"><span>لا توجد مشاريع بعد</span><button class="btn btn-primary btn-sm" type="button" data-new>أنشئ أول مشروع</button></div>`;
}
function renderCal() {
  const y = S.calY, mo = S.calM, first = new Date(y, mo, 1), start = first.getDay(), days = new Date(y, mo + 1, 0).getDate(), prevDays = new Date(y, mo, 0).getDate();
  $('#cal-title').textContent = AR_M[mo] + ' ' + y;
  const byDay = new Map(); for (const e of events()) { const k = dayKey(e.at); byDay.set(k, (byDay.get(k) || 0) + 1); }
  const todayK = dayKey(now);
  let h = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map(d => `<span class="wd" aria-hidden="true">${d}</span>`).join('');
  const cells = [];
  for (let i = start - 1; i >= 0; i--) cells.push({ d: new Date(y, mo - 1, prevDays - i), out: true });
  for (let d = 1; d <= days; d++) cells.push({ d: new Date(y, mo, d), out: false });
  while (cells.length % 7) cells.push({ d: new Date(y, mo + 1, cells.length - start - days + 1), out: true });
  h += cells.map(c => { const k = dayKey(c.d), n = byDay.get(k) || 0; return `<button type="button" data-day="${k}" class="${c.out ? 'out' : ''} ${k === todayK ? 'today' : ''} ${n ? 'has' : ''}" aria-pressed="${k === S.calDay}" aria-label="${c.d.getDate()} ${AR_M[c.d.getMonth()]}${n ? '، ' + n + ' أحداث' : ''}">${c.d.getDate()}</button>`; }).join('');
  $('#cal').innerHTML = h;
  // events list: selected day, or the next/most recent few
  const ev = events();
  const shown = S.calDay ? ev.filter(e => dayKey(e.at) === S.calDay) : ev.slice(0, 3);
  $('#devents').innerHTML = shown.length ? shown.map(e => { const d = new Date(e.at), p = projById(e.pid); return `<li><span class="dn">${d.getDate()}<small>${AR_M[d.getMonth()]}</small></span><span><b><bdi>${esc(p ? p.title : 'مشروع')}</bdi></b><span>${esc(e.text)} · <bdi dir="ltr">${pad(d.getHours())}:${pad(d.getMinutes())}</bdi></span></span></li>`; }).join('')
    : `<li style="grid-template-columns:1fr"><span class="muted">${S.calDay ? 'لا توجد أحداث في هذا اليوم.' : 'لا توجد أحداث بعد.'}</span></li>`;
}
$('#plist').addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const b = e.target.closest('[data-pid]'); if (!b) return;
  S.selected = b.dataset.pid; S.metric = null;
  renderProjList();
  if (S.view !== 'home') location.hash = '#home'; else drawProjectChart();
});
$('#cal').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (!b) return; S.calDay = S.calDay === b.dataset.day ? null : b.dataset.day; renderCal(); });
$('#cal-prev').addEventListener('click', () => { S.calM--; if (S.calM < 0) { S.calM = 11; S.calY--; } renderCal(); });
$('#cal-next').addEventListener('click', () => { S.calM++; if (S.calM > 11) { S.calM = 0; S.calY++; } renderCal(); });

/* ---------- views ---------- */
function guideHTML() {
  let hidden = false; try { hidden = localStorage.getItem('dash-guide-hidden') === '1'; } catch (e) {}
  const first = S.projects[0], open = first ? `project.html?id=${first.id}` : null;
  const styled = S.projects.some(p => (p.brand && (p.brand.logo_url || (p.brand.primary && p.brand.primary.toUpperCase() !== DEFAULT_BRAND.primary))) || (p.template && p.template !== 'tiles'));
  const steps = [
    { t: 'أنشئ مشروع', d: 'كل داش بورد مشروع مستقل.', done: S.projects.length > 0, a: '<button type="button" class="btn btn-primary btn-sm" data-new>مشروع جديد</button>' },
    { t: 'ارفع ملف Excel', d: 'أو استخدم الملف النموذجي.', done: S.versions.length > 0, a: open ? `<a class="btn btn-quiet btn-sm" href="${open}">ارفع الملف</a>` : '<a class="btn btn-quiet btn-sm" href="assets/templates/template-sales.xlsx" download>ملف نموذجي</a>' },
    { t: 'خصّص الشكل', d: 'الشعار والألوان والقالب.', done: styled, a: open ? `<a class="btn btn-quiet btn-sm" href="${open}">الهوية والقالب</a>` : '' },
    { t: 'انشر وشارك', d: 'رابط للعرض فقط.', done: S.projects.some(p => p.is_published), a: open ? `<a class="btn btn-quiet btn-sm" href="${open}">المشاركة</a>` : '' }
  ];
  const n = steps.filter(s => s.done).length;
  if (hidden || n === steps.length) return '';
  const next = steps.findIndex(s => !s.done);
  return `<section class="card2 guide" aria-label="دليل البداية">
    <div class="c-head"><div><h2>ابدأ في 4 خطوات</h2><span class="muted">${n} من 4 مكتملة</span></div><button type="button" class="btn btn-ghost btn-sm" data-hide-guide>إخفاء</button></div>
    <div class="g-bar" role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${n}"><i style="width:${n * 25}%"></i></div>
    <ol class="g-steps">${steps.map((s, i) => `<li class="${s.done ? 'done' : ''} ${i === next ? 'next' : ''}"><span class="g-n" aria-hidden="true">${s.done ? '✓' : i + 1}</span><span class="g-t"><b>${s.t}</b><span>${s.done ? 'تم' : s.d}</span></span>${!s.done && i === next ? s.a : ''}</li>`).join('')}</ol>
  </section>`;
}

function viewHome() {
  const h = now.getHours(), greet = h < 12 ? 'صباح الخير' : 'مساء الخير';
  const pub = S.projects.filter(p => p.is_published).length, total = S.projects.length;
  const yearUploads = S.versions.filter(v => new Date(v.created_at).getFullYear() === now.getFullYear()).length;
  const withData = new Set(S.versions.map(v => v.project_id));
  const recent = S.projects.filter(p => Date.now() - new Date(p.updated_at) < 30 * 864e5).length;
  const pct = n => total ? Math.round(n / total * 100) : 0;
  const ring = (v, label, c) => { const r = 34, C = 2 * Math.PI * r; return `<div class="ring"><svg viewBox="0 0 88 88" role="img" aria-label="${label} ${v}%"><circle class="bg" cx="44" cy="44" r="${r}" fill="none" stroke-width="9"/><circle cx="44" cy="44" r="${r}" fill="none" stroke="var(${c})" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(C * v / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 44 44)"/><text x="44" y="50" text-anchor="middle">${v}%</text></svg>${label}</div>`; };
  const ev = events().slice(0, 6);
  return `
    <header class="hello"><h1>${greet}، ${esc(name())} 👋</h1><p>هذا ملخص مشاريعك اليوم.</p></header>
    ${guideHTML()}
    <section class="tiles4" aria-label="ملخص اليوم">
      <div class="tile4"><span class="ic c1">${ICON.cal}</span><span class="t"><small>التاريخ</small><b>${now.getDate()} ${AR_M[now.getMonth()]}</b><em>${hijriFmt ? esc(hijriFmt.format(now)) : ''}</em></span></div>
      <div class="tile4"><span class="ic c2">${ICON.sun}</span><span class="t"><small>اليوم</small><b>${esc(weekdayFmt.format(now))}</b><em>الأسبوع ${weekNo(now)} من السنة</em></span></div>
      <div class="tile4"><span class="ic c3">${ICON.grid}</span><span class="t"><small>عدد المشاريع</small><b>${total}</b><em>${pub} منشور · ${total - pub} مسودة</em></span></div>
      <div class="tile4"><span class="ic c4">${ICON.star}</span><span class="t"><small>السنة</small><b>${now.getFullYear()}</b><em>${hijriYear ? esc(hijriYear.format(now)) + ' · ' : ''}${yearUploads} تحديث</em></span></div>
    </section>
    <section class="card2" id="pchart" aria-live="polite"></section>
    <div class="row2">
      <section class="card2"><div class="c-head"><h2>نظرة سريعة</h2></div>
        <div class="rings">${ring(pct(pub), 'منشورة', '--bordo-soft')}${ring(pct(recent), 'محدّثة خلال 30 يوم', '--teal')}${ring(pct(withData.size), 'فيها بيانات', '--amber')}</div></section>
      <section class="card2"><div class="c-head"><h2>آخر النشاطات</h2><a class="btn btn-ghost btn-sm" href="#history">السجل</a></div>
        ${ev.length ? `<ul class="acts">${ev.map(e => { const p = projById(e.pid); return `<li><span class="ic ${e.type === 'upload' ? 'c2' : 'c1'}">${e.type === 'upload' ? ICON.up : ICON.plus}</span><span>${esc(e.text)}${e.file ? ` <bdi dir="ltr">${esc(e.file)}</bdi>` : ''} · <b><bdi>${esc(p ? p.title : '')}</bdi></b></span><time datetime="${esc(e.at)}">${esc(rel(e.at))}</time></li>`; }).join('')}</ul>` : '<p class="muted">ستظهر هنا عمليات الرفع والنشر.</p>'}
      </section>
    </div>`;
}

async function drawProjectChart() {
  const box = $('#pchart'); if (!box) return;
  if (chart) { chart.destroy(); chart = null; }
  const p = projById(S.selected);
  if (!p) { box.innerHTML = `<div class="empty2"><b style="color:var(--ink)">ابدأ أول مشروع</b><span>ارفع ملف Excel وشوف الرسم البياني هنا.</span><a class="btn btn-ghost btn-sm" href="assets/templates/template-sales.xlsx" download>حمّل ملف نموذجي</a><button class="btn btn-primary btn-sm" type="button" data-new>مشروع جديد</button></div>`; return; }
  const my = ++drawToken;
  box.innerHTML = `<div class="c-head"><div><h2>${esc(p.title)}</h2><span class="muted">جاري التحميل…</span></div></div><div class="chart-wrap"></div>`;
  if (!latestCache.has(p.id)) {
    const { data } = await sb.from('versions').select('data,created_at,period').eq('project_id', p.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    latestCache.set(p.id, data || null);
  }
  if (my !== drawToken) return;
  const v = latestCache.get(p.id);
  if (!v) { box.innerHTML = `<div class="c-head"><h2>${esc(p.title)}</h2><a class="btn btn-quiet btn-sm" href="project.html?id=${p.id}">فتح المشروع</a></div><div class="empty2"><span>لا توجد بيانات منشورة لهذا المشروع.</span><a class="btn btn-primary btn-sm" href="project.html?id=${p.id}">ارفع ملف Excel</a></div>`; return; }
  const m = createModel(v.data);
  const metric = (S.metric != null && m.nums.includes(S.metric)) ? S.metric : (m.nums[0] ?? -1);
  const opts = m.nums.map(i => `<option value="${i}" ${i === metric ? 'selected' : ''}>${esc(m.cols[i].name)}</option>`).join('');
  let labels = [], vals = [], kind = 'bar', sub = '';
  if (m.date >= 0) { const s = m.series(m.rows, metric); labels = s.map(x => pLabel(x.k)); vals = s.map(x => x.v); kind = 'line'; sub = m.monthly ? 'حسب الشهر' : 'حسب اليوم'; }
  else if (m.dims.length) { const b = m.breakdown(m.rows, m.dims[0], metric).slice(0, 10); labels = b.map(x => x.k); vals = b.map(x => x.v); sub = 'حسب ' + m.cols[m.dims[0]].name; }
  else { labels = m.nums.map(i => m.cols[i].name); vals = m.nums.map(i => m.agg(m.rows, i)); sub = 'إجمالي المؤشرات'; }
  box.innerHTML = `<div class="c-head">
      <div><h2>${esc(p.title)}</h2><span class="muted">${esc(sub)} · آخر تحديث ${esc(rel(v.created_at))}</span></div>
      <div class="c-tools">${opts ? `<label class="sr" for="pc-metric">المؤشر</label><select id="pc-metric">${opts}</select>` : ''}<span class="c-total">${fmt(m.agg(m.rows, metric))}</span><a class="btn btn-quiet btn-sm" href="project.html?id=${p.id}">فتح المشروع</a></div>
    </div><div class="chart-wrap"><canvas role="img" aria-label="رسم ${esc(m.label(metric))}"></canvas></div>`;
  const sel = $('#pc-metric'); if (sel) sel.addEventListener('change', e => { S.metric = +e.target.value; drawProjectChart(); });
  if (!window.Chart) return;
  const acc = tok('--bordo-soft') || '#888', ink = tok('--muted'), grid = tok('--line');
  Chart.defaults.font.family = "'IBM Plex Sans Arabic', system-ui, sans-serif"; Chart.defaults.color = ink;
  const ds = kind === 'line'
    ? { data: vals, borderColor: acc, backgroundColor: ctx => { const c = ctx.chart.ctx, g = c.createLinearGradient(0, 0, 0, 280); g.addColorStop(0, acc + '55'); g.addColorStop(1, acc + '00'); return g; }, fill: true, tension: .35, borderWidth: 2.5, pointRadius: vals.length > 30 ? 0 : 4, pointBackgroundColor: acc, pointBorderColor: tok('--surface'), pointBorderWidth: 2 }
    : { data: vals, backgroundColor: acc, borderRadius: 6, maxBarThickness: 38 };
  chart = new Chart(box.querySelector('canvas'), { type: kind, data: { labels, datasets: [ds] }, options: { responsive: true, maintainAspectRatio: false, animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 400 },
    plugins: { legend: { display: false }, tooltip: { rtl: true, textDirection: 'rtl', callbacks: { label: c => ' ' + fmt(c.parsed.y) } } },
    scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { callback: v => fmt(v), maxTicksLimit: 5 } } } } });
}

function viewProjects() {
  const counts = { all: S.projects.length, pub: S.projects.filter(p => p.is_published).length, draft: S.projects.filter(p => !p.is_published).length };
  const q = S.q.trim().toLowerCase();
  const list = S.projects.filter(p => (S.filter === 'all' || (S.filter === 'pub' ? p.is_published : !p.is_published)) && (!q || (p.title + ' ' + (p.topic || '')).toLowerCase().includes(q)));
  const vByP = new Map(); for (const v of S.versions) if (!vByP.has(v.project_id)) vByP.set(v.project_id, v);
  const TPL = { tiles: 'مربعات', executive: 'تنفيذي', compact: 'جوال' };
  return `<header class="vhead"><div><h1>المشاريع</h1><p class="muted">كل داش بورد له رابطه وهويته.</p></div><button class="btn btn-primary" type="button" data-new>${ICON.plus.replace('<svg', '<svg width="18" height="18"')} مشروع جديد</button></header>
    <div class="toolbar2"><div class="pills" role="group" aria-label="تصفية المشاريع">
      ${[['all', 'الكل'], ['pub', 'منشور'], ['draft', 'مسودة']].map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${S.filter === k}">${l} <small>${counts[k]}</small></button>`).join('')}
    </div><label class="sr" for="p-search">بحث في المشاريع</label><input type="search" id="p-search" placeholder="ابحث باسم المشروع" value="${esc(S.q)}"></div>
    <div class="cards">
      ${list.map(p => { const v = vByP.get(p.id), c = color(p); return `<a class="pcard3" href="project.html?id=${p.id}" style="background:color-mix(in srgb, ${esc(c)} 24%, var(--surface))">
        <div class="top"><span class="chipx">${ICON.file.replace('<svg', '<svg width="14" height="14"')}${esc(p.topic || 'بدون تصنيف')}</span><span class="pill ${p.is_published ? 'live' : ''}">${p.is_published ? 'منشور' : 'مسودة'}</span></div>
        <h3>${esc(p.title)}</h3>
        <div class="bot"><span>${v ? Number(v.row_count).toLocaleString('en-US') + ' سجل' : 'بدون بيانات'} · قالب ${TPL[p.template] || 'مربعات'}</span><span>${esc(rel(p.updated_at))}</span></div></a>`; }).join('')}
      <button type="button" class="pcard3 newcard" data-new><span class="ic c1">${ICON.plus}</span><b>مشروع جديد</b><span>ارفع ملف Excel وابدأ</span></button>
    </div>
    ${!list.length && S.projects.length ? '<p class="muted">لا توجد مشاريع تطابق البحث.</p>' : ''}`;
}

function viewLinks() {
  const pub = S.projects.filter(p => p.is_published);
  return `<header class="vhead"><div><h1>الروابط المنشورة</h1><p class="muted">كل الروابط اللي شاركتيها، للعرض فقط.</p></div></header>
    <section class="card2">${pub.length ? `<div class="lrows">${pub.map(p => `<div class="lrow">
        <div><b>${esc(p.title)}</b><div class="muted" style="font-size:12.5px">${p.share_pass_hash ? '🔒 محمي بكلمة مرور' : 'بدون كلمة مرور'} · ${esc(rel(p.updated_at))}</div></div>
        <label class="sr" for="l-${p.id}">رابط ${esc(p.title)}</label><input type="text" id="l-${p.id}" readonly value="${esc(shareUrl(p))}">
        <div class="row"><button type="button" class="btn btn-quiet btn-sm" data-copy="${esc(shareUrl(p))}">نسخ</button><a class="btn btn-primary btn-sm" href="${esc(shareUrl(p))}" target="_blank" rel="noopener">فتح</a></div>
      </div>`).join('')}</div>`
      : `<div class="empty2"><span>ما نشرتي أي داش بورد بعد.</span><span>افتح أي مشروع، ومن قسم «المشاركة» فعّل النشر.</span><a class="btn btn-quiet btn-sm" href="#projects">المشاريع</a></div>`}</section>`;
}

function viewHistory() {
  return `<header class="vhead"><div><h1>سجل التحديثات</h1><p class="muted">كل ملف رفعتيه، من الأحدث للأقدم.</p></div></header>
    <section class="card2">${S.versions.length ? `<div class="htable-wrap"><table class="htable"><thead><tr><th scope="col">التاريخ</th><th scope="col">المشروع</th><th scope="col">الملف</th><th scope="col">الفترة</th><th scope="col">السجلات</th></tr></thead><tbody>
      ${S.versions.map(v => { const p = projById(v.project_id), d = new Date(v.created_at); return `<tr><td class="num">${d.getDate()} ${AR_M[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}</td><td>${p ? `<a href="project.html?id=${p.id}">${esc(p.title)}</a>` : '—'}</td><td>${esc(v.file_name || '—')}</td><td>${esc(v.period || '—')}</td><td class="num">${Number(v.row_count).toLocaleString('en-US')}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty2"><span>لا توجد تحديثات بعد.</span></div>'}</section>`;
}

function viewSettings() {
  const b = { ...DEFAULT_BRAND, ...(meta.default_brand || {}) };
  return `<header class="vhead"><div><h1>الحساب والهوية</h1><p class="muted">إعداداتك الشخصية، وهوية تنطبق على كل مشروع جديد.</p></div></header>
    <section class="card2"><div class="c-head"><h2>لون الموقع</h2><span class="muted">يُحفظ على هذا الجهاز</span></div>
      <div class="modecards" role="group" aria-label="لون الموقع">${MODES.map(x => `<button type="button" class="modecard" data-setmode="${x.id}" aria-pressed="${getMode() === x.id}"><i style="background:linear-gradient(135deg,${x.a} 58%,${x.b} 58%)"></i>${x.name}</button>`).join('')}</div></section>
    <form class="card2" id="set-form" novalidate>
      <div class="c-head"><h2>بياناتك</h2></div>
      <label class="field"><span class="label">الاسم الظاهر في الترحيب</span><input type="text" id="s-name" maxlength="40" value="${esc(meta.full_name || '')}" placeholder="${esc(user.email.split('@')[0])}"></label>
      <div class="c-head" style="margin-top:6px"><h2>الهوية الافتراضية للمشاريع الجديدة</h2></div>
      <div class="colors">
        <label class="color" for="s-primary">الرئيسي<input type="color" id="s-primary" value="${esc(b.primary)}"></label>
        <label class="color" for="s-secondary">الثانوي<input type="color" id="s-secondary" value="${esc(b.secondary)}"></label>
        <label class="color" for="s-accent">المميز<input type="color" id="s-accent" value="${esc(b.accent)}"></label>
      </div>
      <label class="field"><span class="label">الخط</span><select id="s-font">${Object.keys(FONTS).map(f => `<option ${f === b.font ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      <div class="row"><button class="btn btn-primary" type="submit" id="s-save">حفظ</button><span class="status" id="s-status" role="status" aria-live="polite"></span></div>
    </form>`;
}

function renderView() {
  if (chart) { chart.destroy(); chart = null; }
  const v = S.view;
  $('#view').innerHTML = `<div style="display:grid;gap:16px">${v === 'projects' ? viewProjects() : v === 'links' ? viewLinks() : v === 'history' ? viewHistory() : v === 'settings' ? viewSettings() : viewHome()}</div>`;
  document.title = ({ home: 'حسابي', projects: 'المشاريع', links: 'الروابط المنشورة', history: 'سجل التحديثات', settings: 'الحساب والهوية' }[v] || 'حسابي') + ' | داش بورد';
  if (v === 'home') drawProjectChart();
}
function renderAll() { renderNav(); renderProjList(); renderCal(); renderView(); }

/* ---------- events ---------- */
function route() { const h = location.hash.replace('#', ''); S.view = ['home', 'projects', 'links', 'history', 'settings'].includes(h) ? h : 'home'; renderNav(); renderView(); window.scrollTo(0, 0); }
window.addEventListener('hashchange', route);
document.addEventListener('click', async e => {
  if (e.target.closest('[data-new]')) { e.preventDefault(); createProject(); return; }
  if (e.target.closest('[data-signout]')) { signOut(); return; }
  if (e.target.closest('[data-hide-guide]')) { try { localStorage.setItem('dash-guide-hidden', '1'); } catch (err) {} const g = $('.guide'); if (g) g.remove(); return; }
  const f = e.target.closest('[data-filter]'); if (f) { S.filter = f.dataset.filter; renderView(); return; }
  const m = e.target.closest('[data-setmode]'); if (m) { setMode(m.dataset.setmode); document.querySelectorAll('.modecard').forEach(x => x.setAttribute('aria-pressed', x.dataset.setmode === m.dataset.setmode)); return; }
  const c = e.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('تم نسخ الرابط'); } catch (err) { toast('انسخ الرابط من المربع'); } }
});
document.addEventListener('input', e => { if (e.target.id === 'p-search') { S.q = e.target.value; const pos = e.target.selectionStart; renderView(); const el = $('#p-search'); el.focus(); el.setSelectionRange(pos, pos); } });
document.addEventListener('submit', async e => {
  if (e.target.id !== 'set-form') return;
  e.preventDefault();
  const st = $('#s-status'); st.classList.remove('err'); st.textContent = 'جاري الحفظ…'; $('#s-save').disabled = true;
  const data = { full_name: $('#s-name').value.trim(), default_brand: { primary: $('#s-primary').value.toUpperCase(), secondary: $('#s-secondary').value.toUpperCase(), accent: $('#s-accent').value.toUpperCase(), font: $('#s-font').value } };
  const { data: res, error } = await sb.auth.updateUser({ data });
  $('#s-save').disabled = false;
  if (error) { st.textContent = 'تعذّر الحفظ: ' + error.message; st.classList.add('err'); return; }
  meta = res.user.user_metadata || data; st.textContent = 'تم الحفظ'; renderNav();
});
document.addEventListener('modechange', () => { if (S.view === 'home') drawProjectChart(); });

S.view = (location.hash.replace('#', '') || 'home');
if (!['home', 'projects', 'links', 'history', 'settings'].includes(S.view)) S.view = 'home';
renderNav();
$('#view').innerHTML = '<p class="muted">جاري التحميل…</p>';
load();
