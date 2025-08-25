import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: シフトパターン一覧取得 (time_slotsベース)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id');
    const currentUserId = searchParams.get('current_user_id');

    let query = supabase
      .from('time_slots')
      .select('*')
      .order('display_order', { ascending: true });

    // 企業フィルタリング（current_user_idが指定されている場合）
    if (currentUserId) {
      // current_user_idからcompany_idを取得
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', currentUserId)
        .single();

      if (userError || !userData?.company_id) {
        console.error('User company_id fetch error:', userError);
        return NextResponse.json(
          { error: 'ユーザーの企業情報が取得できません' },
          { status: 400 }
        );
      }

      // company_idでフィルタリング
      query = query.eq('company_id', userData.company_id);
    }

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'シフトパターンの取得に失敗しました' }, 
        { status: 500 }
      );
    }

    // time_slotsをshift_patterns形式にマッピング（既存コードとの互換性のため）
    const mappedData = (data || []).map(timeSlot => ({
      id: timeSlot.id,
      name: timeSlot.name,
      start_time: timeSlot.start_time,
      end_time: timeSlot.end_time,
      color: timeSlot.color || '#3B82F6', // デフォルト色
      break_time: timeSlot.break_minutes || 0,
      created_at: timeSlot.created_at,
      updated_at: timeSlot.updated_at
    }));

    return NextResponse.json({ data: mappedData });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' }, 
      { status: 500 }
    );
  }
}

// POST - 新規シフトパターン作成（time_slotsベース）
export async function POST(request: Request) {
  try {
    return NextResponse.json(
      { error: 'シフトパターンの作成は /api/time-slots を使用してください' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - シフトパターン更新（time_slotsベース）
export async function PUT(request: Request) {
  try {
    return NextResponse.json(
      { error: 'シフトパターンの更新は /api/time-slots を使用してください' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - シフトパターン削除（time_slotsベース）
export async function DELETE(request: Request) {
  try {
    return NextResponse.json(
      { error: 'シフトパターンの削除は /api/time-slots を使用してください' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 