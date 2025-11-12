import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionPeriods } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    // 現在の提出期間を取得してデバッグ情報を表示
    const periods = getSubmissionPeriods();
    
    console.log('=== シフト希望提出期間テスト ===');
    console.log('現在時刻:', new Date().toISOString());
    
    periods.forEach((period, index) => {
      console.log(`\n期間 ${index + 1}:`);
      console.log(`  期間: ${period.label}`);
      console.log(`  提出期限: ${period.submissionDeadline}`);
      console.log(`  提出可能: ${period.isSubmissionOpen ? 'はい' : 'いいえ'}`);
      
      // 締切3日前の日付を計算
      const deadline = new Date(period.submissionDeadline);
      const reminderDate = new Date(deadline.getTime() - 3 * 24 * 60 * 60 * 1000);
      console.log(`  リマインド日: ${reminderDate.toISOString().split('T')[0]}`);
      
      // 現在がリマインド対象期間かチェック
      const now = new Date();
      const isReminderPeriod = now >= reminderDate && now <= deadline;
      console.log(`  リマインド対象: ${isReminderPeriod ? 'はい' : 'いいえ'}`);
    });

    return NextResponse.json({
      success: true,
      message: 'テスト実行完了',
      periods: periods,
      currentTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('テストエラー:', error);
    return NextResponse.json({
      error: 'テスト実行中にエラーが発生しました',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
