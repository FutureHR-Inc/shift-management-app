import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 現在のユーザーIDから企業IDを取得するヘルパー関数
async function getCurrentUserCompanyId(userId: string): Promise<string | null> {
  console.log('🔍 [SHIFTS API] getCurrentUserCompanyId - userId:', userId);

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, company_id')
    .eq('id', userId)
    .single();

  console.log('🔍 [SHIFTS API] getCurrentUserCompanyId - result:', { data, error });

  if (error || !data) {
    console.log('🔍 [SHIFTS API] getCurrentUserCompanyId - returning null due to error or no data');
    return null;
  }

  console.log('🔍 [SHIFTS API] getCurrentUserCompanyId - returning company_id:', data.company_id);
  return data.company_id;
}

// 🔧 企業分離対応: シフト一覧取得
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || searchParams.get('store_id');
  const userId = searchParams.get('user_id') || searchParams.get('userId');
  const startDate = searchParams.get('startDate') || searchParams.get('date_from');
  const endDate = searchParams.get('endDate') || searchParams.get('date_to');
  const currentUserId = searchParams.get('current_user_id');

  console.log('🔍 [SHIFTS API] GET request params:', { storeId, userId, startDate, endDate, currentUserId });

  try {
    // 企業IDによるフィルタリングのためのユーザーIDを取得
    let companyIdFilter: string | null = null;

    if (currentUserId) {
      companyIdFilter = await getCurrentUserCompanyId(currentUserId);
      console.log('🔍 [SHIFTS API] companyIdFilter:', companyIdFilter);
    }

    let query = supabase
      .from('shifts')
      .select(`
        *,
        users(id, name, email, phone, role, skill_level, hourly_wage),
        stores(id, name, company_id),
        time_slots(id, name, start_time, end_time)
      `);

    // 🔧 企業分離: 店舗の企業IDでフィルタリング
    if (currentUserId) {
      if (companyIdFilter) {
        console.log('🔍 [SHIFTS API] 新企業フィルタリング: stores.company_id =', companyIdFilter);
        query = query.eq('stores.company_id', companyIdFilter);
      } else {
        // ログインユーザーがcompany_idを持たない場合は、既存企業のシフトのみ表示
        console.log('🔍 [SHIFTS API] 既存企業フィルタリング: stores.company_id IS NULL');
        query = query.is('stores.company_id', null);
      }
    } else {
      console.log('🔍 [SHIFTS API] current_user_idが未指定、全シフト表示');
      // current_user_idが指定されていない場合は全シフト（後方互換性）
    }

    // フィルタリング条件を適用
    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    if (userId) {
      // "current"の場合はcurrent_user_idを使用
      const actualUserId = userId === 'current' ? currentUserId : userId;
      if (actualUserId) {
        console.log('🔍 [SHIFTS API] User IDフィルタリング:', { original: userId, actual: actualUserId });
        query = query.eq('user_id', actualUserId);
      } else {
        console.warn('🔍 [SHIFTS API] user_id="current"だがcurrent_user_idが未指定');
      }
    }

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    query = query.order('date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'シフトデータの取得に失敗しました' },
        { status: 500 }
      );
    }

    console.log('🔍 [SHIFTS API] 結果:', {
      shiftCount: data?.length || 0,
      storeCompanyIds: data?.map(s => ({ storeName: s.stores?.name, companyId: s.stores?.company_id })) || []
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

// POST: 新しいシフト作成
export async function POST(request: Request) {
  try {
    const {
      user_id,
      store_id,
      date,
      pattern_id, // 旧フィールド（移行期間）
      time_slot_id, // 新フィールド
      custom_start_time,
      custom_end_time,
      status = 'draft',
      notes
    } = await request.json();

    // 必須フィールドの検証
    if (!user_id || !store_id || !date) {
      return NextResponse.json(
        { error: 'user_id, store_id, dateは必須です' },
        { status: 400 }
      );
    }

    // time_slot_id または pattern_id のいずれかが必要
    const finalTimeSlotId = time_slot_id || pattern_id;
    if (!finalTimeSlotId) {
      return NextResponse.json(
        { error: 'time_slot_idまたはpattern_idが必要です' },
        { status: 400 }
      );
    }

    // カスタム時間のバリデーション（フォーマットのみ）
    if (custom_start_time && custom_start_time.trim() !== '' && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(custom_start_time)) {
      console.error('無効なcustom_start_time:', custom_start_time);
      return NextResponse.json(
        { error: 'custom_start_timeは HH:MM 形式で入力してください' },
        { status: 400 }
      );
    }

    if (custom_end_time && custom_end_time.trim() !== '' && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(custom_end_time)) {
      console.error('無効なcustom_end_time:', custom_end_time);
      return NextResponse.json(
        { error: 'custom_end_timeは HH:MM 形式で入力してください' },
        { status: 400 }
      );
    }

    // 時間の論理チェックは削除 - 柔軟な時間設定を許可

    // 異なる店舗への重複シフトチェック（通常シフト + 固定シフト）
    // 1. 通常シフトの重複チェック（異なる店舗）
    const { data: existingShifts, error: shiftCheckError } = await supabase
      .from('shifts')
      .select('id, store_id, stores(id, name)')
      .eq('user_id', user_id)
      .eq('date', date)
      .neq('store_id', store_id); // 異なる店舗

    if (shiftCheckError) {
      console.error('シフト重複チェックエラー:', shiftCheckError);
      return NextResponse.json(
        { error: '重複チェックに失敗しました' },
        { status: 500 }
      );
    }

    if (existingShifts && existingShifts.length > 0) {
      const otherStoreNames = existingShifts
        .map((shift: any) => {
          // storesはリレーションで単一オブジェクトまたは配列として返される可能性がある
          const store = Array.isArray(shift.stores) ? shift.stores[0] : shift.stores;
          return store?.name || '不明な店舗';
        })
        .join('、');
      return NextResponse.json(
        { error: `このスタッフは同日に他の店舗（${otherStoreNames}）でシフトが設定されています。異なる店舗への重複シフトは設定できません。` },
        { status: 409 }
      );
    }

    // 2. 固定シフトの重複チェック（異なる店舗）
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay(); // 0=日曜日, 1=月曜日, ..., 6=土曜日
    
    const { data: existingFixedShifts, error: fixedShiftCheckError } = await supabase
      .from('fixed_shifts')
      .select('id, store_id, stores(id, name)')
      .eq('user_id', user_id)
      .eq('day_of_week', dayOfWeek)
      .eq('time_slot_id', finalTimeSlotId)
      .eq('is_active', true)
      .neq('store_id', store_id); // 異なる店舗

    if (fixedShiftCheckError) {
      console.error('固定シフト重複チェックエラー:', fixedShiftCheckError);
      return NextResponse.json(
        { error: '固定シフト重複チェックに失敗しました' },
        { status: 500 }
      );
    }

    if (existingFixedShifts && existingFixedShifts.length > 0) {
      const otherStoreNames = existingFixedShifts
        .map((fs: any) => {
          // storesはリレーションで単一オブジェクトまたは配列として返される可能性がある
          const store = Array.isArray(fs.stores) ? fs.stores[0] : fs.stores;
          return store?.name || '不明な店舗';
        })
        .join('、');
      return NextResponse.json(
        { error: `このスタッフはこの曜日・時間帯に他の店舗（${otherStoreNames}）で固定シフトが設定されています。異なる店舗への重複シフトは設定できません。` },
        { status: 409 }
      );
    }

    // データ挿入オブジェクトを構築
    const insertData: Record<string, unknown> = {
      user_id,
      store_id,
      date,
      time_slot_id: finalTimeSlotId,
      custom_start_time: custom_start_time && custom_start_time.trim() !== '' ? custom_start_time : null,
      custom_end_time: custom_end_time && custom_end_time.trim() !== '' ? custom_end_time : null,
      status,
      notes
    };

    const { data, error } = await supabase
      .from('shifts')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'シフトの作成に失敗しました' },
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

// PUT: シフトの更新
export async function PUT(request: Request) {
  try {
    const {
      id,
      user_id,
      store_id,
      date,
      pattern_id, // 旧フィールド（移行期間）
      time_slot_id, // 新フィールド
      custom_start_time,
      custom_end_time,
      status,
      notes
    } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'idは必須です' },
        { status: 400 }
      );
    }

    // time_slot_id または pattern_id のいずれかが必要（更新の場合）
    const finalTimeSlotId = time_slot_id || pattern_id;

    // カスタム時間のバリデーション（フォーマットのみ）
    if (custom_start_time && custom_start_time.trim() !== '' && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(custom_start_time)) {
      console.error('無効なcustom_start_time（更新）:', custom_start_time);
      return NextResponse.json(
        { error: 'custom_start_timeは HH:MM 形式で入力してください' },
        { status: 400 }
      );
    }

    if (custom_end_time && custom_end_time.trim() !== '' && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(custom_end_time)) {
      console.error('無効なcustom_end_time（更新）:', custom_end_time);
      return NextResponse.json(
        { error: 'custom_end_timeは HH:MM 形式で入力してください' },
        { status: 400 }
      );
    }

    // 時間の論理チェックは削除 - 柔軟な時間設定を許可

    // 更新データオブジェクトを構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (user_id !== undefined) updateData.user_id = user_id;
    if (store_id !== undefined) updateData.store_id = store_id;
    if (date !== undefined) updateData.date = date;
    if (finalTimeSlotId !== undefined) updateData.time_slot_id = finalTimeSlotId; // time_slot_idを使用
    if (custom_start_time !== undefined) updateData.custom_start_time = custom_start_time && custom_start_time.trim() !== '' ? custom_start_time : null;
    if (custom_end_time !== undefined) updateData.custom_end_time = custom_end_time && custom_end_time.trim() !== '' ? custom_end_time : null;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const { data, error } = await supabase
      .from('shifts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'シフトの更新に失敗しました' },
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

// DELETE - シフト削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting shift:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Shift deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'サーバー内部エラーが発生しました' }, { status: 500 });
  }
}

// PATCH - 週単位シフト一括更新（確定機能）
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, week_start, week_end, status } = body;

    // バリデーション
    if (!store_id || !week_start || !status) {
      return NextResponse.json(
        { error: 'Required fields: store_id, week_start, status' },
        { status: 400 }
      );
    }

    if (!['draft', 'confirmed', 'completed'].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be "draft", "confirmed", or "completed"' },
        { status: 400 }
      );
    }

    // 週の開始日と終了日を計算
    const weekStartDate = new Date(week_start);
    let weekEndDate: Date;

    if (week_end) {
      weekEndDate = new Date(week_end);
    } else {
      weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6);
    }

    const weekStartStr = weekStartDate.toISOString().split('T')[0];
    const weekEndStr = weekEndDate.toISOString().split('T')[0];

    // 対象シフトを取得
    const { data: targetShifts, error: fetchError } = await supabase
      .from('shifts')
      .select('id, status')
      .eq('store_id', store_id)
      .gte('date', weekStartStr)
      .lte('date', weekEndStr);

    if (fetchError) {
      console.error('Error fetching target shifts:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!targetShifts || targetShifts.length === 0) {
      return NextResponse.json(
        { error: 'No shifts found for the specified period' },
        { status: 404 }
      );
    }

    // 一括更新実行
    const { data: updatedShifts, error: updateError } = await supabase
      .from('shifts')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('store_id', store_id)
      .gte('date', weekStartStr)
      .lte('date', weekEndStr)
      .select(`
        *,
        users(id, name, role, skill_level),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `);

    if (updateError) {
      console.error('Error updating shifts:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // シフト確定時にメール送信
    if (status === 'confirmed' && updatedShifts && updatedShifts.length > 0) {
      try {
        console.log('🔄 シフト確定メール送信開始:', {
          shiftCount: updatedShifts.length,
          shifts: updatedShifts.map(s => ({
            id: s.id,
            userId: s.user_id,
            userEmail: s.users?.email,
            userName: s.users?.name,
            date: s.date
          }))
        });

        // スタッフごとにグループ化
        const staffGroups = new Map();

        updatedShifts.forEach((shift: any) => {
          const userId = shift.user_id;
          if (!staffGroups.has(userId)) {
            staffGroups.set(userId, {
              user: shift.users,
              shifts: []
            });
          }
          staffGroups.get(userId).shifts.push(shift);
        });

        console.log('📧 グループ化されたスタッフ数:', staffGroups.size);

        // 各スタッフにメール送信
        const emailPromises = Array.from(staffGroups.values()).map(async (group: any) => {
          if (!group.user?.email) {
            console.warn('⚠️ メールアドレスが見つかりません:', group.user);
            return;
          }

          console.log('📤 メール送信試行:', {
            email: group.user.email,
            name: group.user.name,
            shiftsCount: group.shifts.length
          });

          const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'shift-confirmation',
              userEmail: group.user.email,
              userName: group.user.name || '不明',
              shifts: group.shifts.map((shift: any) => ({
                date: shift.date,
                storeName: shift.stores?.name || '不明な店舗',
                shiftPattern: shift.time_slots?.name || 'カスタム時間',
                startTime: shift.custom_start_time || shift.time_slots?.start_time || '00:00',
                endTime: shift.custom_end_time || shift.time_slots?.end_time || '00:00'
              }))
            }),
          });

          if (!emailResponse.ok) {
            const errorText = await emailResponse.text();
            console.error(`❌ シフト確定メール送信に失敗: ${group.user.email}`, errorText);
          } else {
            console.log(`✅ シフト確定メール送信成功: ${group.user.email}`);
          }
        });

        await Promise.all(emailPromises);
        console.log('🎉 全てのスタッフへのシフト確定メール送信処理が完了しました');

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
            .eq('id', store_id)
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
                    type: 'manager-shift-confirmation',
                    userEmail: manager.email,
                    userName: manager.name || '不明',
                    details: {
                      storeName: storeData.name || '不明な店舗',
                      period: `${weekStartStr} ～ ${weekEndStr}`,
                      confirmedShiftsCount: updatedShifts.length
                    }
                  }),
                });

                if (!managerEmailResponse.ok) {
                  console.warn('店長へのシフト確定通知メール送信に失敗しました');
                } else {
                  console.log('店長へのシフト確定通知メールを送信しました');
                }
              }
            }
          }
        } catch (managerEmailError) {
          console.error('店長へのメール送信エラー:', managerEmailError);
          // 店長へのメール送信失敗でもシフト確定は成功とする
        }

        console.log('🎉 全てのメール送信処理が完了しました');
      } catch (emailError) {
        console.error('❌ シフト確定メール送信エラー:', emailError);
        console.error('エラースタック:', emailError instanceof Error ? emailError.stack : 'No stack trace');
        // メール送信失敗でもシフト確定は成功とする
      }
    } else {
      console.log('ℹ️ メール送信条件に該当しません:', {
        status,
        hasUpdatedShifts: !!(updatedShifts && updatedShifts.length > 0),
        shiftsLength: updatedShifts?.length || 0
      });
    }

    return NextResponse.json({
      data: updatedShifts,
      message: `Successfully updated ${updatedShifts.length} shifts to ${status}`,
      updated_count: updatedShifts.length
    }, { status: 200 });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'サーバー内部エラーが発生しました' }, { status: 500 });
  }
} 