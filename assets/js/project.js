// Project editor: details, brand, data versions, template, sharing — with live preview.
import { sb, $, requireUser, mountNav, setupNotice, toast } from './sb.js';
import { mountDashboard, TEMPLATES, vizDefault } from './render.js';
import { DEFAULT_BRAND, FONTS, extractColors, computeTotals, guessTargetCfg, esc, fmtDate, createModel, targetStats, autoRecommendations } from './engine.js';
import { openFile, openPasted, extractRaw, convert, TYPES, cleanReport, MAX_ROWS } from './parse.js';
import { wireExport } from './export.js';
const mopts = () => ({ agg: project.config.agg, measures: project.config.measures });
import { startI18n } from './i18n.js';

if (setupNotice($('#setup'))) throw new Error('not configured');
const user = await requireUser();
mountNav(user, { lang: true });
startI18n();
const id = new URLSearchParams(location.search).get('id');
if (!id) location.href = 'app.html';

let project, versions = [], latest = null, dash = null;
let pending = null; // {actual:{src,sheet,overrides,raw,data}, target:{...}|null}

/* ---------- save queue ---------- */
let patch = {}, saveTimer = null;
const chip = $('#save-chip');
function queue(fields) {
  Object.assign(patch, fields);
  chip.textContent = 'لم يُحفظ بعد…';
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700);
}
async function flush() {
  const p = patch; patch = {};
  if (!Object.keys(p).length) return;
  chip.textContent = 'جاري الحفظ…';
  const { error } = await sb.from('projects').update(p).eq('id', id);
  chip.textContent = error ? 'تعذّر الحفظ، حاول مرة أخرى' : 'تم الحفظ';
  if (error) Object.assign(patch, p);
}
window.addEventListener('beforeunload', e => { if (Object.keys(patch).length) { flush(); e.preventDefault(); } });

/* ---------- preview ---------- */
let pvTimer = null;
function currentVersion() {
  if (pending && pending.actual && pending.actual.data) {
    const v = { data: pending.actual.data, targets: pending.target ? pending.target.data : null, period: $('#f-vperiod').value.trim() || project.period, created_at: new Date().toISOString() };
    return { version: v, previous: versions[0] ? { totals: versions[0].totals } : null };
  }
  return { version: latest, previous: versions[1] ? { totals: versions[1].totals } : null };
}
function preview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => {
    const { version, previous } = currentVersion();
    const opts = { project: { ...project }, version, previous };
    if (!dash) dash = mountDashboard($('#preview'), opts); else dash.update(opts);
    renderDefaults();
    $('#preview-note').textContent = pending ? 'معاينة تحديث غير منشور' : (latest ? '' : 'لا توجد بيانات بعد');
  }, 200);
}

/* ---------- load ---------- */
async function loadVersions() {
  const { data } = await sb.from('versions').select('id,period,label,file_name,target_file_name,row_count,created_at,totals').eq('project_id', id).order('created_at', { ascending: false });
  versions = data || [];
  latest = null;
  if (versions[0]) {
    const { data: full } = await sb.from('versions').select('period,file_name,data,targets,totals,row_count,created_at').eq('id', versions[0].id).single();
    latest = full;
  }
  renderVersions();
}
async function load() {
  const { data, error } = await sb.from('projects').select('*').eq('id', id).single();
  if (error || !data) { $('#h-title').textContent = 'المشروع غير موجود'; return; }
  project = data;
  project.brand = { ...DEFAULT_BRAND, ...(project.brand || {}) };
  project.config = project.config || {};
  fill();
  await loadVersions();
  preview();
}

function fill() {
  $('#h-title').textContent = project.title;
  document.title = project.title + ' | لوحة المؤشرات';
  $('#f-title').value = project.title; $('#f-topic').value = project.topic; $('#f-desc').value = project.description; $('#f-period').value = project.period;
  const b = project.brand;
  $('#c-primary').value = b.primary; $('#c-secondary').value = b.secondary; $('#c-accent').value = b.accent; syncHex();
  $('#f-font').innerHTML = Object.keys(FONTS).map(f => `<option ${f === b.font ? 'selected' : ''}>${f}</option>`).join('');
  logoPreview(b.logo_url);
  renderTemplates(); renderViz(); renderRecs(); renderNotes(); renderShare();
}

/* ---------- 1 details ---------- */
[['f-title', 'title'], ['f-topic', 'topic'], ['f-desc', 'description'], ['f-period', 'period']].forEach(([el, key]) => {
  $('#' + el).addEventListener('input', e => {
    project[key] = e.target.value;
    if (key === 'title') { $('#h-title').textContent = project.title || 'بدون عنوان'; }
    queue({ [key]: project[key] }); preview();
  });
});

