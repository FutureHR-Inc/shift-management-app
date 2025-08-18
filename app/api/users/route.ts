import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 現在のユーザーIDから企業IDを取得するヘルパー関数
async function getCurrentUserCompanyId(userId: string): Promise<string | null> {
  console.log('🔍 [API DEBUG] getCurrentUserCompanyId - userId:', userId);

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, company_id')
    .eq('id', userId)
    .single();

  console.log('🔍 [API DEBUG] getCurrentUserCompanyId - result:', { data, error });

  if (error || !data) {
    console.log('🔍 [API DEBUG] getCurrentUserCompanyId - returning null due to error or no data');
    return null;
  }

  console.log('🔍 [API DEBUG] getCurrentUserCompanyId - returning company_id:', data.company_id);
  return data.company_id;
}

// GET - ユーザー一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id');
    const role = searchParams.get('role');
    const loginId = searchParams.get('login_id');
    const email = searchParams.get('email');
    const loginType = searchParams.get('login_type');
    const id = searchParams.get('id'); // ID指定での取得を追加

    // idが指定されている場合は、そのユーザーのみを取得
    if (id) {
      const query = supabase
        .from('users')
        .select(`
          *,
          user_stores(
            store_id,
            is_flexible,
            stores(id, name)
          )
        `)
        .eq('id', id);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching user by id:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ data }, { status: 200 });
    }

    // login_idが指定されている場合は、そのユーザーのみを取得
    if (loginId) {
      const query = supabase
        .from('users')
        .select(`
          *,
          user_stores(
            store_id,
            is_flexible,
            stores(id, name)
          )
        `)
        .eq('login_id', loginId);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching user by login_id:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ data }, { status: 200 });
    }

    // emailが指定されている場合は、そのユーザーを取得（店長用）
    if (email) {
      let query = supabase
        .from('users')
        .select(`
          *,
          user_stores(
            store_id,
            is_flexible,
            stores(id, name)
          )
        `)
        .eq('email', email);

      // login_typeが指定されていれば追加
      if (loginType) {
        query = query.eq('login_type', loginType);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching user by email:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ data }, { status: 200 });
    }

    // 企業IDによるフィルタリングのためのユーザーIDを取得
    const currentUserId = searchParams.get('current_user_id');
    let companyIdFilter: string | null = null;

    console.log('🔍 [API DEBUG] Users GET - currentUserId:', currentUserId);

    if (currentUserId) {
      companyIdFilter = await getCurrentUserCompanyId(currentUserId);
      console.log('🔍 [API DEBUG] Users GET - companyIdFilter:', companyIdFilter);
    }

    // 通常のユーザー一覧取得
    let query = supabase
      .from('users')
      .select(`
        *,
        user_stores(
          store_id,
          stores(id, name)
        )
      `);

    // 企業IDでフィルタリング（厳密にチェック）
    if (currentUserId) {
      if (companyIdFilter) {
        console.log('🔍 [API DEBUG] Users GET - 新企業フィルタリング: company_id =', companyIdFilter);
        query = query.eq('company_id', companyIdFilter);
      } else {
        // ログインユーザーがcompany_idを持たない場合は、既存企業のユーザーのみ表示
        console.log('🔍 [API DEBUG] Users GET - 既存企業フィルタリング: company_id IS NULL');
        query = query.is('company_id', null);
      }
    } else {
      console.log('🔍 [API DEBUG] Users GET - current_user_idが未指定、全ユーザー表示');
      // current_user_idが指定されていない場合は全ユーザー（後方互換性）
    }

    // 店舗でフィルタリング
    if (storeId) {
      query = query.eq('user_stores.store_id', storeId);
    }

    // ロールでフィルタリング
    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('🔍 [API DEBUG] Users GET - 結果:', {
      userCount: data?.length || 0,
      userCompanyIds: data?.map(u => ({ name: u.name, company_id: u.company_id })) || []
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - 新規ユーザー作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, email, role, skill_level, hourly_wage, memo, stores, current_user_id } = body;

    // 作成者の企業IDを取得
    let creatorCompanyId: string | null = null;
    if (current_user_id) {
      creatorCompanyId = await getCurrentUserCompanyId(current_user_id);
    }

    // バリデーション
    if (!name || !phone || !email || !role || !skill_level) {
      return NextResponse.json(
        { error: 'Required fields: name, phone, email, role, skill_level' },
        { status: 400 }
      );
    }

    // 名前の長さチェック
    if (name.trim().length < 2 || name.trim().length > 50) {
      return NextResponse.json(
        { error: 'Name must be between 2 and 50 characters' },
        { status: 400 }
      );
    }

    // メールアドレスの基本的なフォーマットチェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // 電話番号の基本チェック（数字とハイフンのみ）
    const phoneRegex = /^[\d\-\+\(\)\s]+$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // 役割の有効性チェック
    if (!['manager', 'staff'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be either "manager" or "staff"' },
        { status: 400 }
      );
    }

    // スキルレベルの有効性チェック
    if (!['training', 'regular', 'veteran'].includes(skill_level)) {
      return NextResponse.json(
        { error: 'Skill level must be "training", "regular", or "veteran"' },
        { status: 400 }
      );
    }

    // 時給のバリデーション
    if (hourly_wage !== undefined && (hourly_wage < 800 || hourly_wage > 3000)) {
      return NextResponse.json(
        { error: 'Hourly wage must be between 800 and 3000' },
        { status: 400 }
      );
    }

    // 🔧 改善: ランダムログインID生成関数
    const generateRandomLoginId = async (role: 'manager' | 'staff'): Promise<string> => {
      const maxAttempts = 10; // 最大試行回数

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // ランダムID生成
        const randomId = role === 'manager'
          ? generateManagerId()
          : generateStaffId();

        console.log(`🔍 [LOGIN_ID] Attempt ${attempt}: Generated "${randomId}"`);

        // 重複チェック
        const { data: existingUser, error } = await supabase
          .from('users')
          .select('id')
          .eq('login_id', randomId)
          .maybeSingle(); // 0件または1件の結果を期待

        if (error) {
          console.error('🚨 [LOGIN_ID] Error checking duplicate:', error);
          continue; // エラーの場合は次の試行へ
        }

        if (!existingUser) {
          console.log(`✅ [LOGIN_ID] Unique ID generated: "${randomId}"`);
          return randomId; // 重複なし、このIDを使用
        }

        console.log(`⚠️ [LOGIN_ID] Duplicate found for "${randomId}", retrying...`);
      }

      // 最大試行回数に達した場合のフォールバック
      const fallbackId = `${role}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      console.log(`🔄 [LOGIN_ID] Using fallback ID: "${fallbackId}"`);
      return fallbackId;
    };

    // 店長用ランダムID生成
    const generateManagerId = (): string => {
      // パターン: MGR + 4桁ランダム英数字
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = 'MGR';
      for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    // スタッフ用ランダムID生成
    const generateStaffId = (): string => {
      // パターン: STF + 4桁ランダム英数字
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = 'STF';
      for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    // ランダムログインIDを生成
    const loginId = await generateRandomLoginId(role);

    // ユーザー作成
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        role,
        skill_level,
        hourly_wage: hourly_wage || (() => {
          // デフォルト時給をスキルレベルに基づいて設定
          const defaultWages = { training: 1000, regular: 1200, veteran: 1500 };
          return defaultWages[skill_level as keyof typeof defaultWages] || 1000;
        })(),
        memo: memo ? memo.trim() : null,
        login_id: loginId,
        company_id: creatorCompanyId // 作成者と同じ企業IDを設定
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      // 重複エラーの場合、よりわかりやすいメッセージを返す
      if (userError.code === '23505' && userError.message.includes('email')) {
        return NextResponse.json({ error: 'This email address is already registered' }, { status: 409 });
      }
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    // 店舗関連を作成
    if (stores && stores.length > 0) {
      const userStoreRelations = stores.map((storeId: string) => ({
        user_id: user.id,
        store_id: storeId,
        is_flexible: false
      }));

      const { error: relationError } = await supabase
        .from('user_stores')
        .insert(userStoreRelations);

      if (relationError) {
        console.error('Error creating user-store relations:', relationError);
        // ユーザーは作成されているので、関連のみエラー
        return NextResponse.json({
          data: user,
          warning: 'User created but store relations failed'
        }, { status: 201 });
      }
    }

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - ユーザー更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, phone, email, role, skill_level, hourly_wage, memo, stores } = body;

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // バリデーション（POSTと同様）
    if (name && (name.trim().length < 2 || name.trim().length > 50)) {
      return NextResponse.json(
        { error: 'Name must be between 2 and 50 characters' },
        { status: 400 }
      );
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }
    }

    if (phone) {
      const phoneRegex = /^[\d\-\+\(\)\s]+$/;
      if (!phoneRegex.test(phone)) {
        return NextResponse.json(
          { error: 'Invalid phone number format' },
          { status: 400 }
        );
      }
    }

    if (role && !['manager', 'staff'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be either "manager" or "staff"' },
        { status: 400 }
      );
    }

    if (skill_level && !['training', 'regular', 'veteran'].includes(skill_level)) {
      return NextResponse.json(
        { error: 'Skill level must be "training", "regular", or "veteran"' },
        { status: 400 }
      );
    }

    // 時給のバリデーション
    if (hourly_wage !== undefined && (hourly_wage < 800 || hourly_wage > 3000)) {
      return NextResponse.json(
        { error: 'Hourly wage must be between 800 and 3000' },
        { status: 400 }
      );
    }

    // ユーザー情報更新
    const updateData: {
      updated_at: string;
      name?: string;
      phone?: string;
      email?: string;
      role?: string;
      skill_level?: string;
      hourly_wage?: number; // 追加
      memo?: string;
    } = {
      updated_at: new Date().toISOString()
    };

    if (name) updateData.name = name.trim();
    if (phone) updateData.phone = phone.trim();
    if (email) updateData.email = email.trim().toLowerCase();
    if (role) updateData.role = role;
    if (skill_level) updateData.skill_level = skill_level;
    if (hourly_wage !== undefined) updateData.hourly_wage = hourly_wage; // 追加
    if (memo !== undefined) updateData.memo = memo ? memo.trim() : null;

    const { data: user, error: userError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (userError) {
      console.error('Error updating user:', userError);
      if (userError.code === '23505' && userError.message.includes('email')) {
        return NextResponse.json({ error: 'This email address is already registered' }, { status: 409 });
      }
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    // 店舗関連を更新（既存削除 → 新規追加）
    if (stores && Array.isArray(stores)) {
      try {
        // 既存の関連を削除
        const { error: deleteError } = await supabase
          .from('user_stores')
          .delete()
          .eq('user_id', id);

        if (deleteError) {
          console.error('Error deleting user-store relations:', deleteError);
          // 削除エラーは警告として扱う（主要処理は成功）
        }

        // 新しい関連を追加
        if (stores.length > 0) {
          const userStoreRelations = stores.map((storeId: string) => ({
            user_id: id,
            store_id: storeId,
            is_flexible: false
          }));

          const { error: relationError } = await supabase
            .from('user_stores')
            .insert(userStoreRelations);

          if (relationError) {
            console.error('Error creating user-store relations:', relationError);
            // 関連作成エラーも警告として扱う
          }
        }
      } catch (relationError) {
        console.error('Error updating store relations:', relationError);
        // 店舗関連の更新失敗は警告として扱い、ユーザー更新は成功として返す
      }
    }

    return NextResponse.json({ data: user }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - ユーザー削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // 関連するレコードを順番に削除
    const deleteOperations = [];

    // 1. shift_requests の削除
    deleteOperations.push(
      supabase.from('shift_requests').delete().eq('user_id', id)
    );

    // 2. shifts の削除
    deleteOperations.push(
      supabase.from('shifts').delete().eq('user_id', id)
    );

    // 3. emergency_volunteers の削除
    deleteOperations.push(
      supabase.from('emergency_volunteers').delete().eq('user_id', id)
    );

    // 4. emergency_requests の削除（original_user_id）
    deleteOperations.push(
      supabase.from('emergency_requests').delete().eq('original_user_id', id)
    );

    // 5. time_off_requests の削除
    deleteOperations.push(
      supabase.from('time_off_requests').delete().eq('user_id', id)
    );

    // 6. fixed_shifts の削除
    deleteOperations.push(
      supabase.from('fixed_shifts').delete().eq('user_id', id)
    );

    // 7. user_stores の削除
    deleteOperations.push(
      supabase.from('user_stores').delete().eq('user_id', id)
    );

    // 関連レコードを並行削除（エラーがあっても続行）
    const results = await Promise.allSettled(deleteOperations);

    // エラーがあったレコードをログ出力（削除を止めない）
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`Warning: Failed to delete related records at operation ${index}:`, result.reason);
      }
    });

    // 最後にユーザー本体を削除
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting user:', error);

      // 外部キー制約エラーの場合、詳細なエラーメッセージを返す
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'このユーザーに関連するデータが存在するため削除できません。関連するシフト、希望休、代打募集などを先に削除してください。'
        }, { status: 409 });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'User deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({
      error: 'ユーザーの削除中に予期しないエラーが発生しました。関連するデータがある場合は、先にそれらを削除してください。'
    }, { status: 500 });
  }
} 