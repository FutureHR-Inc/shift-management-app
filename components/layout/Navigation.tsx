'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'staff';
  loginId: string;
  stores: string[];
}

interface NotificationData {
  emergencyRequestsCount: number;
  timeOffRequestsCount: number;
}

const Navigation = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [notifications, setNotifications] = useState<NotificationData>({
    emergencyRequestsCount: 0,
    timeOffRequestsCount: 0
  });

  // ログインユーザー情報を取得
  useEffect(() => {
    const userInfo = localStorage.getItem('currentUser');
    if (userInfo) {
      try {
        const user = JSON.parse(userInfo);
        setCurrentUser(user);
      } catch (error) {
        console.error('ユーザー情報の解析に失敗:', error);
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
  }, [router]);

  // 通知データを取得
  useEffect(() => {
    if (!currentUser) return;

    const fetchNotifications = async () => {
      try {
        if (currentUser.role === 'staff') {
          // スタッフ用：代打募集件数を取得
          const emergencyResponse = await fetch('/api/emergency-requests?status=open');
          if (emergencyResponse.ok) {
            const emergencyResult = await emergencyResponse.json();
            
            // ユーザーの今後のシフトを取得
            const today = new Date().toISOString().split('T')[0];
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30); // 30日先まで
            const futureDateStr = futureDate.toISOString().split('T')[0];
            
            const shiftsResponse = await fetch(`/api/shifts?user_id=${currentUser.id}&date_from=${today}&date_to=${futureDateStr}`);
            const userShifts = shiftsResponse.ok ? (await shiftsResponse.json()).data || [] : [];
            const userShiftDates = new Set(userShifts.map((shift: { date: string }) => shift.date));
            
            const availableRequests = emergencyResult.data?.filter((request: { date: string; emergency_volunteers?: { user_id: string }[] }) => {
              // 既に応募済みでない
              const alreadyApplied = request.emergency_volunteers?.some((volunteer: { user_id: string }) => 
                volunteer.user_id === currentUser.id
              );
              
              // 同じ日にシフトがない
              const hasShiftOnDate = userShiftDates.has(request.date);
              
              return !alreadyApplied && !hasShiftOnDate;
            }) || [];
            
            setNotifications(prev => ({
              ...prev,
              emergencyRequestsCount: availableRequests.length
            }));
          }
        } else if (currentUser.role === 'manager') {
          // 管理者用：承認待ち希望休申請件数を取得
          const requestsResponse = await fetch('/api/time-off-requests?status=pending');
          if (requestsResponse.ok) {
            const requestsResult = await requestsResponse.json();
            setNotifications(prev => ({
              ...prev,
              timeOffRequestsCount: requestsResult.data?.length || 0
            }));
          }
        }
      } catch (error) {
        console.error('通知データの取得に失敗:', error);
      }
    };

    fetchNotifications();
    
    // 30秒ごとに通知データを更新
    const interval = setInterval(fetchNotifications, 30000);
    
    return () => clearInterval(interval);
  }, [currentUser]);

  // ユーザー情報が読み込まれていない場合はローディング表示
  if (!currentUser) {
    return (
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="animate-pulse h-8 w-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  const managerNavItems = [
    { href: '/dashboard', label: 'ダッシュボード', icon: 'dashboard', badge: 0 },
    { href: '/shift/create', label: 'シフト作成', icon: 'calendar', badge: 0 },
    { href: '/staff', label: 'スタッフ管理', icon: 'users', badge: 0 },
    { href: '/requests', label: '希望休申請', icon: 'clock', badge: notifications.timeOffRequestsCount },
    { href: '/settings/store', label: '店舗設定', icon: 'settings', badge: 0 },
  ];

  const staffNavItems = [
    { href: '/staff-dashboard', label: 'ダッシュボード', icon: 'dashboard', badge: 0 },
    { href: '/my-shift', label: 'マイシフト', icon: 'calendar', badge: 0 },
    { href: '/request-off', label: '希望休申請', icon: 'clock', badge: 0 },
    { href: '/emergency', label: '代打募集', icon: 'alert', badge: notifications.emergencyRequestsCount },
  ];

  const navItems = currentUser.role === 'manager' ? managerNavItems : staffNavItems;

  // ログアウト処理
  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    router.push('/login');
  };

  // バッジコンポーネント
  const NotificationBadge = ({ count }: { count: number }) => {
    if (count === 0) return null;
    
    return (
      <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full min-w-[20px]">
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  const renderIcon = (iconName: string) => {
    const iconProps = "w-5 h-5";
    switch (iconName) {
      case 'dashboard':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
          </svg>
        );
      case 'calendar':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'users':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        );
      case 'clock':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'settings':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'alert':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 sm:h-16">
          {/* ロゴとブランド - モバイル最適化 */}
          <div className="flex items-center">
            <Link href={currentUser.role === 'manager' ? '/dashboard' : '/staff-dashboard'} className="flex items-center space-x-2 sm:space-x-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-lg sm:text-xl font-semibold text-gray-900">シフト管理</span>
            </Link>
          </div>

          {/* デスクトップメニュー */}
          <div className="hidden md:flex items-center space-x-6 lg:space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 relative ${
                  pathname === item.href
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <div className="relative">
                  {renderIcon(item.icon)}
                  <NotificationBadge count={item.badge} />
                </div>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          {/* ユーザー情報とメニューボタン */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* ユーザー情報（デスクトップのみ） */}
            <div className="hidden lg:block text-right">
              <p className="text-sm font-medium text-gray-900">{currentUser.name}</p>
              <p className="text-xs text-gray-500">
                {currentUser.role === 'manager' ? '店長' : 'スタッフ'}
              </p>
            </div>
            
            {/* ログアウトボタン（デスクトップのみ） */}
            <button
              onClick={handleLogout}
              className="hidden md:block text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 px-2 py-1 rounded"
            >
              ログアウト
            </button>

            {/* モバイルメニューボタン - タップエリア拡大 */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="メニューを開く"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* モバイルメニュー - 改善されたレイアウト */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white shadow-lg">
          {/* ユーザー情報セクション */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                  {currentUser.name.charAt(0)}
                </span>
              </div>
              <div>
                <div className="text-base font-medium text-gray-800">{currentUser.name}</div>
                <div className="text-sm text-gray-500">
                  {currentUser.role === 'manager' ? '店長' : 'スタッフ'}
                </div>
              </div>
            </div>
          </div>

          {/* ナビゲーションメニュー */}
          <div className="py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-3 px-4 py-3 text-base font-medium transition-colors duration-200 min-h-[52px] relative ${
                  pathname === item.href
                    ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-500'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50 active:bg-gray-100'
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <div className="flex-shrink-0 relative">
                  {renderIcon(item.icon)}
                  <NotificationBadge count={item.badge} />
                </div>
                <span className="flex-1">{item.label}</span>
                {pathname === item.href && (
                  <div className="ml-auto">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </Link>
            ))}
          </div>

          {/* ログアウトボタン */}
          <div className="border-t border-gray-200 py-2">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-3 px-4 py-3 text-base font-medium text-red-600 hover:text-red-700 hover:bg-red-50 active:bg-red-100 transition-colors duration-200 w-full min-h-[52px]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>ログアウト</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation; 