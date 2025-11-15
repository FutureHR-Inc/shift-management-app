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
      status = 'draft', // 作成するシフトのステータス
      custom_start_time, // カスタム開始時間（オプション）
      custom_end_time // カスタム終了時間（オプション）
    } = await request.json();

    console.log('Convert API called with:', { request_ids, status, custom_start_time, custom_end_time });

    if (!request_ids || !Array.isArray(request_ids) || request_ids.length === 0) {
      return NextResponse.json(
        { error: 'request_idsは必須です' },
        { status: 400 }
      );
    }

    // まず、IDに該当するシフト希望を全て取得（ステータス条件なし）
    const { data: allRequests, error: allFetchError } = await supabase
      .from('shift_requests')
      .select('*')
      .in('id', request_ids);

    console.log('All requests found:', allRequests);
    console.log('All fetch error:', allFetchError);

    // 対象のシフト希望を取得（ステータス条件を一時的に削除）
    const { data: shiftRequests, error: fetchError } = await supabase
      .from('shift_requests')
      .select('*')
      .in('id', request_ids);
      // .eq('status', 'submitted'); // 一時的にコメントアウト

    console.log('All requests found for conversion:', shiftRequests);
    console.log('Fetch error:', fetchError);

    if (fetchError) {
      console.error('Fetch shift requests error:', fetchError);
      return NextResponse.json(
        { error: 'シフト希望の取得に失敗しました' },
        { status: 500 }
      );
    }

    if (!shiftRequests || shiftRequests.length === 0) {
      return NextResponse.json(
        { error: '対象のシフト希望が見つかりません', debug: { request_ids, allRequests } },
        { status: 404 }
      );
    }

    const createdShifts = [];
    const errors = [];

    // 各シフト希望をシフトに変換
    for (const request of shiftRequests) {
      try {
        // 既存シフトの重複チェック（同じ店舗・同じ日付）
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

        // 異なる店舗での重複チェック（通常シフト）
        const { data: otherStoreShifts, error: otherStoreCheckError } = await supabase
          .from('shifts')
          .select('id, store_id, stores(id, name)')
          .eq('user_id', request.user_id)
          .eq('date', request.date)
          .neq('store_id', request.store_id); // 異なる店舗

        if (otherStoreCheckError) {
          console.error('異なる店舗シフト重複チェックエラー:', otherStoreCheckError);
          errors.push(`${request.user_id} - ${request.date}: 異なる店舗重複チェックに失敗しました`);
          continue;
        }

        if (otherStoreShifts && otherStoreShifts.length > 0) {
          const otherStoreNames = otherStoreShifts
            .map((shift: any) => {
              const store = Array.isArray(shift.stores) ? shift.stores[0] : shift.stores;
              return store?.name || '不明な店舗';
            })
            .join('、');
          errors.push(`${request.user_id} - ${request.date}: 他の店舗（${otherStoreNames}）で同日のシフトが設定されています`);
          continue;
        }

        // 異なる店舗での重複チェック（固定シフト）
        const dateObj = new Date(request.date);
        const dayOfWeek = dateObj.getDay(); // 0=日曜日, 1=月曜日, ..., 6=土曜日
        const timeSlotId = request.time_slot_id || null;

        if (timeSlotId) {
          const { data: existingFixedShifts, error: fixedShiftCheckError } = await supabase
            .from('fixed_shifts')
            .select('id, store_id, stores(id, name)')
            .eq('user_id', request.user_id)
            .eq('day_of_week', dayOfWeek)
            .eq('time_slot_id', timeSlotId)
            .eq('is_active', true)
            .neq('store_id', request.store_id); // 異なる店舗

          if (fixedShiftCheckError) {
            console.error('固定シフト重複チェックエラー:', fixedShiftCheckError);
            errors.push(`${request.user_id} - ${request.date}: 固定シフト重複チェックに失敗しました`);
            continue;
          }

          if (existingFixedShifts && existingFixedShifts.length > 0) {
            const otherStoreNames = existingFixedShifts
              .map((fs: any) => {
                const store = Array.isArray(fs.stores) ? fs.stores[0] : fs.stores;
                return store?.name || '不明な店舗';
              })
              .join('、');
            errors.push(`${request.user_id} - ${request.date}: 他の店舗（${otherStoreNames}）でこの曜日・時間帯の固定シフトが設定されています`);
            continue;
          }
        }

        // シフトを作成
        const shiftData = {
          user_id: request.user_id,
          store_id: request.store_id,
          date: request.date,
          time_slot_id: request.time_slot_id,
          custom_start_time: custom_start_time || request.preferred_start_time,
          custom_end_time: custom_end_time || request.preferred_end_time,
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