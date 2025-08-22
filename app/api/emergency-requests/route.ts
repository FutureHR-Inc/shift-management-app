import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 現在のユーザーIDから企業IDを取得するヘルパー関数
async function getCurrentUserCompanyId(userId: string): Promise<string | null> {
  console.log('🔍 [EMERGENCY API] getCurrentUserCompanyId - userId:', userId);

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, company_id')
    .eq('id', userId)
    .single();

  console.log('🔍 [EMERGENCY API] getCurrentUserCompanyId - result:', { data, error });

  if (error || !data) {
    console.log('🔍 [EMERGENCY API] getCurrentUserCompanyId - returning null due to error or no data');
    return null;
  }

  console.log('🔍 [EMERGENCY API] getCurrentUserCompanyId - returning company_id:', data.company_id);
  return data.company_id;
}

// 🔧 企業分離対応: 緊急募集リクエスト一覧取得
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // パラメータ名の統一：フロントエンドの呼び出しに合わせる
  const storeId = searchParams.get('store_id') || searchParams.get('storeId');
  const startDate = searchParams.get('date_from') || searchParams.get('startDate');
  const endDate = searchParams.get('date_to') || searchParams.get('endDate');
  const status = searchParams.get('status');
  const id = searchParams.get('id'); // 単一リクエスト取得用
  const currentUserId = searchParams.get('current_user_id');

  console.log('🔍 [EMERGENCY API] GET request params:', { storeId, startDate, endDate, status, id, currentUserId });

  try {
    // 企業IDによるフィルタリングのためのユーザーIDを取得
    let companyIdFilter: string | null = null;

    if (currentUserId) {
      companyIdFilter = await getCurrentUserCompanyId(currentUserId);
      console.log('🔍 [EMERGENCY API] companyIdFilter:', companyIdFilter);
    }

    // 🔧 企業分離: 企業に属する店舗IDを事前に取得してフィルタリング
    let storeIdFilter: string[] | null = null;

    if (currentUserId) {
      if (companyIdFilter) {
        console.log('🔍 [EMERGENCY API] 企業ID取得成功、該当企業の店舗IDを取得:', companyIdFilter);

        // 該当企業の店舗IDを取得
        const { data: companyStores, error: storeError } = await supabase
          .from('stores')
          .select('id')
          .eq('company_id', companyIdFilter);

        if (storeError) {
          console.error('🔍 [EMERGENCY API] 企業店舗取得エラー:', storeError);
          return NextResponse.json(
            { error: '企業データの取得に失敗しました', details: storeError.message },
            { status: 500 }
          );
        }

        storeIdFilter = companyStores?.map(store => store.id) || [];
        console.log('🔍 [EMERGENCY API] 企業所属店舗ID:', storeIdFilter);

        // 該当企業に店舗がない場合は空の結果を返す
        if (storeIdFilter.length === 0) {
          console.log('🔍 [EMERGENCY API] 該当企業に店舗なし、空の結果を返します');
          return NextResponse.json({ data: [] });
        }
      } else {
        // ログインユーザーがcompany_idを持たない場合は、レガシーデータ（company_id NULL）の店舗のみ
        console.log('🔍 [EMERGENCY API] レガシーユーザー、company_id NULL店舗のみ対象');

        const { data: legacyStores, error: legacyStoreError } = await supabase
          .from('stores')
          .select('id')
          .is('company_id', null);

        if (legacyStoreError) {
          console.error('🔍 [EMERGENCY API] レガシー店舗取得エラー:', legacyStoreError);
          return NextResponse.json(
            { error: 'レガシー店舗データの取得に失敗しました', details: legacyStoreError.message },
            { status: 500 }
          );
        }

        storeIdFilter = legacyStores?.map(store => store.id) || [];
        console.log('🔍 [EMERGENCY API] レガシー店舗ID:', storeIdFilter);
      }
    } else {
      console.log('🔍 [EMERGENCY API] current_user_idが未指定、全緊急要請表示（後方互換性）');
      // current_user_idが指定されていない場合は全緊急要請（後方互換性）
    }

    // 基本的なクエリを開始
    let query = supabase
      .from('emergency_requests')
      .select(`
        *,
        original_user:users!original_user_id(id, name, email, phone),
        stores(id, name, company_id),
        emergency_volunteers(
          id,
          user_id,
          responded_at,
          notes,
          users(id, name, email, phone)
        )
      `);

    // 企業フィルタリング: 取得した店舗IDでフィルタリング
    if (storeIdFilter !== null) {
      if (storeIdFilter.length > 0) {
        console.log('🔍 [EMERGENCY API] 店舗IDフィルタリング適用:', storeIdFilter);
        query = query.in('store_id', storeIdFilter);
      } else {
        console.log('🔍 [EMERGENCY API] フィルタリング店舗なし、空の結果を返します');
        return NextResponse.json({ data: [] });
      }
    }

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

    console.log('🔍 [EMERGENCY API] 結果:', {
      requestCount: data?.length || 0,
      storeCompanyIds: data?.map(r => ({ storeName: r.stores?.name, companyId: r.stores?.company_id })) || [],
      hasTimeSlots: data?.map(r => ({ id: r.id, hasTimeSlot: !!r.time_slot_id, timeSlotData: !!r.time_slots })) || []
    });

    // データ処理: time_slot_idがある場合は別途取得
    if (data && data.length > 0) {
      for (const request of data) {
        // time_slot_idがある場合は必ず別途取得
        if (request.time_slot_id) {
          console.log('🔍 [EMERGENCY API] time_slot取得開始:', request.time_slot_id);
          try {
            // time_slotsを取得（企業フィルタリングなし - 代打募集作成時のtime_slot_idと一致させるため）
            const { data: timeSlotData, error: timeSlotError } = await supabase
              .from('time_slots')
              .select('id, name, start_time, end_time')
              .eq('id', request.time_slot_id)
              .single();

            console.log('🔍 [EMERGENCY API] time_slot取得結果:', { timeSlotData, timeSlotError });

            if (timeSlotData) {
              request.time_slots = timeSlotData;
              console.log('🔍 [EMERGENCY API] time_slots設定完了:', request.time_slots);
            } else {
              console.warn('🔍 [EMERGENCY API] time_slotデータなし:', request.time_slot_id);
            }
          } catch (error) {
            console.warn('🔍 [EMERGENCY API] Time slot data not found for:', request.time_slot_id, error);
            // time_slotが見つからない場合は無視して続行
          }
        } else {
          console.log('🔍 [EMERGENCY API] time_slot_idがnull:', request.id);
        }

        // shift_pattern_idの処理は一時的に無効化（DBに存在しない可能性）
        // if (request.shift_pattern_id) {
        //   try {
        //     const { data: shiftPatternData } = await supabase
        //       .from('shift_patterns')
        //       .select('id, name, start_time, end_time, color')
        //       .eq('id', request.shift_pattern_id)
        //       .single();
        //     
        //     if (shiftPatternData) {
        //       request.shift_patterns = shiftPatternData;
        //     }
        //   } catch (error) {
        //     console.warn('Shift pattern data not found for:', request.shift_pattern_id, error);
        //     // shift_patternが見つからない場合は無視して続行
        //   }
        // }
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
    console.log('🔍 [EMERGENCY API] POST request received');

    const requestData = await request.json();
    console.log('🔍 [EMERGENCY API] Request data:', requestData);

    const {
      original_user_id,
      store_id,
      date,
      time_slot_id, // time_slot_idのみ使用
      reason,
      request_type // 新規追加: 'substitute' (代打) or 'shortage' (人手不足)
    } = requestData;

    console.log('🔍 [EMERGENCY API] Extracted fields:', {
      original_user_id,
      store_id,
      date,
      time_slot_id,
      reason,
      request_type
    });

    // 必須フィールドの検証
    if (!original_user_id || !store_id || !date || !reason) {
      console.log('🔍 [EMERGENCY API] Missing required fields:', {
        original_user_id: !!original_user_id,
        store_id: !!store_id,
        date: !!date,
        reason: !!reason
      });
      return NextResponse.json(
        { error: 'original_user_id, store_id, date, reasonは必須です' },
        { status: 400 }
      );
    }

    // time_slot_idが必要
    if (!time_slot_id) {
      console.log('🔍 [EMERGENCY API] Missing time_slot_id');
      return NextResponse.json(
        { error: 'time_slot_idが必要です' },
        { status: 400 }
      );
    }

    // request_typeの検証
    if (!request_type || !['substitute', 'shortage'].includes(request_type)) {
      console.log('🔍 [EMERGENCY API] Invalid request_type:', request_type);
      return NextResponse.json(
        { error: 'request_typeは "substitute" または "shortage" である必要があります' },
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
      .eq('time_slot_id', time_slot_id) // time_slot_idも含めて重複チェック
      .eq('status', 'open')
      .limit(1);

    if (existingRequest && existingRequest.length > 0) {
      return NextResponse.json(
        { error: 'この日時・時間帯にはすでに緊急募集リクエストが存在します' },
        { status: 409 }
      );
    }

    // データ挿入（request_typeを追加）
    const insertData: Record<string, unknown> = {
      original_user_id,
      store_id,
      date,
      time_slot_id, // time_slot_idのみ設定
      reason: reason.trim(),
      request_type, // 新規追加
      status: 'open'
    };

    const { data, error } = await supabase
      .from('emergency_requests')
      .insert(insertData)
      .select(`
        *,
        original_user:users!original_user_id(id, name, email),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: '緊急募集リクエストの作成に失敗しました' },
        { status: 500 }
      );
    }

    // メール送信処理：該当店舗の関連スタッフに通知
    try {
      // 該当店舗に所属するスタッフ（代打募集者以外）のメールアドレスを取得
      const { data: staffData } = await supabase
        .from('user_stores')
        .select(`
          users(id, name, email, role)
        `)
        .eq('store_id', store_id)
        .neq('user_id', original_user_id); // 募集者以外

      if (staffData && staffData.length > 0) {
        const staffEmails = staffData
          .map((item: any) => item.users?.email)
          .filter((email: any) => email) as string[];

        if (staffEmails.length > 0) {
          // メール送信
          const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'emergency-request',
              userEmails: staffEmails,
              details: {
                storeName: data.stores?.name || '不明な店舗',
                date: new Date(data.date).toLocaleDateString('ja-JP'),
                shiftPattern: data.time_slots?.name || '不明なシフト',
                startTime: data.time_slots?.start_time || '00:00',
                endTime: data.time_slots?.end_time || '00:00',
                reason: data.reason
              }
            }),
          });

          if (!emailResponse.ok) {
            console.warn('代打募集メール送信に失敗しましたが、募集は作成されました');
          } else {
            console.log(`代打募集メールを${staffEmails.length}人に送信しました`);
          }
        }
      }
    } catch (emailError) {
      console.error('代打募集メール送信エラー:', emailError);
      // メール送信失敗でも募集作成は成功とする
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
        original_user:users!original_user_id(id, name, email, phone),
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
    const { emergency_request_id, volunteer_id, action, custom_start_time, custom_end_time } = await request.json();

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
      // 既存シフトとの重複チェック（承認時のみ）
      const { data: existingShifts } = await supabase
        .from('shifts')
        .select('id')
        .eq('user_id', volunteer.user_id)
        .eq('date', emergencyRequest.date);

      if (existingShifts && existingShifts.length > 0) {
        return NextResponse.json(
          { error: 'この日にすでに他のシフトが存在します' },
          { status: 409 }
        );
      }

      // 募集タイプに応じて処理を分岐
      const requestType = emergencyRequest.request_type as string;

      if (requestType === 'substitute') {
        // 代打募集の場合：元のシフトを削除して新しいシフトを作成
        console.log('代打募集承認開始:', { original_user_id: emergencyRequest.original_user_id, date: emergencyRequest.date, store_id: emergencyRequest.store_id });

        // 1. 元のシフトを削除
        const { error: deleteError } = await supabase
          .from('shifts')
          .delete()
          .eq('user_id', emergencyRequest.original_user_id)
          .eq('date', emergencyRequest.date)
          .eq('store_id', emergencyRequest.store_id)
          .eq('time_slot_id', emergencyRequest.time_slot_id); // 特定の時間帯のみ削除

        if (deleteError) {
          console.error('元のシフト削除エラー:', deleteError);
          return NextResponse.json(
            { error: '元のシフトの削除に失敗しました' },
            { status: 500 }
          );
        }

        console.log('元のシフト削除完了（代打）');
      } else if (requestType === 'shortage') {
        // 人手不足募集の場合：元のシフトは削除せず、新しいシフトを追加
        console.log('人手不足募集承認開始:', { volunteer_user_id: volunteer.user_id, date: emergencyRequest.date, store_id: emergencyRequest.store_id });
        // 元のシフトは削除しない
      } else {
        // 旧データ対応：request_typeが設定されていない場合は代打として扱う
        console.log('旧データ（代打として処理）:', { original_user_id: emergencyRequest.original_user_id, date: emergencyRequest.date, store_id: emergencyRequest.store_id });

        // 1. 元のシフトを削除
        const { error: deleteError } = await supabase
          .from('shifts')
          .delete()
          .eq('user_id', emergencyRequest.original_user_id)
          .eq('date', emergencyRequest.date)
          .eq('store_id', emergencyRequest.store_id);

        if (deleteError) {
          console.error('元のシフト削除エラー:', deleteError);
          return NextResponse.json(
            { error: '元のシフトの削除に失敗しました' },
            { status: 500 }
          );
        }

        console.log('元のシフト削除完了（旧データ対応）');
      }

      // 2. 新しいシフトを作成（共通処理）
      const insertData: Record<string, unknown> = {
        user_id: volunteer.user_id,
        store_id: emergencyRequest.store_id,
        date: emergencyRequest.date,
        status: 'confirmed' as const,
        notes: requestType === 'shortage'
          ? `人手不足募集承認により自動作成`
          : `代打承認により自動作成（元: ${(emergencyRequest as any).original_user?.name || '不明'}）`
      };

      // time_slot_idを使用
      if (emergencyRequest.time_slot_id) {
        insertData.time_slot_id = emergencyRequest.time_slot_id;
      }

      // カスタム時間が指定されている場合は設定
      if (custom_start_time && custom_end_time) {
        insertData.custom_start_time = custom_start_time;
        insertData.custom_end_time = custom_end_time;
      }

      console.log('新しいシフト作成開始:', insertData);

      const { data: newShift, error: shiftCreateError } = await supabase
        .from('shifts')
        .insert(insertData)
        .select('*')
        .single();

      if (shiftCreateError) {
        console.error('シフト作成エラー:', shiftCreateError);
        return NextResponse.json(
          { error: 'シフトの作成に失敗しました' },
          { status: 500 }
        );
      }

      console.log('新しいシフト作成完了:', newShift);

      // 3. 緊急募集リクエストのステータスを更新
      const { error: requestUpdateError } = await supabase
        .from('emergency_requests')
        .update({ status: 'filled' })
        .eq('id', emergency_request_id);

      if (requestUpdateError) {
        console.error('緊急募集リクエスト更新エラー:', requestUpdateError);
      }

      // 採用された応募者以外を削除
      await supabase
        .from('emergency_volunteers')
        .delete()
        .eq('emergency_request_id', emergency_request_id)
        .neq('id', volunteer_id);

      // 代打採用メール送信処理
      try {
        // 必要なデータを取得
        const approvedUser = volunteer.users;
        const originalUser = (emergencyRequest as any).original_user;
        const store = (emergencyRequest as any).stores;
        const timeSlot = (emergencyRequest as any).time_slots;

        if (approvedUser?.email && originalUser?.email && store && timeSlot) {
          const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'substitute-approved',
              approvedUserEmail: approvedUser.email,
              approvedUserName: approvedUser.name || '不明',
              originalUserEmail: originalUser.email,
              originalUserName: originalUser.name || '不明',
              details: {
                storeName: store.name || '不明な店舗',
                date: new Date(emergencyRequest.date as string).toLocaleDateString('ja-JP'),
                timeSlot: timeSlot.name || '不明なシフト',
                startTime: custom_start_time || timeSlot.start_time || '00:00',
                endTime: custom_end_time || timeSlot.end_time || '00:00'
              }
            }),
          });

          if (!emailResponse.ok) {
            console.warn('代打採用メール送信に失敗しましたが、採用処理は完了しました');
          } else {
            console.log('代打採用メールを送信しました');
          }
        }
      } catch (emailError) {
        console.error('代打採用メール送信エラー:', emailError);
        // メール送信失敗でも採用処理は成功とする
      }

      return NextResponse.json({
        message: '承認が完了しました。シフトが自動更新されました。',
        data: {
          volunteer,
          emergency_request: emergencyRequest,
          new_shift: newShift,
          action
        }
      });
    } else {
      // 却下された応募者を削除
      await supabase
        .from('emergency_volunteers')
        .delete()
        .eq('id', volunteer_id);

      return NextResponse.json({
        message: '却下が完了しました',
        data: {
          volunteer,
          emergency_request: emergencyRequest,
          new_shift: null,
          action
        }
      });
    }

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