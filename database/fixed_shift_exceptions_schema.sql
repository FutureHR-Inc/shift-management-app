-- ============================================
-- 固定シフト例外テーブル作成
-- 固定シフトの特定日のみを削除（非表示）するためのテーブル
-- ============================================

CREATE TABLE IF NOT EXISTS fixed_shift_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixed_shift_id UUID NOT NULL REFERENCES fixed_shifts(id) ON DELETE CASCADE,
    date DATE NOT NULL, -- 例外を適用する日付
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 同じ固定シフトの同じ日付に複数の例外を作成できないようにする
    UNIQUE(fixed_shift_id, date)
);

-- インデックス作成（検索性能向上）
CREATE INDEX IF NOT EXISTS idx_fixed_shift_exceptions_fixed_shift ON fixed_shift_exceptions(fixed_shift_id);
CREATE INDEX IF NOT EXISTS idx_fixed_shift_exceptions_date ON fixed_shift_exceptions(date);
CREATE INDEX IF NOT EXISTS idx_fixed_shift_exceptions_fixed_shift_date ON fixed_shift_exceptions(fixed_shift_id, date);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_fixed_shift_exceptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_fixed_shift_exceptions_updated_at
    BEFORE UPDATE ON fixed_shift_exceptions
    FOR EACH ROW
    EXECUTE FUNCTION update_fixed_shift_exceptions_updated_at();

-- 確認用クエリ
-- 固定シフト例外一覧表示
-- SELECT 
--   fse.id,
--   fse.fixed_shift_id,
--   fse.date,
--   fs.user_id,
--   u.name as user_name,
--   fs.store_id,
--   s.name as store_name,
--   fs.day_of_week,
--   fs.time_slot_id,
--   ts.name as time_slot_name
-- FROM fixed_shift_exceptions fse
-- JOIN fixed_shifts fs ON fse.fixed_shift_id = fs.id
-- JOIN users u ON fs.user_id = u.id
-- JOIN stores s ON fs.store_id = s.id
-- JOIN time_slots ts ON fs.time_slot_id = ts.id
-- ORDER BY fse.date DESC, u.name;

