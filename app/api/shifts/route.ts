import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: シフト一覧取得
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || searchParams.get('store_id');
  const userId = searchParams.get('user_id') || searchParams.get('userId');
  const startDate = searchParams.get('startDate') || searchParams.get('date_from');
  const endDate = searchParams.get('endDate') || searchParams.get('date_to');

  try {
    let query = supabase
      .from('shifts')
      .select(`
        *,
        users(id, name, email, phone, role, skill_level, hourly_wage),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `);

    // フィルタリング条件を適用
    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    query = query.order('date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'シフトデータの取得に失敗しました' }, 
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' }, 
      { status: 500 }
    );
  }
}

// POST: 新しいシフト作成
export async function POST(request: Request) {
  try {
    const {
      user_id,
      store_id,
      date,
      pattern_id, // 旧フィールド（移行期間）
      time_slot_id, // 新フィールド
      custom_start_time,
      custom_end_time,
      status = 'draft',
      notes
    } = await request.json();

    // 必須フィールドの検証
    if (!user_id || !store_id || !date) {
      return NextResponse.json(
        { error: 'user_id, store_id, dateは必須です' }, 
        { status: 400 }
      );
    }

    // time_slot_id または pattern_id のいずれかが必要
    const finalTimeSlotId = time_slot_id || pattern_id;
    if (!finalTimeSlotId) {
      return NextResponse.json(
        { error: 'time_slot_idまたはpattern_idが必要です' }, 
        { status: 400 }
      );
    }

    // カスタム時間のバリデーション（フォーマットのみ）
    if (custom_start_time && custom_start_time.trim() !== '' && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(custom_start_time)) {
      console.error('無効なcustom_start_time:', custom_start_time);
      return NextResponse.json(
        { error: 'custom_start_timeは HH:MM 形式で入力してください' }, 
        { status: 400 }
      );
    }

    if (custom_end_time && custom_end_time.trim() !== '' && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(custom_end_time)) {
      console.error('無効なcustom_end_time:', custom_end_time);
      return NextResponse.json(
        { error: 'custom_end_timeは HH:MM 形式で入力してください' }, 
        { status: 400 }
      );
    }

    // 時間の論理チェックは削除 - 柔軟な時間設定を許可

    // データ挿入オブジェクトを構築
    const insertData: Record<string, unknown> = {
      user_id,
      store_id,
      date,
      time_slot_id: finalTimeSlotId,
      custom_start_time: custom_start_time && custom_start_time.trim() !== '' ? custom_start_time : null,
      custom_end_time: custom_end_time && custom_end_time.trim() !== '' ? custom_end_time : null,
      status,
      notes
    };

    const { data, error } = await supabase
      .from('shifts')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'シフトの作成に失敗しました' }, 
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' }, 
      { status: 500 }
    );
  }
}

// PUT: シフトの更新
export async function PUT(request: Request) {
  try {
    const {
      id,
      user_id,
      store_id,
      date,
      pattern_id, // 旧フィールド（移行期間）
      time_slot_id, // 新フィールド
      custom_start_time,
      custom_end_time,
      status,
      notes
    } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'idは必須です' }, 
        { status: 400 }
      );
    }

    // time_slot_id または pattern_id のいずれかが必要（更新の場合）
    const finalTimeSlotId = time_slot_id || pattern_id;

    // カスタム時間のバリデーション（フォーマットのみ）
    if (custom_start_time && custom_start_time.trim() !== '' && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(custom_start_time)) {
      console.error('無効なcustom_start_time（更新）:', custom_start_time);
      return NextResponse.json(
        { error: 'custom_start_timeは HH:MM 形式で入力してください' }, 
        { status: 400 }
      );
    }

    if (custom_end_time && custom_end_time.trim() !== '' && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(custom_end_time)) {
      console.error('無効なcustom_end_time（更新）:', custom_end_time);
      return NextResponse.json(
        { error: 'custom_end_timeは HH:MM 形式で入力してください' }, 
        { status: 400 }
      );
    }

    // 時間の論理チェックは削除 - 柔軟な時間設定を許可

    // 更新データオブジェクトを構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (user_id !== undefined) updateData.user_id = user_id;
    if (store_id !== undefined) updateData.store_id = store_id;
    if (date !== undefined) updateData.date = date;
    if (finalTimeSlotId !== undefined) updateData.time_slot_id = finalTimeSlotId; // time_slot_idを使用
    if (custom_start_time !== undefined) updateData.custom_start_time = custom_start_time && custom_start_time.trim() !== '' ? custom_start_time : null;
    if (custom_end_time !== undefined) updateData.custom_end_time = custom_end_time && custom_end_time.trim() !== '' ? custom_end_time : null;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const { data, error } = await supabase
      .from('shifts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'シフトの更新に失敗しました' }, 
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' }, 
      { status: 500 }
    );
  }
}

// DELETE - シフト削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting shift:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Shift deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - 週単位シフト一括更新（確定機能）
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, week_start, week_end, status } = body;

    // バリデーション
    if (!store_id || !week_start || !status) {
      return NextResponse.json(
        { error: 'Required fields: store_id, week_start, status' },
        { status: 400 }
      );
    }

    if (!['draft', 'confirmed', 'completed'].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be "draft", "confirmed", or "completed"' },
        { status: 400 }
      );
    }

    // 週の開始日と終了日を計算
    const weekStartDate = new Date(week_start);
    let weekEndDate: Date;
    
    if (week_end) {
      weekEndDate = new Date(week_end);
    } else {
      weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6);
    }

    const weekStartStr = weekStartDate.toISOString().split('T')[0];
    const weekEndStr = weekEndDate.toISOString().split('T')[0];

    // 対象シフトを取得
    const { data: targetShifts, error: fetchError } = await supabase
      .from('shifts')
      .select('id, status')
      .eq('store_id', store_id)
      .gte('date', weekStartStr)
      .lte('date', weekEndStr);

    if (fetchError) {
      console.error('Error fetching target shifts:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!targetShifts || targetShifts.length === 0) {
      return NextResponse.json(
        { error: 'No shifts found for the specified period' },
        { status: 404 }
      );
    }

    // 一括更新実行
    const { data: updatedShifts, error: updateError } = await supabase
      .from('shifts')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('store_id', store_id)
      .gte('date', weekStartStr)
      .lte('date', weekEndStr)
      .select(`
        *,
        users(id, name, role, skill_level),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `);

    if (updateError) {
      console.error('Error updating shifts:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      data: updatedShifts,
      message: `Successfully updated ${updatedShifts.length} shifts to ${status}`,
      updated_count: updatedShifts.length
    }, { status: 200 });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 