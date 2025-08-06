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
-- SELECT * FROM fixed_shifts 
-- JOIN users ON fixed_shifts.user_id = users.id 
-- JOIN stores ON fixed_shifts.store_id = stores.id 
-- JOIN time_slots ON fixed_shifts.time_slot_id = time_slots.id 
-- WHERE is_active = true; 