import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { login_credential, login_type, password } = body;

    // 入力値チェック
    if (!login_credential || !password || !login_type) {
      return NextResponse.json(
        { error: 'ログイン情報とパスワードが必要です' },
        { status: 400 }
      );
    }

    // ログインタイプによって検索条件を変える
    let users, fetchError;
    if (login_type === 'manager') {
      // 店長はメールアドレスで検索
      const result = await supabase
        .from('users')
        .select('id, name, email, role, password_hash, is_first_login, last_login_at, company_id')
        .eq('email', login_credential)
        .eq('login_type', 'manager');
      users = result.data;
      fetchError = result.error;
    } else {
      // スタッフはlogin_idで検索
      const result = await supabase
        .from('users')
        .select('id, name, email, role, password_hash, is_first_login, last_login_at, company_id')
        .eq('login_id', login_credential)
        .eq('login_type', 'staff');
      users = result.data;
      fetchError = result.error;
    }

    if (fetchError || !users || users.length === 0) {
      return NextResponse.json(
        { error: 'ログインIDまたはパスワードが正しくありません' },
        { status: 401 }
      );
    }

    const user = users[0];

    // 初回ログインチェック
    if (user.is_first_login) {
      return NextResponse.json(
        { error: '初回ログインです。パスワードを設定してください。' },
        { status: 403 }
      );
    }

    // パスワード未設定チェック
    if (!user.password_hash) {
      return NextResponse.json(
        { error: 'パスワードが設定されていません' },
        { status: 403 }
      );
    }

    // パスワード認証
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'ログインIDまたはパスワードが正しくありません' },
        { status: 401 }
      );
    }

    // 最終ログイン時刻を更新
    const { error: updateError } = await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating last login:', updateError);
      // ログイン時刻の更新失敗は致命的ではないので、ログインは成功とする
    }

    // 認証成功レスポンス
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
} 