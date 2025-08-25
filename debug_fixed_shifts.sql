-- 固定シフトテーブルの調査クエリ
-- 2週間制限の原因調査

-- 1. 全固定シフトの確認
SELECT 
    fs.id,
    fs.user_id,
    fs.store_id,
    fs.day_of_week,
    CASE fs.day_of_week
        WHEN 0 THEN '日曜日'
        WHEN 1 THEN '月曜日'
        WHEN 2 THEN '火曜日'
        WHEN 3 THEN '水曜日'
        WHEN 4 THEN '木曜日'
        WHEN 5 THEN '金曜日'
        WHEN 6 THEN '土曜日'
    END as day_name,
    fs.time_slot_id,
    fs.is_active,
    fs.created_at,
    fs.updated_at,
    u.name as user_name,
    s.name as store_name,
    ts.name as time_slot_name
FROM fixed_shifts fs
LEFT JOIN users u ON fs.user_id = u.id
LEFT JOIN stores s ON fs.store_id = s.id
LEFT JOIN time_slots ts ON fs.time_slot_id = ts.id
ORDER BY fs.created_at DESC;

-- 2. 最近作成された固定シフト（過去1ヶ月）
SELECT 
    COUNT(*) as total_count,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_count,
    MIN(created_at) as earliest_created,
    MAX(created_at) as latest_created
FROM fixed_shifts
WHERE created_at >= NOW() - INTERVAL '1 month';

-- 3. 日付関連のカラムがあるかテーブル構造確認
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'fixed_shifts' 
ORDER BY ordinal_position;

-- 4. 固定シフトから生成されたシフト（notes欄で識別）
SELECT 
    COUNT(*) as generated_shifts_count,
    MIN(date) as earliest_date,
    MAX(date) as latest_date
FROM shifts 
WHERE notes LIKE '%固定シフト%' OR notes LIKE '%自動生成%';

-- 5. アクティブな固定シフトの詳細
SELECT 
    fs.*,
    u.name as user_name,
    s.name as store_name,
    ts.name as time_slot_name,
    ts.start_time,
    ts.end_time
FROM fixed_shifts fs
LEFT JOIN users u ON fs.user_id = u.id
LEFT JOIN stores s ON fs.store_id = s.id
LEFT JOIN time_slots ts ON fs.time_slot_id = ts.id
WHERE fs.is_active = true
ORDER BY fs.day_of_week, ts.start_time;
