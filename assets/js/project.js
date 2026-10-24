// Project editor: details, brand, data versions, template, sharing — with live preview.
import { sb, $, requireUser, mountNav, setupNotice, toast } from './sb.js';
import { mountDashboard, TEMPLATES } from './render.js';
import { DEFAULT_BRAND, FONTS, extractColors, computeTotals, guessTargetCfg, esc, fmtDate } from './engine.js';
import { openFile, openPasted, extractRaw, convert, TYPES } from './parse.js';
import { wireExport } from './export.js';

if (setupNotice($('#setup'))) throw new Error('not configured');
const user = await requireUser();
mountNav(user);
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
  document.title = project.title + ' | داش بورد';
  $('#f-title').value = project.title; $('#f-topic').value = project.topic; $('#f-desc').value = project.description; $('#f-period').value = project.period;
  const b = project.brand;
  $('#c-primary').value = b.primary; $('#c-secondary').value = b.secondary; $('#c-accent').value = b.accent;
  $('#f-font').innerHTML = Object.keys(FONTS).map(f => `<option ${f === b.font ? 'selected' : ''}>${f}</option>`).join('');
  logoPreview(b.logo_url);
  renderTemplates(); renderShare();
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
['primary', 'secondary', 'accent'].forEach(k => $('#c-' + k).addEventListener('input', e => setBrand({ [k]: e.target.value.toUpperCase() })));
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
      $('#c-primary').value = p.primary; if (p.secondary) $('#c-secondary').value = p.secondary; if (p.accent) $('#c-accent').value = p.accent;
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
$('#swatches').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; $('#c-primary').value = b.dataset.c; setBrand({ primary: b.dataset.c }); });

/* ---------- 3 data ---------- */
const dstatus = (msg, err) => { const s = $('#data-status'); s.textContent = msg || ''; s.classList.toggle('err', !!err); };
function renderVersions() {
  $('#cur-version').textContent = latest ? `البيانات الحالية: ${latest.file_name || '—'} · ${Number(latest.row_count).toLocaleString('en-US')} صف · ${fmtDate(latest.created_at)}` : 'لا توجد بيانات بعد. ارفع أول ملف.';
  $('#vlist').innerHTML = versions.length ? versions.map((v, i) => `<li><span class="vtag ${i === 0 ? 'now' : ''}">${i === 0 ? 'الحالي' : 'v' + (versions.length - i)}</span><strong>${esc(v.period || v.file_name)}</strong><span class="muted">${esc(v.file_name)}${v.target_file_name ? ' + ' + esc(v.target_file_name) : ''} · ${Number(v.row_count).toLocaleString('en-US')} صف · ${esc(fmtDate(v.created_at))}</span></li>`).join('') : '<li class="muted">لا يوجد</li>';
}
function rebuild() {
  const msgs = [];
  for (const kind of ['actual', 'target']) {
    const p = pending && pending[kind]; if (!p || !p.src) continue;
    const raw = extractRaw(p.src.aoa(p.sheet));
    p.data = convert(raw, p.overrides);
    if (kind === 'actual') msgs.push(`تمت قراءة ${p.data.rows.length.toLocaleString('en-US')} صف و${p.data.columns.length} عمود من «${p.src.name}».` + (raw.dropped ? ` حُذف ${raw.dropped} صف إجمالي لتجنب تكرار الجمع.` : '') + (raw.truncated ? ' تم الاكتفاء بأول 10,000 صف.' : ''));
    else msgs.push(`ملف المستهدف: ${p.data.rows.length} صف.`);
  }
  renderCols(); renderMap();
  $('#pub-box').hidden = !(pending && pending.actual);
  dstatus(msgs.join(' ') + (pending && pending.actual ? ' راجع المعاينة ثم اضغط «نشر التحديث».' : ''));
  preview();
}
function renderCols() {
  const p = pending && pending.actual;
  if (!p) { $('#cols').innerHTML = ''; return; }
  $('#cols').innerHTML = '<p class="label" style="margin-bottom:6px">هكذا فُهمت الأعمدة. غيّر النوع إذا كان غير صحيح.</p><div class="chips">' + p.data.columns.map((c, i) => `<label class="chip"><span>${esc(c.name)}</span><select data-col="${i}" aria-label="نوع ${esc(c.name)}">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`).join('') + '</div>';
}
$('#cols').addEventListener('change', e => { const i = e.target.dataset.col; if (i == null || !pending) return; pending.actual.overrides[i] = e.target.value; safe(rebuild); });