/* ---------- 2 brand ---------- */
function setBrand(p) { project.brand = { ...project.brand, ...p }; queue({ brand: project.brand }); preview(); }
// colour code fields (#RRGGBB) stay in sync with the colour pickers
const syncHex = () => ['primary', 'secondary', 'accent'].forEach(k => { const h = $('#h-' + k); if (h && document.activeElement !== h) { h.value = $('#c-' + k).value.toUpperCase(); h.classList.remove('bad'); } });
const hexOk = v => { v = v.trim().replace(/^#?/, '#'); if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map(x => x + x).join(''); return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null; };
['primary', 'secondary', 'accent'].forEach(k => {
  $('#c-' + k).addEventListener('input', e => { setBrand({ [k]: e.target.value.toUpperCase() }); syncHex(); });
  const h = $('#h-' + k);
  h.addEventListener('input', () => { const v = hexOk(h.value); h.classList.toggle('bad', !v && h.value.trim().length >= 4); if (v) { $('#c-' + k).value = v.toLowerCase(); setBrand({ [k]: v }); } });
  h.addEventListener('blur', () => { const v = hexOk(h.value); if (v) h.value = v; syncHex(); });
  h.addEventListener('paste', () => setTimeout(() => h.dispatchEvent(new Event('input')), 0));
});
$('#f-font').addEventListener('change', e => setBrand({ font: e.target.value }));
function logoPreview(url) {
  $('#logo-prev').innerHTML = url ? `<img src="${esc(url)}" alt="">` : '';
  $('#b-nologo').hidden = !url;
}
$('#b-nologo').addEventListener('click', () => { setBrand({ logo_url: '' }); logoPreview(''); $('#sw-wrap').hidden = true; });
$('#f-logo').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (!/^image\//.test(f.type)) { toast('اختر صورة بصيغة PNG أو SVG أو JPG'); return; }
  if (f.size > 2 * 1024 * 1024) { toast('حجم الشعار أكبر من 2MB'); return; }
  const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
  logoPreview(dataUrl);
  const img = new Image();
  img.onload = () => {
    const cs = extractColors(img, 5);
    if (cs.length) {
      $('#swatches').innerHTML = cs.map(c => `<button type="button" style="background:${c}" data-c="${c}" title="${c}" aria-label="استخدام ${c} كلون رئيسي"></button>`).join('');
      $('#sw-wrap').hidden = false;
      const p = { primary: cs[0] }; if (cs[1]) p.secondary = cs[1]; if (cs[2]) p.accent = cs[2];
      $('#c-primary').value = p.primary; if (p.secondary) $('#c-secondary').value = p.secondary; if (p.accent) $('#c-accent').value = p.accent; syncHex();
      setBrand(p);
    }
  };
  img.src = dataUrl;
  chip.textContent = 'جاري رفع الشعار…';
  const ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${user.id}/${id}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('logos').upload(path, f, { contentType: f.type, cacheControl: '3600' });
  if (error) { chip.textContent = 'تعذّر رفع الشعار'; return; }
  const { data } = sb.storage.from('logos').getPublicUrl(path);
  setBrand({ logo_url: data.publicUrl });
});
$('#swatches').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; $('#c-primary').value = b.dataset.c; setBrand({ primary: b.dataset.c }); syncHex(); });

