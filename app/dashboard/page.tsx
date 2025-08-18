'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

import { supabase } from '@/lib/supabase';
import { DatabaseUser, DatabaseEmergencyRequest, TimeSlot } from '@/lib/types';
import { getSubmissionPeriods } from '@/lib/utils';

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
  status: 'sufficient' | 'insufficient' | 'no_setting' | 'no_assignment';
  details: {
    timeSlots: Array<{
      name: string;
      scheduled: number;
      required: number;
      status: 'sufficient' | 'insufficient' | 'no_setting';
    }>;
  };
}

interface DashboardShiftRequest {
  id: string;
  user_id: string;
  submission_period: string;
  date: string;
  priority: number;
  status: string;
  created_at: string;
  submitted_at: string;
  users?: DatabaseUser;
  stores?: { id: string; name: string };
  time_slots?: TimeSlot;
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

// DatabaseEmergencyRequestを使用するため、この型定義は削除

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalShifts: 0,
    pendingRequests: 0,
    openEmergencies: 0,
    totalStaff: 0
  });
  const [storeStaffing, setStoreStaffing] = useState<StoreStaffing[]>([]);
  const [recentRequests, setRecentRequests] = useState<DashboardShiftRequest[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<DatabaseEmergencyRequest[]>([]);
  const [openEmergencies, setOpenEmergencies] = useState<DatabaseEmergencyRequest[]>([]);
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [stores, setStores] = useState<DashboardStore[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [shiftPatterns, setShiftPatterns] = useState<DashboardShiftPattern[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [timeSlots, setTimeSlots] = useState<{ [storeId: string]: TimeSlot[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<DatabaseUser | null>(null);
  const router = useRouter();
  
  useEffect(() => {
    // ローカルストレージからcurrentUserを取得
    const user = localStorage.getItem('currentUser');
    if (user) {
      setCurrentUser(JSON.parse(user));
    }
  }, []);

  useEffect(() => {
    // currentUserが設定された後にデータを読み込み
    if (currentUser) {
      loadDashboardData();
    }
  }, [currentUser]);

  // 代打募集に応募する関数
  const handleApplyEmergency = async (requestId: string) => {
    if (!currentUser) return;

    try {
      const response = await fetch('/api/emergency-volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergency_request_id: requestId,
          user_id: currentUser.id
        })
      });

      if (response.ok) {
        // データを再読み込み
        loadDashboardData();
        alert('代打募集に応募しました');
      } else {
        const errorData = await response.json();
        alert(errorData.error || '応募に失敗しました');
      }
    } catch (error) {
      console.error('応募エラー:', error);
      alert('応募に失敗しました');
    }
  };

    const loadDashboardData = async () => {
      try {
        setIsLoading(true);

        // currentUserが設定されていない場合は待機
        if (!currentUser?.id) {
          console.log('currentUser not set, waiting...');
          setIsLoading(false);
          return;
        }

      // 並列でデータを取得（企業フィルタリング対応）
      const [
        { data: shiftsData },
        shiftRequestsResponse, // APIルート経由に変更
        emergencyResponse, // APIルート経由に変更
        usersResponse, // APIルート経由に変更（企業フィルタリング）
        storesResponse, // APIルート経由に変更（企業フィルタリング）
        timeSlotsResponse
      ] = await Promise.all([
        supabase.from('shifts').select('*'),
        fetch('/api/shift-requests?status=submitted'), // シフト希望APIルート経由
        fetch('/api/emergency-requests'), // APIルート経由に変更
        fetch(`/api/users?current_user_id=${currentUser.id}`), // 企業フィルタリング
        fetch(`/api/stores?current_user_id=${currentUser.id}`), // 企業フィルタリング
        fetch(`/api/time-slots?current_user_id=${currentUser.id}`) // shift_patternsの代替としてtime_slotsを使用
      ]);

      // emergency_requestsはAPIレスポンスから取得
      let emergencyData = [];
      if (emergencyResponse.ok) {
        const emergencyResult = await emergencyResponse.json();
        emergencyData = emergencyResult.data || [];
      } else {
        console.error('Emergency requests API error:', await emergencyResponse.text());
      }

      // shift_requestsはAPIレスポンスから取得
      let requestsData = [];
      if (shiftRequestsResponse.ok) {
        const shiftRequestsResult = await shiftRequestsResponse.json();
        requestsData = shiftRequestsResult.data || [];
      } else {
        console.error('Shift requests API error:', await shiftRequestsResponse.text());
      }

      // 今日の日付
      const today = new Date().toISOString().split('T')[0];
      const todayShifts = (shiftsData as DashboardShift[])?.filter(shift => 
        shift.date === today && shift.status === 'confirmed'
      ) || [];
      const pendingRequests = (requestsData as DashboardShiftRequest[])?.filter(req => req.status === 'submitted') || [];
      const openEmergencies = (emergencyData as DatabaseEmergencyRequest[])?.filter(req => 
        req.status === 'open' && req.original_user_id !== currentUser?.id
      ) || [];

      // users と stores データをAPIレスポンスから取得
      let usersData = [];
      if (usersResponse.ok) {
        const usersResult = await usersResponse.json();
        usersData = usersResult.data || [];
      } else {
        console.error('Users API error:', await usersResponse.text());
      }

      let storesData = [];
      if (storesResponse.ok) {
        const storesResult = await storesResponse.json();
        storesData = storesResult.data || [];
      } else {
        console.error('Stores API error:', await storesResponse.text());
      }

      // state変数を設定
      setUsers(usersData);
      setStores(storesData);
      setEmergencyRequests(emergencyData as DatabaseEmergencyRequest[]);
      setOpenEmergencies(openEmergencies);

      // 統計情報を設定（企業フィルタリング済みデータ）
      setStats({
        totalShifts: todayShifts.length,
        pendingRequests: pendingRequests.length,
        openEmergencies: openEmergencies.length,
        totalStaff: usersData.length || 0 // 企業別スタッフ数
      });

      // 時間帯別の枠判定を行うヘルパー関数
      const getTimeSlotForPattern = (patternId: string, storeId: string): string | null => {
        const pattern = (shiftPatternsData as DashboardShiftPattern[])?.find(p => p.id === patternId);
        if (!pattern) return null;

        const startTime = pattern.start_time.split(':').map(Number);
        if (startTime.length < 2 || isNaN(startTime[0]) || isNaN(startTime[1])) return null;

        const startMinutes = startTime[0] * 60 + startTime[1];

        // 動的時間帯の判定（該当店舗の時間帯設定を使用）
        const storeTimeSlots = timeSlots[storeId] || [];
        for (const slot of storeTimeSlots) {
          const [slotStartHour, slotStartMin] = slot.start_time.split(':').map(Number);
          const [slotEndHour, slotEndMin] = slot.end_time.split(':').map(Number);
          const slotStartMinutes = slotStartHour * 60 + slotStartMin;
          const slotEndMinutes = slotEndHour * 60 + slotEndMin;
          
          if (startMinutes >= slotStartMinutes && startMinutes < slotEndMinutes) {
            return slot.id;
      }
        }
        
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
        const storeTimeSlots = timeSlots[store.id] || [];
        let totalRequired = 0;
        let allSlotsSufficient = true;
        
        if (store.required_staff && store.required_staff[todayDayName]) {
          const dayRequiredStaff = store.required_staff[todayDayName];
          
          storeTimeSlots.forEach(slot => {
            const required = dayRequiredStaff[slot.id] && typeof dayRequiredStaff[slot.id] === 'number' 
              ? dayRequiredStaff[slot.id] : 0;
            totalRequired += required;
            
            // この時間帯に配置されているシフト数を計算
            const slotShifts = storeShifts.filter(shift => getTimeSlotForPattern(shift.pattern_id, store.id) === slot.id);
            
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

      // time_slotsレスポンス処理
      let timeSlotsData = [];
      if (timeSlotsResponse.ok) {
        const timeSlotsResult = await timeSlotsResponse.json();
        timeSlotsData = timeSlotsResult.data || [];
      } else {
        console.error('Time slots API error:', await timeSlotsResponse.text());
      }

      setStoreStaffing(staffingData);
      setRecentRequests((requestsData as DashboardShiftRequest[])?.slice(0, 3) || []);
      setUsers((usersData as DatabaseUser[]) || []);
      setStores((storesData as DashboardStore[]) || []);
      setShiftPatterns((timeSlotsData as DashboardShiftPattern[]) || []); // time_slotsをshift_patternsとして使用

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

  const userRole = currentUser?.role;

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
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">今日のシフト</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.totalShifts}</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">件の勤務予定</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">代打募集中</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-orange-600">{stats.openEmergencies}</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">件の募集</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">未確認希望</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-red-600">{stats.pendingRequests}</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">件の希望</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">総スタッフ数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-green-600">{stats.totalStaff}</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">人のスタッフ</p>
            </CardContent>
          </Card>
        </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          {/* 今日の店舗別出勤状況 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">今日の店舗別出勤状況</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3 sm:space-y-4">
                {storeStaffing.map((staffing, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 text-sm sm:text-base">{staffing.store}</p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {staffing.scheduled} / {staffing.required} 人
                        </p>
                      </div>
                      <div className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
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

          {/* 代打募集セクション */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span>代打募集</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => router.push('/emergency-management')}
                    size="sm"
                    className="flex-1 sm:flex-none text-xs sm:text-sm"
                  >
                    募集作成
                  </Button>
                  {userRole === 'manager' && (
                    <Button
                      onClick={() => router.push('/emergency-management?tab=manage')}
                      variant="secondary"
                      size="sm" 
                      className="flex-1 sm:flex-none text-xs sm:text-sm"
                    >
                      応募管理
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {openEmergencies.length === 0 ? (
                <p className="text-gray-500 text-sm">現在、代打募集はありません</p>
              ) : (
                <div className="space-y-3">
                  {openEmergencies.slice(0, 3).map((emergency: DatabaseEmergencyRequest) => (
                    <div key={emergency.id} className="border-l-4 border-orange-400 pl-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {users.find(u => u.id === emergency.original_user_id)?.name || '不明なユーザー'}さん
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {new Date(emergency.date || '').toLocaleDateString('ja-JP', { 
                              month: 'numeric', 
                              day: 'numeric', 
                              weekday: 'short' 
                            })} | {stores.find(s => s.id === emergency.store_id)?.name || '不明な店舗'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            📝 {emergency.reason}
                          </p>
                        </div>
                        {userRole === 'manager' && (emergency.emergency_volunteers?.length || 0) > 0 && (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full whitespace-nowrap">
                              応募{emergency.emergency_volunteers?.length || 0}名
                            </span>
                            <Button
                              onClick={() => router.push(`/emergency-management?tab=manage&manage=${emergency.id}`)}
                              size="sm"
                              variant="secondary"
                              className="text-xs whitespace-nowrap w-full sm:w-auto"
                            >
                              管理
                            </Button>
                          </div>
                        )}
                        {userRole === 'staff' && !emergency.emergency_volunteers?.some(v => v.user_id === currentUser?.id) && (
                          <Button
                            onClick={() => handleApplyEmergency(emergency.id)}
                            size="sm"
                            className="text-xs whitespace-nowrap w-full sm:w-auto"
                          >
                            応募する
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {openEmergencies.length > 3 && (
                    <div className="text-center">
                      <Button
                        onClick={() => router.push('/emergency-management')}
                        variant="ghost"
                        size="sm"
                        className="text-blue-600 hover:text-blue-700 text-sm"
                      >
                        すべて見る ({openEmergencies.length}件)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 最近のシフト希望 */}
          <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>最近のシフト希望</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
              onClick={() => router.push('/shift-requests')}
                >
              すべて表示
                </Button>
            </CardHeader>
            <CardContent>
            <div className="space-y-3">
              {recentRequests.length > 0 ? (
                recentRequests.map((request) => {
                  const user = users.find(u => u.id === request.user_id);
                  const submissionPeriods = getSubmissionPeriods();
                  const period = submissionPeriods.find(p => p.id === request.submission_period);
                  
                  return (
                    <div key={request.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{user?.name || '不明なユーザー'}</p>
                        <p className="text-sm text-gray-500">
                          {request.date} - {period?.label || request.submission_period} 
                          (優先度: {request.priority === 1 ? '最優先' : request.priority === 2 ? '希望' : '可能'})
                        </p>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        request.status === 'submitted' 
                          ? 'bg-blue-100 text-blue-800'
                          : request.status === 'converted_to_shift'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                        }`}>
                        {request.status === 'submitted' ? '提出済み' : 
                         request.status === 'converted_to_shift' ? 'シフト化済み' : request.status}
                        </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-4">シフト希望はありません</p>
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