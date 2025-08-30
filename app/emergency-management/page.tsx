'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function EmergencyManagementPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'browse' | 'create' | 'manage'>('browse');
  const [emergencyRequests, setEmergencyRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // ローカルストレージからユーザー情報を取得
  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    console.log('LocalStorage currentUser:', userStr);
    
    if (!userStr) {
      console.log('ユーザー情報がLocalStorageにありません');
        return;
      }
      
    try {
      const user = JSON.parse(userStr);
      console.log('Parsed user data:', {
        id: user.id,
        company_id: user.company_id
      });
      setCurrentUser(user);
    } catch (err) {
      console.error('ユーザーデータのパース中にエラーが発生:', err);
      setError('ユーザー情報の読み込みに失敗しました');
    }
  }, []);

  // 代打募集データを取得
  const fetchEmergencyRequests = useCallback(async () => {
    if (!currentUser?.id) {
      console.log('ユーザー情報が取得できていません');
      return;
    }

    try {
      setLoading(true);
      setError(null); // エラー状態をリセット
      console.log('代打募集データの取得開始:', { 
        currentUserId: currentUser.id,
        company_id: currentUser.company_id 
      });
      
      const response = await fetch(`/api/emergency-requests?current_user_id=${currentUser.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `データの取得に失敗しました (${response.status})`);
      }

      const data = await response.json();
      console.log('取得した代打募集データ:', {
        status: response.status,
        totalCount: data.data?.length || 0,
        firstItem: data.data?.[0] ? {
          id: data.data[0].id,
          store: data.data[0].stores?.name,
          date: data.data[0].date,
          status: data.data[0].status
        } : null
      });

      setEmergencyRequests(data.data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '予期せぬエラーが発生しました';
      console.error('代打募集データ取得エラー:', {
        error: err,
        message: errorMessage,
        userId: currentUser.id
      });
      setError(errorMessage);
      setEmergencyRequests([]); // エラー時はリストをクリア
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  // ユーザー情報が取得できたらデータを取得
  useEffect(() => {
    if (currentUser?.id) {
      fetchEmergencyRequests();
    }
  }, [currentUser]);

  // 応募者を承認
  const handleApproveVolunteer = async (volunteerId: string) => {
    try {
      setLoading(true);
      
      // ボタンを無効化するために、承認中の応募者IDを保存
      const response = await fetch('/api/emergency-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emergency_request_id: selectedRequest.id,
          volunteer_id: volunteerId,
          action: 'accept'
        }),
      });

      if (!response.ok) throw new Error('承認処理に失敗しました');

      const result = await response.json();
      
      // シフト作成の成功メッセージを表示
      alert('応募者を承認し、シフトを作成しました');
      
      // データを再取得してから画面を更新
      await fetchEmergencyRequests();
      setActiveTab('browse');
      setSelectedRequest(null);
      
      // シフト作成画面に遷移（作成されたシフトを確認できるように）
      router.push('/shift/create');
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // 応募者を却下
  const handleRejectVolunteer = async (volunteerId: string) => {
    try {
      setLoading(true);
      const response = await fetch('/api/emergency-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emergency_request_id: selectedRequest.id,
          volunteer_id: volunteerId,
          action: 'reject'
        }),
      });

      if (!response.ok) throw new Error('却下処理に失敗しました');
      
      // データを再取得
      await fetchEmergencyRequests();
      alert('応募者を却下しました');
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

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
            </button>
          </nav>
        </div>

        {/* タブコンテンツ */}
        {activeTab === 'browse' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>代打募集一覧</CardTitle>
                <p className="text-sm text-gray-600">全ての代打募集状況を確認できます</p>
              </CardHeader>
              <CardContent>
                        <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">募集日時</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">店舗</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">シフト時間</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">募集理由</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">応募者数</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                                </tr>
                              </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                            データを読み込み中...
                          </td>
                        </tr>
                      ) : error ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-4 text-center text-sm text-red-500">
                            {error}
                          </td>
                        </tr>
                      ) : emergencyRequests?.length > 0 ? (
                        emergencyRequests.map((request) => (
                          <tr key={request.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(request.date).toLocaleDateString('ja-JP')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div className="flex items-center">
                                <span className="truncate max-w-[150px]">
                                  {request.stores?.name || '不明な店舗'}
                                </span>
                                      </div>
                                    </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div>
                                <span className="font-medium">{request.time_slots?.name || '不明なシフト'}</span>
                                <br />
                                <span className="text-gray-500">
                                  {request.time_slots?.start_time || '--:--'}-{request.time_slots?.end_time || '--:--'}
                                              </span>
                                            </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div className="max-w-[200px] truncate" title={request.reason}>
                                {request.reason}
                                                      </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                request.status === 'open' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {request.status === 'open' ? '募集中' : '確定済み'}
                                                  </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div className="flex items-center space-x-1">
                                <span>{request.emergency_volunteers?.length || 0}</span>
                                <span>人</span>
                                          </div>
                                        </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <Button
                                onClick={() => {
                                  setActiveTab('manage');
                                  setSelectedRequest(request);
                                }}
                                variant="outline"
                                size="sm"
                              >
                                詳細
                              </Button>
                            </td>
                                  </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                            現在、募集中の代打はありません
                          </td>
                        </tr>
                      )}
                              </tbody>
                            </table>
                          </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'create' && (
          <div className="space-y-6">
            {/* 代打募集作成 */}
            <Card>
                <CardHeader>
                <CardTitle>代打募集の作成</CardTitle>
                <p className="text-sm text-gray-600">代打募集を作成するには、シフト作成画面から代打を募集したいスタッフ枠を選択して、代打募集をしてください</p>
                </CardHeader>
                <CardContent>
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                  </div>
                    <div className="ml-3">
                      <p className="font-medium text-blue-800 mb-1">代打募集の手順:</p>
                      <ol className="text-blue-700 space-y-1">
                        <li>1. シフト作成画面に移動</li>
                        <li>2. 既存のスタッフ枠をクリック</li>
                        <li>3. 「代打を募集」を選択</li>
                        <li>4. 募集理由を入力して作成完了</li>
                      </ol>
                </div>
                  </div>
                  </div>
                <Button
                  onClick={() => router.push('/shift/create')}
                  className="w-full justify-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  シフト作成画面に移動
                </Button>
              </CardContent>
            </Card>

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

        {activeTab === 'manage' && selectedRequest && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>応募者管理</CardTitle>
                <p className="text-sm text-gray-600">応募者の確認と承認・却下を行えます</p>
              </CardHeader>
              <CardContent>
                {/* 募集シフトの詳細 */}
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">募集シフト詳細</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">日時</p>
                      <p className="font-medium">{new Date(selectedRequest.date).toLocaleDateString('ja-JP')}</p>
                  </div>
                    <div>
                      <p className="text-gray-500">店舗</p>
                      <p className="font-medium">{selectedRequest.stores?.name}</p>
                                </div>
                    <div>
                      <p className="text-gray-500">シフト時間</p>
                      <p className="font-medium">
                        {selectedRequest.time_slots?.name}<br />
                        {selectedRequest.time_slots?.start_time}-{selectedRequest.time_slots?.end_time}
                      </p>
                                      </div>
                    <div>
                      <p className="text-gray-500">募集理由</p>
                      <p className="font-medium">{selectedRequest.reason}</p>
                                    </div>
                                </div>
                              </div>

                {/* 応募者一覧 */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-4">応募者一覧</h3>
                  {selectedRequest.emergency_volunteers?.length > 0 ? (
                <div className="space-y-4">
                                            {selectedRequest.emergency_volunteers.map((volunteer: any) => (
                        <div key={volunteer.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                        <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{volunteer.users?.name}</p>
                                {volunteer.status === 'accepted' && (
                                  <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                                    採用済み
                                  </span>
                                )}
                                {volunteer.status === 'rejected' && (
                                  <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                                    不採用
                                  </span>
                                )}
                              </div>
                          <p className="text-sm text-gray-500">
                                応募日時: {new Date(volunteer.responded_at).toLocaleString('ja-JP')}
                          </p>
                          {volunteer.notes && (
                                <p className="text-sm text-gray-600 mt-2">{volunteer.notes}</p>
                          )}
                        </div>
                            {!volunteer.status && (
                              <div className="flex gap-2">
                                                      <Button
                            onClick={() => {
                                  if (confirm(selectedRequest.request_type === 'substitute' 
                                    ? 'このスタッフを採用し、元のスタッフのシフトと入れ替えますか？'
                                    : 'このスタッフを採用し、シフトを作成しますか？'
                                  )) {
                                    handleApproveVolunteer(volunteer.id);
                                  }
                                }}
                                variant="primary"
                                size="sm"
                                disabled={loading}
                              >
                                {loading ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    シフト作成中...
                                  </>
                                ) : (
                                  '採用してシフト作成'
                                )}
                              </Button>
                        <Button
                          onClick={() => {
                                  if (confirm('このスタッフの応募を不採用にしますか？')) {
                                    handleRejectVolunteer(volunteer.id);
                                  }
                                }}
                                variant="destructive"
                                size="sm"
                                disabled={loading}
                              >
                                不採用
                        </Button>
                              </div>
                            )}
                      </div>
                    </div>
                  ))}
                </div>
                  ) : (
                    <p className="text-sm text-gray-500">まだ応募者がいません</p>
              )}
            </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
} 