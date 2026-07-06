/* ===== BM Express — ระบบจัดการเงินและคำนวณกำไร ===== */
'use strict';

const STORAGE_KEY = 'bmexpress_v1';

/* ---------- State ---------- */

// ข้อมูลตั้งต้นเมื่อเปิดครั้งแรก: ใช้ seed-data.js (ข้อมูลเก่าจาก Excel ทั้งหมด) ถ้ามี
const SEED = (typeof window !== 'undefined' && window.BM_SEED) ? window.BM_SEED : null;

const DEFAULT_MASTER = SEED ? SEED.masterData : [
  { id: 1, name: 'กล่องเบอร์ AB', cost: 4.15, price: 15 },
  { id: 2, name: 'กล่องเบอร์ B', cost: 6.13, price: 15 },
  { id: 3, name: 'กล่องเบอร์ 2B', cost: 7.92, price: 17 },
  { id: 4, name: 'กล่องเบอร์ D', cost: 7.14, price: 20 },
  { id: 5, name: 'ซองกันกระแทก', cost: 3.15, price: 8 },
];

const state = {
  page: 'dashboard',
  selectedMonths: [],
  masterData: DEFAULT_MASTER,
  parcels: SEED ? SEED.parcels : [],
  cashflow: SEED ? SEED.cashflow : [],
  editingMasterId: null,
  editingParcelId: null,
  editingCashId: null,
};

async function load() {
  try {
    // ตรวจสอบว่า Supabase functions ถูก load แล้ว
    if (typeof loadAllDataFromDB === 'undefined') {
      throw new Error('Supabase functions not yet loaded');
    }
    const result = await loadAllDataFromDB();
    if (result.masterData && Array.isArray(result.masterData) && result.masterData.length > 0) {
      state.masterData = result.masterData;
    } else if (SEED && SEED.masterData) {
      state.masterData = SEED.masterData;
    }
    if (result.parcels && Array.isArray(result.parcels)) {
      state.parcels = result.parcels;
    } else if (SEED && SEED.parcels) {
      state.parcels = SEED.parcels;
    }
    if (result.cashflow && Array.isArray(result.cashflow)) {
      state.cashflow = result.cashflow;
    } else if (SEED && SEED.cashflow) {
      state.cashflow = SEED.cashflow;
    }
  } catch (e) {
    console.error('Error loading data from Supabase:', e);
    /* Supabase fail — fallback ไป seed-data.js */
    if (SEED) {
      if (SEED.masterData) state.masterData = SEED.masterData;
      if (SEED.parcels) state.parcels = SEED.parcels;
      if (SEED.cashflow) state.cashflow = SEED.cashflow;
      console.info('Loaded fallback data from seed-data.js');
    }
  }
}

function save() {
  // Save logic moved to individual functions (insertParcelToDB, updateParcelInDB, etc.)
  // This function is kept as a stub for backward compatibility
}

// หมายเหตุ: initSupabase() อยู่ใน supabase-client.js (สร้าง client จริง)
// ห้ามประกาศซ้ำในไฟล์นี้ — เคยประกาศซ้ำแล้วทับตัวจริง ทำให้ client ไม่ถูกสร้างเลย

// เครื่องที่เคยใช้แอปมาก่อนวันที่เพิ่มรายการปรับยอด จะมีข้อมูลเก่าอยู่ใน localStorage
// ซึ่งมาก่อน seed-data.js เสมอ — ฟังก์ชันนี้เติมรายการปรับยอดให้อัตโนมัติถ้ายังไม่มี โดยไม่กระทบข้อมูลจริงอื่นๆ
const RECONCILIATION_MARKER = 'ปรับยอดให้ตรงกับเงินสดที่นับได้จริง';
async function ensureReconciliationEntry() {
  const exists = state.cashflow.some(function (c) { return c.item === RECONCILIATION_MARKER; });
  if (exists) return;
  const record = {
    id: Date.now(),
    date: '2026-07-05',
    item: RECONCILIATION_MARKER,
    income: 0,
    expenseGoods: 0,
    expenseOther: 7001.07,
    note: 'ปรับยอดสุทธิให้ตรงกับเงินสดที่นับได้จริง 28,243.75 บาท ส่วนต่าง 7,001.07 บาท คาดว่าเป็นเงินที่ใช้จ่ายไปแล้วแต่ไม่ได้บันทึกไว้ในสมุดเดิม',
  };
  try {
    if (typeof insertCashflowToDB !== 'undefined') {
      const success = await insertCashflowToDB(record);
      if (success) {
        state.cashflow.push(record);
      }
    } else {
      // Supabase not ready — add locally only
      state.cashflow.push(record);
      console.info('Reconciliation entry added locally (Supabase not ready)');
    }
  } catch (e) {
    console.error('Error adding reconciliation entry:', e);
    // Add locally if Supabase fails
    state.cashflow.push(record);
  }
}

/* ---------- เชื่อมรายได้พัสดุ → สรุปเงินสดอัตโนมัติ ---------- */

// รายการที่ระบบสร้างเองจะขึ้นต้นด้วยข้อความนี้ — ใช้เป็นตัวระบุเพื่ออัปเดต/ลบภายหลัง
const AUTO_INCOME_PREFIX = 'รายได้จากพัสดุวันที่ ';
const AUTO_INCOME_NOTE = 'สร้างอัตโนมัติจากหน้ารับพัสดุ — ยอดจะอัปเดตเองเมื่อบันทึก/แก้ไข/ลบพัสดุของวันนั้น';

