import { Resend } from 'resend';

// 環境変数のチェックは実行時に行う（ビルド時にはチェックしない）
let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not defined in environment variables');
  }
  
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  
  return resend;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

// デフォルトの送信者メールアドレス
const DEFAULT_FROM = 'noreply@futurehrinc.com';

/**
 * メールを送信する基本関数
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = DEFAULT_FROM
}: EmailOptions) {
  try {
    console.log('🔧 メール送信環境チェック:', {
      hasApiKey: !!process.env.RESEND_API_KEY,
      from,
      to: Array.isArray(to) ? to : [to],
      subject
    });

    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || text || '',
      text: text || undefined,
    });

    if (error) {
      console.error('📧 Resend API error:', error);
      throw new Error(`Failed to send email: ${JSON.stringify(error)}`);
    }

    console.log('✅ Email sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    console.error('Error type:', typeof error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * シフト確定通知メールを送信
 */
export async function sendShiftConfirmationEmail(
  userEmail: string,
  userName: string,
  shifts: Array<{
    date: string;
    storeName: string;
    shiftPattern: string;
    startTime: string;
    endTime: string;
  }>
) {
  console.log('📧 sendShiftConfirmationEmail 実行開始:', {
    userEmail,
    userName,
    shiftsCount: shifts?.length,
    shifts: shifts
  });

  const shiftsHtml = shifts.map(shift => `
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;">${shift.date}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${shift.storeName}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${shift.shiftPattern}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${shift.startTime} - ${shift.endTime}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>シフト確定のお知らせ</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          シフト確定のお知らせ
        </h1>
        
        <p>お疲れ様です、${userName}さん。</p>
        
        <p>以下のシフトが確定いたしましたので、お知らせいたします。</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">日付</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">店舗</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">シフト</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">時間</th>
            </tr>
          </thead>
          <tbody>
            ${shiftsHtml}
          </tbody>
        </table>
        
        <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  console.log('📤 sendEmail 呼び出し開始:', {
    to: userEmail,
    subject: `【シフト確定】${userName}さんのシフトが確定しました`
  });

  const result = await sendEmail({
    to: userEmail,
    subject: `【シフト確定】${userName}さんのシフトが確定しました`,
    html,
  });

  console.log('✅ sendEmail 呼び出し完了:', result);
  return result;
}

/**
 * 希望休申請承認・拒否通知メールを送信
 */
export async function sendTimeOffRequestResponseEmail(
  userEmail: string,
  userName: string,
  requestDate: string,
  status: 'approved' | 'rejected',
  reason?: string
) {
  const statusText = status === 'approved' ? '承認' : '拒否';
  const statusColor = status === 'approved' ? '#10b981' : '#ef4444';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>希望休申請の${statusText}について</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: ${statusColor}; border-bottom: 2px solid ${statusColor}; padding-bottom: 10px;">
          希望休申請の${statusText}について
        </h1>
        
        <p>お疲れ様です、${userName}さん。</p>
        
        <p>${requestDate}の希望休申請について、以下の通り${statusText}いたします。</p>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: ${statusColor};">申請結果: ${statusText}</h3>
          <p style="margin: 0;"><strong>対象日:</strong> ${requestDate}</p>
          ${reason ? `<p style="margin: 10px 0 0 0;"><strong>理由:</strong> ${reason}</p>` : ''}
        </div>
        
        ${status === 'approved' 
          ? '<p>希望休が承認されました。当日は休日をお楽しみください。</p>'
          : '<p>申し訳ございませんが、今回の希望休は承認できませんでした。ご理解のほどよろしくお願いいたします。</p>'
        }
        
        <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: `【希望休申請${statusText}】${requestDate}の申請について`,
    html,
  });
}

/**
 * 代打募集通知メールを送信
 */
export async function sendEmergencyShiftRequestEmail(
  userEmails: string[],
  details: {
    storeName: string;
    date: string;
    shiftPattern: string;
    startTime: string;
    endTime: string;
    reason: string;
  }
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>代打募集のお知らせ</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">
          代打募集のお知らせ
        </h1>
        
        <p>お疲れ様です。</p>
        
        <p>以下のシフトで代打を募集しております。ご都合がつく方はご連絡をお願いいたします。</p>
        
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 15px 0; color: #ef4444;">代打募集詳細</h3>
          <p style="margin: 5px 0;"><strong>店舗:</strong> ${details.storeName}</p>
          <p style="margin: 5px 0;"><strong>日付:</strong> ${details.date}</p>
          <p style="margin: 5px 0;"><strong>シフト:</strong> ${details.shiftPattern}</p>
          <p style="margin: 5px 0;"><strong>時間:</strong> ${details.startTime} - ${details.endTime}</p>
          <p style="margin: 5px 0;"><strong>理由:</strong> ${details.reason}</p>
        </div>
        
        <p>代打が可能な方は、シフト管理システムからご応募いただくか、直接ご連絡をお願いいたします。</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/emergency" 
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            代打に応募する
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmails,
    subject: `【代打募集】${details.date} ${details.storeName} ${details.shiftPattern}の代打募集`,
    html,
  });
}

/**
 * 今日のシフト通知メールを送信（毎日0:00自動送信用）
 */
export async function sendTodayShiftNotificationEmail(
  userEmail: string,
  userName: string,
  todayShifts: Array<{
    date: string;
    storeName: string;
    shiftPattern: string;
    startTime: string;
    endTime: string;
  }>
) {
  if (todayShifts.length === 0) {
    // 今日シフトがない場合はメールを送信しない
    return { success: true, message: 'No shifts today' };
  }

  const shiftsHtml = todayShifts.map(shift => `
    <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #3b82f6;">
      <h3 style="margin: 0 0 10px 0; color: #1e40af;">${shift.storeName}</h3>
      <p style="margin: 5px 0; font-size: 18px; font-weight: bold;">${shift.shiftPattern}</p>
      <p style="margin: 5px 0; color: #374151;"><strong>時間:</strong> ${shift.startTime} - ${shift.endTime}</p>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>今日のシフトのお知らせ</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1e40af; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          🌅 今日のシフトのお知らせ
        </h1>
        
        <p>おはようございます、${userName}さん。</p>
        
        <p>本日（${todayShifts[0].date}）のシフトをお知らせいたします。</p>
        
        ${shiftsHtml}
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #374151;">
            <strong>⏰ 出勤時間の確認をお願いします</strong><br>
            遅刻や欠勤の場合は、早めにご連絡をお願いいたします。
          </p>
        </div>
        
        <p>今日も一日よろしくお願いいたします！</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: `【今日のシフト】${userName}さん、お疲れ様です！`,
    html,
  });
}

