import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
 
export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

// 時間のフォーマット関数
export const formatTime = (time: string): string => {
  const [hours, minutes] = time.split(':');
  return `${hours}:${minutes}`;
};

// シフト希望提出期限管理のユーティリティ
export const getSubmissionPeriods = () => {
  const now = new Date();
  
  const periods = [];

  // 現在月から3ヶ月分の期間を生成
  for (let i = 0; i < 3; i++) {
    // 対象月の1日を基準にする
    const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth(); // 0-based

    // 前半（1-15日）
    const firstHalfStart = new Date(targetYear, targetMonth, 1);
    const firstHalfEnd = new Date(targetYear, targetMonth, 15);
    
    // 前月の20日が提出期限（年をまたぐ場合も考慮）
    const firstHalfDeadlineDate = new Date(targetYear, targetMonth - 1, 20);
    
    // 後半（16-月末）
    const secondHalfStart = new Date(targetYear, targetMonth, 16);
    // 正確な月末を取得（次月の0日目 = 当月の最終日）
    const secondHalfEnd = new Date(targetYear, targetMonth + 1, 0);
    
    // 当月5日が提出期限
    const secondHalfDeadlineDate = new Date(targetYear, targetMonth, 5);

    // 日付文字列に変換する際のタイムゾーン問題を避けるため、年月日を直接指定
    const formatDateSafe = (date: Date): string => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // 前半期間を追加
    periods.push({
      id: `${targetYear}-${(targetMonth + 1).toString().padStart(2, '0')}-first`,
      label: `${targetYear}年${targetMonth + 1}月前半 (1-15日)`,
      startDate: formatDateSafe(firstHalfStart),
      endDate: formatDateSafe(firstHalfEnd),
      submissionDeadline: formatDateSafe(firstHalfDeadlineDate),
      isSubmissionOpen: now <= firstHalfDeadlineDate,
      isCurrentPeriod: now >= firstHalfStart && now <= firstHalfEnd
    });

    // 後半期間を追加
    periods.push({
      id: `${targetYear}-${(targetMonth + 1).toString().padStart(2, '0')}-second`,
      label: `${targetYear}年${targetMonth + 1}月後半 (16-${secondHalfEnd.getDate()}日)`,
      startDate: formatDateSafe(secondHalfStart),
      endDate: formatDateSafe(secondHalfEnd),
      submissionDeadline: formatDateSafe(secondHalfDeadlineDate),
      isSubmissionOpen: now <= secondHalfDeadlineDate,
      isCurrentPeriod: now >= secondHalfStart && now <= secondHalfEnd
    });
  }

  // 過去の期間と未来すぎる期間をフィルタリング
  return periods.filter(period => {
    const deadline = new Date(period.submissionDeadline);
    const periodStart = new Date(period.startDate);
    
    // 期限が1週間以上前に過ぎていない && 期間開始が3ヶ月以上先でない
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    
    return deadline >= oneWeekAgo && periodStart <= threeMonthsLater;
  });
};

// 日付範囲を生成
export const generateDateRange = (startDate: string, endDate: string): string[] => {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  return dates;
};

// 日本語の曜日を取得
export const getJapaneseDayOfWeek = (date: string): string => {
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(date);
  return dayNames[d.getDay()];
};

// 提出期限までの残り時間を計算
export const getTimeUntilDeadline = (deadline: string): string => {
  const now = new Date();
  const deadlineDate = new Date(deadline + ' 23:59:59');
  const diff = deadlineDate.getTime() - now.getTime();

  if (diff < 0) {
    return '期限切れ';
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `残り${days}日`;
  } else if (hours > 0) {
    return `残り${hours}時間`;
  } else {
    return '今日が期限';
  }
};

// デバッグ用：提出期間の詳細情報を表示
export const debugSubmissionPeriods = () => {
  const periods = getSubmissionPeriods();
  console.log('=== 提出期間デバッグ情報 ===');
  console.log('現在日時:', new Date().toISOString());
  
  periods.forEach((period, index) => {
    console.log(`\n期間 ${index + 1}:`);
    console.log(`  ID: ${period.id}`);
    console.log(`  ラベル: ${period.label}`);
    console.log(`  期間: ${period.startDate} 〜 ${period.endDate}`);
    console.log(`  提出期限: ${period.submissionDeadline}`);
    console.log(`  提出可能: ${period.isSubmissionOpen ? 'はい' : 'いいえ'}`);
    console.log(`  現在期間: ${period.isCurrentPeriod ? 'はい' : 'いいえ'}`);
    console.log(`  期限まで: ${getTimeUntilDeadline(period.submissionDeadline)}`);
  });
  
  return periods;
};

// 日付ユーティリティ
export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

export const formatDateTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleString('ja-JP');
};

export const getToday = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// バリデーションヘルパー
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^[\d\-\+\(\)\s]+$/;
  return phoneRegex.test(phone);
};

export const sanitizeString = (str: string | null | undefined): string | null => {
  return str ? str.trim() : null;
};

// レート制限
const requestTimestamps = new Map<string, number[]>();

export const checkRateLimit = (
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60000 // 1分
): boolean => {
  const now = Date.now();
  const timestamps = requestTimestamps.get(identifier) || [];
  
  // 古いタイムスタンプを削除
  const validTimestamps = timestamps.filter(timestamp => 
    now - timestamp < windowMs
  );
  
  if (validTimestamps.length >= maxRequests) {
    return false; // レート制限に引っかかった
  }
  
  validTimestamps.push(now);
  requestTimestamps.set(identifier, validTimestamps);
  
  return true; // リクエスト許可
};

// エラーメッセージの国際化
export const getErrorMessage = (error: Error | { code?: string; message?: string } | string): string => {
  if (typeof error === 'string') return error;
  
  if (error && typeof error === 'object' && 'code' in error) {
    switch (error.code) {
      case '23505':
        return 'このデータは既に存在します';
      case '23503':
        return '関連するデータが見つかりません';
      case '42P01':
        return 'テーブルが見つかりません';
      default:
        return error.message || 'エラーが発生しました';
    }
  }
  
  if (error && typeof error === 'object' && 'message' in error) {
    return error.message || 'エラーが発生しました';
  }
  
  return 'エラーが発生しました';
}; 