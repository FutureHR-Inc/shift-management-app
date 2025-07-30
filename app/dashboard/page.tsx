'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

import { supabase } from '@/lib/supabase';
import { DatabaseUser, DatabaseEmergencyRequest } from '@/lib/types';

// ダッシュボード専用の型定義
interface DashboardStats {
  totalShifts: number;
  pendingRequests: number;
  openEmergencies: number;
  totalStaff: number;
}

interface StoreStaffing {
  store: string;
  scheduled: number;
  required: number;
  status: 'sufficient' | 'insufficient';
}

interface DashboardTimeOffRequest {
  id: string;
  user_id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface DashboardShift {
  id: string;
  user_id: string;
  store_id: string;
  date: string;
  pattern_id: string;
  status: 'draft' | 'confirmed' | 'completed';
}

interface DashboardStore {
  id: string;
  name: string;
  required_staff: {
    [day: string]: {
      [timeSlot: string]: number;
    };
  };
}

interface DashboardShiftPattern {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  break_time: number;
}

interface DashboardEmergencyRequest {
  id: string;
  original_user_id: string;
  store_id: string;
  date: string;
  shift_pattern_id: string;
  reason: string;
  status: 'open' | 'filled' | 'cancelled';
  created_at: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalShifts: 0,
    pendingRequests: 0,
    openEmergencies: 0,
    totalStaff: 0
  });
  const [storeStaffing, setStoreStaffing] = useState<StoreStaffing[]>([]);
  const [recentRequests, setRecentRequests] = useState<DashboardTimeOffRequest[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<DatabaseEmergencyRequest[]>([]);
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [shiftPatterns, setShiftPatterns] = useState<DashboardShiftPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  
  useEffect(() => {
    loadDashboardData();
  }, []);

    const loadDashboardData = async () => {
      try {
        setIsLoading(true);

      // 並列でデータを取得
      const [
        { data: shiftsData },
        { data: requestsData },
        { data: emergencyData },
        { data: usersData },
        { data: storesData },
        { data: shiftPatternsData }
      ] = await Promise.all([
        supabase.from('shifts').select('*'),
        supabase.from('time_off_requests').select('*'),
        supabase.from('emergency_requests').select(`
          *,
          original_user:users!emergency_requests_original_user_id_fkey(id, name, role),
          stores(id, name),
          shift_patterns(id, name, start_time, end_time),
          emergency_volunteers(
            id,
            user_id,
            responded_at,
            users(id, name, role, skill_level)
          )
        `),
        supabase.from('users').select(`
          *,
          user_stores (
            store_id,
            stores (*)
          )
        `),
        supabase.from('stores').select('*'),
        supabase.from('shift_patterns').select('*')
      ]);

      // 今日の日付
      const today = new Date().toISOString().split('T')[0];
      const todayShifts = (shiftsData as DashboardShift[])?.filter(shift => 
        shift.date === today && shift.status === 'confirmed'
      ) || [];
      const pendingRequests = (requestsData as DashboardTimeOffRequest[])?.filter(req => req.status === 'pending') || [];
      const openEmergencies = (emergencyData as DashboardEmergencyRequest[])?.filter(req => req.status === 'open') || [];

      // 統計情報を設定
      setStats({
        totalShifts: todayShifts.length,
        pendingRequests: pendingRequests.length,
        openEmergencies: openEmergencies.length,
        totalStaff: usersData?.length || 0
      });

      // 時間帯別の枠判定を行うヘルパー関数
      const getTimeSlotForPattern = (patternId: string): string | null => {
        const pattern = (shiftPatternsData as DashboardShiftPattern[])?.find(p => p.id === patternId);
        if (!pattern) return null;

        const startTime = pattern.start_time.split(':').map(Number);
        if (startTime.length < 2 || isNaN(startTime[0]) || isNaN(startTime[1])) return null;

        const startMinutes = startTime[0] * 60 + startTime[1];

        // 時間帯の判定（開始時間ベース）
        if (startMinutes >= 480 && startMinutes < 660) return 'morning';   // 8:00-11:00
        if (startMinutes >= 660 && startMinutes < 960) return 'lunch';     // 11:00-16:00
        if (startMinutes >= 960 && startMinutes < 1320) return 'evening';  // 16:00-22:00
        
        return null;
      };

      // 店舗別スタッフィング状況
      const staffingData = (storesData as DashboardStore[] || []).map(store => {
    const storeShifts = todayShifts.filter(shift => shift.store_id === store.id);
    
    // 今日の曜日を取得
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayDayName = dayNames[today.getDay()];
    
        // 各時間帯の必要人数を取得
        const timeSlots = ['morning', 'lunch', 'evening'];
        let totalRequired = 0;
        let allSlotsSufficient = true;
        
        if (store.required_staff && store.required_staff[todayDayName]) {
          const dayRequiredStaff = store.required_staff[todayDayName];
          
          timeSlots.forEach(slot => {
            const required = dayRequiredStaff[slot] && typeof dayRequiredStaff[slot] === 'number' 
              ? dayRequiredStaff[slot] : 0;
            totalRequired += required;
            
            // この時間帯に配置されているシフト数を計算
            const slotShifts = storeShifts.filter(shift => getTimeSlotForPattern(shift.pattern_id) === slot);
            
            // この時間帯が不足している場合
            if (slotShifts.length < required) {
              allSlotsSufficient = false;
    }
          });
        }
        
        // 必要人数が設定されていない場合のデフォルト値
        if (totalRequired === 0) {
          totalRequired = 8; // デフォルト値
        }

        return {
          store: store.name,
          scheduled: storeShifts.length,
          required: totalRequired,
          status: allSlotsSufficient ? 'sufficient' : 'insufficient'
        } as StoreStaffing;
      });

      setStoreStaffing(staffingData);
      setRecentRequests((requestsData as DashboardTimeOffRequest[])?.slice(0, 3) || []);
      setEmergencyRequests(openEmergencies.slice(0, 3) || []);
      setUsers((usersData as DatabaseUser[]) || []);
      setShiftPatterns((shiftPatternsData as DashboardShiftPattern[]) || []);

    } catch (error) {
      console.error('Dashboard data loading error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">データを読み込み中...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="space-y-8">
        {/* ヘッダー */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-gray-600 mt-2">
            {new Date().toLocaleDateString('ja-JP', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              weekday: 'long'
            })}
          </p>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 今日のシフト */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">今日のシフト</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.totalShifts}</div>
              <p className="text-sm text-gray-500 mt-1">件の勤務予定</p>
            </CardContent>
          </Card>

          {/* 保留中の希望休申請 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">保留中の申請</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{stats.pendingRequests}</div>
              <p className="text-sm text-gray-500 mt-1">件の希望休申請</p>
            </CardContent>
          </Card>

          {/* 代打募集 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">代打募集</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{stats.openEmergencies}</div>
              <p className="text-sm text-gray-500 mt-1">件の緊急募集</p>
            </CardContent>
          </Card>

          {/* 総スタッフ数 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">総スタッフ数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.totalStaff}</div>
              <p className="text-sm text-gray-500 mt-1">人のスタッフ</p>
            </CardContent>
          </Card>
        </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 今日の店舗別出勤状況 */}
          <Card>
            <CardHeader>
              <CardTitle>今日の店舗別出勤状況</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                {storeStaffing.map((staffing, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{staffing.store}</p>
                        <p className="text-sm text-gray-500">
                          {staffing.scheduled} / {staffing.required} 人
                        </p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      staffing.status === 'sufficient'
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                      {staffing.status === 'sufficient' ? '充足' : '不足'}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* 代打募集管理 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center space-x-3">
                <CardTitle>代打募集管理</CardTitle>
                {emergencyRequests.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                      {emergencyRequests.length}件募集中
                    </span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                      総応募者: {emergencyRequests.reduce((total, req) => total + (req.emergency_volunteers?.length || 0), 0)}名
                    </span>
                  </div>
                )}
              </div>
                <Button
                  variant="ghost"
                  size="sm"
                onClick={() => router.push('/shift/create')}
                >
                募集作成
                </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {emergencyRequests.length > 0 ? (
                  emergencyRequests.map((request) => {
                    const user = users.find(u => u.id === request.original_user_id);
                    const volunteerCount = request.emergency_volunteers?.length || 0;
                    const requestDate = new Date(request.date);
                    const today = new Date();
                    const daysUntil = Math.ceil((requestDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    
                    // 応募状況による色分け
                    const getStatusInfo = () => {
                      if (volunteerCount === 0) {
                        return {
                          bgColor: 'bg-red-50 border-red-200',
                          badgeColor: 'bg-red-100 text-red-800',
                          icon: '🆘',
                          status: '応募者募集中',
                          pulse: daysUntil <= 1 ? 'animate-pulse' : ''
                        };
                      } else if (volunteerCount <= 2) {
                        return {
                          bgColor: 'bg-orange-50 border-orange-200',
                          badgeColor: 'bg-orange-100 text-orange-800',
                          icon: '⚠️',
                          status: '応募者少',
                          pulse: ''
                        };
                      } else {
                        return {
                          bgColor: 'bg-green-50 border-green-200',
                          badgeColor: 'bg-green-100 text-green-800',
                          icon: '✅',
                          status: '応募者十分',
                          pulse: ''
                        };
                      }
                    };

                    const statusInfo = getStatusInfo();

                    // 緊急度による表示
                    const getUrgencyInfo = () => {
                      if (daysUntil < 0) {
                        return { text: '過去の募集', color: 'text-gray-500' };
                      } else if (daysUntil === 0) {
                        return { text: '今日', color: 'text-red-600 font-bold' };
                      } else if (daysUntil === 1) {
                        return { text: '明日', color: 'text-orange-600 font-semibold' };
                      } else if (daysUntil <= 3) {
                        return { text: `${daysUntil}日後`, color: 'text-yellow-600' };
                      } else {
                        return { text: `${daysUntil}日後`, color: 'text-gray-600' };
                      }
                    };

                    const urgencyInfo = getUrgencyInfo();

                    return (
                      <div 
                        key={request.id} 
                        className={`border rounded-lg p-3 ${statusInfo.bgColor} ${statusInfo.pulse} transition-all duration-200 hover:shadow-md`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <div>
                              <p className="font-medium text-gray-900">{user?.name || '不明なユーザー'}</p>
                              <div className="flex items-center space-x-2">
                                <p className="text-sm text-gray-500">
                                  {new Date(request.date).toLocaleDateString('ja-JP')}
                                </p>
                                <span className={`text-xs ${urgencyInfo.color}`}>
                                  ({urgencyInfo.text})
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.badgeColor}`}>
                              {statusInfo.icon} {statusInfo.status}
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-xs text-gray-600 mb-3">理由: {request.reason}</p>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="text-sm text-gray-700">
                              応募者: 
                              <span className={`ml-1 font-bold ${
                                volunteerCount === 0 ? 'text-red-600' :
                                volunteerCount <= 2 ? 'text-orange-600' : 'text-green-600'
                              }`}>
                                {volunteerCount}名
                              </span>
                            </div>
                            {volunteerCount > 0 && (
                              <div className="flex -space-x-1">
                                {request.emergency_volunteers?.slice(0, 3).map((volunteer) => (
                                  <div 
                                    key={volunteer.id}
                                    className="w-6 h-6 bg-blue-100 border-2 border-white rounded-full flex items-center justify-center text-xs font-medium text-blue-600"
                                    title={volunteer.user?.name || '不明'}
                                  >
                                    {volunteer.user?.name?.charAt(0) || '?'}
                                  </div>
                                ))}
                                {volunteerCount > 3 && (
                                  <div className="w-6 h-6 bg-gray-100 border-2 border-white rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                                    +{volunteerCount - 3}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <Button
                            size="sm"
                            variant={volunteerCount > 0 ? "primary" : "secondary"}
                            onClick={() => router.push(`/shift/create?emergency=${request.id}`)}
                            className={`${
                              volunteerCount > 0 
                                ? 'bg-blue-600 hover:bg-blue-700 text-white relative' 
                                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                            } transition-all duration-200`}
                          >
                            {volunteerCount > 0 && (
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                                {volunteerCount}
                              </div>
                            )}
                            管理
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-gray-500 text-center py-4">代打募集はありません</p>
                  )}
                </div>
            </CardContent>
          </Card>
        </div>

        {/* 最近の希望休申請 */}
          <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>最近の希望休申請</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
              onClick={() => router.push('/requests')}
                >
              すべて表示
                </Button>
            </CardHeader>
            <CardContent>
            <div className="space-y-3">
              {recentRequests.length > 0 ? (
                recentRequests.map((request) => {
                  const user = users.find(u => u.id === request.user_id);
                  return (
                    <div key={request.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{user?.name || '不明なユーザー'}</p>
                        <p className="text-sm text-gray-500">{request.date} - {request.reason}</p>
                </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        request.status === 'pending' 
                          ? 'bg-yellow-100 text-yellow-800'
                          : request.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                          }`}>
                        {request.status === 'pending' ? '保留' : 
                         request.status === 'approved' ? '承認' : '拒否'}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-4">申請はありません</p>
                  )}
                </div>
            </CardContent>
          </Card>

        {/* クイックアクション */}
        <Card>
          <CardHeader>
            <CardTitle>クイックアクション</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                className="h-16 flex flex-col items-center justify-center space-y-1"
                onClick={() => router.push('/shift/create')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>新しいシフト作成</span>
              </Button>
              
              <Button 
                variant="secondary" 
                className="h-16 flex flex-col items-center justify-center space-y-1"
                onClick={() => router.push('/staff')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                <span>スタッフ管理</span>
              </Button>
              
              <Button 
                variant="secondary" 
                className="h-16 flex flex-col items-center justify-center space-y-1"
                onClick={() => router.push('/settings/store')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>店舗設定</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
} 