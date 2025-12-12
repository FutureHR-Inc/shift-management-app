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
  id?: string; // 既存データのID（提出済みかどうかの判定に使用）
  isSubmitted?: boolean; // 提出済みかどうか
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
  const [selectedDatesForBulk, setSelectedDatesForBulk] = useState<Set<string>>(new Set());
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [bulkPriority, setBulkPriority] = useState<1 | 2 | 3>(2);

  useEffect(() => {
    initializePage();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      loadPeriodData();
    }
  }, [selectedPeriod, selectedStore]);

  // 一括入力モーダルが開かれたとき、提出済みの日付を選択から除外
  useEffect(() => {
    if (showBulkInput && dates.length > 0) {
      setSelectedDatesForBulk(prev => {
        const newSet = new Set(prev);
        let hasRemoved = false;
        
        prev.forEach(date => {
          const dateData = dates.find(d => d.date === date);
          if (dateData) {
            const isSubmitted = dateData.requests.some(req => req.isSubmitted === true);
            const isConfirmed = hasConfirmedShift(date);
            const isFixed = hasFixedShift(date);
            
            if (isSubmitted || isConfirmed || isFixed) {
              newSet.delete(date);
              hasRemoved = true;
            }
          }
        });
        
        return newSet;
      });
    }
  }, [showBulkInput, dates]);

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
              notes: req.notes || '',
              id: req.id,
              isSubmitted: req.status === 'submitted' || req.status === 'approved' || req.status === 'rejected'
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

  // 一括入力機能：選択した日付に同じ時間帯・優先度を適用
  const handleBulkApply = (timeSlotId: string | null, priority: 1 | 2 | 3, notes: string) => {
    const validDates = Array.from(selectedDatesForBulk).filter(date => {
      const dateData = dates.find(d => d.date === date);
      if (!dateData) return false;
      // 確定済みシフト、固定シフト、提出済みの日付は除外
      if (hasConfirmedShift(date)) return false;
      if (hasFixedShift(date)) return false;
      // 既に提出済みのリクエストがある日付は除外（新規追加のみ）
      const hasSubmittedRequest = dateData.requests.some(req => req.isSubmitted === true);
      if (hasSubmittedRequest) return false;
      return true;
    });

    if (validDates.length === 0) {
      setError('一括適用できる日付がありません。確定済みシフト、固定シフト、提出済みの日付は除外されます。');
      return;
    }

    setDates(prev => prev.map(d => {
      if (validDates.includes(d.date)) {
        // 既存の未提出リクエストを削除してから新規追加
        const unsubmittedRequests = d.requests.filter(req => req.isSubmitted !== true);
        const newRequest: ShiftRequestData = {
          date: d.date,
          timeSlotId,
          preferredStartTime: null,
          preferredEndTime: null,
          priority,
          notes
        };
        return {
          ...d,
          requests: [...unsubmittedRequests, newRequest]
        };
      }
      return d;
    }));

    setSelectedDatesForBulk(new Set());
    setShowBulkInput(false);
    setBulkPriority(2);
    setError(null);
    
    // フォームをリセット
    setTimeout(() => {
      const timeSlotSelect = document.getElementById('bulk-time-slot') as HTMLSelectElement;
      const notesTextarea = document.getElementById('bulk-notes') as HTMLTextAreaElement;
      if (timeSlotSelect) timeSlotSelect.value = '';
      if (notesTextarea) notesTextarea.value = '';
    }, 100);
  };

  // 日付の選択状態を切り替え
  const toggleDateSelection = (date: string) => {
    const dateData = dates.find(d => d.date === date);
    if (!dateData) return;

    // 確定済みシフト、固定シフト、提出済みの日付は選択不可
    if (hasConfirmedShift(date) || hasFixedShift(date)) return;
    const hasSubmittedRequest = dateData.requests.some(req => req.isSubmitted === true);
    if (hasSubmittedRequest) return;

    setSelectedDatesForBulk(prev => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
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
      
      // 全ての希望を配列に変換（提出済みのものは除外）
      const allRequests = dates.flatMap(dateData =>
        dateData.requests
          .filter(req => req.isSubmitted !== true) // 提出済みのものは除外
          .map(req => ({
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
        setError('少なくとも1つのシフト希望を入力してください。時間帯を選択してください。');
        return;
      }

      // 時間帯が選択されていない希望がある場合は警告
      const invalidRequests = allRequests.filter(req => !req.time_slot_id);
      if (invalidRequests.length > 0) {
        setError('時間帯が選択されていないシフト希望があります。すべての希望に時間帯を選択してください。');
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
          // 詳細なエラー情報がある場合は追加
          if (errorData.details && Array.isArray(errorData.details)) {
            errorMessage += '\n' + errorData.details.join('\n');
          }
        } catch (e) {
          console.error('Error parsing error response:', e);
          // レスポンスの解析に失敗した場合でも、ステータスコードから判断
          if (response.status === 400) {
            errorMessage = 'リクエストが不正です。入力内容を確認してください。';
          } else if (response.status === 409) {
            errorMessage = '重複するシフト希望が検出されました。';
          } else if (response.status === 500) {
            errorMessage = 'サーバーエラーが発生しました。しばらく待ってから再度お試しください。';
          }
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
      dateData.requests.some(req => 
        req.timeSlotId !== null && 
        req.isSubmitted !== true // 提出済みのものは除外
      )
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

        {/* 一括入力モーダル */}
        {showBulkInput && (
          <Card className="border-2 border-blue-500">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base">📋 一括入力</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    カレンダーから日付を選択し、時間帯・優先度・メモを一括で設定
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowBulkInput(false);
                    setSelectedDatesForBulk(new Set());
                    setBulkPriority(2);
                    // フォームをリセット
                    const timeSlotSelect = document.getElementById('bulk-time-slot') as HTMLSelectElement;
                    const notesTextarea = document.getElementById('bulk-notes') as HTMLTextAreaElement;
                    if (timeSlotSelect) timeSlotSelect.value = '';
                    if (notesTextarea) notesTextarea.value = '';
                  }}
                  className="text-xs py-1 px-2 flex-shrink-0 whitespace-nowrap"
                >
                  閉じる
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* コンパクトカレンダー */}
              {selectedPeriod && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">日付を選択 ({selectedDatesForBulk.size}日選択中)</label>
                  <p className="text-xs text-gray-500 mb-2">※提出済み（✓マーク）の日付は重ねて提出できません</p>
                  <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                    <div className="grid grid-cols-7 gap-0.5 mb-1">
                      {['日', '月', '火', '水', '木', '金', '土'].map(day => (
                        <div key={day} className="text-center text-[10px] font-medium text-gray-600 py-0.5">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {(() => {
                        // 選択期間の日付範囲を取得
                        const dateRange = generateDateRange(selectedPeriod.startDate, selectedPeriod.endDate);
                        
                        // 最初の日付の週の開始日（日曜日）を取得
                        const firstDate = new Date(dateRange[0]);
                        const firstDayOfWeek = firstDate.getDay(); // 0=日曜日
                        const startDate = new Date(firstDate);
                        startDate.setDate(startDate.getDate() - firstDayOfWeek);
                        
                        // 最後の日付の週の終了日（土曜日）を取得
                        const lastDate = new Date(dateRange[dateRange.length - 1]);
                        const lastDayOfWeek = lastDate.getDay();
                        const endDate = new Date(lastDate);
                        endDate.setDate(endDate.getDate() + (6 - lastDayOfWeek));
                        
                        // カレンダーに表示する全日付を生成
                        const calendarDates: Array<{ date: string; isInRange: boolean }> = [];
                        const currentDate = new Date(startDate);
                        while (currentDate <= endDate) {
                          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                          const isInRange = dateRange.includes(dateStr);
                          calendarDates.push({ date: dateStr, isInRange });
                          currentDate.setDate(currentDate.getDate() + 1);
                        }
                        
                        return calendarDates.map(({ date, isInRange }) => {
                          const dateObj = new Date(date);
                          const day = dateObj.getDate();
                          const isSelected = selectedDatesForBulk.has(date);
                          const isConfirmed = hasConfirmedShift(date);
                          const isSubmitted = dates.find(d => d.date === date)?.requests.some(req => req.isSubmitted === true);
                          const isFixed = hasFixedShift(date);
                          const isSelectable = isInRange && !isConfirmed && !isSubmitted && !isFixed;
                          
                          return (
                            <button
                              key={date}
                              type="button"
                              onClick={() => {
                                if (isSelectable) {
                                  toggleDateSelection(date);
                                }
                              }}
                              disabled={!isSelectable}
                              className={`
                                h-12 text-[10px] rounded transition-all flex flex-col items-center justify-center relative
                                ${!isInRange 
                                  ? 'text-gray-300 cursor-default' 
                                  : isSelectable
                                  ? isSelected
                                    ? 'bg-blue-500 text-white font-medium hover:bg-blue-600'
                                    : 'bg-white text-gray-700 hover:bg-blue-50 border border-gray-200'
                                  : isConfirmed
                                  ? 'bg-orange-100 text-orange-600 cursor-not-allowed opacity-60'
                                  : isSubmitted
                                  ? 'bg-green-100 text-green-700 cursor-not-allowed border-2 border-green-400 relative'
                                  : isFixed
                                  ? 'bg-purple-100 text-purple-600 cursor-not-allowed opacity-50'
                                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }
                              `}
                              title={
                                !isInRange 
                                  ? '期間外'
                                  : isConfirmed
                                  ? '確定済みシフトあり'
                                  : isSubmitted
                                  ? '提出済み（重ねて提出できません）'
                                  : isFixed
                                  ? '固定シフトあり'
                                  : date
                              }
                            >
                              {day}
                              {isSubmitted && (
                                <span className="absolute top-0.5 right-0.5 text-[8px] font-bold text-green-700">
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        });
                      })()}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-gray-600">
                      <div className="flex items-center gap-0.5">
                        <div className="w-2 h-2 bg-blue-500 rounded"></div>
                        <span>選択中</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <div className="w-2 h-2 bg-white border border-gray-200 rounded"></div>
                        <span>選択可能</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <div className="w-2 h-2 bg-orange-100 rounded"></div>
                        <span>確定済み</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <div className="w-2 h-2 bg-green-100 rounded"></div>
                        <span>提出済み</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <div className="w-2 h-2 bg-purple-100 rounded"></div>
                        <span>固定</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">時間帯</label>
                <select
                  id="bulk-time-slot"
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
              <div>
                <label className="block text-sm font-medium mb-2">優先度</label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(priority => (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => setBulkPriority(priority as 1 | 2 | 3)}
                      className={`p-2 text-sm rounded-lg border transition-all ${
                        bulkPriority === priority
                          ? getPriorityColor(priority)
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {getPriorityLabel(priority)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">メモ（任意）</label>
                <textarea
                  id="bulk-notes"
                  placeholder="時間調整の希望など..."
                  rows={2}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <Button
                type="button"
                onClick={() => {
                  const timeSlotSelect = document.getElementById('bulk-time-slot') as HTMLSelectElement;
                  const notesTextarea = document.getElementById('bulk-notes') as HTMLTextAreaElement;
                  handleBulkApply(
                    timeSlotSelect.value || null,
                    bulkPriority,
                    notesTextarea.value || ''
                  );
                }}
                className="w-full"
              >
                選択した日付に一括適用
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 日付・時間選択（一括入力が閉じている時のみ表示） */}
        {selectedPeriod && selectedStore && !showBulkInput && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
              <CardTitle className="text-base">🕐 勤務希望日時</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                勤務したい日をタップして時間帯を選択
              </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowBulkInput(true);
                    setSelectedDatesForBulk(new Set());
                    setBulkPriority(2); // デフォルトで「希望」を選択
                  }}
                  className="text-xs py-1 px-2 flex-shrink-0 whitespace-nowrap"
                >
                  📋 一括入力
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {dates.map(dateData => (
                <div key={dateData.date} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* 日付ヘッダー */}
                  <div
                    className={`p-3 flex justify-between items-center ${
                      hasConfirmedShift(dateData.date)
                        ? 'bg-orange-50 border-l-4 border-orange-500' 
                        : dateData.requests.some(req => req.isSubmitted === true)
                        ? 'bg-green-50 border-l-4 border-green-500' 
                        : hasFixedShift(dateData.date)
                        ? 'bg-purple-50 border-l-4 border-purple-500'
                        : selectedDatesForBulk.has(dateData.date)
                        ? 'bg-blue-50 border-l-4 border-blue-500'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => {
                        if (showBulkInput) {
                          toggleDateSelection(dateData.date);
                        } else {
                          setExpandedDate(expandedDate === dateData.date ? null : dateData.date);
                        }
                      }}
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
                      {dateData.requests.some(req => req.isSubmitted === true) && !hasConfirmedShift(dateData.date) && (
                        <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          ✓ 提出済み
                        </span>
                      )}
                      {showBulkInput && selectedDatesForBulk.has(dateData.date) && (
                        <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          ✓ 選択中
                        </span>
                      )}
                      {hasFixedShift(dateData.date) && !dateData.requests.some(req => req.isSubmitted === true) && !hasConfirmedShift(dateData.date) && (
                        <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          🔒 固定シフト
                        </span>
                      )}
                      {dateData.requests.length > 0 && !hasConfirmedShift(dateData.date) && !dateData.requests.some(req => req.isSubmitted === true) && !hasFixedShift(dateData.date) && (
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                          {dateData.requests.length}件
                        </span>
                      )}
                      {dateData.requests.length > 0 && dateData.requests.some(req => req.isSubmitted === true) && !hasConfirmedShift(dateData.date) && (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                          {dateData.requests.length}件
                        </span>
                      )}
                      {dateData.requests.length > 0 && hasFixedShift(dateData.date) && !dateData.requests.some(req => req.isSubmitted === true) && !hasConfirmedShift(dateData.date) && (
                        <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
                          {dateData.requests.length}件
                        </span>
                      )}
                    </div>
                    </div>
                    {!hasConfirmedShift(dateData.date) && !dateData.requests.some(req => req.isSubmitted === true) && !hasFixedShift(dateData.date) && !showBulkInput && (
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
                      {/* 確定済みシフトがある場合の警告メッセージ */}
                      {hasConfirmedShift(dateData.date) && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-center space-x-2">
                            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm text-yellow-800">
                              この日付は既にシフトとして確定されています。編集・削除はできません。
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {dateData.requests.map((request, index) => {
                        // 個別のリクエストが提出済みかどうか、または確定済みシフトがあるかどうかで判定
                        const isReadOnly = (request.isSubmitted === true) || hasConfirmedShift(dateData.date);
                        
                        return (
                          <div key={index} className={`bg-white border rounded-lg p-3 space-y-3 ${
                            isReadOnly ? 'border-gray-200 opacity-75' : 'border-gray-200'
                          }`}>
                            {/* 時間帯選択 */}
                            <div>
                              <label className="block text-sm font-medium mb-2">時間帯</label>
                              <select
                                value={request.timeSlotId || ''}
                                onChange={async (e) => {
                                  if (isReadOnly && request.id) {
                                    // 提出済みの場合はAPIを呼び出して更新
                                    try {
                                      const response = await fetch('/api/shift-requests', {
                                        method: 'PUT',
                                        headers: {
                                          'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                          id: request.id,
                                          time_slot_id: e.target.value || null
                                        }),
                                      });
                                      if (!response.ok) {
                                        throw new Error('更新に失敗しました');
                                      }
                                      // データを再取得
                                      await loadPeriodData();
                                    } catch (error) {
                                      setError(error instanceof Error ? error.message : '更新に失敗しました');
                                    }
                                  } else {
                                    handleUpdateRequest(dateData.date, index, { 
                                  timeSlotId: e.target.value || null 
                                    });
                                  }
                                }}
                                disabled={isReadOnly && !request.id}
                                className={`w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${
                                  isReadOnly && !request.id ? 'bg-gray-100 cursor-not-allowed' : ''
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
                                    onClick={async () => {
                                      if (isReadOnly && request.id) {
                                        // 提出済みの場合はAPIを呼び出して更新
                                        try {
                                          const response = await fetch('/api/shift-requests', {
                                            method: 'PUT',
                                            headers: {
                                              'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                              id: request.id,
                                      priority: priority as 1 | 2 | 3 
                                            }),
                                          });
                                          if (!response.ok) {
                                            throw new Error('更新に失敗しました');
                                          }
                                          // データを再取得
                                          await loadPeriodData();
                                        } catch (error) {
                                          setError(error instanceof Error ? error.message : '更新に失敗しました');
                                        }
                                      } else if (!isReadOnly) {
                                        handleUpdateRequest(dateData.date, index, { 
                                          priority: priority as 1 | 2 | 3 
                                        });
                                      }
                                    }}
                                    disabled={isReadOnly && !request.id}
                                    className={`p-2 text-sm rounded-lg border transition-all ${
                                      isReadOnly && !request.id
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
                                onChange={async (e) => {
                                  if (isReadOnly && request.id) {
                                    // 提出済みの場合はAPIを呼び出して更新
                                    try {
                                      const response = await fetch('/api/shift-requests', {
                                        method: 'PUT',
                                        headers: {
                                          'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                          id: request.id,
                                  notes: e.target.value 
                                        }),
                                      });
                                      if (!response.ok) {
                                        throw new Error('更新に失敗しました');
                                      }
                                      // データを再取得
                                      await loadPeriodData();
                                    } catch (error) {
                                      setError(error instanceof Error ? error.message : '更新に失敗しました');
                                    }
                                  } else if (!isReadOnly) {
                                    handleUpdateRequest(dateData.date, index, { 
                                      notes: e.target.value 
                                    });
                                  }
                                }}
                                placeholder="時間調整の希望など..."
                                rows={2}
                                disabled={isReadOnly && !request.id}
                                className={`w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none ${
                                  isReadOnly && !request.id ? 'bg-gray-100 cursor-not-allowed' : ''
                                }`}
                              />
                            </div>

                            {/* 削除ボタン */}
                              <div className="flex justify-end">
                              {!isReadOnly ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => handleRemoveRequest(dateData.date, index)}
                                  className="text-red-600 hover:bg-red-50 text-sm py-1 px-2"
                                >
                                  削除
                                </Button>
                              ) : request.id ? (
                                // 提出済みの場合はAPIを呼び出して削除
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={async () => {
                                    if (!confirm('このシフト希望を削除してもよろしいですか？')) {
                                      return;
                                    }
                                    try {
                                      const response = await fetch(`/api/shift-requests?id=${request.id}`, {
                                        method: 'DELETE',
                                      });
                                      if (!response.ok) {
                                        throw new Error('削除に失敗しました');
                                      }
                                      // データを再取得
                                      await loadPeriodData();
                                    } catch (error) {
                                      setError(error instanceof Error ? error.message : '削除に失敗しました');
                                    }
                                  }}
                                  className="text-red-600 hover:bg-red-50 text-sm py-1 px-2"
                                >
                                  削除
                                </Button>
                              ) : null}
                              </div>
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