import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - 希望休申請取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = supabase
      .from('time_off_requests')
      .select(`
        *,
        users!time_off_requests_user_id_fkey(id, name, role),
        responded_by_user:users!time_off_requests_responded_by_fkey(id, name)
      `);

    // フィルタリング条件を適用
    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (dateFrom) {
      query = query.gte('date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('date', dateTo);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching time off requests:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - 新規希望休申請作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, date, reason } = body;

    // バリデーション
    if (!user_id || !date || !reason) {
      return NextResponse.json(
        { error: 'Required fields: user_id, date, reason' },
        { status: 400 }
      );
    }

    // 日付の妥当性チェック
    const requestDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isNaN(requestDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    if (requestDate < today) {
      return NextResponse.json(
        { error: 'Cannot request time off for past dates' },
        { status: 400 }
      );
    }

    // 理由の長さチェック
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5 || trimmedReason.length > 500) {
      return NextResponse.json(
        { error: 'Reason must be between 5 and 500 characters' },
        { status: 400 }
      );
    }

    // 重複チェック（同じユーザー・日付）
    const { data: existingRequest } = await supabase
      .from('time_off_requests')
      .select('id')
      .eq('user_id', user_id)
      .eq('date', date)
      .single();

    if (existingRequest) {
      return NextResponse.json(
        { error: 'Time off request already exists for this date' },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from('time_off_requests')
      .insert({
        user_id,
        date,
        reason: trimmedReason,
        status: 'pending'
      })
      .select(`
        *,
        users!time_off_requests_user_id_fkey(id, name, role)
      `)
      .single();

    if (error) {
      console.error('Error creating time off request:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - 希望休申請の承認・却下
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, responded_by } = body;

    if (!id || !status || !responded_by) {
      return NextResponse.json(
        { error: 'Required fields: id, status, responded_by' },
        { status: 400 }
      );
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be either "approved" or "rejected"' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('time_off_requests')
      .update({
        status,
        responded_by,
        responded_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        users!time_off_requests_user_id_fkey(id, name, role),
        responded_by_user:users!time_off_requests_responded_by_fkey(id, name)
      `)
      .single();

    if (error) {
      console.error('Error updating time off request:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - 希望休申請削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('time_off_requests')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting time off request:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Time off request deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 

// PATCH - 希望休申請一括承認・却下
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_ids, status, responded_by } = body;

    if (!request_ids || !Array.isArray(request_ids) || request_ids.length === 0) {
      return NextResponse.json({ error: 'Request IDs array is required' }, { status: 400 });
    }

    if (!status || !responded_by) {
      return NextResponse.json({ error: 'Status and responded_by are required' }, { status: 400 });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Status must be either "approved" or "rejected"' }, { status: 400 });
    }

    // 最大処理件数制限（一度に100件まで）
    if (request_ids.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 requests can be processed at once' }, { status: 400 });
    }

    // 一括更新実行
    const { data, error } = await supabase
      .from('time_off_requests')
      .update({
        status,
        responded_by,
        responded_at: new Date().toISOString()
      })
      .in('id', request_ids)
      .eq('status', 'pending') // 保留中のもののみ更新
      .select(`
        *,
        users!time_off_requests_user_id_fkey(id, name, role),
        responded_by_user:users!time_off_requests_responded_by_fkey(id, name)
      `);

    if (error) {
      console.error('Error bulk updating time off requests:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      data,
      message: `Successfully ${status === 'approved' ? 'approved' : 'rejected'} ${data.length} requests`,
      updated_count: data.length
    }, { status: 200 });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 