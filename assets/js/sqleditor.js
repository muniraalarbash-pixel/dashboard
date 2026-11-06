// In-browser SQL editor: the dashboard's data is loaded into SQLite (sql.js, WebAssembly) as table "data"
// (and "targets" when a target file exists). Nothing leaves the browser and the original data is never changed.
import { T, esc } from './engine.js';

const CDN = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/';
let sqlP = null;
function loadSql() {
  if (sqlP) return sqlP;
  sqlP = new Promise((res, rej) => {
    const go = () => window.initSqlJs({ locateFile: f => CDN + f }).then(res, rej);
    if (window.initSqlJs) return go();
    const s = document.createElement('script'); s.src = CDN + 'sql-wasm.js';
    s.onload = go; s.onerror = () => { sqlP = null; rej(new Error('sqljs')); };
    document.head.appendChild(s);
  });
  return sqlP;
}

const dbCache = new WeakMap();
const qi = n => '"' + String(n).replace(/"/g, '""') + '"';
function fillTable(db, name, model) {
  const cols = model.cols.map((c, i) => ({ ...c, i })).filter(c => !c.virtual);
  db.run(`CREATE TABLE ${name} (${cols.map(c => `${qi(c.name)} ${c.type === 'number' ? 'REAL' : 'TEXT'}`).join(', ')})`);
  const st = db.prepare(`INSERT INTO ${name} VALUES (${cols.map(() => '?').join(',')})`);
  db.run('BEGIN');
  for (const r of model.rows) st.run(cols.map(c => { const i = c.i; const v = r[i]; if (v == null || v === '') return null; if (c.type === 'number') return typeof v === 'number' && isFinite(v) ? v : null; return v instanceof Date ? v.toISOString().slice(0, 10) : String(v); }));
  db.run('COMMIT'); st.free();
}
// every run gets a fresh copy, so a DELETE/UPDATE in one query never affects the next one
async function getDb(m, tm) {
  const SQL = await loadSql();
  if (!dbCache.has(m)) {
    const db = new SQL.Database();
    fillTable(db, 'data', m);
    if (tm) fillTable(db, 'targets', tm);
    dbCache.set(m, db.export()); db.close();
  }
  return new SQL.Database(dbCache.get(m));
}

const fmtCell = v => v == null ? '<span class="nul">NULL</span>' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 })) : esc(v);
const csvCell = v => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