// รวมยอดรายได้พัสดุทั้งหมดของวันนั้น แล้วสร้าง/อัปเดต/ลบรายการรายได้ในสรุปเงินสดให้ตรงกันเสมอ
async function syncDailyIncome(dateStr) {
  if (!dateStr) return;
  const total = state.parcels.reduce(function (s, p) {
    return p.date === dateStr ? s + (p.totalRevenue || 0) : s;
  }, 0);
  const autoEntry = state.cashflow.find(function (c) {
    return c.date === dateStr && String(c.item).indexOf(AUTO_INCOME_PREFIX) === 0;
  });
  // วันเก่าที่เคยกรอกรายได้ประจำวันด้วยมือไว้แล้ว (จากสมุด Excel เดิม) — ไม่สร้างซ้ำ กันยอดนับเบิ้ล
  const hasManualEntry = state.cashflow.some(function (c) {
    return c.date === dateStr && String(c.item).indexOf('รายได้วันที่') === 0;
  });
  try {
    if (autoEntry) {
      if (total > 0) {
        const updated = Object.assign({}, autoEntry, { income: total });
        const ok = await updateCashflowInDB(updated);
        if (ok) {
          state.cashflow = state.cashflow.map(function (c) { return c.id === autoEntry.id ? updated : c; });
        }
      } else {
        const ok = await deleteCashflowFromDB(autoEntry.id);
        if (ok) {
          state.cashflow = state.cashflow.filter(function (c) { return c.id !== autoEntry.id; });
        }
      }
    } else if (total > 0 && !hasManualEntry) {
      const record = {
        id: Date.now() + 1, // +1 กันชนกับ id พัสดุที่เพิ่งสร้างในมิลลิวินาทีเดียวกัน
        date: dateStr,
        item: AUTO_INCOME_PREFIX + fmtDate(dateStr),
        income: total,
        expenseGoods: 0,
        expenseOther: 0,
        note: AUTO_INCOME_NOTE,
      };
      const ok = await insertCashflowToDB(record);
      if (ok) state.cashflow.unshift(record);
    }
  } catch (e) {
    console.error('Error syncing daily income:', e);
  }
}

// ร้านเปิดใหม่วันที่ 1 ก.ค. 2569 — ยอดก่อนหน้านั้นเป็นสมุดเก่าที่ปรับยอดปิดไว้แล้ว ห้าม backfill ทับ
const SHOP_REOPEN_DATE = '2026-07-01';

// ตรวจทุกวันที่มีพัสดุ (ตั้งแต่วันเปิดร้านใหม่) ให้มีรายการรายได้ในสรุปเงินสดตรงกันเสมอ
// กันกรณีพัสดุถูกกรอกจากแท็บเก่าที่ยังไม่มีระบบ sync — จะถูกเติมให้เองเมื่อมีคนเปิดแอปครั้งถัดไป
async function backfillDailyIncome() {
  const dates = {};
  state.parcels.forEach(function (p) {
    if (p.date && p.date >= SHOP_REOPEN_DATE) dates[p.date] = true;
  });
  const list = Object.keys(dates);
  for (let i = 0; i < list.length; i++) {
    await syncDailyIncome(list[i]);
  }
}

/* ---------- Helpers ---------- */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmt(n) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d)) return s;
  const y = d.getFullYear() + 543;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return day + '/' + m + '/' + y;
}

