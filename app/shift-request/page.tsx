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
  getTimeUntilDeadline,
  formatTime 
} from '@/lib/utils';
import type { DatabaseShiftRequest, TimeSlot, SubmissionPeriod } from '@/lib/types';

interface ShiftRequestData {
  date: string;
  timeSlotId: string | null;
  preferredStartTime: string | null;
  preferredEndTime: string | null;
  priority: 1 | 2 | 3;
  notes: string;
}

interface DateData {
  date: string;
  dayOfWeek: string;
  requests: ShiftRequestData[];
}

export default function ShiftRequestPage() {
  const router = useRouter();
  
  // State management
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data states
  const [periods, setPeriods] = useState<SubmissionPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<SubmissionPeriod | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [dates, setDates] = useState<DateData[]>([]);
  const [userStores, setUserStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [existingRequests, setExistingRequests] = useState<DatabaseShiftRequest[]>([]);

  // UI states
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEffect(() => {
    initializePage();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      loadPeriodData();
    }
  }, [selectedPeriod, selectedStore]);

  const initializePage = async () => {
    try {
      setLoading(true);
      
      // ユーザー情報と所属店舗を取得
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      
      const { data: userStoreData } = await fetch(`/api/user-stores/flexible?userId=${user.id}`).then(res => res.json());
      setUserStores(userStoreData || []);
      
      if (userStoreData && userStoreData.length > 0) {
        setSelectedStore(userStoreData[0].stores.id);
      }

      // 提出期間を設定
      const submissionPeriods = getSubmissionPeriods();
      setPeriods(submissionPeriods);
      
      // 提出可能な最初の期間を選択
      const openPeriod = submissionPeriods.find(p => p.isSubmissionOpen);
      if (openPeriod) {
        setSelectedPeriod(openPeriod);
      }

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

      // 既存の提出データを取得
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const existingResponse = await fetch(
        `/api/shift-requests?user_id=${user.id}&store_id=${selectedStore}&submission_period=${selectedPeriod.id}`
      );
      const existingData = await existingResponse.json();
      setExistingRequests(existingData.data || []);

      // 日付データを生成
      const dateRange = generateDateRange(selectedPeriod.startDate, selectedPeriod.endDate);
      const dateData: DateData[] = dateRange.map(date => ({
        date,
        dayOfWeek: getJapaneseDayOfWeek(date),
        requests: existingData.data?.filter((req: DatabaseShiftRequest) => req.date === date)
          .map((req: DatabaseShiftRequest) => ({
            date: req.date,
            timeSlotId: req.time_slot_id,
            preferredStartTime: req.preferred_start_time,
            preferredEndTime: req.preferred_end_time,
            priority: req.priority as 1 | 2 | 3,
            notes: req.notes || ''
          })) || []
      }));

      setDates(dateData);

    } catch (error) {
      setError('データの読み込みに失敗しました');
      console.error('Load period data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRequest = (date: string) => {
    setDates(prev => prev.map(d => 
      d.date === date 
        ? {
            ...d,
            requests: [...d.requests, {
              date,
              timeSlotId: null,
              preferredStartTime: null,
              preferredEndTime: null,
              priority: 2,
              notes: ''
            }]
          }
        : d
    ));
    setExpandedDate(date);
  };

  const handleUpdateRequest = (date: string, index: number, updates: Partial<ShiftRequestData>) => {
    setDates(prev => prev.map(d =>
      d.date === date
        ? {
            ...d,
            requests: d.requests.map((req, i) =>
              i === index ? { ...req, ...updates } : req
            )
          }
        : d
    ));
  };

  const handleRemoveRequest = (date: string, index: number) => {
    setDates(prev => prev.map(d =>
      d.date === date
        ? {
            ...d,
            requests: d.requests.filter((_, i) => i !== index)
          }
        : d
    ));
  };

  const handleSubmit = async () => {
    if (!selectedPeriod || !selectedStore) return;

    try {
      setSaving(true);
      setError(null);

      const user = JSON.parse(localStorage.getItem('user') || '{}');
      
      // 全ての希望を配列に変換
      const allRequests = dates.flatMap(dateData =>
        dateData.requests.map(req => ({
          date: req.date,
          time_slot_id: req.timeSlotId,
          preferred_start_time: req.preferredStartTime,
          preferred_end_time: req.preferredEndTime,
          priority: req.priority,
          notes: req.notes
        }))
      );

      const response = await fetch('/api/shift-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          store_id: selectedStore,
          submission_period: selectedPeriod.id,
          requests: allRequests
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'シフト希望の提出に失敗しました');
      }

      const result = await response.json();
      setSuccessMessage(result.message);
      
      // 3秒後にメッセージを消す
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'シフト希望の提出に失敗しました');
    } finally {
      setSaving(false);
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
      <div className="space-y-4 pb-20">
        {/* ヘッダー */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">📅 シフト希望提出</CardTitle>
            <p className="text-sm text-gray-600">
              勤務可能な日時を選択して提出してください
            </p>
          </CardHeader>
        </Card>

        {/* 成功・エラーメッセージ */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-green-700 text-sm">{successMessage}</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* 期間選択 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">📍 提出期間</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {periods.map(period => (
              <div
                key={period.id}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedPeriod?.id === period.id
                    ? 'border-blue-500 bg-blue-50'
                    : period.isSubmissionOpen
                      ? 'border-gray-200 hover:border-gray-300 bg-white'
                      : 'border-gray-100 bg-gray-50 opacity-50'
                }`}
                onClick={() => period.isSubmissionOpen && setSelectedPeriod(period)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">{period.label}</h3>
                    <p className="text-sm text-gray-600">
                      {period.startDate} 〜 {period.endDate}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs px-2 py-1 rounded-full ${
                      period.isSubmissionOpen 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {period.isSubmissionOpen ? '提出可能' : '期限切れ'}
                    </div>
                    {period.isSubmissionOpen && (
                      <p className="text-xs text-gray-500 mt-1">
                        {getTimeUntilDeadline(period.submissionDeadline)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 店舗選択 */}
        {userStores.length > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">🏪 店舗選択</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {userStores.map(store => (
                  <option key={store.stores.id} value={store.stores.id}>
                    {store.stores.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        )}

        {/* 日付・時間選択 */}
        {selectedPeriod && selectedStore && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">🕐 勤務希望日時</CardTitle>
              <p className="text-sm text-gray-600">
                勤務したい日をタップして時間帯を選択
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {dates.map(dateData => (
                <div key={dateData.date} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* 日付ヘッダー */}
                  <div
                    className="p-3 bg-gray-50 flex justify-between items-center cursor-pointer"
                    onClick={() => setExpandedDate(expandedDate === dateData.date ? null : dateData.date)}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">
                        {new Date(dateData.date).getDate()}日 ({dateData.dayOfWeek})
                      </span>
                      {dateData.requests.length > 0 && (
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                          {dateData.requests.length}件
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddRequest(dateData.date);
                      }}
                      className="text-xs py-1 px-2"
                    >
                      + 追加
                    </Button>
                  </div>

                  {/* 展開されたコンテンツ */}
                  {(expandedDate === dateData.date || dateData.requests.length > 0) && (
                    <div className="p-3 space-y-3">
                      {dateData.requests.map((request, index) => (
                        <div key={index} className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
                          {/* 時間帯選択 */}
                          <div>
                            <label className="block text-sm font-medium mb-2">時間帯</label>
                            <select
                              value={request.timeSlotId || ''}
                              onChange={(e) => handleUpdateRequest(dateData.date, index, { 
                                timeSlotId: e.target.value || null 
                              })}
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">時間帯を選択</option>
                              {timeSlots.map(slot => (
                                <option key={slot.id} value={slot.id}>
                                  {slot.name} ({formatTime(slot.start_time)} - {formatTime(slot.end_time)})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 優先度選択 */}
                          <div>
                            <label className="block text-sm font-medium mb-2">優先度</label>
                            <div className="grid grid-cols-3 gap-2">
                              {[1, 2, 3].map(priority => (
                                <button
                                  key={priority}
                                  type="button"
                                  onClick={() => handleUpdateRequest(dateData.date, index, { 
                                    priority: priority as 1 | 2 | 3 
                                  })}
                                  className={`p-2 text-sm rounded-lg border transition-all ${
                                    request.priority === priority
                                      ? getPriorityColor(priority)
                                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                  }`}
                                >
                                  {getPriorityLabel(priority)}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* メモ */}
                          <div>
                            <label className="block text-sm font-medium mb-2">メモ（任意）</label>
                            <textarea
                              value={request.notes}
                              onChange={(e) => handleUpdateRequest(dateData.date, index, { 
                                notes: e.target.value 
                              })}
                              placeholder="時間調整の希望など..."
                              rows={2}
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                          </div>

                          {/* 削除ボタン */}
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => handleRemoveRequest(dateData.date, index)}
                              className="text-red-600 hover:bg-red-50 text-sm py-1 px-2"
                            >
                              削除
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* 提出ボタン */}
        {selectedPeriod?.isSubmissionOpen && selectedStore && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
            <Button
              onClick={handleSubmit}
              disabled={saving || dates.every(d => d.requests.length === 0)}
              className="w-full"
            >
              {saving ? '提出中...' : 'シフト希望を提出'}
            </Button>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
} 