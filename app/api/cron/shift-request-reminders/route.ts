import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendBatchShiftRequestReminders } from '@/lib/email';
import { getSubmissionPeriods } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    // Vercel Cron Jobの認証チェック（オプション）
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting shift request reminder notifications...');
    
    // 今日の日付を取得（JST）
    const today = new Date();
    const jstOffset = 9 * 60 * 60 * 1000; // JST = UTC + 9時間
    const jstToday = new Date(today.getTime() + jstOffset);
    
    // 現在の提出期間を取得
    const currentPeriods = getSubmissionPeriods();
    let activeSubmissionPeriod = null;
    let deadline = null;

    // 今日が提出期間内かチェック
    for (const period of currentPeriods) {
      const deadlineDate = new Date(period.submissionDeadline);
      const reminderDate = new Date(deadlineDate.getTime() - 24 * 60 * 60 * 1000); // 締切1日前
      
      if (jstToday >= reminderDate && jstToday <= deadlineDate) {
        activeSubmissionPeriod = period.label;
        deadline = period.submissionDeadline;
        break;
      }
    }

    if (!activeSubmissionPeriod) {
      console.log('現在はリマインダー送信期間ではありません');
      return NextResponse.json({
        success: true,
        message: 'No active submission period for reminders',
        date: jstToday.toISOString().split('T')[0],
        processed: 0
      });
    }

    console.log(`リマインダー送信対象期間: ${activeSubmissionPeriod}, 締切: ${deadline}`);

    // 全スタッフを取得
    const { data: allStaff, error: staffError } = await supabase
      .from('users')
      .select('id, name, email, role')
      .eq('role', 'staff'); // スタッフのみ

    if (staffError) {
      console.error('Error fetching staff:', staffError);
      return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
    }

    if (!allStaff || allStaff.length === 0) {
      console.log('スタッフが見つかりませんでした');
      return NextResponse.json({
        success: true,
        message: 'No staff found',
        date: jstToday.toISOString().split('T')[0],
        processed: 0
      });
    }

    // 既に提出済みのスタッフを取得
    const { data: submittedRequests } = await supabase
      .from('shift_requests')
      .select('user_id')
      .eq('submission_period', activeSubmissionPeriod)
      .eq('status', 'submitted');

    const submittedUserIds = new Set(
      submittedRequests?.map(req => req.user_id) || []
    );

    // 未提出のスタッフを特定
    const unsubmittedStaff = allStaff.filter(staff => 
      !submittedUserIds.has(staff.id) && staff.email
    );

    if (unsubmittedStaff.length === 0) {
      console.log('全スタッフが提出済みです');
      return NextResponse.json({
        success: true,
        message: 'All staff have submitted their requests',
        date: jstToday.toISOString().split('T')[0],
        processed: 0
      });
    }

    console.log(`${unsubmittedStaff.length}人の未提出スタッフにリマインダーを送信します`);

    // リマインダーメール送信データを準備
    const reminders = unsubmittedStaff.map(staff => ({
      userEmail: staff.email!,
      userName: staff.name || '不明',
      submissionPeriod: activeSubmissionPeriod!,
      deadline: deadline!
    }));

    // バッチ処理でメール送信
    const results = await sendBatchShiftRequestReminders(reminders);

    console.log('Shift request reminder notifications completed:', results);

    return NextResponse.json({
      success: true,
      message: 'Shift request reminder notifications processed',
      date: jstToday.toISOString().split('T')[0],
      stats: {
        totalStaff: allStaff.length,
        submittedStaff: submittedUserIds.size,
        unsubmittedStaff: unsubmittedStaff.length,
        remindersSent: results.success,
        emailResults: results
      }
    });

  } catch (error) {
    console.error('Shift request reminder notifications error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST method for manual trigger (testing purposes)
export async function POST(request: NextRequest) {
  console.log('Manual trigger for shift request reminder notifications');
  return GET(request);
} 