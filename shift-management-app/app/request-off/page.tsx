'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// ユーザー型定義
interface User {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'staff';
  loginId: string;
  stores: string[];
}

// APIから取得するデータ用の型
interface ApiTimeOffRequest {
  id: string;
  user_id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  responded_at: string | null;
  responded_by: string | null;
  created_at: string;
  users?: {
    id: string;
    name: string;
    role: string;
  };
  responded_by_user?: {
    id: string;
    name: string;
  };
}

// フロントエンド用の型変換後
interface DisplayTimeOffRequest {
  id: string;
  userId: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  respondedAt: string | null;
  respondedBy: string | null;
  createdAt: string;
  respondedByName?: string;
}

type SelectionMode = 'single' | 'range' | 'multiple';

export default function RequestOffPage() {
  // 認証関連のstate
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const router = useRouter();

  // データベースから取得するstate
  const [requests, setRequests] = useState<DisplayTimeOffRequest[]>([]);
  
  // UI state - 複数日選択対応
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('single');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 認証チェックとユーザー情報取得
  useEffect(() => {
    const userInfo = localStorage.getItem('currentUser');
    if (!userInfo) {
      router.push('/login');
      return;
    }

    try {
      const user = JSON.parse(userInfo);
      setCurrentUser(user);
    } catch (error) {
      console.error('ユーザー情報の解析に失敗:', error);
      router.push('/login');
    }
  }, [router]);

  // データ取得関数
  const fetchTimeOffRequests = useCallback(async () => {
    if (!currentUser) return [];
    
    try {
      // 現在のユーザーの申請のみ取得
      const response = await fetch(`/api/time-off-requests?user_id=${currentUser.id}`);
      if (!response.ok) throw new Error('希望休申請データの取得に失敗しました');
      const result = await response.json();
      
      // API response を DisplayTimeOffRequest 型に変換
      const requestsData = result.data?.map((request: ApiTimeOffRequest) => ({
        id: request.id,
        userId: request.user_id,
        date: request.date,
        reason: request.reason,
        status: request.status,
        respondedAt: request.responded_at,
        respondedBy: request.responded_by,
        createdAt: request.created_at,
        respondedByName: request.responded_by_user?.name
      })) || [];
      
      return requestsData;
    } catch (error) {
      console.error('Error fetching time off requests:', error);
      throw error;
    }
  }, [currentUser]);

  // 初期データ読み込み
  useEffect(() => {
    if (!currentUser) return;
    
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const requestsData = await fetchTimeOffRequests();
        setRequests(requestsData);
        
      } catch (error) {
        setError(error instanceof Error ? error.message : '初期データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [currentUser, fetchTimeOffRequests]);

  // 日付ユーティリティ関数
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
  };

  const generateDateRange = (start: string, end: string): string[] => {
    const dates = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      dates.push(date.toISOString().split('T')[0]);
    }
    
    return dates;
  };

  // 選択モード変更時の処理
  const handleModeChange = (mode: SelectionMode) => {
    setSelectionMode(mode);
    setSelectedDates([]);
    setRangeStart('');
    setRangeEnd('');
  };

  // 個別日付選択の処理
  const handleDateToggle = (date: string) => {
    if (selectedDates.includes(date)) {
      setSelectedDates(selectedDates.filter(d => d !== date));
    } else {
      setSelectedDates([...selectedDates, date].sort());
    }
  };

  // 範囲選択の処理
  const handleRangeChange = (start: string, end: string) => {
    setRangeStart(start);
    setRangeEnd(end);
    
    if (start && end && start <= end) {
      const rangeDates = generateDateRange(start, end);
      setSelectedDates(rangeDates);
    } else if (start && !end) {
      setSelectedDates([start]);
    } else {
      setSelectedDates([]);
    }
  };

  // 最終的な選択日程を取得
  const getFinalSelectedDates = (): string[] => {
    switch (selectionMode) {
      case 'single':
        return selectedDates.slice(0, 1);
      case 'range':
        return rangeStart && rangeEnd ? generateDateRange(rangeStart, rangeEnd) : [];
      case 'multiple':
        return selectedDates;
      default:
        return [];
    }
  };

  // 申請送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // ユーザー認証チェック
    if (!currentUser) {
      setError('ログインが必要です');
      setIsSubmitting(false);
      router.push('/login');
      return;
    }

    const finalDates = getFinalSelectedDates();

    // フロントエンド側バリデーション
    const trimmedReason = reason.trim();
    
    // 日付チェック
    if (finalDates.length === 0) {
      setError('希望休日を選択してください');
      setIsSubmitting(false);
      return;
    }

    // 最大日数制限（例：30日）
    if (finalDates.length > 30) {
      setError('一度に申請できる日数は30日までです');
      setIsSubmitting(false);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 過去日チェック
    const hasPastDate = finalDates.some(date => new Date(date) < today);
    if (hasPastDate) {
      setError('過去の日付は選択できません');
      setIsSubmitting(false);
      return;
    }

    // 既存申請との重複チェック
    const existingDates = new Set(requests.map(r => r.date));
    const duplicateDates = finalDates.filter(date => existingDates.has(date));
    if (duplicateDates.length > 0) {
      setError(`以下の日付は既に申請済みです: ${duplicateDates.map(formatDate).join(', ')}`);
      setIsSubmitting(false);
      return;
    }

    // 理由チェック
    if (trimmedReason.length < 5) {
      setError('理由は5文字以上で入力してください');
      setIsSubmitting(false);
      return;
    }

    if (trimmedReason.length > 500) {
      setError('理由は500文字以内で入力してください');
      setIsSubmitting(false);
      return;
    }

    try {
      // 複数日申請を並列処理
      const requestPromises = finalDates.map(date => {
        const requestData = {
          user_id: currentUser?.id,
          date: date,
          reason: trimmedReason
        };

        return fetch('/api/time-off-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
        });
      });

      const responses = await Promise.all(requestPromises);
      
      // 全ての応答をチェック
      const results = await Promise.all(responses.map(async (response, index) => {
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`${formatDate(finalDates[index])}: ${errorData.error || '申請に失敗しました'}`);
        }
        return response.json();
      }));

      // 新しい申請をローカル状態に追加
      const newRequests: DisplayTimeOffRequest[] = results.map(result => ({
        id: result.data.id,
        userId: result.data.user_id,
        date: result.data.date,
        reason: result.data.reason,
        status: result.data.status,
        respondedAt: result.data.responded_at,
        respondedBy: result.data.responded_by,
        createdAt: result.data.created_at,
        respondedByName: undefined
      }));

      setRequests([...newRequests, ...requests]);
      
      // フォームリセット
      setSelectedDates([]);
      setRangeStart('');
      setRangeEnd('');
      setReason('');
      
      // 成功メッセージ
      const message = finalDates.length === 1 
        ? '希望休申請を送信しました。店長の承認をお待ちください。'
        : `${finalDates.length}日分の希望休申請を送信しました。店長の承認をお待ちください。`;
      alert(message);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : '希望休申請の送信に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 申請削除（保留中のものだけ）
  const handleDeleteRequest = async (requestId: string) => {
    if (!confirm('この申請を削除してもよろしいですか？')) return;

    try {
      const response = await fetch(`/api/time-off-requests?id=${requestId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '申請の削除に失敗しました');
      }

      // ローカル状態から削除
      setRequests(requests.filter(request => request.id !== requestId));
    } catch (error) {
      setError(error instanceof Error ? error.message : '申請の削除に失敗しました');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '承認待ち';
      case 'approved': return '承認済み';
      case 'rejected': return '却下';
      default: return '不明';
    }
  };

  // ローディング表示
  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">データを読み込んでいます...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        {/* エラー表示バー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ヘッダー */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">希望休申請</h1>
          <p className="text-gray-600 mt-2">希望する休日を申請できます</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 新規申請フォーム */}
          <Card>
            <CardHeader>
              <CardTitle>新しい希望休を申請</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 選択モード切り替え */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    選択方法 *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleModeChange('single')}
                      className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        selectionMode === 'single'
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                      disabled={isSubmitting}
                    >
                      単日選択
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('range')}
                      className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        selectionMode === 'range'
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                      disabled={isSubmitting}
                    >
                      連続期間
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('multiple')}
                      className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        selectionMode === 'multiple'
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                      disabled={isSubmitting}
                    >
                      複数選択
                    </button>
                  </div>
                </div>

                {/* 日付選択UI */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    希望休日 *
                  </label>
                  
                  {selectionMode === 'single' && (
                    <div>
                      <Input
                        type="date"
                        value={selectedDates[0] || ''}
                        onChange={(e) => setSelectedDates(e.target.value ? [e.target.value] : [])}
                        min={new Date().toISOString().split('T')[0]}
                        disabled={isSubmitting}
                      />
                      <p className="text-xs text-gray-500 mt-1">1日のみ選択してください</p>
                    </div>
                  )}

                  {selectionMode === 'range' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">開始日</label>
                          <Input
                            type="date"
                            value={rangeStart}
                            onChange={(e) => handleRangeChange(e.target.value, rangeEnd)}
                            min={new Date().toISOString().split('T')[0]}
                            disabled={isSubmitting}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">終了日</label>
                          <Input
                            type="date"
                            value={rangeEnd}
                            onChange={(e) => handleRangeChange(rangeStart, e.target.value)}
                            min={rangeStart || new Date().toISOString().split('T')[0]}
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        連続した期間を選択してください（旅行・長期休暇など）
                      </p>
                    </div>
                  )}

                  {selectionMode === 'multiple' && (
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          disabled={isSubmitting}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleDateToggle(e.target.value);
                              e.target.value = '';
                            }
                          }}
                        />
                        <span className="text-sm text-gray-500">日付を選択して追加</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        複数の日付を個別に選択できます（最大30日）
                      </p>
                    </div>
                  )}
                </div>

                {/* 選択された日程の表示 */}
                {selectedDates.length > 0 && (
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <h4 className="font-medium text-blue-900 mb-2">
                      選択された日程（{selectedDates.length}日）
                    </h4>
                    <div className="max-h-32 overflow-y-auto">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedDates.map((date) => (
                          <div
                            key={date}
                            className="flex items-center justify-between p-2 bg-white rounded-lg border border-blue-200"
                          >
                            <span className="text-sm text-blue-800">
                              {formatDate(date)}
                            </span>
                            {selectionMode === 'multiple' && (
                              <button
                                type="button"
                                onClick={() => handleDateToggle(date)}
                                className="text-red-500 hover:text-red-700 ml-2"
                                disabled={isSubmitting}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    {selectionMode === 'range' && selectedDates.length > 1 && (
                      <p className="text-xs text-blue-700 mt-2">
                        📅 {formatDate(selectedDates[0])} から {formatDate(selectedDates[selectedDates.length - 1])} まで
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    理由 *
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="希望休の理由を入力してください（例：家族の用事、通院、冠婚葬祭など）"
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="p-4 bg-blue-50 rounded-xl">
                  <h4 className="font-medium text-blue-900 mb-2">申請前の注意事項</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• 希望休は最低1週間前までに申請してください</li>
                    <li>• 連続期間の申請は旅行など正当な理由が必要です</li>
                    <li>• 一度に申請できる日数は最大30日までです</li>
                    <li>• 繁忙期や重要なイベント時は承認されない場合があります</li>
                    <li>• 承認結果は申請後24時間以内にお知らせします</li>
                    <li>• 緊急の場合は直接店長に連絡してください</li>
                  </ul>
                </div>

                <Button type="submit" fullWidth disabled={isSubmitting || !selectedDates.length || !reason.trim()}>
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      送信中...
                    </>
                  ) : (
                    selectedDates.length === 1 
                      ? '申請を送信' 
                      : `${selectedDates.length}日分の申請を送信`
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* 申請履歴 */}
          <Card>
            <CardHeader>
              <CardTitle>申請履歴</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {requests.length > 0 ? (
                  (() => {
                    // 同じ理由・同じ申請時刻でグループ化
                    const groupedRequests = requests.reduce((groups, request) => {
                      const key = `${request.reason}-${new Date(request.createdAt).toISOString().split('T')[0]}`;
                      if (!groups[key]) {
                        groups[key] = [];
                      }
                      groups[key].push(request);
                      return groups;
                    }, {} as Record<string, DisplayTimeOffRequest[]>);

                    return Object.values(groupedRequests)
                      .sort((a, b) => new Date(b[0].createdAt).getTime() - new Date(a[0].createdAt).getTime())
                      .map((group) => {
                        const isMultipleDay = group.length > 1;
                        const sortedGroup = group.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        const firstRequest = sortedGroup[0];
                        const allSameStatus = group.every(r => r.status === firstRequest.status);

                        return (
                          <div key={`group-${firstRequest.id}`} className="border border-gray-200 rounded-xl p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                {isMultipleDay ? (
                                  <div>
                                    <p className="font-semibold text-gray-900">
                                      {group.length}日間の希望休
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      {formatDate(sortedGroup[0].date)} 〜 {formatDate(sortedGroup[sortedGroup.length - 1].date)}
                                    </p>
                                    <p className="text-sm text-gray-500">
                                      申請日: {new Date(firstRequest.createdAt).toLocaleDateString('ja-JP')}
                                    </p>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="font-semibold text-gray-900">
                                      {formatDate(firstRequest.date)}
                                    </p>
                                    <p className="text-sm text-gray-500">
                                      申請日: {new Date(firstRequest.createdAt).toLocaleDateString('ja-JP')}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                {allSameStatus ? (
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(firstRequest.status)}`}>
                                    {getStatusText(firstRequest.status)}
                                  </span>
                                ) : (
                                  <div className="flex flex-col space-y-1">
                                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                                      混在
                                    </span>
                                  </div>
                                )}
                                {firstRequest.status === 'pending' && allSameStatus && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm(`${group.length}日分の申請を削除してもよろしいですか？`)) {
                                        group.forEach(request => handleDeleteRequest(request.id));
                                      }
                                    }}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            <div className="mb-3">
                              <p className="text-sm font-medium text-gray-700">理由</p>
                              <p className="text-gray-900">{firstRequest.reason}</p>
                            </div>

                            {/* 複数日の場合は個別日程も表示 */}
                            {isMultipleDay && (
                              <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                                <p className="text-sm font-medium text-gray-700 mb-2">申請日程</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {sortedGroup.map((request) => (
                                    <div key={request.id} className="flex items-center space-x-2">
                                      <span className="text-sm text-gray-600">
                                        {new Date(request.date).toLocaleDateString('ja-JP', {
                                          month: 'numeric',
                                          day: 'numeric',
                                          weekday: 'short'
                                        })}
                                      </span>
                                      <span className={`px-1 py-0.5 text-xs font-medium rounded ${getStatusColor(request.status)}`}>
                                        {getStatusText(request.status)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {firstRequest.status !== 'pending' && firstRequest.respondedAt && allSameStatus && (
                              <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-sm text-gray-600">
                                  {new Date(firstRequest.respondedAt).toLocaleDateString('ja-JP', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}に{firstRequest.respondedByName || '管理者'}が{getStatusText(firstRequest.status)}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      });
                  })()
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>まだ申請履歴がありません</p>
                    <p className="text-sm">最初の希望休申請をしてみましょう</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {requests.filter(r => r.status === 'pending').length}
              </div>
              <p className="text-sm text-gray-500 mt-1">承認待ち</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-green-600">
                {requests.filter(r => r.status === 'approved').length}
              </div>
              <p className="text-sm text-gray-500 mt-1">承認済み</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-blue-600">{requests.length}</div>
              <p className="text-sm text-gray-500 mt-1">総申請数</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  );
} 