/* ---------- 3 data ---------- */
const dstatus = (msg, err) => { const s = $('#data-status'); s.textContent = msg || ''; s.classList.toggle('err', !!err); };
function renderVersions() {
  $('#cur-version').textContent = latest ? `البيانات الحالية: ${latest.file_name || '—'} · ${Number(latest.row_count || 0).toLocaleString('en-US')} صف · ${fmtDate(latest.created_at)}` : 'لا توجد بيانات بعد. ارفع أول ملف.';
  $('#vlist').innerHTML = versions.length ? versions.map((v, i) => `<li><span class="vtag ${i === 0 ? 'now' : ''}">${i === 0 ? 'الحالي' : 'v' + (versions.length - i)}</span><strong>${esc(v.period || v.file_name)}</strong><span class="muted">${esc(v.file_name)}${v.target_file_name ? ' + ' + esc(v.target_file_name) : ''} · ${Number(v.row_count || 0).toLocaleString('en-US')} صف · ${esc(fmtDate(v.created_at))}</span></li>`).join('') : '<li class="muted">لا يوجد</li>';
}
function rebuild() {
  const msgs = [];
  for (const kind of ['actual', 'target']) {
    const p = pending && pending[kind]; if (!p || !p.src) continue;
    const raw = extractRaw(p.src.aoa(p.sheet), kind === 'actual' ? { keepTotals: p.keepTotals, dedupe: p.dedupe } : {});
    p.data = convert(raw, p.overrides); p.raw = raw;
    if (kind === 'actual') msgs.push(`تمت قراءة ${p.data.rows.length.toLocaleString('en-US')} صف و${p.data.columns.length} عمود من «${p.src.name}».`);
    else msgs.push(`ملف المستهدف: ${p.data.rows.length} صف.`);
  }
  renderCols(); renderClean(); renderMap();
  $('#pub-box').hidden = !(pending && pending.actual);
  dstatus(msgs.join(' ') + (pending && pending.actual ? ' راجع المعاينة ثم اضغط «نشر التحديث».' : ''));
  preview();
}
function renderCols() {
  const p = pending && pending.actual;
  if (!p) { $('#cols').innerHTML = ''; return; }
  $('#cols').innerHTML = '<p class="label" style="margin-bottom:6px">هكذا فُهمت الأعمدة. غيّر النوع إذا كان غير صحيح.</p><div class="chips">' + p.data.columns.map((c, i) => `<label class="chip"><span>${esc(c.name)}</span><select data-col="${i}" aria-label="نوع ${esc(c.name)}">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`).join('') + '</div>';
}
/* cleaning report: what was changed or noticed, with undo */
function renderClean() {
  const box = $('#clean-report'), p = pending && pending.actual;
  if (!p || !p.raw) { box.hidden = true; box.innerHTML = ''; return; }
  const raw = p.raw, rep = cleanReport(raw, p.data), items = [];
  const li = (icon, text, act) => `<li><span class="ci ci-${icon}" aria-hidden="true"></span><span class="ct">${text}</span>${act || ''}</li>`;
  const btn = (a, l) => `<button type="button" class="btn btn-ghost btn-sm" data-clean="${a}">${l}</button>`;
  if (raw.skippedTop) items.push(li('info', `تجاهلنا ${raw.skippedTop} ${raw.skippedTop === 1 ? 'صف' : 'صفوف'} فوق الجدول (عنوان أو ملاحظات)، وبدأنا من صف العناوين.`));
  if (raw.totalsFound) items.push(raw.keepTotals
    ? li('warn', `أبقينا ${raw.totalsFound} ${raw.totalsFound === 1 ? 'صف إجمالي' : 'صفوف إجمالي'} (${esc(raw.totalLabels.slice(0, 2).join('، '))}). قد ينحسب المجموع مرتين.`, btn('dropTotals', 'حذفها'))
    : li('done', `حذفنا ${raw.totalsFound} ${raw.totalsFound === 1 ? 'صف إجمالي' : 'صفوف إجمالي'} (${esc(raw.totalLabels.slice(0, 2).join('، '))}) عشان ما ينحسب المجموع مرتين.`, btn('keepTotals', 'تراجع')));
  if (raw.dups) items.push(raw.dedupe
    ? li('done', `حذفنا ${raw.dups} ${raw.dups === 1 ? 'صف مكرر' : 'صفوف مكررة'} (متطابقة في كل الأعمدة).`, btn('undedupe', 'تراجع'))
    : li('warn', `لقينا ${raw.dups} ${raw.dups === 1 ? 'صف مكرر' : 'صفوف مكررة'} بالضبط. إذا كانت تكرار بالغلط احذفها.`, btn('dedupe', 'حذف المكرر')));
  rep.asText.forEach(c => items.push(li('done', `عمود «${esc(c.name)}» فيه أرقام، بس اعتبرناه ترقيم/نص فما ينجمع.`, btn('num:' + c.i, 'اعتبره رقم'))));
  if (rep.textNums) items.push(li('done', `حوّلنا ${rep.textNums.toLocaleString('en-US')} قيمة مكتوبة كنص (مثل «1,200 ر.س» أو أرقام عربية) إلى أرقام.`));
  if (raw.emptyCols) items.push(li('info', `تجاهلنا ${raw.emptyCols} ${raw.emptyCols === 1 ? 'عمود فاضي' : 'أعمدة فاضية'} بدون عنوان.`));
  rep.blanks.slice(0, 3).forEach(b => items.push(li(b.miss / rep.rows > 0.3 ? 'warn' : 'info', `عمود «${esc(b.name)}» فيه ${b.miss.toLocaleString('en-US')} ${b.miss === 1 ? 'خانة فاضية' : 'خانات فاضية'} (${Math.round(b.miss / rep.rows * 100)}%). ما عدّلناها.`)));
  if (raw.truncated) items.push(li('warn', `الملف فيه ${raw.rowsBeforeCap.toLocaleString('en-US')} صف؛ استخدمنا أول ${MAX_ROWS.toLocaleString('en-US')} صف فقط.`));
  box.hidden = false;
  box.innerHTML = `<p class="label" style="margin:0 0 6px">تقرير التنظيف</p>` + (items.length ? `<ul>${items.join('')}</ul>` : '<p class="muted" style="margin:0;font-size:13px">البيانات نظيفة، ما احتجنا نغيّر شي.</p>');
}
$('#clean-report').addEventListener('click', e => {
  const b = e.target.closest('[data-clean]'); if (!b || !pending || !pending.actual) return;
  const a = b.dataset.clean, p = pending.actual;
  if (a === 'keepTotals') p.keepTotals = true; else if (a === 'dropTotals') p.keepTotals = false;
  else if (a === 'dedupe') p.dedupe = true; else if (a === 'undedupe') p.dedupe = false;
  else if (a.startsWith('num:')) p.overrides[a.slice(4)] = 'number';
  safe(rebuild);
});
$('#cols').addEventListener('change', e => { const i = e.target.dataset.col; if (i == null || !pending) return; pending.actual.overrides[i] = e.target.value; safe(rebuild); });

