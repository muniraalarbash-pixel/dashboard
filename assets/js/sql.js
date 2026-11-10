// Builds the SQL (SQLite dialect, runnable in the in-browser editor) that reproduces a chart's numbers.
import { T } from './engine.js';

const q = n => '"' + String(n).replace(/"/g, '""') + '"';
const lit = v => "'" + String(v).replace(/'/g, "''") + "'";

export function buildSQL(m, spec, filters, tcfg) {
  const name = i => m.cols[i].name;
  const metric = spec.metric;
  const alias = q(metric < 0 ? T('عدد السجلات', 'record_count') : name(metric));
  const aggOne = (mi, p) => { const c = p + q(name(mi)), md = m.aggOf(mi); return md === 'avg' ? `AVG(${c})` : md === 'max' ? `MAX(${c})` : md === 'min' ? `MIN(${c})` : `SUM(${c})`; };
  const agg = (p = '') => { const ms = metric >= 0 && m.cols[metric].measure;
    if (ms) { const A = aggOne(ms.a, p), B = aggOne(ms.b, p), cm = m.cols[metric];
      if (ms.op === '*') return `SUM(${p + q(name(ms.a))} * ${p + q(name(ms.b))})`;
      return ms.op === '/' ? `ROUND(${A} * ${cm.measure.calc(1, 1) === 100 ? '100.0' : '1.0'} / NULLIF(${B}, 0), 2)` : `(${A} ${ms.op} ${B})`; }
    if (metric < 0) return 'COUNT(*)'; const c = p + q(name(metric)), md = m.aggOf ? m.aggOf(metric) : (m.isMean(metric) ? 'avg' : 'sum'); return md === 'avg' ? `ROUND(AVG(${c}), 2)` : md === 'max' ? `MAX(${c})` : md === 'min' ? `MIN(${c})` : `SUM(${c})`; };
  const where = (p = '') => {
    const w = Object.entries(filters || {}).filter(([ci, v]) => v != null && +ci !== spec.exclude && m.cols[+ci] && !m.cols[+ci].virtual).map(([ci, v]) => Array.isArray(v) ? `${p}${q(name(+ci))} IN (${v.map(lit).join(', ')})` : `${p}${q(name(+ci))} = ${lit(v)}`);
    const rg = filters && filters.__range, dc = m.cols[m.date];
    if (rg && dc && !dc.virtual) { const e = `substr(${p}${q(dc.name)}, 1, ${rg.len})`; if (rg.from && rg.to) w.push(`${e} BETWEEN ${lit(rg.from)} AND ${lit(rg.to)}`); else if (rg.from) w.push(`${e} >= ${lit(rg.from)}`); else if (rg.to) w.push(`${e} <= ${lit(rg.to)}`); }
    return w.length ? '\nWHERE ' + w.join('\n  AND ') : '';
  };
  const headC = `-- SQLite · ${T('الجدول', 'table')}: data`;

  if (spec.kind === 'breakdown') {
    const d = q(name(spec.dim)), sd = spec.sd != null && spec.sd >= 0 ? q(name(spec.sd)) : null;
    const isMonth = spec.dim === m.monthCol;
    return `${headC}
SELECT ${d}${sd ? ', ' + sd : ''},
       ${agg()} AS ${alias}
FROM data${where()}
GROUP BY ${d}${sd ? ', ' + sd : ''}
${isMonth ? `-- ${T('رتّب الأشهر حسب ترتيبها في السنة', 'order months by calendar order')}` : `ORDER BY ${sd ? `${d}, ${alias} DESC` : `${alias} DESC`}`}${spec.limit && !isMonth && !sd ? `\nLIMIT ${spec.limit}` : ''};`;
  }

  if (spec.kind === 'share') {
    const d = q(name(spec.dim));
    return `${headC}
WITH g AS (
  SELECT ${d}, ${agg()} AS v
  FROM data${where().replace(/\n/g, '\n  ')}
  GROUP BY ${d}
)
SELECT ${d},
       v AS ${alias},
       ROUND(100.0 * v / SUM(v) OVER (), 1) AS ${q(T('النسبة %', 'share_pct'))}
FROM g
ORDER BY v DESC
LIMIT 5; -- ${T('الباقي يُجمع في «أخرى»', 'the rest is grouped as "Other"')}`;
  }

  if (spec.kind === 'trend') {
    if (m.date < 0) return '';
    const dc = m.cols[m.date];
    if (dc.virtual) {
      const yi = m.cols.findIndex(c => !c.virtual && /^(السنة|سنة|العام|عام|year)$/i.test(c.name));
      const parts = (yi >= 0 ? [q(name(yi))] : []).concat([q(name(m.monthCol))]);
      return `${headC}
SELECT ${parts.join(', ')},
       ${agg()} AS ${alias}
FROM data${where()}
GROUP BY ${parts.join(', ')}
ORDER BY ${parts.join(', ')}; -- ${T('رتّب الأشهر حسب ترتيبها في السنة', 'order months by calendar order')}`;
    }
    const per = q(T('الفترة', 'period'));
    return `${headC}
SELECT substr(${q(dc.name)}, 1, ${m.monthly ? 7 : 10}) AS ${per},
       ${agg()} AS ${alias}
FROM data${where()}
GROUP BY 1
ORDER BY 1${spec.last ? ` DESC\nLIMIT ${spec.last}` : ''};`;
  }

  if (spec.kind === 'targets' && tcfg && tcfg.aKey) {
    const aK = q(tcfg.aKey), aV = tcfg.aVal ? q(tcfg.aVal) : null, tK = q(tcfg.tKey || tcfg.aKey), tV = q(tcfg.tVal || 'target');
    const act = aV ? `SUM(d.${aV})` : 'COUNT(*)';
    return `${headC} · ${T('ملف المستهدف', 'target file')}: targets
SELECT d.${aK},
       ${act} AS ${q(T('الفعلي', 'actual'))},
       t.${tV} AS ${q(T('المستهدف', 'target'))},
       ROUND(100.0 * ${act} / NULLIF(t.${tV}, 0), 1) AS ${q(T('نسبة الإنجاز %', 'achievement_pct'))}
FROM data d
JOIN targets t ON t.${tK} = d.${aK}${where('d.')}
GROUP BY d.${aK}, t.${tV}
ORDER BY 4 DESC;`;
  }
  if (spec.kind === 'funnel') {
    const st = spec.stages.filter(i => !m.cols[i].virtual); if (st.length < 2) return '';
    const s = i => `SUM(${q(name(i))})`;
    const conv = st.slice(1).map((i, k) => `       ROUND(100.0 * ${s(i)} / NULLIF(${s(st[k])}, 0), 1) AS ${q(name(st[k]) + ' → ' + name(i) + ' %')}`);
    const d = spec.dim != null && spec.dim >= 0 ? q(name(spec.dim)) : null;
    return `${headC}
SELECT ${d ? d + ',\n       ' : ''}${st.map(i => `${s(i)} AS ${q(name(i))}`).join(',\n       ')},
${conv.join(',\n')}
FROM data${where()}${d ? `\nGROUP BY ${d}\nORDER BY 2 DESC` : ''};`;
  }
  return '';
}
