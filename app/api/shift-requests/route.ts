import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - シフト希望一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const storeId = searchParams.get('store_id');
    const submissionPeriod = searchParams.get('submission_period');
    const status = searchParams.get('status');

    let query = supabase
      .from('shift_requests')
      .select(`
        *,
        users(id, name, email, role, skill_level),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .order('date', { ascending: true })
      .order('priority', { ascending: true });

    // フィルタリング条件
    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    if (submissionPeriod) {
      query = query.eq('submission_period', submissionPeriod);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Shift requests fetch error:', error);
      return NextResponse.json(
        { error: 'シフト希望の取得に失敗しました' },
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

// POST - シフト希望提出
export async function POST(request: NextRequest) {
  try {
    const {
      user_id,
      store_id,
      submission_period,
      requests // 複数日分のリクエスト配列
    } = await request.json();

    // 必須フィールドの検証
    if (!user_id || !store_id || !submission_period || !requests || !Array.isArray(requests)) {
      return NextResponse.json(
        { error: 'user_id, store_id, submission_period, requestsは必須です' },
        { status: 400 }
      );
    }

    // 既存の提出を削除（再提出の場合）
    const { error: deleteError } = await supabase
      .from('shift_requests')
      .delete()
      .eq('user_id', user_id)
      .eq('store_id', store_id)
      .eq('submission_period', submission_period);

    if (deleteError) {
      console.error('Delete existing requests error:', deleteError);
      return NextResponse.json(
        { error: '既存の希望の削除に失敗しました' },
        { status: 500 }
      );
    }

    // 新しい希望を一括挿入
    const insertData = requests.map((req: any) => ({
      user_id,
      store_id,
      submission_period,
      date: req.date,
      time_slot_id: req.time_slot_id || null,
      preferred_start_time: req.preferred_start_time || null,
      preferred_end_time: req.preferred_end_time || null,
      priority: req.priority || 2,
      notes: req.notes || null,
      status: 'submitted',
      submitted_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('shift_requests')
      .insert(insertData)
      .select();

    if (error) {
      console.error('Insert shift requests error:', error);
      return NextResponse.json(
        { error: 'シフト希望の提出に失敗しました' },
        { status: 500 }
      );
    }

    // シフト希望提出確認メール送信処理
    try {
      // ユーザー情報を取得
      const { data: userData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', user_id)
        .single();

      if (userData?.email) {
        const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'shift-request-confirmation',
            userEmail: userData.email,
            userName: userData.name || '不明',
            submissionPeriod: submission_period,
            submittedRequestsCount: data.length
          }),
        });

        if (!emailResponse.ok) {
          console.warn('シフト希望提出確認メール送信に失敗しましたが、提出は完了しました');
        } else {
          console.log('シフト希望提出確認メールを送信しました');
        }
      }
    } catch (emailError) {
      console.error('シフト希望提出確認メール送信エラー:', emailError);
      // メール送信失敗でも提出は成功とする
    }

    return NextResponse.json({ 
      data,
      message: `${data.length}件のシフト希望を提出しました`
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// PUT - シフト希望更新
export async function PUT(request: NextRequest) {
  try {
    const {
      id,
      time_slot_id,
      preferred_start_time,
      preferred_end_time,
      priority,
      notes,
      status
    } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'idは必須です' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (time_slot_id !== undefined) updateData.time_slot_id = time_slot_id;
    if (preferred_start_time !== undefined) updateData.preferred_start_time = preferred_start_time;
    if (preferred_end_time !== undefined) updateData.preferred_end_time = preferred_end_time;
    if (priority !== undefined) updateData.priority = priority;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    const { data, error } = await supabase
      .from('shift_requests')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        users(id, name, email, role, skill_level),
        stores(id, name),
        time_slots(id, name, start_time, end_time)
      `)
      .single();

    if (error) {
      console.error('Update shift request error:', error);
      return NextResponse.json(
        { error: 'シフト希望の更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// DELETE - シフト希望削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('user_id');
    const submissionPeriod = searchParams.get('submission_period');

    if (id) {
      // 個別削除
      const { error } = await supabase
        .from('shift_requests')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Delete shift request error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ message: 'シフト希望を削除しました' });
    } else if (userId && submissionPeriod) {
      // 期間一括削除
      const { error } = await supabase
        .from('shift_requests')
        .delete()
        .eq('user_id', userId)
        .eq('submission_period', submissionPeriod);

      if (error) {
        console.error('Delete shift requests error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ message: '期間のシフト希望を削除しました' });
    } else {
      return NextResponse.json({ error: 'IDまたはuser_id+submission_periodが必要です' }, { status: 400 });
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 