import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 固定シフト例外取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fixedShiftId = searchParams.get('fixed_shift_id');
    const date = searchParams.get('date');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = supabase
      .from('fixed_shift_exceptions')
      .select(`
        *,
        fixed_shifts(
          id,
          user_id,
          store_id,
          day_of_week,
          time_slot_id,
          is_active,
          users(id, name),
          stores(id, name),
          time_slots(id, name, start_time, end_time)
        )
      `);

    // フィルター条件を適用
    if (fixedShiftId) {
      query = query.eq('fixed_shift_id', fixedShiftId);
    }
    if (date) {
      query = query.eq('date', date);
    }
    if (dateFrom) {
      query = query.gte('date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('date', dateTo);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      console.error('固定シフト例外取得エラー:', error);
      return NextResponse.json({ 
        error: '固定シフト例外の取得に失敗しました',
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });

  } catch (error) {
    console.error('固定シフト例外API エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラーが発生しました',
      details: error 
    }, { status: 500 });
  }
}

// 固定シフト例外作成（特定日の削除）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fixed_shift_id, date } = body;

    // バリデーション
    if (!fixed_shift_id || !date) {
      return NextResponse.json({ 
        error: '必須フィールドが不足しています（fixed_shift_id, date）' 
      }, { status: 400 });
    }

    // 固定シフトが存在するか確認
    const { data: fixedShift, error: fixedShiftError } = await supabase
      .from('fixed_shifts')
      .select('id, user_id, store_id, day_of_week, time_slot_id')
      .eq('id', fixed_shift_id)
      .single();

    if (fixedShiftError || !fixedShift) {
      return NextResponse.json({ 
        error: '固定シフトが見つかりません' 
      }, { status: 404 });
    }

    // 既に例外が存在するかチェック
    const { data: existingException, error: checkError } = await supabase
      .from('fixed_shift_exceptions')
      .select('id')
      .eq('fixed_shift_id', fixed_shift_id)
      .eq('date', date)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('例外チェックエラー:', checkError);
      return NextResponse.json({ 
        error: '例外チェックに失敗しました',
        details: checkError 
      }, { status: 500 });
    }

    if (existingException) {
      return NextResponse.json({ 
        error: 'この日付の例外は既に存在します' 
      }, { status: 409 });
    }

    // 固定シフト例外を作成
    const { data, error } = await supabase
      .from('fixed_shift_exceptions')
      .insert({
        fixed_shift_id,
        date
      })
      .select(`
        *,
        fixed_shifts(
          id,
          user_id,
          store_id,
          day_of_week,
          time_slot_id,
          is_active,
          users(id, name),
          stores(id, name),
          time_slots(id, name, start_time, end_time)
        )
      `)
      .single();

    if (error) {
      console.error('固定シフト例外作成エラー:', error);
      return NextResponse.json({ 
        error: '固定シフト例外の作成に失敗しました',
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });

  } catch (error) {
    console.error('固定シフト例外作成API エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラーが発生しました',
      details: error 
    }, { status: 500 });
  }
}

// 固定シフト例外削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const fixedShiftId = searchParams.get('fixed_shift_id');
    const date = searchParams.get('date');

    if (!id && (!fixedShiftId || !date)) {
      return NextResponse.json({ 
        error: 'IDまたはfixed_shift_id+dateが必要です' 
      }, { status: 400 });
    }

    // Supabase v2 では delete() の後に eq(...) で条件を指定する
    let deleteQuery = supabase.from('fixed_shift_exceptions').delete();

    if (id) {
      deleteQuery = deleteQuery.eq('id', id);
    } else if (fixedShiftId && date) {
      deleteQuery = deleteQuery.eq('fixed_shift_id', fixedShiftId).eq('date', date);
    }

    const { error } = await deleteQuery;

    if (error) {
      console.error('固定シフト例外削除エラー:', error);
      return NextResponse.json({ 
        error: '固定シフト例外の削除に失敗しました',
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ message: '固定シフト例外が削除されました' });

  } catch (error) {
    console.error('固定シフト例外削除API エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラーが発生しました',
      details: error 
    }, { status: 500 });
  }
}

