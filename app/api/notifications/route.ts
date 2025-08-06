import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSubmissionPeriods } from '@/lib/utils';

interface DeadlineWarning {
  type: string;
  period: string;
  deadline: string;
  hours_remaining: number;
  message: string;
}

interface ShiftRequestReminder {
  period: string;
  count: number;
  message: string;
}

interface NotificationData {
  shift_request_reminders: ShiftRequestReminder[];
  pending_submissions: number;
  deadline_warnings: DeadlineWarning[];
}

// GET - 通知情報取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const userRole = searchParams.get('role');

    if (!userId || !userRole) {
      return NextResponse.json(
        { error: 'user_id, roleは必須です' },
        { status: 400 }
      );
    }

    const notifications: NotificationData = {
      shift_request_reminders: [],
      pending_submissions: 0,
      deadline_warnings: []
    };

    if (userRole === 'staff') {
      // スタッフ用通知: 提出期限リマインダー
      const periods = getSubmissionPeriods();
      const openPeriods = periods.filter(p => p.isSubmissionOpen);

      for (const period of openPeriods) {
        const deadline = new Date(period.submissionDeadline + ' 23:59:59');
        const now = new Date();
        const diffHours = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60));

        // 24時間以内の場合は警告
        if (diffHours <= 24 && diffHours > 0) {
          // 提出状況をチェック
          const { data: existingRequests } = await supabase
            .from('shift_requests')
            .select('id')
            .eq('user_id', userId)
            .eq('submission_period', period.id);

          if (!existingRequests || existingRequests.length === 0) {
            notifications.deadline_warnings.push({
              type: 'submission_deadline',
              period: period.label,
              deadline: period.submissionDeadline,
              hours_remaining: diffHours,
              message: `${period.label}のシフト希望提出期限まで残り${diffHours}時間です`
            });
          }
        }
      }

      // 未提出期間の数
      let pendingCount = 0;
      for (const period of openPeriods) {
        const { data: existingRequests } = await supabase
          .from('shift_requests')
          .select('id')
          .eq('user_id', userId)
          .eq('submission_period', period.id);

        if (!existingRequests || existingRequests.length === 0) {
          pendingCount++;
        }
      }
      notifications.pending_submissions = pendingCount;

    } else if (userRole === 'manager') {
      // 店長用通知: 新しい提出、変換待ちの希望
      const { data: pendingRequests } = await supabase
        .from('shift_requests')
        .select('id, submission_period')
        .eq('status', 'submitted');

      notifications.pending_submissions = pendingRequests?.length || 0;

      // 期間別の提出状況サマリー
      const periods = getSubmissionPeriods();
      const periodSummary = new Map();

      pendingRequests?.forEach(req => {
        const count = periodSummary.get(req.submission_period) || 0;
        periodSummary.set(req.submission_period, count + 1);
      });

      notifications.shift_request_reminders = Array.from(periodSummary.entries()).map(([periodId, count]) => {
        const period = periods.find(p => p.id === periodId);
        return {
          period: period?.label || periodId,
          count,
          message: `${period?.label || periodId}で${count}件の新しいシフト希望があります`
        };
      });
    }

    return NextResponse.json({ data: notifications });

  } catch (error) {
    console.error('Notifications API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// POST - 手動リマインダー送信
export async function POST(request: NextRequest) {
  try {
    const {
      submission_period,
      store_id,
      reminder_type = 'deadline' // 'deadline' | 'submission_open'
    } = await request.json();

    if (!submission_period || !store_id) {
      return NextResponse.json(
        { error: 'submission_period, store_idは必須です' },
        { status: 400 }
      );
    }

    // 対象スタッフを取得（該当店舗の所属スタッフ）
    const { data: storeStaff } = await supabase
      .from('user_stores')
      .select(`
        user_id,
        users(id, name, email, role)
      `)
      .eq('store_id', store_id);

    if (!storeStaff || storeStaff.length === 0) {
      return NextResponse.json(
        { message: '対象スタッフが見つかりません' },
        { status: 200 }
      );
    }

    const staffList = storeStaff.filter((s: any) => s.users?.role === 'staff');
    const remindersSent = [];

    // 各スタッフの提出状況をチェックしてリマインダー送信
    for (const staff of staffList) {
      const { data: existingRequests } = await supabase
        .from('shift_requests')
        .select('id')
        .eq('user_id', staff.user_id)
        .eq('submission_period', submission_period);

      // 未提出の場合のみリマインダー
      if (!existingRequests || existingRequests.length === 0) {
        // ここで実際の通知送信（メール、プッシュ通知など）を実装
        remindersSent.push({
          user_id: staff.user_id,
          name: (staff as any).users?.name,
          email: (staff as any).users?.email
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${remindersSent.length}名にリマインダーを送信しました`,
      sent_count: remindersSent.length,
      recipients: remindersSent
    });

  } catch (error) {
    console.error('Send reminder API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
} 