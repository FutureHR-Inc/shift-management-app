import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('Manual test for daily shift notifications triggered');
    
    // Cron APIを呼び出し
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cronUrl = `${baseUrl}/api/cron/daily-shift-notifications`;
    
    const response = await fetch(cronUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Daily notification test completed',
      result: result
    });
    
  } catch (error) {
    console.error('Daily notification test error:', error);
    return NextResponse.json({
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST() {
  return GET();
} 