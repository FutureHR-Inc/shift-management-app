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

    let query = supabase
      .from('shift_requests')
      .select(`
        *,
        users(id, name, email, role, skill_level),
        stores(id, name, company_id),
        time_slots(id, name, start_time, end_time)
      `)
      .order('date', { ascending: true })
      .order('priority', { ascending: true });

    // 🔧 企業分離: 店舗の企業IDでフィルタリング
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

    console.log('🔍 [SHIFT REQUESTS API] 結果:', {
      requestCount: data?.length || 0,
      storeCompanyIds: data?.map(r => ({ storeName: r.stores?.name, companyId: r.stores?.company_id })) || []
    });

    return NextResponse.json({ data: data || [] });
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

      // 完全に同一のリクエストを除外
      const filteredRequests = requests.filter((newReq: any) => {
        return !existingRequests.some((existing: any) => {
          // 各フィールドを個別に比較（null値の正規化）
          const dateMatch = existing.date === newReq.date;
          const timeSlotMatch = (existing.time_slot_id || null) === (newReq.time_slot_id || null);
          const startTimeMatch = (existing.preferred_start_time || null) === (newReq.preferred_start_time || null);
          const endTimeMatch = (existing.preferred_end_time || null) === (newReq.preferred_end_time || null);
          const priorityMatch = existing.priority === newReq.priority;
          const notesMatch = (existing.notes || '') === (newReq.notes || '');
          const isSubmitted = existing.status === 'submitted';

          const isExactMatch = dateMatch && timeSlotMatch && startTimeMatch &&
            endTimeMatch && priorityMatch && notesMatch && isSubmitted;

          return isExactMatch;
        });
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

    // 新しい希望を一括挿入
    const insertData = requests.map((req: any) => ({
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