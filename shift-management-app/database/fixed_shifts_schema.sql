-- ============================================
-- 固定シフト（固定出勤）テーブル作成
-- 例：毎週月曜ランチは社長
-- ============================================

CREATE TABLE IF NOT EXISTS fixed_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id VARCHAR NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 1=Monday, ..., 6=Saturday
    time_slot_id VARCHAR NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 一人のユーザーが同じ店舗・同じ曜日・同じ時間帯に複数の固定シフトを持てないようにする
    UNIQUE(user_id, store_id, day_of_week, time_slot_id)
);

-- インデックス作成（検索性能向上）
CREATE INDEX IF NOT EXISTS idx_fixed_shifts_user_store ON fixed_shifts(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_fixed_shifts_store_day ON fixed_shifts(store_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_fixed_shifts_active ON fixed_shifts(is_active) WHERE is_active = true;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_fixed_shifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_fixed_shifts_updated_at
    BEFORE UPDATE ON fixed_shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_fixed_shifts_updated_at();

-- 確認用クエリ
-- 固定シフト一覧表示（ユーザー名、店舗名、時間帯名付き）
-- SELECT 
--   fs.id,
--   u.name as user_name,
--   s.name as store_name,
--   fs.day_of_week,
--   CASE fs.day_of_week
--     WHEN 0 THEN '日曜日'
--     WHEN 1 THEN '月曜日'
--     WHEN 2 THEN '火曜日'
--     WHEN 3 THEN '水曜日'
--     WHEN 4 THEN '木曜日'
--     WHEN 5 THEN '金曜日'
--     WHEN 6 THEN '土曜日'
--   END as day_name,
--   ts.name as time_slot_name,
--   ts.start_time,
--   ts.end_time,
--   fs.is_active,
--   fs.created_at
-- FROM fixed_shifts fs
-- JOIN users u ON fs.user_id = u.id
-- JOIN stores s ON fs.store_id = s.id
-- JOIN time_slots ts ON fs.time_slot_id = ts.id
-- WHERE fs.is_active = true
-- ORDER BY s.name, fs.day_of_week, ts.start_time;

-- 固定シフト数の確認
-- SELECT 
--   s.name as store_name,
--   COUNT(*) as active_fixed_shifts
-- FROM fixed_shifts fs
-- JOIN stores s ON fs.store_id = s.id
-- WHERE fs.is_active = true
-- GROUP BY s.id, s.name
-- ORDER BY s.name; 