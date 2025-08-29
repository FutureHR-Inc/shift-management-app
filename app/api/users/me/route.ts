import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    // Cookieからユーザー情報を取得
    const cookieStore = await cookies();
    const userCookie = cookieStore.get('user');
    
    if (!userCookie?.value) {
      return NextResponse.json(
        { error: 'ユーザー情報が見つかりません' },
        { status: 401 }
      );
    }

    const user = JSON.parse(userCookie.value);

    // ユーザー情報を取得
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, company_id')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'ユーザー情報の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
