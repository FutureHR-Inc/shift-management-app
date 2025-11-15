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
          status,
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
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      // statusカラムが存在しない場合のエラーを特別に処理
      if (error.code === '42703' || error.message?.includes('column "status"') || error.message?.includes('status')) {
        console.warn('statusカラムが存在しないため、statusなしで再試行します');
        // statusを除外して再クエリ
        const retryQuery = supabase
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
        
        if (companyIdFilter) {
          retryQuery.eq('stores.company_id', companyIdFilter);
        }
        if (id) retryQuery.eq('id', id);
        if (storeId) retryQuery.eq('store_id', storeId);
        if (status) retryQuery.eq('status', status);
        retryQuery.gte('date', startDate || today);
        if (endDate) retryQuery.lte('date', endDate);
        retryQuery.order('created_at', { ascending: false });
        
        const { data: retryData, error: retryError } = await retryQuery;
        
        if (retryError) {
          return NextResponse.json(
            { 
              error: '緊急募集データの取得に失敗しました', 
              details: retryError.message,
              code: retryError.code,
              hint: retryError.hint
            },
            { status: 500, headers: corsHeaders }
          );
        }
        
        console.log('statusカラムなしで取得したデータ数:', retryData?.length || 0);
        return NextResponse.json({ data: retryData || [] }, { headers: corsHeaders });
      }
      
      return NextResponse.json(
        { 
          error: '緊急募集データの取得に失敗しました', 
          details: error.message,
          code: error.code,
          hint: error.hint
        },
        { status: 500, headers: corsHeaders }
      );
    }

    console.log('取得したデータ数:', data?.length || 0);
    
    // 各応募者に対して、シフトが存在する場合はstatusを'accepted'に補完
    if (data && data.length > 0) {
      for (const request of data) {
        if (request.emergency_volunteers && request.emergency_volunteers.length > 0) {
          for (const volunteer of request.emergency_volunteers) {
            // statusがnull、undefined、または'pending'の場合、shiftsテーブルから確認
            if (!volunteer.status || volunteer.status === 'pending') {
              const { data: shiftData } = await supabase
                .from('shifts')
                .select('id')
                .eq('user_id', volunteer.user_id)
                .eq('date', request.date)
                .eq('store_id', request.store_id)
                .limit(1);
              
              // シフトが存在する場合は採用済みとして扱う
              if (shiftData && shiftData.length > 0) {
                volunteer.status = 'accepted';
                console.log(`応募者 ${volunteer.user_id} はシフトが存在するため、採用済みとして扱います`);
              }
            }
          }
        }
      }
    }
    
    return NextResponse.json({ data: data || [] }, { headers: corsHeaders });
  } catch (error) {
    console.error('API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'サーバーエラーが発生しました';
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      { 
        error: 'サーバーエラーが発生しました',
        details: errorMessage,
        stack: errorStack
      },
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

    // 緊急募集リクエストを作成
    const { data: emergencyRequest, error } = await supabase
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
      .select(`
        *,
        stores(id, name),
        time_slots(id, name, start_time, end_time),
        original_user:users!original_user_id(id, name)
      `)
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: '緊急募集リクエストの作成に失敗しました' },
        { status: 500, headers: corsHeaders }
      );
    }

    try {
      // 同じ店舗の他のスタッフにメール通知
      const { data: eligibleStaff } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('role', 'staff')
        .eq('company_id', emergencyRequest.stores?.company_id)
        .neq('id', original_user_id); // 募集作成者を除外

      if (eligibleStaff && eligibleStaff.length > 0) {
        const staffEmails = eligibleStaff
          .filter(staff => staff.email) // メールアドレスがあるスタッフのみ
          .map(staff => staff.email);

        if (staffEmails.length > 0) {
          try {
            const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'emergency-shift-request',
                userEmails: staffEmails,
                details: {
                  storeName: emergencyRequest.stores?.name || '不明な店舗',
                  date: emergencyRequest.date,
                  shiftPattern: emergencyRequest.time_slots?.name || 'カスタム時間',
                  startTime: emergencyRequest.time_slots?.start_time || '00:00',
                  endTime: emergencyRequest.time_slots?.end_time || '00:00',
                  reason: emergencyRequest.reason,
                }
              }),
            });

            if (!emailResponse.ok) {
              const errorText = await emailResponse.text();
              throw new Error(`メール送信に失敗: ${errorText}`);
            }

            const responseData = await emailResponse.json();
            console.log('✅ 代打募集開始メール送信成功:', responseData);
          } catch (emailError) {
            console.error('❌ 代打募集開始メール送信エラー:', emailError);
            // メール送信失敗は緊急募集作成の成功に影響させない
          }
        }
      }
    } catch (staffError) {
      console.error('スタッフ情報の取得に失敗:', staffError);
      // スタッフ情報取得失敗は緊急募集作成の成功に影響させない
    }

    return NextResponse.json({ data: emergencyRequest }, { status: 201, headers: corsHeaders });
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
      // 既に採用済みかどうかを確認
      if (volunteer.status === 'accepted') {
        return NextResponse.json(
          { error: 'この応募者は既に採用済みです' },
          { status: 400, headers: corsHeaders }
        );
      }

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

      // 既にシフトが作成されているか確認（同じ店舗・同じ日付）
      const { data: existingShift } = await supabase
        .from('shifts')
        .select('id')
        .eq('user_id', volunteer.user_id)
        .eq('date', emergencyRequest.date)
        .eq('store_id', emergencyRequest.store_id)
        .limit(1);

      if (existingShift && existingShift.length > 0) {
        // 既にシフトが存在する場合は、statusのみ更新
        console.log('既にシフトが存在するため、statusのみ更新します');
        const { error: statusUpdateError } = await supabase
          .from('emergency_volunteers')
          .update({ status: 'accepted' })
          .eq('id', volunteer_id);

        if (statusUpdateError) {
          console.warn('status更新エラー（無視）:', statusUpdateError);
        }

        return NextResponse.json(
          { message: 'この応募者は既にシフトが作成されています' },
          { headers: corsHeaders }
        );
      }

      // 異なる店舗での重複チェック（通常シフト）
      const { data: otherStoreShifts, error: otherStoreCheckError } = await supabase
        .from('shifts')
        .select('id, store_id, stores(id, name)')
        .eq('user_id', volunteer.user_id)
        .eq('date', emergencyRequest.date)
        .neq('store_id', emergencyRequest.store_id); // 異なる店舗

      if (otherStoreCheckError) {
        console.error('異なる店舗シフト重複チェックエラー:', otherStoreCheckError);
        return NextResponse.json(
          { error: '異なる店舗重複チェックに失敗しました' },
          { status: 500, headers: corsHeaders }
        );
      }

      if (otherStoreShifts && otherStoreShifts.length > 0) {
        const otherStoreNames = otherStoreShifts
          .map((shift: any) => {
            const store = Array.isArray(shift.stores) ? shift.stores[0] : shift.stores;
            return store?.name || '不明な店舗';
          })
          .join('、');
        return NextResponse.json(
          { error: `この応募者は他の店舗（${otherStoreNames}）で同日のシフトが設定されています。異なる店舗への重複シフトは設定できません。` },
          { status: 409, headers: corsHeaders }
        );
      }

      // 異なる店舗での重複チェック（固定シフト）
      const dateObj = new Date(emergencyRequest.date);
      const dayOfWeek = dateObj.getDay(); // 0=日曜日, 1=月曜日, ..., 6=土曜日
      
      const { data: existingFixedShifts, error: fixedShiftCheckError } = await supabase
        .from('fixed_shifts')
        .select('id, store_id, stores(id, name)')
        .eq('user_id', volunteer.user_id)
        .eq('day_of_week', dayOfWeek)
        .eq('time_slot_id', emergencyRequest.time_slot_id)
        .eq('is_active', true)
        .neq('store_id', emergencyRequest.store_id); // 異なる店舗

      if (fixedShiftCheckError) {
        console.error('固定シフト重複チェックエラー:', fixedShiftCheckError);
        return NextResponse.json(
          { error: '固定シフト重複チェックに失敗しました' },
          { status: 500, headers: corsHeaders }
        );
      }

      if (existingFixedShifts && existingFixedShifts.length > 0) {
        const otherStoreNames = existingFixedShifts
          .map((fs: any) => {
            const store = Array.isArray(fs.stores) ? fs.stores[0] : fs.stores;
            return store?.name || '不明な店舗';
          })
          .join('、');
        return NextResponse.json(
          { error: `この応募者は他の店舗（${otherStoreNames}）でこの曜日・時間帯の固定シフトが設定されています。異なる店舗への重複シフトは設定できません。` },
          { status: 409, headers: corsHeaders }
        );
      }

      // 既存のシフトを確認（代打募集の場合のみ）
      if (emergencyRequest.request_type === 'substitute') {
        // 固定シフトかどうかを確認
        const { data: fixedShift, error: fixedShiftError } = await supabase
          .from('fixed_shifts')
          .select('*')
          .eq('user_id', emergencyRequest.original_user_id)
          .eq('store_id', emergencyRequest.store_id)
          .eq('time_slot_id', emergencyRequest.time_slot_id)
          .eq('day_of_week', new Date(emergencyRequest.date).getDay())
          .eq('is_active', true)
          .maybeSingle();

        if (fixedShiftError) {
          console.error('固定シフトの確認に失敗:', fixedShiftError);
          return NextResponse.json(
            { error: '固定シフトの確認に失敗しました' },
            { status: 500, headers: corsHeaders }
          );
        }

        if (fixedShift) {
          // 固定シフトの場合、非アクティブにして新しい固定シフトを作成
          const { error: deactivateError } = await supabase
            .from('fixed_shifts')
            .update({ is_active: false })
            .eq('id', fixedShift.id);

          if (deactivateError) {
            console.error('固定シフトの無効化に失敗:', deactivateError);
            return NextResponse.json(
              { error: '固定シフトの無効化に失敗しました' },
              { status: 500, headers: corsHeaders }
            );
          }

          // 新しい固定シフトを作成
          const { error: newFixedShiftError } = await supabase
            .from('fixed_shifts')
            .insert({
              user_id: volunteer.user_id,
              store_id: emergencyRequest.store_id,
              time_slot_id: emergencyRequest.time_slot_id,
              day_of_week: new Date(emergencyRequest.date).getDay(),
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (newFixedShiftError) {
            console.error('新しい固定シフトの作成に失敗:', newFixedShiftError);
            return NextResponse.json(
              { error: '新しい固定シフトの作成に失敗しました' },
              { status: 500, headers: corsHeaders }
            );
          }
        } else {
          // 通常シフトの場合、元のシフトを削除
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

      // シフト作成成功後、すぐにstatusを更新
      console.log('✅ シフト作成成功。statusを更新します:', { volunteer_id: volunteer_id, status: 'accepted' });
      const { error: immediateStatusUpdateError } = await supabase
        .from('emergency_volunteers')
        .update({ status: 'accepted' })
        .eq('id', volunteer_id);

      if (immediateStatusUpdateError) {
        console.error('❌ status更新エラー（シフト作成後）:', immediateStatusUpdateError);
        // statusカラムが存在しない場合は警告のみ
        if (immediateStatusUpdateError.code === '42703' || immediateStatusUpdateError.message?.includes('column "status"')) {
          console.warn('⚠️ statusカラムが存在しません。データベースにstatusカラムを追加してください。');
        } else {
          // その他のエラーは警告のみ（シフトは作成済みなので処理は続行）
          console.warn('⚠️ status更新に失敗しましたが、シフトは作成済みです:', immediateStatusUpdateError.message);
        }
      } else {
        console.log('✅ status更新成功');
      }

      // 元のスタッフと応募者にメール通知
      try {
        // 元のスタッフの情報を取得
        const { data: originalUser } = await supabase
          .from('users')
          .select('email, name')
          .eq('id', emergencyRequest.original_user_id)
          .single();

        // 応募者の情報を取得
        const { data: volunteerUser } = await supabase
          .from('users')
          .select('email, name')
          .eq('id', volunteer.user_id)
          .single();

        // 店舗情報を取得
        const { data: store } = await supabase
          .from('stores')
          .select('name')
          .eq('id', emergencyRequest.store_id)
          .single();

        if (originalUser?.email && volunteerUser?.email) {
          try {
            const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'substitute-approved',
                approvedUserEmail: volunteerUser.email,
                approvedUserName: volunteerUser.name || '不明',
                originalUserEmail: originalUser.email,
                originalUserName: originalUser.name || '不明',
                details: {
                  storeName: store?.name || '不明な店舗',
                  date: emergencyRequest.date,
                  timeSlot: emergencyRequest.time_slots?.name || 'カスタム時間',
                  startTime: emergencyRequest.time_slots?.start_time || '00:00',
                  endTime: emergencyRequest.time_slots?.end_time || '00:00'
                }
              }),
            });

            if (!emailResponse.ok) {
              const errorText = await emailResponse.text();
              throw new Error(`メール送信に失敗: ${errorText}`);
            }

            const responseData = await emailResponse.json();
            console.log('✅ 代打決定メール送信成功:', responseData);
          } catch (emailError) {
            console.error('❌ 代打決定メール送信エラー:', emailError);
            // メール送信失敗はシフト作成に影響させない
          }
        }
      } catch (error) {
        console.error('メール通知用のユーザー情報取得エラー:', error);
        // メール送信失敗はシフト作成に影響させない
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

    // acceptアクションの場合は、シフト作成時に既にstatusを更新しているので、ここでは却下の場合のみ更新
    if (action === 'reject') {
      console.log('❌ 却下処理。statusを更新します:', { volunteer_id: volunteer_id, status: 'rejected' });
      const { error: volunteerUpdateError } = await supabase
        .from('emergency_volunteers')
        .update({ status: 'rejected' })
        .eq('id', volunteer_id);

      if (volunteerUpdateError) {
        console.error('❌ 応募者status更新エラー（却下）:', volunteerUpdateError);
        // statusカラムが存在しない場合は警告のみ（後方互換性のため）
        if (volunteerUpdateError.code === '42703' || volunteerUpdateError.message?.includes('column "status"')) {
          console.warn('⚠️ statusカラムが存在しません。データベースにstatusカラムを追加してください。');
          // statusカラムが存在しない場合でも処理は続行
        } else {
          return NextResponse.json(
            { error: '応募者の更新に失敗しました', details: volunteerUpdateError.message },
            { status: 500, headers: corsHeaders }
          );
        }
      } else {
        console.log('✅ status更新成功（却下）');
      }
    } else {
      // acceptアクションの場合は、シフト作成時に既にstatusを更新済み
      console.log('✅ acceptアクション: statusは既に更新済みです');
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