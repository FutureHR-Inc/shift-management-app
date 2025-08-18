// このファイルはメール送信機能のテスト用です
// 本番環境では削除することをお勧めします

import { 
  sendEmail,
  sendShiftConfirmationEmail,
  sendTimeOffRequestResponseEmail,
  sendEmergencyShiftRequestEmail,
  sendNotificationEmail
} from './email';

/**
 * 基本的なメール送信テスト
 */
export async function testBasicEmail(testEmail: string) {
  console.log('Testing basic email...');
  
  try {
    await sendEmail({
      to: testEmail,
      subject: 'シフト管理システム - メール送信テスト',
      html: `
        <h1>メール送信テスト</h1>
        <p>このメールはシフト管理システムのメール送信機能のテストです。</p>
        <p>Resend APIが正常に動作しています。</p>
        <p>送信時間: ${new Date().toLocaleString('ja-JP')}</p>
      `,
    });
    
    console.log('✅ Basic email test passed');
    return { success: true, message: 'Basic email sent successfully' };
  } catch (error) {
    console.error('❌ Basic email test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * シフト確定通知メールのテスト
 */
export async function testShiftConfirmationEmail(testEmail: string) {
  console.log('Testing shift confirmation email...');
  
  try {
    await sendShiftConfirmationEmail(
      testEmail,
      'テストユーザー',
      [
        {
          date: '2024-12-30',
          storeName: '京橋店',
          shiftPattern: 'モーニング',
          startTime: '08:00',
          endTime: '13:00',
        },
        {
          date: '2024-12-31',
          storeName: '天満店',
          shiftPattern: 'ランチ',
          startTime: '11:00',
          endTime: '16:00',
        },
      ]
    );
    
    console.log('✅ Shift confirmation email test passed');
    return { success: true, message: 'Shift confirmation email sent successfully' };
  } catch (error) {
    console.error('❌ Shift confirmation email test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * 希望休申請承認通知メールのテスト
 */
export async function testTimeOffResponseEmail(testEmail: string) {
  console.log('Testing time-off response email...');
  
  try {
    await sendTimeOffRequestResponseEmail(
      testEmail,
      'テストユーザー',
      '2025-01-05',
      'approved',
      '承認いたします。'
    );
    
    console.log('✅ Time-off response email test passed');
    return { success: true, message: 'Time-off response email sent successfully' };
  } catch (error) {
    console.error('❌ Time-off response email test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * 代打募集通知メールのテスト
 */
export async function testEmergencyRequestEmail(testEmails: string[]) {
  console.log('Testing emergency request email...');
  
  try {
    await sendEmergencyShiftRequestEmail(
      testEmails,
      {
        storeName: '京橋店',
        date: '2024-12-31',
        shiftPattern: 'ランチ',
        startTime: '11:00',
        endTime: '16:00',
        reason: '体調不良',
      }
    );
    
    console.log('✅ Emergency request email test passed');
    return { success: true, message: 'Emergency request email sent successfully' };
  } catch (error) {
    console.error('❌ Emergency request email test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * 一般通知メールのテスト
 */
export async function testNotificationEmail(testEmail: string) {
  console.log('Testing notification email...');
  
  try {
    await sendNotificationEmail(
      testEmail,
      'テストユーザー',
      'シフト管理システムからのお知らせ',
      'これはテスト通知です。\n\nシステムからの重要なお知らせがある場合にこのようなメールが送信されます。\n\nご確認をお願いいたします。'
    );
    
    console.log('✅ Notification email test passed');
    return { success: true, message: 'Notification email sent successfully' };
  } catch (error) {
    console.error('❌ Notification email test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * 全てのメールタイプをテスト
 */
export async function runAllEmailTests(testEmail: string) {
  console.log('🧪 Running all email tests...');
  console.log('Test email:', testEmail);
  console.log('---');
  
  const results = {
    basic: await testBasicEmail(testEmail),
    shiftConfirmation: await testShiftConfirmationEmail(testEmail),
    timeOffResponse: await testTimeOffResponseEmail(testEmail),
    emergencyRequest: await testEmergencyRequestEmail([testEmail]),
    notification: await testNotificationEmail(testEmail),
  };
  
  console.log('---');
  console.log('📊 Test Results Summary:');
  
  Object.entries(results).forEach(([testName, result]) => {
    console.log(`${result.success ? '✅' : '❌'} ${testName}: ${result.success ? 'PASSED' : 'FAILED'}`);
    if (!result.success) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  const passedTests = Object.values(results).filter(r => r.success).length;
  const totalTests = Object.keys(results).length;
  
  console.log(`\n🎯 Overall Result: ${passedTests}/${totalTests} tests passed`);
  
  return results;
} 