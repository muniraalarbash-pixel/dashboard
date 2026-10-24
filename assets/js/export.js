import { T } from './engine.js';
// Export the rendered dashboard: PNG image (html-to-image) or PDF (browser print → "Save as PDF").
// The image always opens in a preview window with Download / Share buttons, because some mobile
// browsers ignore automatic downloads; long-pressing the preview also saves it.
const H2I = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
let loading = null;
function loadH2I() {
  if (window.htmlToImage) return Promise.resolve();
  if (!loading) loading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = H2I; s.onload = res; s.onerror = () => { loading = null; rej(new Error('load')); }; document.head.appendChild(s); });
  return loading;
}
const safeName = s => (String(s || 'dashboard').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'dashboard');
const resizeCharts = () => { if (window.Chart && Chart.instances) Object.values(Chart.instances).forEach(c => { try { c.resize(); } catch (e) {} }); };
window.addEventListener('beforeprint', () => { document.documentElement.classList.add('printing'); resizeCharts(); });
window.addEventListener('afterprint', () => { document.documentElement.classList.remove('printing'); setTimeout(resizeCharts, 50); });
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function renderBlob(el) {
  await loadH2I();
  const bg = getComputedStyle(el).backgroundColor || '#ffffff';
  // keep the canvas within mobile limits (~16M px)
  const area = el.offsetWidth * el.offsetHeight;
  const pixelRatio = Math.max(1, Math.min(2, Math.sqrt(12e6 / Math.max(area, 1))));
  const base = { pixelRatio, backgroundColor: bg, cacheBust: true,
    filter: n => !(n.classList && (n.classList.contains('d-tablecard') || n.classList.contains('d-bar') || n.classList.contains('no-export'))) };
  try { return await withTimeout(window.htmlToImage.toBlob(el, base), 15000); }
  catch (e) { return await withTimeout(window.htmlToImage.toBlob(el, { ...base, skipFonts: true }), 15000); } // retry without web fonts
}

function css() {
  if (document.getElementById('x-modal-css')) return;
  const s = document.createElement('style'); s.id = 'x-modal-css';
  s.textContent = `.x-modal{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px}
.x-box{background:#fff;color:#16212B;border-radius:16px;max-width:min(920px,100%);width:100%;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:10px;padding:14px;font-family:inherit}
.x-box p{margin:0;font-size:13.5px;color:#5B6875}
.x-img{overflow:auto;border:1px solid #DDE3E9;border-radius:10px;background:#F4F6F8;min-height:0}
.x-img img{display:block;width:100%;height:auto}
.x-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.x-actions button,.x-actions a{font:inherit;font-size:14px;font-weight:600;border-radius:9px;padding:9px 16px;border:1px solid #DDE3E9;background:#fff;color:#16212B;cursor:pointer;text-decoration:none}
.x-actions .x-pri{background:#6C151E;border-color:#6C151E;color:#F5DABF}`;
  document.head.appendChild(s);
}
function showPreview(blob, name) {
  css();
  const url = URL.createObjectURL(blob);
  const file = new File([blob], name, { type: 'image/png' });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const m = document.createElement('div'); m.className = 'x-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.dir = document.documentElement.dir || 'rtl';
  m.innerHTML = `<div class="x-box"><p>${T('الصورة جاهزة. اضغط «تحميل»، أو اضغط مطولًا على الصورة واختر «حفظ الصورة».', 'Your image is ready. Press “Download”, or long-press the image and choose “Save image”.')}</p>
    <div class="x-img"><img alt="${T('صورة لوحة المؤشرات', 'Dashboard image')}"></div>
    <div class="x-actions">${canShare ? `<button type="button" data-x="share">${T('مشاركة', 'Share')}</button>` : ''}<a class="x-pri" data-x="dl">${T('تحميل', 'Download')}</a><button type="button" data-x="close">${T('إغلاق', 'Close')}</button></div></div>`;
  m.querySelector('img').src = url;
  const dl = m.querySelector('[data-x="dl"]'); dl.href = url; dl.download = name;
  const close = () => { m.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  m.addEventListener('click', async e => {
    if (e.target === m || e.target.closest('[data-x="close"]')) close();
    else if (e.target.closest('[data-x="share"]')) { try { await navigator.share({ files: [file], title: name }); } catch (err) {} }
  });
  document.addEventListener('keydown', esc);
  document.body.appendChild(m);
  m.querySelector('[data-x="dl"]').focus();
}

export async function exportPNG(el, title) {
  const blob = await renderBlob(el);
  if (!blob) throw new Error('empty');
  showPreview(blob, safeName(title) + '.png');
}
export function exportPDF(title) {
  const old = document.title; document.title = safeName(title);
  resizeCharts();
  try { window.print(); } catch (e) {}
  setTimeout(() => { document.title = old; }, 500);
}
// Wire any [data-export] buttons; getTarget() returns {el, title}
export function wireExport(getTarget, onStatus = () => {}) {
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-export]'); if (!b) return;
    const t = getTarget(); if (!t || !t.el) return;
    if (b.dataset.export === 'pdf') { exportPDF(t.title); return; }
    b.disabled = true; onStatus(T('جاري تجهيز الصورة…', 'Preparing image…'));
    try { await exportPNG(t.el, t.title); onStatus(''); }
    catch (err) { onStatus(T('تعذّر تجهيز الصورة. جرّب «تحميل PDF».', 'Could not prepare the image. Try “Download PDF”.')); }
    finally { b.disabled = false; }
  });
}