function monthKey(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return (d.getFullYear() + 543) + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function monthLabel(key) {
  if (!key) return 'ทั้งหมด';
  const parts = key.split('-');
  const names = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return names[parseInt(parts[1], 10)] + ' ' + parts[0];
}

function getMonths() {
  const keys = new Set();
  state.parcels.concat(state.cashflow).forEach(function (r) {
    const k = monthKey(r.date);
    if (k) keys.add(k);
  });
  return Array.from(keys).sort().reverse();
}

function getStats(months) {
  const fil = function (r) { return !months || months.length === 0 || months.indexOf(monthKey(r.date)) !== -1; };
  const parcels = state.parcels.filter(fil);
  const cashflow = state.cashflow.filter(fil);
  return {
    parcelCount: parcels.length,
    totalRevenue: parcels.reduce(function (s, r) { return s + (r.totalRevenue || 0); }, 0),
    totalProfit: parcels.reduce(function (s, r) { return s + (r.profit || 0); }, 0),
    netCash: cashflow.reduce(function (s, r) { return s + (r.income || 0) - (r.expenseGoods || 0) - (r.expenseOther || 0); }, 0),
  };
}

function getMonthlyTrend() {
  const monthly = {};
  state.parcels.forEach(function (p) {
    const k = monthKey(p.date);
    if (!k) return;
    if (!monthly[k]) monthly[k] = { revenue: 0, profit: 0 };
    monthly[k].revenue += p.totalRevenue || 0;
    monthly[k].profit += p.profit || 0;
  });
  return Object.keys(monthly).sort().map(function (k) {
    return { key: k, revenue: monthly[k].revenue, profit: monthly[k].profit };
  });
}

function renderTrendChart() {
  const data = getMonthlyTrend();
  if (data.length === 0) return '<div class="chart-empty">ยังไม่มีข้อมูลเพียงพอสำหรับกราฟเทรนด์</div>';

  const barW = 22, gap = 8, groupGap = 30, chartH = 150, leftPad = 16;
  const groupW = barW * 2 + gap;
  const maxVal = Math.max(1, data.reduce(function (m, d) { return Math.max(m, d.revenue, Math.abs(d.profit)); }, 0));
  const svgW = leftPad * 2 + data.length * (groupW + groupGap);
  const svgH = chartH + 46;

  const bars = data.map(function (d, i) {
    const gx = leftPad + i * (groupW + groupGap);
    const revH = Math.round((d.revenue / maxVal) * chartH);
    const profH = Math.round((Math.abs(d.profit) / maxVal) * chartH);
    const profColor = d.profit >= 0 ? '#2e7d32' : '#c62828';
    return (
      '<rect x="' + gx + '" y="' + (chartH - revH) + '" width="' + barW + '" height="' + revH + '" rx="3" fill="#e91e8c" opacity="0.85"></rect>' +
      '<text x="' + (gx + barW / 2) + '" y="' + (chartH - revH - 6) + '" font-size="10" fill="#c2185b" text-anchor="middle">' + Math.round(d.revenue) + '</text>' +
      '<rect x="' + (gx + barW + gap) + '" y="' + (chartH - profH) + '" width="' + barW + '" height="' + profH + '" rx="3" fill="' + profColor + '" opacity="0.85"></rect>' +
      '<text x="' + (gx + barW + gap + barW / 2) + '" y="' + (chartH - profH - 6) + '" font-size="10" fill="' + profColor + '" text-anchor="middle">' + Math.round(d.profit) + '</text>' +
      '<text x="' + (gx + groupW / 2) + '" y="' + (chartH + 20) + '" font-size="11" fill="#888" text-anchor="middle">' + esc(monthLabel(d.key)) + '</text>'
    );
  }).join('');

  return '<svg width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + ' ' + svgH + '">' +
    bars +
    '<line x1="0" y1="' + chartH + '" x2="' + svgW + '" y2="' + chartH + '" stroke="#fce4ec" stroke-width="1"></line>' +
    '</svg>';
}

function pkgName(packagingId) {
  const pkg = state.masterData.find(function (m) { return String(m.id) === String(packagingId); });
  return pkg ? pkg.name : '-';
}

function todayISO() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

/* ---------- Rendering ---------- */

const PAGE_TITLES = {
  dashboard: 'ภาพรวม',
  master: 'ข้อมูลตั้งต้น (Master Data)',
  parcels: 'รับพัสดุ / คำนวณกำไร',
  cashflow: 'สรุปเงินสดรับ-จ่าย',
};
const PAGE_SUBTITLES = {
  dashboard: 'สรุปยอดรายเดือนของ BM Express',
  master: 'กำหนดรายการบรรจุภัณฑ์และต้นทุน',
  parcels: 'อ้างอิง: กำไรบริษัท BM Express.xls',
  cashflow: 'อ้างอิง: income-expenses.xls',
};

function render() {
  // Nav active state
  document.querySelectorAll('.bm-nav').forEach(function (el) {
    el.classList.toggle('active', el.dataset.page === state.page);
  });

  // Top bar
  document.getElementById('pageTitle').textContent = PAGE_TITLES[state.page] || '';
  document.getElementById('pageSubtitle').textContent = PAGE_SUBTITLES[state.page] || '';
  document.getElementById('btnAddParcel').classList.toggle('hidden', state.page !== 'parcels');
  document.getElementById('btnAddCash').classList.toggle('hidden', state.page !== 'cashflow');
  document.getElementById('btnAddMaster').classList.toggle('hidden', state.page !== 'master');

  // Page content
  const content = document.getElementById('content');
  if (state.page === 'dashboard') content.innerHTML = renderDashboard();
  else if (state.page === 'master') content.innerHTML = renderMaster();
  else if (state.page === 'parcels') content.innerHTML = renderParcels();
  else if (state.page === 'cashflow') content.innerHTML = renderCashflow();
}

function renderDashboard() {
  const months = getMonths();
  const allActive = state.selectedMonths.length === 0 ? ' active' : '';
  const pillsHtml = '<button class="bm-month' + allActive + '" data-month="">ทั้งหมด</button>' +
    months.map(function (m) {
      const active = state.selectedMonths.indexOf(m) !== -1 ? ' active' : '';
      return '<button class="bm-month' + active + '" data-month="' + esc(m) + '">' + esc(monthLabel(m)) + '</button>';
    }).join('');

  const stats = getStats(state.selectedMonths);
  const cards = [
    { label: 'พัสดุทั้งหมด', value: stats.parcelCount + ' รายการ', color: '#e91e8c' },
    { label: 'รายได้รวม', value: '฿ ' + fmt(stats.totalRevenue), color: '#e91e8c' },
    { label: 'กำไรสุทธิ', value: '฿ ' + fmt(stats.totalProfit), color: stats.totalProfit >= 0 ? '#2e7d32' : '#c62828' },
    { label: 'เงินสดสุทธิ', value: '฿ ' + fmt(stats.netCash), color: stats.netCash >= 0 ? '#2e7d32' : '#c62828' },
  ];
  const cardsHtml = cards.map(function (c) {
    return '<div class="stat-card">' +
      '<div class="stat-label">' + esc(c.label) + '</div>' +
      '<div class="stat-value" style="color:' + c.color + ';">' + esc(c.value) + '</div>' +
      '<div class="stat-accent" style="background:' + c.color + ';"></div>' +
      '</div>';
  }).join('');

  const recent = state.parcels.slice(0, 6);
  const rowsHtml = recent.length === 0
    ? '<tr class="empty-row"><td colspan="5">ยังไม่มีรายการพัสดุ — กดเมนู "รับพัสดุ / กำไร" เพื่อเริ่มบันทึก</td></tr>'
    : recent.map(function (p) {
        const profitColor = (p.profit || 0) >= 0 ? 'pos' : 'neg';
        return '<tr class="bm-row">' +
          '<td class="t-date">' + esc(fmtDate(p.date)) + '</td>' +
          '<td class="t-mono">' + esc(p.tracking) + '</td>' +
          '<td class="t-pkg">' + esc(pkgName(p.packagingId)) + '</td>' +
          '<td class="t-right t-revenue">฿' + fmt(p.totalRevenue) + '</td>' +
          '<td class="t-right t-profit ' + profitColor + '">฿' + fmt(p.profit) + '</td>' +
          '</tr>';
      }).join('');

  return '<div class="page-anim">' +
    '<div class="month-filter"><span class="month-filter-label">กรอง (เลือกได้หลายเดือน):</span>' + pillsHtml + '</div>' +
    '<div class="stat-grid">' + cardsHtml + '</div>' +
    '<div class="table-card">' +
      '<div class="table-card-header">' +
        '<div class="table-card-title">เทรนด์รายได้และกำไรรายเดือน</div>' +
      '</div>' +
      '<div class="chart-legend">' +
        '<span class="legend-item"><span class="legend-dot" style="background:#e91e8c;"></span>รายได้รวม</span>' +
        '<span class="legend-item"><span class="legend-dot" style="background:#2e7d32;"></span>กำไร (บวก)</span>' +
        '<span class="legend-item"><span class="legend-dot" style="background:#c62828;"></span>กำไร (ลบ)</span>' +
      '</div>' +
      '<div class="chart-scroll">' + renderTrendChart() + '</div>' +
    '</div>' +
    '<div class="table-card">' +
      '<div class="table-card-header">' +
        '<div class="table-card-title">รายการพัสดุล่าสุด</div>' +
        '<div class="table-card-link" data-goto="parcels">ดูทั้งหมด →</div>' +
      '</div>' +
      '<div class="table-scroll"><table class="bm-table thead-light pad-18"><thead><tr>' +
        '<th>วันที่</th><th>Tracking</th><th>บรรจุภัณฑ์</th>' +
        '<th class="t-right">รายได้รวม</th><th class="t-right">กำไรสุทธิ</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
    '</div>' +
    '</div>';
}

function renderMaster() {
  const rowsHtml = state.masterData.length === 0
    ? '<tr class="empty-row"><td colspan="6">ยังไม่มีรายการ — กดปุ่ม "+ เพิ่มรายการ" มุมขวาบน</td></tr>'
    : state.masterData.map(function (m, i) {
        return '<tr class="bm-row">' +
          '<td class="t-idx">' + String(i + 1).padStart(2, '0') + '</td>' +
          '<td class="t-name">' + esc(m.name) + '</td>' +
          '<td class="t-right t-muted-13">' + fmt(m.cost) + '</td>' +
          '<td class="t-right t-muted-13">' + fmt(m.price) + '</td>' +
          '<td class="t-right t-margin">' + fmt((m.price || 0) - (m.cost || 0)) + '</td>' +
          '<td class="t-center"><div class="row-actions">' +
            '<button class="bm-icon-btn btn-edit" data-action="edit-master" data-id="' + m.id + '">แก้ไข</button>' +
            '<button class="bm-icon-btn btn-del" data-action="del-master" data-id="' + m.id + '">ลบ</button>' +
          '</div></td>' +
          '</tr>';
      }).join('');

  return '<div class="page-anim"><div class="table-card"><div class="table-scroll">' +
    '<table class="bm-table pad-20"><thead><tr>' +
      '<th style="width:40px;">#</th><th>ชื่อรายการ</th>' +
      '<th class="t-right">ต้นทุน (฿)</th><th class="t-right">ราคาขาย (฿)</th>' +
      '<th class="t-right">กำไร/ชิ้น</th><th class="t-center">จัดการ</th>' +
    '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '</div></div></div>';
}

function renderParcels() {
  const rowsHtml = state.parcels.length === 0
    ? '<tr class="empty-row"><td colspan="9">ยังไม่มีรายการพัสดุ — กดปุ่ม "+ บันทึกพัสดุ" มุมขวาบน</td></tr>'
    : state.parcels.map(function (p) {
        const opCost = (p.transport || 0) + (p.service || 0) + (p.labelCost || 0);
        const profitColor = (p.profit || 0) >= 0 ? 'pos' : 'neg';
        return '<tr class="bm-row">' +
          '<td class="t-date">' + esc(fmtDate(p.date)) + '</td>' +
          '<td class="t-mono">' + esc(p.tracking) + '</td>' +
          '<td class="t-pkg">' + esc(pkgName(p.packagingId)) + '</td>' +
          '<td class="t-right t-muted">฿' + fmt(p.boxCost) + '</td>' +
          '<td class="t-right t-muted">฿' + fmt(opCost) + '</td>' +
          '<td class="t-right t-revenue">฿' + fmt(p.totalRevenue) + '</td>' +
          '<td class="t-right t-profit ' + profitColor + '">฿' + fmt(p.profit) + '</td>' +
          '<td class="t-note">' + esc(p.note) + '</td>' +
          '<td class="t-center"><div class="row-actions">' +
            '<button class="bm-icon-btn btn-edit-sm" data-action="edit-parcel" data-id="' + p.id + '">แก้ไข</button>' +
            '<button class="bm-icon-btn btn-del-sm" data-action="del-parcel" data-id="' + p.id + '">ลบ</button>' +
          '</div></td>' +
          '</tr>';
      }).join('');

  return '<div class="page-anim"><div class="table-card"><div class="table-scroll">' +
    '<table class="bm-table"><thead><tr>' +
      '<th>วันที่</th><th>Tracking</th><th>บรรจุภัณฑ์</th>' +
      '<th class="t-right">ต้นทุนกล่อง</th><th class="t-right">ค่าดำเนินงาน</th>' +
      '<th class="t-right">รายได้รวม</th><th class="t-right">กำไรสุทธิ</th>' +
      '<th>หมายเหตุ</th><th></th>' +
    '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '</div></div></div>';
}

function renderCashflow() {
  const rowsHtml = state.cashflow.length === 0
    ? '<tr class="empty-row"><td colspan="8">ยังไม่มีรายการ — กดปุ่ม "+ บันทึกรายการ" มุมขวาบน</td></tr>'
    : state.cashflow.map(function (c) {
        const net = (c.income || 0) - (c.expenseGoods || 0) - (c.expenseOther || 0);
        const netColor = net >= 0 ? 'pos' : 'neg';
        return '<tr class="bm-row">' +
          '<td class="t-date">' + esc(fmtDate(c.date)) + '</td>' +
          '<td class="t-item">' + esc(c.item) + '</td>' +
          '<td class="t-right t-income">' + fmt(c.income) + '</td>' +
          '<td class="t-right t-expense">' + fmt(c.expenseGoods) + '</td>' +
          '<td class="t-right t-expense">' + fmt(c.expenseOther) + '</td>' +
          '<td class="t-right t-profit ' + netColor + '">' + (net >= 0 ? '+' : '') + fmt(net) + '</td>' +
          '<td class="t-note">' + esc(c.note) + '</td>' +
          '<td class="t-center"><div class="row-actions">' +
            '<button class="bm-icon-btn btn-edit-sm" data-action="edit-cash" data-id="' + c.id + '">แก้ไข</button>' +
            '<button class="bm-icon-btn btn-del-sm" data-action="del-cash" data-id="' + c.id + '">ลบ</button>' +
          '</div></td>' +
          '</tr>';
      }).join('');

  return '<div class="page-anim"><div class="table-card"><div class="table-scroll">' +
    '<table class="bm-table"><thead><tr>' +
      '<th>วันที่</th><th>รายการ</th>' +
      '<th class="t-right">รายรับ (฿)</th><th class="t-right">รายจ่าย-สินค้า</th>' +
      '<th class="t-right">รายจ่าย-อื่นๆ</th><th class="t-right">ยอดสุทธิ</th>' +
      '<th>หมายเหตุ</th><th></th>' +
    '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '</div></div></div>';
}

/* ---------- Modals ---------- */

function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
}

