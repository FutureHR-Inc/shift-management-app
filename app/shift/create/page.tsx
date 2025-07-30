'use client';

import { useState, useEffect, Suspense } from 'react';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Shift, ShiftPattern, DatabaseShift, DatabaseUser, DatabaseEmergencyRequest, UserStore, ContextMenu, EmergencyModal } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';

interface ShiftModalData {
  date: string;
  timeSlot: string;
  dayIndex: number;
}

// APIから取得するデータ用の型（User型を上書き）
interface ApiUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: 'manager' | 'staff';
  skillLevel: 'training' | 'regular' | 'veteran';
  memo?: string;
  stores: string[];
}

// APIから取得するデータ用の型（Store型を上書き）
interface ApiStore {
  id: string;
  name: string;
  requiredStaff: {
    [day: string]: {
      [timeSlot: string]: number;
    };
  };
  workRules?: {
    maxWeeklyHours: number;
    maxConsecutiveDays: number;
    minRestHours: number;
  };
  flexibleStaff: string[];
}

interface TimeOffRequest {
  id: string;
  userId: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  respondedAt: string | null;
  respondedBy: string | null;
  createdAt: string;
}

function ShiftCreatePageInner() {
  // 今週の月曜日を取得する関数
  const getCurrentWeekMonday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=日曜日, 1=月曜日, ...
    const monday = new Date(today);
    
    // 月曜日を0として計算（日曜日の場合は前週の月曜日）
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(today.getDate() + daysToMonday);
    
    return monday.toISOString().split('T')[0];
  };

  // 表示期間モードに応じた適切な開始日を取得
  const getAppropriateStartDate = (mode: 'week' | 'half-month' | 'month') => {
    const today = new Date();
    
    switch (mode) {
      case 'week':
        return getCurrentWeekMonday();
      case 'half-month':
        // 今月の1日または15日のうち、今日に近い方
        const currentDate = today.getDate();
        const firstHalf = new Date(today.getFullYear(), today.getMonth(), 1);
        const secondHalf = new Date(today.getFullYear(), today.getMonth(), 15);
        
        return currentDate < 15 
          ? firstHalf.toISOString().split('T')[0]
          : secondHalf.toISOString().split('T')[0];
      case 'month':
        // 今月の1日
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return monthStart.toISOString().split('T')[0];
      default:
        return getCurrentWeekMonday();
    }
  };

  // データベースから取得するstate
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [shiftPatterns, setShiftPatterns] = useState<ShiftPattern[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [approvedTimeOffRequests, setApprovedTimeOffRequests] = useState<TimeOffRequest[]>([]);
  
  // UI state
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedWeek, setSelectedWeek] = useState(() => getCurrentWeekMonday()); // 今週の月曜日
  const [viewMode, setViewMode] = useState<'week' | 'half-month' | 'month'>('week'); // 表示期間モード
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<ShiftModalData | null>(null);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedPattern, setSelectedPattern] = useState('');

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 代打募集関連のstate
  const [emergencyRequests, setEmergencyRequests] = useState<DatabaseEmergencyRequest[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenu>({ show: false, x: 0, y: 0, shiftId: '', shift: null });
  const [emergencyModal, setEmergencyModal] = useState<EmergencyModal>({ show: false, shift: null });
  const [emergencyReason, setEmergencyReason] = useState('');
  const [submittingEmergency, setSubmittingEmergency] = useState(false);

  // 応募者管理関連のstate
  const [emergencyManagement, setEmergencyManagement] = useState<{
    show: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: any;
  }>({ show: false, request: null });
  const [processingVolunteer, setProcessingVolunteer] = useState('');

  const router = useRouter();
  const searchParams = useSearchParams();

  // データ取得関数
  const fetchStores = async () => {
    try {
      const response = await fetch('/api/stores');
      if (!response.ok) throw new Error('店舗データの取得に失敗しました');
      const result = await response.json();
      
      // API responseをApiStore型に変換し、必要な構造を確保
      const storesData = result.data?.map((store: { id: string; name: string; required_staff?: Record<string, Record<string, number>>; user_stores?: { is_flexible: boolean; user_id: string }[] }) => ({
        id: store.id,
        name: store.name,
        requiredStaff: store.required_staff || {},
        flexibleStaff: store.user_stores?.filter((us: { is_flexible: boolean }) => us.is_flexible).map((us: { user_id: string }) => us.user_id) || []
      })) || [];
      
      return storesData;
    } catch (error) {
      console.error('Error fetching stores:', error);
      throw error;
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('ユーザーデータの取得に失敗しました');
      const result = await response.json();
      
      // ユーザーに所属店舗情報を追加
      const usersWithStores = result.data?.map((user: DatabaseUser) => ({
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        skillLevel: user.skill_level,
        memo: user.memo,
        stores: user.user_stores?.map((us: UserStore) => us.store_id) || []
      })) || [];
      
      return usersWithStores;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  };

  const fetchShiftPatterns = async () => {
    try {
      const response = await fetch('/api/shift-patterns');
      if (!response.ok) throw new Error('シフトパターンの取得に失敗しました');
      const result = await response.json();
      
      // API response を ShiftPattern 型に変換
      const patterns = result.data?.map((pattern: { id: string; name: string; start_time: string; end_time: string; color: string; break_time?: number }) => ({
        id: pattern.id,
        name: pattern.name,
        startTime: pattern.start_time,
        endTime: pattern.end_time,
        color: pattern.color,
        breakTime: pattern.break_time
      })) || [];
      
      return patterns;
    } catch (error) {
      console.error('Error fetching shift patterns:', error);
      throw error;
    }
  };

  const fetchShifts = async (storeId: string, startDate: string, endDate?: string) => {
    try {
      const actualEndDate = endDate || (() => {
        const weekEnd = new Date(startDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return weekEnd.toISOString().split('T')[0];
      })();
      
      const response = await fetch(
        `/api/shifts?storeId=${storeId}&startDate=${startDate}&endDate=${actualEndDate}`
      );
      if (!response.ok) throw new Error('シフトデータの取得に失敗しました');
      const result = await response.json();
      
      // API response を Shift 型に変換
      const shifts = result.data?.map((shift: { id: string; user_id: string; store_id: string; date: string; pattern_id: string; status: string; notes?: string }) => ({
        id: shift.id,
        userId: shift.user_id,
        storeId: shift.store_id,
        date: shift.date,
        patternId: shift.pattern_id,
        status: shift.status,
        notes: shift.notes
      })) || [];
      
      return shifts;
    } catch (error) {
      console.error('Error fetching shifts:', error);
      throw error;
    }
  };

  // 承認された希望休申請を取得
  const fetchApprovedTimeOffRequests = async (startDate: string, endDate?: string) => {
    try {
      const params = new URLSearchParams({
        status: 'approved',
        date_from: startDate,
      });
      
      if (endDate) {
        params.set('date_to', endDate);
      }
      
      const response = await fetch(`/api/time-off-requests?${params.toString()}`);
      if (!response.ok) throw new Error('希望休申請データの取得に失敗しました');
      const result = await response.json();
      
      // API responseをTimeOffRequest型に変換
      const timeOffData = result.data?.map((request: { id: string; user_id: string; date: string; reason: string; status: string; responded_at?: string; responded_by?: string; created_at: string }) => ({
        id: request.id,
        userId: request.user_id,
        date: request.date,
        reason: request.reason,
        status: request.status,
        respondedAt: request.responded_at,
        respondedBy: request.responded_by,
        createdAt: request.created_at
      })) || [];
      
      return timeOffData;
    } catch (error) {
      console.error('Error fetching time off requests:', error);
      throw error;
    }
  };

  // 代打募集データを取得
  const fetchEmergencyRequests = async (storeId: string, startDate: string, endDate?: string) => {
    try {
      const actualEndDate = endDate || (() => {
        const weekEnd = new Date(startDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return weekEnd.toISOString().split('T')[0];
      })();
      
      const response = await fetch(
        `/api/emergency-requests?store_id=${storeId}&date_from=${startDate}&date_to=${actualEndDate}`
      );
      if (!response.ok) throw new Error('代打募集データの取得に失敗しました');
      const result = await response.json();
      
      return result.data || [];
    } catch (error) {
      console.error('Error fetching emergency requests:', error);
      return [];
    }
  };

  // 初期データ読み込み
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [storesData, usersData, patternsData] = await Promise.all([
          fetchStores(),
          fetchUsers(),
          fetchShiftPatterns()
        ]);
        
        setStores(storesData);
        setUsers(usersData);
        setShiftPatterns(patternsData);
        
        // デフォルト店舗選択
        if (storesData.length > 0) {
          setSelectedStore(storesData[0].id);
        }

        // URLパラメータで代打募集管理が指定されている場合
        const emergencyParam = searchParams.get('emergency');
        if (emergencyParam) {
          await handleEmergencyManagement(emergencyParam);
        }
        
      } catch (error) {
        setError(error instanceof Error ? error.message : '初期データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [searchParams]);

  // 選択された店舗または週が変更された時にシフトデータを取得
  useEffect(() => {
    if (selectedStore && selectedWeek) {
      const loadShifts = async () => {
        try {
          setError(null); // 前のエラーをクリア
          
          // 表示期間に応じて取得範囲を決定
          const startDate = selectedWeek;
          let endDate = selectedWeek;
          
          if (viewMode === 'week') {
            const end = new Date(selectedWeek);
            end.setDate(end.getDate() + 6);
            endDate = end.toISOString().split('T')[0];
          } else if (viewMode === 'half-month') {
            const end = new Date(selectedWeek);
            end.setDate(end.getDate() + 13);
            endDate = end.toISOString().split('T')[0];
          } else if (viewMode === 'month') {
            const start = new Date(selectedWeek);
            start.setDate(1);
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
            endDate = end.toISOString().split('T')[0];
          }
          
          const [shiftsData, timeOffData, emergencyData] = await Promise.all([
            fetchShifts(selectedStore, startDate, endDate),
            fetchApprovedTimeOffRequests(startDate, endDate),
            fetchEmergencyRequests(selectedStore, startDate, endDate)
          ]);
          setShifts(shiftsData);
          setApprovedTimeOffRequests(timeOffData);
          setEmergencyRequests(emergencyData);
        } catch (error) {
          setError(error instanceof Error ? error.message : 'シフトデータの読み込みに失敗しました');
        }
      };

      loadShifts();
    } else if (!selectedStore && stores.length > 0) {
      // 店舗が選択されていない場合はシフトをクリア
      setShifts([]);
      setEmergencyRequests([]);
    }
  }, [selectedStore, selectedWeek, stores, viewMode]); // viewModeを依存配列に追加

  // 表示期間に応じた日付を生成
  const getDisplayDates = (startDate: string, mode: 'week' | 'half-month' | 'month') => {
    const start = new Date(startDate);
    const dates = [];
    let dayCount = 7; // デフォルトは週表示

    switch (mode) {
      case 'week':
        dayCount = 7;
        break;
      case 'half-month':
        dayCount = 14;
        break;
      case 'month':
        // 月の開始日に調整
        start.setDate(1);
        const year = start.getFullYear();
        const month = start.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        dayCount = lastDay;
        break;
    }

    for (let i = 0; i < dayCount; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const displayDates = getDisplayDates(selectedWeek, viewMode);
  const selectedStoreData = stores.find(store => store.id === selectedStore);

  const timeSlots = [
    { id: 'morning', name: 'モーニング', time: '8:00-11:00' },
    { id: 'lunch', name: 'ランチ', time: '11:00-16:00' },
    { id: 'evening', name: 'イブニング', time: '16:00-22:00' },
  ];

  // 必要人数を取得
  const getRequiredStaff = (dayIndex: number, timeSlot: string) => {
    try {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[dayIndex];
      
      if (!selectedStoreData || !selectedStoreData.requiredStaff) {
        return 0;
      }
      
      const dayRequiredStaff = selectedStoreData.requiredStaff[dayName];
      if (!dayRequiredStaff || typeof dayRequiredStaff !== 'object') {
        return 0;
      }
      
      const slotRequiredStaff = dayRequiredStaff[timeSlot];
      return typeof slotRequiredStaff === 'number' ? slotRequiredStaff : 0;
    } catch (error) {
      console.error('Error in getRequiredStaff:', error);
      return 0;
    }
  };

  // 特定の日付・時間帯のシフトを取得
  const getShiftForSlot = (date: string, timeSlot: string) => {
    try {
      if (!shifts || !selectedStore || !shiftPatterns) {
        return [];
      }

      return shifts.filter(shift => {
        if (shift.date !== date || shift.storeId !== selectedStore) return false;
        
        const pattern = shiftPatterns.find(p => p.id === shift.patternId);
        if (!pattern || !pattern.startTime || !pattern.endTime) return false;

        // パターンの開始時間と終了時間を分単位に変換
        const patternStartTime = pattern.startTime.split(':').map(Number);
        const patternEndTime = pattern.endTime.split(':').map(Number);
        
        if (patternStartTime.length < 2 || patternEndTime.length < 2 || 
            isNaN(patternStartTime[0]) || isNaN(patternStartTime[1]) ||
            isNaN(patternEndTime[0]) || isNaN(patternEndTime[1])) {
          return false;
        }

        const patternStartMinutes = patternStartTime[0] * 60 + patternStartTime[1];
        const patternEndMinutes = patternEndTime[0] * 60 + patternEndTime[1];

        // 時間帯の範囲定義
        const slotTimeRanges = {
          morning: { start: [8, 0], end: [11, 0] },
          lunch: { start: [11, 0], end: [16, 0] },
          evening: { start: [16, 0], end: [22, 0] }
        };

        const range = slotTimeRanges[timeSlot as keyof typeof slotTimeRanges];
        if (!range) return false;

        const slotStartMinutes = range.start[0] * 60 + range.start[1];
        const slotEndMinutes = range.end[0] * 60 + range.end[1];

        // 時間範囲の重複判定
        // シフトパターンの開始時間が時間帯の終了時間より前で、
        // シフトパターンの終了時間が時間帯の開始時間より後の場合、重複している
        return patternStartMinutes < slotEndMinutes && patternEndMinutes > slotStartMinutes;
      });
    } catch (error) {
      console.error('Error in getShiftForSlot:', error);
      return [];
    }
  };

  // セルクリックでモーダル開く
  const handleCellClick = async (date: string, timeSlot: string, dayIndex: number) => {
    if (!selectedStore) {
      setError('店舗を選択してください');
      return;
    }
    
    setModalData({ date, timeSlot, dayIndex });
    setSelectedUser('');
    setSelectedPattern('');
    // setStaffShiftStatus(null); // スタッフシフト状況をクリア（削除済み）
    
    // 該当日の確定済みシフトをチェック
    await checkAllStaffConfirmedShifts(date);
    
    setIsModalOpen(true);
  };

  // シフト追加
  const handleAddShift = async () => {
    if (!modalData || !selectedUser || !selectedPattern || !selectedStore) {
      setError('必要な情報がすべて選択されていません');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      const newShiftData = {
        user_id: selectedUser,
        store_id: selectedStore,
        date: modalData.date,
        pattern_id: selectedPattern,
        status: 'draft'
      };

      const response = await fetch('/api/shifts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newShiftData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // 重複エラーの場合、詳細な情報を表示
        if (response.status === 409 && errorData.conflictingStore) {
          const selectedUserName = users.find(u => u.id === selectedUser)?.name || '選択されたスタッフ';
          const conflictingStoreName = errorData.conflictingStore;
          
          if (errorData.conflictType === 'confirmed') {
            setError(`${selectedUserName}は既に${conflictingStoreName}で確定済みのシフトがあります。確定済みシフトがある日は他の店舗でのシフト作成はできません。`);
          } else {
            setError(`${selectedUserName}は既に${conflictingStoreName}で下書きシフトがあります。同じ日に複数の店舗で勤務することはできません。`);
          }
        } else {
          setError(errorData.error || 'シフトの追加に失敗しました');
        }
        return;
      }

      const result = await response.json();
      
      // 新しいシフトをローカル状態に追加
      const newShift: Shift = {
        id: result.data.id,
        userId: result.data.user_id,
        storeId: result.data.store_id,
        date: result.data.date,
        patternId: result.data.pattern_id,
        status: result.data.status
      };

      setShifts([...shifts, newShift]);
      setIsModalOpen(false);
      setSelectedUser('');
      setSelectedPattern('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'シフトの追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // シフト削除
  const handleDeleteShift = async (shiftId: string) => {
    try {
      // 確定済みシフトの削除を制限
      const shiftToDelete = shifts.find(s => s.id === shiftId);
      if (shiftToDelete && shiftToDelete.status === 'confirmed') {
        setError('確定済みのシフトは削除できません');
        return;
      }

      const response = await fetch(`/api/shifts?id=${shiftId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'シフトの削除に失敗しました');
      }

      setShifts(shifts.filter(s => s.id !== shiftId));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'シフトの削除に失敗しました');
    }
  };

  // シフト確定
  const handleConfirmShifts = async () => {
    if (!selectedStore || !selectedWeek) {
      setError('店舗と期間を選択してください');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // 表示期間に応じて期間の開始・終了日を計算
      const periodStart = new Date(selectedWeek);
      let periodEnd = new Date(selectedWeek);
      
      if (viewMode === 'week') {
        periodEnd.setDate(periodStart.getDate() + 6);
      } else if (viewMode === 'half-month') {
        periodEnd.setDate(periodStart.getDate() + 13);
      } else if (viewMode === 'month') {
        periodStart.setDate(1);
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
      }

      const response = await fetch('/api/shifts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          store_id: selectedStore,
          week_start: periodStart.toISOString().split('T')[0],
          week_end: periodEnd.toISOString().split('T')[0],
          status: 'confirmed'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'シフトの確定に失敗しました');
      }

      const result = await response.json();
      
      // 成功メッセージを表示
      const periodName = viewMode === 'week' ? '週' : viewMode === 'half-month' ? '半月' : '月';
      alert(`${result.updated_count}件の${periodName}間シフトを確定しました`);
      
      // データを完全に再取得
      const startDate = periodStart.toISOString().split('T')[0];
      const endDate = periodEnd.toISOString().split('T')[0];
      
      const [refreshedShifts, refreshedTimeOff] = await Promise.all([
        fetchShifts(selectedStore, startDate, endDate),
        fetchApprovedTimeOffRequests(startDate, endDate)
      ]);
      
      setShifts(refreshedShifts);
      setApprovedTimeOffRequests(refreshedTimeOff);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'シフトの確定に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 下書き保存
  const handleSaveDraft = async () => {
    if (!selectedStore || !selectedWeek) {
      setError('店舗と期間を選択してください');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // 表示期間に応じて期間の開始・終了日を計算
      const periodStart = new Date(selectedWeek);
      let periodEnd = new Date(selectedWeek);
      
      if (viewMode === 'week') {
        periodEnd.setDate(periodStart.getDate() + 6);
      } else if (viewMode === 'half-month') {
        periodEnd.setDate(periodStart.getDate() + 13);
      } else if (viewMode === 'month') {
        periodStart.setDate(1);
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
      }

      const response = await fetch('/api/shifts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          store_id: selectedStore,
          week_start: periodStart.toISOString().split('T')[0],
          week_end: periodEnd.toISOString().split('T')[0],
          status: 'draft'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '下書き保存に失敗しました');
      }

      const result = await response.json();
      
      // 成功メッセージを表示
      const periodName = viewMode === 'week' ? '週' : viewMode === 'half-month' ? '半月' : '月';
      alert(`${result.updated_count}件の${periodName}間シフトを下書きとして保存しました`);
      
      // データを完全に再取得
      const startDate = periodStart.toISOString().split('T')[0];
      const endDate = periodEnd.toISOString().split('T')[0];
      
      const [refreshedShifts, refreshedTimeOff] = await Promise.all([
        fetchShifts(selectedStore, startDate, endDate),
        fetchApprovedTimeOffRequests(startDate, endDate)
      ]);
      
      setShifts(refreshedShifts);
      setApprovedTimeOffRequests(refreshedTimeOff);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : '下書き保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 特定の日付でスタッフが希望休を取得しているかチェック
  const isStaffOnTimeOff = (userId: string, date: string) => {
    return approvedTimeOffRequests.some(request => 
      request.userId === userId && request.date === date
    );
  };

  // 勤怠ルール違反をチェック
  const checkWorkRuleViolations = (userId: string, date: string, patternId: string) => {
    const warnings: string[] = [];
    const selectedStoreData = stores.find(store => store.id === selectedStore);
    
    if (!selectedStoreData?.workRules) return warnings;

    const workRules = selectedStoreData.workRules;
    const checkDate = new Date(date);
    
    // 週の開始日（月曜日）を取得
    const weekStart = new Date(checkDate);
    weekStart.setDate(checkDate.getDate() - checkDate.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // 同じユーザーの週間シフトを取得
    const weeklyShifts = shifts.filter(shift => {
      const shiftDate = new Date(shift.date);
      return shift.userId === userId && 
             shiftDate >= weekStart && 
             shiftDate <= weekEnd;
    });

    // 新しいシフトパターンの時間数を計算
    const newPattern = shiftPatterns.find(p => p.id === patternId);
    let newShiftHours = 0;
    if (newPattern && newPattern.startTime && newPattern.endTime) {
      const startTime = newPattern.startTime.split(':').map(Number);
      const endTime = newPattern.endTime.split(':').map(Number);
      const startMinutes = startTime[0] * 60 + startTime[1];
      const endMinutes = endTime[0] * 60 + endTime[1];
      newShiftHours = (endMinutes - startMinutes) / 60;
      if (newPattern.breakTime) {
        newShiftHours -= newPattern.breakTime / 60;
      }
    }

    // 週間労働時間チェック
    let weeklyHours = newShiftHours;
    weeklyShifts.forEach(shift => {
      const pattern = shiftPatterns.find(p => p.id === shift.patternId);
      if (pattern && pattern.startTime && pattern.endTime) {
        const startTime = pattern.startTime.split(':').map(Number);
        const endTime = pattern.endTime.split(':').map(Number);
        const startMinutes = startTime[0] * 60 + startTime[1];
        const endMinutes = endTime[0] * 60 + endTime[1];
        let shiftHours = (endMinutes - startMinutes) / 60;
        if (pattern.breakTime) {
          shiftHours -= pattern.breakTime / 60;
        }
        weeklyHours += shiftHours;
      }
    });

    if (weeklyHours > workRules.maxWeeklyHours) {
      warnings.push(`週間労働時間が${workRules.maxWeeklyHours}時間を超えます（${weeklyHours.toFixed(1)}時間）`);
    }

    // 連続勤務日数チェック
    const userShifts = shifts
      .filter(shift => shift.userId === userId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // 新しいシフトを含めて連続勤務日数を計算
    const allShifts = [...userShifts, { date, userId, patternId }]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let consecutiveDays = 1;
    let maxConsecutive = 1;
    // const targetDate = new Date(date); // 未使用のため削除

    for (let i = 1; i < allShifts.length; i++) {
      const prevDate = new Date(allShifts[i - 1].date);
      const currentDate = new Date(allShifts[i].date);
      const diffDays = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (diffDays === 1) {
        consecutiveDays++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveDays);
      } else {
        consecutiveDays = 1;
      }
    }

    if (maxConsecutive > workRules.maxConsecutiveDays) {
      warnings.push(`連続勤務日数が${workRules.maxConsecutiveDays}日を超えます（${maxConsecutive}日）`);
    }

    return warnings;
  };

  // 店舗所属スタッフのみフィルタ（基本的なシフト作成は所属スタッフ内で完結）
  const availableStaff = selectedStore ? users.filter(user => user.stores.includes(selectedStore)) : [];

  // 時給計算（仮）
  const calculateHourlyWage = (skillLevel: string) => {
    const wages = {
      training: 1000,
      regular: 1200,
      veteran: 1500
    };
    return wages[skillLevel as keyof typeof wages] || 1000;
  };

  // 週の統計計算
  const calculateWeeklyStats = () => {
    try {
      if (!shifts || !selectedStore || !shiftPatterns || !users) {
        return {
          totalHours: 0,
          totalWage: 0,
          uniqueStaff: 0,
          averageHours: 0
        };
      }

      // 表示期間に応じて期間の開始・終了日を計算
      const periodStart = new Date(selectedWeek);
      let periodEnd = new Date(selectedWeek);
      
      if (viewMode === 'week') {
        periodEnd.setDate(periodStart.getDate() + 6);
      } else if (viewMode === 'half-month') {
        periodEnd.setDate(periodStart.getDate() + 13);
      } else if (viewMode === 'month') {
        periodStart.setDate(1);
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
      }

      const periodShifts = shifts.filter(shift => {
        try {
          const shiftDate = new Date(shift.date);
          return shiftDate >= periodStart && shiftDate <= periodEnd && shift.storeId === selectedStore;
        } catch (error) {
          console.error('Error filtering period shifts:', error);
          return false;
        }
      });

      let totalHours = 0;
      let totalWage = 0;
      const staffCount = new Set();

      periodShifts.forEach(shift => {
        try {
          const pattern = shiftPatterns.find(p => p.id === shift.patternId);
          const user = users.find(u => u.id === shift.userId);
          
          if (pattern && user && pattern.startTime && pattern.endTime) {
            const startTime = pattern.startTime.split(':').map(Number);
            const endTime = pattern.endTime.split(':').map(Number);
            
            if (startTime.length >= 2 && endTime.length >= 2 && 
                !isNaN(startTime[0]) && !isNaN(startTime[1]) && 
                !isNaN(endTime[0]) && !isNaN(endTime[1])) {
              
              const hours = (endTime[0] * 60 + endTime[1] - startTime[0] * 60 - startTime[1]) / 60;
              const workHours = hours - (pattern.breakTime || 0) / 60;
              
              if (workHours > 0) {
                totalHours += workHours;
                totalWage += workHours * calculateHourlyWage(user.skillLevel);
                staffCount.add(shift.userId);
              }
            }
          }
        } catch (error) {
          console.error('Error calculating shift stats:', error);
        }
      });

      return {
        totalHours: Math.round(totalHours * 10) / 10,
        totalWage: Math.round(totalWage),
        uniqueStaff: staffCount.size,
        averageHours: staffCount.size > 0 ? Math.round((totalHours / staffCount.size) * 10) / 10 : 0
      };
    } catch (error) {
      console.error('Error in calculateWeeklyStats:', error);
      return {
        totalHours: 0,
        totalWage: 0,
        uniqueStaff: 0,
        averageHours: 0
      };
    }
  };

  const weeklyStats = calculateWeeklyStats();

  // 週のシフト確定状況を確認
  const weekShiftStatus = () => {
    const periodStart = new Date(selectedWeek);
    let periodEnd = new Date(selectedWeek);
    
    if (viewMode === 'week') {
      periodEnd.setDate(periodStart.getDate() + 6);
    } else if (viewMode === 'half-month') {
      periodEnd.setDate(periodStart.getDate() + 13);
    } else if (viewMode === 'month') {
      periodStart.setDate(1);
      periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
    }
    
    const periodShifts = shifts.filter(shift => {
      const shiftDate = new Date(shift.date);
      return shiftDate >= periodStart && shiftDate <= periodEnd && shift.storeId === selectedStore;
    });
    
    if (periodShifts.length === 0) return { hasShifts: false, allConfirmed: false, hasConfirmed: false };
    
    const confirmedShifts = periodShifts.filter(shift => shift.status === 'confirmed');
    return {
      hasShifts: true,
      allConfirmed: confirmedShifts.length === periodShifts.length,
      hasConfirmed: confirmedShifts.length > 0,
      totalShifts: periodShifts.length,
      confirmedCount: confirmedShifts.length
    };
  };

  const shiftStatus = weekShiftStatus();

  // 特定のスタッフの同日シフト状況をチェック（同店舗・他店舗両方）
  const checkStaffShiftStatus = async (userId: string, date: string) => {
    try {
      const response = await fetch(`/api/shifts?user_id=${userId}&date_from=${date}&date_to=${date}`);
      if (!response.ok) return { hasConflict: false, conflicts: [] };
      
      const result = await response.json();
      const existingShifts = result.data || [];
      
             const conflicts = existingShifts.map((shift: DatabaseShift) => ({
         storeName: shift.stores?.name || '不明な店舗',
         storeId: shift.store_id,
         status: shift.status,
         isConfirmed: shift.status === 'confirmed',
         isSameStore: shift.store_id === selectedStore,
         shiftPattern: shift.shift_patterns?.name || '不明なパターン',
         startTime: shift.shift_patterns?.startTime || '',
         endTime: shift.shift_patterns?.endTime || ''
       }));
       
        return {
         hasConflict: conflicts.length > 0,
         conflicts: conflicts,
         hasOtherStoreConflict: conflicts.some((c: { isSameStore: boolean }) => !c.isSameStore),
         hasSameStoreConflict: conflicts.some((c: { isSameStore: boolean }) => c.isSameStore),
         hasConfirmedConflict: conflicts.some((c: { isConfirmed: boolean }) => c.isConfirmed)
       };
    } catch (error) {
      console.error('Error checking staff shift status:', error);
      return { hasConflict: false, conflicts: [] };
    }
  };

  // スタッフ選択時の競合チェック（下書き・確定関係なく制限）
  // const [staffShiftStatus, setStaffShiftStatus] = useState<DatabaseShift | null>(null); // 未使用のため削除
  const [staffWithConfirmedShifts, setStaffWithConfirmedShifts] = useState<string[]>([]);
  
  // スタッフ選択が変更された時の処理
  const handleStaffSelection = async (userId: string) => {
    setSelectedUser(userId);
    // setStaffShiftStatus(null); // 未使用のため削除
    
    if (userId && modalData) {
      await checkStaffShiftStatus(userId, modalData.date);
      // setStaffShiftStatus(shiftStatus); // 未使用のため削除
    }
  };

  // モーダル開時に全スタッフの確定シフト状況をチェック
  const checkAllStaffConfirmedShifts = async (date: string) => {
    try {
      const response = await fetch(`/api/shifts?date_from=${date}&date_to=${date}&status=confirmed`);
      if (!response.ok) return;
      
      const result = await response.json();
      const confirmedShifts = result.data || [];
      
      const staffWithConfirmed = confirmedShifts
        .map((shift: { user_id: string }) => shift.user_id as string)
        .filter((userId: string) => userId);
      setStaffWithConfirmedShifts(Array.from(new Set(staffWithConfirmed)));
    } catch (error) {
      console.error('Error checking confirmed shifts:', error);
    }
  };

  // 代打募集を作成
  const handleCreateEmergencyRequest = async () => {
    if (!emergencyModal.shift || !emergencyReason.trim()) {
      setError('理由を入力してください');
      return;
    }

    try {
      setSubmittingEmergency(true);
      setError(null);

      const response = await fetch('/api/emergency-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          original_user_id: emergencyModal.shift.user_id,
          store_id: selectedStore,
          date: emergencyModal.shift.date,
          shift_pattern_id: emergencyModal.shift.shift_pattern_id,
          reason: emergencyReason.trim()
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '代打募集の作成に失敗しました');
      }

      const result = await response.json();
      
      // 代打募集データを更新
      setEmergencyRequests([...emergencyRequests, result.data]);
      
      // 店舗所属スタッフ + 応援可能スタッフにメール送信
      try {
        // 対象店舗の所属スタッフと応援可能スタッフを取得
        const targetStoreData = stores.find(store => store.id === result.data.store_id);
        if (!targetStoreData) {
          console.error('Target store not found for email sending');
          return;
        }
        
        // 所属スタッフ
        const storeStaff = users.filter(user => user.stores.includes(result.data.store_id));
        
        // 応援可能スタッフ（所属していないが応援可能）
        const flexibleStaff = users.filter(user => 
          !user.stores.includes(result.data.store_id) && // 所属していない
          targetStoreData.flexibleStaff.includes(user.id) // 応援可能リストに含まれる
        );
        
        // 所属スタッフと応援可能スタッフを結合
        const allTargetStaff = [...storeStaff, ...flexibleStaff];
        const staffEmails = allTargetStaff
          .map(staff => staff.email)
          .filter(email => email); // emailが存在するもののみ

        console.log(`Sending emergency request email to: ${allTargetStaff.length} staff members (${storeStaff.length} store staff + ${flexibleStaff.length} flexible staff)`);

        if (staffEmails.length > 0) {
            const emailResponse = await fetch('/api/email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'emergency-request',
                userEmails: staffEmails,
                details: {
                  storeName: result.data.stores?.name || '不明な店舗',
                  date: new Date(result.data.date).toLocaleDateString('ja-JP'),
                  shiftPattern: result.data.shift_patterns?.name || '不明なシフト',
                  startTime: result.data.shift_patterns?.start_time || '00:00',
                  endTime: result.data.shift_patterns?.end_time || '00:00',
                  reason: result.data.reason
                }
              }),
            });

            if (!emailResponse.ok) {
              console.error('メール送信に失敗しましたが、代打募集は正常に作成されました');
            }
          }
      } catch (emailError) {
        console.error('メール送信エラー:', emailError);
      }
      
      // モーダルを閉じる
      setEmergencyModal({ show: false, shift: null });
      setEmergencyReason('');
      
      alert('代打募集を開始し、対象スタッフにメール通知を送信しました！');
      
    } catch (error) {
      setError(error instanceof Error ? error.message : '代打募集の作成に失敗しました');
    } finally {
      setSubmittingEmergency(false);
    }
  };

  // 特定のシフトが代打募集中かチェック
  const getEmergencyRequestForShift = (shiftId: string) => {
    return emergencyRequests.find(req => 
      req.original_user_id === shifts.find(s => s.id === shiftId)?.userId &&
      req.date === shifts.find(s => s.id === shiftId)?.date &&
      req.shift_pattern_id === shifts.find(s => s.id === shiftId)?.patternId &&
      req.status === 'open'
    );
  };

  // 右クリックメニューを表示
  const handleShiftRightClick = (e: React.MouseEvent, shift: DatabaseShift) => {
    // 確定済みシフトのみ代打募集可能
    if (shift.status !== 'confirmed') return;
    
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      shiftId: shift.id,
      shift: shift
    });
  };

  // コンテキストメニューを閉じる
  const handleCloseContextMenu = () => {
    setContextMenu({ show: false, x: 0, y: 0, shiftId: '', shift: null });
  };

  // 代打募集モーダルを開く
  const handleOpenEmergencyModal = (shift: DatabaseShift) => {
    setEmergencyModal({ show: true, shift });
    handleCloseContextMenu();
  };

  // 代打募集管理画面を開く
  const handleEmergencyManagement = async (emergencyRequestId: string) => {
    try {
      const response = await fetch(`/api/emergency-requests?id=${emergencyRequestId}`);
      if (!response.ok) throw new Error('代打募集データの取得に失敗しました');
      const result = await response.json();
      
      if (result.data) {
        setEmergencyManagement({ show: true, request: result.data });
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '代打募集データの取得に失敗しました');
    }
  };

  // 応募者承認・却下処理
  const handleVolunteerAction = async (requestId: string, volunteerId: string, action: 'accept' | 'reject') => {
    setProcessingVolunteer(volunteerId);
    
    try {
      const response = await fetch('/api/emergency-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emergency_request_id: requestId,
          volunteer_id: volunteerId,
          action: action
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `代打の${action === 'accept' ? '確定' : '削除'}に失敗しました`);
      }

      const result = await response.json();

      if (action === 'accept') {
        // 代打確定時の処理
        const volunteerName = result.data.volunteer?.users?.name || '代打スタッフ';
        const originalUserName = result.data.emergency_request?.original_user?.name || '元の担当者';
        
        alert(`代打を確定しました。\n${originalUserName} → ${volunteerName}\nシフト表が自動更新されました。`);
        
        // 管理画面を閉じてシフト画面に戻る
        setEmergencyManagement({ show: false, request: null });
        router.push('/shift/create');
      } else {
        // 応募者削除時の処理
        setEmergencyManagement(prev => ({
          ...prev,
          request: prev.request ? {
            ...prev.request,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        emergency_volunteers: prev.request.emergency_volunteers?.filter((v: any) => v.id !== volunteerId)
          } : null
        }));
        
        alert('応募者を削除しました。');
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : '処理に失敗しました');
    } finally {
      setProcessingVolunteer('');
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

  // エラー表示
  if (error && !stores.length && !users.length) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <div className="text-red-600 mb-4">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">エラーが発生しました</h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>
                再読み込み
              </Button>
            </CardContent>
          </Card>
        </div>
      </AuthenticatedLayout>
    );
  }

  // データが空の場合
  if (stores.length === 0) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">店舗データがありません</h3>
              <p className="text-gray-600 mb-4">
                シフトを作成するには、まず店舗を登録してください。
              </p>
              <Button onClick={() => window.location.href = '/settings/store'}>
                店舗設定へ
              </Button>
            </CardContent>
          </Card>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="space-y-6" onClick={handleCloseContextMenu}>
        {/* エラー表示バー */}
        {error && (
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
        )}

        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">シフト作成</h1>
            <p className="text-gray-600 mt-2">期間単位でシフトを作成・編集できます</p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="secondary" 
              disabled={saving || !shiftStatus.hasShifts} 
              onClick={handleSaveDraft}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              下書き保存
            </Button>
            <Button 
              disabled={saving || !shiftStatus.hasShifts || shiftStatus.allConfirmed} 
              onClick={handleConfirmShifts}
              className={shiftStatus.allConfirmed ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {shiftStatus.allConfirmed ? '確定済み' : 'シフト確定'}
            </Button>
          </div>
        </div>

        {/* 統計サマリー */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{weeklyStats.totalHours}h</div>
              <p className="text-sm text-gray-500 mt-1">
                {viewMode === 'week' ? '総勤務時間' : 
                 viewMode === 'half-month' ? '半月勤務時間' : 
                 '月間勤務時間'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">¥{weeklyStats.totalWage.toLocaleString()}</div>
              <p className="text-sm text-gray-500 mt-1">
                {viewMode === 'week' ? '総人件費' : 
                 viewMode === 'half-month' ? '半月人件費' : 
                 '月間人件費'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-purple-600">{weeklyStats.uniqueStaff}人</div>
              <p className="text-sm text-gray-500 mt-1">勤務スタッフ数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-orange-600">{weeklyStats.averageHours}h</div>
              <p className="text-sm text-gray-500 mt-1">平均勤務時間</p>
            </CardContent>
          </Card>
        </div>

        {/* 店舗・週選択 */}
        <Card>
          <CardContent className="pt-6">
            {/* 表示期間切り替えタブ */}
            <div className="mb-6">
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                  onClick={() => {
                    setViewMode('week');
                    setSelectedWeek(getAppropriateStartDate('week'));
                  }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'week'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  週表示
                </button>
                <button
                  onClick={() => {
                    setViewMode('half-month');
                    setSelectedWeek(getAppropriateStartDate('half-month'));
                  }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'half-month'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  半月表示
                </button>
                <button
                  onClick={() => {
                    setViewMode('month');
                    setSelectedWeek(getAppropriateStartDate('month'));
                  }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'month'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  月表示
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  店舗選択
                </label>
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                >
                  {stores.length === 0 ? (
                    <option value="">店舗を読み込み中...</option>
                  ) : (
                    stores.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {viewMode === 'week' ? '週選択（月曜日開始）' : 
                   viewMode === 'half-month' ? '半月選択（開始日）' : 
                   '月選択'}
                </label>
                <input
                  type={viewMode === 'month' ? 'month' : 'date'}
                  value={viewMode === 'month' ? selectedWeek.substring(0, 7) : selectedWeek}
                  onChange={(e) => {
                    if (viewMode === 'month') {
                      setSelectedWeek(e.target.value + '-01');
                    } else {
                      setSelectedWeek(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
              <div className="flex items-end">
                <Button variant="secondary" fullWidth disabled={loading || saving}>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  前期間コピー
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* シフト表 */}
        <Card>
          <CardHeader>
            <CardTitle>{selectedStoreData?.name} - シフト表</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-3 bg-yellow-50 rounded-xl">
              <h4 className="font-medium text-yellow-900 mb-1">操作方法</h4>
              <p className="text-sm text-yellow-800">
                各セルをクリックしてシフトを追加・編集できます。色分け：🔴不足 / 🟢適正 / 🔵過剰
                {viewMode === 'month' && (
                  <><br />月表示では横スクロールで全日程を確認できます。</>
                )}
              </p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: viewMode === 'month' ? '2000px' : 'auto' }}>
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left p-3 font-medium text-gray-900 bg-gray-50 sticky left-0 z-10">時間帯</th>
                    {displayDates.map((date, index) => (
                      <th key={index} className={`text-center p-2 font-medium text-gray-900 bg-gray-50 ${
                        viewMode === 'month' ? 'min-w-24' : 'min-w-36'
                      }`}>
                        <div>
                          {date.toLocaleDateString('ja-JP', { 
                            month: viewMode === 'month' ? 'numeric' : 'short', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {date.toLocaleDateString('ja-JP', { weekday: 'short' })}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map((timeSlot) => (
                    <tr key={timeSlot.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 bg-gray-50 sticky left-0 z-10">
                        <div className="font-medium text-gray-900">{timeSlot.name}</div>
                        <div className="text-xs text-gray-500">{timeSlot.time}</div>
                      </td>
                      {displayDates.map((date, dayIndex) => {
                        try {
                          const dateString = date.toISOString().split('T')[0];
                          const dayShifts = getShiftForSlot(dateString, timeSlot.id);
                          const required = getRequiredStaff(date.getDay(), timeSlot.id);
                          const current = dayShifts ? dayShifts.length : 0;
                          
                          // 人数過不足による色分け
                          let cellStyle = '';
                          if (current < required) {
                            cellStyle = 'border-red-300 bg-red-50';
                          } else if (current > required) {
                            cellStyle = 'border-blue-300 bg-blue-50';
                          } else if (current === required && required > 0) {
                            cellStyle = 'border-green-300 bg-green-50';
                          } else {
                            cellStyle = 'border-gray-200 bg-gray-50';
                          }
                          
                          return (
                            <td key={dayIndex} className="p-2">
                              <div 
                                className={`min-h-28 border-2 rounded-xl p-2 cursor-pointer hover:shadow-md transition-all ${cellStyle}`}
                                onClick={() => handleCellClick(dateString, timeSlot.id, date.getDay())}
                              >
                                {/* 必要人数表示 */}
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium text-gray-600">
                                    {current}/{required}人
                                  </span>
                                  {current !== required && (
                                    <span className="text-xs">
                                      {current < required ? '🔴' : '🔵'}
                                    </span>
                                  )}
                                </div>
                                
                                {/* スタッフ表示 */}
                                <div className="space-y-1">
                                  {dayShifts && dayShifts.map((shift) => {
                                    try {
                                      const user = users.find(u => u.id === shift.userId);
                                      const pattern = shiftPatterns.find(p => p.id === shift.patternId);
                                      
                                      if (!user || !pattern) {
                                        return null;
                                      }

                                      // 確定済みシフトかどうかを判定
                                      const isConfirmed = shift.status === 'confirmed';
                                      
                                      // 代打募集状況をチェック
                                      const emergencyRequest = getEmergencyRequestForShift(shift.id);
                                      const isEmergencyRequested = !!emergencyRequest;
                                      
                                      return (
                                        <div key={shift.id} className="relative group">
                                          <div
                                            className={`text-xs p-1.5 rounded-lg text-white font-medium flex items-center justify-between relative ${
                                              isConfirmed ? 'ring-2 ring-yellow-400' : ''
                                            } ${
                                              isEmergencyRequested ? 'ring-2 ring-red-500 ring-dashed' : ''
                                            }`}
                                            style={{ backgroundColor: pattern.color || '#6B7280' }}
                                            onContextMenu={(e) => {
                                              // Shift型をDatabaseShift型に変換
                                              const dbShift: DatabaseShift = {
                                                id: shift.id,
                                                user_id: shift.userId,
                                                store_id: shift.storeId,
                                                date: shift.date,
                                                shift_pattern_id: shift.patternId,
                                                status: shift.status as 'draft' | 'confirmed' | 'completed',
                                                notes: shift.notes,
                                                created_at: '',
                                                updated_at: ''
                                              };
                                              handleShiftRightClick(e, dbShift);
                                            }}
                                          >
                                            <span className="truncate flex items-center">
                                              {user.name || '不明'}
                                              {isConfirmed && (
                                                <span className="ml-1 text-yellow-300">✓</span>
                                              )}
                                              {isEmergencyRequested && (
                                                <span className="ml-1 text-red-300">
                                                  🆘{emergencyRequest?.emergency_volunteers?.length || 0}
                                                </span>
                                              )}
                                            </span>
                                            {!isConfirmed && !isEmergencyRequested && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteShift(shift.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 hover:bg-black hover:bg-opacity-20 rounded"
                                              >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                              </button>
                                            )}
                                          </div>
                                          <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-between">
                                            <span>
                                              {pattern.startTime || '00:00'}-{pattern.endTime || '00:00'}
                                            </span>
                                            <div className="flex items-center space-x-1">
                                              {isEmergencyRequested && (
                                                <span className="text-red-600 font-medium text-xs">代打募集中</span>
                                              )}
                                            </div>
                                          </div>
                                          
                                          {/* 代打募集バッジ */}
                                          {isEmergencyRequested && (
                                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 py-0.5 rounded-full">
                                              募集中
                                            </div>
                                          )}
                                        </div>
                                      );
                                    } catch (error) {
                                      console.error('Error rendering shift:', error);
                                      return null;
                                    }
                                  })}
                                </div>
                                
                                {/* 追加ボタン */}
                                <div className="mt-2">
                                  <div className="w-full text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg py-2 text-center hover:border-gray-400 hover:text-gray-600 transition-colors">
                                    + スタッフ追加
                                  </div>
                                </div>
                              </div>
                            </td>
                          );
                        } catch (error) {
                          console.error('Error rendering table cell:', error);
                          return (
                            <td key={dayIndex} className="p-2">
                              <div className="min-h-28 border-2 rounded-xl p-2 bg-gray-100">
                                <div className="text-xs text-red-500">エラー</div>
                              </div>
                            </td>
                          );
                        }
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* シフトパターン凡例 */}
        <Card>
          <CardHeader>
            <CardTitle>シフトパターン凡例</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {shiftPatterns.map((pattern) => (
                <div key={pattern.id} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: pattern.color }}
                  />
                  <div>
                    <div className="font-medium text-gray-900">{pattern.name}</div>
                    <div className="text-xs text-gray-500">
                      {pattern.startTime}-{pattern.endTime}
                      {pattern.breakTime && ` (休憩${pattern.breakTime}分)`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* シフト追加モーダル */}
        {isModalOpen && modalData && (
          <div 
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setIsModalOpen(false)}
          >
            <div 
              className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">シフト追加</h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">
                    {new Date(modalData.date).toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long'
                    })}
                  </p>
                  <p className="text-sm text-gray-500">
                    {timeSlots.find(ts => ts.id === modalData.timeSlot)?.name} 
                    ({timeSlots.find(ts => ts.id === modalData.timeSlot)?.time})
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    スタッフ選択 *
                  </label>
                  {staffWithConfirmedShifts.length > 0 && (
                    <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-blue-700">
                        ℹ️ この日に確定済みシフトがあるスタッフは選択肢から除外されています
                      </p>
                    </div>
                  )}
                  <select
                    value={selectedUser}
                    onChange={(e) => handleStaffSelection(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">スタッフを選択してください</option>
                    {availableStaff
                      .filter(user => !staffWithConfirmedShifts.includes(user.id)) // 確定済みシフトがあるスタッフを除外
                      .map(user => {
                      const isOnTimeOff = isStaffOnTimeOff(user.id, modalData.date);
                        
                      return (
                        <option 
                          key={user.id} 
                          value={user.id} 
                          disabled={isOnTimeOff}
                          style={isOnTimeOff ? { color: '#9CA3AF', backgroundColor: '#F3F4F6' } : {}}
                        >
                          {user.name} ({user.skillLevel === 'veteran' ? 'ベテラン' : user.skillLevel === 'regular' ? '一般' : '研修中'})
                          {isOnTimeOff && ' [希望休承認済み]'}
                        </option>
                      );
                    })}
                  </select>
                  
                  
                  {/* 希望休承認済みスタッフの警告表示 */}
                  {availableStaff.some(user => isStaffOnTimeOff(user.id, modalData.date)) && (
                    <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <p className="text-sm text-yellow-700">
                          この日は希望休が承認されているスタッフがいます
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    シフトパターン *
                  </label>
                  <select
                    value={selectedPattern}
                    onChange={(e) => setSelectedPattern(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">パターンを選択してください</option>
                    {shiftPatterns.map(pattern => (
                      <option key={pattern.id} value={pattern.id}>
                        {pattern.name} ({pattern.startTime}-{pattern.endTime})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 勤怠ルール警告表示 */}
                {selectedUser && selectedPattern && modalData && (() => {
                  const warnings = checkWorkRuleViolations(selectedUser, modalData.date, selectedPattern);
                  return warnings.length > 0 ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start">
                        <svg className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-red-800 mb-1">勤怠ルール警告</p>
                          <ul className="text-sm text-red-700 space-y-1">
                            {warnings.map((warning, index) => (
                              <li key={index}>• {warning}</li>
                            ))}
                          </ul>
                          <p className="text-xs text-red-600 mt-2">
                            ※ 警告が表示されてもシフトの保存は可能ですが、労働基準法の遵守をお勧めします
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}

                {selectedUser && selectedPattern && (
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <h4 className="font-medium text-blue-900 mb-1">プレビュー</h4>
                    <div className="text-sm text-blue-800">
                      {users.find(u => u.id === selectedUser)?.name} - {' '}
                      {shiftPatterns.find(p => p.id === selectedPattern)?.name}
                      <br />
                      勤務時間: {(() => {
                        const pattern = shiftPatterns.find(p => p.id === selectedPattern);
                        if (!pattern) return '0時間';
                        const start = pattern.startTime.split(':').map(Number);
                        const end = pattern.endTime.split(':').map(Number);
                        const hours = (end[0] * 60 + end[1] - start[0] * 60 - start[1] - (pattern.breakTime || 0)) / 60;
                        return `${hours}時間`;
                      })()}
                      <br />
                      時給: ¥{selectedUser ? calculateHourlyWage(users.find(u => u.id === selectedUser)?.skillLevel || 'training') : 0}
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    variant="secondary"
                    onClick={() => setIsModalOpen(false)}
                    disabled={saving}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleAddShift}
                    disabled={!selectedUser || !selectedPattern || saving}
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        追加中...
                      </>
                    ) : (
                      '追加'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 右クリックメニュー */}
        {contextMenu.show && (
          <div 
            className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => contextMenu.shift && handleOpenEmergencyModal(contextMenu.shift)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
            >
              <svg className="w-4 h-4 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              代打募集
            </button>
          </div>
        )}

        {/* 代打募集モーダル */}
        {emergencyModal.show && emergencyModal.shift && (
          <div 
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setEmergencyModal({ show: false, shift: null })}
          >
            <div 
              className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">代打募集</h3>
                <button
                  onClick={() => setEmergencyModal({ show: false, shift: null })}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">対象シフト</p>
                  <p className="font-medium text-gray-900">
                    {emergencyModal.shift && users.find(u => u.id === emergencyModal.shift!.user_id)?.name} - {' '}
                    {emergencyModal.shift && shiftPatterns.find(p => p.id === emergencyModal.shift!.shift_pattern_id)?.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {emergencyModal.shift && new Date(emergencyModal.shift.date).toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long'
                    })}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    募集理由 *
                  </label>
                  <textarea
                    value={emergencyReason}
                    onChange={(e) => setEmergencyReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="代打募集の理由を入力してください（例：急用のため、体調不良のため）"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    variant="secondary"
                    onClick={() => setEmergencyModal({ show: false, shift: null })}
                    disabled={submittingEmergency}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleCreateEmergencyRequest}
                    disabled={!emergencyReason.trim() || submittingEmergency}
                  >
                    {submittingEmergency ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        募集開始中...
                      </>
                    ) : (
                      '募集開始'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 応募者管理モーダル */}
        {emergencyManagement.show && emergencyManagement.request && (
          <div 
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setEmergencyManagement({ show: false, request: null })}
          >
            <div 
              className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">代打募集管理</h3>
                <button
                  onClick={() => setEmergencyManagement({ show: false, request: null })}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 募集情報 */}
              <div className="p-4 bg-gray-50 rounded-lg mb-6">
                <h4 className="font-medium text-gray-900 mb-2">募集内容</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">店舗</p>
                    <p className="font-medium">{emergencyManagement.request.stores?.name || '不明な店舗'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">日時</p>
                    <p className="font-medium">
                      {new Date(emergencyManagement.request.date).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long'
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">シフト</p>
                    <p className="font-medium">
                      {emergencyManagement.request.shift_patterns?.name || '不明なシフト'} 
                      ({emergencyManagement.request.shift_patterns?.startTime || '00:00'}-{emergencyManagement.request.shift_patterns?.endTime || '00:00'})
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">元の担当者</p>
                    <p className="font-medium">{emergencyManagement.request.original_user?.name || '不明なユーザー'}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-gray-600">理由</p>
                  <p className="font-medium">{emergencyManagement.request.reason}</p>
                </div>
              </div>

              {/* 応募者一覧 */}
              <div>
                <h4 className="font-medium text-gray-900 mb-4">
                  応募者一覧 ({emergencyManagement.request.emergency_volunteers?.length || 0}名)
                </h4>
                
                {emergencyManagement.request.emergency_volunteers && emergencyManagement.request.emergency_volunteers.length > 0 ? (
                  <div className="space-y-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {emergencyManagement.request.emergency_volunteers.map((volunteer: any) => (
                      <div key={volunteer.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 font-medium text-sm">
                                {volunteer.users?.name?.charAt(0) || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{volunteer.users?.name || '不明なユーザー'}</p>
                              <p className="text-sm text-gray-500">
                                {volunteer.users?.skill_level === 'veteran' ? 'ベテラン' :
                                 volunteer.users?.skill_level === 'regular' ? '一般' : '研修中'}
                              </p>
                              <p className="text-xs text-gray-400">
                                応募日時: {new Date(volunteer.responded_at).toLocaleString('ja-JP')}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={() => handleVolunteerAction(emergencyManagement.request.id, volunteer.id, 'accept')}
                              disabled={processingVolunteer === volunteer.id}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {processingVolunteer === volunteer.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                  確定中...
                                </>
                              ) : (
                                '採用'
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleVolunteerAction(emergencyManagement.request.id, volunteer.id, 'reject')}
                              disabled={processingVolunteer === volunteer.id}
                              className="border-red-300 text-red-600 hover:bg-red-50"
                            >
                              削除
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="text-lg font-medium mb-2">応募者がいません</p>
                    <p className="text-sm">まだ誰も応募していません。しばらくお待ちください。</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-6">
                <Button
                  variant="secondary"
                  onClick={() => setEmergencyManagement({ show: false, request: null })}
                >
                  閉じる
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
} 

export default function ShiftCreatePage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <ShiftCreatePageInner />
    </Suspense>
  );
}