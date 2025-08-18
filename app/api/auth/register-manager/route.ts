import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    // バリデーション
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: '名前、メールアドレス、パスワードは必須です' },
        { status: 400 }
      );
    }

    // メールアドレスの形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '有効なメールアドレスを入力してください' },
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

    // 既存のメールアドレスチェック
    const { data: existingUsers, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .eq('login_type', 'manager');

    if (checkError) {
      console.error('Error checking existing email:', checkError);
      return NextResponse.json(
        { error: 'ユーザー確認に失敗しました' },
        { status: 500 }
      );
    }

    if (existingUsers && existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'このメールアドレスは既に使用されています' },
        { status: 409 }
      );
    }

    // パスワードをハッシュ化
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 店長ユーザーを作成（企業ID未設定）
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        name: name,
        email: email,
        phone: '000-0000-0000', // 仮の値
        role: 'manager',
        login_type: 'manager',
        login_id: email, // 店長の場合、login_idもemailにする
        password_hash: passwordHash,
        skill_level: 'veteran',
        hourly_wage: 1500,
        company_id: null, // 企業ID未設定
        is_first_login: false, // 登録時にパスワード設定済み
        memo: '新規店長アカウント'
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating manager user:', createError);
      return NextResponse.json(
        { error: '店長アカウントの作成に失敗しました' },
        { status: 500 }
      );
    }

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      message: '店長アカウントが作成されました',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Manager registration error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
