-- ==========================================
-- Phase 3: 既存データの安全な移行
-- ==========================================

-- 重要: この処理は既存データを「追加」するのみ
-- 既存の値は一切削除・変更しない

-- legacy-main企業のIDを取得
DO $$
DECLARE
    legacy_company_id UUID;
    affected_users INTEGER;
    affected_stores INTEGER;
    affected_shifts INTEGER;
    affected_time_slots INTEGER;
    affected_shift_requests INTEGER;
    affected_emergency_requests INTEGER;
    affected_emergency_volunteers INTEGER;
    affected_user_stores INTEGER;
    affected_shift_patterns INTEGER;
    affected_fixed_shifts INTEGER;
BEGIN
    -- legacy-main企業のIDを取得
    SELECT id INTO legacy_company_id 
    FROM companies 
    WHERE slug = 'legacy-main' AND is_legacy = TRUE;
    
    IF legacy_company_id IS NULL THEN
        RAISE EXCEPTION 'Legacy company not found. Please run 01_create_companies_table.sql first.';
    END IF;
    
    RAISE NOTICE 'Legacy company ID: %', legacy_company_id;
    
    -- 既存データにcompany_idを設定（NULLのものだけ）
    -- 重要: WHERE company_id IS NULL で既存値を保護
    
    UPDATE users 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_users = ROW_COUNT;
    
    UPDATE stores 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_stores = ROW_COUNT;
    
    UPDATE shifts 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_shifts = ROW_COUNT;
    
    UPDATE time_slots 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_time_slots = ROW_COUNT;
    
    UPDATE shift_requests 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_shift_requests = ROW_COUNT;
    
    UPDATE emergency_requests 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_emergency_requests = ROW_COUNT;
    
    UPDATE emergency_volunteers 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_emergency_volunteers = ROW_COUNT;
    
    UPDATE user_stores 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_user_stores = ROW_COUNT;
    
    UPDATE shift_patterns 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_shift_patterns = ROW_COUNT;
    
    UPDATE fixed_shifts 
    SET company_id = legacy_company_id 
    WHERE company_id IS NULL;
    GET DIAGNOSTICS affected_fixed_shifts = ROW_COUNT;
    
    -- 結果レポート
    RAISE NOTICE 'Migration completed successfully:';
    RAISE NOTICE 'Users updated: %', affected_users;
    RAISE NOTICE 'Stores updated: %', affected_stores;
    RAISE NOTICE 'Shifts updated: %', affected_shifts;
    RAISE NOTICE 'Time slots updated: %', affected_time_slots;
    RAISE NOTICE 'Shift requests updated: %', affected_shift_requests;
    RAISE NOTICE 'Emergency requests updated: %', affected_emergency_requests;
    RAISE NOTICE 'Emergency volunteers updated: %', affected_emergency_volunteers;
    RAISE NOTICE 'User stores updated: %', affected_user_stores;
    RAISE NOTICE 'Shift patterns updated: %', affected_shift_patterns;
    RAISE NOTICE 'Fixed shifts updated: %', affected_fixed_shifts;
    
END $$;

-- データ整合性確認
SELECT 'Data migration verification:' as status;

-- 各テーブルの状況確認
SELECT 
  'users' as table_name,
  COUNT(*) as total_records,
  COUNT(company_id) as with_company_id,
  COUNT(*) - COUNT(company_id) as without_company_id
FROM users
UNION ALL
SELECT 
  'stores' as table_name,
  COUNT(*) as total_records,
  COUNT(company_id) as with_company_id,
  COUNT(*) - COUNT(company_id) as without_company_id
FROM stores
UNION ALL
SELECT 
  'shifts' as table_name,
  COUNT(*) as total_records,
  COUNT(company_id) as with_company_id,
  COUNT(*) - COUNT(company_id) as without_company_id
FROM shifts;
