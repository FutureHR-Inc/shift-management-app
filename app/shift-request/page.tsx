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
      setError(null);

      // ユーザー情報を安全に取得
      const userInfo = localStorage.getItem('currentUser');
      if (!userInfo) {
        setError('ユーザー情報が見つかりません。再ログインしてください。');
        return;
      }

      let user;
      try {
        user = JSON.parse(userInfo);
      } catch (parseError) {
        console.error('User info parse error:', parseError);
        setError('ユーザー情報の解析に失敗しました。再ログインしてください。');
        return;
      }

      if (!user || !user.id) {
        setError('ユーザーIDが見つかりません。再ログインしてください。');
        return;
      }

      // 提出期間を生成
      const submissionPeriods = getSubmissionPeriods();
      setPeriods(submissionPeriods);

      // デフォルトで最初の提出可能期間を選択
      const defaultPeriod = submissionPeriods.find(p => p.isSubmissionOpen);
      if (defaultPeriod) {
        setSelectedPeriod(defaultPeriod);
      }

      // ユーザーの所属店舗を取得
      try {
        const userResponse = await fetch(`/api/users?id=${user.id}`);
        if (!userResponse.ok) {
          throw new Error('ユーザー情報の取得に失敗しました');
        }
        const userResult = await userResponse.json();
        const userData = userResult.data;
        
        if (userData && userData.length > 0) {
          const userInfo = userData[0];
          
          if (userInfo.user_stores && userInfo.user_stores.length > 0) {
            // ユーザーが所属する店舗のリストを作成
            const userStoreList = userInfo.user_stores.map((userStore: any) => ({
              store_id: userStore.store_id,
              stores: { 
                id: userStore.stores.id, 
                name: userStore.stores.name 
              }
            }));
            
            setUserStores(userStoreList);

            // デフォルトで最初の店舗を選択
            if (userStoreList.length > 0) {
              setSelectedStore(userStoreList[0].store_id);
            }
          } else {
            setError('所属店舗が設定されていません。管理者にお問い合わせください。');
          }
        } else {
          setError('ユーザー情報が見つかりません');
        }
      } catch (fetchError) {
        console.error('User fetch error:', fetchError);
        setError('ユーザー情報の取得に失敗しました');
      }

    } catch (error) {
      console.error('Initialize page error:', error);
      setError('ページの初期化に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const loadPeriodData = async () => {
    if (!selectedPeriod || !selectedStore) return;

    try {
      setLoading(true);
      setError(null);

      // ユーザー情報を安全に取得
      const userInfo = localStorage.getItem('currentUser');
      if (!userInfo) {
        setError('ユーザー情報が見つかりません。再ログインしてください。');
        return;
      }

      let user;
      try {
        user = JSON.parse(userInfo);
      } catch (parseError) {
        console.error('User info parse error:', parseError);
        setError('ユーザー情報の解析に失敗しました。再ログインしてください。');
        return;
      }

      // 選択期間の日付範囲を生成
      const dateRange = generateDateRange(selectedPeriod.startDate, selectedPeriod.endDate);
      const dateData = dateRange.map(date => ({
        date,
        dayOfWeek: getJapaneseDayOfWeek(date),
        requests: []
      }));
      setDates(dateData);

      // 時間帯を取得
      try {
        const timeSlotsResponse = await fetch(`/api/time-slots?store_id=${selectedStore}`);
        if (!timeSlotsResponse.ok) {
          throw new Error('時間帯の取得に失敗しました');
        }
        const timeSlotsResult = await timeSlotsResponse.json();
        setTimeSlots(timeSlotsResult.data || []);
      } catch (fetchError) {
        console.error('Time slots fetch error:', fetchError);
        setError('時間帯情報の取得に失敗しました');
      }

      // 既存の提出データを取得
      try {
        const existingResponse = await fetch(
          `/api/shift-requests?user_id=${user.id}&store_id=${selectedStore}&submission_period=${selectedPeriod.id}`
        );
        if (!existingResponse.ok) {
          throw new Error('既存データの取得に失敗しました');
        }
        const existingResult = await existingResponse.json();
        const existingData = existingResult.data || [];
        setExistingRequests(existingData);

        // 既存データを日付データに反映
        const updatedDates = dateData.map(d => ({
          ...d,
          requests: existingData
            .filter((req: DatabaseShiftRequest) => req.date === d.date)
            .map((req: DatabaseShiftRequest) => ({
              date: req.date,
              timeSlotId: req.time_slot_id,
              preferredStartTime: req.preferred_start_time,
              preferredEndTime: req.preferred_end_time,
              priority: req.priority as 1 | 2 | 3,
              notes: req.notes || ''
            }))
        }));
        setDates(updatedDates);

      } catch (fetchError) {
        console.error('Existing requests fetch error:', fetchError);
        // 既存データの取得エラーは致命的ではないので、警告のみ表示
        console.warn('既存のシフト希望データの取得に失敗しました');
        setDates(dateData);
      }

    } catch (error) {
      console.error('Load period data error:', error);
      setError('期間データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRequest = (date: string) => {
    const newRequest: ShiftRequestData = {
      date,
      timeSlotId: null,
      preferredStartTime: null,
      preferredEndTime: null,
      priority: 2, // デフォルトは「希望」
      notes: ''
    };

    setDates(prev => prev.map(d =>
      d.date === date
        ? { ...d, requests: [...d.requests, newRequest] }
        : d
    ));

    // 追加後、その日付を展開表示
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
    if (!selectedPeriod || !selectedStore) {
      setError('提出期間と店舗を選択してください');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // ユーザー情報を安全に取得
      const userInfo = localStorage.getItem('currentUser');
      if (!userInfo) {
        setError('ユーザー情報が見つかりません。再ログインしてください。');
        return;
      }

      let user;
      try {
        user = JSON.parse(userInfo);
      } catch (parseError) {
        console.error('User info parse error:', parseError);
        setError('ユーザー情報の解析に失敗しました。再ログインしてください。');
        return;
      }

      if (!user || !user.id) {
        setError('ユーザーIDが見つかりません。再ログインしてください。');
        return;
      }
      
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

      // 空の希望がある場合は警告
      if (allRequests.length === 0) {
        setError('少なくとも1つのシフト希望を入力してください');
        return;
      }

      // 既存の希望と比較して新規分のみを抽出
      const newRequests = allRequests.filter(newReq => {
        return !existingRequests.some(existing => 
          existing.date === newReq.date &&
          existing.time_slot_id === newReq.time_slot_id &&
          existing.preferred_start_time === newReq.preferred_start_time &&
          existing.preferred_end_time === newReq.preferred_end_time &&
          existing.priority === newReq.priority &&
          existing.notes === newReq.notes &&
          existing.status === 'submitted' // 提出済みのもののみ除外
        );
      });

      // 新規追加分がない場合は確認
      if (newRequests.length === 0) {
        setError('新しく追加されたシフト希望がありません。既存の希望は変更されません。');
        return;
      }

      console.log(`${allRequests.length}件中、${newRequests.length}件の新規希望を送信します`);

      const response = await fetch('/api/shift-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          store_id: selectedStore,
          submission_period: selectedPeriod.id,
          requests: newRequests,
          is_incremental: true // 差分更新フラグ
        }),
      });

      if (!response.ok) {
        let errorMessage = 'シフト希望の提出に失敗しました';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error('Error parsing error response:', e);
        }
        setError(errorMessage);
        return;
      }

      const result = await response.json();
      
      // 成功メッセージを表示
      setSuccessMessage(`${newRequests.length}件の新しいシフト希望を追加提出しました`);
      setError(null);
      
      // 既存データを更新
      await loadPeriodData();

    } catch (error) {
      console.error('Submit error:', error);
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

  const hasValidRequests = () => {
    return dates.some(dateData =>
      dateData.requests.some(req => req.timeSlotId !== null)
    );
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
      <div className="space-y-6 pb-20">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📅 シフト希望提出</h1>
            <p className="text-gray-600 mt-2">勤務可能な日時を選択して提出してください</p>
          </div>
        </div>

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
              disabled={saving || !hasValidRequests()}
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