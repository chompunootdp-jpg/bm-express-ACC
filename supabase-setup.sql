-- ========================================
-- BM Express — Supabase Database Setup
-- ========================================

-- 1. Table: master_data (ข้อมูลตั้งต้นบรรจุภัณฑ์)
CREATE TABLE master_data (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  cost NUMERIC(10, 2) DEFAULT 0,
  price NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Table: parcels (รายการพัสดุ)
CREATE TABLE parcels (
  id BIGINT PRIMARY KEY,
  date TEXT NOT NULL,
  tracking TEXT NOT NULL,
  packaging_id TEXT NOT NULL,
  box_cost NUMERIC(10, 2) DEFAULT 0,
  sell_price NUMERIC(10, 2) DEFAULT 0,
  transport NUMERIC(10, 2) DEFAULT 0,
  service NUMERIC(10, 2) DEFAULT 0,
  label_cost NUMERIC(10, 2) DEFAULT 0,
  total_revenue NUMERIC(10, 2) DEFAULT 0,
  profit NUMERIC(10, 2) DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Table: cashflow (สรุปเงินสด รับ-จ่าย)
CREATE TABLE cashflow (
  id BIGINT PRIMARY KEY,
  date TEXT NOT NULL,
  item TEXT NOT NULL,
  income NUMERIC(10, 2) DEFAULT 0,
  expense_goods NUMERIC(10, 2) DEFAULT 0,
  expense_other NUMERIC(10, 2) DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- Enable Row-Level Security (RLS)
-- ========================================

ALTER TABLE master_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow ENABLE ROW LEVEL SECURITY;

-- Allow public read/write (simple policy — suitable for personal app)
CREATE POLICY "Enable read access for all users" ON master_data
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON master_data
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON master_data
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON master_data
  FOR DELETE USING (true);

-- Repeat for parcels
CREATE POLICY "Enable read access for all users" ON parcels
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON parcels
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON parcels
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON parcels
  FOR DELETE USING (true);

-- Repeat for cashflow
CREATE POLICY "Enable read access for all users" ON cashflow
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON cashflow
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON cashflow
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON cashflow
  FOR DELETE USING (true);

-- ========================================
-- Insert initial data (seed data)
-- ========================================

-- Master Data (บรรจุภัณฑ์ 12 รายการ)
INSERT INTO master_data (id, name, cost, price) VALUES
(1, 'กล่องเบอร์ AB', 4.15, 15),
(2, 'กล่องเบอร์ B', 6.13, 15),
(3, 'กล่องเบอร์ 2B', 7.92, 17),
(4, 'กล่องเบอร์ D', 7.14, 20),
(5, 'กล่องเบอร์ 0', 0, 10),
(6, 'กล่องเบอร์ AA', 0, 10),
(7, 'กล่องเบอร์ E', 7.7, 25),
(8, 'กล่องเบอร์ G', 7.7, 25),
(9, 'ซองเอกสารสีน้ำตาล A4', 2.61, 8),
(10, 'ซองเสื้อผ้า', 1.42, 5),
(11, 'ซองกันกระแทก', 3.15, 8),
(12, 'ลูกค้าแพ็คสินค้ามาเอง', 0, 0);
