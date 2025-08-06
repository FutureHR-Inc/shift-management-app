import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 固定シフトから実際のシフトを自動生成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { store_id, start_date, end_date } = body;

    // バリデーション
    if (!store_id || !start_date || !end_date) {
      return NextResponse.json({ 
        error: 'store_id, start_date, end_dateが必要です' 
      }, { status: 400 });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (startDate > endDate) {
      return NextResponse.json({ 
        error: '開始日は終了日より前である必要があります' 
      }, { status: 400 });
    }

    // 指定期間の固定シフトを取得
    const { data: fixedShifts, error: fixedShiftsError } = await supabase
      .from('fixed_shifts')
      .select(`
        *,
        users(id, name, role, skill_level),
        time_slots(id, name, start_time, end_time)
      `)
      .eq('store_id', store_id)
      .eq('is_active', true);

    if (fixedShiftsError) {
      console.error('固定シフト取得エラー:', fixedShiftsError);
      return NextResponse.json({ 
        error: '固定シフトの取得に失敗しました',
        details: fixedShiftsError 
      }, { status: 500 });
    }

    if (!fixedShifts || fixedShifts.length === 0) {
      return NextResponse.json({ 
        message: '生成対象の固定シフトが見つかりません',
        generated_count: 0 
      });
    }

    const createdShifts = [];
    const skippedShifts = [];

    // 指定期間の各日について処理
    for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
      const dayOfWeek = currentDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
      const dateString = currentDate.toISOString().split('T')[0];

      // その曜日の固定シフトを取得
      const dayFixedShifts = fixedShifts.filter(fs => fs.day_of_week === dayOfWeek);

      for (const fixedShift of dayFixedShifts) {
        try {
          // 既存のシフトがあるかチェック
          const { data: existingShifts, error: checkError } = await supabase
            .from('shifts')
            .select('id, status')
            .eq('user_id', fixedShift.user_id)
            .eq('store_id', store_id)
            .eq('date', dateString);

          if (checkError) {
            console.error('既存シフトチェックエラー:', checkError);
            skippedShifts.push({
              date: dateString,
              user_id: fixedShift.user_id,
              reason: '既存シフトチェックに失敗',
              error: checkError
            });
            continue;
          }

          // 既存のシフトがある場合はスキップ
          if (existingShifts && existingShifts.length > 0) {
            skippedShifts.push({
              date: dateString,
              user_id: fixedShift.user_id,
              user_name: fixedShift.users?.name,
              reason: '既存シフトあり',
              existing_status: existingShifts[0].status
            });
            continue;
          }

          // 固定シフトから通常シフトを作成
          const { data: newShift, error: createError } = await supabase
            .from('shifts')
            .insert({
              user_id: fixedShift.user_id,
              store_id: store_id,
              date: dateString,
              time_slot_id: fixedShift.time_slot_id,
              status: 'confirmed', // 固定シフトは確定状態で作成
              notes: '固定シフトより自動生成',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select(`
              *,
              users(id, name, role, skill_level),
              stores(id, name),
              time_slots(id, name, start_time, end_time)
            `)
            .single();

          if (createError) {
            console.error('シフト作成エラー:', createError);
            skippedShifts.push({
              date: dateString,
              user_id: fixedShift.user_id,
              user_name: fixedShift.users?.name,
              reason: 'シフト作成失敗',
              error: createError
            });
            continue;
          }

          createdShifts.push({
            date: dateString,
            user_id: fixedShift.user_id,
            user_name: fixedShift.users?.name,
            time_slot_name: fixedShift.time_slots?.name,
            shift_data: newShift
          });

        } catch (err) {
          console.error('固定シフト生成処理エラー:', err);
          skippedShifts.push({
            date: dateString,
            user_id: fixedShift.user_id,
            user_name: fixedShift.users?.name,
            reason: '処理エラー',
            error: err
          });
        }
      }
    }

    return NextResponse.json({
      message: '固定シフトの生成が完了しました',
      summary: {
        generated_count: createdShifts.length,
        skipped_count: skippedShifts.length,
        total_fixed_shifts: fixedShifts.length,
        period: `${start_date} 〜 ${end_date}`
      },
      details: {
        created_shifts: createdShifts,
        skipped_shifts: skippedShifts
      }
    });

  } catch (error) {
    console.error('固定シフト生成API エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラーが発生しました',
      details: error 
    }, { status: 500 });
  }
}

// 固定シフト生成状況の確認
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!storeId || !startDate || !endDate) {
      return NextResponse.json({ 
        error: 'store_id, start_date, end_dateが必要です' 
      }, { status: 400 });
    }

    // 固定シフト一覧取得
    const { data: fixedShifts, error: fixedShiftsError } = await supabase
      .from('fixed_shifts')
      .select(`
        *,
        users(id, name, role),
        time_slots(id, name, start_time, end_time)
      `)
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('day_of_week', { ascending: true });

    if (fixedShiftsError) {
      console.error('固定シフト取得エラー:', fixedShiftsError);
      return NextResponse.json({ 
        error: '固定シフトの取得に失敗しました',
        details: fixedShiftsError 
      }, { status: 500 });
    }

    // 指定期間の既存シフト取得
    const { data: existingShifts, error: existingShiftsError } = await supabase
      .from('shifts')
      .select(`
        *,
        users(id, name),
        time_slots(id, name)
      `)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (existingShiftsError) {
      console.error('既存シフト取得エラー:', existingShiftsError);
      return NextResponse.json({ 
        error: '既存シフトの取得に失敗しました',
        details: existingShiftsError 
      }, { status: 500 });
    }

    // 生成予測の計算
    const analysis = analyzePotentialGeneration(fixedShifts || [], existingShifts || [], startDate, endDate);

    return NextResponse.json({
      fixed_shifts: fixedShifts || [],
      existing_shifts: existingShifts || [],
      analysis
    });

  } catch (error) {
    console.error('固定シフト生成状況確認API エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラーが発生しました',
      details: error 
    }, { status: 500 });
  }
}

// 生成予測の分析ヘルパー関数
function analyzePotentialGeneration(fixedShifts: any[], existingShifts: any[], startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let potentialGenerations = 0;
  let wouldSkip = 0;
  const details: any[] = [];

  for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
    const dayOfWeek = currentDate.getDay();
    const dateString = currentDate.toISOString().split('T')[0];
    
    const dayFixedShifts = fixedShifts.filter(fs => fs.day_of_week === dayOfWeek);
    
    for (const fixedShift of dayFixedShifts) {
      const hasExisting = existingShifts.some(es => 
        es.user_id === fixedShift.user_id && 
        es.date === dateString
      );
      
      if (hasExisting) {
        wouldSkip++;
      } else {
        potentialGenerations++;
      }
      
      details.push({
        date: dateString,
        day_of_week: dayOfWeek,
        user_name: fixedShift.users?.name,
        time_slot_name: fixedShift.time_slots?.name,
        would_generate: !hasExisting,
        skip_reason: hasExisting ? '既存シフトあり' : null
      });
    }
  }

  return {
    summary: {
      total_fixed_shifts: fixedShifts.length,
      potential_generations: potentialGenerations,
      would_skip: wouldSkip,
      period_days: Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    },
    details
  };
} 