import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 現在のユーザーIDから企業IDを取得するヘルパー関数
async function getCurrentUserCompanyId(userId: string): Promise<string | null> {
  console.log('🔍 [SHIFT REQUESTS API] getCurrentUserCompanyId - userId:', userId);

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, company_id')
    .eq('id', userId)
    .single();

  console.log('🔍 [SHIFT REQUESTS API] getCurrentUserCompanyId - result:', { data, error });

  if (error || !data) {
    console.log('🔍 [SHIFT REQUESTS API] getCurrentUserCompanyId - returning null due to error or no data');
    return null;
  }

  console.log('🔍 [SHIFT REQUESTS API] getCurrentUserCompanyId - returning company_id:', data.company_id);
  return data.company_id;
}

// 🔧 企業分離対応: シフト希望一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const storeId = searchParams.get('store_id');
    const submissionPeriod = searchParams.get('submission_period');
    const status = searchParams.get('status');
    const currentUserId = searchParams.get('current_user_id');

    console.log('🔍 [SHIFT REQUESTS API] GET request params:', { userId, storeId, submissionPeriod, status, currentUserId });

    // 企業IDによるフィルタリングのためのユーザーIDを取得
    let companyIdFilter: string | null = null;

    if (currentUserId) {
      companyIdFilter = await getCurrentUserCompanyId(currentUserId);
      console.log('🔍 [SHIFT REQUESTS API] companyIdFilter:', companyIdFilter);
    }

    // 🔧 企業分離: 店舗の企業IDでフィルタリング
    // stores!inner を使用して、店舗が存在しないシフト希望を除外
    let query = supabase
      .from('shift_requests')
      .select(`
        *,
        users(id, name, email, role, skill_level),
        stores!inner(id, name, company_id),
        time_slots(id, name, start_time, end_time)
      `)
      .order('date', { ascending: true })
      .order('priority', { ascending: true });

    // 企業フィルタリングを適用
    if (currentUserId) {
      if (companyIdFilter) {
        console.log('🔍 [SHIFT REQUESTS API] 新企業フィルタリング: stores.company_id =', companyIdFilter);
        query = query.eq('stores.company_id', companyIdFilter);
      } else {
        // ログインユーザーがcompany_idを持たない場合は、既存企業のシフト希望のみ表示
        console.log('🔍 [SHIFT REQUESTS API] 既存企業フィルタリング: stores.company_id IS NULL');
        query = query.is('stores.company_id', null);
      }
    } else {
      console.log('🔍 [SHIFT REQUESTS API] current_user_idが未指定、全シフト希望表示');
      // current_user_idが指定されていない場合は全シフト希望（後方互換性）
    }

    // フィルタリング条件
    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    if (submissionPeriod) {
      query = query.eq('submission_period', submissionPeriod);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Shift requests fetch error:', error);
      return NextResponse.json(
        { error: 'シフト希望の取得に失敗しました' },
        { status: 500 }
      );
    }

    // デバッグログ: 取得したデータの詳細を確認
    const requestsData = data || [];
    console.log('🔍 [SHIFT REQUESTS API] 結果:', {
      requestCount: requestsData.length,
      statusFilter: status,
      companyIdFilter: companyIdFilter,
      storeCompanyIds: [...new Set(requestsData.map(r => r.stores?.company_id))],
      statusBreakdown: requestsData.reduce((acc: any, r: any) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {}),
      // 企業フィルタリングが正しく機能しているか確認
      requests: requestsData.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        user_name: r.users?.name,
        store_id: r.store_id,
        store_name: r.stores?.name,
        store_company_id: r.stores?.company_id,
        status: r.status,
        date: r.date
      }))
    });

    // 企業フィルタリングが正しく機能しているか検証
    if (companyIdFilter && requestsData.length > 0) {
      const wrongCompanyRequests = requestsData.filter((r: any) => {
        // storesが配列の場合とオブジェクトの場合を考慮
        const store = Array.isArray(r.stores) ? r.stores[0] : r.stores;
        const storeCompanyId = store?.company_id;
        return storeCompanyId !== companyIdFilter && storeCompanyId !== null;
      });
      
      if (wrongCompanyRequests.length > 0) {
        console.error('⚠️ [SHIFT REQUESTS API] 企業フィルタリングエラー: 他の企業のデータが含まれています', {
          expectedCompanyId: companyIdFilter,
          wrongRequests: wrongCompanyRequests.map((r: any) => {
            const store = Array.isArray(r.stores) ? r.stores[0] : r.stores;
            return {
              id: r.id,
              store_name: store?.name,
              store_company_id: store?.company_id
            };
          })
        });
      }
      
      // storesがundefinedのレコードを検出
      const missingStoreRequests = requestsData.filter((r: any) => {
        const store = Array.isArray(r.stores) ? r.stores[0] : r.stores;
        return !store || !store.company_id;
      });
      
      if (missingStoreRequests.length > 0) {
        console.error('⚠️ [SHIFT REQUESTS API] 店舗情報が取得できていないシフト希望があります', {
          missingStoreCount: missingStoreRequests.length,
          missingStoreRequests: missingStoreRequests.map((r: any) => ({
            id: r.id,
            store_id: r.store_id,
            stores: r.stores
          }))
        });
      }
    }

    // status=submitted でフィルタリングしている場合、converted_to_shift が含まれていないか検証
    if (status === 'submitted' && requestsData.length > 0) {
      const convertedRequests = requestsData.filter((r: any) => r.status === 'converted_to_shift');
      if (convertedRequests.length > 0) {
        console.error('⚠️ [SHIFT REQUESTS API] ステータスフィルタリングエラー: converted_to_shift が含まれています', {
          convertedCount: convertedRequests.length,
          convertedRequests: convertedRequests.map((r: any) => ({
            id: r.id,
            user_name: r.users?.name,
            status: r.status
          }))
        });
      }
    }

    return NextResponse.json({ data: requestsData });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// POST - シフト希望提出
