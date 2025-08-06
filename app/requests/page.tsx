'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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
  userName: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  respondedAt: string | null;
  respondedBy: string | null;
  createdAt: string;
  respondedByName?: string;
}

// User型の定義
interface User {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'staff';
}

export default function RequestsPage() {
  const router = useRouter();
  
  // 認証状態
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // データベースから取得するstate
  const [requests, setRequests] = useState<DisplayTimeOffRequest[]>([]);
  
  // UI state
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // 認証チェック
  useEffect(() => {
    const checkAuth = () => {
      const userData = localStorage.getItem('currentUser');
      if (!userData) {
        router.push('/login');
        return;
      }
      
      try {
        const user = JSON.parse(userData);
        if (user.role !== 'manager') {
          router.push('/dashboard');
          return;
        }
        setCurrentUser(user);
      } catch (error) {
        console.error('Error parsing user data:', error);
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

  // データ取得関数
  const fetchTimeOffRequests = async () => {
    try {
      // 全ての申請を取得（管理者権限）
      const response = await fetch('/api/time-off-requests');
      if (!response.ok) throw new Error('希望休申請データの取得に失敗しました');
      const result = await response.json();
      
      // API response を DisplayTimeOffRequest 型に変換
      const requestsData = result.data?.map((request: ApiTimeOffRequest) => ({
        id: request.id,
        userId: request.user_id,
        userName: request.users?.name || '不明なユーザー',
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
  };

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
  }, [currentUser]);

  // フィルタリング
  const filteredRequests = requests.filter(request => {
    const matchesSearch = request.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.reason.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || request.status === selectedStatus;
    
    return matchesSearch && matchesStatus;
  });

  // 承認処理
  const handleApprove = async (requestId: string) => {
    if (!currentUser) {
      setError('ユーザー認証が必要です');
      return;
    }
    
    if (!confirm('この申請を承認してもよろしいですか？')) return;

    setProcessing(requestId);
    setError(null);

    try {
      const response = await fetch('/api/time-off-requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: requestId,
          status: 'approved',
          responded_by: currentUser.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '申請の承認に失敗しました');
      }

      const result = await response.json();
      
      // ローカル状態を更新
      setRequests(requests.map(request => 
        request.id === requestId 
          ? {
              ...request,
              status: 'approved' as const,
              respondedAt: result.data.responded_at,
              respondedBy: result.data.responded_by,
              respondedByName: result.data.responded_by_user?.name
            }
          : request
      ));

    } catch (error) {
      setError(error instanceof Error ? error.message : '申請の承認に失敗しました');
    } finally {
      setProcessing(null);
    }
  };

  // 却下処理
  const handleReject = async (requestId: string) => {
    if (!currentUser) {
      setError('ユーザー認証が必要です');
      return;
    }
    
    if (!confirm('この申請を却下してもよろしいですか？')) return;

    setProcessing(requestId);
    setError(null);

    try {
      const response = await fetch('/api/time-off-requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: requestId,
          status: 'rejected',
          responded_by: currentUser.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '申請の却下に失敗しました');
      }

      const result = await response.json();
      
      // ローカル状態を更新
      setRequests(requests.map(request => 
        request.id === requestId 
          ? {
              ...request,
              status: 'rejected' as const,
              respondedAt: result.data.responded_at,
              respondedBy: result.data.responded_by,
              respondedByName: result.data.responded_by_user?.name
            }
          : request
      ));

    } catch (error) {
      setError(error instanceof Error ? error.message : '申請の却下に失敗しました');
    } finally {
      setProcessing(null);
    }
  };

  // 一括承認処理
  const handleBulkApprove = async (requestIds: string[]) => {
    if (!currentUser) {
      setError('ユーザー認証が必要です');
      return;
    }
    
    if (!confirm(`${requestIds.length}件の申請を一括承認してもよろしいですか？`)) return;

    setProcessing('bulk-approve');
    setError(null);

    try {
      const response = await fetch('/api/time-off-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_ids: requestIds,
          status: 'approved',
          responded_by: currentUser.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '一括承認に失敗しました');
      }

      const result = await response.json();
      
      // ローカル状態を更新
      setRequests(requests.map(request => 
        requestIds.includes(request.id)
          ? {
              ...request,
              status: 'approved' as const,
              respondedAt: new Date().toISOString(),
              respondedBy: currentUser.id,
              respondedByName: currentUser.name
            }
          : request
      ));

      alert(`${result.updated_count}件の申請を承認しました`);

    } catch (error) {
      setError(error instanceof Error ? error.message : '一括承認に失敗しました');
    } finally {
      setProcessing(null);
    }
  };

  // 一括却下処理
  const handleBulkReject = async (requestIds: string[]) => {
    if (!currentUser) {
      setError('ユーザー認証が必要です');
      return;
    }
    
    if (!confirm(`${requestIds.length}件の申請を一括却下してもよろしいですか？`)) return;

    setProcessing('bulk-reject');
    setError(null);

    try {
      const response = await fetch('/api/time-off-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_ids: requestIds,
          status: 'rejected',
          responded_by: currentUser.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '一括却下に失敗しました');
      }

      const result = await response.json();
      
      // ローカル状態を更新
      setRequests(requests.map(request => 
        requestIds.includes(request.id)
          ? {
              ...request,
              status: 'rejected' as const,
              respondedAt: new Date().toISOString(),
              respondedBy: currentUser.id,
              respondedByName: currentUser.name
            }
          : request
      ));

      alert(`${result.updated_count}件の申請を却下しました`);

    } catch (error) {
      setError(error instanceof Error ? error.message : '一括却下に失敗しました');
    } finally {
      setProcessing(null);
    }
  };

  // 日付ユーティリティ関数
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
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
      case 'pending': return '保留中';
      case 'approved': return '承認済み';
      case 'rejected': return '却下済み';
      default: return '不明';
    }
  };

  // ローディング表示（認証チェック中も含む）
  if (loading || !currentUser) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">
              {!currentUser ? '認証情報を確認しています...' : 'データを読み込んでいます...'}
            </p>
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">希望休申請管理</h1>
            <p className="text-gray-600 mt-2">スタッフからの希望休申請を確認・承認できます</p>
          </div>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">
                {requests.filter(r => r.status === 'pending').length}
              </div>
              <p className="text-sm text-gray-500 mt-1">保留中</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {requests.filter(r => r.status === 'approved').length}
              </div>
              <p className="text-sm text-gray-500 mt-1">承認済み</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {requests.filter(r => r.status === 'rejected').length}
              </div>
              <p className="text-sm text-gray-500 mt-1">却下済み</p>
            </CardContent>
          </Card>
        </div>

        {/* フィルター */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  検索
                </label>
                <Input
                  placeholder="スタッフ名・理由で検索"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ステータス
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                >
                  <option value="all">すべて</option>
                  <option value="pending">保留中</option>
                  <option value="approved">承認済み</option>
                  <option value="rejected">却下済み</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button variant="secondary" fullWidth disabled={loading}>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  レポート出力
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 申請リスト */}
        <Card>
          <CardHeader>
            <CardTitle>申請一覧 ({filteredRequests.length}件)</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>条件に一致する申請が見つかりません</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  // 申請をグループ化（同じユーザー・同じ理由・同じ申請日）
                  const groupedRequests = filteredRequests.reduce((groups, request) => {
                    const key = `${request.userId}-${request.reason}-${new Date(request.createdAt).toISOString().split('T')[0]}`;
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
                      // const allPending = group.every(r => r.status === 'pending'); // 未使用のため削除
                      const pendingRequests = group.filter(r => r.status === 'pending');

                      return (
                        <div key={`group-${firstRequest.id}`} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold">
                                  {firstRequest.userName.charAt(0)}
                                </div>
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <h3 className="text-lg font-semibold text-gray-900">{firstRequest.userName}</h3>
                                    {isMultipleDay && (
                                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                        {group.length}日間
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-500">
                                    申請日時: {new Date(firstRequest.createdAt).toLocaleDateString('ja-JP', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">希望休日</p>
                                  {isMultipleDay ? (
                                    <div>
                                      <p className="text-lg font-semibold text-gray-900">
                                        {formatDate(sortedGroup[0].date)} 〜 {formatDate(sortedGroup[sortedGroup.length - 1].date)}
                                      </p>
                                      <p className="text-sm text-gray-600">
                                        計{group.length}日間
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="text-lg font-semibold text-gray-900">
                                      {formatDate(firstRequest.date)}
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700">理由</p>
                                  <p className="text-gray-900">{firstRequest.reason}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700">ステータス</p>
                                  {allSameStatus ? (
                                    <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(firstRequest.status)}`}>
                                      {getStatusText(firstRequest.status)}
                                    </span>
                                  ) : (
                                    <div className="space-y-1">
                                      <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                                        混在
                                      </span>
                                      <p className="text-xs text-gray-500">
                                        保留中: {pendingRequests.length}件
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 複数日の場合は個別日程も表示 */}
                              {isMultipleDay && (
                                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                  <p className="text-sm font-medium text-gray-700 mb-2">申請日程詳細</p>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {sortedGroup.map((request) => (
                                      <div key={request.id} className="flex items-center justify-between p-2 bg-white rounded border">
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
                                    <span className="font-medium">{firstRequest.respondedByName || '管理者'}</span>により
                                    {new Date(firstRequest.respondedAt).toLocaleDateString('ja-JP', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}に{getStatusText(firstRequest.status)}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* アクションボタン */}
                            {pendingRequests.length > 0 && (
                              <div className="flex flex-col space-y-2 ml-4">
                                {/* 一括承認ボタン */}
                                <Button
                                  size="sm"
                                  onClick={() => handleBulkApprove(pendingRequests.map(r => r.id))}
                                  className="bg-green-500 hover:bg-green-600"
                                  disabled={processing === 'bulk-approve' || processing === 'bulk-reject'}
                                >
                                  {processing === 'bulk-approve' ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  ) : (
                                    <>
                                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      {pendingRequests.length > 1 ? `一括承認 (${pendingRequests.length})` : '承認'}
                                    </>
                                  )}
                                </Button>
                                
                                {/* 一括却下ボタン */}
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleBulkReject(pendingRequests.map(r => r.id))}
                                  disabled={processing === 'bulk-approve' || processing === 'bulk-reject'}
                                >
                                  {processing === 'bulk-reject' ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  ) : (
                                    <>
                                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                      {pendingRequests.length > 1 ? `一括却下 (${pendingRequests.length})` : '却下'}
                                    </>
                                  )}
                                </Button>

                                {/* 個別操作の場合は単一申請のみ表示 */}
                                {!isMultipleDay && pendingRequests.length === 1 && (
                                  <div className="pt-2 border-t border-gray-200">
                                    <p className="text-xs text-gray-500 mb-2">個別操作:</p>
                                    <div className="flex space-x-1">
                                      <Button
                                        size="sm"
                                        onClick={() => handleApprove(pendingRequests[0].id)}
                                        className="bg-green-500 hover:bg-green-600 text-xs px-2 py-1"
                                        disabled={processing === pendingRequests[0].id}
                                      >
                                        承認
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleReject(pendingRequests[0].id)}
                                        className="text-xs px-2 py-1"
                                        disabled={processing === pendingRequests[0].id}
                                      >
                                        却下
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
} 
