// Supabase client + shared page helpers
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !/YOUR-/.test(SUPABASE_URL + SUPABASE_ANON_KEY);
export const sb = configured && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
export const $ = (s, r = document) => r.querySelector(s);

/* ---------- color modes ---------- */
export const MODES = [
  { id: 'light', name: 'فاتح', a: '#FFFFFF', b: '#2F5BEA' },
  { id: 'dark', name: 'داكن', a: '#1D2128', b: '#7FE0C8' },
  { id: 'bordo', name: 'عنابي', a: '#0F3D3A', b: '#6C151E' }
];
export const getMode = () => { const m = document.documentElement.dataset.mode; return MODES.some(x => x.id === m) ? m : 'bordo'; };
export function setMode(id) {
  if (!MODES.some(m => m.id === id)) return;
  document.documentElement.dataset.mode = id;
  try { localStorage.setItem('dash-mode', id); } catch (e) {}
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('.modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === id));
  document.dispatchEvent(new CustomEvent('modechange', { detail: id }));
}
export function modeSwitchHTML() {
  const cur = getMode();
  return `<div class="modes" role="group" aria-label="لون الموقع">${MODES.map(m => `<button type="button" data-mode="${m.id}" aria-pressed="${m.id === cur}" title="${m.name}" aria-label="الوضع ${m.name}" style="background:linear-gradient(135deg,${m.a} 50%,${m.b} 50%)"></button>`).join('')}</div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('.modes button[data-mode]'); if (b) setMode(b.dataset.mode); });

export async function currentUser() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}
export async function requireUser() {
  const u = await currentUser();
  if (!u) { location.href = 'index.html#login'; throw new Error('redirect'); }
  return u;
}
export async function signOut() { await sb.auth.signOut(); location.href = 'index.html'; }
export function mountNav(user) {
  const nav = $('#nav'); if (!nav) return;
  if (!user) { nav.innerHTML = modeSwitchHTML() + `<a class="btn btn-quiet btn-sm" href="index.html#login">تسجيل الدخول</a>`; return; }
  nav.innerHTML = modeSwitchHTML() + `<a class="btn btn-quiet btn-sm" href="app.html">حسابي</a><button class="btn btn-ghost btn-sm" type="button" id="signout">خروج</button>`;
  $('#signout').addEventListener('click', signOut);
}
export function setupNotice(el) {
  if (configured || !el) return false;
  el.hidden = false;
  el.innerHTML = 'الموقع غير مربوط بقاعدة البيانات بعد. أضيفي رابط ومفتاح Supabase في الملف <code>assets/js/config.js</code>. العرض التجريبي يعمل بدونها.';
  return true;
}
export function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
