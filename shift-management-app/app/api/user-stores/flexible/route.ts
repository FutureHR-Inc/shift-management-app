import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PUT - 応援スタッフ設定の一括更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, flexible_users } = body;

    // バリデーション
    if (!store_id) {
      return NextResponse.json(
        { error: 'Store ID is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(flexible_users)) {
      return NextResponse.json(
        { error: 'flexible_users must be an array' },
        { status: 400 }
      );
    }

    // 1. 該当店舗の全てのuser_storesレコードのis_flexibleをfalseにリセット
    const { error: resetError } = await supabase
      .from('user_stores')
      .update({ is_flexible: false })
      .eq('store_id', store_id);

    if (resetError) {
      console.error('Error resetting flexible flags:', resetError);
      return NextResponse.json({ error: resetError.message }, { status: 500 });
    }

    // 2. 指定されたユーザーのみis_flexibleをtrueに設定
    if (flexible_users.length > 0) {
      const { error: updateError } = await supabase
        .from('user_stores')
        .update({ is_flexible: true })
        .eq('store_id', store_id)
        .in('user_id', flexible_users);

      if (updateError) {
        console.error('Error updating flexible flags:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      message: 'Flexible staff settings updated successfully',
      store_id,
      flexible_users 
    }, { status: 200 });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 