// first sheet that holds a readable table (skips summary/cover sheets)
function bestSheet(src) {
  for (const n of src.sheets) { try { const r = extractRaw(src.aoa(n)); if (r.headers.length >= 2 && r.body.length >= 1) return n; } catch (e) { /* try next */ } }
  return src.sheets[0];
}
function sheetSelect(sel, wrap, src, cur) {
  $(sel).innerHTML = src.sheets.map(n => `<option ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
  $(wrap).hidden = src.sheets.length < 2;
}
function safe(fn) { try { fn(); } catch (e) { dstatus('تعذّرت قراءة البيانات. تأكد أن أحد الصفوف الأولى يحتوي عناوين الأعمدة.', true); } }

async function takeActual(srcPromise) {
  dstatus('جاري قراءة الملف…');
  try {
    const src = await srcPromise;
    pending = { actual: { src, sheet: bestSheet(src), overrides: {} }, target: pending ? pending.target : null };
    if (!pending.target && latest && latest.targets) pending.target = { src: null, data: latest.targets, fromLatest: true };
    sheetSelect('#f-sheet', '#sheet-wrap', src, pending.actual.sheet);
    $('#drop-data').classList.add('done');
    if (!$('#f-vperiod').value) $('#f-vperiod').value = project.period || '';
    rebuild();
  } catch (e) { pending = null; dstatus(readError(e), true); console.error(e); }
}
function readError(e) {
  const m = String((e && e.message) || e);
  if (m === 'xlsx_load') return 'تعذّر تحميل أداة قراءة Excel. تحقق من الاتصال بالإنترنت، أو جرّب من شبكة ثانية (بعض شبكات العمل تحجبها).';
  if (/password|encrypt|ECMA-376|CFB/i.test(m)) return 'الملف محمي بكلمة مرور أو بتصنيف حماية من الشركة. افتحه في Excel واحفظ نسخة جديدة بدون حماية، أو انسخ الجدول والصقه في خانة اللصق.';
  if (m === 'empty') return 'الملف فاضي أو ما فيه صف عناوين. تأكد أن أول صف في الجدول فيه أسماء الأعمدة.';
  return 'تعذّرت قراءة الملف (' + m.slice(0, 80) + '). جرّب تحفظه بصيغة .xlsx أو انسخ الجدول والصقه في خانة اللصق.';
}
const okExt = f => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name);
$('#f-data').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (!okExt(f)) { dstatus('اختر ملفًا بصيغة xlsx أو xls أو csv.', true); return; } takeActual(openFile(f)); });
$('#b-paste').addEventListener('click', () => { const t = $('#f-paste').value; if (!t.trim()) { dstatus('الصق الجدول أولًا.', true); return; } takeActual(Promise.resolve(openPasted(t))); });
$('#f-sheet').addEventListener('change', e => { Object.assign(pending.actual, { sheet: e.target.value, overrides: {}, keepTotals: false, dedupe: false }); safe(rebuild); });

$('#f-target').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!okExt(f)) { dstatus('اختر ملفًا بصيغة xlsx أو xls أو csv.', true); return; }
  try {
    const src = await openFile(f);
    if (!pending || !pending.actual) {
      if (!latest) { dstatus('ارفع ملف البيانات أولًا، ثم ملف المستهدف.', true); return; }
      pending = { actual: { src: null, data: latest.data, reuse: true, name: latest.file_name }, target: null };
    }
    pending.target = { src, sheet: bestSheet(src), overrides: {} };
    sheetSelect('#f-tsheet', '#tsheet-wrap', src, pending.target.sheet);
    $('#drop-target').classList.add('done');
    project.config = { ...project.config, target: null };
    if (pending.actual.reuse) { const raw = extractRaw(src.aoa(pending.target.sheet)); pending.target.data = convert(raw); renderMap(); $('#pub-box').hidden = false; dstatus('ملف المستهدف جاهز. راجع الربط ثم انشر التحديث.'); preview(); }
    else safe(rebuild);
  } catch (err) { dstatus('تعذّرت قراءة ملف المستهدف.', true); }
});
$('#f-tsheet').addEventListener('change', e => { pending.target.sheet = e.target.value; const raw = extractRaw(pending.target.src.aoa(e.target.value)); pending.target.data = convert(raw); renderMap(); preview(); });
$('#b-notarget').addEventListener('click', () => { if (pending) pending.target = null; else if (latest && latest.targets) { pending = { actual: { data: latest.data, reuse: true, name: latest.file_name }, target: null }; $('#pub-box').hidden = false; } project.config = { ...project.config, target: null }; queue({ config: project.config }); $('#drop-target').classList.remove('done'); $('#tsheet-wrap').hidden = true; renderMap(); preview(); });

function renderMap() {
  const a = pending && pending.actual && pending.actual.data, t = pending && pending.target && pending.target.data;
  $('#map').hidden = !(a && t);
  if (!(a && t)) return;
  let cfg = project.config.target;
  const valid = cfg && a.columns.some(c => c.name === cfg.aKey) && a.columns.some(c => c.name === cfg.aVal) && t.columns.some(c => c.name === cfg.tKey) && t.columns.some(c => c.name === cfg.tVal);
  if (!valid) { cfg = guessTargetCfg(a, t); project.config = { ...project.config, target: cfg }; queue({ config: project.config }); }
  const opt = (cols, filter, cur) => cols.filter(filter).map(c => `<option ${c.name === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const notNum = c => c.type !== 'number', isNum = c => c.type === 'number';
  $('#m-akey').innerHTML = opt(a.columns, notNum, cfg && cfg.aKey);
  $('#m-aval').innerHTML = opt(a.columns, isNum, cfg && cfg.aVal);
  $('#m-tkey').innerHTML = opt(t.columns, notNum, cfg && cfg.tKey);
  $('#m-tval').innerHTML = opt(t.columns, isNum, cfg && cfg.tVal);
  if (!cfg) dstatus('لم أستطع ربط المستهدف تلقائيًا. اختر الأعمدة يدويًا.', true);
}
['m-akey', 'm-aval', 'm-tkey', 'm-tval'].forEach(x => $('#' + x).addEventListener('change', () => {
  project.config = { ...project.config, target: { aKey: $('#m-akey').value, aVal: $('#m-aval').value, tKey: $('#m-tkey').value, tVal: $('#m-tval').value } };
  queue({ config: project.config }); preview();
}));
$('#f-vperiod').addEventListener('input', preview);

function resetData() {
  pending = null; $('#pub-box').hidden = true; $('#cols').innerHTML = ''; $('#clean-report').hidden = true; $('#map').hidden = true; $('#sheet-wrap').hidden = true; $('#tsheet-wrap').hidden = true;
  $('#drop-data').classList.remove('done'); $('#drop-target').classList.remove('done'); $('#f-paste').value = '';
}
$('#b-discard').addEventListener('click', () => { resetData(); dstatus('تم تجاهل التحديث.'); preview(); });
$('#b-version').addEventListener('click', async () => {
  if (!pending || !pending.actual || !pending.actual.data) return;
  const btn = $('#b-version'); btn.disabled = true; dstatus('جاري النشر…');
  await flush();
  const data = pending.actual.data, targets = pending.target ? pending.target.data : null;
  const row = {
    project_id: id, period: $('#f-vperiod').value.trim(), label: '',
    file_name: pending.actual.reuse ? (pending.actual.name || '') : pending.actual.src.name,
    target_file_name: pending.target ? (pending.target.src ? pending.target.src.name : (latest && latest.target_file_name) || 'مستهدف') : null,
    data, targets, totals: computeTotals(data, mopts()), row_count: data.rows.length
  };
  const { error } = await sb.from('versions').insert(row);
  btn.disabled = false;
  if (error) { dstatus('تعذّر النشر: ' + error.message, true); return; }
  resetData(); await loadVersions(); preview();
  dstatus('تم نشر التحديث. الرابط يعرض البيانات الجديدة الآن.'); toast('تم التحديث');
});

/* ---------- 4 templates ---------- */
const SCHEMA = {
  tiles: '<rect x="4" y="4" width="14" height="10" class="p"/><rect x="4" y="16" width="14" height="10"/><rect x="20" y="4" width="26" height="22"/><rect x="48" y="4" width="24" height="22"/><rect x="4" y="29" width="16" height="9"/><rect x="22" y="29" width="16" height="9" class="p"/><rect x="40" y="29" width="16" height="9"/><rect x="58" y="29" width="14" height="9"/><rect x="4" y="40" width="16" height="8"/><rect x="22" y="40" width="16" height="8"/><rect x="40" y="40" width="16" height="8"/><rect x="58" y="40" width="14" height="8"/>',
  executive: '<rect x="4" y="4" width="68" height="10" class="p"/><rect x="4" y="17" width="16" height="8"/><rect x="22" y="17" width="16" height="8"/><rect x="40" y="17" width="16" height="8"/><rect x="58" y="17" width="14" height="8"/><rect x="4" y="28" width="44" height="20"/><rect x="50" y="28" width="22" height="20"/>',
  compact: '<rect x="24" y="4" width="28" height="12" class="p"/><rect x="24" y="18" width="28" height="4"/><rect x="24" y="24" width="28" height="4"/><rect x="24" y="30" width="28" height="4"/><rect x="24" y="36" width="28" height="12"/>'
};
function renderTemplates() {
  $('#tpls').innerHTML = Object.entries(TEMPLATES).map(([k, t]) => `<button type="button" class="tpl" data-t="${k}" aria-pressed="${project.template === k}"><svg viewBox="0 0 76 52" aria-hidden="true">${SCHEMA[k]}</svg><span><strong>${t.name}</strong><span>${t.desc}</span></span></button>`).join('');
}
$('#tpls').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; project.template = b.dataset.t; renderTemplates(); renderViz(); queue({ template: project.template }); preview(); });

