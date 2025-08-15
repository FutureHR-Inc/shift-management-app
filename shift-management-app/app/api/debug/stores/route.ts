import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// DEBUG - 店舗データの詳細確認
export async function GET() {
  try {
    console.log('🔍 デバッグ: 店舗データの詳細確認開始');
    
    const { data, error } = await supabase
      .from('stores')
      .select(`
        id,
        name,
        required_staff,
        work_rules,
        time_slots (
          id,
          name,
          start_time,
          end_time,
          display_order
        )
      `)
      .order('name');

    if (error) {
      console.error('Debug stores fetch error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('🔍 店舗データ詳細:', JSON.stringify(data, null, 2));
    
    return NextResponse.json({ 
      success: true, 
      data: data || [],
      message: 'データをコンソールに出力しました。開発者ツールを確認してください。'
    });
  } catch (error) {
    console.error('Debug stores API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
