import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendBatchTodayShiftNotifications } from '@/lib/email';

export async function GET(request: NextRequest) {
  try {
    // Vercel Cron Jobの認証チェック（オプション）
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    console.log('Starting daily shift notifications...');

    // 今日の日付を取得（JST）
    const today = new Date();
    const jstOffset = 9 * 60 * 60 * 1000; // JST = UTC + 9時間
    const jstToday = new Date(today.getTime() + jstOffset);
    const todayStr = jstToday.toISOString().split('T')[0]; // YYYY-MM-DD形式

    console.log('📅 今日の日付（JST）:', todayStr);

    // 全スタッフを取得
    const { data: allStaff, error: staffError } = await supabase
      .from('users')
      .select('id, name, email, role')
      .eq('role', 'staff');

    if (staffError) {
      console.error('Error fetching staff:', staffError);
      return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
    }

    if (!allStaff || allStaff.length === 0) {
      console.log('スタッフが見つかりませんでした');
      return NextResponse.json({
        success: true,
        message: 'No staff found',
        date: todayStr,
        processed: 0
      });
    }

    console.log(`📧 ${allStaff.length}人のスタッフを処理します`);

    // 各スタッフの今日のシフトを取得
    const notifications = [];

    for (const staff of allStaff) {
      if (!staff.email) {
        console.warn(`⚠️ スタッフ ${staff.name} (${staff.id}) にメールアドレスがありません`);
        continue;
      }

      try {
        // 通常シフトを取得（今日の日付、確定済み）
        const { data: shiftsData, error: shiftsError } = await supabase
          .from('shifts')
          .select(`
            *,
            stores(id, name),
            time_slots(id, name, start_time, end_time)
          `)
          .eq('user_id', staff.id)
          .eq('date', todayStr)
          .eq('status', 'confirmed');

        if (shiftsError) {
          console.error(`Error fetching shifts for ${staff.name}:`, shiftsError);
          continue;
        }

        // 固定シフトを取得（今日の曜日）
        const dayOfWeek = jstToday.getDay(); // 0=日曜日, 1=月曜日, ..., 6=土曜日
        const { data: fixedShiftsData, error: fixedShiftsError } = await supabase
          .from('fixed_shifts')
          .select(`
            *,
            stores(id, name),
            time_slots(id, name, start_time, end_time)
          `)
          .eq('user_id', staff.id)
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true);

        if (fixedShiftsError) {
          console.error(`Error fetching fixed shifts for ${staff.name}:`, fixedShiftsError);
          // 固定シフトの取得エラーは続行
        }

        // シフトを統合
        const todayShifts = [];

        // 通常シフトを追加
        if (shiftsData && shiftsData.length > 0) {
          for (const shift of shiftsData) {
            todayShifts.push({
              date: shift.date,
              storeName: shift.stores?.name || '不明な店舗',
              shiftPattern: shift.time_slots?.name || 'カスタム時間',
              startTime: shift.custom_start_time || shift.time_slots?.start_time || '00:00',
              endTime: shift.custom_end_time || shift.time_slots?.end_time || '00:00'
            });
          }
        }

        // 固定シフトを追加（同じ日付の通常シフトと重複しないように）
        if (fixedShiftsData && fixedShiftsData.length > 0) {
          for (const fixedShift of fixedShiftsData) {
            // 同じ店舗・同じ時間帯の通常シフトがないかチェック
            const hasDuplicate = todayShifts.some(shift => 
              shift.storeName === (fixedShift.stores?.name || '不明な店舗') &&
              shift.shiftPattern === (fixedShift.time_slots?.name || 'カスタム時間')
            );

            if (!hasDuplicate) {
              todayShifts.push({
                date: todayStr,
                storeName: fixedShift.stores?.name || '不明な店舗',
                shiftPattern: fixedShift.time_slots?.name || 'カスタム時間',
                startTime: fixedShift.time_slots?.start_time || '00:00',
                endTime: fixedShift.time_slots?.end_time || '00:00'
              });
            }
          }
        }

        // シフトがある場合は通知リストに追加
        if (todayShifts.length > 0) {
          notifications.push({
            userEmail: staff.email,
            userName: staff.name || '不明',
            todayShifts
          });
        }
      } catch (error) {
        console.error(`Error processing staff ${staff.name}:`, error);
        continue;
      }
    }

    if (notifications.length === 0) {
      console.log('今日シフトがあるスタッフがいませんでした');
      return NextResponse.json({
        success: true,
        message: 'No staff with shifts today',
        date: todayStr,
        processed: 0
      });
    }

    console.log(`📧 ${notifications.length}人のスタッフに今日のシフト通知を送信します`);

    // バッチ処理でメール送信
    const results = await sendBatchTodayShiftNotifications(notifications);

    console.log('Daily shift notifications completed:', results);

    return NextResponse.json({
      success: true,
      message: 'Daily shift notifications processed',
      date: todayStr,
      stats: {
        totalStaff: allStaff.length,
        staffWithShifts: notifications.length,
        notificationsSent: results.success,
        emailResults: results
      }
    });

  } catch (error) {
    console.error('Daily shift notifications error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST method for manual trigger (testing purposes)
export async function POST(request: NextRequest) {
  console.log('Manual trigger for daily shift notifications');
  return GET(request);
} 