import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  const url = request.nextUrl.clone();
  
  // 開発環境では localhost のみ
  if (hostname === 'localhost' || hostname.includes('localhost')) {
    // デフォルトは既存企業（legacy-main）として処理
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-company-slug', 'legacy-main');
    requestHeaders.set('x-is-legacy', 'true');
    
    console.log(`[MIDDLEWARE] Development mode - default to legacy-main`);
    
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }
  
  // 本番環境でのサブドメイン処理（将来の実装）
  const companySlug = hostname.split('.')[0];
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-company-slug', companySlug);
  requestHeaders.set('x-is-legacy', 'false');
  
  console.log(`[MIDDLEWARE] Production mode - company: ${companySlug}`);
  
  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