/**
 * バッチ処理で複数ユーザーに今日のシフト通知を送信
 */
export async function sendBatchTodayShiftNotifications(
  notifications: Array<{
    userEmail: string;
    userName: string;
    todayShifts: Array<{
      date: string;
      storeName: string;
      shiftPattern: string;
      startTime: string;
      endTime: string;
    }>;
  }>
) {
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[]
  };

  // バッチ処理で並列実行（制限付き）
  const batchSize = 5; // 同時送信数を制限
  
  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (notification) => {
      try {
        if (notification.todayShifts.length === 0) {
          results.skipped++;
          return { success: true, email: notification.userEmail, message: 'No shifts today' };
        }

        await sendTodayShiftNotificationEmail(
          notification.userEmail,
          notification.userName,
          notification.todayShifts
        );
        
        results.success++;
        return { success: true, email: notification.userEmail };
      } catch (error) {
        results.failed++;
        const errorMessage = `Failed to send to ${notification.userEmail}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        results.errors.push(errorMessage);
        return { success: false, email: notification.userEmail, error: errorMessage };
      }
    });

    // バッチを並列実行
    await Promise.all(batchPromises);
    
    // 次のバッチまで少し待機（レート制限対策）
    if (i + batchSize < notifications.length) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
    }
  }

  console.log(`Batch email sending completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
  
  return results;
}

/**
 * 一般的な通知メールを送信
 */
export async function sendNotificationEmail(
  userEmail: string,
  userName: string,
  title: string,
  message: string
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          ${title}
        </h1>
        
        <p>お疲れ様です、${userName}さん。</p>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          ${message.split('\n').map(line => `<p style="margin: 10px 0;">${line}</p>`).join('')}
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: title,
    html,
  });
}

