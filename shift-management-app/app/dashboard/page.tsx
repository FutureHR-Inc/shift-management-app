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
    loadDashboardData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      // 並列でデータを取得
      const [
        { data: shiftsData },
        shiftRequestsResponse, // APIルート経由に変更
        emergencyResponse, // APIルート経由に変更
        { data: usersData },
        { data: storesData },
        { data: shiftPatternsData }
      ] = await Promise.all([
        supabase.from('shifts').select('*'),
        fetch('/api/shift-requests?status=submitted'), // シフト希望APIルート経由
        fetch('/api/emergency-requests'), // APIルート経由に変更
        supabase.from('users').select(`
          *,
          user_stores (
            store_id,
            stores (*)
          )
        `),
        supabase.from('stores').select(`
          *,
          time_slots(*)
        `),
        supabase.from('shift_patterns').select('*')
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

      // state変数を設定
      setEmergencyRequests(emergencyData as DatabaseEmergencyRequest[]);
      setOpenEmergencies(openEmergencies);

      // 統計情報を設定
      setStats({
        totalShifts: todayShifts.length,
        pendingRequests: pendingRequests.length,
        openEmergencies: openEmergencies.length,
        totalStaff: usersData?.length || 0
      });

      // 店舗別時間帯データを設定
      const timeSlotsData: { [storeId: string]: TimeSlot[] } = {};
      (storesData as any[])?.forEach(store => {
        if (store.time_slots) {
          timeSlotsData[store.id] = store.time_slots;
        }
      });
      setTimeSlots(timeSlotsData);

      // デバッグ用：店舗データの構造を確認
      if (process.env.NODE_ENV === 'development') {
        console.log('🏪 Store data structure:', storesData);
        console.log('⏰ Time slots data:', timeSlotsData);
      }

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

      // 店舗別スタッフィング状況の計算を改善
      const staffingData = (storesData as DashboardStore[] || []).map(store => {
        const storeShifts = todayShifts.filter(shift => shift.store_id === store.id);
        
        // 今日の曜日を取得
        const today = new Date();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayDayName = dayNames[today.getDay()];
        
        // デバッグ用：今日の曜日を確認
        if (process.env.NODE_ENV === 'development') {
          console.log('📅 今日の曜日判定:', {
            today: today.toLocaleDateString('ja-JP'),
            dayIndex: today.getDay(),
            todayDayName: todayDayName
          });
        }
        
        // 各時間帯の必要人数を取得
        const storeTimeSlots = timeSlots[store.id] || [];
        let totalRequired = 0;
        let totalScheduled = 0;
        let hasRequiredSettings = false;
        let allSlotsSufficient = true;
        
        // デバッグ用：店舗情報を確認
        if (process.env.NODE_ENV === 'development') {
          console.log(`🏪 ${store.name} の処理開始:`, {
            storeId: store.id,
            timeSlots: storeTimeSlots.length,
            todayShifts: storeShifts.length,
            requiredStaffExists: !!store.required_staff,
            requiredStaffForToday: store.required_staff ? store.required_staff[todayDayName] : null
          });
        }
        
        // 時間帯別の詳細情報
        const timeSlotDetails = storeTimeSlots.map(slot => {
          let required = 0;
          let slotHasSettings = false;
          
          // デバッグ用：店舗の必要人数設定を確認
          if (process.env.NODE_ENV === 'development') {
            console.log(`🏪 ${store.name} - ${todayDayName} - slot ${slot.id} (${slot.name}):`, {
              hasRequiredStaff: !!store.required_staff,
              requiredStaffData: store.required_staff,
              hasDayData: !!(store.required_staff && store.required_staff[todayDayName]),
              dayData: store.required_staff ? store.required_staff[todayDayName] : null,
              hasSlotData: !!(store.required_staff && store.required_staff[todayDayName] && store.required_staff[todayDayName][slot.id])
            });
          }
          
          // 必要人数の取得（より安全なアクセス方法）
          try {
            if (store.required_staff && 
                typeof store.required_staff === 'object' && 
                store.required_staff[todayDayName] && 
                typeof store.required_staff[todayDayName] === 'object' && 
                store.required_staff[todayDayName][slot.id] !== undefined) {
              const requiredValue = store.required_staff[todayDayName][slot.id];
              if (typeof requiredValue === 'number' && requiredValue > 0) {
                required = requiredValue;
                slotHasSettings = true;
                hasRequiredSettings = true;
              }
            }
          } catch (error) {
            console.warn(`🚨 Error accessing required_staff for ${store.name} - ${todayDayName} - ${slot.id}:`, error);
          }
          
          // この時間帯に配置されているシフト数を計算
          const slotShifts = storeShifts.filter(shift => {
            // time_slot_idを直接使用する場合
            if (shift.time_slot_id) {
              return shift.time_slot_id === slot.id;
            }
            // パターンから時間帯を取得する場合（フォールバック）
            return getTimeSlotForPattern(shift.pattern_id, store.id) === slot.id;
          });
          
          const scheduled = slotShifts.length;
          totalScheduled += scheduled;
          totalRequired += required;
          
          // この時間帯の状況判定
          let slotStatus: 'sufficient' | 'insufficient' | 'no_setting';
          if (!slotHasSettings) {
            slotStatus = 'no_setting';
          } else if (scheduled >= required) {
            slotStatus = 'sufficient';
          } else {
            slotStatus = 'insufficient';
            allSlotsSufficient = false;
          }
          
          return {
            name: slot.name,
            scheduled: scheduled,
            required: required,
            status: slotStatus
          };
        });
        
        // 全体の状況判定
        let overallStatus: 'sufficient' | 'insufficient' | 'no_setting' | 'no_assignment';
        
        if (!hasRequiredSettings) {
          // 必要人数の設定がない場合
          if (totalScheduled > 0) {
            overallStatus = 'no_setting'; // スタッフはいるが設定なし
          } else {
            overallStatus = 'no_assignment'; // スタッフも設定もなし
          }
        } else {
          // 必要人数の設定がある場合
          if (allSlotsSufficient && totalScheduled >= totalRequired) {
            overallStatus = 'sufficient';
          } else {
            overallStatus = 'insufficient';
          }
        }

        return {
          store: store.name,
          scheduled: totalScheduled,
          required: totalRequired,
          status: overallStatus,
          details: {
            timeSlots: timeSlotDetails
          }
        } as StoreStaffing;
      });

      setStoreStaffing(staffingData);
      setRecentRequests((requestsData as DashboardShiftRequest[])?.slice(0, 3) || []);
      setUsers((usersData as DatabaseUser[]) || []);
      setStores((storesData as DashboardStore[]) || []);
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
                  <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* 店舗全体の状況 */}
                    <div className="flex items-center justify-between p-3 bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-900 text-sm sm:text-base">{staffing.store}</p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          全体: {staffing.scheduled} / {staffing.required > 0 ? staffing.required : '-'} 人
                        </p>
                      </div>
                      <div className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                        staffing.status === 'sufficient' 
                          ? 'bg-green-100 text-green-800' 
                          : staffing.status === 'insufficient'
                          ? 'bg-red-100 text-red-800'
                          : staffing.status === 'no_setting'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {staffing.status === 'sufficient' ? '✅ 充足' 
                         : staffing.status === 'insufficient' ? '⚠️ 不足'
                         : staffing.status === 'no_setting' ? '⚙️ 設定なし'
                         : '📋 未配置'}
                      </div>
                    </div>
                    
                    {/* 時間帯別の詳細 */}
                    {staffing.details.timeSlots.length > 0 && (
                      <div className="px-3 pb-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          {staffing.details.timeSlots.map((slot, slotIndex) => (
                            <div key={slotIndex} className="flex items-center justify-between text-xs bg-white p-2 rounded border">
                              <span className="font-medium text-gray-700">{slot.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600">
                                  {slot.scheduled} / {slot.required > 0 ? slot.required : '-'}
                                </span>
                                <span className={`w-2 h-2 rounded-full ${
                                  slot.status === 'sufficient' ? 'bg-green-500'
                                  : slot.status === 'insufficient' ? 'bg-red-500'
                                  : 'bg-gray-400'
                                }`}></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {/* 凡例 */}
                <div className="text-xs text-gray-500 mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="font-medium text-blue-800 mb-2">表示について:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>✅ 充足: 必要人数を満たしています</div>
                    <div>⚠️ 不足: 必要人数に足りていません</div>
                    <div>⚙️ 設定なし: 必要人数が未設定です</div>
                    <div>📋 未配置: スタッフが配置されていません</div>
                  </div>
                </div>
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