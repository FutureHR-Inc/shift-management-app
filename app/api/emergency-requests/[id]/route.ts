import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// DELETE: 代打募集の削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 削除前に代打募集の情報を取得（権限チェック用）
    const { data: emergencyRequest, error: fetchError } = await supabase
      .from('emergency_requests')
      .select(`
        *,
        original_user:users!original_user_id(id, name, email),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Error fetching emergency request:', fetchError);
      return NextResponse.json({ error: '代打募集の取得に失敗しました' }, { status: 500 });
    }

    if (!emergencyRequest) {
      return NextResponse.json({ error: '代打募集が見つかりません' }, { status: 404 });
    }

    // 代打募集を削除
    const { error: deleteError } = await supabase
      .from('emergency_requests')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting emergency request:', deleteError);
      return NextResponse.json({ error: '代打募集の削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ message: '代打募集を削除しました' });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
