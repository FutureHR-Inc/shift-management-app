import { NextRequest, NextResponse } from 'next/server';

// 日次シフト通知のcron処理
export async function GET(request: NextRequest) {
  try {
    // 現在は空実装
    console.log('Daily shift notifications cron executed');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Daily shift notifications processed' 
    });
  } catch (error) {
    console.error('Daily shift notifications cron error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
} 