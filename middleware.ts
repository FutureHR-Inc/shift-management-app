import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  const url = request.nextUrl.clone();
  
  // 開発環境では localhost のみ
  if (hostname === 'localhost' || hostname.includes('localhost')) {
    const requestHeaders = new Headers(request.headers);
    
    // クエリパラメータでcompany指定をチェック（開発環境のみ）
    const companyParam = url.searchParams.get('company');
    
    if (companyParam) {
      // ?company=企業名 で指定された場合
      requestHeaders.set('x-company-slug', companyParam);
      requestHeaders.set('x-is-legacy', 'false');
      console.log(`[MIDDLEWARE] Development mode - company specified: ${companyParam}`);
    } else {
      // デフォルトは既存企業（legacy-main）として処理
      requestHeaders.set('x-company-slug', 'legacy-main');
      requestHeaders.set('x-is-legacy', 'true');
      console.log(`[MIDDLEWARE] Development mode - default to legacy-main`);
    }
    
    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }
  
  // 本番環境では legacy-main として処理（現在は単一ドメイン運用）
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-company-slug', 'legacy-main');
  requestHeaders.set('x-is-legacy', 'true');
  
  console.log(`[MIDDLEWARE] Production mode - using legacy-main (single domain)`);
  
  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
