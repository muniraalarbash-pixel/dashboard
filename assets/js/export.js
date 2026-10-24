import { T } from './engine.js';
// Export the rendered dashboard: PNG image (html-to-image) or PDF (browser print → "Save as PDF").
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

export async function exportPNG(el, title) {
  await loadH2I();
  const bg = getComputedStyle(el).backgroundColor || '#ffffff';
  const url = await window.htmlToImage.toPng(el, {
    pixelRatio: 2, backgroundColor: bg, cacheBust: true,
    filter: n => !(n.classList && (n.classList.contains('d-tablecard') || n.classList.contains('d-bar') || n.classList.contains('no-export')))
  });
  const a = document.createElement('a'); a.href = url; a.download = safeName(title) + '.png';
  document.body.appendChild(a); a.click(); a.remove();
}
export function exportPDF(title) {
  const old = document.title; document.title = safeName(title);
  window.print();
  setTimeout(() => { document.title = old; }, 500);
}
// Wire any [data-export] buttons; getTarget() returns {el, title}
export function wireExport(getTarget, onStatus = () => {}) {
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-export]'); if (!b) return;
    const t = getTarget(); if (!t || !t.el) return;
    if (b.dataset.export === 'pdf') { exportPDF(t.title); return; }
    b.disabled = true; onStatus(T('جاري تجهيز الصورة…', 'Preparing image…'));
    try { await exportPNG(t.el, t.title); onStatus(T('تم حفظ الصورة.', 'Image saved.')); }
    catch (err) { onStatus(T('تعذّر حفظ الصورة. جرّب «تحميل PDF».', 'Could not save the image. Try “Download PDF”.')); }
    finally { b.disabled = false; }
  });
}