/**
 * 代打採用通知メールを送信
 */
export async function sendSubstituteApprovedEmail(
  approvedUserEmail: string,
  approvedUserName: string,
  originalUserEmail: string,
  originalUserName: string,
  details: {
    storeName: string;
    date: string;
    timeSlot: string;
    startTime: string;
    endTime: string;
  }
) {
  // 採用されたスタッフへのメール
  const approvedHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>代打採用のお知らせ</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">
          🎉 代打採用のお知らせ
        </h1>
        
        <p>お疲れ様です、${approvedUserName}さん。</p>
        
        <p>ご応募いただいた代打が採用されましたので、お知らせいたします。</p>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 15px 0; color: #10b981;">採用シフト詳細</h3>
          <p style="margin: 5px 0;"><strong>店舗:</strong> ${details.storeName}</p>
          <p style="margin: 5px 0;"><strong>日付:</strong> ${details.date}</p>
          <p style="margin: 5px 0;"><strong>シフト:</strong> ${details.timeSlot}</p>
          <p style="margin: 5px 0;"><strong>時間:</strong> ${details.startTime} - ${details.endTime}</p>
        </div>
        
        <p>シフトが自動的に更新されておりますので、マイシフトページでご確認ください。</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/my-shift" 
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            マイシフトを確認
          </a>
        </div>
        
        <p>当日はよろしくお願いいたします！</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // 元のスタッフへのメール
  const originalHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>代打が決定しました</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          ✅ 代打が決定しました
        </h1>
        
        <p>お疲れ様です、${originalUserName}さん。</p>
        
        <p>ご依頼いただいていた代打が決定いたしましたので、お知らせいたします。</p>
        
        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h3 style="margin: 0 0 15px 0; color: #3b82f6;">代打決定詳細</h3>
          <p style="margin: 5px 0;"><strong>代打スタッフ:</strong> ${approvedUserName}さん</p>
          <p style="margin: 5px 0;"><strong>店舗:</strong> ${details.storeName}</p>
          <p style="margin: 5px 0;"><strong>日付:</strong> ${details.date}</p>
          <p style="margin: 5px 0;"><strong>シフト:</strong> ${details.timeSlot}</p>
          <p style="margin: 5px 0;"><strong>時間:</strong> ${details.startTime} - ${details.endTime}</p>
        </div>
        
        <p>シフトが自動的に更新されており、${approvedUserName}さんが担当となります。</p>
        <p>ご協力いただき、ありがとうございました。</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // 両方のメールを送信
  return Promise.all([
    sendEmail({
      to: approvedUserEmail,
      subject: `【代打採用】${details.date} ${details.storeName}のシフトが確定しました`,
      html: approvedHtml,
    }),
    sendEmail({
      to: originalUserEmail,
      subject: `【代打決定】${details.date} ${details.storeName}の代打が決定しました`,
      html: originalHtml,
    })
  ]);
}

/**
 * シフト希望提出確認メールを送信
 */
export async function sendShiftRequestConfirmationEmail(
  userEmail: string,
  userName: string,
  submissionPeriod: string,
  submittedRequestsCount: number
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>シフト希望提出確認</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">
          📋 シフト希望提出確認
        </h1>
        
        <p>お疲れ様です、${userName}さん。</p>
        
        <p>${submissionPeriod}のシフト希望の提出を確認いたしました。</p>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 15px 0; color: #10b981;">提出内容</h3>
          <p style="margin: 5px 0;"><strong>対象期間:</strong> ${submissionPeriod}</p>
          <p style="margin: 5px 0;"><strong>提出日数:</strong> ${submittedRequestsCount}日分</p>
          <p style="margin: 5px 0;"><strong>提出日時:</strong> ${new Date().toLocaleString('ja-JP')}</p>
        </div>
        
        <p>店長がシフト希望を確認し、シフトを作成いたします。シフトが確定次第、別途お知らせいたします。</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/shift-request" 
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            シフト希望を確認・修正
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: `【確認】${submissionPeriod}のシフト希望を受け付けました`,
    html,
  });
}

