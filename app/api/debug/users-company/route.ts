import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // 全ユーザーのcompany_id状況を取得
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, company_id, login_id, created_at')
      .order('created_at');

    if (error) {
      console.error('Debug users-company fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch debug users data' },
        { status: 500 }
      );
    }

    // 企業別集計
    const groupedByCompany = data?.reduce((acc: any, user: any) => {
      const companyKey = user.company_id || 'NULL (既存企業)';
      if (!acc[companyKey]) {
        acc[companyKey] = [];
      }
      acc[companyKey].push(user);
      return acc;
    }, {}) || {};

    return NextResponse.json({
      success: true,
      allUsers: data || [],
      groupedByCompany,
      summary: {
        totalUsers: data?.length || 0,
        companiesCount: Object.keys(groupedByCompany).length,
        companyBreakdown: Object.keys(groupedByCompany).map(key => ({
          company: key,
          userCount: groupedByCompany[key].length,
          users: groupedByCompany[key].map((u: any) => u.name)
        }))
      }
    });
  } catch (error) {
    console.error('Debug users-company API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
