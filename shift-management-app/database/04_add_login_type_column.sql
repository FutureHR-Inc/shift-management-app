-- users テーブルに login_type カラムを追加
-- 店長用('manager')とスタッフ用('staff')を区別

ALTER TABLE users ADD COLUMN IF NOT EXISTS login_type VARCHAR(20) DEFAULT 'staff';

-- 既存データの login_type を設定
-- role が 'manager' のユーザーは login_type も 'manager' に
UPDATE users 
SET login_type = 'manager' 
WHERE role = 'manager' AND login_type IS NULL;

-- role が 'staff' のユーザーは login_type も 'staff' に  
UPDATE users 
SET login_type = 'staff' 
WHERE role = 'staff' AND login_type IS NULL;

-- login_type に制約を追加
ALTER TABLE users ADD CONSTRAINT check_login_type 
CHECK (login_type IN ('manager', 'staff'));

-- インデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_users_login_type ON users(login_type);
CREATE INDEX IF NOT EXISTS idx_users_login_id_type ON users(login_id, login_type);

-- コメント追加
COMMENT ON COLUMN users.login_type IS 'Login authentication type: manager (email) or staff (staff-id)';

-- 確認用クエリ
SELECT 
  login_type,
  role,
  COUNT(*) as count
FROM users 
GROUP BY login_type, role
ORDER BY login_type, role;
