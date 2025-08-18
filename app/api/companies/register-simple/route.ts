import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 企業名からスラッグを生成する関数
function generateSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).substring(2, 8);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyName, description, address, phoneNumber, managerId } = body;

    // バリデーション
    if (!companyName || !managerId) {
      return NextResponse.json(
        { error: '企業名と管理者IDは必須です' },
        { status: 400 }
      );
    }

    // 管理者の存在確認
    const { data: manager, error: managerError } = await supabase
      .from('users')
      .select('id, name, email, company_id')
      .eq('id', managerId)
      .eq('role', 'manager')
      .single();

    if (managerError || !manager) {
      return NextResponse.json(
        { error: '管理者が見つかりません' },
        { status: 404 }
      );
    }

    // 既に企業に所属していないかチェック
    if (manager.company_id) {
      return NextResponse.json(
        { error: '既に企業に所属しています' },
        { status: 409 }
      );
    }

    // 企業スラッグ生成
    let companySlug = generateSlug(companyName);
    
    // スラッグの重複チェック
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', companySlug)
      .single();

    if (existingCompany) {
      companySlug = generateSlug(companyName); // 再生成
    }

    // 1. 企業を作成
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: companyName,
        slug: companySlug,
        subdomain: companySlug,
        is_legacy: false,
        settings: {
          description: description || '',
          address: address || '',
          phoneNumber: phoneNumber || ''
        }
      })
      .select()
      .single();

    if (companyError) {
      console.error('Company creation error:', companyError);
      return NextResponse.json(
        { error: `企業の作成に失敗しました: ${companyError.message}` },
        { status: 500 }
      );
    }

    // 2. 管理者に企業IDを設定
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        company_id: company.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', managerId);

    if (updateError) {
      console.error('Manager update error:', updateError);
      
      // ロールバック: 企業を削除
      await supabase.from('companies').delete().eq('id', company.id);
      
      return NextResponse.json(
        { error: '管理者の更新に失敗しました' },
        { status: 500 }
      );
    }

    // 3. 初期店舗を作成
    const { error: storeError } = await supabase
      .from('stores')
      .insert({
        name: `${companyName} 本店`,
        company_id: company.id,
        required_staff: {},
        work_rules: {
          max_weekly_hours: 28,
          max_consecutive_days: 7,
          min_rest_hours: 11
        }
      });

    if (storeError) {
      console.error('Store creation error:', storeError);
      // エラーログのみ（店舗は後で作成可能）
    }

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      message: '企業登録が完了しました',
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug
      },
      companyUrl: `https://${companySlug}.shift-app.com`,
      instructions: [
        '1. 企業登録が完了しました',
        '2. スタッフ管理画面でスタッフを追加できます',
        '3. 店舗設定で詳細な設定を行ってください'
      ]
    }, { status: 201 });

  } catch (error) {
    console.error('Company registration error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
