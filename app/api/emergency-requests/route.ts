import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// レスポンスヘッダーの設定
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 現在のユーザーの企業IDを取得するヘルパー関数
async function getCurrentUserCompanyId(userId: string): Promise<string | null> {
  try {
    const { data: userData, error } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (error || !userData) {
      console.error('User not found:', error);
      return null;
    }

    return userData.company_id;
  } catch (error) {
    console.error('Error fetching user company:', error);
    return null;
  }
}

// GET: 緊急募集リクエスト一覧取得
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id') || searchParams.get('storeId');
    const startDate = searchParams.get('date_from') || searchParams.get('startDate');
    const endDate = searchParams.get('date_to') || searchParams.get('endDate');
    const status = searchParams.get('status');
    const id = searchParams.get('id');
    const currentUserId = searchParams.get('current_user_id');

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'current_user_idは必須です' },
        { status: 400, headers: corsHeaders }
      );
    }

    const companyIdFilter = await getCurrentUserCompanyId(currentUserId);
    console.log('Company ID Filter:', companyIdFilter);

    let query = supabase
      .from('emergency_requests')
      .select(`
        *,
        original_user:users!original_user_id(id, name, email, phone, company_id),
        stores!inner(id, name, company_id),
        emergency_volunteers(
          id,
          user_id,
          responded_at,
          notes,
          users(id, name, email, phone)
        ),
        time_slots(id, name, start_time, end_time)
      `);

    // 現在の日付を取得（YYYY-MM-DD形式）
    const today = new Date().toISOString().split('T')[0];
    console.log('Filtering dates from:', today);

    // 企業フィルタリング
    if (companyIdFilter) {
      query = query.eq('stores.company_id', companyIdFilter);
    }

    // 基本的なフィルタリング
    if (id) query = query.eq('id', id);
    if (storeId) query = query.eq('store_id', storeId);
    if (status) query = query.eq('status', status);

    // 日付フィルタリング
    // startDateが指定されている場合はそれを使用、そうでない場合は今日以降のデータのみを取得
    query = query.gte('date', startDate || today);
    if (endDate) query = query.lte('date', endDate);

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: '緊急募集データの取得に失敗しました', details: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ data: data || [] }, { headers: corsHeaders });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST: 緊急募集リクエスト作成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { original_user_id, store_id, date, time_slot_id, reason, request_type } = body;

    if (!original_user_id || !store_id || !date || !reason) {
      return NextResponse.json(
        { error: 'original_user_id, store_id, date, reasonは必須です' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!time_slot_id) {
      return NextResponse.json(
        { error: 'time_slot_idが必要です' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!request_type || !['substitute', 'shortage'].includes(request_type)) {
      return NextResponse.json(
        { error: 'request_typeは "substitute" または "shortage" である必要があります' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 過去の日付をチェック
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      return NextResponse.json(
        { error: '過去の日付には緊急募集を作成できません' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { data: existingRequest } = await supabase
      .from('emergency_requests')
      .select('id')
      .eq('original_user_id', original_user_id)
      .eq('store_id', store_id)
      .eq('date', date)
      .eq('time_slot_id', time_slot_id)
      .eq('status', 'open')
      .limit(1);

    if (existingRequest && existingRequest.length > 0) {
      return NextResponse.json(
        { error: 'この日時・時間帯にはすでに緊急募集リクエストが存在します' },
        { status: 409, headers: corsHeaders }
      );
    }

    const { data, error } = await supabase
      .from('emergency_requests')
      .insert({
        original_user_id,
        store_id,
        date,
        time_slot_id,
        reason: reason.trim(),
        request_type,
        status: 'open'
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: '緊急募集リクエストの作成に失敗しました' },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ data }, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PATCH: 緊急募集応募者の承認・却下
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { emergency_request_id, volunteer_id, action } = body;

    if (!emergency_request_id || !volunteer_id || !action) {
      return NextResponse.json(
        { error: 'emergency_request_id, volunteer_id, actionは必須です' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'actionは accept または reject である必要があります' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { data: volunteer, error: volunteerError } = await supabase
      .from('emergency_volunteers')
      .select('*')
      .eq('id', volunteer_id)
      .eq('emergency_request_id', emergency_request_id)
      .single();

    if (volunteerError || !volunteer) {
      return NextResponse.json(
        { error: '応募データが見つかりません' },
        { status: 404, headers: corsHeaders }
      );
    }

    if (action === 'accept') {
      // 緊急募集情報を取得
      const { data: emergencyRequest, error: emergencyError } = await supabase
        .from('emergency_requests')
        .select('*, time_slots(*)')
        .eq('id', emergency_request_id)
        .single();

      if (emergencyError || !emergencyRequest) {
        return NextResponse.json(
          { error: '緊急募集データの取得に失敗しました' },
          { status: 500, headers: corsHeaders }
        );
      }

      // 既存のシフトを確認（代打募集の場合のみ）
      if (emergencyRequest.request_type === 'substitute') {
        // 元のシフトを削除
        const { error: deleteError } = await supabase
          .from('shifts')
          .delete()
          .eq('user_id', emergencyRequest.original_user_id)
          .eq('store_id', emergencyRequest.store_id)
          .eq('date', emergencyRequest.date)
          .eq('time_slot_id', emergencyRequest.time_slot_id)
          .eq('status', 'confirmed');

        if (deleteError) {
          console.error('元のシフトの削除に失敗:', deleteError);
          return NextResponse.json(
            { error: '元のシフトの削除に失敗しました' },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // 新しいシフトを作成
      const { error: shiftError } = await supabase
        .from('shifts')
        .insert({
          user_id: volunteer.user_id,
          store_id: emergencyRequest.store_id,
          date: emergencyRequest.date,
          time_slot_id: emergencyRequest.time_slot_id,
          status: 'confirmed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (shiftError) {
        return NextResponse.json(
          { error: 'シフトの作成に失敗しました' },
          { status: 500, headers: corsHeaders }
        );
      }

      // 元のスタッフにメール通知（代打募集の場合のみ）
      if (emergencyRequest.request_type === 'substitute') {
        try {
          const { data: originalUser } = await supabase
            .from('users')
            .select('email, name')
            .eq('id', emergencyRequest.original_user_id)
            .single();

          if (originalUser) {
            // メール送信処理（実装は省略）
            console.log('元のスタッフにメール通知:', {
              to: originalUser.email,
              subject: '代打が見つかりました',
              name: originalUser.name,
              date: emergencyRequest.date,
              timeSlot: emergencyRequest.time_slots?.name
            });
          }
        } catch (error) {
          console.error('メール通知エラー:', error);
          // メール送信失敗はシフト作成に影響させない
        }
      }

      // 店長への通知メール送信
      try {
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
          .eq('id', emergencyRequest.store_id)
          .single();

        // 応募者の情報を取得
        const { data: volunteerUser } = await supabase
          .from('users')
          .select('name')
          .eq('id', volunteer.user_id)
          .single();

        // 元のスタッフの情報を取得
        const { data: originalUser } = await supabase
          .from('users')
          .select('name')
          .eq('id', emergencyRequest.original_user_id)
          .single();

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
                  type: 'manager-substitute-confirmation',
                  userEmail: manager.email,
                  userName: manager.name || '不明',
                  details: {
                    storeName: storeData.name || '不明な店舗',
                    date: emergencyRequest.date,
                    timeSlot: emergencyRequest.time_slots?.name || '不明',
                    originalStaffName: originalUser?.name || '不明',
                    newStaffName: volunteerUser?.name || '不明'
                  }
                }),
              });

              if (!managerEmailResponse.ok) {
                console.warn('店長への代打確定通知メール送信に失敗しました');
              } else {
                console.log('店長への代打確定通知メールを送信しました');
              }
            }
          }
        }
      } catch (managerEmailError) {
        console.error('店長へのメール送信エラー:', managerEmailError);
        // 店長へのメール送信失敗でも処理は続行
      }

      // 緊急募集を完了状態に更新
      const { error: updateError } = await supabase
        .from('emergency_requests')
        .update({ status: 'filled' })
        .eq('id', emergency_request_id);

      if (updateError) {
        return NextResponse.json(
          { error: '緊急募集の更新に失敗しました' },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    const { error: volunteerUpdateError } = await supabase
      .from('emergency_volunteers')
      .update({ status: action === 'accept' ? 'accepted' : 'rejected' })
      .eq('id', volunteer_id);

    if (volunteerUpdateError) {
      return NextResponse.json(
        { error: '応募者の更新に失敗しました' },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { message: action === 'accept' ? '承認が完了しました' : '却下が完了しました' },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// OPTIONS: CORS対応
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}