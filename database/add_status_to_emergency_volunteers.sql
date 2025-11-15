-- ============================================
-- emergency_volunteersテーブルにstatusカラム追加
-- 応募者の採用・却下状態を保存するためのカラム
-- ============================================

-- 1️⃣ statusカラムを追加
ALTER TABLE emergency_volunteers 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NULL 
CHECK (status IN ('pending', 'accepted', 'rejected'));

-- 2️⃣ 既存データのデフォルト値を設定（既存の応募はpendingとして扱う）
UPDATE emergency_volunteers 
SET status = 'pending' 
WHERE status IS NULL;

-- 3️⃣ カラムにコメントを追加
COMMENT ON COLUMN emergency_volunteers.status IS '応募者の採用状態: pending(審査中), accepted(採用), rejected(不採用)';

-- 4️⃣ 追加結果確認
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'emergency_volunteers' 
AND table_schema = 'public'
ORDER BY ordinal_position;

