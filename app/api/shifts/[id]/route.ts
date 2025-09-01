import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// PUT: シフトの更新（個別）
export async function PUT(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;
    const body = await request.json();
    const {
      user_id,
      store_id,
      date,
      time_slot_id,
      custom_start_time,
      custom_end_time,
      status,
      notes
    } = body;

    // 更新前のシフト情報を取得
    const { data: oldShift, error: oldShiftError } = await supabase
      .from('shifts')
      .select(`
        *,
        users(id, name, email),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .eq('id', id)
      .single();

    if (oldShiftError) {
      console.error('Error fetching old shift:', oldShiftError);
      return NextResponse.json({ error: 'シフトの取得に失敗しました' }, { status: 500 });
    }

    // 更新データを構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (user_id !== undefined) updateData.user_id = user_id;
    if (store_id !== undefined) updateData.store_id = store_id;
    if (date !== undefined) updateData.date = date;
    if (time_slot_id !== undefined) updateData.time_slot_id = time_slot_id;
    if (custom_start_time !== undefined) updateData.custom_start_time = custom_start_time && custom_start_time.trim() !== '' ? custom_start_time : null;
    if (custom_end_time !== undefined) updateData.custom_end_time = custom_end_time && custom_end_time.trim() !== '' ? custom_end_time : null;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    // シフトを更新
    const { data: updatedShift, error: updateError } = await supabase
      .from('shifts')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        users(id, name, email),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .single();

    if (updateError) {
      console.error('Error updating shift:', updateError);
      return NextResponse.json({ error: 'シフトの更新に失敗しました' }, { status: 500 });
    }

    // 変更内容を判断
    let changeType: 'add' | 'remove' | 'change' = 'change';
    if (!oldShift.user_id && updatedShift.user_id) {
      changeType = 'add';
    } else if (oldShift.user_id && !updatedShift.user_id) {
      changeType = 'remove';
    }

    // メール通知を送信
    try {
      const userEmail = updatedShift.users?.email;
      const userName = updatedShift.users?.name || '不明';

      if (userEmail) {
        const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'shift-change',
            userEmail,
            userName,
            details: {
              date: updatedShift.date,
              storeName: updatedShift.stores?.name || '不明な店舗',
              oldTimeSlot: oldShift.time_slots?.name,
              newTimeSlot: updatedShift.time_slots?.name,
              oldTime: oldShift.time_slots ? {
                start: oldShift.custom_start_time || oldShift.time_slots.start_time,
                end: oldShift.custom_end_time || oldShift.time_slots.end_time
              } : undefined,
              newTime: updatedShift.time_slots ? {
                start: updatedShift.custom_start_time || updatedShift.time_slots.start_time,
                end: updatedShift.custom_end_time || updatedShift.time_slots.end_time
              } : undefined,
              type: changeType
            }
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          throw new Error(`メール送信に失敗: ${errorText}`);
        }

        const responseData = await emailResponse.json();
        console.log('✅ シフト変更メール送信成功:', responseData);
      }
    } catch (emailError) {
      console.error('❌ シフト変更メール送信エラー:', emailError);
      // メール送信失敗はシフト更新の成功に影響させない
    }

    return NextResponse.json({ data: updatedShift });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// DELETE: シフトの削除（個別）
export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;

    // 削除前のシフト情報を取得
    const { data: oldShift, error: oldShiftError } = await supabase
      .from('shifts')
      .select(`
        *,
        users(id, name, email),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .eq('id', id)
      .single();

    if (oldShiftError) {
      console.error('Error fetching shift to delete:', oldShiftError);
      return NextResponse.json({ error: 'シフトの取得に失敗しました' }, { status: 500 });
    }

    // シフトを削除
    const { error: deleteError } = await supabase
      .from('shifts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting shift:', deleteError);
      return NextResponse.json({ error: 'シフトの削除に失敗しました' }, { status: 500 });
    }

    // メール通知を送信
    try {
      const userEmail = oldShift.users?.email;
      const userName = oldShift.users?.name || '不明';

      if (userEmail) {
        const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'shift-change',
            userEmail,
            userName,
            details: {
              date: oldShift.date,
              storeName: oldShift.stores?.name || '不明な店舗',
              oldTimeSlot: oldShift.time_slots?.name,
              oldTime: oldShift.time_slots ? {
                start: oldShift.custom_start_time || oldShift.time_slots.start_time,
                end: oldShift.custom_end_time || oldShift.time_slots.end_time
              } : undefined,
              type: 'remove'
            }
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          throw new Error(`メール送信に失敗: ${errorText}`);
        }

        const responseData = await emailResponse.json();
        console.log('✅ シフト削除メール送信成功:', responseData);
      }
    } catch (emailError) {
      console.error('❌ シフト削除メール送信エラー:', emailError);
      // メール送信失敗はシフト削除の成功に影響させない
    }

    return NextResponse.json({ message: 'シフトを削除しました' });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}