/* --- Parcel modal --- */

function openParcelModal(editId) {
  state.editingParcelId = editId || null;
  const p = editId ? state.parcels.find(function (x) { return x.id === editId; }) : null;

  document.getElementById('parcelModalTitle').textContent = p ? 'แก้ไขรายการพัสดุ' : 'บันทึกรายการพัสดุ';
  document.getElementById('pfDate').value = p ? p.date : todayISO();
  document.getElementById('pfTracking').value = p ? p.tracking : '';
  document.getElementById('pfBoxCost').value = p ? p.boxCost : '';
  document.getElementById('pfSellPrice').value = p ? p.sellPrice : '';
  document.getElementById('pfTransport').value = p ? p.transport : '';
  document.getElementById('pfService').value = p ? p.service : '';
  document.getElementById('pfLabelCost').value = p ? p.labelCost : '';
  document.getElementById('pfTotalRevenue').value = p ? p.totalRevenue : '';
  document.getElementById('pfNote').value = p ? p.note : '';

  const sel = document.getElementById('pfPackaging');
  sel.innerHTML = '<option value="">— เลือกบรรจุภัณฑ์ —</option>' +
    state.masterData.map(function (m) {
      return '<option value="' + m.id + '">' + esc(m.name) + '  (ต้นทุน ฿' + m.cost + ' / ขาย ฿' + m.price + ')</option>';
    }).join('');
  sel.value = p ? p.packagingId : '';

  updateLiveProfit();
  showModal('parcelModal');
  document.getElementById('pfTracking').focus();
}