/* what the charts show (stored by column name) */
let defsVid = null;
function renderDefaults(force) {
  const { version } = currentVersion();
  const box = $('#defs'); if (!box) return;
  const vid = version ? (version.id || version.file_name || 'pending') + ':' + (version.data && version.data.columns ? version.data.columns.length : 0) : null;
  if (!force && vid === defsVid) return; defsVid = vid;
  if (!version || !version.data) { box.innerHTML = '<p class="muted" style="font-size:13px;margin:0">ارفع البيانات أولًا.</p>'; return; }
  const m = createModel(version.data, mopts()), d = project.config.defaults || {};
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
  const cats = m.cats.map(i => m.cols[i].name);
  const rows = [
    ['metric', 'المؤشر (الرقم)', [['', 'تلقائي'], ...m.nums.map(i => [m.cols[i].name, m.cols[i].name]), ['__count', 'عدد السجلات']]],
    ['dim', 'التقسيم الأساسي', [['', 'تلقائي'], ...cats.map(n => [n, n])]],
    ['sd', 'التقسيم الثاني (ألوان الأعمدة)', [['', 'تلقائي'], ['__none', 'بدون'], ...cats.map(n => [n, n])]],
    ['pie', 'الرسم الدائري حسب', [['', 'تلقائي'], ...cats.map(n => [n, n])]]
  ];
  box.innerHTML = rows.map(([k, l, os]) => `<label class="field"><span class="label" style="font-size:12.5px">${l}</span><select data-def="${k}">${os.map(([v, t]) => opt(v, t, d[k] || '')).join('')}</select></label>`).join('')
    + aggHTML(m) + measuresHTML(m);
}
/* calculated measures: A ÷ B, A − B, A + B, A × B */
const OPS = [['/', '÷ قسمة'], ['-', '− طرح'], ['+', '+ جمع'], ['*', '× ضرب']], OPSYM = { '/': '÷', '-': '−', '+': '+', '*': '×' };
function measuresHTML(m) {
  const list = project.config.measures || [], base = m.nums.filter(i => !m.cols[i].measure).map(i => m.cols[i].name);
  if (base.length < 1) return '';
  const opt = n => `<option value="${esc(n)}">${esc(n)}</option>`;
  const items = list.map((x, i) => `<li><span><b><bdi>${esc(x.name)}</bdi></b> = <bdi>${esc(x.a)}</bdi> ${OPSYM[x.op]} <bdi>${esc(x.b)}</bdi>${x.pct ? ' × 100' : ''}${m.idx(x.name) < 0 ? ' <em class="ms-bad">(العمود غير موجود في البيانات الحالية)</em>' : ''}</span><button type="button" class="ms-del" data-msdel="${i}" aria-label="حذف">✕</button></li>`).join('');
  return `<details class="agg-box ms-box" ${list.length ? 'open' : ''}><summary>مقاييس محسوبة${list.length ? ` <span class="agg-c">${list.length}</span>` : ''}</summary>
    <p class="muted" style="font-size:12px;margin:6px 0 8px">مثل CTR = النقرات ÷ الظهور، أو الربح = الإيراد − التكلفة. تنحسب من الإجماليات (مو متوسط الصفوف) وتطلع في قائمة «المؤشر».</p>
    ${items ? `<ul class="ms-list">${items}</ul>` : ''}
    <div class="ms-form"><input id="ms-name" placeholder="اسم المقياس (مثل: CTR %)" maxlength="40">
      <select id="ms-a">${base.map(opt).join('')}</select><select id="ms-op">${OPS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><select id="ms-b">${base.map(opt).join('')}</select>
      <label class="ms-pct"><input type="checkbox" id="ms-pct" checked> اعرضها كنسبة % (× 100)</label>
      <button type="button" class="btn btn-primary btn-sm" id="ms-add">إضافة المقياس</button><p class="ms-msg" id="ms-msg" role="status"></p></div></details>`;
}
/* how each number column is summarised (Sum / Average / Max / Min) */
const AGG_L = { sum: 'مجموع', avg: 'متوسط', max: 'أعلى قيمة', min: 'أدنى قيمة' };
function aggHTML(m) {
  if (!m.nums.length) return '';
  const a = project.config.agg || {}, changed = m.nums.filter(i => a[m.cols[i].name]).length;
  const rowsH = m.nums.filter(i => !m.cols[i].measure).map(i => { const n = m.cols[i].name, cur = a[n] || '';
    return `<label class="agg-row"><span class="agg-n" title="${esc(n)}"><bdi>${esc(n)}</bdi></span><select data-agg="${esc(n)}"><option value="" ${cur ? '' : 'selected'}>تلقائي (${AGG_L[m.autoAgg(i)]})</option>${['sum', 'avg', 'max', 'min'].map(v => `<option value="${v}" ${cur === v ? 'selected' : ''}>${AGG_L[v]}</option>`).join('')}</select></label>`; }).join('');
  return `<details class="agg-box" ${changed ? 'open' : ''}><summary>طريقة تجميع الأرقام${changed ? ` <span class="agg-c">${changed}</span>` : ''}</summary><p class="muted" style="font-size:12px;margin:6px 0 8px">النسب والمعدلات (مثل CTR أو نسبة الإنجاز) تنحسب «متوسط» تلقائيًا، وباقي الأرقام «مجموع». غيّرها إذا العمود يحتاج غير كذا.</p>${rowsH}</details>`;
}
$('#defs').addEventListener('change', e => { if (e.target.id === 'ms-op') { const pc = $('#ms-pct'); if (pc) pc.closest('label').hidden = e.target.value !== '/'; }
  const ag = e.target.closest('[data-agg]');
  if (ag) {
    const a = { ...(project.config.agg || {}) };
    if (ag.value) a[ag.dataset.agg] = ag.value; else delete a[ag.dataset.agg];
    project.config = { ...project.config, agg: a };
    queue({ config: project.config }); renderDefaults(true); preview(); return;
  }
  const s = e.target.closest('[data-def]'); if (!s) return;
  const d = { ...(project.config.defaults || {}) };
  if (s.value) d[s.dataset.def] = s.value; else delete d[s.dataset.def];
  project.config = { ...project.config, defaults: d };
  queue({ config: project.config }); preview();
});

