import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 固定シフト取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const storeId = searchParams.get('store_id');
    const dayOfWeek = searchParams.get('day_of_week');
    const isActive = searchParams.get('is_active');
    const id = searchParams.get('id');

    let query = supabase
      .from('fixed_shifts')
      .select(`
        *,
        users(id, name, role, skill_level),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `);

    // フィルター条件を適用
    if (id) {
      query = query.eq('id', id);
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    if (dayOfWeek !== null && dayOfWeek !== undefined) {
      query = query.eq('day_of_week', parseInt(dayOfWeek));
    }
    if (isActive !== null && isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data, error } = await query.order('day_of_week', { ascending: true })
                                       .order('created_at', { ascending: true });

    if (error) {
      console.error('固定シフト取得エラー:', error);
      return NextResponse.json({ 
        error: '固定シフトの取得に失敗しました',
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });

  } catch (error) {
    console.error('固定シフトAPI エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラーが発生しました',
      details: error 
    }, { status: 500 });
  }
}

// 固定シフト作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, store_id, day_of_week, time_slot_id, is_active = true } = body;

    // バリデーション
    if (!user_id || !store_id || day_of_week === undefined || !time_slot_id) {
      return NextResponse.json({ 
        error: '必須フィールドが不足しています（user_id, store_id, day_of_week, time_slot_id）' 
      }, { status: 400 });
    }

    if (day_of_week < 0 || day_of_week > 6) {
      return NextResponse.json({ 
        error: 'day_of_weekは0-6の範囲で指定してください（0=日曜日, 6=土曜日）' 
      }, { status: 400 });
    }

    // 重複チェック（同じ店舗・同じ曜日・同じ時間帯）
    const { data: existingData, error: checkError } = await supabase
      .from('fixed_shifts')
      .select('id, store_id, stores(id, name)')
      .eq('user_id', user_id)
      .eq('store_id', store_id)
      .eq('day_of_week', day_of_week)
      .eq('time_slot_id', time_slot_id)
      .eq('is_active', true)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('重複チェックエラー:', checkError);
      return NextResponse.json({ 
        error: '重複チェックに失敗しました',
        details: checkError 
      }, { status: 500 });
    }

    if (existingData) {
      return NextResponse.json({ 
        error: 'この条件の固定シフトは既に存在します' 
      }, { status: 409 });
    }

    // 異なる店舗への重複チェック（同じユーザー・同じ曜日・同じ時間帯で、異なる店舗）
    const { data: otherStoreShifts, error: otherStoreCheckError } = await supabase
      .from('fixed_shifts')
      .select('id, store_id, stores(id, name)')
      .eq('user_id', user_id)
      .neq('store_id', store_id) // 異なる店舗
      .eq('day_of_week', day_of_week)
      .eq('time_slot_id', time_slot_id)
      .eq('is_active', true);

    if (otherStoreCheckError) {
      console.error('異なる店舗重複チェックエラー:', otherStoreCheckError);
      return NextResponse.json({ 
        error: '異なる店舗への重複チェックに失敗しました',
        details: otherStoreCheckError 
      }, { status: 500 });
    }

    if (otherStoreShifts && otherStoreShifts.length > 0) {
      const otherStoreNames = otherStoreShifts
        .map((fs: { stores?: { name: string } }) => fs.stores?.name || '不明な店舗')
        .join('、');
      return NextResponse.json({ 
        error: `このスタッフはこの曜日・時間帯に他の店舗（${otherStoreNames}）で固定シフトが設定されています。異なる店舗への重複シフトは設定できません。` 
      }, { status: 409 });
    }

    // 固定シフト作成
    const { data, error } = await supabase
      .from('fixed_shifts')
      .insert({
        user_id,
        store_id,
        day_of_week,
        time_slot_id,
        is_active
      })
      .select(`
        *,
        users(id, name, role, skill_level),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .single();

    if (error) {
      console.error('固定シフト作成エラー:', error);
      return NextResponse.json({ 
        error: '固定シフトの作成に失敗しました',
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });

  } catch (error) {
    console.error('固定シフト作成API エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラーが発生しました',
      details: error 
    }, { status: 500 });
  }
}

// 固定シフト更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, user_id, store_id, day_of_week, time_slot_id, is_active } = body;

    if (!id) {
      return NextResponse.json({ 
        error: 'IDが必要です' 
      }, { status: 400 });
    }

    // 更新データを動的に構築
    const updateData: Record<string, unknown> = {};
    if (user_id !== undefined) updateData.user_id = user_id;
    if (store_id !== undefined) updateData.store_id = store_id;
    if (day_of_week !== undefined) {
      if (day_of_week < 0 || day_of_week > 6) {
        return NextResponse.json({ 
          error: 'day_of_weekは0-6の範囲で指定してください' 
        }, { status: 400 });
      }
      updateData.day_of_week = day_of_week;
    }
    if (time_slot_id !== undefined) updateData.time_slot_id = time_slot_id;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('fixed_shifts')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        users(id, name, role, skill_level),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .single();

    if (error) {
      console.error('固定シフト更新エラー:', error);
      return NextResponse.json({ 
        error: '固定シフトの更新に失敗しました',
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ data });

  } catch (error) {
    console.error('固定シフト更新API エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラーが発生しました',
      details: error 
    }, { status: 500 });
  }
}

// 固定シフト削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ 
        error: 'IDが必要です' 
      }, { status: 400 });
    }

    const { error } = await supabase
      .from('fixed_shifts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('固定シフト削除エラー:', error);
      return NextResponse.json({ 
        error: '固定シフトの削除に失敗しました',
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ message: '固定シフトが削除されました' });

  } catch (error) {
    console.error('固定シフト削除API エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラーが発生しました',
      details: error 
    }, { status: 500 });
  }
} 