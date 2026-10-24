// Supabase client + shared page helpers
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { T } from './engine.js';

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
  const N = { light: T('فاتح', 'Light'), dark: T('داكن', 'Dark'), bordo: T('عنابي', 'Bordeaux') };
  return `<div class="modes" role="group" aria-label="${T('لون الموقع', 'Site color')}">${MODES.map(m => `<button type="button" data-mode="${m.id}" aria-pressed="${m.id === cur}" title="${N[m.id] || m.name}" aria-label="${N[m.id] || m.name}" style="background:linear-gradient(135deg,${m.a} 50%,${m.b} 50%)"></button>`).join('')}</div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('.modes button[data-mode]'); if (b) setMode(b.dataset.mode); });

/* ---------- language (public pages only) ---------- */
export const getLang = () => document.documentElement.lang === 'en' ? 'en' : 'ar';
export function setLang(l) {
  try { localStorage.setItem('dash-lang', l); } catch (e) {}
  const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.href;
}
export const langToggleHTML = () => getLang() === 'en'
  ? '<button class="btn btn-ghost btn-sm" type="button" data-lang="ar" lang="ar">العربية</button>'
  : '<button class="btn btn-ghost btn-sm" type="button" data-lang="en" lang="en">English</button>';
document.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
export function applyStatic(root = document) {
  if (getLang() !== 'en') return;
  root.querySelectorAll('[data-en]').forEach(el => { el.textContent = el.dataset.en; });
  root.querySelectorAll('[data-en-html]').forEach(el => { el.innerHTML = el.dataset.enHtml; });
  root.querySelectorAll('[data-en-ph]').forEach(el => { el.placeholder = el.dataset.enPh; });
  root.querySelectorAll('[data-en-aria]').forEach(el => { el.setAttribute('aria-label', el.dataset.enAria); });
  const mt = document.querySelector('meta[name="en-title"]'); if (mt) document.title = mt.content;
}

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
export function mountNav(user, opts = {}) {
  const nav = $('#nav'); if (!nav) return;
  const lang = opts.lang ? langToggleHTML() : '';
  if (!user) { nav.innerHTML = lang + modeSwitchHTML() + `<a class="btn btn-quiet btn-sm" href="index.html#login">${T('تسجيل الدخول', 'Sign in')}</a>`; return; }
  nav.innerHTML = lang + modeSwitchHTML() + `<a class="btn btn-quiet btn-sm" href="app.html">${T('حسابي', 'My account')}</a><button class="btn btn-ghost btn-sm" type="button" id="signout">${T('خروج', 'Sign out')}</button>`;
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