$('#defs').addEventListener('click', e => {
  const del = e.target.closest('[data-msdel]');
  const save = list => { project.config = { ...project.config, measures: list }; queue({ config: project.config }); renderDefaults(true); preview(); };
  if (del) { const list = (project.config.measures || []).slice(); const [gone] = list.splice(+del.dataset.msdel, 1); const d = { ...(project.config.defaults || {}) }; if (gone && d.metric === gone.name) { delete d.metric; project.config = { ...project.config, defaults: d }; } save(list); return; }
  if (!e.target.closest('#ms-add')) return;
  const name = $('#ms-name').value.trim(), a = $('#ms-a').value, op = $('#ms-op').value, b = $('#ms-b').value, pct = op === '/' && $('#ms-pct').checked, msg = $('#ms-msg');
  const { version } = currentVersion(); const cols = version && version.data ? version.data.columns.map(c => c.name) : [];
  const list = project.config.measures || [];
  if (!name) { msg.textContent = 'اكتب اسم المقياس.'; return; }
  if (cols.includes(name) || list.some(x => x.name === name)) { msg.textContent = 'فيه عمود أو مقياس بنفس الاسم، اختر اسم ثاني.'; return; }
  if (a === b && op === '/') { msg.textContent = 'اختر عمودين مختلفين للقسمة.'; return; }
  save(list.concat([{ name, a, op, b, pct }]));
});

