-- 緊急データ復旧スクリプト（最小構成版）
-- 田中太郎さんのアカウントと基本データを復元

-- 2. 店舗データの復元（最小限のカラムのみ）
INSERT INTO stores (id, name, created_at, updated_at) VALUES
('s1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', '京橋店', NOW(), NOW()),
('s2f2e3d4-5a6b-7c8d-9e0f-1234567890ab', '梅田店', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. ユーザーデータの復元（田中太郎さん含む）
INSERT INTO users (id, name, email, phone, role, login_id, password_hash, skill_level, hourly_wage, created_at, updated_at) VALUES
-- 田中太郎さん（店長）
('u1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', '田中太郎', 'tanaka@sample.com', '090-1234-5678', 'manager', 'mgr-001', '000000', 'veteran', 1500, NOW(), NOW()),

-- その他のスタッフ
('u2f2e3d4-5a6b-7c8d-9e0f-1234567890ab', '佐藤花子', 'sato@sample.com', '090-2345-6789', 'staff', 'staff-001', '000000', 'regular', 1200, NOW(), NOW()),
('u3f2e3d4-5a6b-7c8d-9e0f-1234567890ab', '鈴木次郎', 'suzuki@sample.com', '090-3456-7890', 'staff', 'staff-002', '000000', 'regular', 1100, NOW(), NOW()),
('u4f2e3d4-5a6b-7c8d-9e0f-1234567890ab', '山田美咲', 'yamada@sample.com', '090-4567-8901', 'staff', 'staff-003', '000000', 'training', 1000, NOW(), NOW()),
('u5f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 'カトー', 'kato@sample.com', '090-5678-9012', 'staff', 'staff-004', '000000', 'regular', 1150, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. ユーザー店舗関連付け
INSERT INTO user_stores (user_id, store_id, created_at) VALUES
-- 田中太郎さん（両店舗の責任者）
('u1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 's1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', NOW()),
('u1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 's2f2e3d4-5a6b-7c8d-9e0f-1234567890ab', NOW()),

-- スタッフの配属
('u2f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 's1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', NOW()),
('u3f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 's1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', NOW()),
('u4f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 's2f2e3d4-5a6b-7c8d-9e0f-1234567890ab', NOW()),
('u5f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 's1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', NOW())
ON CONFLICT (user_id, store_id) DO NOTHING;

-- 5. 時間帯設定の復元
INSERT INTO time_slots (id, name, start_time, end_time, store_id, display_order, created_at, updated_at) VALUES
-- 京橋店
('t1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 'ランチ', '10:30', '15:00', 's1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 1, NOW(), NOW()),
('t2f2e3d4-5a6b-7c8d-9e0f-1234567890ab', '夕方', '17:00', '22:00', 's1f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 2, NOW(), NOW()),

-- 梅田店
('t3f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 'ランチ', '10:30', '15:00', 's2f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 1, NOW(), NOW()),
('t4f2e3d4-5a6b-7c8d-9e0f-1234567890ab', '夕方', '17:00', '22:00', 's2f2e3d4-5a6b-7c8d-9e0f-1234567890ab', 2, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- データ復旧確認
SELECT 
  u.name,
  u.login_id,
  u.role,
  s.name as store_name
FROM users u
LEFT JOIN user_stores us ON u.id = us.user_id
LEFT JOIN stores s ON us.store_id = s.id
WHERE u.login_id = 'mgr-001';

-- 全体データ確認
SELECT 
  'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'stores', COUNT(*) FROM stores
UNION ALL
SELECT 'user_stores', COUNT(*) FROM user_stores
UNION ALL
SELECT 'time_slots', COUNT(*) FROM time_slots; 