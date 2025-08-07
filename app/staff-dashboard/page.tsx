'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { DatabaseUser, DatabaseEmergencyRequest, TimeSlot, DatabaseShiftRequest } from '@/lib/types';
import { getSubmissionPeriods } from '@/lib/utils';

// 型定義
interface User {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'staff';
  loginId: string;
  stores: string[];
}

interface Shift {
  id: string;
  date: string;
  user_id: string;
  store_id: string;
  pattern_id: string;
  status: 'draft' | 'confirmed' | 'completed';
  users?: { name: string };
  stores?: { name: string };
  shift_patterns?: {
    name: string;
    start_time: string;
    end_time: string;
    color: string;
  };
}

interface TimeOffRequest {
  id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface EmergencyRequest {
  id: string;
  date: string;
  reason: string;
  status: 'open' | 'closed';
  stores?: { name: string };
  shift_patterns?: {
    name: string;
    start_time: string;
    end_time: string;
  };
  time_slots?: {
    name: string;
    start_time: string;
    end_time: string;
  };
  emergency_volunteers?: {
    user_id: string;
    responded_at: string;
  }[];
  original_user_id?: string; // 自分が作成した代打募集の場合に設定
}

export default function StaffDashboardPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [todayShift, setTodayShift] = useState<Shift | null>(null);
  const [weeklyShifts, setWeeklyShifts] = useState<Shift[]>([]);
  const [myShiftRequests, setMyShiftRequests] = useState<DatabaseShiftRequest[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // 認証チェックとユーザー情報取得
  useEffect(() => {
    const userInfo = localStorage.getItem('currentUser');
    if (!userInfo) {
      router.push('/login');
      return;
    }

    try {
      const user = JSON.parse(userInfo);
      if (user.role !== 'staff') {
        router.push('/dashboard'); // 店長は管理者ダッシュボードへ
        return;
      }
      setCurrentUser(user);
    } catch (error) {
      console.error('ユーザー情報の解析に失敗:', error);
      router.push('/login');
    }
  }, [router]);

  // データ取得
  useEffect(() => {
    if (!currentUser) return;

    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const today = new Date().toISOString().split('T')[0];

        // 今日のシフトを取得
        const todayShiftResponse = await fetch(`/api/shifts?user_id=${currentUser.id}&date_from=${today}&date_to=${today}`);
        if (todayShiftResponse.ok) {
          const todayResult = await todayShiftResponse.json();
          setTodayShift(todayResult.data?.[0] || null);
        }

        // 今週のシフトを取得
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const weeklyShiftResponse = await fetch(
          `/api/shifts?user_id=${currentUser.id}&date_from=${startOfWeek.toISOString().split('T')[0]}&date_to=${endOfWeek.toISOString().split('T')[0]}`
        );
        if (weeklyShiftResponse.ok) {
          const weeklyResult = await weeklyShiftResponse.json();
          setWeeklyShifts(weeklyResult.data || []);
        }

        // シフト希望提出履歴を取得
        const shiftRequestsResponse = await fetch(`/api/shift-requests?user_id=${currentUser.id}`);
        if (shiftRequestsResponse.ok) {
          const shiftRequestsResult = await shiftRequestsResponse.json();
          setMyShiftRequests(shiftRequestsResult.data || []);
        }

        // 代打募集を取得（自分が作成したもの以外）
        const emergencyResponse = await fetch('/api/emergency-requests?status=open');
        if (emergencyResponse.ok) {
          const emergencyResult = await emergencyResponse.json();
          // 自分が作成した代打募集を除外
          const filteredEmergencyRequests = (emergencyResult.data || []).filter((req: EmergencyRequest) => 
            req.original_user_id !== currentUser.id
          );
          setEmergencyRequests(filteredEmergencyRequests);
        }

      } catch (error) {
        setError(error instanceof Error ? error.message : 'データの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [currentUser]);

  // 週間勤務時間を計算
  const calculateWeeklyHours = () => {
    return weeklyShifts.reduce((total, shift) => {
      if (!shift.shift_patterns) return total;
        const start = new Date(`2000-01-01T${shift.shift_patterns.start_time}`);
        const end = new Date(`2000-01-01T${shift.shift_patterns.end_time}`);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return total + hours;
    }, 0);
  };

  // 既に応募済みかチェック
  const isAlreadyApplied = (request: EmergencyRequest) => {
    return request.emergency_volunteers?.some(volunteer => 
      volunteer.user_id === currentUser?.id
    );
  };

  // 同じ日にシフトがあるかチェック
  const hasShiftOnDate = (date: string) => {
    return weeklyShifts.some(shift => shift.date === date);
  };

  // 緊急度を判定
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
        return { text: '緊急', color: 'text-red-600 bg-red-100' };
      case 'soon':
        return { text: '急募', color: 'text-yellow-600 bg-yellow-100' };
      default:
        return { text: '募集中', color: 'text-blue-600 bg-blue-100' };
    }
  };

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (error) {
    return (
      <AuthenticatedLayout>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-700">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-700">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="ml-auto text-red-400 hover:text-red-600 p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ページヘッダー - モバイル最適化 */}
        <div className="px-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">スタッフダッシュボード</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">こんにちは、{currentUser?.name}さん</p>
        </div>

        {/* 今日のシフト - モバイル最適化 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-lg sm:text-xl">
              <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              今日のシフト
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayShift ? (
              <div className="flex items-center justify-between p-3 sm:p-4 bg-blue-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: todayShift.shift_patterns?.color || '#6B7280' }}
                    ></div>
                    <span className="font-medium text-gray-900 text-sm sm:text-base">
                      {todayShift.shift_patterns?.name || 'シフト'}
                    </span>
                  </div>
                  <div className="text-sm sm:text-base text-gray-600 mb-1">
                    {todayShift.shift_patterns?.start_time} - {todayShift.shift_patterns?.end_time}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500">
                    {todayShift.stores?.name}
                  </div>
                </div>
                <div className="text-right ml-3">
                  <div className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                    todayShift.status === 'confirmed' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {todayShift.status === 'confirmed' ? '確定' : '未確定'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 sm:py-8 text-gray-500">
                <svg className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm sm:text-base">今日はお休みです</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 統計カード - モバイル最適化 */}
        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          <Card>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6 pb-4 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-blue-600">
                {calculateWeeklyHours().toFixed(1)}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">今週の勤務時間</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6 pb-4 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-green-600">
                {myShiftRequests.filter(r => r.status === 'converted_to_shift').length}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">シフト作成済み</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6 pb-4 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-orange-600">
                {emergencyRequests.length}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">代打募集中</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          {/* シフト希望提出状況 - モバイル最適化 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg sm:text-xl">シフト希望提出状況</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/shift-request')}
                  className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-auto"
                >
                  新規提出
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {myShiftRequests.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-gray-500">
                  <p className="text-sm sm:text-base">提出履歴がありません</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myShiftRequests.slice(0, 3).map((request) => (
                    <div key={request.id} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm sm:text-base">
                            {new Date(request.date).toLocaleDateString('ja-JP')} 
                            {request.time_slots?.name && ` - ${request.time_slots.name}`}
                          </p>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">
                            優先度: {request.priority === 1 ? '最優先' : request.priority === 2 ? '希望' : '可能'}
                          </p>
                          {request.notes && (
                            <p className="text-xs sm:text-sm text-gray-500 mt-1 break-words">
                              {request.notes}
                            </p>
                          )}
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ml-2 flex-shrink-0 ${
                          request.status === 'converted_to_shift' 
                            ? 'bg-green-100 text-green-800'
                            : request.status === 'submitted'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {request.status === 'converted_to_shift' ? 'シフト作成済' : 
                           request.status === 'submitted' ? '提出済' : '下書き'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 代打募集 - モバイル最適化 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg sm:text-xl">代打募集</CardTitle>
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => router.push('/emergency')}
                  className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-auto"
                >
                  代打募集
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {emergencyRequests.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-gray-500">
                  <p className="text-sm sm:text-base">現在、代打募集はありません</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {emergencyRequests.slice(0, 3).map((request) => {
                    const urgency = getUrgencyLevel(request.date);
                    const urgencyStyle = getUrgencyStyle(urgency);
                    const urgencyLabel = getUrgencyLabel(urgency);
                    const alreadyApplied = isAlreadyApplied(request);
                    
                    return (
                      <div key={request.id} className={`border rounded-lg p-3 sm:p-4 ${urgencyStyle}`}>
                        <div className="space-y-2">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 text-sm sm:text-base">
                                {new Date(request.date).toLocaleDateString('ja-JP', {
                                  month: 'short',
                                  day: 'numeric',
                                  weekday: 'short'
                                })}
                              </p>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${urgencyLabel.color} flex-shrink-0`}>
                                {urgencyLabel.text}
                              </span>
                            </div>
                            <div className="ml-2 flex-shrink-0">
                            {alreadyApplied ? (
                              <div className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                                応募済み
                              </div>
                              ) : hasShiftOnDate(request.date) ? (
                                <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                  シフト有り
                                </div>
                            ) : (
                              <Button 
                                size="sm" 
                                onClick={() => router.push(`/emergency?apply=${request.id}`)}
                                className="text-xs px-3 py-1 h-auto min-h-[32px] min-w-[60px]"
                              >
                                参加
                              </Button>
                            )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs sm:text-sm text-gray-600">
                              {request.time_slots 
                                ? `${request.time_slots.name} (${request.time_slots.start_time} - ${request.time_slots.end_time})`
                                : request.shift_patterns 
                                  ? `${request.shift_patterns.name} (${request.shift_patterns.start_time} - ${request.shift_patterns.end_time})`
                                  : '時間未設定'
                              }
                            </p>
                            <p className="text-xs sm:text-sm text-gray-500">
                              {request.stores?.name}
                            </p>
                            <p className="text-xs text-gray-400 break-words">
                              理由: {request.reason}
                            </p>
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
      </div>
    </AuthenticatedLayout>
  );
} 