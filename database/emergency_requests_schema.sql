-- emergency_requestsテーブルにrequest_typeカラムを追加
ALTER TABLE emergency_requests 
ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) DEFAULT 'substitute' 
CHECK (request_type IN ('substitute', 'shortage'));

-- 既存データの更新（デフォルトで代打として扱う）
UPDATE emergency_requests 
SET request_type = 'substitute' 
WHERE request_type IS NULL;

-- request_typeカラムをNOT NULLに変更
ALTER TABLE emergency_requests 
ALTER COLUMN request_type SET NOT NULL;

-- インデックス追加（検索性能向上）
CREATE INDEX IF NOT EXISTS idx_emergency_requests_type 
ON emergency_requests(request_type);

-- 確認用クエリ
SELECT 
  er.id,
  er.date,
  er.request_type,
  er.reason,
  er.status,
  u.name as original_user_name,
  s.name as store_name,
  ts.name as time_slot_name
FROM emergency_requests er
LEFT JOIN users u ON er.original_user_id = u.id
LEFT JOIN stores s ON er.store_id = s.id
LEFT JOIN time_slots ts ON er.time_slot_id = ts.id
ORDER BY er.created_at DESC
LIMIT 10; 