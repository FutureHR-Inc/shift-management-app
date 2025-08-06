import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: 緊急募集リクエスト一覧取得
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // パラメータ名の統一：フロントエンドの呼び出しに合わせる
  const storeId = searchParams.get('store_id') || searchParams.get('storeId');
  const startDate = searchParams.get('date_from') || searchParams.get('startDate');
  const endDate = searchParams.get('date_to') || searchParams.get('endDate');
  const status = searchParams.get('status');
  const id = searchParams.get('id'); // 単一リクエスト取得用

  try {
    // まず基本的なクエリから開始
    let query = supabase
      .from('emergency_requests')
      .select(`
        *,
        users(id, name, email, phone),
        stores(id, name),
        emergency_volunteers(
          id,
          user_id,
          responded_at,
          users(id, name, email, phone)
        )
      `);

    // 単一リクエスト取得の場合
    if (id) {
      query = query.eq('id', id);
    }

    // フィルタリング条件を適用
    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: '緊急募集データの取得に失敗しました', details: error.message }, 
        { status: 500 }
      );
    }

    // データ処理: time_slot_idがある場合は別途time_slotsを取得
    if (data && data.length > 0) {
      for (const request of data) {
        if (request.time_slot_id) {
          try {
            const { data: timeSlotData } = await supabase
              .from('time_slots')
              .select('id, name, start_time, end_time')
              .eq('id', request.time_slot_id)
              .single();
            
            if (timeSlotData) {
              request.time_slots = timeSlotData;
            }
          } catch {
            console.warn('Time slot data not found for:', request.time_slot_id);
            // time_slotが見つからない場合は無視して続行
          }
        }
      }
    }

    // 単一リクエスト取得の場合は最初の要素を返す
    if (id) {
      return NextResponse.json({ data: data?.[0] || null });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}

// POST: 緊急募集リクエスト作成
export async function POST(request: Request) {
  try {
    const {
      original_user_id,
      store_id,
      date,
      shift_pattern_id, // 旧フィールド（移行期間）
      time_slot_id, // 新フィールド
      reason
    } = await request.json();

    // 必須フィールドの検証
    if (!original_user_id || !store_id || !date || !reason) {
      return NextResponse.json(
        { error: 'original_user_id, store_id, date, reasonは必須です' }, 
        { status: 400 }
      );
    }

    // time_slot_id または shift_pattern_id のいずれかが必要
    const finalTimeSlotId = time_slot_id || shift_pattern_id;
    if (!finalTimeSlotId) {
      return NextResponse.json(
        { error: 'time_slot_idまたはshift_pattern_idが必要です' }, 
        { status: 400 }
      );
    }

    // 既存の緊急募集リクエストの重複チェック
    const { data: existingRequest } = await supabase
      .from('emergency_requests')
      .select('id')
      .eq('original_user_id', original_user_id)
      .eq('store_id', store_id)
      .eq('date', date)
      .eq('status', 'open')
      .limit(1);

    if (existingRequest && existingRequest.length > 0) {
      return NextResponse.json(
        { error: 'この日時にはすでに緊急募集リクエストが存在します' }, 
        { status: 409 }
      );
    }

    // データ挿入
    const insertData: Record<string, unknown> = {
      original_user_id,
      store_id,
      date,
      reason: reason.trim(),
      status: 'open'
    };

    // time_slot_id を優先使用
    if (time_slot_id) {
      insertData.time_slot_id = time_slot_id;
    } else {
      insertData.shift_pattern_id = shift_pattern_id;
    }

    const { data, error } = await supabase
      .from('emergency_requests')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: '緊急募集リクエストの作成に失敗しました' }, 
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

// PUT: 緊急募集リクエスト更新
export async function PUT(request: Request) {
  try {
    const { id, ...updateData } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'idは必須です' }, 
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('emergency_requests')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        users(id, name, email, phone),
        stores(id, name),
        time_slots(id, name, start_time, end_time),
        emergency_volunteers(
          id,
          user_id,
          status,
          applied_at,
          users(id, name, email, phone)
        )
      `)
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: '緊急募集リクエストの更新に失敗しました' }, 
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

// PATCH: 緊急募集応募者の承認・却下
export async function PATCH(request: Request) {
  try {
    const { emergency_request_id, volunteer_id, action } = await request.json();

    if (!emergency_request_id || !volunteer_id || !action) {
      return NextResponse.json(
        { error: 'emergency_request_id, volunteer_id, actionは必須です' }, 
        { status: 400 }
      );
    }

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'actionは accept または reject である必要があります' }, 
        { status: 400 }
      );
    }

    // 応募データを取得
    const { data: volunteer, error: volunteerError } = await supabase
      .from('emergency_volunteers')
      .select(`
        *,
        emergency_requests(*)
      `)
      .eq('id', volunteer_id)
      .eq('emergency_request_id', emergency_request_id)
      .single();

    if (volunteerError || !volunteer) {
      return NextResponse.json(
        { error: '応募データが見つかりません' }, 
        { status: 404 }
      );
    }

    const emergencyRequest = volunteer.emergency_requests as Record<string, unknown>;

    if (action === 'accept') {
      // 重複シフトチェック
      const { data: existingShifts } = await supabase
        .from('shifts')
        .select(`
          id,
          date,
          status,
          users(name),
          stores(name)
        `)
        .eq('user_id', volunteer.user_id)
        .eq('date', emergencyRequest.date);

      if (existingShifts && existingShifts.length > 0) {
        return NextResponse.json(
          { error: 'この日にすでに他のシフトが存在します' }, 
          { status: 409 }
        );
      }

      // 承認処理：新しいシフトを作成
      const insertData: Record<string, unknown> = {
        user_id: volunteer.user_id,
        store_id: emergencyRequest.store_id,
        date: emergencyRequest.date,
        status: 'confirmed' as const,
        notes: '代打承認により自動作成'
      };

      // time_slot_id を優先使用
      if (emergencyRequest.time_slot_id) {
        insertData.time_slot_id = emergencyRequest.time_slot_id;
      } else if (emergencyRequest.shift_pattern_id) {
        insertData.shift_pattern_id = emergencyRequest.shift_pattern_id;
      }

      const { error: shiftCreateError } = await supabase
        .from('shifts')
        .insert(insertData);

      if (shiftCreateError) {
        console.error('Shift creation error:', shiftCreateError);
        return NextResponse.json(
          { error: 'シフトの作成に失敗しました' }, 
          { status: 500 }
        );
      }

      // 緊急募集リクエストのステータスを更新
      await supabase
        .from('emergency_requests')
        .update({ status: 'filled' })
        .eq('id', emergency_request_id);
    }

    // 応募ステータスを更新
    const { error: updateError } = await supabase
      .from('emergency_volunteers')
      .update({ status: action === 'accept' ? 'accepted' : 'rejected' })
      .eq('id', volunteer_id);

    if (updateError) {
      console.error('Volunteer update error:', updateError);
      return NextResponse.json(
        { error: '応募ステータスの更新に失敗しました' }, 
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: action === 'accept' ? '承認が完了しました' : '却下が完了しました' 
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' }, 
      { status: 500 }
    );
  }
}

// DELETE - 代打募集削除
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Emergency request ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('emergency_requests')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting emergency request:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Emergency request deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 