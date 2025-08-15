-- 緊急復旧 ステップ1: 田中太郎さんのアカウントと3店舗復旧
-- 単体で実行可能

-- 店舗データの復元（3店舗：京橋、天満、本町）
INSERT INTO stores (id, name, required_staff, created_at, updated_at) VALUES
('12345678-1234-1234-1234-123456789abc', '京橋店', '{}', NOW(), NOW()),
('23456789-2345-2345-2345-23456789abcd', '天満店', '{}', NOW(), NOW()),
('34567890-3456-3456-3456-3456789abcde', '本町店', '{}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 田中太郎さんのアカウント復元
INSERT INTO users (id, name, email, phone, role, login_id, password_hash, skill_level, hourly_wage, created_at, updated_at) VALUES
('11111111-1111-1111-1111-111111111111', '田中太郎', 'tanaka@sample.com', '090-1234-5678', 'manager', 'mgr-001', '000000', 'veteran', 1500, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 田中太郎さんの全店舗関連付け（3店舗すべての責任者）
INSERT INTO user_stores (user_id, store_id, created_at) VALUES
('11111111-1111-1111-1111-111111111111', '12345678-1234-1234-1234-123456789abc', NOW()), -- 京橋店
('11111111-1111-1111-1111-111111111111', '23456789-2345-2345-2345-23456789abcd', NOW()), -- 天満店
('11111111-1111-1111-1111-111111111111', '34567890-3456-3456-3456-3456789abcde', NOW())  -- 本町店
ON CONFLICT (user_id, store_id) DO NOTHING;

-- 確認
SELECT 
  u.name, 
  u.login_id, 
  u.role,
  s.name as store_name
FROM users u
LEFT JOIN user_stores us ON u.id = us.user_id
LEFT JOIN stores s ON us.store_id = s.id
WHERE u.login_id = 'mgr-001'; 