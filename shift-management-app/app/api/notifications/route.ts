import { NextResponse } from 'next/server';

// GET: 通知一覧取得（将来的に実装予定）
export async function GET() {
  return NextResponse.json({ 
    data: [],
    message: '通知機能は今後実装予定です' 
  });
}

// POST: 通知作成（将来的に実装予定）
export async function POST() {
  return NextResponse.json({ 
    message: '通知機能は今後実装予定です' 
  });
} 