function sheetSelect(sel, wrap, src) {
  $(sel).innerHTML = src.sheets.map(n => `<option>${esc(n)}</option>`).join('');
  $(wrap).hidden = src.sheets.length < 2;
}
function safe(fn) { try { fn(); } catch (e) { dstatus('تعذّرت قراءة البيانات. تأكد أن أحد الصفوف الأولى يحتوي عناوين الأعمدة.', true); } }

async function takeActual(srcPromise) {
  dstatus('جاري قراءة الملف…');
  try {
    const src = await srcPromise;
    pending = { actual: { src, sheet: src.sheets[0], overrides: {} }, target: pending ? pending.target : null };
    if (!pending.target && latest && latest.targets) pending.target = { src: null, data: latest.targets, fromLatest: true };
    sheetSelect('#f-sheet', '#sheet-wrap', src);
    $('#drop-data').classList.add('done');
    if (!$('#f-vperiod').value) $('#f-vperiod').value = project.period || '';
    rebuild();
  } catch (e) { pending = null; dstatus('تعذّرت قراءة الملف. تأكد أنه Excel أو CSV وأن أحد الصفوف الأولى يحتوي عناوين الأعمدة.', true); }
}
const okExt = f => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name);
$('#f-data').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (!okExt(f)) { dstatus('اختر ملفًا بصيغة xlsx أو xls أو csv.', true); return; } takeActual(openFile(f)); });
$('#b-paste').addEventListener('click', () => { const t = $('#f-paste').value; if (!t.trim()) { dstatus('الصق الجدول أولًا.', true); return; } takeActual(Promise.resolve(openPasted(t))); });
$('#f-sheet').addEventListener('change', e => { pending.actual.sheet = e.target.value; pending.actual.overrides = {}; safe(rebuild); });

$('#f-target').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!okExt(f)) { dstatus('اختر ملفًا بصيغة xlsx أو xls أو csv.', true); return; }
  try {
    const src = await openFile(f);
    if (!pending || !pending.actual) {
      if (!latest) { dstatus('ارفع ملف البيانات أولًا، ثم ملف المستهدف.', true); return; }
      pending = { actual: { src: null, data: latest.data, reuse: true, name: latest.file_name }, target: null };
    }
    pending.target = { src, sheet: src.sheets[0], overrides: {} };
    sheetSelect('#f-tsheet', '#tsheet-wrap', src);
    $('#drop-target').classList.add('done');
    project.config = { ...project.config, target: null };
    if (pending.actual.reuse) { const raw = extractRaw(src.aoa(src.sheets[0])); pending.target.data = convert(raw); renderMap(); $('#pub-box').hidden = false; dstatus('ملف المستهدف جاهز. راجع الربط ثم انشر التحديث.'); preview(); }
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
  pending = null; $('#pub-box').hidden = true; $('#cols').innerHTML = ''; $('#map').hidden = true; $('#sheet-wrap').hidden = true; $('#tsheet-wrap').hidden = true;
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
    data, targets, totals: computeTotals(data), row_count: data.rows.length
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
$('#tpls').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; project.template = b.dataset.t; renderTemplates(); queue({ template: project.template }); preview(); });

/* ---------- 5 share ---------- */
const shareUrl = () => new URL('view.html?s=' + project.share_slug, location.href).href;
function renderShare() {
  $('#f-pub').checked = project.is_published;
  $('#f-link').value = shareUrl();
  $('#open-link').href = shareUrl(); $('#open-link').hidden = !project.is_published;
  const hasPass = !!project.share_pass_hash;
  $('#pass-state').textContent = hasPass ? 'الرابط محمي بكلمة مرور' : 'بدون كلمة مرور';
  $('#b-nopass').hidden = !hasPass;
}
const sstatus = (m, err) => { const s = $('#share-status'); s.textContent = m; s.classList.toggle('err', !!err); };
$('#f-pub').addEventListener('change', async e => {
  project.is_published = e.target.checked; queue({ is_published: project.is_published }); await flush(); renderShare();
  sstatus(project.is_published ? (latest ? 'الرابط يعمل الآن. أي شخص معه الرابط يقدر يتصفح.' : 'تم النشر، لكن ارفع البيانات وانشر تحديثًا ليظهر الداش بورد.') : 'أُوقف الرابط. لن يفتح لأحد.');
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
