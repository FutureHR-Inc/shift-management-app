import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - ユーザー一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('store_id');
    const role = searchParams.get('role');
    const loginId = searchParams.get('login_id');

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

    // 通常のユーザー一覧取得
    let query = supabase
      .from('users')
      .select(`
        *,
        user_stores(
          store_id,
          is_flexible,
          stores(id, name)
        )
      `);

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
    const { name, phone, email, role, skill_level, hourly_wage, memo, stores } = body;

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

    // ログインID生成関数
    const generateLoginId = async (role: 'manager' | 'staff', stores: string[]) => {
      if (role === 'manager') {
        // 既存の管理者数を取得
        const { data: managers, error } = await supabase
          .from('users')
          .select('login_id')
          .eq('role', 'manager')
          .not('login_id', 'is', null);

        if (error) {
          console.error('Error fetching managers:', error);
          return 'mgr-001'; // エラー時のデフォルト
        }

        const managerCount = managers?.length || 0;
        return `mgr-${String(managerCount + 1).padStart(3, '0')}`;
      } else {
        // スタッフの場合は店舗ベースでID生成
        if (!stores || stores.length === 0) {
          return 'stf-001'; // 店舗なしの場合のデフォルト
        }

        // 最初の店舗を基準にID生成
        const { data: storeData, error: storeError } = await supabase
          .from('stores')
          .select('id, name')
          .eq('id', stores[0])
          .single();

        if (storeError || !storeData) {
          return 'stf-001'; // エラー時のデフォルト
        }

        // 店舗名から接頭辞を生成
        const storePrefix = storeData.name === '京橋店' ? 'kyb' :
                           storeData.name === '天満店' ? 'ten' :
                           storeData.name === '本町店' ? 'hon' : 'stf';

        // 同じ店舗の既存スタッフ数を取得
        const { data: existingStaff, error: staffError } = await supabase
          .from('users')
          .select('login_id, user_stores!inner(store_id)')
          .eq('role', 'staff')
          .eq('user_stores.store_id', stores[0])
          .not('login_id', 'is', null);

        if (staffError) {
          console.error('Error fetching existing staff:', staffError);
          return `${storePrefix}-001`; // エラー時のデフォルト
        }

        const staffCount = existingStaff?.length || 0;
        return `${storePrefix}-${String(staffCount + 1).padStart(3, '0')}`;
      }
    };

    // ログインIDを生成
    const loginId = await generateLoginId(role, stores || []);

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
        login_id: loginId
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

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting user:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'User deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 