function updateLiveProfit() {
  const num = function (id) { return parseFloat(document.getElementById(id).value) || 0; };
  // ค่าบริการเป็นรายรับ (รวมอยู่ในรายได้แล้ว ไม่มีต้นทุน) จึงไม่หักออก — ตามวิธีคิดในไฟล์ กำไรบริษัท BM Express.xls
  const profit = num('pfTotalRevenue') - (num('pfBoxCost') + num('pfTransport') + num('pfLabelCost'));
  const el = document.getElementById('liveProfit');
  el.textContent = '฿' + fmt(profit);
  el.style.color = profit >= 0 ? '#2e7d32' : '#c62828';
}

async function submitParcel() {
  const val = function (id) { return document.getElementById(id).value; };
  const num = function (id) { return parseFloat(val(id)) || 0; };
  if (!val('pfDate') || !val('pfTracking').trim()) {
    alert('กรุณากรอกวันที่และเลข Tracking');
    return;
  }
  const profit = num('pfTotalRevenue') - (num('pfBoxCost') + num('pfTransport') + num('pfLabelCost'));
  const data = {
    date: val('pfDate'),
    tracking: val('pfTracking').trim(),
    packagingId: val('pfPackaging'),
    boxCost: num('pfBoxCost'),
    sellPrice: num('pfSellPrice'),
    transport: num('pfTransport'),
    service: num('pfService'),
    labelCost: num('pfLabelCost'),
    totalRevenue: num('pfTotalRevenue'),
    profit: profit,
    note: val('pfNote'),
  };
  if (state.editingParcelId) {
    const id = state.editingParcelId;
    const record = Object.assign({ id: id }, data);
    // เก็บวันที่เดิมไว้ก่อน — ถ้าแก้วันที่ ต้อง sync ยอดรายได้ทั้งวันเก่าและวันใหม่
    const prev = state.parcels.find(function (p) { return p.id === id; });
    try {
      if (typeof updateParcelInDB !== 'undefined') {
        const success = await updateParcelInDB(record);
        if (!success) {
          alert('ไม่สามารถบันทึกข้อมูลได้');
          return;
        }
      }
      state.parcels = state.parcels.map(function (p) { return p.id === id ? record : p; });
      await syncDailyIncome(record.date);
      if (prev && prev.date !== record.date) await syncDailyIncome(prev.date);
    } catch (e) {
      console.error('Error updating parcel:', e);
      alert('ไม่สามารถบันทึกข้อมูลได้');
      return;
    }
  } else {
    const record = Object.assign({ id: Date.now() }, data);
    try {
      if (typeof insertParcelToDB !== 'undefined') {
        const success = await insertParcelToDB(record);
        if (!success) {
          alert('ไม่สามารถบันทึกข้อมูลได้');
          return;
        }
      }
      state.parcels.unshift(record);
      await syncDailyIncome(record.date);
    } catch (e) {
      console.error('Error inserting parcel:', e);
      alert('ไม่สามารถบันทึกข้อมูลได้');
      return;
    }
  }
  state.editingParcelId = null;
  hideModal('parcelModal');
  render();
}

