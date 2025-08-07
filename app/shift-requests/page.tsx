'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AnimatedToggle } from '@/components/ui/AnimatedToggle';
import { CompactTimeSlider } from '@/components/ui/CompactTimeSlider';
import { 
  getSubmissionPeriods, 
  generateDateRange, 
  getJapaneseDayOfWeek, 
  formatTime 
} from '@/lib/utils';
import type { DatabaseShiftRequest, TimeSlot, SubmissionPeriod, DatabaseUser } from '@/lib/types';

interface RequestSummary {
  date: string;
  dayOfWeek: string;
  timeSlots: {
    [timeSlotId: string]: {
      timeSlot: TimeSlot;
      requests: {
        priority1: DatabaseShiftRequest[];
        priority2: DatabaseShiftRequest[];
        priority3: DatabaseShiftRequest[];
      };
    };
  };
}

interface PersonRequestGroup {
  user: DatabaseUser;
  submissionPeriod: string;
  submittedAt: string;
  requests: DatabaseShiftRequest[];
  totalDays: number;
}

interface ShiftCreationModal {
  isOpen: boolean;
  request?: DatabaseShiftRequest;
  requests?: DatabaseShiftRequest[];
  type: 'single' | 'bulk';
}

export default function ShiftRequestsPage() {
  const router = useRouter();
  
  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [periods, setPeriods] = useState<SubmissionPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<SubmissionPeriod | null>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [requests, setRequests] = useState<DatabaseShiftRequest[]>([]);
  const [personGroups, setPersonGroups] = useState<PersonRequestGroup[]>([]);
  const [users, setUsers] = useState<DatabaseUser[]>([]);

  // UI states
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [shiftModal, setShiftModal] = useState<ShiftCreationModal>({ isOpen: false, type: 'single' });
  
  // Custom time states
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');
  const [useCustomTime, setUseCustomTime] = useState(false);

  useEffect(() => {
    initializePage();
  }, []);

  useEffect(() => {
    if (selectedPeriod && selectedStore) {
      loadPeriodData();
    }
  }, [selectedPeriod, selectedStore]);

  useEffect(() => {
    if (requests.length > 0 && timeSlots.length > 0) {
      // generateSummary(); // 個人カード表示なので不要
    }
  }, [requests, timeSlots]);

  const initializePage = async () => {
    try {
      setLoading(true);

      // 店舗情報を取得
      const storesResponse = await fetch('/api/stores');
      const storesData = await storesResponse.json();
      setStores(storesData.data || []);
      
      if (storesData.data && storesData.data.length > 0) {
        setSelectedStore(storesData.data[0].id);
      }

      // 提出期間を設定
      const submissionPeriods = getSubmissionPeriods();
      setPeriods(submissionPeriods);
      
      // 最初の期間を選択
      if (submissionPeriods.length > 0) {
        setSelectedPeriod(submissionPeriods[0]);
      }

      // ユーザー情報を取得
      const usersResponse = await fetch('/api/users');
      const usersData = await usersResponse.json();
      setUsers(usersData.data || []);

    } catch (error) {
      setError('初期化に失敗しました');
      console.error('Initialization error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriodData = async () => {
    if (!selectedPeriod || !selectedStore) return;

    try {
      setLoading(true);
      setError(null);

      // シフト希望データを取得（変換済みを除外）
      const response = await fetch(
        `/api/shift-requests?store_id=${selectedStore}&submission_period=${selectedPeriod.id}&status=submitted`
      );
      
      if (!response.ok) {
        throw new Error('データの取得に失敗しました');
      }

      const result = await response.json();
      const requestsData = result.data || [];
      
      // さらにフロントエンド側でも変換済みを除外
      const filteredRequests = requestsData.filter(
        (request: DatabaseShiftRequest) => request.status !== 'converted_to_shift'
      );
      
      setRequests(filteredRequests);

      // 個人ごとにグループ化
      const groupedByPerson: { [userId: string]: PersonRequestGroup } = {};
      
      filteredRequests.forEach((request: DatabaseShiftRequest) => {
        const userId = request.user_id;
        
        if (!groupedByPerson[userId]) {
          groupedByPerson[userId] = {
            user: request.users!,
            submissionPeriod: request.submission_period,
            submittedAt: request.submitted_at || request.created_at,
            requests: [],
            totalDays: 0
          };
        }
        
        groupedByPerson[userId].requests.push(request);
      });

      // 各グループの日数を計算
      Object.values(groupedByPerson).forEach(group => {
        const uniqueDates = new Set(group.requests.map(r => r.date));
        group.totalDays = uniqueDates.size;
      });

      // 提出日時順でソート
      const sortedGroups = Object.values(groupedByPerson).sort((a, b) => 
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );

      setPersonGroups(sortedGroups);

    } catch (error) {
      console.error('Period data loading error:', error);
      setError('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = () => {
    // 個人ごとのカード表示なので、従来のサマリー生成は不要
    // データは loadPeriodData で処理済み
  };

  const handleCreateShifts = async (date: string, timeSlotId: string, requestIds: string[]) => {
    try {
      console.log('Frontend: Creating shifts with:', { date, timeSlotId, requestIds, useCustomTime, customStartTime, customEndTime });

      const response = await fetch('/api/shift-requests/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_ids: requestIds,
          status: 'draft',
          custom_start_time: useCustomTime ? customStartTime : undefined,
          custom_end_time: useCustomTime ? customEndTime : undefined,
        }),
      });

      const result = await response.json();
      console.log('Frontend: API response:', { response: response.status, result });

      if (!response.ok) {
        console.error('API Error Response:', result);
        throw new Error(result.error || 'シフト作成に失敗しました');
      }

      console.log('Shift creation success:', result);

      // データを再読み込み
      loadPeriodData();
      
      // モーダルを閉じる
      setShiftModal({ isOpen: false, type: 'single' });
      resetCustomTime();
      
    } catch (error) {
      console.error('Shift creation error:', error);
      setError(`シフト作成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  };

  const handleCreateAllPersonShifts = async (person: PersonRequestGroup) => {
    try {
      for (const request of person.requests) {
        await handleCreateShifts(request.date, request.time_slot_id!, [request.id]);
      }
      
      setExpandedPersonId(null);
      
    } catch (error) {
      console.error('Bulk shift creation error:', error);
      setError('一括シフト作成に失敗しました');
    }
  };

  const openShiftModal = (request: DatabaseShiftRequest, type: 'single' = 'single') => {
    setShiftModal({
      isOpen: true,
      request,
      type
    });
    
    // 時間の初期設定
    let hasCustomTime = false;
    
    // 希望時間がある場合は優先的に使用
    if (request.preferred_start_time) {
      setCustomStartTime(request.preferred_start_time);
      hasCustomTime = true;
    } else if (request.time_slots?.start_time) {
      // 希望時間がない場合は時間帯のデフォルト時間を使用
      setCustomStartTime(request.time_slots.start_time);
    }
    
    if (request.preferred_end_time) {
      setCustomEndTime(request.preferred_end_time);
      hasCustomTime = true;
    } else if (request.time_slots?.end_time) {
      // 希望時間がない場合は時間帯のデフォルト時間を使用
      setCustomEndTime(request.time_slots.end_time);
    }
    
    // 希望時間がある場合はカスタム時間を有効に
    setUseCustomTime(hasCustomTime);
  };

  const openBulkShiftModal = (person: PersonRequestGroup) => {
    setShiftModal({
      isOpen: true,
      requests: person.requests,
      type: 'bulk'
    });
  };

  const resetCustomTime = () => {
    setCustomStartTime('');
    setCustomEndTime('');
    setUseCustomTime(false);
  };

  const confirmShiftCreation = async () => {
    if (shiftModal.type === 'single' && shiftModal.request) {
      await handleCreateShifts(
        shiftModal.request.date, 
        shiftModal.request.time_slot_id!, 
        [shiftModal.request.id]
      );
    } else if (shiftModal.type === 'bulk' && shiftModal.requests) {
      for (const request of shiftModal.requests) {
        await handleCreateShifts(request.date, request.time_slot_id!, [request.id]);
      }
      setExpandedPersonId(null);
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'bg-red-100 text-red-800 border-red-200';
      case 2: return 'bg-blue-100 text-blue-800 border-blue-200';
      case 3: return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1: return '最優先';
      case 2: return '希望';
      case 3: return '可能';
      default: return '希望';
    }
  };

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex justify-center items-center min-h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📅 シフト希望確認・管理</h1>
            <p className="text-gray-600 mt-2">
              スタッフから提出されたシフト希望を確認し、シフトを作成できます
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* 期間・店舗選択 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📍 提出期間</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedPeriod?.id || ''}
                onChange={(e) => {
                  const period = periods.find(p => p.id === e.target.value);
                  setSelectedPeriod(period || null);
                }}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {periods.map(period => (
                  <option key={period.id} value={period.id}>
                    {period.label}
                  </option>
                ))}
              </select>
              {selectedPeriod && (
                <div className="mt-2 text-sm text-gray-600">
                  <p>📅 期間: {selectedPeriod.startDate} 〜 {selectedPeriod.endDate}</p>
                  <p>⏰ 提出期限: {selectedPeriod.submissionDeadline}</p>
                  <p className={`${selectedPeriod.isSubmissionOpen ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedPeriod.isSubmissionOpen ? '✅ 提出可能' : '❌ 期限切れ'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">🏪 店舗選択</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        </div>

        {/* シフト希望一覧 */}
        {loading ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-gray-500">読み込み中...</p>
            </CardContent>
          </Card>
        ) : personGroups.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-gray-500">提出されたシフト希望がありません</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {personGroups.map(person => (
              <Card key={person.user.id} className="hover:shadow-md transition-shadow">
                <CardHeader 
                  className="pb-3 cursor-pointer"
                  onClick={() => setExpandedPersonId(
                    expandedPersonId === person.user.id ? null : person.user.id
                  )}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <span>{person.user.name}</span>
                        <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full">
                          {person.totalDays}日間
                        </span>
                      </CardTitle>
                      <p className="text-sm text-gray-600 mt-1">
                        提出日時: {new Date(person.submittedAt).toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="primary"
                        className="text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openBulkShiftModal(person);
                        }}
                      >
                        一括シフト作成
                      </Button>
                      <svg 
                        className={`w-5 h-5 transition-transform ${
                          expandedPersonId === person.user.id ? 'rotate-180' : ''
                        }`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </CardHeader>

                {/* 展開された詳細情報 */}
                {expandedPersonId === person.user.id && (
                  <CardContent className="pt-0">
                    <div className="border-t border-gray-200 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {person.requests.map(request => (
                          <div key={request.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div className="space-y-2">
                              <div className="flex justify-between items-start">
                                <h4 className="font-medium text-gray-900">
                                  {new Date(request.date).getDate()}日 ({getJapaneseDayOfWeek(request.date)})
                                </h4>
                                <span className={`text-xs px-2 py-1 rounded-full border ${getPriorityColor(request.priority)}`}>
                                  {getPriorityLabel(request.priority)}
                                </span>
                              </div>
                              
                              {request.time_slots && (
                                <p className="text-sm text-gray-600">
                                  {request.time_slots.name} ({formatTime(request.time_slots.start_time)} - {formatTime(request.time_slots.end_time)})
                                </p>
                              )}

                              {(request.preferred_start_time || request.preferred_end_time) && (
                                <p className="text-sm text-orange-600">
                                  希望時間: {request.preferred_start_time} - {request.preferred_end_time}
                                </p>
                              )}

                              {request.notes && (
                                <p className="text-sm text-gray-600">
                                  メモ: {request.notes}
                                </p>
                              )}

                              <Button
                                variant="secondary"
                                className="w-full text-sm mt-3"
                                onClick={() => openShiftModal(request)}
                              >
                                個別シフト作成
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* シフト作成カスタムモーダル */}
      {shiftModal.isOpen && (
        <div 
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShiftModal({ isOpen: false, type: 'single' });
              resetCustomTime();
            }
          }}
        >
          <div 
            className="bg-white/90 backdrop-blur-md rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">
              {shiftModal.type === 'single' ? 'シフト作成' : '一括シフト作成'}
            </h3>
            
            {shiftModal.type === 'single' && shiftModal.request && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium">{shiftModal.request.users?.name}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(shiftModal.request.date).getDate()}日 ({getJapaneseDayOfWeek(shiftModal.request.date)})
                  </p>
                  <p className="text-sm text-gray-600">
                    {shiftModal.request.time_slots?.name} ({formatTime(shiftModal.request.time_slots?.start_time || '')} - {formatTime(shiftModal.request.time_slots?.end_time || '')})
                  </p>
                </div>

                <div className="space-y-4">
                  <AnimatedToggle
                    checked={useCustomTime}
                    onChange={setUseCustomTime}
                    label="勤務時間調整"
                    description="必要に応じて出勤・退勤時間をカスタマイズできます"
                  />

                  <div className={`
                    overflow-hidden transition-all duration-500 ease-in-out
                    ${useCustomTime ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                  `}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                      <CompactTimeSlider
                        value={customStartTime}
                        onChange={setCustomStartTime}
                        label="開始時間"
                      />
                      <CompactTimeSlider
                        value={customEndTime}
                        onChange={setCustomEndTime}
                        label="終了時間"
                      />
                    </div>
                    {shiftModal.request.preferred_start_time && (
                      <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-600">
                        参考: スタッフ希望時間 {shiftModal.request.preferred_start_time} - {shiftModal.request.preferred_end_time}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {shiftModal.type === 'bulk' && shiftModal.requests && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium">{shiftModal.requests[0]?.users?.name}</p>
                  <p className="text-sm text-gray-600">
                    {shiftModal.requests.length}件のシフト希望を一括で作成します
                  </p>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {shiftModal.requests.map(request => (
                    <div key={request.id} className="text-sm p-2 bg-white border rounded">
                      {new Date(request.date).getDate()}日 - {request.time_slots?.name}
                      {request.preferred_start_time && (
                        <span className="text-blue-600 ml-2">
                          (希望: {request.preferred_start_time}-{request.preferred_end_time})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex space-x-3 mt-6">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setShiftModal({ isOpen: false, type: 'single' });
                  resetCustomTime();
                }}
              >
                キャンセル
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={confirmShiftCreation}
              >
                {shiftModal.type === 'single' ? 'シフト作成' : '一括作成'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AuthenticatedLayout>
  );
} 