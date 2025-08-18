-- 企業分離デバッグ用クエリ
-- 全ユーザーのcompany_id状況を確認

SELECT 
  id,
  name,
  email,
  role,
  company_id,
  login_id,
  created_at
FROM users 
ORDER BY company_id NULLS FIRST, created_at;

-- 企業別ユーザー数
SELECT 
  COALESCE(company_id, 'NULL (既存企業)') as company_group,
  COUNT(*) as user_count,
  string_agg(name, ', ') as user_names
FROM users 
GROUP BY company_id
ORDER BY company_id NULLS FIRST;

-- companiesテーブルの状況
SELECT 
  id,
  name,
  slug,
  created_at
FROM companies
ORDER BY created_at;