/* chart type per slot */
const VI = {
  fcon: '<path d="M3 17l5-5 4 3 3-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 12l6-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="2 3"/>',
  fcoff: '<path d="M3 17l5-5 4 3 8-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  bar: '<rect x="3" y="12" width="4" height="9"/><rect x="10" y="6" width="4" height="15"/><rect x="17" y="9" width="4" height="12"/>',
  hbar: '<rect x="3" y="3" width="15" height="4"/><rect x="3" y="10" width="11" height="4"/><rect x="3" y="17" width="18" height="4"/>',
  line: '<path d="M3 18l5-6 4 3 8-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  area: '<path d="M3 18l5-6 4 3 8-9V21H3z" opacity=".35"/><path d="M3 18l5-6 4 3 8-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M14 1.5a8.5 8.5 0 0 1 8.5 8.5H14z" opacity=".5"/>',
  doughnut: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="30 18"/>',
  gauge: '<path d="M3 17a9 9 0 0 1 18 0" fill="none" stroke="currentColor" stroke-width="3.2" opacity=".35"/><path d="M3 17a9 9 0 0 1 14-7.5" fill="none" stroke="currentColor" stroke-width="3.2"/>',
  kbar: '<rect x="2" y="10" width="20" height="5" rx="2.5" opacity=".35"/><rect x="2" y="10" width="14" height="5" rx="2.5"/>',
  number: '<text x="12" y="17" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">97%</text>'
};
const VIZ_OPTS = [
  { slot: 'breakdown', label: 'التوزيع حسب الفئة', opts: [['bar', 'أعمدة'], ['hbar', 'أفقي'], ['line', 'خطي'], ['pie', 'دائري', 'doughnut']] },
  { slot: 'share', label: 'الحصص', opts: [['doughnut', 'حلقي'], ['pie', 'دائري'], ['bar', 'أعمدة'], ['hbar', 'أفقي']] },
  { slot: 'trend', label: 'الاتجاه عبر الزمن', opts: [['area', 'مساحة'], ['line', 'خطي'], ['bar', 'أعمدة']] },
  { slot: 'kpi', label: 'نسبة الإنجاز', opts: [['gauge', 'عداد'], ['bar', 'شريط', 'kbar'], ['number', 'رقم']] },
  { slot: 'forecast', label: 'توقع الأشهر القادمة', opts: [['on', 'إظهار', 'fcon'], ['off', 'إخفاء', 'fcoff']] }
];
function renderViz() {
  const cur = slot => (project.config.viz && project.config.viz[slot]) || vizDefault(project.template, slot);
  $('#vizopts').innerHTML = VIZ_OPTS.map(g => `<div class="vizrow"><span class="vizl">${g.label}</span><div class="vizchips" role="group" aria-label="${g.label}">${g.opts.map(([v, l, ic]) => `<button type="button" class="vchip" data-slot="${g.slot}" data-v="${v}" aria-pressed="${cur(g.slot) === v}"><svg viewBox="0 0 24 24" aria-hidden="true">${VI[ic || v]}</svg>${l}</button>`).join('')}</div></div>`).join('');
  $('#viz-reset').hidden = !(project.config.viz && Object.keys(project.config.viz).length);
}
$('#vizopts').addEventListener('click', e => {
  const b = e.target.closest('[data-slot]'); if (!b) return;
  project.config = { ...project.config, viz: { ...(project.config.viz || {}), [b.dataset.slot]: b.dataset.v } };
  queue({ config: project.config }); renderViz(); preview();
});
$('#viz-reset').addEventListener('click', () => { const { viz, ...rest } = project.config; project.config = rest; queue({ config: project.config }); renderViz(); preview(); });

/* ---------- 5 recommendations ---------- */
const recs = () => (project.config.recs || []);
function saveRecs(list) { project.config = { ...project.config, recs: list }; queue({ config: project.config }); renderRecs(); preview(); }
function renderRecs() {
  const list = recs();
  $('#reclist').innerHTML = list.length ? list.map((r, i) => `<li data-i="${i}"><textarea rows="2" data-edit="${i}" aria-label="توصية ${i + 1}">${esc(r.text)}</textarea><button type="button" class="btn btn-ghost btn-sm" data-del="${i}" aria-label="حذف التوصية">حذف</button></li>`).join('')
    : '<li class="empty">لا توجد توصيات بعد.</li>';
}
$('#reclist').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (!b) return; const l = recs().slice(); l.splice(+b.dataset.del, 1); saveRecs(l); });
$('#reclist').addEventListener('change', e => { const t = e.target.closest('[data-edit]'); if (!t) return; const l = recs().slice(), v = t.value.trim(); if (v) l[+t.dataset.edit] = { ...l[+t.dataset.edit], text: v }; else l.splice(+t.dataset.edit, 1); saveRecs(l); });
$('#b-recadd').addEventListener('click', () => { const v = $('#f-rec').value.trim(); if (!v) return; $('#f-rec').value = ''; saveRecs(recs().concat([{ text: v }])); });
$('#b-recgen').addEventListener('click', () => {
  const { version } = currentVersion();
  if (!version || !version.data) { $('#rec-status').textContent = 'ارفع ملف البيانات أولًا.'; return; }
  const m = createModel(version.data, mopts());
  const ts = version.targets ? targetStats(m, m.rows, version.targets, project.config.target, {}) : null;
  const have = new Set(recs().map(r => r.text));
  const fresh = autoRecommendations(m, ts, (project.config.defaults || {}).metric).filter(t => !have.has(t)).map(text => ({ text, auto: true }));
  $('#rec-status').textContent = fresh.length ? `أُضيفت ${fresh.length} توصيات. عدّلها أو احذف ما لا يناسب.` : 'لا توجد توصيات جديدة من هذه البيانات.';
  if (fresh.length) saveRecs(recs().concat(fresh));
});

