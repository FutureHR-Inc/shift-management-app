-- ============================================
-- emergency_volunteersテーブルにnotesカラム追加
-- 応募者のメモ・要望を保存するためのカラム
-- ============================================

-- 1️⃣ notesカラムを追加
ALTER TABLE emergency_volunteers 
ADD COLUMN notes TEXT NULL;

-- 2️⃣ カラムにコメントを追加
COMMENT ON COLUMN emergency_volunteers.notes IS '応募者からのメモ・要望（任意）';

-- 3️⃣ 追加結果確認
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'emergency_volunteers' 
AND table_schema = 'public'
ORDER BY ordinal_position; 