/**
 * シフト希望提出締切リマインダーメールを送信（未提出者のみ）
 */
export async function sendShiftRequestReminderEmail(
  userEmail: string,
  userName: string,
  submissionPeriod: string,
  deadline: string
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>シフト希望提出期限のお知らせ</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #f59e0b; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">
          ⏰ シフト希望提出期限のお知らせ
        </h1>
        
        <p>お疲れ様です、${userName}さん。</p>
        
        <p>${submissionPeriod}のシフト希望がまだ提出されていません。</p>
        
        <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 15px 0; color: #f59e0b;">⚠️ 提出期限について</h3>
          <p style="margin: 5px 0;"><strong>対象期間:</strong> ${submissionPeriod}</p>
          <p style="margin: 5px 0;"><strong>提出期限:</strong> ${deadline}</p>
          <p style="margin: 15px 0 5px 0; color: #92400e;"><strong>期限までにご提出をお願いいたします。</strong></p>
        </div>
        
        <p>シフト希望の提出がない場合、シフト作成に支障をきたす可能性があります。</p>
        <p>お早めにシフト管理システムからご提出ください。</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/shift-request" 
             style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            今すぐシフト希望を提出
          </a>
        </div>
        
        <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: `【重要】${submissionPeriod}のシフト希望提出期限が近づいています`,
    html,
  });
}

/**
 * バッチ処理で複数ユーザーに締切リマインダーを送信
 */
