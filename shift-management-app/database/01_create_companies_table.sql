-- ==========================================
-- Phase 1: 企業テーブル作成（既存データ完全保護）
-- ==========================================

-- 新しいcompaniesテーブルを作成（既存データに一切影響なし）
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_legacy BOOLEAN DEFAULT FALSE,
  legacy_domain VARCHAR(255),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_is_legacy ON companies(is_legacy);

-- 既存企業用の特別エントリを作成
INSERT INTO companies (slug, name, is_legacy, legacy_domain) 
VALUES ('legacy-main', '既存企業', TRUE, 'shift-app.com')
ON CONFLICT (slug) DO NOTHING;

-- 実行確認用クエリ
SELECT 'Companies table created successfully' as status;
SELECT * FROM companies;
