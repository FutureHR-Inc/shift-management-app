import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { login_id, password } = body;

    // 入力値チェック
    if (!login_id || !password) {
      return NextResponse.json(
        { error: 'ログインIDと新しいパスワードが必要です' },
        { status: 400 }
      );
    }

    // パスワードの長さチェック
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'パスワードは6文字以上で入力してください' },
        { status: 400 }
      );
    }

    // ユーザー情報を取得
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, name, email, role, is_first_login, password_hash')
      .eq('login_id', login_id);

    if (fetchError || !users || users.length === 0) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりません' },
        { status: 404 }
      );
    }

    const user = users[0];

    // 初回ログインユーザーの場合は、set-passwordを使用するよう案内
    if (user.is_first_login) {
      return NextResponse.json(
        { error: '初回ログインです。通常のパスワード設定を行ってください' },
        { status: 400 }
      );
    }

    // パスワードが設定されていない場合はエラー
    if (!user.password_hash) {
      return NextResponse.json(
        { error: 'パスワードが設定されていません。管理者にお問い合わせください' },
        { status: 400 }
      );
    }

    // 新しいパスワードをハッシュ化
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(password, saltRounds);

    // パスワードハッシュを更新
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating password:', updateError);
      return NextResponse.json(
        { error: 'パスワードの更新に失敗しました' },
        { status: 500 }
      );
    }

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      message: 'パスワードが正常にリセットされました'
    }, { status: 200 });

  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
} 