export function openSqlEditor({ m, tm, sql, title, vars, dir }) {
  const old = document.querySelector('.d-sqlmodal'); if (old) old.remove();
  const tables = [['data', m]].concat(tm ? [['targets', tm]] : []);
  const chips = tables.map(([n, mod]) => `<div class="d-sqltbl"><b dir="ltr">${n}</b><span>${mod.rows.length.toLocaleString('en-US')} ${T('صف', 'rows')}</span>${mod.cols.filter(c => !c.virtual).map(c => `<button type="button" class="d-sqlcol" data-ins="${esc(qi(c.name))}" title="${T('إدراج اسم العمود', 'Insert column name')}">${esc(c.name)}</button>`).join('')}</div>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<div class="d-sqlmodal no-export" role="dialog" aria-modal="true" aria-label="SQL">
    <div class="d-sqlbox wide">
      <div class="d-sqlhead"><strong>${esc(title || T('محرر SQL', 'SQL editor'))}</strong><span>${T('اكتب أو عدّل الاستعلام ثم اضغط «تشغيل». البيانات تبقى في متصفحك ولا تتغير.', 'Write or edit the query, then press Run. Data stays in your browser and is never changed.')}</span></div>
      <div class="d-sqltbls">${chips}</div>
      <textarea class="d-sqlcode" dir="ltr" spellcheck="false" autocomplete="off" aria-label="SQL">${esc(sql || 'SELECT *\nFROM data\nLIMIT 20;')}</textarea>
      <div class="d-sqlact">
        <button type="button" class="d-sqlrun">${T('تشغيل ▶', 'Run ▶')}</button>
        <span class="d-sqlhint">Ctrl + Enter</span>
        <span class="d-sqlsp"></span>
        ${sql ? `<button type="button" class="d-sqlreset">${T('الاستعلام الأصلي', 'Original query')}</button>` : ''}
        <button type="button" class="d-sqlcopy">${T('نسخ', 'Copy')}</button>
        <button type="button" class="d-sqlclose">${T('إغلاق', 'Close')}</button>
      </div>
      <div class="d-sqlout" aria-live="polite"></div>
    </div></div>`);
  const md = document.querySelector('.d-sqlmodal');
  Object.entries(vars || {}).forEach(([k, v]) => v && md.style.setProperty(k, v));
  md.setAttribute('dir', dir || 'rtl');
  const ta = md.querySelector('.d-sqlcode'), out = md.querySelector('.d-sqlout');
  let last = null;
  const close = () => { md.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  md.addEventListener('click', e => { if (e.target === md || e.target.closest('.d-sqlclose')) close(); });
  md.querySelector('.d-sqlcopy').addEventListener('click', e => { const b = e.currentTarget; (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(() => { b.textContent = T('تم النسخ', 'Copied'); setTimeout(() => { b.textContent = T('نسخ', 'Copy'); }, 1500); }).catch(() => { ta.select(); }); });
  const rs = md.querySelector('.d-sqlreset'); if (rs) rs.addEventListener('click', () => { ta.value = sql; ta.focus(); });
  md.querySelector('.d-sqltbls').addEventListener('click', e => { const b = e.target.closest('[data-ins]'); if (!b) return; const s = ta.selectionStart, en = ta.selectionEnd, v = b.dataset.ins; ta.value = ta.value.slice(0, s) + v + ta.value.slice(en); ta.focus(); ta.selectionStart = ta.selectionEnd = s + v.length; });
  async function run() {
    const q = ta.value.trim(); if (!q) return;
    out.innerHTML = `<p class="d-sqlmsg">${T('جاري التشغيل…', 'Running…')}</p>`;
    try {
      const db = await getDb(m, tm);
      const t0 = performance.now();
      let res; try { res = db.exec(q); } finally { db.close(); }
      const ms = Math.round(performance.now() - t0);
      if (!res.length) { last = null; out.innerHTML = `<p class="d-sqlmsg">${T('تم التنفيذ، ولا توجد نتائج لعرضها.', 'Done — no rows to show.')} <small>${ms} ms</small></p>`; return; }
      const r = res[res.length - 1]; last = r;
      const shown = r.values.slice(0, 200);
      out.innerHTML = `<div class="d-sqlmeta"><span>${r.values.length.toLocaleString('en-US')} ${T('صف', 'rows')} · ${ms} ms${r.values.length > 200 ? ' · ' + T('يُعرض أول 200', 'showing first 200') : ''}</span><button type="button" class="d-sqlcsv">${T('تنزيل CSV', 'Download CSV')}</button></div>
        <div class="d-sqlres"><table><thead><tr>${r.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${shown.map(row => `<tr>${row.map(v => `<td class="${typeof v === 'number' ? 'n' : ''}">${fmtCell(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } catch (e) {
      last = null;
      out.innerHTML = String(e && e.message) === 'sqljs'
        ? `<p class="d-sqlerr">${T('تعذّر تحميل محرك SQL. تحقق من الاتصال بالإنترنت.', 'Could not load the SQL engine. Check your connection.')}</p>`
        : `<p class="d-sqlerr"><b>${T('خطأ في الاستعلام:', 'Query error:')}</b> <span dir="ltr">${esc(e && e.message || e)}</span></p>`;
    }
  }
  md.querySelector('.d-sqlrun').addEventListener('click', run);
  ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
  out.addEventListener('click', e => {
    if (!e.target.closest('.d-sqlcsv') || !last) return;
    const csv = '﻿' + [last.columns.map(csvCell).join(',')].concat(last.values.map(r => r.map(csvCell).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'query-result.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  ta.focus();
  if (sql) run();
}
