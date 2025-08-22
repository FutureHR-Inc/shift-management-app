import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 時間フォーマットを正規化する関数
function normalizeTimeFormat(timeString: string): string {
  if (!timeString) return '';

  // HH:MM:SS形式をHH:MM形式に変換（秒を削除）
  if (/^[0-2][0-9]:[0-5][0-9]:[0-5][0-9]$/.test(timeString)) {
    return timeString.substring(0, 5); // 最初の5文字（HH:MM）を取得
  }

  // 既にHH:MM形式の場合はそのまま返す
  if (/^[0-2][0-9]:[0-5][0-9]$/.test(timeString)) {
    return timeString;
  }

  // H:MM:SS形式をHH:MM形式に変換
  if (/^[0-9]:[0-5][0-9]:[0-5][0-9]$/.test(timeString)) {
    return '0' + timeString.substring(0, 4); // 0 + H:MM
  }

  // H:MM形式を HH:MM形式に変換
  if (/^[0-9]:[0-5][0-9]$/.test(timeString)) {
    return '0' + timeString;
  }

  return timeString; // その他はそのまま返す（バリデーションで弾かれる）
}

// GET - 時間帯一覧取得
export async function GET(request: NextRequest) {
  try {
    console.log('⏰ 時間帯データ取得開始');

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id') || searchParams.get('storeId');
    const currentUserId = searchParams.get('current_user_id');

    let query = supabase
      .from('time_slots')
      .select('*');

    // 企業フィルタリング（current_user_idが指定されている場合）
    if (currentUserId) {
      // current_user_idからcompany_idを取得
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', currentUserId)
        .single();

      if (userError || !userData?.company_id) {
        console.error('User company_id fetch error:', userError);
        return NextResponse.json(
          { success: false, error: 'ユーザーの企業情報が取得できません' },
          { status: 400 }
        );
      }

      // company_idでフィルタリング
      query = query.eq('company_id', userData.company_id);
      console.log('🏢 企業別時間帯取得:', userData.company_id);
    }

    // store_idが指定されている場合のみフィルタリング
    if (storeId) {
      query = query.eq('store_id', storeId);
      console.log('🏪 特定店舗の時間帯を取得:', storeId);
    } else {
      console.log('📋 時間帯を取得');
    }

    query = query.order('display_order');

    const { data, error } = await query;

    if (error) {
      console.error('Time slots fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch time slots' },
        { status: 500 }
      );
    }

    console.log('✅ 時間帯データ取得成功:', data?.length || 0, '件');

    return NextResponse.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Time slots API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - 新規時間帯作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, name, start_time, end_time, display_order } = body;

    // バリデーション
    if (!store_id || !name || !start_time || !end_time) {
      return NextResponse.json(
        { error: 'Required fields: store_id, name, start_time, end_time' },
        { status: 400 }
      );
    }

    // 時間フォーマットを正規化
    const normalizedStartTime = normalizeTimeFormat(start_time);
    const normalizedEndTime = normalizeTimeFormat(end_time);

    // 時間フォーマットの検証（HH:MM形式）
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(normalizedStartTime) || !timeRegex.test(normalizedEndTime)) {
      console.error('Time format validation failed:', {
        original: { start_time, end_time },
        normalized: { normalizedStartTime, normalizedEndTime }
      });
      return NextResponse.json(
        { error: `Invalid time format. Expected HH:MM format. Received: start_time="${start_time}", end_time="${end_time}"` },
        { status: 400 }
      );
    }

    // 開始時間 < 終了時間の検証
    const [startHour, startMin] = normalizedStartTime.split(':').map(Number);
    const [endHour, endMin] = normalizedEndTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes >= endMinutes) {
      return NextResponse.json(
        { error: 'Start time must be before end time' },
        { status: 400 }
      );
    }

    // IDを生成（店舗ID + 順序番号ベース）
    const id = `${store_id}_slot_${Date.now()}`;

    const { data, error } = await supabase
      .from('time_slots')
      .insert({
        id,
        store_id,
        name,
        start_time: normalizedStartTime,
        end_time: normalizedEndTime,
        display_order: display_order || 0
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating time slot:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - 時間帯更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, start_time, end_time, display_order } = body;

    if (!id) {
      return NextResponse.json({ error: 'Time slot ID is required' }, { status: 400 });
    }

    // updateData を最初に初期化
    const updateData: {
      updated_at: string;
      name?: string;
      start_time?: string;
      end_time?: string;
      display_order?: number;
    } = {
      updated_at: new Date().toISOString()
    };

    // バリデーション
    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    // 時間フィールドの処理（個別更新にも対応）
    let normalizedStartTime: string | undefined;
    let normalizedEndTime: string | undefined;

    if (start_time !== undefined) {
      normalizedStartTime = normalizeTimeFormat(start_time);
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(normalizedStartTime)) {
        console.error('Start time format validation failed:', {
          original: start_time,
          normalized: normalizedStartTime
        });
        return NextResponse.json(
          { error: `Invalid start time format. Expected HH:MM format. Received: "${start_time}"` },
          { status: 400 }
        );
      }
      updateData.start_time = normalizedStartTime;
    }

    if (end_time !== undefined) {
      normalizedEndTime = normalizeTimeFormat(end_time);
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(normalizedEndTime)) {
        console.error('End time format validation failed:', {
          original: end_time,
          normalized: normalizedEndTime
        });
        return NextResponse.json(
          { error: `Invalid end time format. Expected HH:MM format. Received: "${end_time}"` },
          { status: 400 }
        );
      }
      updateData.end_time = normalizedEndTime;
    }

    // 両方の時間が提供された場合、開始時間 < 終了時間の検証
    if (normalizedStartTime && normalizedEndTime) {
      const [startHour, startMin] = normalizedStartTime.split(':').map(Number);
      const [endHour, endMin] = normalizedEndTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes >= endMinutes) {
        return NextResponse.json(
          { error: 'Start time must be before end time' },
          { status: 400 }
        );
      }
    }

    // その他のフィールドを更新
    if (name !== undefined) updateData.name = name.trim();
    if (display_order !== undefined) updateData.display_order = display_order;

    const { data, error } = await supabase
      .from('time_slots')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating time slot:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - 時間帯削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Time slot ID is required' }, { status: 400 });
    }

    // この時間帯を削除しても安全かチェック
    // 注意：現在のシステムでは shifts は pattern_id を使用し、time_slot_id は存在しない
    // 将来的にtime_slot_idが追加された場合のために、エラーハンドリングを改善
    try {
      // 削除対象の時間帯の詳細を取得
      const { data: timeSlotInfo, error: timeSlotError } = await supabase
        .from('time_slots')
        .select('name, start_time, end_time')
        .eq('id', id)
        .single();

      if (timeSlotError) {
        console.error('Error fetching time slot info:', timeSlotError);
        return NextResponse.json({ error: 'Time slot not found' }, { status: 404 });
      }

      // 現在は直接的なチェックはスキップ（shiftsテーブルにtime_slot_idカラムが存在しないため）
      // 将来的な拡張のためのプレースホルダー
      console.log(`Attempting to delete time slot: ${timeSlotInfo.name} (${timeSlotInfo.start_time}-${timeSlotInfo.end_time})`);

    } catch (error) {
      console.error('Error checking time slot deletion safety:', error);
      // チェックに失敗した場合でも削除を続行（警告として扱う）
    }

    const { error } = await supabase
      .from('time_slots')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting time slot:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Time slot deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 