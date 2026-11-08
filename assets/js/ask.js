// "Ask the data": ready-made questions built from the file's own columns, answered instantly from the
// filtered rows (no AI). Each answer comes with the SQL that reproduces it.
import { T, fmt, fmtPct, pLabel } from './engine.js';

const pctOf = (v, tot) => tot ? v / tot * 100 : null;
const sgn = p => p == null ? '—' : (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(1) + '%';

// env: { m, c, F (forecast or null), sqlFor(spec) }
export function askQuestions({ m, c, F, sqlFor }) {
  const rows = c.rows, mi = c.metric, ml = c.ml, mean = c.mean;
  const dim = c.dim >= 0 ? c.dim : (m.dims || []).find(d => d !== m.monthCol);
  const out = [];
  if (!rows.length) return out;
  const dn = dim != null && dim >= 0 ? m.cols[dim].name : null;
  const b = dn ? m.breakdown(rows, dim, mi).filter(x => x.k !== '') : [];
  const tot = b.reduce((s, x) => s + x.v, 0), max = b.length ? Math.max(...b.map(x => Math.abs(x.v))) : 1;
  const item = (x, extra) => ({ k: x.k, v: x.v, w: max ? Math.abs(x.v) / max : 0, sub: extra != null ? extra : (!mean && tot ? fmtPct(pctOf(x.v, tot), 0) : '') });

  if (b.length >= 2) {
    out.push({ id: 'top', q: T(`مين الأعلى في ${ml} حسب ${dn}؟`, `Who is highest in ${ml} by ${dn}?`), a: () => {
      const t = b.slice(0, 3), f = t[0], s = t[1];
      return { head: T(`<b>${f.k}</b> الأعلى بـ <b>${fmt(f.v)}</b>${!mean && tot ? `، أي ${fmtPct(pctOf(f.v, tot), 0)} من الإجمالي` : ''}، ويتقدّم على <b>${s.k}</b> بفارق ${fmt(f.v - s.v)}.`, `<b>${f.k}</b> is highest with <b>${fmt(f.v)}</b>${!mean && tot ? ` (${fmtPct(pctOf(f.v, tot), 0)} of total)` : ''}, ahead of <b>${s.k}</b> by ${fmt(f.v - s.v)}.`),
        items: t.map(x => item(x)), sql: sqlFor({ kind: 'breakdown', dim, metric: mi, limit: 3 }) };
    } });
    const bz = b.filter(x => x.v !== 0), zeros = b.length - bz.length;
    if (bz.length >= 2) out.push({ id: 'bottom', q: T(`مين الأقل في ${ml} حسب ${dn}؟`, `Who is lowest in ${ml} by ${dn}?`), a: () => {
      const t = bz.slice(-3).reverse(), l = t[0];
      return { head: T(`<b>${l.k}</b> الأقل بـ <b>${fmt(l.v)}</b>${!mean && tot ? `، أي ${fmtPct(pctOf(l.v, tot), 0)} فقط من الإجمالي` : ''}. هذا أقل من الأعلى (${b[0].k}) بـ ${fmt(b[0].v - l.v)}.${zeros ? ` (${zeros} بدون أي قيمة: ${b.filter(x => x.v === 0).map(x => x.k).join('، ')})` : ''}`, `<b>${l.k}</b> is lowest with <b>${fmt(l.v)}</b>${!mean && tot ? ` (only ${fmtPct(pctOf(l.v, tot), 0)} of total)` : ''}, ${fmt(b[0].v - l.v)} below the top (${b[0].k}).`),
        items: t.map(x => item(x)), sql: sqlFor({ kind: 'breakdown', dim, metric: mi, limit: 3 }).replace(/DESC(\s*\nLIMIT)/, 'ASC$1') };
    } });
  }
  if (!mean && b.length > 3 && tot > 0) {
    out.push({ id: 'share3', q: T('كم نسبة أعلى 3 من الإجمالي؟', 'What share do the top 3 hold?'), a: () => {
      const t3 = b.slice(0, 3).reduce((s, x) => s + x.v, 0), p = pctOf(t3, tot);
      const verdict = p >= 75 ? T('تركّز عالي: الأداء معتمد على عدد قليل.', 'High concentration: results depend on a few.') : p >= 50 ? T('تركّز متوسط.', 'Moderate concentration.') : T('التوزيع متوازن نسبيًا.', 'Fairly balanced spread.');
      return { head: T(`أعلى 3 (${b.slice(0, 3).map(x => x.k).join('، ')}) يمثلون <b>${fmtPct(p, 0)}</b> من ${ml}، والباقي (${b.length - 3}) يمثلون ${fmtPct(100 - p, 0)}. ${verdict}`, `The top 3 (${b.slice(0, 3).map(x => x.k).join(', ')}) hold <b>${fmtPct(p, 0)}</b> of ${ml}; the other ${b.length - 3} hold ${fmtPct(100 - p, 0)}. ${verdict}`),
        items: [{ k: T('أعلى 3', 'Top 3'), v: t3, w: p / 100, sub: fmtPct(p, 0) }, { k: T('الباقي', 'The rest'), v: tot - t3, w: 1 - p / 100, sub: fmtPct(100 - p, 0) }], sql: sqlFor({ kind: 'share', dim, metric: mi }) };
    } });
  }
  const s = m.date >= 0 ? m.series(rows, mi) : [];
  const unit = m.monthly ? T('شهر', 'month') : T('يوم', 'day');
  if (s.length >= 2 && (s[s.length - 1].v || s[s.length - 2].v)) {
    const last = s[s.length - 1], prev = s[s.length - 2];
    out.push({ id: 'change', q: T(`وش تغيّر في ${pLabel(last.k)} عن ${pLabel(prev.k)}؟`, `What changed in ${pLabel(last.k)} vs ${pLabel(prev.k)}?`), a: () => {
      const ch = prev.v ? (last.v - prev.v) / Math.abs(prev.v) * 100 : null;
      let items = [], movers = '';
      if (dn) {
        const key = r => r[m.date] ? String(r[m.date]).slice(0, m.monthly ? 7 : 10) : null;
        const bl = new Map(m.breakdown(rows.filter(r => key(r) === last.k), dim, mi).map(x => [x.k, x.v]));
        const bp = new Map(m.breakdown(rows.filter(r => key(r) === prev.k), dim, mi).map(x => [x.k, x.v]));
        const d = [...new Set([...bl.keys(), ...bp.keys()])].map(k => ({ k, v: (bl.get(k) || 0) - (bp.get(k) || 0), p: bp.get(k) ? ((bl.get(k) || 0) - bp.get(k)) / Math.abs(bp.get(k)) * 100 : null })).sort((a, b) => b.v - a.v);
        const mx = Math.max(1, ...d.map(x => Math.abs(x.v)));
        items = d.slice(0, 5).map(x => ({ k: x.k, v: x.v, signed: true, w: Math.abs(x.v) / mx, sub: sgn(x.p), cls: x.v >= 0 ? 'up' : 'down' }));
        if (d.length > 1) movers = T(` أكبر ارتفاع: <b>${d[0].k}</b> (${sgn(d[0].p)})، وأكبر انخفاض: <b>${d[d.length - 1].k}</b> (${sgn(d[d.length - 1].p)}).`, ` Biggest rise: <b>${d[0].k}</b> (${sgn(d[0].p)}); biggest drop: <b>${d[d.length - 1].k}</b> (${sgn(d[d.length - 1].p)}).`);
      }
      return { head: T(`${ml}: ${ch == null ? 'تغيّر' : ch >= 0 ? 'ارتفاع' : 'انخفاض'} من ${fmt(prev.v)} إلى <b>${fmt(last.v)}</b> (${sgn(ch)}).${movers}`, `${ml} ${ch == null ? 'changed' : ch >= 0 ? 'rose' : 'fell'} from ${fmt(prev.v)} to <b>${fmt(last.v)}</b> (${sgn(ch)}).${movers}`),
        items, itemsTitle: dn ? T(`التغير حسب ${dn}`, `Change by ${dn}`) : '', sql: sqlFor({ kind: 'trend', metric: mi, last: 2 }) };
    } });
  }
  if (s.length >= 3) {
    out.push({ id: 'bestworst', q: T(`وش أفضل وأسوأ ${unit}؟`, `Best and worst ${unit}?`), a: () => {
      const srt = s.slice().sort((a, b) => b.v - a.v), hi = srt[0], lo = srt[srt.length - 1], avg = s.reduce((t, x) => t + x.v, 0) / s.length, mx = Math.abs(hi.v) || 1;
      return { head: T(`أفضل ${unit}: <b>${pLabel(hi.k)}</b> بـ ${fmt(hi.v)}، وأسوأ ${unit}: <b>${pLabel(lo.k)}</b> بـ ${fmt(lo.v)}. المتوسط ${fmt(avg)}.`, `Best ${unit}: <b>${pLabel(hi.k)}</b> at ${fmt(hi.v)}; worst: <b>${pLabel(lo.k)}</b> at ${fmt(lo.v)}. Average ${fmt(avg)}.`),
        items: [hi, ...srt.slice(1, 3), lo].filter((x, i, a) => a.indexOf(x) === i).map(x => ({ k: pLabel(x.k), v: x.v, w: Math.abs(x.v) / mx, sub: avg ? sgn((x.v - avg) / Math.abs(avg) * 100) + T(' عن المتوسط', ' vs avg') : '', cls: x === lo ? 'down' : x === hi ? 'up' : '' })),
        sql: sqlFor({ kind: 'trend', metric: mi }).replace(/ORDER BY 1;/, 'ORDER BY 2 DESC;') };
    } });
  }
  const ts = c.tstats;
  if (ts && ts.items.some(x => x.target)) {
    out.push({ id: 'target', q: T('مين ما حقق المستهدف؟', 'Who missed the target?'), a: () => {
      const miss = ts.items.filter(x => x.target && x.pct < 100).sort((a, b) => a.pct - b.pct), hit = ts.items.filter(x => x.target && x.pct >= 100);
      const gap = miss.reduce((t, x) => t + (x.target - x.actual), 0);
      return { head: miss.length
          ? T(`<b>${miss.length}</b> من ${miss.length + hit.length} ما حققوا المستهدف. الأبعد: <b>${miss[0].k}</b> (${fmtPct(miss[0].pct, 0)}). مجموع الفجوة ${fmt(gap)}.`, `<b>${miss.length}</b> of ${miss.length + hit.length} missed target. Furthest: <b>${miss[0].k}</b> (${fmtPct(miss[0].pct, 0)}). Total gap ${fmt(gap)}.`)
          : T('الكل حقق المستهدف أو تجاوزه 👏', 'Everyone met or beat the target 👏'),
        items: miss.concat(hit.sort((a, b) => a.pct - b.pct)).map(x => ({ k: x.k, v: x.actual, w: Math.min(1, x.pct / 100), sub: fmtPct(x.pct, 0) + T(` من ${fmt(x.target)}`, ` of ${fmt(x.target)}`), cls: x.pct >= 100 ? 'up' : 'down' })),
        itemsTitle: T('الفعلي ونسبة الإنجاز', 'Actual and achievement'), sql: sqlFor({ kind: 'targets', metric: mi }).replace('ORDER BY 4 DESC;', 'ORDER BY 4 ASC;') };
    } });
  }
  if (b.length >= 3) {
    out.push({ id: 'avg', q: T(`مين فوق المتوسط ومين تحته؟`, 'Who is above or below average?'), a: () => {
      const avg = b.reduce((t, x) => t + x.v, 0) / b.length, up = b.filter(x => x.v >= avg);
      return { head: T(`متوسط ${ml} حسب «${dn}»: <b>${fmt(avg)}</b>. فوق المتوسط: ${up.length}، وتحته: ${b.length - up.length}.`, `Average ${ml} per ${dn}: <b>${fmt(avg)}</b>. Above: ${up.length}, below: ${b.length - up.length}.`),
        items: b.slice(0, 10).map(x => ({ ...item(x, sgn(avg ? (x.v - avg) / Math.abs(avg) * 100 : null)), cls: x.v >= avg ? 'up' : 'down' })), avgLine: max ? Math.abs(avg) / max : null, sql: sqlFor({ kind: 'breakdown', dim, metric: mi }) };
    } });
  }
  const d2 = c.sd >= 0 && c.sd !== dim ? c.sd : (m.dims || []).find(d => d !== dim && d !== m.monthCol);
  if (dn && d2 != null && d2 >= 0) {
    const dn2 = m.cols[d2].name;
    out.push({ id: 'cross', q: T(`في كل «${dn}»، مين الأعلى في «${dn2}»؟`, `Top ${dn2} in each ${dn}?`), a: () => {
      const items = b.slice(0, 8).map(x => { const sub = m.breakdown(rows.filter(r => String(r[dim]) === x.k), d2, mi).filter(y => y.k !== ''); const t = sub[0]; const st = sub.reduce((q, y) => q + y.v, 0); return t ? { k: x.k, v: t.v, w: x.v ? Math.abs(t.v) / Math.abs(x.v) : 0, sub: `${t.k}${!mean && st ? ' · ' + fmtPct(pctOf(t.v, st), 0) : ''}` } : null; }).filter(Boolean);
      const lead = new Map(); items.forEach(i => { const k = i.sub.split(' · ')[0]; lead.set(k, (lead.get(k) || 0) + 1); });
      const [lk, ln] = [...lead.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      return { head: T(`<b>${lk}</b> الأعلى في ${ln} من أصل ${items.length} حسب «${dn}».`, `<b>${lk}</b> leads in ${ln} of ${items.length} (${dn}).`), items, itemsTitle: T(`الأعلى في «${dn2}» داخل كل «${dn}» (الشريط = حصته)`, `Top ${dn2} within each ${dn} (bar = its share)`), sql: sqlFor({ kind: 'breakdown', dim, sd: d2, metric: mi }) };
    } });
  }
  if (F && !F.unreliable) {
    out.push({ id: 'forecast', q: T('وش المتوقع للأشهر الجاية؟', 'What is expected next?'), a: () => {
      const last = s[s.length - 1], mx = Math.max(Math.abs(last.v), ...F.band.map(x => Math.abs(x[1]))) || 1;
      const ch = last.v ? (F.pts[0] - last.v) / Math.abs(last.v) * 100 : null;
      return { head: T(`المتوقع في <b>${pLabel(F.keys[0])}</b>: <b>${fmt(F.pts[0])}</b> (${sgn(ch)} عن ${pLabel(last.k)})، والمدى المتوقع بين ${fmt(F.band[0][0])} و${fmt(F.band[0][1])}.`, `Expected in <b>${pLabel(F.keys[0])}</b>: <b>${fmt(F.pts[0])}</b> (${sgn(ch)} vs ${pLabel(last.k)}), likely between ${fmt(F.band[0][0])} and ${fmt(F.band[0][1])}.`),
        items: F.keys.map((k, i) => ({ k: pLabel(k), v: F.pts[i], w: Math.abs(F.pts[i]) / mx, sub: `${fmt(F.band[i][0])} – ${fmt(F.band[i][1])}` })),
        note: T(`الطريقة: ${F.best.name}${F.accuracy != null ? ` · الدقة ~${F.accuracy.toFixed(0)}%` : ''}. التوقع مبني على الأرقام السابقة فقط.`, `Method: ${F.best.name}${F.accuracy != null ? ` · accuracy ~${F.accuracy.toFixed(0)}%` : ''}. Based on past numbers only.`), sql: sqlFor({ kind: 'trend', metric: mi }) };
    } });
  }
  return out;
}
