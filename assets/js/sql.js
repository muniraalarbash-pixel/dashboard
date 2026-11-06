// Builds the SQL (PostgreSQL) that reproduces a chart's numbers, for analysts to check or reuse.
import { T } from './engine.js';

const q = n => '"' + String(n).replace(/"/g, '""') + '"';
const lit = v => "'" + String(v).replace(/'/g, "''") + "'";

export function buildSQL(m, spec, filters, tcfg) {
  const name = i => m.cols[i].name;
  const metric = spec.metric;
  const alias = q(metric < 0 ? T('عدد السجلات', 'record_count') : name(metric));
  const agg = (p = '') => metric < 0 ? 'COUNT(*)' : m.isMean(metric) ? `ROUND(AVG(${p}${q(name(metric))}), 2)` : `SUM(${p}${q(name(metric))})`;
  const where = (p = '') => {
    const w = Object.entries(filters || {}).filter(([ci, v]) => v != null && +ci !== spec.exclude && m.cols[+ci] && !m.cols[+ci].virtual).map(([ci, v]) => `${p}${q(name(+ci))} = ${lit(v)}`);
    return w.length ? '\nWHERE ' + w.join('\n  AND ') : '';
  };
  const headC = `-- PostgreSQL · ${T('الجدول', 'table')}: data`;

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
SELECT DATE_TRUNC('${m.monthly ? 'month' : 'day'}', ${q(dc.name)})::date AS ${per},
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
  return '';
}