export async function POST(request: NextRequest) {
  try {
    const {
      user_id,
      store_id,
      submission_period,
      requests, // 複数日分のリクエスト配列
      is_incremental = false // 差分更新フラグ
    } = await request.json();

    // 必須フィールドの検証
    if (!user_id || !store_id || !submission_period || !requests || !Array.isArray(requests)) {
      return NextResponse.json(
        { error: 'user_id, store_id, submission_period, requestsは必須です' },
        { status: 400 }
      );
    }

    // 差分更新でない場合は従来通り全削除→全挿入
    if (!is_incremental) {
      // 既存の提出を削除（再提出の場合）
      const { error: deleteError } = await supabase
        .from('shift_requests')
        .delete()
        .eq('user_id', user_id)
        .eq('store_id', store_id)
        .eq('submission_period', submission_period);

      if (deleteError) {
        console.error('Delete existing requests error:', deleteError);
        return NextResponse.json(
          { error: '既存の希望の削除に失敗しました' },
          { status: 500 }
        );
      }
    } else {
      // 差分更新の場合は重複チェックのみ実行
      const existingRequestsResponse = await supabase
        .from('shift_requests')
        .select('*')
        .eq('user_id', user_id)
        .eq('store_id', store_id)
        .eq('submission_period', submission_period);

      if (existingRequestsResponse.error) {
        console.error('Error checking existing requests:', existingRequestsResponse.error);
        return NextResponse.json(
          { error: '既存希望の確認に失敗しました' },
          { status: 500 }
        );
      }

      const existingRequests = existingRequestsResponse.data || [];

      // 既に提出済みの日付のシフト希望を完全に除外（同じ日付に複数のシフト希望があっても全て除外）
      // converted_to_shift以外の全てのステータス（submitted, approved, rejected）をチェック
      const filteredRequests = requests.filter((newReq: any) => {
        // 既に提出済みの日付のシフトは完全に除外
        const hasSubmittedForDate = existingRequests.some((existing: any) => 
          existing.date === newReq.date && 
          existing.status !== 'converted_to_shift'
        );
        if (hasSubmittedForDate) {
          console.log(`⚠️ [API] 日付 ${newReq.date} は既に提出済みのため除外します`);
          return false;
        }

        // 完全に同一のリクエストを除外
        // converted_to_shift以外の全てのステータスをチェック
        const isExactMatch = existingRequests.some((existing: any) => {
          // 各フィールドを個別に比較（null値の正規化）
          const dateMatch = existing.date === newReq.date;
          const timeSlotMatch = (existing.time_slot_id || null) === (newReq.time_slot_id || null);
          const startTimeMatch = (existing.preferred_start_time || null) === (newReq.preferred_start_time || null);
          const endTimeMatch = (existing.preferred_end_time || null) === (newReq.preferred_end_time || null);
          const priorityMatch = existing.priority === newReq.priority;
          const notesMatch = (existing.notes || '') === (newReq.notes || '');
          const isNotConverted = existing.status !== 'converted_to_shift';

          return dateMatch && timeSlotMatch && startTimeMatch &&
            endTimeMatch && priorityMatch && notesMatch && isNotConverted;
        });

        if (isExactMatch) {
          console.log(`⚠️ [API] 完全一致する既存のシフト希望があるため除外します: ${newReq.date}`);
          return false;
        }

        return true;
      });

      if (filteredRequests.length === 0) {
        return NextResponse.json(
          { error: '新規追加分がありません' },
          { status: 400 }
        );
      }

      // フィルタリング後のリクエストに置き換え
      requests.splice(0, requests.length, ...filteredRequests);
    }

    // 異なる店舗での重複チェック（各リクエストについて）
    const validRequests = [];
    const duplicateErrors = [];

    for (const req of requests) {
      try {
        // 1. 異なる店舗での通常シフト重複チェック
        const { data: existingShifts, error: shiftCheckError } = await supabase
          .from('shifts')
          .select('id, store_id, stores(id, name)')
          .eq('user_id', user_id)
          .eq('date', req.date)
          .neq('store_id', store_id); // 異なる店舗

        if (shiftCheckError) {
          console.error('シフト重複チェックエラー:', shiftCheckError);
          duplicateErrors.push(`${req.date}: 重複チェックに失敗しました`);
          continue;
        }

        if (existingShifts && existingShifts.length > 0) {
          const otherStoreNames = existingShifts
            .map((shift: any) => {
              const store = Array.isArray(shift.stores) ? shift.stores[0] : shift.stores;
              return store?.name || '不明な店舗';
            })
            .join('、');
          duplicateErrors.push(`${req.date}: 他の店舗（${otherStoreNames}）で同日のシフトが設定されています`);
          continue;
        }

        // 2. 異なる店舗での固定シフト重複チェック
        const dateObj = new Date(req.date);
        const dayOfWeek = dateObj.getDay(); // 0=日曜日, 1=月曜日, ..., 6=土曜日
        const timeSlotId = req.time_slot_id || null;

        if (timeSlotId) {
          const { data: existingFixedShifts, error: fixedShiftCheckError } = await supabase
            .from('fixed_shifts')
            .select('id, store_id, stores(id, name)')
            .eq('user_id', user_id)
            .eq('day_of_week', dayOfWeek)
            .eq('time_slot_id', timeSlotId)
            .eq('is_active', true)
            .neq('store_id', store_id); // 異なる店舗

          if (fixedShiftCheckError) {
            console.error('固定シフト重複チェックエラー:', fixedShiftCheckError);
            duplicateErrors.push(`${req.date}: 固定シフト重複チェックに失敗しました`);
            continue;
          }

          if (existingFixedShifts && existingFixedShifts.length > 0) {
            const otherStoreNames = existingFixedShifts
              .map((fs: any) => {
                const store = Array.isArray(fs.stores) ? fs.stores[0] : fs.stores;
                return store?.name || '不明な店舗';
              })
              .join('、');
            duplicateErrors.push(`${req.date}: 他の店舗（${otherStoreNames}）でこの曜日・時間帯の固定シフトが設定されています`);
            continue;
          }
        }

        // 重複がない場合は有効なリクエストとして追加
        validRequests.push(req);
      } catch (error) {
        console.error(`リクエスト ${req.date} の重複チェックエラー:`, error);
        duplicateErrors.push(`${req.date}: 重複チェック中にエラーが発生しました`);
      }
    }

    // 重複エラーがある場合はエラーを返す
    if (duplicateErrors.length > 0) {
      return NextResponse.json(
        { 
          error: '異なる店舗での重複シフトが検出されました',
          details: duplicateErrors
        },
        { status: 409 }
      );
    }

    // 有効なリクエストがない場合
    if (validRequests.length === 0) {
      return NextResponse.json(
        { error: '提出可能なシフト希望がありません' },
        { status: 400 }
      );
    }

    // 新しい希望を一括挿入
    const insertData = validRequests.map((req: any) => ({
      user_id,
      store_id,
      submission_period,
      date: req.date,
      time_slot_id: req.time_slot_id || null,
      preferred_start_time: req.preferred_start_time || null,
      preferred_end_time: req.preferred_end_time || null,
      priority: req.priority || 2,
      notes: req.notes || null,
      status: 'submitted',
      submitted_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('shift_requests')
      .insert(insertData)
      .select();

    if (error) {
      console.error('Insert shift requests error:', error);
      return NextResponse.json(
        { error: 'シフト希望の提出に失敗しました' },
        { status: 500 }
      );
    }

    // メール送信処理
    try {
      // ユーザー情報を取得
      const { data: userData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', user_id)
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
        .eq('id', store_id)
        .single();

      // スタッフへの確認メール送信
      if (userData?.email) {
        const staffEmailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'shift-request-confirmation',
            userEmail: userData.email,
            userName: userData.name || '不明',
            submissionPeriod: submission_period,
            submittedRequestsCount: data.length
          }),
        });

        if (!staffEmailResponse.ok) {
          console.warn('スタッフへのシフト希望提出確認メール送信に失敗しましたが、提出は完了しました');
        } else {
          console.log('スタッフへのシフト希望提出確認メールを送信しました');
        }
      }

      // 店長への通知メール送信
      if (storeData?.users) {
        const managers = storeData.users;
        for (const manager of managers) {
          if (manager.email) {
            const managerEmailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'manager-shift-request-notification',
                userEmail: manager.email,
                userName: manager.name || '不明',
                staffName: userData?.name || '不明',
                submissionPeriod: submission_period,
                submittedRequestsCount: data.length
              }),
            });

            if (!managerEmailResponse.ok) {
              console.warn('店長へのシフト希望提出通知メール送信に失敗しました');
            } else {
              console.log('店長へのシフト希望提出通知メールを送信しました');
            }
          }
        }
      }
    } catch (emailError) {
      console.error('メール送信エラー:', emailError);
      // メール送信失敗でも提出は成功とする
    }

    return NextResponse.json({
      data,
      message: is_incremental
        ? `${data.length}件のシフト希望を追加しました`
        : `${data.length}件のシフト希望を提出しました`
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// PUT - シフト希望更新
export async function PUT(request: NextRequest) {
  try {
    const {
      id,
      time_slot_id,
      preferred_start_time,
      preferred_end_time,
      priority,
      notes,
      status
    } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'idは必須です' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (time_slot_id !== undefined) updateData.time_slot_id = time_slot_id;
    if (preferred_start_time !== undefined) updateData.preferred_start_time = preferred_start_time;
    if (preferred_end_time !== undefined) updateData.preferred_end_time = preferred_end_time;
    if (priority !== undefined) updateData.priority = priority;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    const { data, error } = await supabase
      .from('shift_requests')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        users(id, name, email, role, skill_level),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .single();

    if (error) {
      console.error('Update shift request error:', error);
      return NextResponse.json(
        { error: 'シフト希望の更新に失敗しました' },
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

// DELETE - シフト希望削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('user_id');
    const submissionPeriod = searchParams.get('submission_period');

    if (id) {
      // 個別削除
      const { error } = await supabase
        .from('shift_requests')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Delete shift request error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ message: 'シフト希望を削除しました' });
    } else if (userId && submissionPeriod) {
      // 期間一括削除
      const { error } = await supabase
        .from('shift_requests')
        .delete()
        .eq('user_id', userId)
        .eq('submission_period', submissionPeriod);

      if (error) {
        console.error('Delete shift requests error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ message: '期間のシフト希望を削除しました' });
    } else {
      return NextResponse.json({ error: 'IDまたはuser_id+submission_periodが必要です' }, { status: 400 });
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'サーバー内部エラーが発生しました' }, { status: 500 });
  }
} 