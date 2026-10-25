// Location support: recognise Saudi cities/regions and GCC cities in a category column, and draw a bubble map (Leaflet, lazy-loaded).

// [lat, lng, ...names]  (Arabic + English spellings; region names map to their capital)
const PLACES = [
  [24.7136, 46.6753, 'الرياض', 'منطقة الرياض', 'Riyadh', 'Riyadh Region', 'Ar Riyadh'],
  [21.4858, 39.1925, 'جدة', 'جده', 'Jeddah', 'Jiddah', 'Jedda'],
  [21.3891, 39.8579, 'مكة', 'مكة المكرمة', 'منطقة مكة المكرمة', 'Makkah', 'Mecca', 'Makkah Region', 'Makkah Al Mukarramah'],
  [24.5247, 39.5692, 'المدينة', 'المدينة المنورة', 'منطقة المدينة المنورة', 'Madinah', 'Medina', 'Al Madinah', 'Madinah Region'],
  [26.4207, 50.0888, 'الدمام', 'Dammam', 'Ad Dammam', 'الشرقية', 'المنطقة الشرقية', 'Eastern Province', 'Eastern Region', 'Eastern'],
  [26.2172, 50.1971, 'الخبر', 'Khobar', 'Al Khobar'],
  [26.2361, 50.0393, 'الظهران', 'Dhahran'],
  [26.5196, 50.0115, 'القطيف', 'Qatif', 'Al Qatif'],
  [27.0046, 49.6460, 'الجبيل', 'Jubail', 'Al Jubail'],
  [25.3800, 49.5880, 'الأحساء', 'الاحساء', 'الهفوف', 'Al Ahsa', 'Al-Ahsa', 'Hofuf', 'Al Hofuf', 'Al Hasa'],
  [28.4328, 45.9708, 'حفر الباطن', 'Hafar Al Batin', 'Hafr Al Batin'],
  [28.4390, 48.4910, 'الخفجي', 'Khafji', 'Al Khafji'],
  [26.6440, 50.1590, 'رأس تنورة', 'Ras Tanura'],
  [25.9350, 49.6680, 'بقيق', 'أبقيق', 'Abqaiq', 'Buqayq'],
  [21.2703, 40.4158, 'الطائف', 'Taif', 'At Taif'],
  [22.7986, 39.0349, 'رابغ', 'Rabigh'],
  [19.1264, 41.0789, 'القنفذة', 'Qunfudhah', 'Al Qunfudhah'],
  [18.2164, 42.5053, 'أبها', 'ابها', 'Abha', 'عسير', 'منطقة عسير', 'Asir', 'Aseer'],
  [18.3000, 42.7333, 'خميس مشيط', 'Khamis Mushait', 'Khamis Mushayt'],
  [19.9833, 42.6000, 'بيشة', 'Bisha', 'Bishah'],
  [28.3835, 36.5662, 'تبوك', 'منطقة تبوك', 'Tabuk'],
  [26.2333, 36.4667, 'الوجه', 'Al Wajh'],
  [26.6085, 37.9232, 'العلا', 'AlUla', 'Al Ula'],
  [26.3260, 43.9750, 'بريدة', 'Buraidah', 'Buraydah', 'القصيم', 'منطقة القصيم', 'Qassim', 'Al Qassim'],
  [26.0840, 43.9930, 'عنيزة', 'Unaizah', 'Unayzah'],
  [27.5114, 41.6900, 'حائل', 'منطقة حائل', 'Hail', "Ha'il"],
  [16.8892, 42.5511, 'جازان', 'جيزان', 'منطقة جازان', 'Jazan', 'Jizan'],
  [17.4924, 44.1277, 'نجران', 'منطقة نجران', 'Najran'],
  [17.4667, 47.1167, 'شرورة', 'Sharurah'],
  [20.0129, 41.4677, 'الباحة', 'منطقة الباحة', 'Al Baha', 'Baha'],
  [30.9753, 41.0381, 'عرعر', 'Arar', 'الحدود الشمالية', 'منطقة الحدود الشمالية', 'Northern Borders'],
  [29.9697, 40.2064, 'سكاكا', 'Sakaka', 'الجوف', 'منطقة الجوف', 'Al Jouf', 'Al Jawf'],
  [31.3318, 37.3428, 'القريات', 'Qurayyat', 'Al Qurayyat'],
  [24.0890, 38.0637, 'ينبع', 'Yanbu'],
  [24.1556, 47.3120, 'الخرج', 'Al Kharj', 'Kharj'],
  [24.7344, 46.5753, 'الدرعية', 'Diriyah', 'Ad Diriyah'],
  [25.9039, 45.3456, 'المجمعة', 'Majmaah', 'Al Majmaah'],
  [26.2994, 44.8156, 'الزلفي', 'Zulfi', 'Az Zulfi'],
  [24.5000, 44.3833, 'الدوادمي', 'Dawadmi', 'Ad Dawadmi'],
  [20.4667, 44.7833, 'وادي الدواسر', 'Wadi Al Dawasir', 'Wadi ad-Dawasir'],
  [29.3759, 47.9774, 'الكويت', 'Kuwait', 'Kuwait City'],
  [25.2048, 55.2708, 'دبي', 'Dubai'],
  [24.4539, 54.3773, 'أبوظبي', 'أبو ظبي', 'ابوظبي', 'Abu Dhabi'],
  [25.3463, 55.4209, 'الشارقة', 'Sharjah'],
  [25.2854, 51.5310, 'الدوحة', 'قطر', 'Doha', 'Qatar'],
  [26.2285, 50.5860, 'المنامة', 'البحرين', 'Manama', 'Bahrain'],
  [23.5880, 58.3829, 'مسقط', 'عمان', 'Muscat', 'Oman']
];

export function norm(s) {
  return String(s).trim().toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/^(منطقه|مدينه|محافظه|فرع)\s+/, '').replace(/\s+(region|province|city|branch)$/, '')
    .replace(/^(al|ad|ar|as|at|az)[\s-]+/, '').replace(/^ال(?=..)/, '')
    .replace(/[\s\-_'’.]+/g, '');
}
const INDEX = new Map();
for (const [lat, lng, ...names] of PLACES) for (const n of names) { const k = norm(n); if (!INDEX.has(k)) INDEX.set(k, [lat, lng]); }
export const coordOf = v => INDEX.get(norm(v)) || null;

// pick the category column whose values are mostly known places
export function findGeoCol(m) {
  let best = -1, bestScore = 0;
  for (const ci of m.cats) {
    if (ci === m.monthCol) continue;
    const vals = [...new Set(m.rows.map(r => r[ci]).filter(v => v != null && v !== '').map(String))];
    if (vals.length < 2 || vals.length > 200) continue;
    const hit = vals.filter(v => coordOf(v)).length, score = hit / vals.length;
    if (hit >= 2 && score >= 0.6 && score > bestScore) { best = ci; bestScore = score; }
  }
  return best;
}

let leafletP = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = () => res(window.L); s.onerror = () => { leafletP = null; rej(new Error('leaflet')); };
    document.head.appendChild(s);
  });
  return leafletP;
}