export async function sendBatchShiftRequestReminders(
  reminders: Array<{
    userEmail: string;
    userName: string;
    submissionPeriod: string;
    deadline: string;
  }>
) {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[]
  };

  // バッチ処理で並列実行（制限付き）
  const batchSize = 5; // 同時送信数を制限
  
  for (let i = 0; i < reminders.length; i += batchSize) {
    const batch = reminders.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (reminder) => {
      try {
        await sendShiftRequestReminderEmail(
          reminder.userEmail,
          reminder.userName,
          reminder.submissionPeriod,
          reminder.deadline
        );
        
        results.success++;
        return { success: true, email: reminder.userEmail };
      } catch (error) {
        results.failed++;
        const errorMessage = `Failed to send to ${reminder.userEmail}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        results.errors.push(errorMessage);
        return { success: false, email: reminder.userEmail, error: errorMessage };
      }
    });

    // バッチを並列実行
    await Promise.all(batchPromises);
    
    // 次のバッチまで少し待機（レート制限対策）
    if (i + batchSize < reminders.length) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
    }
  }

  console.log(`Batch reminder sending completed: ${results.success} success, ${results.failed} failed`);
  
  return results;
}

/**
 * 店長向け：シフト希望提出通知メールを送信
 */
export async function sendManagerShiftRequestNotificationEmail(
  managerEmail: string,
  managerName: string,
  staffName: string,
  submissionPeriod: string,
  submittedRequestsCount: number
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>シフト希望提出通知</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          📋 シフト希望提出通知
        </h1>
        
        <p>お疲れ様です、${managerName}さん。</p>
        
        <p>${staffName}さんから${submissionPeriod}のシフト希望が提出されました。</p>
        
        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h3 style="margin: 0 0 15px 0; color: #3b82f6;">提出内容</h3>
          <p style="margin: 5px 0;"><strong>スタッフ:</strong> ${staffName}</p>
          <p style="margin: 5px 0;"><strong>対象期間:</strong> ${submissionPeriod}</p>
          <p style="margin: 5px 0;"><strong>提出日数:</strong> ${submittedRequestsCount}日分</p>
          <p style="margin: 5px 0;"><strong>提出日時:</strong> ${new Date().toLocaleString('ja-JP')}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/shift-requests" 
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            シフト希望を確認
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: managerEmail,
    subject: `【シフト希望提出】${staffName}さんから${submissionPeriod}のシフト希望が提出されました`,
    html,
  });
}

/**
 * 店長向け：代打応募通知メールを送信
 */
export async function sendManagerEmergencyVolunteerNotificationEmail(
  managerEmail: string,
  managerName: string,
  details: {
    volunteerName: string;
    storeName: string;
    date: string;
    timeSlot: string;
    startTime: string;
    endTime: string;
    originalStaffName: string;
    notes?: string;
  }
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>代打応募通知</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          🔔 代打応募通知
        </h1>
        
        <p>お疲れ様です、${managerName}さん。</p>
        
        <p>${details.volunteerName}さんから代打の応募がありました。</p>
        
        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h3 style="margin: 0 0 15px 0; color: #3b82f6;">応募内容</h3>
          <p style="margin: 5px 0;"><strong>応募者:</strong> ${details.volunteerName}</p>
          <p style="margin: 5px 0;"><strong>対象シフト:</strong> ${details.originalStaffName}さんの代打</p>
          <p style="margin: 5px 0;"><strong>店舗:</strong> ${details.storeName}</p>
          <p style="margin: 5px 0;"><strong>日付:</strong> ${details.date}</p>
          <p style="margin: 5px 0;"><strong>シフト:</strong> ${details.timeSlot}</p>
          <p style="margin: 5px 0;"><strong>時間:</strong> ${details.startTime} - ${details.endTime}</p>
          ${details.notes ? `<p style="margin: 15px 0 5px 0;"><strong>応募メモ:</strong><br>${details.notes}</p>` : ''}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/emergency-management?tab=manage" 
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            応募を確認
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: managerEmail,
    subject: `【代打応募】${details.volunteerName}さんから応募がありました`,
    html,
  });
}

/**
 * スタッフ向け：シフト変更通知メールを送信
 */
export async function sendShiftChangeNotificationEmail(
  userEmail: string,
  userName: string,
  details: {
    date: string;
    storeName: string;
    oldTimeSlot?: string;
    newTimeSlot?: string;
    oldTime?: { start: string; end: string };
    newTime?: { start: string; end: string };
    type: 'add' | 'remove' | 'change';
  }
) {
  let title = '';
  let message = '';
  let color = '';

  switch (details.type) {
    case 'add':
      title = 'シフトが追加されました';
      message = `新しいシフトが追加されました：<br>
        ${details.newTimeSlot} (${details.newTime?.start} - ${details.newTime?.end})`;
      color = '#10b981'; // green
      break;
    case 'remove':
      title = 'シフトが削除されました';
      message = `以下のシフトが削除されました：<br>
        ${details.oldTimeSlot} (${details.oldTime?.start} - ${details.oldTime?.end})`;
      color = '#ef4444'; // red
      break;
    case 'change':
      title = 'シフトが変更されました';
      message = `シフトが変更されました：<br>
        変更前：${details.oldTimeSlot} (${details.oldTime?.start} - ${details.oldTime?.end})<br>
        変更後：${details.newTimeSlot} (${details.newTime?.start} - ${details.newTime?.end})`;
      color = '#f59e0b'; // yellow
      break;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: ${color}; border-bottom: 2px solid ${color}; padding-bottom: 10px;">
          ${title}
        </h1>
        
        <p>お疲れ様です、${userName}さん。</p>
        
        <p>${details.date}のシフトに変更がありましたので、お知らせいたします。</p>
        
        <div style="background-color: ${color}10; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${color};">
          <h3 style="margin: 0 0 15px 0; color: ${color};">変更内容</h3>
          <p style="margin: 5px 0;"><strong>日付:</strong> ${details.date}</p>
          <p style="margin: 5px 0;"><strong>店舗:</strong> ${details.storeName}</p>
          <p style="margin: 15px 0 5px 0;">${message}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/my-shift" 
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            マイシフトを確認
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: `【シフト変更】${details.date}のシフトに変更があります`,
    html,
  });
}

/**
 * スタッフ向け：代打応募不採用通知メールを送信
 */
/**
 * 店長向け：シフト確定完了通知メールを送信
 */
export async function sendManagerShiftConfirmationEmail(
  managerEmail: string,
  managerName: string,
  details: {
    storeName: string;
    period: string;
    confirmedShiftsCount: number;
  }
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>シフト確定完了通知</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">
          シフト確定完了通知
        </h1>
        
        <p>お疲れ様です、${managerName}さん。</p>
        
        <p>${details.storeName}の${details.period}のシフトが確定されました。</p>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 15px 0; color: #10b981;">確定内容</h3>
          <p style="margin: 5px 0;"><strong>店舗:</strong> ${details.storeName}</p>
          <p style="margin: 5px 0;"><strong>対象期間:</strong> ${details.period}</p>
          <p style="margin: 5px 0;"><strong>確定シフト数:</strong> ${details.confirmedShiftsCount}件</p>
        </div>
        
        <p>スタッフへの通知メールは自動送信されます。</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: managerEmail,
    subject: `【シフト確定完了】${details.storeName}の${details.period}のシフトを確定しました`,
    html,
  });
}

/**
 * 店長向け：代打確定通知メールを送信
 */
export async function sendManagerSubstituteConfirmationEmail(
  managerEmail: string,
  managerName: string,
  details: {
    storeName: string;
    date: string;
    timeSlot: string;
    originalStaffName: string;
    newStaffName: string;
  }
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>代打確定通知</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          代打確定通知
        </h1>
        
        <p>お疲れ様です、${managerName}さん。</p>
        
        <p>代打の確定処理が完了しましたので、お知らせいたします。</p>
        
        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h3 style="margin: 0 0 15px 0; color: #3b82f6;">確定内容</h3>
          <p style="margin: 5px 0;"><strong>店舗:</strong> ${details.storeName}</p>
          <p style="margin: 5px 0;"><strong>日付:</strong> ${details.date}</p>
          <p style="margin: 5px 0;"><strong>シフト:</strong> ${details.timeSlot}</p>
          <p style="margin: 5px 0;"><strong>元のスタッフ:</strong> ${details.originalStaffName}</p>
          <p style="margin: 5px 0;"><strong>代打スタッフ:</strong> ${details.newStaffName}</p>
        </div>
        
        <p>関係するスタッフへの通知メールは自動送信されます。</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: managerEmail,
    subject: `【代打確定】${details.date} ${details.storeName}の代打が確定しました`,
    html,
  });
}

export async function sendSubstituteRejectedEmail(
  userEmail: string,
  userName: string,
  details: {
    storeName: string;
    date: string;
    timeSlot: string;
    startTime: string;
    endTime: string;
  }
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>代打応募結果のお知らせ</title>
    </head>
    <body style="font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #6b7280; border-bottom: 2px solid #6b7280; padding-bottom: 10px;">
          代打応募結果のお知らせ
        </h1>
        
        <p>お疲れ様です、${userName}さん。</p>
        
        <p>ご応募いただいた代打について、結果をお知らせいたします。</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6b7280;">
          <h3 style="margin: 0 0 15px 0; color: #6b7280;">応募内容</h3>
          <p style="margin: 5px 0;"><strong>店舗:</strong> ${details.storeName}</p>
          <p style="margin: 5px 0;"><strong>日付:</strong> ${details.date}</p>
          <p style="margin: 5px 0;"><strong>シフト:</strong> ${details.timeSlot}</p>
          <p style="margin: 5px 0;"><strong>時間:</strong> ${details.startTime} - ${details.endTime}</p>
          <p style="margin: 15px 0 5px 0; color: #6b7280;">
            <strong>結果: 不採用</strong><br>
            申し訳ございませんが、今回は他のスタッフが採用となりました。<br>
            またの機会がございましたら、ぜひご応募ください。
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/emergency" 
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            代打募集を確認
          </a>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
          <p>このメールは自動送信されています。</p>
          <p>シフト管理システム</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: `【代打応募結果】${details.date} ${details.storeName}の代打応募について`,
    html,
  });
}