'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface User {
  id: string;
  name: string;
  role: string;
  skill_level?: string;
}

interface Store {
  id: string;
  name: string;
}

interface ShiftPattern {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
}

interface TimeSlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface EmergencyVolunteer {
  id: string;
  user_id: string;
  responded_at: string;
  notes?: string;
  users: User;
}

interface EmergencyRequest {
  id: string;
  original_user_id: string;
  store_id: string;
  date: string;
  time_slot_id?: string;
  reason: string;
  status: 'open' | 'filled' | 'closed';
  created_at: string;
  original_user: User;
  stores: Store;
  time_slots?: TimeSlot;
  emergency_volunteers: EmergencyVolunteer[];
}

interface Shift {
  id: string;
  date: string;
  user_id: string;
  store_id: string;
  time_slot_id?: string;
  pattern_id?: string;
  custom_start_time?: string;
  custom_end_time?: string;
  status: 'draft' | 'confirmed' | 'completed';
  stores?: { id: string; name: string };
  time_slots?: TimeSlot;
  isFixedShift?: boolean;
}

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'staff';
  loginId: string;
  stores: string[];
}

export default function EmergencyPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([]);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [reason, setReason] = useState('');
  const [activeTab, setActiveTab] = useState<'browse' | 'create'>('browse');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingTo, setApplyingTo] = useState<string | null>(null);
  const [applicationNote, setApplicationNote] = useState<string>(''); // 応募メモ用state
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    const user = localStorage.getItem('currentUser');
    if (user) {
      const parsedUser = JSON.parse(user);
      setCurrentUser(parsedUser);
    }
  }, []);

  // URLパラメータから代打募集への応募チェック
  useEffect(() => {
    if (typeof window !== 'undefined' && emergencyRequests.length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const applyId = urlParams.get('apply');
      if (applyId && currentUser) {
        // 応募確認ダイアログを表示
        const targetRequest = emergencyRequests.find(req => req.id === applyId);
        if (targetRequest && targetRequest.original_user) {
          const confirmApply = window.confirm(`${targetRequest.original_user.name}さんの代打募集に応募しますか？`);
          if (confirmApply) {
            handleApplyEmergency(applyId);
          }
          // URLパラメータをクリア
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }
    }
  }, [emergencyRequests, currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      try {
        // 代打募集データを取得（企業フィルタリング付き）
        const emergencyResponse = await fetch(`/api/emergency-requests?current_user_id=${currentUser.id}`);
        if (emergencyResponse.ok) {
          const emergencyData = await emergencyResponse.json();
          // オープン状態で、自分が作成したもの以外の代打募集のみを表示
          const openRequests = emergencyData.data.filter((req: EmergencyRequest) => 
            req.status === 'open' && req.original_user_id !== currentUser.id
          );
          setEmergencyRequests(openRequests);
        }

        // スタッフの場合は確定済みシフトと固定シフトを取得
        if (currentUser.role === 'staff') {
          const today = new Date().toISOString().split('T')[0];
          
          // 確定済みシフトと固定シフトを並行して取得
          const [shiftsResponse, fixedShiftsResponse] = await Promise.all([
            fetch(`/api/shifts?user_id=${currentUser.id}&date_from=${today}&status=confirmed`),
            fetch(`/api/fixed-shifts?user_id=${currentUser.id}&current_user_id=${currentUser.id}`)
          ]);

          let allShifts: Shift[] = [];

          if (shiftsResponse.ok) {
            const shiftsData = await shiftsResponse.json();
            allShifts = [...(shiftsData.data || [])];
          }

          if (fixedShiftsResponse.ok) {
            const fixedShiftsData = await fixedShiftsResponse.json();
            console.log('🔍 固定シフトデータ取得:', {
              total: fixedShiftsData.data?.length || 0,
              data: fixedShiftsData.data
            });

            // 今日から1週間分の日付を生成
            const dates = [];
            for (let i = 0; i < 30; i++) {
              const date = new Date(today);
              date.setDate(date.getDate() + i);
              dates.push(date);
            }

            // 各日付に対応する固定シフトを生成
            const fixedShifts = dates.flatMap(date => {
              const dayOfWeek = date.getDay();
              const dateStr = date.toISOString().split('T')[0];

              return (fixedShiftsData.data || [])
                .filter((fs: any) => fs.is_active && fs.day_of_week === dayOfWeek)
                .map((fs: any) => ({
                  id: `fixed-${fs.id}-${dateStr}`,
                  date: dateStr,
                  user_id: fs.user_id,
                  store_id: fs.store_id,
                  time_slot_id: fs.time_slot_id,
                  status: 'confirmed',
                  stores: fs.stores,
                  time_slots: fs.time_slots,
                  isFixedShift: true
                }));
            });

            console.log('🔍 変換後の固定シフト:', {
              total: fixedShifts.length,
              shifts: fixedShifts
            });
            
            allShifts = [...allShifts, ...fixedShifts];
          }

          // 既に代打募集があるシフトを除外
          const allEmergencyResponse = await fetch(`/api/emergency-requests?current_user_id=${currentUser.id}`);
          if (allEmergencyResponse.ok) {
            const allEmergencyData = await allEmergencyResponse.json();
            const existingRequests = allEmergencyData.data.filter((req: EmergencyRequest) => 
              req.original_user_id === currentUser.id && req.status === 'open'
            );
            
            // 今日以降のシフトのみを抽出
            const today = new Date().toISOString().split('T')[0];
            const futureShifts = allShifts.filter((shift: Shift) => shift.date >= today);

            console.log('🔍 フィルタリング前のシフト:', {
              total: futureShifts.length,
              regular: futureShifts.filter(s => !s.isFixedShift).length,
              fixed: futureShifts.filter(s => s.isFixedShift).length
            });

            const filteredShifts = futureShifts.filter((shift: Shift) => {
              // 既に代打募集があるシフトを除外
              const hasExistingRequest = existingRequests.some((req: EmergencyRequest) => 
                req.date === shift.date && 
                req.store_id === shift.store_id &&
                req.time_slot_id === shift.time_slot_id
              );

              return !hasExistingRequest;
            });

            console.log('🔍 フィルタリング後のシフト:', {
              total: filteredShifts.length,
              regular: filteredShifts.filter(s => !s.isFixedShift).length,
              fixed: filteredShifts.filter(s => s.isFixedShift).length
            });
            
            setMyShifts(filteredShifts);
          } else {
            setMyShifts(allShifts);
          }
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
        setError('データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  // 代打応募処理
  const handleApplyEmergency = async (requestId: string) => {
    console.log('=== 代打応募開始 ===');
    console.log('Request ID:', requestId);
    console.log('Current User:', currentUser);
    console.log('Application Note:', applicationNote);

    if (!currentUser) {
      console.error('Current user not found');
      setError('ユーザー認証が必要です');
      return;
    }

    setApplyingTo(requestId);
    setError(null);

    try {
      console.log('応募API呼び出し:', {
        emergency_request_id: requestId,
        user_id: currentUser.id,
        notes: applicationNote.trim() || null
      });

      const response = await fetch('/api/emergency-volunteers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emergency_request_id: requestId,
          user_id: currentUser.id,
          notes: applicationNote.trim() || null
        }),
      });

      console.log('応募API レスポンス:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('応募APIエラー詳細:', errorData);
        throw new Error(errorData.error || `応募に失敗しました (${response.status})`);
      }

      const result = await response.json();
      console.log('応募成功:', result);

      alert('代打募集に応募しました。結果をお待ちください。');
      
      // フォームをリセット
      setApplicationNote('');
      
      // データを再取得
      window.location.reload();

    } catch (error) {
      console.error('=== 応募処理エラー ===');
      console.error('Error type:', typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      const errorMessage = error instanceof Error ? error.message : '応募に失敗しました';
      setError(errorMessage);
    } finally {
      setApplyingTo(null);
      console.log('=== 代打応募処理終了 ===');
    }
  };

  // 代打募集作成
  const handleCreateEmergencyRequest = async () => {
    if (!selectedShift || !reason.trim()) {
      setError('シフトと理由を選択してください');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch('/api/emergency-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          original_user_id: currentUser!.id,
          store_id: selectedShift.store_id,
          date: selectedShift.date,
          time_slot_id: selectedShift.time_slot_id,
          reason: reason.trim(),
          request_type: 'substitute', // 代打募集として設定
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '代打募集の作成に失敗しました');
      }

      // 成功時にリセットしてデータを再取得
      setSelectedShift(null);
      setReason('');
      setActiveTab('browse');
      
      // データを再取得
      const fetchData = async () => {
        const emergencyResponse = await fetch(`/api/emergency-requests?current_user_id=${currentUser!.id}`);
        if (emergencyResponse.ok) {
          const emergencyData = await emergencyResponse.json();
          const openRequests = emergencyData.data.filter((req: EmergencyRequest) => req.status === 'open');
          setEmergencyRequests(openRequests);
        }
      };
      fetchData();
      
    } catch (error) {
      console.error('代打募集作成エラー:', error);
      setError(error instanceof Error ? error.message : '代打募集の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 既に応募済みかチェック
  const isAlreadyApplied = (request: EmergencyRequest) => {
    return request.emergency_volunteers?.some(volunteer => 
      volunteer.user_id === currentUser?.id
    );
  };

  // 表示用の時間情報を取得
  const getDisplayTime = (shift: Shift) => {
    if (shift.custom_start_time && shift.custom_end_time) {
      return `${shift.custom_start_time} - ${shift.custom_end_time}`;
    }
    if (shift.time_slots) {
      return `${shift.time_slots.start_time} - ${shift.time_slots.end_time}`;
    }
    return '';
  };

  // 表示用の名前を取得
  const getDisplayName = (shift: Shift) => {
    return shift.time_slots?.name || 'シフト';
  };

  // 緊急度を計算
  const getUrgencyLevel = (date: string) => {
    const requestDate = new Date(date);
    const today = new Date();
    const diffDays = Math.ceil((requestDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 1) return 'urgent'; // 当日・翌日
    if (diffDays <= 3) return 'soon'; // 3日以内
    return 'normal'; // それ以降
  };

  // 緊急度に応じたスタイル
  const getUrgencyStyle = (urgency: string) => {
    switch (urgency) {
      case 'urgent':
        return 'border-red-300 bg-red-50';
      case 'soon':
        return 'border-yellow-300 bg-yellow-50';
      default:
        return 'border-gray-200 bg-white';
    }
  };

  // 緊急度ラベル
  const getUrgencyLabel = (urgency: string) => {
    switch (urgency) {
      case 'urgent':
        return { text: '緊急', color: 'bg-red-100 text-red-800' };
      case 'soon':
        return { text: '急募', color: 'bg-yellow-100 text-yellow-800' };
      default:
        return { text: '募集中', color: 'bg-blue-100 text-blue-800' };
    }
  };

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">読み込み中...</p>
          </div>
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
            <h1 className="text-3xl font-bold text-gray-900">🆘 代打募集</h1>
            <p className="text-gray-600 mt-2">
              {currentUser?.role === 'staff' 
                ? '代打を募集したり、募集中の代打に応募することができます'
                : '代打募集の管理と承認を行うことができます'
              }
            </p>
          </div>
          
          {/* タブ切り替え（ヘッダー右側に配置） */}
          {currentUser?.role === 'staff' && (
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('browse')}
                className={`px-4 py-2 font-medium rounded-md transition-all ${
                  activeTab === 'browse'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                募集中の代打
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`px-4 py-2 font-medium rounded-md transition-all ${
                  activeTab === 'create'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                代打を募集
              </button>
            </div>
          )}
        </div>

        {/* エラー表示 */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4">
              <p className="text-red-700">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* コンテンツ表示 */}
        {activeTab === 'browse' ? (
          // 募集中の代打一覧
          <div className="space-y-6">
            {/* 緊急度の説明 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">緊急度の目安</h3>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="text-sm text-gray-600">緊急</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                      <span className="text-sm text-gray-600">急募</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-sm text-gray-600">募集中</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 代打募集一覧 */}
            {emergencyRequests.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12 text-gray-500">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">代打募集がありません</h3>
                    <p>現在、代打を募集しているシフトはありません。</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {emergencyRequests.map((request) => {
                  const urgency = getUrgencyLevel(request.date);
                  const urgencyStyle = getUrgencyStyle(urgency);
                  const urgencyLabel = getUrgencyLabel(urgency);
                  const alreadyApplied = isAlreadyApplied(request);
                  
                  return (
                    <Card key={request.id} className={urgencyStyle}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <h3 className="text-lg font-semibold text-gray-900">
                                {new Date(request.date).toLocaleDateString('ja-JP', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  weekday: 'long'
                                })}
                              </h3>
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${urgencyLabel.color}`}>
                                {urgencyLabel.text}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                              <div>
                                <h4 className="font-medium text-gray-700 mb-1">シフト情報</h4>
                                <p className="text-gray-900">
                                  {request.time_slots?.name || 'シフト'}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {request.time_slots?.start_time} - {request.time_slots?.end_time}
                                </p>
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-700 mb-1">店舗</h4>
                                <p className="text-gray-900">{request.stores?.name}</p>
                              </div>
                            </div>

                            <div className="mb-4">
                              <h4 className="font-medium text-gray-700 mb-1">元のスタッフ</h4>
                              <p className="text-gray-900">{request.original_user?.name}</p>
                            </div>

                            <div className="mb-4">
                              <h4 className="font-medium text-gray-700 mb-1">理由</h4>
                              <p className="text-gray-600">{request.reason}</p>
                            </div>

                            {request.emergency_volunteers && request.emergency_volunteers.length > 0 && (
                              <div className="mb-4">
                                <h4 className="font-medium text-gray-700 mb-2">応募者（{request.emergency_volunteers.length}名）</h4>
                                <div className="flex flex-wrap gap-2">
                                  {request.emergency_volunteers.map((volunteer) => (
                                    <span 
                                      key={volunteer.id}
                                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                                    >
                                      {volunteer.users.name}
                                      {volunteer.user_id === currentUser?.id && (
                                        <span className="ml-1 text-blue-600">（あなた）</span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="ml-6">
                            {alreadyApplied ? (
                              <div className="text-center">
                                <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-medium">
                                  応募済み
                                </div>
                                <p className="text-xs text-gray-500 mt-1">結果をお待ちください</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {/* 応募メモ入力欄 */}
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    応募メモ（任意）
                                  </label>
                                  <textarea
                                    value={applicationNote}
                                    onChange={(e) => setApplicationNote(e.target.value)}
                                    placeholder="店長への要望やメッセージがあれば入力してください"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                    rows={2}
                                    maxLength={200}
                                  />
                                  <p className="text-xs text-gray-500 mt-1">
                                    {applicationNote.length}/200文字
                                  </p>
                                </div>
                                
                                <Button 
                                  onClick={() => handleApplyEmergency(request.id)}
                                  disabled={applyingTo === request.id}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 w-full"
                                >
                                  {applyingTo === request.id ? (
                                    <div className="flex items-center justify-center">
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      応募中...
                                    </div>
                                  ) : (
                                    '応募する'
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* 注意事項 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">応募に関する注意事項</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• 代打募集への応募は取り消すことができません</li>
                  <li>• 複数の応募者がいる場合、店長が最終的な選考を行います</li>
                  <li>• 応募結果は個別にお知らせいたします</li>
                  <li>• 応募前に該当日に他のシフトがないことを確認してください</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        ) : (
          // 代打募集作成フォーム（スタッフのみ）
          <div className="space-y-6">
            {/* シフト選択 */}
            <Card>
              <CardHeader>
                <CardTitle>シフト選択</CardTitle>
                <p className="text-sm text-gray-600">代打を募集したいシフトを選択してください</p>
              </CardHeader>
              <CardContent>
                {myShifts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>確定済みのシフトがありません</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...myShifts]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((shift) => (
                      <div
                        key={shift.id}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                          selectedShift?.id === shift.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedShift(shift)}
                      >
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <h3 className="font-medium text-gray-900">
                              {new Date(shift.date).toLocaleDateString('ja-JP', {
                                month: 'short',
                                day: 'numeric',
                                weekday: 'short'
                              })}
                            </h3>
                            <div className="flex gap-2">
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                確定済み
                              </span>
                              {shift.isFixedShift && (
                                <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                                  固定シフト
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-sm text-gray-600">
                            <p>{getDisplayName(shift)}</p>
                            <p>{getDisplayTime(shift)}</p>
                            <p>{shift.stores?.name}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 理由入力 */}
            {selectedShift && (
              <Card>
                <CardHeader>
                  <CardTitle>代打募集の理由</CardTitle>
                  <p className="text-sm text-gray-600">代打が必要な理由を入力してください</p>
                </CardHeader>
                <CardContent>
                  <textarea
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="例：急な用事のため、体調不良のため など"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                  />
                </CardContent>
              </Card>
            )}

            {/* アクションボタン */}
            {selectedShift && (
              <div className="flex space-x-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedShift(null);
                    setReason('');
                    setActiveTab('browse');
                  }}
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateEmergencyRequest}
                  disabled={!selectedShift || !reason.trim() || submitting}
                  className="flex-1"
                >
                  {submitting ? '作成中...' : '代打募集を作成'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 応募モーダル */}
      {showApplyModal && selectedRequestId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">代打募集に応募</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                要望・メッセージ（任意）
              </label>
              <textarea
                rows={3}
                value={applicationNote}
                onChange={(e) => setApplicationNote(e.target.value)}
                placeholder="例：〇時から〇時まで可能、交通費について、その他ご要望など"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                maxLength={200}
              />
              <p className="text-xs text-gray-500 mt-1">
                {applicationNote.length}/200文字
              </p>
            </div>

            <div className="flex space-x-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowApplyModal(false);
                  setSelectedRequestId(null);
                  setApplicationNote('');
                }}
                className="flex-1"
              >
                キャンセル
              </Button>
              <Button
                onClick={() => {
                  setShowApplyModal(false);
                  if (selectedRequestId) {
                    handleApplyEmergency(selectedRequestId);
                  }
                }}
                disabled={applyingTo !== null}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {applyingTo ? '応募中...' : '応募する'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AuthenticatedLayout>
  );
} 