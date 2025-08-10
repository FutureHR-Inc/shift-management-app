'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CompactTimeSlider } from '@/components/ui/CompactTimeSlider';
import type { User, Store, TimeSlot, DatabaseEmergencyRequest, EmergencyVolunteer } from '@/lib/types';

interface ApiUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'manager' | 'staff';
}

interface ShiftTableDay {
  date: string;
  dayName: string;
  timeSlots: Array<{
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    requiredStaff: number;
    currentStaff: number;
    shortage: number;
    shifts: Array<{
      id: string;
      user_id: string;
      user_name: string;
      status: string;
      custom_start_time?: string;
      custom_end_time?: string;
      shift_data: any;
    }>;
  }>;
}

export default function EmergencyManagementPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // タブ管理
  const [activeTab, setActiveTab] = useState<'browse' | 'create' | 'manage'>('browse');

  // 代打募集データ
  const [emergencyRequests, setEmergencyRequests] = useState<DatabaseEmergencyRequest[]>([]);
  const [myShifts, setMyShifts] = useState<any[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // シフト表データ
  const [shiftTableData, setShiftTableData] = useState<ShiftTableDay[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [viewWeek, setViewWeek] = useState<Date>(new Date());

  // 代打募集作成用（シフト表から）
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // 応募管理用
  const [selectedRequestForManagement, setSelectedRequestForManagement] = useState<DatabaseEmergencyRequest | null>(null);
  const [volunteers, setVolunteers] = useState<EmergencyVolunteer[]>([]);
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [processingVolunteer, setProcessingVolunteer] = useState<string | null>(null);

  // カスタム時間設定
  const [customApprovalTime, setCustomApprovalTime] = useState({
    volunteerId: '',
    startTime: '',
    endTime: '',
    showCustomTime: false
  });

  // URL パラメータ処理
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const manageParam = urlParams.get('manage');
    
    // タブパラメータがある場合は該当タブを開く
    if (tabParam === 'manage') {
      setActiveTab('manage');
    } else if (tabParam === 'create') {
      setActiveTab('create');
    } else if (tabParam === 'browse') {
      setActiveTab('browse');
    }
    
    // 特定の募集を管理する場合
    if (manageParam && emergencyRequests.length > 0) {
      const targetRequest = emergencyRequests.find(req => req.id === manageParam);
      if (targetRequest) {
        setActiveTab('manage'); // 管理タブに切り替え
        // 少し遅延して管理モーダルを開く（タブ切り替え後）
        setTimeout(() => {
          handleManageRequest(targetRequest);
        }, 100);
      }
    }
  }, [emergencyRequests, router]);

  // データ取得
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 現在のユーザー情報をlocalStorageから取得
      const userInfo = localStorage.getItem('currentUser');
      if (!userInfo) {
        router.push('/login');
        return;
      }
      
      const user = JSON.parse(userInfo);
      setCurrentUser(user);

      console.log('📡 データ取得開始...');

      // 並行してデータ取得
      const [emergencyResult, shiftsResult, storesResult, timeSlotsResult, usersResult] = await Promise.all([
        fetch('/api/emergency-requests').then(res => res.json()),
        fetch('/api/shifts?user_id=current&include_future=true').then(res => res.json()),
        fetch('/api/stores').then(res => res.json()),
        fetch('/api/time-slots').then(res => res.json()),
        fetch('/api/users').then(res => res.json()) // ユーザーデータも取得
      ]);

      console.log('📦 取得したデータ:', {
        emergencyResult,
        shiftsResult,
        storesResult,
        timeSlotsResult,
        usersResult
      });

      // emergency-requests (data プロパティあり)
      if (emergencyResult.data) {
        setEmergencyRequests(emergencyResult.data || []);
        console.log('✅ 代打募集データ設定:', emergencyResult.data.length, '件');
      }

      // shifts (success プロパティありの場合とdata プロパティのみの場合)
      if (shiftsResult.success || shiftsResult.data) {
        const shiftsData = shiftsResult.data || [];
        setMyShifts(shiftsData);
        console.log('✅ シフトデータ設定:', shiftsData.length, '件');
      }

      // stores (success プロパティあり)
      if (storesResult.success && storesResult.data) {
        setStores(storesResult.data || []);
        console.log('✅ 店舗データ設定:', storesResult.data.length, '件');
        // デフォルトで最初の店舗を選択
        if (storesResult.data && storesResult.data.length > 0) {
          setSelectedStore(storesResult.data[0].id);
          console.log('🏪 デフォルト店舗選択:', storesResult.data[0].name);
        }
      } else {
        console.warn('⚠️ 店舗データが取得できませんでした:', storesResult);
      }

      // time-slots (success プロパティあり)
      if (timeSlotsResult.success && timeSlotsResult.data) {
        setTimeSlots(timeSlotsResult.data || []);
        console.log('✅ 時間帯データ設定:', timeSlotsResult.data.length, '件');
      } else {
        console.warn('⚠️ 時間帯データが取得できませんでした:', timeSlotsResult);
      }

      // users (success プロパティありの場合とdata プロパティのみの場合)
      if (usersResult.success || usersResult.data) {
        const usersData = usersResult.data || [];
        setUsers(usersData);
        console.log('✅ ユーザーデータ設定:', usersData.length, '件');
      }

    } catch (error) {
      console.error('❌ データ取得エラー:', error);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // シフト表データを取得
  const fetchShiftTableData = async () => {
    if (!selectedStore || !currentUser) {
      console.log('⚠️ シフト表データ取得スキップ:', { selectedStore, currentUser: !!currentUser });
      return;
    }

    console.log('📊 シフト表データ取得開始:', { selectedStore, viewWeek });

    try {
      // 1週間分の日付を生成
      const startDate = new Date(viewWeek);
      startDate.setDate(startDate.getDate() - startDate.getDay()); // 週の始まり（日曜日）
      
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // 週の終わり（土曜日）
      
      console.log('📅 期間:', {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      });

      // 並行してデータを取得 - 店舗の詳細情報も含める
      const [shiftsResponse, usersResponse, storeDetailResponse] = await Promise.all([
        fetch(`/api/shifts?store_id=${selectedStore}&date_from=${startDate.toISOString().split('T')[0]}&date_to=${endDate.toISOString().split('T')[0]}`),
        fetch('/api/users'),
        fetch(`/api/stores`) // 全店舗データから該当店舗を探す
      ]);

      const shiftsData = shiftsResponse.ok ? await shiftsResponse.json() : { data: [] };
      const usersData = usersResponse.ok ? await usersResponse.json() : { data: [] };
      const storesData = storeDetailResponse.ok ? await storeDetailResponse.json() : { data: [] };
      
      console.log('📋 取得データ:', {
        shifts: shiftsData.data?.length || 0,
        users: usersData.data?.length || 0,
        stores: storesData.data?.length || 0
      });

      // 選択店舗の詳細データを取得
      const selectedStoreData = storesData.data?.find((s: any) => s.id === selectedStore);
      const storeTimeSlots = timeSlots.filter(ts => ts.store_id === selectedStore);
      
      console.log('🏪 店舗詳細:', {
        storeName: selectedStoreData?.name,
        requiredStaff: selectedStoreData?.required_staff,
        timeSlots: storeTimeSlots.length
      });
      
      const days: ShiftTableDay[] = [];
      
      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // その日のシフトデータを取得
        const dayShifts = (shiftsData.data || []).filter((shift: any) => 
          shift.date === dateStr
        );
        
        console.log(`📋 ${dateStr}のシフト:`, dayShifts.length, '件');
        
        // 必要人数の設定を取得
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[currentDate.getDay()];
        
        const timeSlotData = storeTimeSlots.map(slot => {
          const slotShifts = dayShifts.filter((shift: any) => 
            shift.time_slot_id === slot.id
          );
          
          // 店舗の必要人数設定から正確に取得
          let requiredStaff = 0;
          if (selectedStoreData?.required_staff) {
            const dayRequiredStaff = selectedStoreData.required_staff[dayName];
            if (dayRequiredStaff && typeof dayRequiredStaff === 'object') {
              requiredStaff = dayRequiredStaff[slot.id] || 0;
            }
          }
          
          const currentStaff = slotShifts.length;
          const shortage = Math.max(0, requiredStaff - currentStaff);
          
          console.log(`🔢 ${slot.name} (${dayName}):`, {
            required: requiredStaff,
            current: currentStaff,
            shortage,
            shifts: slotShifts.map((s: any) => ({ name: s.users?.name, status: s.status }))
          });
          
          return {
            id: slot.id,
            name: slot.name,
            start_time: slot.start_time,
            end_time: slot.end_time,
            requiredStaff,
            currentStaff,
            shortage,
            shifts: slotShifts.map((shift: any) => {
              const user = usersData.data?.find((u: any) => u.id === shift.user_id) || shift.users;
              return {
                id: shift.id,
                user_id: shift.user_id,
                user_name: user?.name || '不明',
                status: shift.status, // 'draft' | 'confirmed' | 'completed'
                custom_start_time: shift.custom_start_time,
                custom_end_time: shift.custom_end_time,
                shift_data: shift
              };
            })
          };
        });

        days.push({
          date: dateStr,
          dayName: ['日', '月', '火', '水', '木', '金', '土'][currentDate.getDay()],
          timeSlots: timeSlotData
        });
      }
      
      console.log('✅ シフト表データ取得完了:', days);
      setShiftTableData(days);
    } catch (error) {
      console.error('❌ シフト表データ取得エラー:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // デバッグ用: currentUserの状態をログ出力
  useEffect(() => {
    console.log('👤 CurrentUser状態:', {
      user: currentUser,
      id: currentUser?.id,
      name: currentUser?.name,
      role: currentUser?.role
    });
  }, [currentUser]);

  useEffect(() => {
    if (selectedStore && timeSlots.length > 0 && stores.length > 0) {
      fetchShiftTableData();
    }
  }, [selectedStore, viewWeek, timeSlots, stores]);

  // シフト表から代打募集作成
  const handleCreateEmergencyFromSlot = (date: string, timeSlot: any) => {
    // 過去の日付はチェック
    const isPast = new Date(date) < new Date();
    if (isPast) {
      alert('過去の日付には代打募集を作成できません');
      return;
    }
    
    // シフトが配置されていない場合でも人手不足なら作成可能
    const hasShifts = timeSlot.shifts.length > 0;
    const isShortage = timeSlot.shortage > 0;
    
    if (!hasShifts && !isShortage) {
      alert('この時間帯には募集が必要な状況ではありません');
      return;
    }
    
    console.log('🎯 代打募集作成開始:', { 
      date, 
      timeSlot,
      hasShifts,
      isShortage,
      requiredStaff: timeSlot.requiredStaff,
      currentStaff: timeSlot.currentStaff
    });
    
    setSelectedSlot({ date, timeSlot });
  };

  // 代打募集作成（シフト表から）
  const handleCreateEmergencyRequest = async () => {
    if (!selectedSlot || !reason.trim()) {
      alert('理由を入力してください');
      return;
    }

    setCreating(true);
    
    try {
      console.log('🚀 代打募集作成開始:', {
        date: selectedSlot.date,
        timeSlot: selectedSlot.timeSlot.name,
        store: selectedStore,
        reason: reason.trim(),
        currentUser: currentUser?.id,
        shifts: selectedSlot.timeSlot.shifts
      });

      const requestData = {
        original_user_id: currentUser?.id,
        store_id: selectedStore,
        date: selectedSlot.date,
        time_slot_id: selectedSlot.timeSlot.id,
        reason: reason.trim(),
      };

      console.log('📤 送信データ:', requestData);

      const response = await fetch('/api/emergency-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      console.log('📥 レスポンスステータス:', response.status);

      const result = await response.json();
      console.log('📥 レスポンス内容:', result);

      if (response.ok) {
        console.log('✅ 代打募集作成成功:', result);
        
        // 配置済みスタッフの情報を含む成功メッセージ
        const shiftStaff = selectedSlot.timeSlot.shifts.map((s: any) => s.user_name).join('、');
        alert(`✅ 代打募集を作成しました！\n\n📅 日時: ${formatDate(selectedSlot.date)}\n⏰ 時間: ${selectedSlot.timeSlot.name}\n👥 現在の配置: ${shiftStaff}\n📝 理由: ${reason.trim()}\n\n📧 該当スタッフにメール通知を送信しています...`);
        
        setReason('');
        setSelectedSlot(null);
        
        // データを再取得
        await fetchData();
        await fetchShiftTableData();
      } else {
        console.error('❌ 代打募集作成失敗:', result);
        alert(`❌ 代打募集の作成に失敗しました\n\nエラー: ${result.error || '不明なエラー'}`);
      }
    } catch (error) {
      console.error('❌ 代打募集作成エラー:', error);
      alert(`❌ 代打募集の作成中にエラーが発生しました\n\nエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setCreating(false);
    }
  };

  // 応募管理
  const handleManageRequest = async (request: DatabaseEmergencyRequest) => {
    try {
      setSelectedRequestForManagement(request);

      // 応募者データを取得
      const response = await fetch(`/api/emergency-volunteers?emergency_request_id=${request.id}`);
      if (response.ok) {
        const data = await response.json();
        setVolunteers(data.data || []);
      }

      setShowManagementModal(true);
    } catch (error) {
      console.error('応募データ取得エラー:', error);
      alert('応募データの取得に失敗しました');
    }
  };

  // 応募者の採用・拒否
  const handleVolunteerAction = async (
    volunteerId: string, 
    action: 'accept' | 'reject',
    customStartTime?: string,
    customEndTime?: string
  ) => {
    setProcessingVolunteer(volunteerId);
    try {
      const requestBody: any = {
        action,
        volunteer_id: volunteerId,
        emergency_request_id: selectedRequestForManagement?.id
      };

      if (action === 'accept' && customStartTime && customEndTime) {
        requestBody.custom_start_time = customStartTime;
        requestBody.custom_end_time = customEndTime;
      }

      const response = await fetch('/api/emergency-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '処理に失敗しました');
      }

      const result = await response.json();
      alert(action === 'accept' ? 
        `${volunteers.find(v => v.id === volunteerId)?.user?.name}さんを採用しました` : 
        '応募を拒否しました'
      );

      // 応募管理をリセット
      setShowManagementModal(false);
      setCustomApprovalTime({ volunteerId: '', startTime: '', endTime: '', showCustomTime: false });
      fetchData();
      fetchShiftTableData();

      // 応募採用時のイベント発火
      if (action === 'accept') {
        window.dispatchEvent(new CustomEvent('updateShiftRequestNotifications'));
      }

    } catch (error) {
      console.error('応募処理エラー:', error);
      alert(`エラー: ${error instanceof Error ? error.message : '処理に失敗しました'}`);
    } finally {
      setProcessingVolunteer(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short'
    });
  };

  const formatTime = (timeString: string) => {
    return timeString.slice(0, 5);
  };

  const getDayName = (dateString: string) => {
    const date = new Date(dateString);
    return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  };

  // 週の変更
  const changeWeek = (direction: 'prev' | 'next') => {
    const newWeek = new Date(viewWeek);
    newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
    setViewWeek(newWeek);
  };

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">📡 データを読み込み中...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (error) {
    return (
      <AuthenticatedLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 text-lg">❌ {error}</p>
            <Button 
              onClick={fetchData} 
              className="mt-4"
            >
              🔄 再読み込み
            </Button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  // 現在の募集（自分が作成したもの）
  const myEmergencyRequests = emergencyRequests.filter(req => req.original_user_id === currentUser?.id);
  
  // 他のスタッフの募集（自分以外）
  const otherEmergencyRequests = emergencyRequests.filter(req => 
    req.status === 'open' && req.original_user_id !== currentUser?.id
  );

  return (
    <AuthenticatedLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">代打募集管理</h1>
          <p className="text-gray-600 mt-2">代打募集の作成・管理を行えます</p>
        </div>

        {/* タブナビゲーション */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('browse')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'browse'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              募集一覧
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'create'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              募集作成
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'manage'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              募集管理
              {emergencyRequests.filter(req => req.status === 'open').reduce((total, req) => 
                total + (req.emergency_volunteers?.length || 0), 0
              ) > 0 && (
                <span className="ml-2 bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full">
                  {emergencyRequests.filter(req => req.status === 'open').reduce((total, req) => 
                    total + (req.emergency_volunteers?.length || 0), 0
                  )}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* タブコンテンツ */}
        {activeTab === 'browse' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>他スタッフの代打募集</CardTitle>
              </CardHeader>
              <CardContent>
                {otherEmergencyRequests.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    現在、代打募集はありません
                  </div>
                ) : (
                  <div className="space-y-4">
                    {otherEmergencyRequests.map((request) => {
                      const user = users.find(u => u.id === request.original_user_id);
                      const store = stores.find(s => s.id === request.store_id);
                      const timeSlot = timeSlots.find(ts => ts.id === request.time_slot_id);
                      
                      return (
                        <div key={request.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <span className="font-semibold text-gray-900">
                                  {user?.name || '不明なユーザー'}さん
                                </span>
                                <span className="text-sm text-gray-500">
                                  {formatDate(request.date)}
                                </span>
                              </div>
                              <div className="text-sm text-gray-600 space-y-1">
                                <p>🏪 {store?.name || '不明な店舗'}</p>
                                <p>⏰ {formatTime(timeSlot?.start_time || '')} - {formatTime(timeSlot?.end_time || '')}</p>
                                <p>📝 {request.reason}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'create' && (
          <div className="space-y-6">
            {/* シフト選択（シフト表を表示） */}
            <Card>
              <CardHeader>
                <CardTitle>シフト選択</CardTitle>
                <p className="text-sm text-gray-600">代打を募集したいシフトを選択してください</p>
              </CardHeader>
              <CardContent>
                {/* 店舗・週選択 */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      店舗選択
                    </label>
                    <select
                      value={selectedStore}
                      onChange={(e) => {
                        console.log('🏪 店舗変更:', e.target.value);
                        setSelectedStore(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">店舗を選択してください</option>
                      {stores.map(store => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedStore && (
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">
                        {viewWeek.getFullYear()}年 {viewWeek.getMonth() + 1}月 第{Math.ceil(viewWeek.getDate() / 7)}週
                      </h3>
                      <div className="flex space-x-2">
                        <Button variant="secondary" size="sm" onClick={() => changeWeek('prev')}>
                          ← 前週
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => changeWeek('next')}>
                          次週 →
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {!selectedStore && (
                  <div className="text-center py-8 text-gray-500">
                    👆 まず店舗を選択してください
                  </div>
                )}

                {selectedStore && timeSlots.filter(ts => ts.store_id === selectedStore).length === 0 && (
                  <div className="text-center py-8 text-yellow-600 bg-yellow-50 rounded-lg">
                    ⚠️ 選択した店舗に時間帯設定がありません
                  </div>
                )}

                {selectedStore && timeSlots.filter(ts => ts.store_id === selectedStore).length > 0 && (
                  <>
                    {/* 週統計サマリー */}
                    {shiftTableData.length > 0 && (
                      <div className="mb-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="bg-blue-50 p-4 rounded-lg">
                            <div className="text-lg font-bold text-blue-600">
                              {shiftTableData.reduce((total, day) => 
                                total + day.timeSlots.reduce((dayTotal, slot) => dayTotal + slot.currentStaff, 0), 0
                              )}名
                            </div>
                            <p className="text-xs text-blue-700 mt-1">配置済みスタッフ</p>
                          </div>
                          <div className="bg-green-50 p-4 rounded-lg">
                            <div className="text-lg font-bold text-green-600">
                              {shiftTableData.reduce((total, day) => 
                                total + day.timeSlots.reduce((dayTotal, slot) => dayTotal + slot.requiredStaff, 0), 0
                              )}名
                            </div>
                            <p className="text-xs text-green-700 mt-1">必要スタッフ</p>
                          </div>
                          <div className="bg-red-50 p-4 rounded-lg">
                            <div className="text-lg font-bold text-red-600">
                              {shiftTableData.reduce((total, day) => 
                                total + day.timeSlots.reduce((dayTotal, slot) => dayTotal + slot.shortage, 0), 0
                              )}名
                            </div>
                            <p className="text-xs text-red-700 mt-1">不足スタッフ</p>
                          </div>
                          <div className="bg-purple-50 p-4 rounded-lg">
                            <div className="text-lg font-bold text-purple-600">
                              {shiftTableData.reduce((total, day) => 
                                total + day.timeSlots.reduce((dayTotal, slot) => 
                                  dayTotal + slot.shifts.filter(shift => shift.status === 'confirmed').length, 0
                                ), 0
                              )}名
                            </div>
                            <p className="text-xs text-purple-700 mt-1">確定済みシフト</p>
                          </div>
                        </div>
                        
                        {/* 詳細情報 */}
                        <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                              <span className="font-medium">下書き:</span>{' '}
                              {shiftTableData.reduce((total, day) => 
                                total + day.timeSlots.reduce((dayTotal, slot) => 
                                  dayTotal + slot.shifts.filter(shift => shift.status === 'draft').length, 0
                                ), 0
                              )}名
                            </div>
                            <div>
                              <span className="font-medium">確定済み:</span>{' '}
                              {shiftTableData.reduce((total, day) => 
                                total + day.timeSlots.reduce((dayTotal, slot) => 
                                  dayTotal + slot.shifts.filter(shift => shift.status === 'confirmed').length, 0
                                ), 0
                              )}名
                            </div>
                            <div>
                              <span className="font-medium">完了:</span>{' '}
                              {shiftTableData.reduce((total, day) => 
                                total + day.timeSlots.reduce((dayTotal, slot) => 
                                  dayTotal + slot.shifts.filter(shift => shift.status === 'completed').length, 0
                                ), 0
                              )}名
                            </div>
                            <div>
                              <span className="font-medium">充足率:</span>{' '}
                              {(() => {
                                const totalRequired = shiftTableData.reduce((total, day) => 
                                  total + day.timeSlots.reduce((dayTotal, slot) => dayTotal + slot.requiredStaff, 0), 0
                                );
                                const totalCurrent = shiftTableData.reduce((total, day) => 
                                  total + day.timeSlots.reduce((dayTotal, slot) => dayTotal + slot.currentStaff, 0), 0
                                );
                                return totalRequired > 0 ? Math.round((totalCurrent / totalRequired) * 100) : 0;
                              })()}%
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* シフト表 */}
                    {shiftTableData.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        📊 シフト表を読み込み中...
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                          <div className="min-w-full">
                            <table className="w-full border-collapse" style={{ minWidth: '800px' }}>
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="border border-gray-300 px-3 py-4 text-left text-sm font-semibold text-gray-900 sticky left-0 bg-gray-50 z-10">
                                    時間帯
                                  </th>
                                  {shiftTableData.map((day) => (
                                    <th key={day.date} className="border border-gray-300 px-2 py-4 text-center text-sm font-semibold text-gray-900 min-w-32">
                                      <div className="space-y-1">
                                        <div className="font-bold">{day.dayName}</div>
                                        <div className="text-xs text-gray-600">
                                          {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                                        </div>
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {timeSlots.filter(ts => ts.store_id === selectedStore).map((timeSlot) => (
                                  <tr key={timeSlot.id}>
                                    <td className="border border-gray-300 px-3 py-4 text-sm font-medium bg-gray-50 sticky left-0 z-10">
                                      <div className="space-y-1">
                                        <div className="font-semibold">{timeSlot.name}</div>
                                        <div className="text-xs text-gray-600">
                                          {formatTime(timeSlot.start_time)}-{formatTime(timeSlot.end_time)}
                                        </div>
                                      </div>
                                    </td>
                                    {shiftTableData.map((day) => {
                                      const daySlot = day.timeSlots.find(ts => ts.id === timeSlot.id);
                                      if (!daySlot) return <td key={day.date} className="border border-gray-300 px-2 py-4 min-w-32"></td>;
                                      
                                      const isPast = new Date(day.date) < new Date();
                                      const hasShifts = daySlot.shifts.length > 0;
                                      const isShortage = daySlot.shortage > 0;
                                      const isOverStaffed = daySlot.currentStaff > daySlot.requiredStaff;
                                      const canCreateRequest = !isPast && (hasShifts || isShortage);
                                      
                                      return (
                                        <td 
                                          key={day.date} 
                                          className={`border border-gray-300 px-2 py-4 text-sm min-w-32 ${
                                            isPast 
                                              ? 'bg-gray-50' 
                                              : (hasShifts || isShortage)
                                                ? 'bg-blue-50 cursor-pointer hover:bg-blue-100' 
                                                : 'bg-white'
                                          }`}
                                          onClick={() => {
                                            if (!isPast && (hasShifts || isShortage)) {
                                              console.log('🎯 代打募集作成クリック:', { date: day.date, timeSlot: daySlot });
                                              handleCreateEmergencyFromSlot(day.date, daySlot);
                                            }
                                          }}
                                        >
                                          <div className="space-y-2 min-h-16">
                                            {/* 人数表示 */}
                                            <div className="flex items-center justify-between">
                                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                                isShortage 
                                                  ? 'bg-red-100 text-red-700' 
                                                  : isOverStaffed 
                                                    ? 'bg-orange-100 text-orange-700'
                                                    : 'bg-green-100 text-green-700'
                                              }`}>
                                                {daySlot.currentStaff}/{daySlot.requiredStaff}人
                                              </span>
                                              {isShortage && (
                                                <span className="text-xs text-red-600 font-bold">
                                                  不足{daySlot.shortage}
                                                </span>
                                              )}
                                            </div>

                                            {/* スタッフ表示 */}
                                            {daySlot.shifts.length > 0 ? (
                                              <div className="space-y-1">
                                                {daySlot.shifts.map((shift) => {
                                                  const isConfirmed = shift.status === 'confirmed';
                                                  const isCompleted = shift.status === 'completed';
                                                  const isDraft = shift.status === 'draft';
                                                  const hasCustomTime = shift.custom_start_time && shift.custom_end_time;
                                                  
                                                  return (
                                                    <div 
                                                      key={shift.id}
                                                      className={`text-xs p-2 rounded-md border transition-all ${
                                                        isCompleted
                                                          ? 'bg-green-100 border-green-300 text-green-800'
                                                          : isConfirmed 
                                                            ? 'bg-blue-100 border-blue-300 text-blue-800' 
                                                            : isDraft
                                                              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                                                              : 'bg-white border-gray-200 text-gray-700'
                                                      } ${!isPast && (hasShifts || isShortage) ? 'hover:shadow-sm' : ''}`}
                                                    >
                                                      <div className="font-medium truncate">
                                                        {shift.user_name}
                                                      </div>
                                                      {hasCustomTime && (
                                                        <div className="text-xs text-purple-600 mt-1">
                                                          ⏰ {shift.custom_start_time}-{shift.custom_end_time}
                                                        </div>
                                                      )}
                                                      <div className="flex items-center justify-between mt-1">
                                                        <div className={`text-xs px-1.5 py-0.5 rounded-full ${
                                                          isCompleted
                                                            ? 'bg-green-200 text-green-700'
                                                            : isConfirmed
                                                              ? 'bg-blue-200 text-blue-700'
                                                              : 'bg-yellow-200 text-yellow-700'
                                                        }`}>
                                                          {isCompleted ? '完了' : isConfirmed ? '確定' : '下書き'}
                                                        </div>
                                                        {(isConfirmed || isCompleted) && (
                                                          <div className="text-xs">
                                                            {isCompleted ? '✅' : '✓'}
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <div className="flex items-center justify-center h-12 text-gray-400">
                                                <div className="text-center">
                                                  <div className="text-lg mb-1">-</div>
                                                  <div className="text-xs">未配置</div>
                                                </div>
                                              </div>
                                            )}

                                            {/* 代打募集ボタン */}
                                            {canCreateRequest && (
                                              <div className="text-center pt-1">
                                                <div className={`text-xs font-medium px-2 py-1 rounded-full transition-colors cursor-pointer ${
                                                  hasShifts 
                                                    ? 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                                                    : 'text-red-600 bg-red-100 hover:bg-red-200'
                                                }`}>
                                                  {hasShifts ? '📝 代打募集作成' : '🆘 人手不足募集'}
                                                </div>
                                              </div>
                                            )}

                                            {/* 空の時間帯表示 */}
                                            {!hasShifts && !isShortage && !isPast && (
                                              <div className="text-center pt-1">
                                                <div className="text-xs text-gray-400">
                                                  配置なし
                                                </div>
                                              </div>
                                            )}

                                            {/* 過去の日付表示 */}
                                            {isPast && (
                                              <div className="text-center pt-1">
                                                <div className="text-xs text-gray-400">
                                                  過去の日付
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* 理由入力（シフト選択後） */}
            {selectedSlot && (
              <Card data-reason-section>
                <CardHeader>
                  <CardTitle>代打募集の理由</CardTitle>
                  <p className="text-sm text-gray-600">代打が必要な理由を入力してください</p>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900">選択されたシフト</h4>
                    <p className="text-sm text-blue-800">
                      📅 {formatDate(selectedSlot.date)} ({getDayName(selectedSlot.date)})
                    </p>
                    <p className="text-sm text-blue-800">
                      ⏰ {selectedSlot.timeSlot.name} ({formatTime(selectedSlot.timeSlot.start_time)}-{formatTime(selectedSlot.timeSlot.end_time)})
                    </p>
                    <p className="text-sm text-blue-800">
                      👥 必要人数: {selectedSlot.timeSlot.requiredStaff}名 / 現在: {selectedSlot.timeSlot.currentStaff}名
                    </p>
                    {selectedSlot.timeSlot.shifts.length > 0 ? (
                      <p className="text-sm text-blue-800">
                        🏷️ 現在の配置: {selectedSlot.timeSlot.shifts.map((s: any) => s.user_name).join('、')}
                      </p>
                    ) : (
                      <p className="text-sm text-red-800">
                        ⚠️ まだ誰も配置されていません（人手不足 {selectedSlot.timeSlot.shortage}名）
                      </p>
                    )}
                    {selectedSlot.timeSlot.shortage > 0 && (
                      <p className="text-sm text-red-800 font-medium">
                        🚨 不足人数: {selectedSlot.timeSlot.shortage}名
                      </p>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={selectedSlot.timeSlot.shortage > 0 
                      ? "例：人手が足りないため、急な欠員のため、業務量増加のため など" 
                      : "例：急な用事のため、体調不良のため、家庭の事情のため など"
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                  />
                </CardContent>
              </Card>
            )}

            {/* アクションボタン */}
            {selectedSlot && (
              <div className="flex space-x-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedSlot(null);
                    setReason('');
                  }}
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleCreateEmergencyRequest}
                  disabled={!reason.trim() || creating}
                  className="flex-1"
                >
                  {creating ? '作成中...' : '代打募集を作成'}
                </Button>
              </div>
            )}

            {/* 注意事項 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">代打募集に関する注意事項</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• 代打募集の作成後は内容の変更ができません</li>
                  <li>• 複数の応募者がいる場合、最終的な選考を行ってください</li>
                  <li>• 応募があった場合はメールで通知されます</li>
                  <li>• 代打が決定したら速やかに確定処理を行ってください</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'manage' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>代打募集への応募管理</CardTitle>
                <p className="text-sm text-gray-600 mt-2">
                  スタッフと店長が作成した代打募集への応募者を管理できます
                </p>
              </CardHeader>
              <CardContent>
                {/* 全ての募集中の代打募集を表示（応募があるもの優先） */}
                {emergencyRequests.filter(req => req.status === 'open').length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    現在、管理対象の代打募集はありません
                  </div>
                ) : (
                  <div className="space-y-4">
                    {emergencyRequests
                      .filter(req => req.status === 'open')
                      .sort((a, b) => {
                        // 応募者数で降順ソート（応募が多いものを上に）
                        const aVolunteers = a.emergency_volunteers?.length || 0;
                        const bVolunteers = b.emergency_volunteers?.length || 0;
                        if (aVolunteers !== bVolunteers) {
                          return bVolunteers - aVolunteers;
                        }
                        // 応募者数が同じ場合は日付で昇順ソート
                        return new Date(a.date).getTime() - new Date(b.date).getTime();
                      })
                      .map((request) => {
                        const user = users.find(u => u.id === request.original_user_id);
                        const store = stores.find(s => s.id === request.store_id);
                        const timeSlot = timeSlots.find(ts => ts.id === request.time_slot_id);
                        const volunteerCount = request.emergency_volunteers?.length || 0;
                        const isMyRequest = request.original_user_id === currentUser?.id;
                        
                        return (
                          <div key={request.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className="font-semibold">{formatDate(request.date)}</span>
                                  <span className="text-sm text-gray-500">
                                    {user?.name || '不明なユーザー'}
                                    {isMyRequest && <span className="text-blue-600">（自分）</span>}
                                  </span>
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    volunteerCount > 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {volunteerCount > 0 ? `応募者${volunteerCount}名` : '応募者募集中'}
                                  </span>
                                </div>
                                <div className="text-sm text-gray-600 space-y-1">
                                  <p>🏪 {store?.name || '不明な店舗'}</p>
                                  <p>⏰ {formatTime(timeSlot?.start_time || '')} - {formatTime(timeSlot?.end_time || '')}</p>
                                  <p>📝 {request.reason}</p>
                                  {volunteerCount > 0 && (
                                    <div className="mt-2">
                                      <p className="text-xs text-gray-500 mb-1">応募者:</p>
                                      <div className="flex flex-wrap gap-1">
                                        {request.emergency_volunteers?.slice(0, 3).map((volunteer) => (
                                          <span key={volunteer.id} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                            {volunteer.user?.name || '不明'}
                                          </span>
                                        ))}
                                        {volunteerCount > 3 && (
                                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                            他{volunteerCount - 3}名
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                {volunteerCount > 0 && (
                                  <Button
                                    onClick={() => handleManageRequest(request)}
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700"
                                  >
                                    応募管理 ({volunteerCount})
                                  </Button>
                                )}
                                {volunteerCount === 0 && (
                                  <span className="text-xs text-gray-500 text-center px-3 py-2">
                                    応募待ち
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 代打募集応募管理モーダル（glassmorphism） */}
        {showManagementModal && selectedRequestForManagement && (
          <div 
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowManagementModal(false);
                setSelectedRequestForManagement(null);
                setVolunteers([]);
                setCustomApprovalTime({
                  volunteerId: '',
                  startTime: '',
                  endTime: '',
                  showCustomTime: false
                });
              }
            }}
          >
            <div className="bg-white/90 backdrop-blur-md border border-white/20 shadow-2xl rounded-xl p-4 sm:p-6 w-full max-w-sm sm:max-w-3xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">応募管理</h2>
                  <p className="text-sm text-gray-600">
                    {formatDate(selectedRequestForManagement.date)} - {selectedRequestForManagement.stores?.name}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowManagementModal(false);
                    setSelectedRequestForManagement(null);
                    setVolunteers([]);
                    setCustomApprovalTime({
                      volunteerId: '',
                      startTime: '',
                      endTime: '',
                      showCustomTime: false
                    });
                  }}
                >
                  閉じる
                </Button>
              </div>

              {volunteers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>まだ応募がありません</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {volunteers.map((volunteer) => (
                    <div key={volunteer.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-medium text-gray-900">{volunteer.user?.name}</h3>
                          <p className="text-sm text-gray-500">
                            応募日時: {new Date(volunteer.responded_at).toLocaleDateString('ja-JP')}
                          </p>
                          {volunteer.notes && (
                            <div className="mt-2 p-2 bg-gray-50 rounded">
                              <p className="text-sm text-gray-700">
                                <strong>メモ:</strong> {volunteer.notes}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* カスタム時間設定 (インライン表示) */}
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">カスタム時間設定</span>
                          <button
                            onClick={() => {
                              if (customApprovalTime.volunteerId === volunteer.id) {
                                setCustomApprovalTime({
                                  volunteerId: '',
                                  startTime: '',
                                  endTime: '',
                                  showCustomTime: false
                                });
                              } else {
                                setCustomApprovalTime({
                                  volunteerId: volunteer.id,
                                  startTime: selectedRequestForManagement.time_slots?.start_time || '09:00',
                                  endTime: selectedRequestForManagement.time_slots?.end_time || '17:00',
                                  showCustomTime: true
                                });
                              }
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700"
                          >
                            {customApprovalTime.volunteerId === volunteer.id ? 'キャンセル' : '時間変更'}
                          </button>
                        </div>

                        {customApprovalTime.volunteerId === volunteer.id && (
                          <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">開始時間</label>
                              <CompactTimeSlider
                                value={customApprovalTime.startTime}
                                onChange={(value) => setCustomApprovalTime(prev => ({ ...prev, startTime: value }))}
                                label="開始時間"
                                minTime="06:00"
                                maxTime="23:00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">終了時間</label>
                              <CompactTimeSlider
                                value={customApprovalTime.endTime}
                                onChange={(value) => setCustomApprovalTime(prev => ({ ...prev, endTime: value }))}
                                label="終了時間"
                                minTime="06:00"
                                maxTime="23:00"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex space-x-2 mt-4">
                        <Button
                          onClick={() => {
                            const customStartTime = customApprovalTime.volunteerId === volunteer.id ? customApprovalTime.startTime : undefined;
                            const customEndTime = customApprovalTime.volunteerId === volunteer.id ? customApprovalTime.endTime : undefined;
                            handleVolunteerAction(volunteer.id, 'accept', customStartTime, customEndTime);
                          }}
                          disabled={processingVolunteer === volunteer.id}
                          className="flex-1"
                        >
                          {processingVolunteer === volunteer.id ? '処理中...' : '採用'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleVolunteerAction(volunteer.id, 'reject')}
                          disabled={processingVolunteer === volunteer.id}
                          className="flex-1"
                        >
                          却下
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
} 