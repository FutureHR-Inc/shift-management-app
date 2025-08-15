# 🛡️ 安全なマルチテナント移行ガイド

## 🚨 重要: データ保護方針

**既存データの削除・変更は絶対に行いません**
- 全ての操作は「追加」のみ
- 既存の動作は完全に保持
- ロールバック可能な設計

## 📋 実行手順

### Phase 1: データベース準備

#### 1. 企業テーブル作成
```sql
-- Supabase SQLエディタで実行
\i 01_create_companies_table.sql
```

**確認ポイント:**
- ✅ companies テーブルが作成された
- ✅ legacy-main エントリが存在する
- ✅ 既存テーブルに変更なし

#### 2. 既存テーブルへのカラム追加
```sql
-- Supabase SQLエディタで実行
\i 02_add_company_columns_safe.sql
```

**確認ポイント:**
- ✅ 全テーブルに company_id カラムが追加された
- ✅ 全て NULL許可で追加された
- ✅ 既存データの値は変更されていない

#### 3. 既存データの安全な移行
```sql
-- Supabase SQLエディタで実行
\i 03_migrate_existing_data_safe.sql
```

**確認ポイント:**
- ✅ 既存データが legacy-main に紐付けられた
- ✅ NULL だったレコードのみ更新された
- ✅ 既存の値は保護された

### Phase 2: アプリケーション対応

#### 1. 依存関係確認
```bash
# プロジェクトディレクトリで実行
cd /Users/ren/シフト管理アプリnew/shift-management-app
npm install
```

#### 2. TypeScript型チェック
```bash
npx tsc --noEmit
```

#### 3. 開発サーバー起動
```bash
npm run dev
```

#### 4. 動作確認
- ✅ 既存の機能が全て動作する
- ✅ ログイン・ログアウトが正常
- ✅ データの表示・編集が正常
- ✅ コンソールでmiddleware動作確認

## 🔍 確認クエリ

### データ整合性確認
```sql
-- 企業テーブルの確認
SELECT * FROM companies;

-- 各テーブルのcompany_id設定状況
SELECT 
  'users' as table_name,
  COUNT(*) as total,
  COUNT(company_id) as with_company,
  COUNT(*) - COUNT(company_id) as without_company
FROM users
UNION ALL
SELECT 'stores', COUNT(*), COUNT(company_id), COUNT(*) - COUNT(company_id) FROM stores
UNION ALL  
SELECT 'shifts', COUNT(*), COUNT(company_id), COUNT(*) - COUNT(company_id) FROM shifts;

-- legacy-main企業のデータ確認
SELECT 
  u.name, u.email, c.name as company_name
FROM users u
LEFT JOIN companies c ON u.company_id = c.id
LIMIT 5;
```

## ⚠️ トラブルシューティング

### エラーが発生した場合

#### 1. 外部キー制約エラー
```sql
-- companies テーブルが存在するか確認
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'companies'
);
```

#### 2. legacy-main が見つからない
```sql
-- legacy-main エントリを再作成
INSERT INTO companies (slug, name, is_legacy, legacy_domain) 
VALUES ('legacy-main', '既存企業', TRUE, 'shift-app.com')
ON CONFLICT (slug) DO NOTHING;
```

#### 3. middlewareエラー
```bash
# middlewareファイルの存在確認
ls -la middleware.ts

# TypeScriptコンパイルエラー確認
npx tsc middleware.ts --noEmit
```

## 🎯 成功確認チェックリスト

### データベース
- [ ] companies テーブル作成完了
- [ ] 全テーブルに company_id 追加完了
- [ ] 既存データの移行完了
- [ ] データ整合性確認完了

### アプリケーション
- [ ] middleware 動作確認
- [ ] 既存機能の動作確認
- [ ] ログイン・ログアウト確認
- [ ] データ表示・編集確認

### 既存企業保護
- [ ] 既存URLでアクセス可能
- [ ] 既存の操作手順で利用可能
- [ ] UI/UXに変更なし
- [ ] パフォーマンス劣化なし

## 🚀 次のステップ

この移行が完了したら:
1. 新企業登録API実装
2. サブドメイン対応強化
3. 企業管理画面作成
4. 新企業向けオンボーディング

---

**注意: 何か問題が発生した場合は、すぐに実行を停止してください。**