/* ---------- 6 notes & decisions ---------- */
const NT = { note: 'ملاحظة', decision: 'قرار', action: 'إجراء مطلوب' };
let ntype = 'note';
const notes = () => (project.config.notes || []);
function saveNotes(list) { project.config = { ...project.config, notes: list }; queue({ config: project.config }); renderNotes(); preview(); }
function renderNotes() {
  const l = notes();
  $('#notelist').innerHTML = l.length ? l.map((n, i) => `<li><div class="nhead"><span class="ntag nt-${n.type}">${NT[n.type] || NT.note}</span><span class="muted">${esc(fmtDate(n.date))}</span><button type="button" class="btn btn-ghost btn-sm" data-ndel="${i}" aria-label="حذف">حذف</button></div><textarea rows="2" data-nedit="${i}" aria-label="نص الملاحظة">${esc(n.text)}</textarea></li>`).join('') : '<li class="empty">لا توجد ملاحظات بعد.</li>';
}
$('#ntypes').addEventListener('click', e => { const b = e.target.closest('[data-nt]'); if (!b) return; ntype = b.dataset.nt; $('#ntypes').querySelectorAll('[data-nt]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
$('#b-noteadd').addEventListener('click', () => { const v = $('#f-note').value.trim(); if (!v) return; $('#f-note').value = ''; saveNotes([{ type: ntype, text: v, date: new Date().toISOString() }].concat(notes())); });
$('#notelist').addEventListener('click', e => { const b = e.target.closest('[data-ndel]'); if (!b) return; const l = notes().slice(); l.splice(+b.dataset.ndel, 1); saveNotes(l); });
$('#notelist').addEventListener('change', e => { const t = e.target.closest('[data-nedit]'); if (!t) return; const l = notes().slice(), v = t.value.trim(); if (v) l[+t.dataset.nedit] = { ...l[+t.dataset.nedit], text: v }; else l.splice(+t.dataset.nedit, 1); saveNotes(l); });

/* ---------- 7 share ---------- */
const shareUrl = () => new URL('view.html?s=' + project.share_slug, location.href).href;
function renderShare() {
  $('#f-pub').checked = project.is_published;
  $('#f-link').value = shareUrl();
  $('#open-link').href = shareUrl(); $('#open-link').hidden = !project.is_published;
  const hasPass = !!project.share_pass_hash;
  $('#pass-state').textContent = hasPass ? 'الرابط محمي بكلمة مرور' : 'بدون كلمة مرور';
  $('#b-nopass').hidden = !hasPass;
  renderViews();
}
async function renderViews() {
  if (!('view_count' in project)) return; // migration 002 not applied yet
  $('#views-box').hidden = false;
  $('#v-total').textContent = Number(project.view_count || 0).toLocaleString('en-US');
  $('#v-last').textContent = project.last_viewed_at ? 'آخر مشاهدة ' + fmtDate(project.last_viewed_at) + ' · آخر 14 يوم' : (project.is_published ? 'ما فتح أحد الرابط بعد.' : 'فعّل النشر وشارك الرابط لتبدأ المشاهدات.');
  const since = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
  const { data } = await sb.from('share_views').select('day,views').eq('project_id', id).gte('day', since);
  const map = new Map((data || []).map(r => [r.day, r.views]));
  const days = [...Array(14)].map((_, i) => new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10));
  const max = Math.max(1, ...days.map(d => map.get(d) || 0));
  $('#v-bars').innerHTML = days.map(d => { const v = map.get(d) || 0; return `<i style="height:${Math.max(6, v / max * 100)}%" class="${v ? 'on' : ''}" title="${d}: ${v}"></i>`; }).join('');
}
const sstatus = (m, err) => { const s = $('#share-status'); s.textContent = m; s.classList.toggle('err', !!err); };
$('#f-pub').addEventListener('change', async e => {
  project.is_published = e.target.checked; queue({ is_published: project.is_published }); await flush(); renderShare();
  sstatus(project.is_published ? (latest ? 'الرابط يعمل الآن. أي شخص معه الرابط يقدر يتصفح.' : 'تم النشر، لكن ارفع البيانات وانشر تحديثًا لتظهر لوحة المؤشرات.') : 'أُوقف الرابط. لن يفتح لأحد.');
});
$('#b-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareUrl()); sstatus('تم نسخ الرابط.'); }
  catch (e) { $('#f-link').select(); sstatus('حدّد الرابط وانسخه يدويًا.'); }
});
async function setPass(p) {
  const { error } = await sb.rpc('set_share_password', { p_id: id, p_pass: p });
  if (error) { sstatus('تعذّر حفظ كلمة المرور.', true); return; }
  project.share_pass_hash = p ? 'set' : null; $('#f-pass').value = ''; renderShare();
  sstatus(p ? 'تم حفظ كلمة المرور. أرسلها لمن تريد مع الرابط.' : 'أُزيلت كلمة المرور.');
}
$('#b-pass').addEventListener('click', () => { const p = $('#f-pass').value; if (p.length < 4) { sstatus('اكتب كلمة مرور من 4 أحرف أو أكثر.', true); return; } setPass(p); });
$('#b-nopass').addEventListener('click', () => setPass(''));
$('#b-del').addEventListener('click', () => { $('#del-confirm').hidden = false; });
$('#b-del2').addEventListener('click', async () => {
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) { sstatus('تعذّر الحذف.', true); return; }
  location.href = 'app.html';
});

wireExport(() => ({ el: document.querySelector('#preview .dash'), title: project && project.title }), m => { $('#xst').textContent = m; });
load();

// full-screen preview while editing
{
  const pv = document.querySelector('.preview'), bx = $('#b-expand');
  const setX = on => { pv.classList.toggle('expanded', on); document.body.classList.toggle('pv-open', on); bx.setAttribute('aria-pressed', on); bx.textContent = on ? '✕ تصغير' : '⛶ تكبير'; window.dispatchEvent(new Event('resize')); };
  bx.addEventListener('click', () => setX(!pv.classList.contains('expanded')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pv.classList.contains('expanded') && !document.querySelector('.d-sqlmodal')) setX(false); });
}
