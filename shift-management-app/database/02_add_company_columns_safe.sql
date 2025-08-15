-- ==========================================
-- Phase 2: 既存テーブルにcompany_idカラムを安全に追加
-- ==========================================

-- 重要: すべてのカラムはNULL許可で追加
-- 既存データは一切変更しない

-- usersテーブルにcompany_id追加（NULL許可）
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- storesテーブルにcompany_id追加（NULL許可）
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- shiftsテーブルにcompany_id追加（NULL許可）
ALTER TABLE shifts 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- time_slotsテーブルにcompany_id追加（NULL許可）
ALTER TABLE time_slots 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- shift_requestsテーブルにcompany_id追加（NULL許可）
ALTER TABLE shift_requests 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- emergency_requestsテーブルにcompany_id追加（NULL許可）
ALTER TABLE emergency_requests 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- emergency_volunteersテーブルにcompany_id追加（NULL許可）
ALTER TABLE emergency_volunteers 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- user_storesテーブルにcompany_id追加（NULL許可）
ALTER TABLE user_stores 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- shift_patternsテーブルにcompany_id追加（NULL許可）
ALTER TABLE shift_patterns 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- fixed_shiftsテーブルにcompany_id追加（NULL許可）
ALTER TABLE fixed_shifts 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- companiesテーブルが存在することを確認
SELECT 'Company columns added successfully. All existing data preserved.' as status;

-- 既存データの状況確認（変更なし）
SELECT 
  'users' as table_name, 
  COUNT(*) as total_records, 
  COUNT(company_id) as with_company_id
FROM users
UNION ALL
SELECT 
  'stores' as table_name, 
  COUNT(*) as total_records, 
  COUNT(company_id) as with_company_id
FROM stores
UNION ALL
SELECT 
  'shifts' as table_name, 
  COUNT(*) as total_records, 
  COUNT(company_id) as with_company_id
FROM shifts;
