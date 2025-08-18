import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    
    // 環境情報を取得
    const environment = {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      hostname: request.nextUrl.hostname,
      headers: {
        host: request.headers.get('host'),
        'x-company-slug': request.headers.get('x-company-slug'),
        'x-is-legacy': request.headers.get('x-is-legacy'),
      }
    };
    
    if (!userId) {
      // 全ユーザーの company_id 状況を確認
      const { data: allUsers, error } = await supabase
        .from('users')
        .select('id, name, email, company_id, role')
        .order('name');
      
      if (error) {
        return NextResponse.json({ error: 'Failed to fetch users', details: error }, { status: 500 });
      }
      
      return NextResponse.json({ 
        environment,
        totalUsers: allUsers?.length || 0,
        users: allUsers?.map(u => ({
          name: u.name,
          company_id: u.company_id,
          hasCompanyId: Boolean(u.company_id)
        })) || []
      });
    }
    
    // 特定ユーザーの詳細情報
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, email, company_id, role')
      .eq('id', userId)
      .single();
    
    if (userError) {
      return NextResponse.json({ 
        error: 'User not found', 
        details: userError,
        environment 
      }, { status: 404 });
    }
    
    // そのユーザーの企業に属する他のユーザーも取得
    let companyUsers: any[] = [];
    if (user.company_id) {
      const { data: companyUsersData } = await supabase
        .from('users')
        .select('id, name, email, company_id, role')
        .eq('company_id', user.company_id);
      companyUsers = companyUsersData || [];
    }
    
    return NextResponse.json({ 
      environment,
      user,
      hasCompanyId: Boolean(user.company_id),
      companyUsers: companyUsers.map(u => ({
        name: u.name,
        id: u.id,
        role: u.role
      }))
    });
    
  } catch (error) {
    console.error('Production check error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
