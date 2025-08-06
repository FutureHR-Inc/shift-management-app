import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface ShiftRequestWithUser {
  id: string;
  user_id: string;
  store_id: string;
  date: string;
  time_slot_id: string;
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  priority: number;
  notes: string | null;
  status: string;
  users?: {
    id: string;
    name: string;
    skill_level: 'training' | 'regular' | 'veteran';
  };
}

// POST - シフト希望からシフトへの一括変換
export async function POST(request: NextRequest) {
  try {
    const {
      request_ids, // 変換対象のshift_request ID配列
      status = 'draft' // 作成するシフトのステータス
    } = await request.json();

    if (!request_ids || !Array.isArray(request_ids) || request_ids.length === 0) {
      return NextResponse.json(
        { error: 'request_idsは必須です' },
        { status: 400 }
      );
    }

    // 対象のシフト希望を取得
    const { data: shiftRequests, error: fetchError } = await supabase
      .from('shift_requests')
      .select('*')
      .in('id', request_ids)
      .eq('status', 'submitted');

    if (fetchError) {
      console.error('Fetch shift requests error:', fetchError);
      return NextResponse.json(
        { error: 'シフト希望の取得に失敗しました' },
        { status: 500 }
      );
    }

    if (!shiftRequests || shiftRequests.length === 0) {
      return NextResponse.json(
        { error: '対象のシフト希望が見つかりません' },
        { status: 404 }
      );
    }

    const createdShifts = [];
    const errors = [];

    // 各シフト希望をシフトに変換
    for (const request of shiftRequests) {
      try {
        // 既存シフトの重複チェック
        const { data: existingShifts, error: checkError } = await supabase
          .from('shifts')
          .select('id')
          .eq('user_id', request.user_id)
          .eq('store_id', request.store_id)
          .eq('date', request.date);

        if (checkError) {
          errors.push(`${request.user_id} - ${request.date}: 重複チェックエラー`);
          continue;
        }

        if (existingShifts && existingShifts.length > 0) {
          errors.push(`${request.user_id} - ${request.date}: 既にシフトが存在します`);
          continue;
        }

        // シフトを作成
        const shiftData = {
          user_id: request.user_id,
          store_id: request.store_id,
          date: request.date,
          time_slot_id: request.time_slot_id,
          custom_start_time: request.preferred_start_time,
          custom_end_time: request.preferred_end_time,
          status,
          notes: request.notes
        };

        const { data: newShift, error: createError } = await supabase
          .from('shifts')
          .insert(shiftData)
          .select()
          .single();

        if (createError) {
          errors.push(`${request.user_id} - ${request.date}: シフト作成エラー`);
          console.error('Create shift error:', createError);
          continue;
        }

        // シフト希望のステータスを更新
        const { error: updateError } = await supabase
          .from('shift_requests')
          .update({ status: 'converted_to_shift' })
          .eq('id', request.id);

        if (updateError) {
          console.error('Update request status error:', updateError);
          // シフトは作成済みなので、エラーログのみ
        }

        createdShifts.push(newShift);

      } catch (error) {
        errors.push(`${request.user_id} - ${request.date}: 予期しないエラー`);
        console.error('Convert shift error:', error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${createdShifts.length}件のシフトを作成しました`,
      created_count: createdShifts.length,
      error_count: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      data: createdShifts
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// POST - 優先度に基づく自動シフト作成
export async function PATCH(request: NextRequest) {
  try {
    const {
      store_id,
      submission_period,
      auto_assign_strategy = 'priority' // 'priority' | 'fair' | 'random'
    } = await request.json();

    if (!store_id || !submission_period) {
      return NextResponse.json(
        { error: 'store_id, submission_periodは必須です' },
        { status: 400 }
      );
    }

    // 提出されたシフト希望を取得
    const { data: allRequests, error: fetchError } = await supabase
      .from('shift_requests')
      .select(`
        *,
        users(id, name, skill_level)
      `)
      .eq('store_id', store_id)
      .eq('submission_period', submission_period)
      .eq('status', 'submitted')
      .order('date', { ascending: true })
      .order('priority', { ascending: true });

    if (fetchError) {
      console.error('Fetch requests error:', fetchError);
      return NextResponse.json(
        { error: 'シフト希望の取得に失敗しました' },
        { status: 500 }
      );
    }

    if (!allRequests || allRequests.length === 0) {
      return NextResponse.json(
        { message: '対象のシフト希望がありません' },
        { status: 200 }
      );
    }

    // 店舗の必要スタッフ数を取得
    const { data: storeData, error: storeError } = await supabase
      .from('stores')
      .select('required_staff')
      .eq('id', store_id)
      .single();

    if (storeError || !storeData) {
      return NextResponse.json(
        { error: '店舗情報の取得に失敗しました' },
        { status: 500 }
      );
    }

    const requiredStaff = storeData.required_staff || {};
    const createdShifts = [];
    const errors = [];

    // 日付・時間帯ごとにグループ化
    const groupedRequests = new Map();
    
    allRequests.forEach(request => {
      const key = `${request.date}-${request.time_slot_id}`;
      if (!groupedRequests.has(key)) {
        groupedRequests.set(key, []);
      }
      groupedRequests.get(key).push(request);
    });

    // 各グループで自動割り当て
    for (const [key, requests] of groupedRequests) {
      const [date, timeSlotId] = key.split('-');
      const requiredCount = requiredStaff[timeSlotId] || 1;

      // 優先度順でソート
      const sortedRequests = (requests as ShiftRequestWithUser[]).sort((a: ShiftRequestWithUser, b: ShiftRequestWithUser) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // 同じ優先度の場合は経験値（skill_level）を考慮
        const skillOrder: Record<string, number> = { 'veteran': 3, 'regular': 2, 'training': 1 };
        const aSkill = skillOrder[a.users?.skill_level || 'training'] || 1;
        const bSkill = skillOrder[b.users?.skill_level || 'training'] || 1;
        return bSkill - aSkill;
      });

      // 必要数まで選択
      const selectedRequests = sortedRequests.slice(0, requiredCount);

      // シフトを作成
      for (const request of selectedRequests) {
        try {
          const shiftData = {
            user_id: request.user_id,
            store_id: request.store_id,
            date: request.date,
            time_slot_id: request.time_slot_id,
            custom_start_time: request.preferred_start_time,
            custom_end_time: request.preferred_end_time,
            status: 'draft',
            notes: `${request.notes ? request.notes + ' | ' : ''}優先度${request.priority}で自動作成`
          };

          const { data: newShift, error: createError } = await supabase
            .from('shifts')
            .insert(shiftData)
            .select()
            .single();

          if (createError) {
            errors.push(`${request.user_id} - ${request.date}: ${createError.message}`);
            continue;
          }

          // シフト希望のステータスを更新
          await supabase
            .from('shift_requests')
            .update({ status: 'converted_to_shift' })
            .eq('id', request.id);

          createdShifts.push(newShift);

        } catch (error) {
          errors.push(`${request.user_id} - ${request.date}: 予期しないエラー`);
          console.error('Auto assign error:', error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `自動割り当てで${createdShifts.length}件のシフトを作成しました`,
      created_count: createdShifts.length,
      error_count: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      data: createdShifts
    });

  } catch (error) {
    console.error('Auto assign API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
} 