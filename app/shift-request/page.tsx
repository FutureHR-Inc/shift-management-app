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
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Data states
  const [periods, setPeriods] = useState<SubmissionPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<SubmissionPeriod | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [dates, setDates] = useState<DateData[]>([]);
  const [userStores, setUserStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [existingRequests, setExistingRequests] = useState<DatabaseShiftRequest[]>([]);
  const [fixedShifts, setFixedShifts] = useState<any[]>([]);
  const [confirmedShifts, setConfirmedShifts] = useState<any[]>([]); // 確定済みシフト

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

      // 🔧 企業分離対応: ユーザーの所属店舗を取得
      try {
        const userResponse = await fetch(`/api/users?id=${user.id}&current_user_id=${user.id}`);
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

      // 固定シフトを取得
      try {
        const fixedShiftsResponse = await fetch(
          `/api/fixed-shifts?user_id=${user.id}&store_id=${selectedStore}&is_active=true`
        );
        if (!fixedShiftsResponse.ok) {
          throw new Error('固定シフトの取得に失敗しました');
        }
        const fixedShiftsResult = await fixedShiftsResponse.json();
        setFixedShifts(fixedShiftsResult.data || []);
      } catch (fetchError) {
        console.error('Fixed shifts fetch error:', fetchError);
        // 固定シフトの取得エラーは致命的ではないので、警告のみ表示
        console.warn('固定シフトデータの取得に失敗しました');
        setFixedShifts([]);
      }

      // 確定済みシフトを取得（選択期間の日付範囲で取得）
      try {
        const shiftsResponse = await fetch(
          `/api/shifts?user_id=${user.id}&store_id=${selectedStore}&date_from=${selectedPeriod.startDate}&date_to=${selectedPeriod.endDate}&current_user_id=${user.id}`
        );
        if (!shiftsResponse.ok) {
          throw new Error('確定済みシフトの取得に失敗しました');
        }
        const shiftsResult = await shiftsResponse.json();
        const shiftsData = shiftsResult.data || [];
        
        console.log('🔍 [SHIFT REQUEST] 確定済みシフトデータ取得:', {
          total: shiftsData.length,
          data: shiftsData.map((shift: any) => ({
            date: shift.date,
            status: shift.status
          }))
        });
        
        setConfirmedShifts(shiftsData);
      } catch (fetchError) {
        console.error('Confirmed shifts fetch error:', fetchError);
        // 確定済みシフトの取得エラーは致命的ではないので、警告のみ表示
        console.warn('確定済みシフトデータの取得に失敗しました');
        setConfirmedShifts([]);
      }

      // 🔧 企業分離対応: 既存の提出データを取得
      // 重要: submission_periodでフィルタリングせず、全ての期間の提出済みデータを取得して重複チェックに使用
      try {
        const existingResponse = await fetch(
          `/api/shift-requests?user_id=${user.id}&store_id=${selectedStore}&current_user_id=${user.id}`
        );
        if (!existingResponse.ok) {
          throw new Error('既存データの取得に失敗しました');
        }
        const existingResult = await existingResponse.json();
        const existingData = existingResult.data || [];
        
        console.log('🔍 [SHIFT REQUEST] 既存のシフト希望データ取得:', {
          total: existingData.length,
          data: existingData.map((req: DatabaseShiftRequest) => ({
            date: req.date,
            status: req.status,
            submission_period: req.submission_period
          }))
        });
        
        setExistingRequests(existingData);

        // 既存データを日付データに反映（現在の提出期間のデータのみ表示）
        const updatedDates = dateData.map(d => ({
          ...d,
          requests: existingData
            .filter((req: DatabaseShiftRequest) => 
              req.date === d.date && 
              req.status !== 'converted_to_shift' &&
              req.submission_period === selectedPeriod.id
            )
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
    // 既に提出済みの日付や固定シフトがある日付、確定済みシフトがある日付には追加できない
    if (hasConfirmedShift(date)) {
      console.warn('⚠️ [SHIFT REQUEST] 確定済みシフトがある日付のため追加できません:', date);
      setError(`${date}は既にシフトとして確定されているため、シフト希望として追加できません。`);
      return;
    }
    
    if (isDateSubmitted(date)) {
      console.warn('⚠️ [SHIFT REQUEST] 既に提出済みの日付のため追加できません:', date);
      setError(`${date}は既に提出済みのため、再度追加できません。`);
      return;
    }
    
    if (hasFixedShift(date)) {
      console.warn('⚠️ [SHIFT REQUEST] 固定シフトが設定されている日付のため追加できません:', date);
      setError(`${date}は固定シフトが設定されているため、シフト希望として追加できません。`);
      return;
    }

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
        // 確定済みシフトがある日付のシフトは完全に除外
        if (hasConfirmedShift(newReq.date)) {
          console.log(`⚠️ 日付 ${newReq.date} は確定済みシフトがあるため除外します`);
          return false;
        }

        // 固定シフトが設定されている日付のシフトは完全に除外
        if (hasFixedShift(newReq.date)) {
          console.log(`⚠️ 日付 ${newReq.date} は固定シフトが設定されているため除外します`);
          return false;
        }

        // 既に提出済みの日付のシフトは完全に除外（同じ日付に複数のシフト希望があっても全て除外）
        // converted_to_shift以外の全てのステータス（submitted, approved, rejected）をチェック
        const hasSubmittedForDate = existingRequests.some(existing => 
          existing.date === newReq.date && 
          existing.status !== 'converted_to_shift'
        );
        if (hasSubmittedForDate) {
          console.log(`⚠️ 日付 ${newReq.date} は既に提出済みのため除外します`);
          return false;
        }

        // 既存の希望と完全一致するものは除外
        // converted_to_shift以外の全てのステータスをチェック
        const isExactMatch = existingRequests.some(existing => {
          // 各フィールドを個別に比較
          const dateMatch = existing.date === newReq.date;
          const timeSlotMatch = (existing.time_slot_id || null) === (newReq.time_slot_id || null);
          const startTimeMatch = (existing.preferred_start_time || null) === (newReq.preferred_start_time || null);
          const endTimeMatch = (existing.preferred_end_time || null) === (newReq.preferred_end_time || null);
          const priorityMatch = existing.priority === newReq.priority;
          const notesMatch = (existing.notes || '') === (newReq.notes || '');
          const isNotConverted = existing.status !== 'converted_to_shift';

          return dateMatch && timeSlotMatch && startTimeMatch && 
                 endTimeMatch && priorityMatch && notesMatch && isNotConverted;
        });
        
        if (isExactMatch) {
          console.log(`⚠️ 完全一致する既存のシフト希望があるため除外します: ${newReq.date}`);
          return false;
        }
        
        return true;
      });

      // 新規追加分がない場合は確認
      if (newRequests.length === 0) {
        const confirmedShiftDates = allRequests
          .filter(req => hasConfirmedShift(req.date))
          .map(req => req.date)
          .filter((date, index, self) => self.indexOf(date) === index); // 重複除去
        
        const fixedShiftDates = allRequests
          .filter(req => hasFixedShift(req.date) && !hasConfirmedShift(req.date))
          .map(req => req.date)
          .filter((date, index, self) => self.indexOf(date) === index); // 重複除去
        
        const submittedDates = allRequests
          .filter(req => isDateSubmitted(req.date) && !hasFixedShift(req.date) && !hasConfirmedShift(req.date))
          .map(req => req.date)
          .filter((date, index, self) => self.indexOf(date) === index); // 重複除去
        
        if (confirmedShiftDates.length > 0) {
          setError(`確定済みシフトがある日付が含まれています: ${confirmedShiftDates.join(', ')}。確定済みシフトの日付はシフト希望として提出できません。`);
        } else if (fixedShiftDates.length > 0) {
          setError(`固定シフトが設定されている日付が含まれています: ${fixedShiftDates.join(', ')}。固定シフトの日付はシフト希望として提出できません。`);
        } else if (submittedDates.length > 0) {
          setError(`既に提出済みの日付が含まれています: ${submittedDates.join(', ')}。提出済みの日付は再度提出できません。`);
        } else {
          setError('新しく追加されたシフト希望がありません。既存の希望は変更されません。');
        }
        return;
      }

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
      const message = `${newRequests.length}件の新しいシフト希望を追加提出しました`;
      setSuccessMessage(message);
      setError(null);
      setShowSuccessModal(true);

      // 3秒後にモーダルを閉じる
      setTimeout(() => {
        setShowSuccessModal(false);
        setSuccessMessage(null);
      }, 3000);
      
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

  // 既に提出済みの日付かどうかを判定する関数
  // 一度提出した日は、店長側でシフトとして作成されなくても、まだ未確認の状態でも再度選択できないようにする
  // converted_to_shift以外の全てのステータス（submitted, approved, rejected）をチェック
  // 重要: 全ての提出期間のデータをチェックして、同じ日付に既に提出済みのデータがあるか確認
  // 確定済みシフト（shiftsテーブル）がある場合は除外（確定済みシフトの方が優先）
  const isDateSubmitted = (date: string): boolean => {
    // 確定済みシフトがある場合は、提出済みとして扱わない（確定済みシフトの方が優先）
    if (hasConfirmedShift(date)) {
      return false;
    }
    
    const hasSubmitted = existingRequests.some(existing => 
      existing.date === date && 
      existing.status !== 'converted_to_shift'
    );
    
    if (hasSubmitted) {
      console.log('🔍 [SHIFT REQUEST] 提出済み日付を検出（未確定）:', {
        date,
        existingRequests: existingRequests.filter(req => 
          req.date === date && 
          req.status !== 'converted_to_shift'
        ).map(req => ({
          date: req.date,
          status: req.status,
          submission_period: req.submission_period
        }))
      });
    }
    
    return hasSubmitted;
  };

  // 固定シフトが設定されている日付かどうかを判定する関数
  const hasFixedShift = (date: string): boolean => {
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay(); // 0=日曜日, 1=月曜日, ..., 6=土曜日
    
    return fixedShifts.some(fixedShift => 
      fixedShift.day_of_week === dayOfWeek && 
      fixedShift.is_active === true
    );
  };

  // 確定済みシフトがある日付かどうかを判定する関数
  const hasConfirmedShift = (date: string): boolean => {
    const hasConfirmed = confirmedShifts.some(shift => shift.date === date);
    
    if (hasConfirmed) {
      console.log('🔍 [SHIFT REQUEST] 確定済みシフトを検出:', {
        date,
        shifts: confirmedShifts.filter(s => s.date === date)
      });
    }
    
    return hasConfirmed;
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
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* 成功モーダル */}
        {showSuccessModal && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-30"></div>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 relative z-10">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-green-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-medium text-center text-gray-900 mb-2">
                提出完了
              </h3>
              <p className="text-sm text-gray-600 text-center">
                {successMessage}
              </p>
            </div>
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
                    className={`p-3 flex justify-between items-center cursor-pointer ${
                      hasConfirmedShift(dateData.date)
                        ? 'bg-orange-50 border-l-4 border-orange-500' 
                        : isDateSubmitted(dateData.date) 
                        ? 'bg-green-50 border-l-4 border-green-500' 
                        : hasFixedShift(dateData.date)
                        ? 'bg-purple-50 border-l-4 border-purple-500'
                        : 'bg-gray-50'
                    }`}
                    onClick={() => setExpandedDate(expandedDate === dateData.date ? null : dateData.date)}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">
                        {new Date(dateData.date).getDate()}日 ({dateData.dayOfWeek})
                      </span>
                      {hasConfirmedShift(dateData.date) && (
                        <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          ✓ 確定済み
                        </span>
                      )}
                      {isDateSubmitted(dateData.date) && !hasConfirmedShift(dateData.date) && (
                        <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          ✓ 提出済み
                        </span>
                      )}
                      {hasFixedShift(dateData.date) && !isDateSubmitted(dateData.date) && !hasConfirmedShift(dateData.date) && (
                        <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          🔒 固定シフト
                        </span>
                      )}
                      {dateData.requests.length > 0 && !hasConfirmedShift(dateData.date) && !isDateSubmitted(dateData.date) && !hasFixedShift(dateData.date) && (
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                          {dateData.requests.length}件
                        </span>
                      )}
                      {dateData.requests.length > 0 && isDateSubmitted(dateData.date) && !hasConfirmedShift(dateData.date) && (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                          {dateData.requests.length}件
                        </span>
                      )}
                      {dateData.requests.length > 0 && hasFixedShift(dateData.date) && !isDateSubmitted(dateData.date) && !hasConfirmedShift(dateData.date) && (
                        <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
                          {dateData.requests.length}件
                        </span>
                      )}
                    </div>
                    {!hasConfirmedShift(dateData.date) && !isDateSubmitted(dateData.date) && !hasFixedShift(dateData.date) && (
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
                    )}
                  </div>

                  {/* 展開されたコンテンツ */}
                  {(expandedDate === dateData.date || dateData.requests.length > 0) && (
                    <div className="p-3 space-y-3">
                      {/* 提出済みまたは確定済みの場合の警告メッセージ */}
                      {(isDateSubmitted(dateData.date) || hasConfirmedShift(dateData.date)) && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-center space-x-2">
                            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm text-yellow-800">
                              {hasConfirmedShift(dateData.date) 
                                ? 'この日付は既にシフトとして確定されています。編集・削除はできません。'
                                : 'この日付は既に提出済みです。編集・削除はできません。'}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {dateData.requests.map((request, index) => {
                        const isReadOnly = isDateSubmitted(dateData.date) || hasConfirmedShift(dateData.date);
                        
                        return (
                          <div key={index} className={`bg-white border rounded-lg p-3 space-y-3 ${
                            isReadOnly ? 'border-gray-200 opacity-75' : 'border-gray-200'
                          }`}>
                            {/* 時間帯選択 */}
                            <div>
                              <label className="block text-sm font-medium mb-2">時間帯</label>
                              <select
                                value={request.timeSlotId || ''}
                                onChange={(e) => handleUpdateRequest(dateData.date, index, { 
                                  timeSlotId: e.target.value || null 
                                })}
                                disabled={isReadOnly}
                                className={`w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${
                                  isReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''
                                }`}
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
                                    onClick={() => !isReadOnly && handleUpdateRequest(dateData.date, index, { 
                                      priority: priority as 1 | 2 | 3 
                                    })}
                                    disabled={isReadOnly}
                                    className={`p-2 text-sm rounded-lg border transition-all ${
                                      isReadOnly 
                                        ? 'bg-gray-100 cursor-not-allowed opacity-50'
                                        : request.priority === priority
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
                                onChange={(e) => !isReadOnly && handleUpdateRequest(dateData.date, index, { 
                                  notes: e.target.value 
                                })}
                                placeholder="時間調整の希望など..."
                                rows={2}
                                disabled={isReadOnly}
                                className={`w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none ${
                                  isReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''
                                }`}
                              />
                            </div>

                            {/* 削除ボタン - 提出済みまたは確定済みの場合は非表示 */}
                            {!isReadOnly && (
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
                            )}
                          </div>
                        );
                      })}
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