/* --- Cash modal: one date, many items --- */

let cashRowSeq = 0;

function cashRowTemplate(rowId, data) {
  data = data || {};
  return '<div class="cash-row" data-row-id="' + rowId + '">' +
    '<div class="cash-row-header"><span class="cash-row-num">รายการ</span>' +
    '<button type="button" class="cash-row-remove hidden" data-remove-row="' + rowId + '">×</button></div>' +
    '<div class="grid-2">' +
      '<div><label class="field-sublabel">รายการ <span class="req">*</span></label>' +
      '<input type="text" class="field-input cf-item" placeholder="เช่น รายได้จากพัสดุ" value="' + esc(data.item || '') + '"></div>' +
      '<div><label class="field-sublabel label-green">รายรับ (฿)</label>' +
      '<input type="number" class="field-input field-green cf-income" placeholder="0" value="' + (data.income || '') + '"></div>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div><label class="field-sublabel label-red">รายจ่าย-สินค้า (฿)</label>' +
      '<input type="number" class="field-input field-red cf-goods" placeholder="0" value="' + (data.expenseGoods || '') + '"></div>' +
      '<div><label class="field-sublabel label-red">รายจ่าย-อื่นๆ (฿)</label>' +
      '<input type="number" class="field-input field-red cf-other" placeholder="0" value="' + (data.expenseOther || '') + '"></div>' +
    '</div>' +
    '<div><label class="field-sublabel">หมายเหตุ</label>' +
    '<input type="text" class="field-input cf-note" placeholder="หมายเหตุ..." value="' + esc(data.note || '') + '"></div>' +
  '</div>';
}

function updateCashRowRemoveVisibility() {
  const rows = document.querySelectorAll('#cfRows .cash-row');
  const canRemove = rows.length > 1 && !state.editingCashId;
  rows.forEach(function (r) { r.querySelector('.cash-row-remove').classList.toggle('hidden', !canRemove); });
}

function addCashRowUI(data) {
  cashRowSeq++;
  const wrap = document.createElement('div');
  wrap.innerHTML = cashRowTemplate(cashRowSeq, data);
  document.getElementById('cfRows').appendChild(wrap.firstElementChild);
  updateCashRowRemoveVisibility();
}

function openCashModal(editId) {
  state.editingCashId = editId || null;
  const c = editId ? state.cashflow.find(function (x) { return x.id === editId; }) : null;

  document.getElementById('cashModalTitle').textContent = c ? 'แก้ไขรายการ' : 'บันทึกเงินสดรับ-จ่าย';
  document.getElementById('cashModalSubtitle').textContent = c ? 'แก้ไขรายการนี้' : 'เลือกวันที่ครั้งเดียว แล้วเพิ่มได้หลายรายการ';
  document.getElementById('cfDate').value = c ? c.date : todayISO();
  document.getElementById('cfRows').innerHTML = '';
  cashRowSeq = 0;
  addCashRowUI(c ? { item: c.item, income: c.income, expenseGoods: c.expenseGoods, expenseOther: c.expenseOther, note: c.note } : null);
  document.getElementById('btnAddCashRow').classList.toggle('hidden', !!c);
  showModal('cashModal');
}

