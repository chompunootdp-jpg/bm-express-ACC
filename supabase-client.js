// ========================================
// Supabase Client Configuration
// ========================================

const SUPABASE_URL = 'https://axyxubjgoyocygicvnml.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8PUO7-wwP-jgJyyHXDRSjA_vzM9-k6f';

// ห้ามตั้งชื่อตัวแปรว่า `supabase` — CDN library ประกาศ global ชื่อนี้ไว้แล้ว
// จะเกิด SyntaxError ซ้ำซ้อนและทั้งไฟล์นี้จะไม่รันเลย
let sbClient = null;

console.log('Loading supabase-client.js...');

function initSupabase() {
  try {
    if (window.supabase && window.supabase.createClient) {
      sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('✓ Supabase initialized');
      return true;
    } else {
      console.warn('✗ window.supabase not found');
      return false;
    }
  } catch (err) {
    console.error('✗ Error initializing Supabase:', err);
    return false;
  }
}

async function loadMasterDataFromDB() {
  if (!sbClient) throw new Error('Supabase not initialized');
  const { data, error } = await sbClient.from('master_data').select('*').order('id', { ascending: true });
  if (error) throw error;
  return (data || []).map(function (r) {
    return { id: r.id, name: r.name, cost: Number(r.cost) || 0, price: Number(r.price) || 0 };
  });
}

async function loadParcelsFromDB() {
  if (!sbClient) throw new Error('Supabase not initialized');
  const { data, error } = await sbClient.from('parcels').select('*').order('date', { ascending: false });
  if (error) throw error;
  // แปลง snake_case (ฐานข้อมูล) → camelCase (ที่แอปใช้)
  return (data || []).map(function (r) {
    return {
      id: r.id, date: r.date, tracking: r.tracking, packagingId: r.packaging_id,
      boxCost: Number(r.box_cost) || 0, sellPrice: Number(r.sell_price) || 0,
      transport: Number(r.transport) || 0, service: Number(r.service) || 0,
      labelCost: Number(r.label_cost) || 0, totalRevenue: Number(r.total_revenue) || 0,
      profit: Number(r.profit) || 0, note: r.note || ''
    };
  });
}

async function loadCashflowFromDB() {
  if (!sbClient) throw new Error('Supabase not initialized');
  const { data, error } = await sbClient.from('cashflow').select('*').order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(function (r) {
    return {
      id: r.id, date: r.date, item: r.item,
      income: Number(r.income) || 0,
      expenseGoods: Number(r.expense_goods) || 0,
      expenseOther: Number(r.expense_other) || 0,
      note: r.note || ''
    };
  });
}

async function loadAllDataFromDB() {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const [masterData, parcels, cashflow] = await Promise.all([
      loadMasterDataFromDB(),
      loadParcelsFromDB(),
      loadCashflowFromDB()
    ]);
    return { masterData, parcels, cashflow };
  } catch (err) {
    console.error('Error loading all data:', err);
    throw err;
  }
}

async function insertParcelToDB(parcel) {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const { error } = await sbClient.from('parcels').insert([{
      id: parcel.id, date: parcel.date, tracking: parcel.tracking, packaging_id: parcel.packagingId,
      box_cost: parcel.boxCost, sell_price: parcel.sellPrice, transport: parcel.transport, service: parcel.service,
      label_cost: parcel.labelCost, total_revenue: parcel.totalRevenue, profit: parcel.profit, note: parcel.note || ''
    }]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error inserting parcel:', err);
    return false;
  }
}

async function updateParcelInDB(parcel) {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const { error } = await sbClient.from('parcels').update({
      date: parcel.date, tracking: parcel.tracking, packaging_id: parcel.packagingId,
      box_cost: parcel.boxCost, sell_price: parcel.sellPrice, transport: parcel.transport, service: parcel.service,
      label_cost: parcel.labelCost, total_revenue: parcel.totalRevenue, profit: parcel.profit, note: parcel.note || ''
    }).eq('id', parcel.id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error updating parcel:', err);
    return false;
  }
}

async function deleteParcelFromDB(id) {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const { error } = await sbClient.from('parcels').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting parcel:', err);
    return false;
  }
}

async function insertCashflowToDB(cashflow) {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const { error } = await sbClient.from('cashflow').insert([{
      id: cashflow.id, date: cashflow.date, item: cashflow.item,
      income: cashflow.income || 0, expense_goods: cashflow.expenseGoods || 0, expense_other: cashflow.expenseOther || 0, note: cashflow.note || ''
    }]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error inserting cashflow:', err);
    return false;
  }
}

async function updateCashflowInDB(cashflow) {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const { error } = await sbClient.from('cashflow').update({
      date: cashflow.date, item: cashflow.item,
      income: cashflow.income || 0, expense_goods: cashflow.expenseGoods || 0, expense_other: cashflow.expenseOther || 0, note: cashflow.note || ''
    }).eq('id', cashflow.id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error updating cashflow:', err);
    return false;
  }
}

async function deleteCashflowFromDB(id) {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const { error } = await sbClient.from('cashflow').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting cashflow:', err);
    return false;
  }
}

async function insertMasterDataToDB(masterItem) {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const { error } = await sbClient.from('master_data').insert([{
      id: masterItem.id, name: masterItem.name, cost: masterItem.cost || 0, price: masterItem.price || 0
    }]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error inserting master data:', err);
    return false;
  }
}

async function updateMasterDataInDB(masterItem) {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const { error } = await sbClient.from('master_data').update({
      name: masterItem.name, cost: masterItem.cost || 0, price: masterItem.price || 0
    }).eq('id', masterItem.id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error updating master data:', err);
    return false;
  }
}

async function deleteMasterDataFromDB(id) {
  if (!sbClient) throw new Error('Supabase not initialized');
  try {
    const { error } = await sbClient.from('master_data').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting master data:', err);
    return false;
  }
}

console.log('✓ supabase-client.js loaded');
