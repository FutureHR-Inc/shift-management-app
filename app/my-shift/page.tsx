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
    // 日本時間で今日の日付を取得
    const now = new Date();
    const japanDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const todayStr = japanDateFormatter.format(now);
    const [year, month, day] = todayStr.split('-').map(Number);
    const today = new Date(year, month - 1, day);
    
    // 選択した日から7日間を表示するため、今日の日付を初期値とする
    return todayStr;
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

  // シフト更新イベントの監視（固定シフト更新、シフト削除、固定シフト例外作成）
  useEffect(() => {
    const handleShiftUpdate = (event: CustomEvent | StorageEvent) => {
      console.log('シフト更新を検知:', event);
      // 現在のユーザーのシフトデータを再取得
      if (currentUser) {
        fetchMyShifts();
      }
    };

    // 同一タブ内のイベント監視
    window.addEventListener('fixedShiftUpdated', handleShiftUpdate as EventListener);
    window.addEventListener('shiftUpdated', handleShiftUpdate as EventListener);
    
    // 別タブからのストレージイベント監視
    window.addEventListener('storage', (event) => {
      if (event.key === 'fixedShiftUpdate' || event.key === 'shiftUpdate') {
        handleShiftUpdate(event);
      }
    });

    return () => {
      window.removeEventListener('fixedShiftUpdated', handleShiftUpdate as EventListener);
      window.removeEventListener('shiftUpdated', handleShiftUpdate as EventListener);
      window.removeEventListener('storage', handleShiftUpdate);
    };
  }, [currentUser]);

  // シフトデータ取得（通常シフト + 固定シフト統合）
  useEffect(() => {
    if (!currentUser) return;
    fetchMyShifts();
  }, [currentUser, selectedWeek]);

  const fetchMyShifts = async () => {
    try {
      setLoading(true);
      setError(null);

      // 固定シフト用の無制限期間を設定（過去1年〜未来1年）
      const selectedDate = new Date(selectedWeek);
      const unlimitedStart = new Date(selectedDate);
      unlimitedStart.setFullYear(selectedDate.getFullYear() - 1); // 1年前
      const unlimitedEnd = new Date(selectedDate);
      unlimitedEnd.setFullYear(selectedDate.getFullYear() + 1); // 1年後
      
      // 通常シフト取得は選択日から7日間
      // 日本時間で日付を処理
      const [year, month, day] = selectedWeek.split('-').map(Number);
      const selectedWeekStart = new Date(year, month - 1, day);
      const selectedWeekEnd = new Date(selectedWeekStart);
      selectedWeekEnd.setDate(selectedWeekStart.getDate() + 6);
      
      // 日本時間で日付文字列を取得
      const japanDateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const weekStartString = japanDateFormatter.format(selectedWeekStart);
      const weekEndString = japanDateFormatter.format(selectedWeekEnd);

      // 通常シフトと固定シフト、固定シフト例外を並行取得（通常シフトは選択週のみ）
      const fixedShiftsUrl = `/api/fixed-shifts?user_id=${currentUser?.id}&is_active=true`;
      console.log('🔍 [MyShift] API呼び出し URL:', fixedShiftsUrl);
      
      const [shiftsResponse, fixedShiftsResponse, exceptionsResponse] = await Promise.all([
        fetch(`/api/shifts?user_id=${currentUser?.id}&date_from=${weekStartString}&date_to=${weekEndString}`),
        fetch(fixedShiftsUrl),
        fetch(`/api/fixed-shift-exceptions?date_from=${weekStartString}&date_to=${weekEndString}`)
      ]);
      
      console.log('🔍 [MyShift] API レスポンス:');
      console.log('  - 固定シフトAPI成功:', fixedShiftsResponse.ok);
      console.log('  - ステータス:', fixedShiftsResponse.status);
      if (!fixedShiftsResponse.ok) {
        const errorText = await fixedShiftsResponse.text();
        console.log('  - エラー内容:', errorText);
      }

      if (!shiftsResponse.ok) {
        throw new Error('シフトデータの取得に失敗しました');
      }

      const shiftsResult = await shiftsResponse.json();
      const normalShifts = shiftsResult.data || [];

      // 固定シフト例外を取得
      let fixedShiftExceptions: Array<{ fixed_shift_id: string; date: string }> = [];
      if (exceptionsResponse.ok) {
        const exceptionsResult = await exceptionsResponse.json();
        fixedShiftExceptions = (exceptionsResult.data || []).map((ex: any) => ({
          fixed_shift_id: ex.fixed_shift_id,
          date: ex.date
        }));
        console.log('🔍 [MyShift] 固定シフト例外:');
        console.log('  - 取得した例外数:', fixedShiftExceptions.length);
        console.log('  - 例外データ:', fixedShiftExceptions);
      }

      // 固定シフトから選択週のシフトを生成（制限なし・恒常表示、例外を考慮）
      const generatedShifts = [];
      if (fixedShiftsResponse.ok) {
        const fixedShiftsResult = await fixedShiftsResponse.json();
        const fixedShifts = fixedShiftsResult.data || [];

        console.log('🔍 [MyShift] 固定シフト調査:');
        console.log('  - 取得した固定シフト数:', fixedShifts.length);
        console.log('  - 固定シフトデータ:', fixedShifts);
        console.log('  - 選択週:', selectedWeek);

        // 選択週の各日を確認（7日間）
        for (let i = 0; i < 7; i++) {
          const currentDate = new Date(selectedWeekStart);
          currentDate.setDate(selectedWeekStart.getDate() + i);
          // 日本時間で日付文字列を取得
          const dateString = japanDateFormatter.format(currentDate);
          const dayOfWeek = currentDate.getDay();

          console.log(`  - 日付: ${dateString} (${dayOfWeek}曜日)`);
          
          // この曜日の固定シフトがあるかチェック
          const dayFixedShifts = fixedShifts.filter((fs: any) => fs.day_of_week === dayOfWeek);
          console.log(`    → この曜日の固定シフト: ${dayFixedShifts.length}件`);
          
          dayFixedShifts.forEach((fs: any) => {
            console.log(`      - ユーザー: ${fs.users?.name}, 時間帯: ${fs.time_slots?.name}, アクティブ: ${fs.is_active}`);
          });

          // その日に通常シフトが既にあるかチェック
          const hasNormalShift = normalShifts.some((shift: Shift) => shift.date === dateString);
          console.log(`    → 通常シフトあり: ${hasNormalShift}`);

          if (!hasNormalShift) {
            // その曜日の固定シフトがあるかチェック（制限なし・恒常的に表示）
            const dayFixedShift = fixedShifts.find((fs: any) => fs.day_of_week === dayOfWeek);
            
            if (dayFixedShift) {
              // 固定シフト例外をチェック（この日付で例外が設定されている固定シフトを除外）
              const hasException = fixedShiftExceptions.some(
                ex => ex.fixed_shift_id === dayFixedShift.id && ex.date === dateString
              );
              
              if (hasException) {
                console.log(`    ❌ 固定シフト例外により非表示: ${dayFixedShift.users?.name} - ${dayFixedShift.time_slots?.name}`);
              } else {
                console.log(`    ✅ 固定シフト生成: ${dayFixedShift.users?.name} - ${dayFixedShift.time_slots?.name}`);
                // 固定シフトから仮想シフトオブジェクトを作成
                generatedShifts.push({
                  id: `fixed-${dayFixedShift.id}-${dateString}`, // 仮想ID
                  date: dateString,
                  user_id: currentUser?.id || '',
                  store_id: dayFixedShift.store_id,
                  time_slot_id: dayFixedShift.time_slot_id,
                  status: 'confirmed', // 固定シフトは確定扱い
                  stores: dayFixedShift.stores,
                  time_slots: dayFixedShift.time_slots,
                  notes: '固定シフト（恒常表示）'
                } as Shift);
              }
            } else {
              console.log(`    ❌ この曜日に固定シフトなし`);
            }
          }
        }
      }

      // 通常シフトと固定シフトをマージ（既に選択週でフィルタ済み）
      console.log('🔍 [MyShift] 最終結果:');
      console.log('  - 通常シフト数:', normalShifts.length);
      console.log('  - 生成された固定シフト数:', generatedShifts.length);
      console.log('  - 合計表示シフト数:', normalShifts.length + generatedShifts.length);
      console.log('  - 生成された固定シフト:', generatedShifts);
      
      setMyShifts([...normalShifts, ...generatedShifts]);

      } catch (error) {
        console.error('シフトデータ取得エラー:', error);
        setError(error instanceof Error ? error.message : 'データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

  // 週の日付を生成（選択した日から7日間）
  const getWeekDates = (startDate: string) => {
    // 日本時間で日付を処理
    const [year, month, day] = startDate.split('-').map(Number);
    const start = new Date(year, month - 1, day);
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

  // 選択した日から7日間の総勤務時間を計算（時間単位）
  const calculateWeeklyHours = () => {
    let totalHours = 0;
    
    // 日本時間で日付を取得するフォーマッター
    const japanDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    weekDates.forEach(date => {
      // 日本時間で日付文字列を取得
      const dateString = japanDateFormatter.format(date);
      const shift = getShiftForDate(dateString);
      
      if (shift) {
        let startTime, endTime;

        // カスタム時間が設定されている場合
        if (shift.custom_start_time && shift.custom_end_time) {
          startTime = shift.custom_start_time;
          endTime = shift.custom_end_time;
        }
        // shift_patternsがある場合
        else if (shift.shift_patterns) {
          startTime = shift.shift_patterns.start_time;
          endTime = shift.shift_patterns.end_time;
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
          // 休憩時間は差し引かず、そのまま加算
          totalHours += hours;
        }
      }
    });
    return totalHours;
  };

  const weeklyHours = calculateWeeklyHours();

  // マイシフトのPDF出力（ブラウザの印刷機能を利用）
  const handlePrintMyShiftPdf = () => {
    if (typeof window === 'undefined') return;
    window.print();
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
            <Button variant="secondary" onClick={handlePrintMyShiftPdf}>
              PDF出力
            </Button>
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
            <CardTitle className="flex items-center justify-between">
              週間スケジュール
              <div className="flex items-center gap-2 text-sm font-normal">
                <span className="inline-block w-3 h-3 bg-purple-500 rounded-full"></span>
                <span className="text-gray-600">固定シフト</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
              {weekDates.map((date, index) => {
                // 日本時間で日付文字列を取得
                const japanDateFormatter = new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'Asia/Tokyo',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit'
                });
                const dateString = japanDateFormatter.format(date);
                const shift = getShiftForDate(dateString);
                const pattern = shift?.shift_patterns;
                const timeSlot = shift?.time_slots;
                const store = shift?.stores;
                
                // 日本時間で今日の日付を取得
                const now = new Date();
                const today = japanDateFormatter.format(now);
                const isToday = dateString === today;

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
                          } ${
                            shift.id.startsWith('fixed-') ? 'border-2 border-dashed border-white/50' : ''
                          }`}
                          style={{ backgroundColor: getDisplayColor() }}
                        >
                          {getDisplayName()}
                          {shift.status === 'confirmed' && (
                            <span className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-900 text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              ✓
                            </span>
                          )}
                          {shift.id.startsWith('fixed-') && (
                            <span className="absolute -top-1 -left-1 bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              固
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
                          {shift.id.startsWith('fixed-') ? (
                            <span className="inline-block px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                              固定シフト
                            </span>
                          ) : shift.status === 'confirmed' ? (
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
          // 日本時間で今日の日付を取得
          const now = new Date();
          const japanDateFormatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          const today = japanDateFormatter.format(now);
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
                        {todayShift.custom_start_time && todayShift.custom_end_time
                          ? `${todayShift.custom_start_time} - ${todayShift.custom_end_time}`
                          : todayShift.time_slots
                            ? `${todayShift.time_slots.start_time} - ${todayShift.time_slots.end_time}`
                            : todayShift.shift_patterns
                              ? `${todayShift.shift_patterns.start_time} - ${todayShift.shift_patterns.end_time}`
                              : '時間未設定'
                        }
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">勤務先</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {todayShift.stores?.name || '店舗未設定'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">シフト</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {todayShift.time_slots?.name || todayShift.shift_patterns?.name || 'シフト未設定'}
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