async function submitCash() {
  const date = document.getElementById('cfDate').value;
  if (!date) {
    alert('กรุณาเลือกวันที่');
    return;
  }
  const rowEls = document.querySelectorAll('#cfRows .cash-row');
  const records = [];
  for (let i = 0; i < rowEls.length; i++) {
    const el = rowEls[i];
    const item = el.querySelector('.cf-item').value.trim();
    const income = parseFloat(el.querySelector('.cf-income').value) || 0;
    const goods = parseFloat(el.querySelector('.cf-goods').value) || 0;
    const other = parseFloat(el.querySelector('.cf-other').value) || 0;
    const note = el.querySelector('.cf-note').value.trim();
    if (!item && income === 0 && goods === 0 && other === 0) continue;
    if (!item) {
      alert('กรุณากรอกชื่อรายการให้ครบทุกแถว');
      return;
    }
    records.push({ item: item, income: income, expenseGoods: goods, expenseOther: other, note: note });
  }
  if (records.length === 0) {
    alert('กรุณากรอกอย่างน้อย 1 รายการ');
    return;
  }

  try {
    if (state.editingCashId) {
      const id = state.editingCashId;
      const rec = records[0];
      const record = Object.assign({ id: id, date: date }, rec);
      if (typeof updateCashflowInDB !== 'undefined') {
        const success = await updateCashflowInDB(record);
        if (!success) {
          alert('ไม่สามารถบันทึกข้อมูลได้');
          return;
        }
      }
      state.cashflow = state.cashflow.map(function (c) { return c.id === id ? record : c; });
    } else {
      const base = Date.now();
      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const record = Object.assign({ id: base + i, date: date }, rec);
        if (typeof insertCashflowToDB !== 'undefined') {
          const success = await insertCashflowToDB(record);
          if (!success) {
            alert('ไม่สามารถบันทึกข้อมูลได้');
            return;
          }
        }
        state.cashflow.unshift(record);
      }
    }
  } catch (e) {
    console.error('Error in submitCash:', e);
    alert('ไม่สามารถบันทึกข้อมูลได้');
    return;
  }
  state.editingCashId = null;
  hideModal('cashModal');
  render();
}

/* --- Master modal --- */

function openMasterModal(editId) {
  state.editingMasterId = editId || null;
  const item = editId ? state.masterData.find(function (m) { return m.id === editId; }) : null;
  document.getElementById('masterFormTitle').textContent = item ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่';
  document.getElementById('mfName').value = item ? item.name : '';
  document.getElementById('mfCost').value = item ? String(item.cost) : '';
  document.getElementById('mfPrice').value = item ? String(item.price) : '';
  showModal('masterModal');
  document.getElementById('mfName').focus();
}

async function submitMaster() {
  const name = document.getElementById('mfName').value.trim();
  const cost = parseFloat(document.getElementById('mfCost').value) || 0;
  const price = parseFloat(document.getElementById('mfPrice').value) || 0;
  if (!name) {
    alert('กรุณากรอกชื่อรายการ');
    return;
  }
  try {
    if (state.editingMasterId) {
      const record = { id: state.editingMasterId, name: name, cost: cost, price: price };
      if (typeof updateMasterDataInDB !== 'undefined') {
        const success = await updateMasterDataInDB(record);
        if (!success) {
          alert('ไม่สามารถบันทึกข้อมูลได้');
          return;
        }
      }
      state.masterData = state.masterData.map(function (m) {
        return m.id === state.editingMasterId ? record : m;
      });
    } else {
      const record = { id: Date.now(), name: name, cost: cost, price: price };
      if (typeof insertMasterDataToDB !== 'undefined') {
        const success = await insertMasterDataToDB(record);
        if (!success) {
          alert('ไม่สามารถบันทึกข้อมูลได้');
          return;
        }
      }
      state.masterData.push(record);
    }
  } catch (e) {
    console.error('Error in submitMaster:', e);
    alert('ไม่สามารถบันทึกข้อมูลได้');
    return;
  }
  state.editingMasterId = null;
  hideModal('masterModal');
  render();
}

/* ---------- Export Excel (3 sheets) ---------- */

function exportExcel() {
  if (!window.XLSX) {
    alert('ไม่สามารถโหลด XLSX library ได้ — กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วรีเฟรชหน้า');
    return;
  }
  const wb = XLSX.utils.book_new();

  const s1 = [['รายการ', 'ต้นทุน (บาท)', 'ราคาที่ขาย (บาท)', 'กำไร/ชิ้น (บาท)']]
    .concat(state.masterData.map(function (m) {
      return [m.name, m.cost, m.price, (m.price || 0) - (m.cost || 0)];
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1), 'รายการและต้นทุน');

  const s2 = [['วันที่', 'เลข Tracking', 'บรรจุภัณฑ์', 'ราคาต้นทุนกล่อง', 'ราคาขาย', 'ต้นทุนขนส่ง', 'ค่าบริการ', 'ต้นทุนใบปะหน้า', 'รายได้รวม', 'กำไรสุทธิ', 'หมายเหตุ']]
    .concat(state.parcels.map(function (r) {
      return [r.date, r.tracking, pkgName(r.packagingId), r.boxCost, r.sellPrice, r.transport, r.service, r.labelCost, r.totalRevenue, r.profit, r.note];
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), 'กำไรบริษัท BM Express');

  const s3 = [['วันที่', 'รายการ', 'รายรับ (บาท)', 'รายจ่ายหมวดซื้อสินค้า', 'รายจ่ายหมวดอื่นๆ', 'หมายเหตุ']]
    .concat(state.cashflow.map(function (r) {
      return [r.date, r.item, r.income, r.expenseGoods, r.expenseOther, r.note];
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3), 'Income-Expenses');

  XLSX.writeFile(wb, 'BM_Express_Export.xlsx');
}

/* ---------- Events ---------- */

function setPage(page) {
  state.page = page;
  render();
}

document.querySelectorAll('.bm-nav').forEach(function (el) {
  el.addEventListener('click', function () { setPage(el.dataset.page); });
});

document.getElementById('btnExport').addEventListener('click', exportExcel);
document.getElementById('btnReset').addEventListener('click', function () {
  // ข้อมูลอยู่บน Supabase — โหลดหน้าใหม่เพื่อดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์
  location.reload();
});
document.getElementById('btnAddParcel').addEventListener('click', function () { openParcelModal(null); });
document.getElementById('btnAddCash').addEventListener('click', function () { openCashModal(null); });
document.getElementById('btnAddMaster').addEventListener('click', function () { openMasterModal(null); });

document.getElementById('btnSubmitParcel').addEventListener('click', submitParcel);
document.getElementById('btnSubmitCash').addEventListener('click', submitCash);
document.getElementById('btnSubmitMaster').addEventListener('click', submitMaster);

document.getElementById('btnAddCashRow').addEventListener('click', function () { addCashRowUI(null); });
document.getElementById('cfRows').addEventListener('click', function (e) {
  const btn = e.target.closest('.cash-row-remove');
  if (!btn) return;
  const rows = document.querySelectorAll('#cfRows .cash-row');
  if (rows.length <= 1) return;
  btn.closest('.cash-row').remove();
  updateCashRowRemoveVisibility();
});

// ปุ่มปิด/ยกเลิกใน modal
document.querySelectorAll('[data-close]').forEach(function (el) {
  el.addEventListener('click', function () { hideModal(el.dataset.close); });
});

// Esc ปิด modal ที่เปิดอยู่
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    ['parcelModal', 'cashModal', 'masterModal'].forEach(hideModal);
  }
});

