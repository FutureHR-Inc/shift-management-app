'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
  const [summary, setSummary] = useState<RequestSummary[]>([]);
  const [users, setUsers] = useState<DatabaseUser[]>([]);

  // UI states
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
      generateSummary();
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

      // 時間帯情報を取得
      const timeSlotsResponse = await fetch(`/api/time-slots?store_id=${selectedStore}`);
      const timeSlotsData = await timeSlotsResponse.json();
      setTimeSlots(timeSlotsData.data || []);

      // シフト希望データを取得
      const requestsResponse = await fetch(
        `/api/shift-requests?store_id=${selectedStore}&submission_period=${selectedPeriod.id}&status=submitted`
      );
      const requestsData = await requestsResponse.json();
      setRequests(requestsData.data || []);

    } catch (error) {
      setError('データの読み込みに失敗しました');
      console.error('Load period data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = () => {
    if (!selectedPeriod) return;

    const dateRange = generateDateRange(selectedPeriod.startDate, selectedPeriod.endDate);
    
    const summaryData: RequestSummary[] = dateRange.map(date => {
      const dayRequests = requests.filter(req => req.date === date);
      
      const timeSlotData: RequestSummary['timeSlots'] = {};
      
      timeSlots.forEach(timeSlot => {
        const timeSlotRequests = dayRequests.filter(req => req.time_slot_id === timeSlot.id);
        
        timeSlotData[timeSlot.id] = {
          timeSlot,
          requests: {
            priority1: timeSlotRequests.filter(req => req.priority === 1),
            priority2: timeSlotRequests.filter(req => req.priority === 2),
            priority3: timeSlotRequests.filter(req => req.priority === 3)
          }
        };
      });

      return {
        date,
        dayOfWeek: getJapaneseDayOfWeek(date),
        timeSlots: timeSlotData
      };
    });

    setSummary(summaryData);
  };

  const handleCreateShifts = async (date: string, timeSlotId: string, selectedRequests: string[]) => {
    try {
      setLoading(true);

      const createPromises = selectedRequests.map(async (requestId) => {
        const request = requests.find(r => r.id === requestId);
        if (!request) return;

        const shiftData = {
          user_id: request.user_id,
          store_id: selectedStore,
          date: request.date,
          time_slot_id: request.time_slot_id,
          custom_start_time: request.preferred_start_time,
          custom_end_time: request.preferred_end_time,
          status: 'draft',
          notes: request.notes
        };

        const response = await fetch('/api/shifts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(shiftData),
        });

        if (response.ok) {
          // リクエストのステータスを更新
          await fetch('/api/shift-requests', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: requestId,
              status: 'converted_to_shift'
            }),
          });
        }
      });

      await Promise.all(createPromises);
      
      // データを再読み込み
      await loadPeriodData();

    } catch (error) {
      setError('シフト作成に失敗しました');
      console.error('Create shifts error:', error);
    } finally {
      setLoading(false);
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
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">📅 シフト希望確認・管理</CardTitle>
            <p className="text-gray-600">
              スタッフから提出されたシフト希望を確認し、シフトを作成できます
            </p>
          </CardHeader>
        </Card>

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

        {/* 表示モード切替 */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-2">
            <Button
              variant={viewMode === 'summary' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('summary')}
            >
              📊 サマリー表示
            </Button>
            <Button
              variant={viewMode === 'detailed' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('detailed')}
            >
              📋 詳細表示
            </Button>
          </div>
          
          {requests.length > 0 && (
            <div className="text-sm text-gray-600">
              総希望件数: {requests.length}件
            </div>
          )}
        </div>

        {/* サマリー表示 */}
        {viewMode === 'summary' && summary.length > 0 && (
          <div className="space-y-4">
            {summary.map(dayData => (
              <Card key={dayData.date}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    {new Date(dayData.date).getDate()}日 ({dayData.dayOfWeek})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.values(dayData.timeSlots).map(({ timeSlot, requests: timeSlotRequests }) => {
                      const totalRequests = 
                        timeSlotRequests.priority1.length +
                        timeSlotRequests.priority2.length +
                        timeSlotRequests.priority3.length;

                      if (totalRequests === 0) return null;

                      return (
                        <div key={timeSlot.id} className="border border-gray-200 rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-2">
                            {timeSlot.name}
                          </h4>
                          <p className="text-sm text-gray-600 mb-3">
                            {formatTime(timeSlot.start_time)} - {formatTime(timeSlot.end_time)}
                          </p>
                          
                          <div className="space-y-2 mb-3">
                            {timeSlotRequests.priority1.length > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-red-600 font-medium">最優先</span>
                                <span>{timeSlotRequests.priority1.length}名</span>
                              </div>
                            )}
                            {timeSlotRequests.priority2.length > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-blue-600 font-medium">希望</span>
                                <span>{timeSlotRequests.priority2.length}名</span>
                              </div>
                            )}
                            {timeSlotRequests.priority3.length > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600 font-medium">可能</span>
                                <span>{timeSlotRequests.priority3.length}名</span>
                              </div>
                            )}
                          </div>

                          <Button
                            variant="secondary"
                            className="w-full text-sm"
                            onClick={() => {
                              setSelectedDate(dayData.date);
                              setViewMode('detailed');
                            }}
                          >
                            詳細確認
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 詳細表示 */}
        {viewMode === 'detailed' && (
          <div className="space-y-6">
            {requests.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-gray-500">提出されたシフト希望がありません</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {requests.map(request => (
                  <Card key={request.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-medium">{request.users?.name}</h3>
                            <span className={`text-xs px-2 py-1 rounded-full border ${getPriorityColor(request.priority)}`}>
                              {getPriorityLabel(request.priority)}
                            </span>
                          </div>
                          
                          <p className="text-sm text-gray-600">
                            {new Date(request.date).getDate()}日 ({getJapaneseDayOfWeek(request.date)})
                          </p>
                          
                          {request.time_slots && (
                            <p className="text-sm">
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
                        </div>

                        <div className="flex space-x-2">
                          <Button
                            variant="primary"
                            className="text-sm"
                            onClick={() => handleCreateShifts(request.date, request.time_slot_id!, [request.id])}
                          >
                            シフト作成
                          </Button>
                          <Button
                            variant="secondary"
                            className="text-sm"
                            onClick={() => {/* 詳細表示モーダル */}}
                          >
                            詳細
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
} 