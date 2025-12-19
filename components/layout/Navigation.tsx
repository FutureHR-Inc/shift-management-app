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
  shiftRequestsCount: number;
  confirmedShiftsCount: number;
}

const Navigation = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [notifications, setNotifications] = useState<NotificationData>({
    emergencyRequestsCount: 0,
    shiftRequestsCount: 0,
    confirmedShiftsCount: 0
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
        // 管理者の場合のみシフト希望数と新規応募数を取得
        if (currentUser.role === 'manager') {
          // 未処理のシフト希望数を取得（現在の企業に紐づくもののみ）
          const shiftRequestsResponse = await fetch(
            `/api/shift-requests?status=submitted&current_user_id=${currentUser.id}`
          );
          let shiftRequestsCount = 0;
          
          if (shiftRequestsResponse.ok) {
            const shiftRequestsData = await shiftRequestsResponse.json();
            const allRequests = shiftRequestsData.data || [];
            
            // 現在のユーザーの企業IDを取得（localStorageから直接取得）
            // 念のため、/api/users エンドポイントから最新の企業IDを取得
            let currentUserCompanyId: string | null = currentUser.company_id || null;
            try {
              const userResponse = await fetch(`/api/users?current_user_id=${currentUser.id}`);
              if (userResponse.ok) {
                const userData = await userResponse.json();
                const latestUser = userData.data?.find((u: any) => u.id === currentUser.id);
                if (latestUser?.company_id) {
                  currentUserCompanyId = latestUser.company_id;
                }
              }
            } catch (err) {
              console.warn('ユーザー企業ID取得エラー:', err);
              // エラー時はlocalStorageの値をそのまま使用
            }
            
            // デバッグログ: 取得したデータの詳細を確認
            console.log('🔍 [NAVIGATION] シフト希望データ取得:', {
              totalCount: allRequests.length,
              currentUserId: currentUser.id,
              currentUserCompanyId: currentUserCompanyId,
              requests: allRequests.map((req: any) => ({
                id: req.id,
                user_id: req.user_id,
                user_name: req.users?.name,
                store_id: req.store_id,
                store_name: req.stores?.name,
                store_company_id: req.stores?.company_id,
                status: req.status,
                date: req.date
              }))
            });
            
            // 変換済みを除外し、企業IDもチェックしてカウント
            const unprocessedRequests = allRequests.filter(
              (request: any) => {
                // ステータスチェック: converted_to_shift は除外
                if (request.status === 'converted_to_shift') {
                  console.log('🔍 [NAVIGATION] 変換済みシフト希望を除外:', {
                    id: request.id,
                    user_name: request.users?.name,
                    store_name: request.stores?.name,
                    status: request.status
                  });
                  return false;
                }
                
                // storesが配列の場合とオブジェクトの場合を考慮
                const store = Array.isArray(request.stores) ? request.stores[0] : request.stores;
                
                // 企業IDチェック: 現在のユーザーの企業IDと一致するもののみ
                if (currentUserCompanyId !== null) {
                  const storeCompanyId = store?.company_id;
                  
                  // 店舗情報が取得できていない場合は除外
                  if (!store || !storeCompanyId) {
                    console.warn('⚠️ [NAVIGATION] 店舗情報が取得できていないシフト希望を除外:', {
                      id: request.id,
                      store_id: request.store_id,
                      stores: request.stores
                    });
                    return false;
                  }
                  
                  if (storeCompanyId !== currentUserCompanyId) {
                    console.warn('⚠️ [NAVIGATION] 他の企業のシフト希望を除外:', {
                      id: request.id,
                      store_name: store?.name,
                      store_company_id: storeCompanyId,
                      expected_company_id: currentUserCompanyId
                    });
                    return false;
                  }
                } else {
                  // currentUserCompanyIdがnullの場合、店舗情報が取得できていないものは除外
                  const store = Array.isArray(request.stores) ? request.stores[0] : request.stores;
                  if (!store || !store.company_id) {
                    console.warn('⚠️ [NAVIGATION] 店舗情報が取得できていないシフト希望を除外:', {
                      id: request.id,
                      store_id: request.store_id,
                      stores: request.stores
                    });
                    return false;
                  }
                }
                
                return true;
              }
            );
            
            // デバッグログ: 企業IDの確認
            const companyIds = [...new Set(allRequests.map((req: any) => req.stores?.company_id))];
            console.log('🔍 [NAVIGATION] 企業ID一覧:', companyIds);
            
            shiftRequestsCount = unprocessedRequests.length;
            
            console.log('🔍 [NAVIGATION] シフト希望カウント結果:', {
              total: allRequests.length,
              unprocessed: unprocessedRequests.length,
              converted: allRequests.filter((r: any) => r.status === 'converted_to_shift').length,
              wrongCompany: allRequests.filter((r: any) => {
                if (currentUserCompanyId === null) return false;
                return r.stores?.company_id !== currentUserCompanyId && r.stores?.company_id !== null;
              }).length
            });
          }

          // 未処理の応募数を取得（承認も不採用も選択していない応募の数）
          let emergencyRequestsCount = 0;
          try {
            const emergencyResponse = await fetch(`/api/emergency-requests?current_user_id=${currentUser.id}`);
            if (emergencyResponse.ok) {
              const emergencyData = await emergencyResponse.json();
              const requests = emergencyData.data || [];
              
              // 既読情報を取得
              const viewedData = localStorage.getItem('emergency_request_viewed');
              const viewedMap: Record<string, string> = viewedData ? JSON.parse(viewedData) : {};
              
              // 各募集の未処理応募数をカウント
              emergencyRequestsCount = requests.reduce((total: number, request: any) => {
                const volunteers = request.emergency_volunteers || [];
                
                // 未処理の応募（statusがnull、undefined、または'pending'）のみをフィルタリング
                const unprocessedVolunteers = volunteers.filter((vol: any) => {
                  return !vol.status || vol.status === 'pending';
                });
                
                if (unprocessedVolunteers.length === 0) return total;
                
                // 最後に確認した時刻を取得
                const lastViewed = viewedMap[request.id];
                
                if (!lastViewed) {
                  // 未確認の場合は未処理の応募数を全てカウント
                  return total + unprocessedVolunteers.length;
                }
                
                // 最後に確認した時刻より後に応募があった未処理の応募をカウント
                const lastViewedTime = new Date(lastViewed).getTime();
                const newUnprocessedVolunteers = unprocessedVolunteers.filter((vol: any) => {
                  const volunteerTime = new Date(vol.responded_at).getTime();
                  return volunteerTime > lastViewedTime;
                });
                
                return total + newUnprocessedVolunteers.length;
              }, 0);
            }
          } catch (error) {
            console.error('未処理応募数の取得に失敗:', error);
          }

          setNotifications({
            emergencyRequestsCount: emergencyRequestsCount,
            shiftRequestsCount: shiftRequestsCount,
            confirmedShiftsCount: 0
          });
        } else if (currentUser.role === 'staff') {
          // スタッフの場合は新規代打募集数を取得（自分が応募していないもの）
          let emergencyRequestsCount = 0;
          try {
            const emergencyResponse = await fetch(`/api/emergency-requests?current_user_id=${currentUser.id}`);
            if (emergencyResponse.ok) {
              const emergencyData = await emergencyResponse.json();
              const requests = emergencyData.data || [];
              
              // 自分が応募していない、かつ自分が作成していない代打募集をカウント
              emergencyRequestsCount = requests.filter((req: any) => {
                // 自分が作成したものは除外
                if (req.original_user_id === currentUser.id) return false;
                // ステータスがopenでないものは除外
                if (req.status !== 'open') return false;
                // 自分が既に応募しているものは除外
                const hasApplied = req.emergency_volunteers?.some((vol: any) => vol.user_id === currentUser.id);
                return !hasApplied;
              }).length;
            }
          } catch (error) {
            console.error('新規代打募集数の取得に失敗:', error);
          }

          setNotifications({
            emergencyRequestsCount: emergencyRequestsCount,
            shiftRequestsCount: 0,
            confirmedShiftsCount: 0
          });
        } else {
          // その他の場合は全て0
          setNotifications({
            emergencyRequestsCount: 0,
            shiftRequestsCount: 0,
            confirmedShiftsCount: 0
          });
        }
      } catch (error) {
        console.error('通知データの取得に失敗:', error);
        // エラー時は0を設定
        setNotifications({
          emergencyRequestsCount: 0,
          shiftRequestsCount: 0,
          confirmedShiftsCount: 0
        });
      }
    };

    fetchNotifications();
    
    // 30秒ごとに通知データを更新
    const interval = setInterval(fetchNotifications, 30000);
    
    // カスタムイベントリスナーを追加（手動更新用）
    const handleUpdateNotifications = () => {
      fetchNotifications();
    };
    
    window.addEventListener('updateShiftRequestNotifications', handleUpdateNotifications);
    window.addEventListener('updateShiftConfirmations', handleUpdateNotifications);
    window.addEventListener('updateEmergencyNotifications', handleUpdateNotifications);
    window.addEventListener('updateEmergencyRequests', handleUpdateNotifications);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('updateShiftRequestNotifications', handleUpdateNotifications);
      window.removeEventListener('updateShiftConfirmations', handleUpdateNotifications);
      window.removeEventListener('updateEmergencyNotifications', handleUpdateNotifications);
    };
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
    { href: '/dashboard', label: 'ダッシュボード', icon: 'home' },
    { href: '/shift/create', label: 'シフト作成', icon: 'calendar' },
    { href: '/shift-requests', label: 'シフト希望確認', icon: 'clipboard' },
    { href: '/emergency-management', label: '代打募集管理', icon: 'users' },
    { href: '/staff', label: 'スタッフ管理', icon: 'user' },
    { href: '/settings/store', label: '店舗設定', icon: 'settings' },
  ];

  const staffNavItems = [
    { href: '/staff-dashboard', label: 'ダッシュボード', icon: 'home' },
    { href: '/my-shift', label: 'マイシフト', icon: 'calendar' },
    { href: '/shift-request', label: 'シフト希望提出', icon: 'edit' },
    { href: '/emergency', label: '代打募集', icon: 'users' },
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
    
    // 数値が99を超えた場合は99+と表示
    const displayCount = count > 99 ? '99+' : count.toString();
    
    return (
      <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-xs font-bold rounded-full">
        {displayCount}
      </span>
    );
  };

  const renderIcon = (iconName: string) => {
    const iconProps = "w-5 h-5 lg:w-5 lg:h-5 flex-shrink-0";
    switch (iconName) {
      case 'home':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        );
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case 'user':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case 'edit':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case 'x-circle':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
      case 'clipboard':
        return (
          <svg className={iconProps} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-18">
          {/* ロゴとブランド */}
          <div className="flex items-center">
            <Link 
              href={currentUser?.role === 'manager' ? '/dashboard' : '/staff-dashboard'} 
              className="flex items-center space-x-3"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-xl sm:text-2xl font-semibold text-gray-900 whitespace-nowrap">シフト管理</span>
            </Link>
          </div>

          {/* デスクトップメニュー */}
          <div className="hidden md:flex items-center space-x-4 lg:space-x-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 relative whitespace-nowrap ${
                  pathname === item.href
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <div className="relative flex-shrink-0">
                  {renderIcon(item.icon)}
                  {/* シフト希望確認にバッジ表示 */}
                  {item.href === '/shift-requests' && (
                    <NotificationBadge count={notifications.shiftRequestsCount} />
                  )}
                  {/* 代打募集管理に新規応募バッジ表示（店長のみ） */}
                  {item.href === '/emergency-management' && currentUser?.role === 'manager' && (
                    <NotificationBadge count={notifications.emergencyRequestsCount} />
                  )}
                  {/* 代打募集に新規募集バッジ表示（スタッフのみ） */}
                  {item.href === '/emergency' && currentUser?.role === 'staff' && (
                    <NotificationBadge count={notifications.emergencyRequestsCount} />
                  )}
                </div>
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            ))}
          </div>

          {/* ユーザー情報とメニューボタン */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* ユーザー情報（デスクトップのみ） */}
            {currentUser && (
              <div className="hidden lg:block text-right">
                <p className="text-sm font-medium text-gray-900 whitespace-nowrap">{currentUser.name}</p>
                <p className="text-xs text-gray-500 whitespace-nowrap">
                  {currentUser.role === 'manager' ? '店長' : 'スタッフ'}
                </p>
              </div>
            )}
            
            {/* ログアウトボタン（デスクトップのみ） */}
            <button
              onClick={handleLogout}
              className="hidden md:block text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200 px-3 py-2 rounded whitespace-nowrap"
            >
              ログアウト
            </button>

            {/* モバイルメニューボタン - タップエリア拡大 */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 min-w-[48px] min-h-[48px] flex items-center justify-center"
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
      {isMobileMenuOpen && currentUser && (
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
                <div className="flex-shrink-0 relative flex items-center justify-center min-w-[20px] min-h-[20px]">
                  {renderIcon(item.icon)}
                  {/* シフト希望確認にバッジ表示 */}
                  {item.href === '/shift-requests' && (
                    <NotificationBadge count={notifications.shiftRequestsCount} />
                  )}
                  {/* 代打募集管理に新規応募バッジ表示（店長のみ） */}
                  {item.href === '/emergency-management' && currentUser?.role === 'manager' && (
                    <NotificationBadge count={notifications.emergencyRequestsCount} />
                  )}
                  {/* 代打募集に新規募集バッジ表示（スタッフのみ） */}
                  {item.href === '/emergency' && currentUser?.role === 'staff' && (
                    <NotificationBadge count={notifications.emergencyRequestsCount} />
                  )}
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