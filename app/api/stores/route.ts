import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 現在のユーザーIDから企業IDを取得するヘルパー関数
async function getCurrentUserCompanyId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.company_id;
}

// GET - 店舗一覧取得
export async function GET(request: NextRequest) {
  try {
    console.log('🏪 店舗データ取得開始');

    const { searchParams } = new URL(request.url);
    const currentUserId = searchParams.get('current_user_id');
    let companyIdFilter: string | null = null;

    if (currentUserId) {
      companyIdFilter = await getCurrentUserCompanyId(currentUserId);
    }

    let query = supabase
      .from('stores')
      .select('*')
      .order('name');

    // 企業IDでフィルタリング
    if (companyIdFilter) {
      query = query.eq('company_id', companyIdFilter);
    } else if (currentUserId) {
      // ログインユーザーがcompany_idを持たない場合は、既存企業の店舗のみ表示
      query = query.is('company_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Stores fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch stores' },
        { status: 500 }
      );
    }

    console.log('✅ 店舗データ取得成功:', data?.length || 0, '件');

    return NextResponse.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Stores API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - 新規店舗作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, required_staff, work_rules, company_id, current_user_id } = body;

    // バリデーション
    if (!id || !name) {
      return NextResponse.json(
        { error: 'Required fields: id, name' },
        { status: 400 }
      );
    }

    // 企業分離：作成者の企業IDを取得
    let creatorCompanyId: string | null = null;
    if (current_user_id) {
      creatorCompanyId = await getCurrentUserCompanyId(current_user_id);
    }

    // 明示的に指定された企業IDまたは作成者の企業IDを使用
    const finalCompanyId = company_id || creatorCompanyId;

    console.log('🏪 [STORE CREATE] Creating store:', {
      id,
      name,
      company_id: finalCompanyId,
      creator_user_id: current_user_id
    });

    const { data, error } = await supabase
      .from('stores')
      .insert({
        id,
        name: name.trim(),
        required_staff: required_staff || {},
        work_rules: work_rules || {
          max_weekly_hours: 28,
          max_consecutive_days: 7,
          min_rest_hours: 11
        },
        company_id: finalCompanyId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating store:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('✅ [STORE CREATE] Store created successfully:', data.id);

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - 店舗更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, required_staff, work_rules, current_user_id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
    }

    // 企業分離：更新権限チェック
    if (current_user_id) {
      const userCompanyId = await getCurrentUserCompanyId(current_user_id);

      // 対象店舗の企業IDを確認
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('company_id')
        .eq('id', id)
        .single();

      if (storeError || !storeData) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 });
      }

      // 企業IDが一致しない場合は更新を拒否
      if (storeData.company_id !== userCompanyId) {
        console.error('🚨 [STORE UPDATE] Company ID mismatch:', {
          store_company_id: storeData.company_id,
          user_company_id: userCompanyId
        });
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    console.log('🏪 店舗更新:', { id, name, required_staff, work_rules });

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name;
    if (required_staff !== undefined) updateData.required_staff = required_staff;
    if (work_rules !== undefined) updateData.work_rules = work_rules;

    const { data, error } = await supabase
      .from('stores')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating store:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - 店舗削除
export async function DELETE(request: NextRequest) {
  try {
    console.log('🗑️ [STORE DELETE] Store deletion started');

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const currentUserId = searchParams.get('current_user_id');

    if (!id) {
      return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
    }

    // 企業分離：削除権限チェック
    if (currentUserId) {
      const userCompanyId = await getCurrentUserCompanyId(currentUserId);

      // 対象店舗の企業IDを確認
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('company_id')
        .eq('id', id)
        .single();

      if (storeError || !storeData) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 });
      }

      // 企業IDが一致しない場合は削除を拒否
      if (storeData.company_id !== userCompanyId) {
        console.error('🚨 [STORE DELETE] Company ID mismatch:', {
          store_company_id: storeData.company_id,
          user_company_id: userCompanyId
        });
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // 関連データの存在チェック（シフト、代打募集、時間帯等）
    console.log('🔍 [STORE DELETE] Checking related data...');
    const [shiftsCheck, emergencyCheck, timeSlotsCheck, userStoresCheck] = await Promise.all([
      supabase.from('shifts').select('id').eq('store_id', id).limit(1),
      supabase.from('emergency_requests').select('id').eq('store_id', id).limit(1),
      supabase.from('time_slots').select('id').eq('store_id', id).limit(1),
      supabase.from('user_stores').select('id').eq('store_id', id).limit(1)
    ]);

    const relatedData = [];
    if (shiftsCheck.data && shiftsCheck.data.length > 0) relatedData.push('shifts');
    if (emergencyCheck.data && emergencyCheck.data.length > 0) relatedData.push('emergency_requests');
    if (timeSlotsCheck.data && timeSlotsCheck.data.length > 0) relatedData.push('time_slots');
    if (userStoresCheck.data && userStoresCheck.data.length > 0) relatedData.push('user_stores');

    if (relatedData.length > 0) {
      console.log('⚠️ [STORE DELETE] Found related data:', relatedData);
      return NextResponse.json({
        error: 'Cannot delete store with existing data',
        details: `Found related data in: ${relatedData.join(', ')}. Please remove all related data before deleting the store.`,
        relatedData
      }, { status: 409 });
    }

    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting store:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('✅ [STORE DELETE] Store deleted successfully:', id);
    return NextResponse.json({ message: 'Store deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 