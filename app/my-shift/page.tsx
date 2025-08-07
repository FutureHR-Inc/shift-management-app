'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

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
  pattern_id?: string;
  time_slot_id?: string;
  custom_start_time?: string;
  custom_end_time?: string;
  status: 'draft' | 'confirmed' | 'completed';
  stores?: { id: string; name: string };
  shift_patterns?: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    color: string;
    break_time?: number;
  };
  time_slots?: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
  };
}

export default function MyShiftPage() {
  const [selectedWeek, setSelectedWeek] = useState(() => {
    // 今週の月曜日を取得
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    return monday.toISOString().split('T')[0];
  });
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
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
      setCurrentUser(user);
    } catch (error) {
      console.error('ユーザー情報の解析に失敗:', error);
      router.push('/login');
    }
  }, [router]);

  // シフトデータ取得
  useEffect(() => {
    if (!currentUser) return;

    const fetchMyShifts = async () => {
      try {
        setLoading(true);
        setError(null);

        // 選択された週の日付範囲を計算
        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const response = await fetch(
          `/api/shifts?user_id=${currentUser.id}&date_from=${selectedWeek}&date_to=${weekEnd.toISOString().split('T')[0]}`
        );

        if (!response.ok) {
          throw new Error('シフトデータの取得に失敗しました');
        }

        const result = await response.json();
        setMyShifts(result.data || []);

      } catch (error) {
        console.error('シフトデータ取得エラー:', error);
        setError(error instanceof Error ? error.message : 'データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchMyShifts();
  }, [currentUser, selectedWeek]);

  // 週の日付を生成
  const getWeekDates = (startDate: string) => {
    const start = new Date(startDate);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getWeekDates(selectedWeek);

  // 特定の日のシフトを取得
  const getShiftForDate = (date: string) => {
    return myShifts.find(shift => shift.date === date);
  };

  // 今週の総勤務時間を計算
  const calculateWeeklyHours = () => {
    let totalHours = 0;
    weekDates.forEach(date => {
      const dateString = date.toISOString().split('T')[0];
      const shift = getShiftForDate(dateString);
      if (shift) {
        let startTime, endTime, breakMinutes = 30; // デフォルト休憩時間

        // カスタム時間が設定されている場合
        if (shift.custom_start_time && shift.custom_end_time) {
          startTime = shift.custom_start_time;
          endTime = shift.custom_end_time;
        }
        // shift_patternsがある場合
        else if (shift.shift_patterns) {
          startTime = shift.shift_patterns.start_time;
          endTime = shift.shift_patterns.end_time;
          breakMinutes = shift.shift_patterns.break_time || 30;
        }
        // time_slotsがある場合
        else if (shift.time_slots) {
          startTime = shift.time_slots.start_time;
          endTime = shift.time_slots.end_time;
        }

        if (startTime && endTime) {
          const start = new Date(`2000-01-01T${startTime}`);
          const end = new Date(`2000-01-01T${endTime}`);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          const breakHours = breakMinutes / 60; // 分を時間に変換
        totalHours += Math.max(0, hours - breakHours);
        }
      }
    });
    return totalHours;
  };

  const weeklyHours = calculateWeeklyHours();

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
          <p className="text-red-700">{error}</p>
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
            <h1 className="text-3xl font-bold text-gray-900">マイシフト</h1>
            <p className="text-gray-600 mt-2">あなたの勤務スケジュールを確認できます</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => router.push('/request-off')}>
              希望休申請
            </Button>
            <Button variant="secondary">PDF出力</Button>
          </div>
        </div>

        {/* 週選択 */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  週選択（月曜日開始）
                </label>
                <input
                  type="date"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-4 text-center">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{weeklyHours.toFixed(1)}</div>
                  <div className="text-sm text-blue-700">今週の勤務時間</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{myShifts.length}</div>
                  <div className="text-sm text-green-700">今週の勤務日数</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 週間スケジュール */}
        <Card>
          <CardHeader>
            <CardTitle>週間スケジュール</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
              {weekDates.map((date, index) => {
                const dateString = date.toISOString().split('T')[0];
                const shift = getShiftForDate(dateString);
                const pattern = shift?.shift_patterns;
                const timeSlot = shift?.time_slots;
                const store = shift?.stores;
                const isToday = dateString === new Date().toISOString().split('T')[0];

                // 表示用の時間情報を取得
                const getDisplayTime = () => {
                  if (shift?.custom_start_time && shift?.custom_end_time) {
                    return `${shift.custom_start_time} - ${shift.custom_end_time}`;
                  }
                  if (pattern) {
                    return `${pattern.start_time} - ${pattern.end_time}`;
                  }
                  if (timeSlot) {
                    return `${timeSlot.start_time} - ${timeSlot.end_time}`;
                  }
                  return '';
                };

                // 表示用の名前を取得
                const getDisplayName = () => {
                  return pattern?.name || timeSlot?.name || 'シフト';
                };

                // 表示用の色を取得
                const getDisplayColor = () => {
                  return pattern?.color || '#3B82F6'; // デフォルトは青色
                };

                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      isToday 
                        ? 'border-blue-500 bg-blue-50' 
                        : shift
                        ? 'border-gray-200 bg-white hover:shadow-md'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    {/* 日付 */}
                    <div className="text-center mb-3">
                      <div className={`text-lg font-bold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                        {date.getDate()}
                      </div>
                      <div className={`text-sm ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                        {date.toLocaleDateString('ja-JP', { weekday: 'short' })}
                      </div>
                    </div>

                    {/* シフト情報 */}
                    {shift && (pattern || timeSlot) && store ? (
                      <div className="space-y-2">
                        <div
                          className={`px-3 py-2 rounded-lg text-white text-center font-medium relative ${
                            shift.status === 'confirmed' ? 'ring-2 ring-yellow-400' : ''
                          }`}
                          style={{ backgroundColor: getDisplayColor() }}
                        >
                          {getDisplayName()}
                          {shift.status === 'confirmed' && (
                            <span className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-900 text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              ✓
                            </span>
                          )}
                        </div>
                        <div className="text-center text-sm text-gray-600">
                          {getDisplayTime()}
                        </div>
                        <div className="text-center text-xs text-gray-500">
                          {store.name}
                        </div>
                        <div className="text-center">
                          {shift.status === 'confirmed' ? (
                            <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                              確定済み
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                              未確定
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-400 text-sm">
                        休み
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 今日のシフト詳細（今日の場合のみ） */}
        {(() => {
          const today = new Date().toISOString().split('T')[0];
          const todayShift = getShiftForDate(today);
          
          if (!todayShift) return null;
          
          return (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  今日のシフト詳細
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">勤務時間</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {todayShift.shift_patterns?.start_time} - {todayShift.shift_patterns?.end_time}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">勤務先</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {todayShift.stores?.name}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">シフト</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {todayShift.shift_patterns?.name}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </AuthenticatedLayout>
  );
} 