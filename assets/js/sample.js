// Demo data (clearly fictional): branch sales vs targets, Jan–Sep 2026. Arabic or English labels.
import { computeTotals, isEn } from './engine.js';

const en = isEn();
const branches = en
  ? [['Riyadh', 1.35], ['Jeddah', 1.15], ['Dammam', 0.95], ['Makkah', 0.8], ['Madinah', 0.65]]
  : [['الرياض', 1.35], ['جدة', 1.15], ['الدمام', 0.95], ['مكة', 0.8], ['المدينة', 0.65]];
const depts = en ? [['Food', 1], ['Beverages', 0.55], ['Services', 0.35]] : [['أغذية', 1], ['مشروبات', 0.55], ['خدمات', 0.35]];
const C = en
  ? { month: 'Month', branch: 'Branch', dept: 'Department', sales: 'Sales (SAR)', orders: 'Orders', newc: 'New customers', target: 'Target (SAR)' }
  : { month: 'الشهر', branch: 'الفرع', dept: 'القسم', sales: 'المبيعات (ر.س)', orders: 'عدد الطلبات', newc: 'العملاء الجدد', target: 'المستهدف (ر.س)' };

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
    columns: [{ name: C.month, type: 'date' }, { name: C.branch, type: 'category' }, { name: C.dept, type: 'category' },
      { name: C.sales, type: 'number' }, { name: C.orders, type: 'number' }, { name: C.newc, type: 'number' }],
    rows
  };
}

const data = build(9);
const targets = {
  columns: [{ name: C.branch, type: 'category' }, { name: C.target, type: 'number' }],
  rows: branches.map(([b, bw], i) => [b, Math.round(9000 * bw * 1.9 * 9 * 1.22 * (i === 0 ? 0.95 : i === 3 ? 1.12 : 1) / 100) * 100])
};

export const SAMPLE = {
  project: {
    title: en ? 'Sales vs Target 2026' : 'أداء المبيعات مقابل المستهدف 2026',
    topic: en ? 'Demo company · Sales department' : 'شركة تجريبية · قسم المبيعات',
    description: en ? 'Fictional demo data: monthly sales by branch and department, compared with the annual target.' : 'بيانات وهمية للعرض: المبيعات الشهرية لكل فرع وقسم، ومقارنتها بالمستهدف السنوي.',
    period: en ? 'Jan – Sep 2026' : 'يناير – سبتمبر 2026',
    template: 'tiles',
    brand: { primary: '#6C151E', secondary: '#0F3D3A', accent: '#D9B48F', font: 'IBM Plex Sans Arabic', logo_url: '' },
    config: { target: { aKey: C.branch, aVal: C.sales, tKey: C.branch, tVal: C.target } }
  },
  version: { period: en ? 'September 2026' : 'سبتمبر 2026', file_name: 'sales_sep.xlsx', data, targets, totals: computeTotals(data), created_at: '2026-10-03T09:00:00Z' },
  previous: { period: en ? 'August 2026' : 'أغسطس 2026', totals: computeTotals(build(8)), created_at: '2026-09-02T09:00:00Z' }
};
