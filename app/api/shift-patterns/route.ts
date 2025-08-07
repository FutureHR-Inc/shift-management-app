import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: シフトパターン一覧取得
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id');

    let query = supabase
      .from('shift_patterns')
      .select('*')
      .order('created_at', { ascending: true });

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

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' }, 
      { status: 500 }
    );
  }
}

// POST - 新規シフトパターン作成
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, start_time, end_time, color, break_time } = body;

    // バリデーション
    if (!id || !name || !start_time || !end_time || !color) {
      return NextResponse.json(
        { error: 'Required fields: id, name, start_time, end_time, color' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('shift_patterns')
      .insert({
        id,
        name,
        start_time,
        end_time,
        color,
        break_time: break_time || 0
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating shift pattern:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - シフトパターン更新
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, start_time, end_time, color, break_time } = body;

    if (!id) {
      return NextResponse.json({ error: 'Pattern ID is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('shift_patterns')
      .update({
        name,
        start_time,
        end_time,
        color,
        break_time,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating shift pattern:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - シフトパターン削除
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Pattern ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('shift_patterns')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting shift pattern:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Shift pattern deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 