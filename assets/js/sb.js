// Supabase client + shared page helpers
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !/YOUR-/.test(SUPABASE_URL + SUPABASE_ANON_KEY);
export const sb = configured && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
export const $ = (s, r = document) => r.querySelector(s);

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
export function mountNav(user) {
  const nav = $('#nav'); if (!nav) return;
  if (!user) { nav.innerHTML = `<a class="btn btn-quiet btn-sm" href="index.html#login">تسجيل الدخول</a>`; return; }
  nav.innerHTML = `<span class="who">${user.email.replace(/[<>&"]/g, '')}</span><a class="btn btn-quiet btn-sm" href="app.html">مشاريعي</a><button class="btn btn-ghost btn-sm" type="button" id="signout">خروج</button>`;
  $('#signout').addEventListener('click', async () => { await sb.auth.signOut(); location.href = 'index.html'; });
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