// Smart auto-fill: เลือกบรรจุภัณฑ์ → ดึงต้นทุน/ราคาขาย
document.getElementById('pfPackaging').addEventListener('change', function () {
  const sel = document.getElementById('pfPackaging');
  const found = state.masterData.find(function (m) { return String(m.id) === sel.value; });
  if (found) {
    document.getElementById('pfBoxCost').value = String(found.cost);
    document.getElementById('pfSellPrice').value = String(found.price);
  }
  updateLiveProfit();
});

// Live profit — คำนวณใหม่ทุกครั้งที่แก้ตัวเลข
['pfBoxCost', 'pfTransport', 'pfService', 'pfLabelCost', 'pfTotalRevenue'].forEach(function (id) {
  document.getElementById(id).addEventListener('input', updateLiveProfit);
});

// Event delegation สำหรับปุ่มในตาราง + month filter
document.getElementById('content').addEventListener('click', function (e) {
  const monthBtn = e.target.closest('[data-month]');
  if (monthBtn) {
    const val = monthBtn.dataset.month;
    if (val === '') {
      state.selectedMonths = [];
    } else {
      const idx = state.selectedMonths.indexOf(val);
      if (idx === -1) state.selectedMonths.push(val); else state.selectedMonths.splice(idx, 1);
    }
    render();
    return;
  }
  const gotoEl = e.target.closest('[data-goto]');
  if (gotoEl) {
    setPage(gotoEl.dataset.goto);
    return;
  }
  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;
  const id = parseInt(actionBtn.dataset.id, 10);
  const action = actionBtn.dataset.action;

  if (action === 'edit-master') {
    openMasterModal(id);
  } else if (action === 'del-master') {
    if (confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) {
      (async function() {
        try {
          if (typeof deleteMasterDataFromDB !== 'undefined') {
            const success = await deleteMasterDataFromDB(id);
            if (!success) {
              alert('ไม่สามารถลบข้อมูลได้');
              return;
            }
          }
          state.masterData = state.masterData.filter(function (m) { return m.id !== id; });
          render();
        } catch (e) {
          console.error('Error deleting master data:', e);
          alert('ไม่สามารถลบข้อมูลได้');
        }
      })();
    }
  } else if (action === 'edit-parcel') {
    openParcelModal(id);
  } else if (action === 'del-parcel') {
    if (confirm('ต้องการลบรายการพัสดุนี้ใช่หรือไม่?')) {
      (async function() {
        try {
          if (typeof deleteParcelFromDB !== 'undefined') {
            const success = await deleteParcelFromDB(id);
            if (!success) {
              alert('ไม่สามารถลบข้อมูลได้');
              return;
            }
          }
          const removed = state.parcels.find(function (p) { return p.id === id; });
          state.parcels = state.parcels.filter(function (p) { return p.id !== id; });
          if (removed) await syncDailyIncome(removed.date);
          render();
        } catch (e) {
          console.error('Error deleting parcel:', e);
          alert('ไม่สามารถลบข้อมูลได้');
        }
      })();
    }
  } else if (action === 'edit-cash') {
    openCashModal(id);
  } else if (action === 'del-cash') {
    if (confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) {
      (async function() {
        try {
          if (typeof deleteCashflowFromDB !== 'undefined') {
            const success = await deleteCashflowFromDB(id);
            if (!success) {
              alert('ไม่สามารถลบข้อมูลได้');
              return;
            }
          }
          state.cashflow = state.cashflow.filter(function (c) { return c.id !== id; });
          render();
        } catch (e) {
          console.error('Error deleting cashflow:', e);
          alert('ไม่สามารถลบข้อมูลได้');
        }
      })();
    }
  }
});

/* ---------- Init ---------- */

// รอให้ scripts โหลดเสร็จสิ้น แล้วรัน app
async function initApp() {
  // รอให้ loadAllDataFromDB ถูกประกาศ (จาก supabase-client.js)
  let attempts = 0;
  while (typeof loadAllDataFromDB === 'undefined' && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }

  if (!initSupabase()) {
    console.warn('Supabase not available, using seed data');
  }
  await load();
  await ensureReconciliationEntry();
  await backfillDailyIncome();
  render();
}

// รัน initApp หลังจาก DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
