// Demo data (clearly fictional): branch sales vs targets, Jan–Sep 2026.
import { computeTotals } from './engine.js';

const branches = [['الرياض', 1.35], ['جدة', 1.15], ['الدمام', 0.95], ['مكة', 0.8], ['المدينة', 0.65]];
const depts = [['أغذية', 1], ['مشروبات', 0.55], ['خدمات', 0.35]];

function build(monthsCount) {
  const rows = [];
  for (let mi = 0; mi < monthsCount; mi++) for (let bi = 0; bi < branches.length; bi++) for (let di = 0; di < depts.length; di++) {
    const [b, bw] = branches[bi], [d, dw] = depts[di];
    const wave = 1 + 0.05 * mi + 0.07 * Math.sin(mi * 1.2 + bi + di);
    const sales = Math.round(9000 * bw * dw * wave);
    const orders = Math.round(sales / (62 + 6 * Math.cos(bi + mi)));
    const newc = Math.round(orders * (0.18 + 0.03 * Math.sin(mi + di)));
    rows.push([`2026-${String(mi + 1).padStart(2, '0')}-01`, b, d, sales, orders, newc]);
  }
  return {
    columns: [{ name: 'الشهر', type: 'date' }, { name: 'الفرع', type: 'category' }, { name: 'القسم', type: 'category' },
      { name: 'المبيعات (ر.س)', type: 'number' }, { name: 'عدد الطلبات', type: 'number' }, { name: 'العملاء الجدد', type: 'number' }],
    rows
  };
}

const data = build(9);
const targets = {
  columns: [{ name: 'الفرع', type: 'category' }, { name: 'المستهدف (ر.س)', type: 'number' }],
  rows: branches.map(([b, bw], i) => [b, Math.round(9000 * bw * 1.9 * 9 * 1.22 * (i === 0 ? 0.95 : i === 3 ? 1.12 : 1) / 100) * 100])
};

export const SAMPLE = {
  project: {
    title: 'أداء المبيعات مقابل المستهدف 2026',
    topic: 'شركة تجريبية · قسم المبيعات',
    description: 'بيانات وهمية للعرض: المبيعات الشهرية لكل فرع وقسم، ومقارنتها بالمستهدف السنوي.',
    period: 'يناير – سبتمبر 2026',
    template: 'tiles',
    brand: { primary: '#1F3B63', secondary: '#C9972E', accent: '#2FA38A', font: 'IBM Plex Sans Arabic', logo_url: '' },
    config: { target: { aKey: 'الفرع', aVal: 'المبيعات (ر.س)', tKey: 'الفرع', tVal: 'المستهدف (ر.س)' } }
  },
  version: { period: 'سبتمبر 2026', file_name: 'sales_sep.xlsx', data, targets, totals: computeTotals(data), created_at: '2026-10-03T09:00:00Z' },
  previous: { period: 'أغسطس 2026', totals: computeTotals(build(8)), created_at: '2026-09-02T09:00:00Z' }
};
