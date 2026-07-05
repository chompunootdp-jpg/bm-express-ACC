// ========================================
// Supabase Client Configuration
// ========================================

const SUPABASE_URL = 'https://axyxubjgoyocygicvnml.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8PUO7-wwP-jgJyyHXDRSjA_vzM9-k6f';

let supabase = null;

console.log('Loading supabase-client.js...');

function initSupabase() {
  try {
    if (window.supabase && window.supabase.createClient) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { data, error } = await supabase.from('master_data').select('*').order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error loading master data:', err);
    return [];
  }
}

async function loadParcelsFromDB() {
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { data, error } = await supabase.from('parcels').select('*').order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error loading parcels:', err);
    return [];
  }
}

async function loadCashflowFromDB() {
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { data, error } = await supabase.from('cashflow').select('*').order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error loading cashflow:', err);
    return [];
  }
}

async function loadAllDataFromDB() {
  if (!supabase) throw new Error('Supabase not initialized');
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
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { error } = await supabase.from('parcels').insert([{
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
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { error } = await supabase.from('parcels').update({
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
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { error } = await supabase.from('parcels').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting parcel:', err);
    return false;
  }
}

async function insertCashflowToDB(cashflow) {
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { error } = await supabase.from('cashflow').insert([{
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
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { error } = await supabase.from('cashflow').update({
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
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { error } = await supabase.from('cashflow').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting cashflow:', err);
    return false;
  }
}

async function insertMasterDataToDB(masterItem) {
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { error } = await supabase.from('master_data').insert([{
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
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { error } = await supabase.from('master_data').update({
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
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    const { error } = await supabase.from('master_data').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting master data:', err);
    return false;
  }
}

console.log('✓ supabase-client.js loaded');
