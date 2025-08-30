import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - 代打応募者取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const emergencyRequestId = searchParams.get('emergency_request_id');
    const userId = searchParams.get('user_id');

    let query = supabase
      .from('emergency_volunteers')
      .select(`
        *,
        emergency_requests(
          id,
          date,
          reason,
          time_slot_id,
          stores(id, name)
        ),
        users(id, name, role, skill_level)
      `);

    // フィルタリング条件を適用
    if (emergencyRequestId) {
      query = query.eq('emergency_request_id', emergencyRequestId);
    }

    if (userId) {
      query = query.eq('user_id', userId);
    }

    query = query.order('responded_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching emergency volunteers:', error);
      return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'サーバー内部エラーが発生しました' }, { status: 500 });
  }
}

// POST - 代打応募
export async function POST(request: NextRequest) {
  try {
    console.log('=== Emergency Volunteers POST API 開始 ===');

    const body = await request.json();
    console.log('Request body:', body);

    const { emergency_request_id, user_id, notes } = body;

    // バリデーション
    if (!emergency_request_id || !user_id) {
      console.error('バリデーションエラー:', { emergency_request_id, user_id });
      return NextResponse.json(
        { error: '必須フィールドが不足しています: emergency_request_id, user_id' },
        { status: 400 }
      );
    }

    // 重複チェック（同じユーザーが同じ代打募集に複数応募することを防ぐ）
    console.log('重複チェック開始:', { emergency_request_id, user_id });
    const { data: existingVolunteer } = await supabase
      .from('emergency_volunteers')
      .select('id')
      .eq('emergency_request_id', emergency_request_id)
      .eq('user_id', user_id)
      .single();

    if (existingVolunteer) {
      console.log('重複応募検出:', existingVolunteer);
      return NextResponse.json(
        { error: 'User has already volunteered for this emergency request' },
        { status: 409 }
      );
    }

    // 代打募集がまだオープンか確認
    console.log('代打募集状態チェック開始:', emergency_request_id);
    const { data: emergencyRequest } = await supabase
      .from('emergency_requests')
      .select('status, date')
      .eq('id', emergency_request_id)
      .single();

    console.log('代打募集データ:', emergencyRequest);

    if (!emergencyRequest || emergencyRequest.status !== 'open') {
      console.log('代打募集が利用不可:', { emergencyRequest, status: emergencyRequest?.status });
      return NextResponse.json(
        { error: 'Emergency request is not available for volunteering' },
        { status: 400 }
      );
    }

    // 応募者が同じ日に他のシフトを持っていないかチェック
    console.log('シフト重複チェック開始:', { user_id, date: emergencyRequest.date });
    const { data: existingShifts } = await supabase
      .from('shifts')
      .select(`
        id,
        store_id,
        status,
        stores(id, name)
      `)
      .eq('user_id', user_id)
      .eq('date', emergencyRequest.date);

    console.log('既存シフト検索結果:', existingShifts);

    if (existingShifts && existingShifts.length > 0) {
      const existingShift = existingShifts[0];
      const storeData = existingShift.stores as { name?: string } | null;

      console.log('シフト重複検出:', { existingShift, storeData });

      // ステータスを日本語に変換
      const statusText = existingShift.status === 'confirmed' ? '確定済み' :
        existingShift.status === 'draft' ? '下書き' :
          existingShift.status === 'completed' ? '完了済み' : existingShift.status;

      return NextResponse.json(
        {
          error: `この代打募集には応募できません。${storeData?.name || '不明な店舗'}で同じ日に${statusText}のシフトがあります`,
          conflictingStore: storeData?.name || '不明な店舗',
          conflictingStoreId: existingShift.store_id,
          conflictType: existingShift.status
        },
        { status: 409 }
      );
    }

    console.log('データ挿入開始:', { emergency_request_id, user_id, notes: notes || null });

    const { data, error } = await supabase
      .from('emergency_volunteers')
      .insert({
        emergency_request_id,
        user_id,
        notes: notes || null
      })
      .select(`
        *,
        emergency_requests(
          id,
          date,
          reason,
          time_slot_id,
          stores(id, name)
        ),
        users(id, name, role, skill_level)
      `)
      .single();

    if (error) {
      console.error('データ挿入エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('データ挿入成功:', data);

    // メール送信処理
    try {
      // 応募者の情報を取得
      const { data: volunteerData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', user_id)
        .single();

      // 代打募集の詳細情報を取得
      const { data: requestData } = await supabase
        .from('emergency_requests')
        .select(`
          *,
          original_user:users!original_user_id(id, name, email),
          stores(id, name),
          time_slots(id, name, start_time, end_time)
        `)
        .eq('id', emergency_request_id)
        .single();

      // 店舗の管理者情報を取得
      const { data: storeData } = await supabase
        .from('stores')
        .select(`
          id,
          name,
          users!store_managers(
            id,
            name,
            email
          )
        `)
        .eq('id', requestData?.store_id)
        .single();

      // 店長への通知メール送信
      if (storeData?.users && requestData && volunteerData) {
        const managers = storeData.users;
        for (const manager of managers) {
          if (manager.email) {
            const managerEmailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'manager-emergency-volunteer-notification',
                userEmail: manager.email,
                userName: manager.name || '不明',
                details: {
                  volunteerName: volunteerData.name || '不明',
                  storeName: requestData.stores?.name || '不明',
                  date: requestData.date,
                  timeSlot: requestData.time_slots?.name || '不明',
                  startTime: requestData.time_slots?.start_time || '00:00',
                  endTime: requestData.time_slots?.end_time || '00:00',
                  originalStaffName: requestData.original_user?.name || '不明',
                  notes: notes || undefined
                }
              }),
            });

            if (!managerEmailResponse.ok) {
              console.warn('店長への代打応募通知メール送信に失敗しました');
            } else {
              console.log('店長への代打応募通知メールを送信しました');
            }
          }
        }
      }
    } catch (emailError) {
      console.error('メール送信エラー:', emailError);
      // メール送信失敗でも応募は成功とする
    }

    console.log('=== Emergency Volunteers POST API 終了 ===');

    return NextResponse.json({
      data,
      message: '代打募集への応募が完了しました'
    }, { status: 201 });
  } catch (error) {
    console.error('=== Emergency Volunteers POST API エラー ===');
    console.error('Error type:', typeof error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'サーバー内部エラーが発生しました' }, { status: 500 });
  }
}

// DELETE - 代打応募取り消し
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const emergencyRequestId = searchParams.get('emergency_request_id');
    const userId = searchParams.get('user_id');

    if (!id && (!emergencyRequestId || !userId)) {
      return NextResponse.json(
        { error: 'Either volunteer ID or both emergency_request_id and user_id are required' },
        { status: 400 }
      );
    }

    let query = supabase.from('emergency_volunteers').delete();

    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('emergency_request_id', emergencyRequestId).eq('user_id', userId);
    }

    const { error } = await query;

    if (error) {
      console.error('Error deleting emergency volunteer:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Emergency volunteer deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'サーバー内部エラーが発生しました' }, { status: 500 });
  }
} 