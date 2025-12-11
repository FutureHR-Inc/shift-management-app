'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnimatedToggle } from '@/components/ui/AnimatedToggle';
import { CompactTimeSlider } from '@/components/ui/CompactTimeSlider';
import type { Shift, DatabaseShift, DatabaseUser, DatabaseEmergencyRequest, UserStore, ContextMenu, EmergencyModal, TimeSlot, DatabaseFixedShift, ApiUser } from '@/lib/types';
import { DesktopShiftTable } from '@/components/shift/DesktopShiftTable';
import { MobileShiftTable } from '@/components/shift/MobileShiftTable';

interface ShiftModalData {
  date: string;
  timeSlot: string;
  dayIndex: number;
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
  // 日付をYYYY-MM-DD形式の文字列に変換（タイムゾーンの影響を受けない）
  const formatDateString = (year: number, month: number, day: number): string => {
    const monthStr = String(month + 1).padStart(2, '0'); // monthは0-11なので+1
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  };

  // 指定された日が含まれる週の月曜日を取得する関数（タイムゾーンに依存しない）
  const getWeekMonday = (date: string | Date): string => {
    let year: number, month: number, day: number;
    
    if (typeof date === 'string') {
      // 文字列の場合は直接パース
      const [yearStr, monthStr, dayStr] = date.split('-');
      year = parseInt(yearStr);
      month = parseInt(monthStr) - 1; // JavaScriptの月は0-11
      day = parseInt(dayStr);
    } else {
      // Dateオブジェクトの場合はローカル時間で取得
      year = date.getFullYear();
      month = date.getMonth();
      day = date.getDate();
    }
    
    // 日付から曜日を計算
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay(); // 0=日曜日, 1=月曜日, ...
    
    // 月曜日を0として計算（日曜日の場合は前週の月曜日）
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    // 月曜日の日付を計算
    const mondayDate = new Date(year, month, day + daysToMonday);
    
    return formatDateString(
      mondayDate.getFullYear(),
      mondayDate.getMonth(),
      mondayDate.getDate()
    );
  };

  // 指定された日が含まれる週の日曜日を取得する関数
  const getWeekSunday = (date: string | Date): string => {
    const mondayStr = getWeekMonday(date);
    const [yearStr, monthStr, dayStr] = mondayStr.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1;
    const day = parseInt(dayStr);
    
    const sundayDate = new Date(year, month, day + 6);
    return formatDateString(
      sundayDate.getFullYear(),
      sundayDate.getMonth(),
      sundayDate.getDate()
    );
  };

  // 今週の月曜日を取得する関数（今日が含まれる週の月曜日）
  const getCurrentWeekMonday = () => {
    const today = new Date();
    return getWeekMonday(today);
  };

  // 表示期間モードに応じた適切な開始日を取得
  const getAppropriateStartDate = (mode: 'week' | 'half-month' | 'month') => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const date = today.getDate();
    
    switch (mode) {
      case 'week':
        // 今日が含まれる週の月曜日を取得
        return getWeekMonday(today);
      case 'half-month':
        // 1-15日と16日-月末で分割
        if (date <= 15) {
          return formatDateString(year, month, 1);
        } else {
          return formatDateString(year, month, 16);
        }
      case 'month':
        // 月の1日
        return formatDateString(year, month, 1);
      default:
        return formatDateString(year, month, date);
    }
  };

  // データベースから取得するstate
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]); // shiftPatterns から timeSlots に変更
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [approvedTimeOffRequests, setApprovedTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [fixedShifts, setFixedShifts] = useState<DatabaseFixedShift[]>([]);
  const [fixedShiftExceptions, setFixedShiftExceptions] = useState<Array<{ fixed_shift_id: string; date: string }>>([]);
  
  // UI state
  const [currentUser, setCurrentUser] = useState<any>(null); // 現在のユーザー情報
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedWeek, setSelectedWeek] = useState(() => getCurrentWeekMonday()); // 今週の月曜日
  const [viewMode, setViewMode] = useState<'week' | 'half-month' | 'month'>('month'); // 表示期間モード（デフォルトを月表示に変更）
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<ShiftModalData | null>(null);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(''); // selectedPattern から selectedTimeSlot に変更
  
  // カスタム時間調整関連のstate
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');

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
  
  // カスタム時間設定用のstate
  const [customApprovalTime, setCustomApprovalTime] = useState({
    volunteerId: '',
    startTime: '',
    endTime: '',
    showCustomTime: false
  });

  // 確定シフト閲覧モーダル用のstate
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewModalViewMode, setViewModalViewMode] = useState<'week' | 'half-month' | 'month'>('month');
  const [viewModalSelectedWeek, setViewModalSelectedWeek] = useState(() => getAppropriateStartDate('month'));

  const router = useRouter();
  const searchParams = useSearchParams();

  // ユーザー情報を取得・同期する関数
  const loadCurrentUser = async () => {
    const userData = localStorage.getItem('currentUser');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setCurrentUser(user);
      } catch (error) {
        console.error('Failed to parse user data:', error);
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
  };

  // データ取得関数
  const fetchStores = async () => {
    if (!currentUser) {
      console.log('currentUser not available, skipping store fetch');
      return [];
    }
    
    try {
      const response = await fetch(`/api/stores?current_user_id=${currentUser.id}`);
      if (!response.ok) throw new Error('店舗データの取得に失敗しました');
      const result = await response.json();
      
      // API responseをApiStore型に変換し、必要な構造を確保（workRulesを含む）
      const storesData = result.data?.map((store: { 
        id: string; 
        name: string; 
        required_staff?: Record<string, Record<string, number>>; 
        work_rules?: {
          max_weekly_hours?: number;
          max_consecutive_days?: number;
          min_rest_hours?: number;
        };
        user_stores?: { is_flexible: boolean; user_id: string }[] 
      }) => ({
        id: store.id,
        name: store.name,
        requiredStaff: store.required_staff || {},
        workRules: store.work_rules ? {
          maxWeeklyHours: store.work_rules.max_weekly_hours || 28,
          maxConsecutiveDays: store.work_rules.max_consecutive_days || 7,
          minRestHours: store.work_rules.min_rest_hours || 11
        } : null, // workRulesフィールドを適切にマッピング
        flexibleStaff: store.user_stores?.filter((us: { is_flexible: boolean }) => us.is_flexible).map((us: { user_id: string }) => us.user_id) || []
      })) || [];
      
      // デバッグ: workRulesデータの確認
      console.log('🔍 [fetchStores] 取得した店舗データ:', storesData);
      storesData.forEach((store: { name: string; workRules?: { maxWeeklyHours: number; maxConsecutiveDays: number; minRestHours: number } }) => {
        if (store.workRules) {
          console.log(`🔍 [fetchStores] 店舗 ${store.name} の勤怠ルール:`, store.workRules);
        } else {
          console.log(`🔍 [fetchStores] 店舗 ${store.name}: 勤怠ルール未設定`);
        }
      });
      
      return storesData;
    } catch (error) {
      console.error('Error fetching stores:', error);
      throw error;
    }
  };

  const fetchUsers = async () => {
    if (!currentUser) {
      console.log('currentUser not available, skipping users fetch');
      return [];
    }
    
    try {
      const response = await fetch(`/api/users?current_user_id=${currentUser.id}`);
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
        hourlyWage: user.hourly_wage, // DB上の時給データを追加
        memo: user.memo,
        stores: user.user_stores?.map((us: UserStore) => us.store_id) || []
      })) || [];
      
      return usersWithStores;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  };

  const fetchTimeSlots = async (storeId: string) => {
    try {
      const response = await fetch(`/api/time-slots?store_id=${storeId}`);
      if (!response.ok) throw new Error('時間帯データの取得に失敗しました');
      const result = await response.json();
      
      return result.data || [];
    } catch (error) {
      console.error('Error fetching time slots:', error);
      throw error;
    }
  };

  const fetchFixedShifts = async (storeId: string) => {
    try {
      // 固定シフトは期間制限なしで恒常的に取得
      const response = await fetch(`/api/fixed-shifts?store_id=${storeId}&is_active=true`);
      if (!response.ok) throw new Error('固定シフトデータの取得に失敗しました');
      const result = await response.json();
      
      const fixedShifts = result.data || [];
      console.log('🔍 [ShiftCreate] 固定シフト取得:');
      console.log('  - 店舗ID:', storeId);
      console.log('  - 取得件数:', fixedShifts.length);
      console.log('  - 固定シフト一覧:', fixedShifts);
      
      return fixedShifts;
    } catch (error) {
      console.error('Error fetching fixed shifts:', error);
      // 固定シフトのエラーは致命的ではないので、空配列を返す
      return [];
    }
  };

  const fetchFixedShiftExceptions = async (startDate: string, endDate: string) => {
    try {
      const response = await fetch(`/api/fixed-shift-exceptions?date_from=${startDate}&date_to=${endDate}`);
      if (!response.ok) throw new Error('固定シフト例外データの取得に失敗しました');
      const result = await response.json();
      
      const exceptions = result.data || [];
      console.log('🔍 [ShiftCreate] 固定シフト例外取得:');
      console.log('  - 期間:', startDate, '～', endDate);
      console.log('  - 取得件数:', exceptions.length);
      
      return exceptions.map((ex: any) => ({
        fixed_shift_id: ex.fixed_shift_id,
        date: ex.date
      }));
    } catch (error) {
      console.error('Error fetching fixed shift exceptions:', error);
      // 例外のエラーは致命的ではないので、空配列を返す
      return [];
    }
  };

  const fetchShifts = async (storeId: string, startDate: string, endDate?: string) => {
    try {
      const actualEndDate = endDate || (() => {
        const weekEnd = new Date(startDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return weekEnd.toISOString().split('T')[0];
      })();
      
      // キャッシュ制御を追加
      const response = await fetch(
        `/api/shifts?storeId=${storeId}&startDate=${startDate}&endDate=${actualEndDate}`,
        {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }
      );
      if (!response.ok) throw new Error('シフトデータの取得に失敗しました');
      const result = await response.json();
      
      // デバッグ: 生のAPIレスポンス確認
      console.log('🔍 [fetchShifts] 🔥 生のAPIレスポンス:', result);
      console.log('🔍 [fetchShifts] 🔥 データ件数:', result.data?.length || 0);
      if (result.data && result.data.length > 0) {
        console.log('🔍 [fetchShifts] 🔥 最初のシフトの生データ:', result.data[0]);
      }
      
      // API response を Shift 型に変換（カスタム時間を含む）
      const shifts = result.data?.map((shift: { 
        id: string; 
        user_id: string; 
        store_id: string; 
        date: string; 
        time_slot_id?: string;
        pattern_id?: string; // 旧フィールド（移行期間のため）
        custom_start_time?: string;
        custom_end_time?: string;
        status: string; 
        notes?: string 
      }) => {
        // デバッグ: カスタム時間のマッピング確認（全シフト）
        console.log(`🔍 [fetchShifts] 🔥 シフトマッピング ${shift.id}:`, {
          id: shift.id,
          user_id: shift.user_id,
          date: shift.date,
          status: shift.status,
          custom_start_time: shift.custom_start_time,
          custom_end_time: shift.custom_end_time,
          mapped_customStartTime: shift.custom_start_time,
          mapped_customEndTime: shift.custom_end_time,
          hasCustomTime: !!(shift.custom_start_time && shift.custom_end_time)
        });
        
        return {
          id: shift.id,
          userId: shift.user_id,
          storeId: shift.store_id,
          date: shift.date,
          timeSlotId: shift.time_slot_id || shift.pattern_id, // 新旧両対応
          customStartTime: shift.custom_start_time, // nullもそのまま保持
          customEndTime: shift.custom_end_time,   // nullもそのまま保持
          status: shift.status,
          notes: shift.notes
        };
      }) || [];
      
      // デバッグ: 最終的にセットされるshifts配列の確認
      console.log('🔍 [fetchShifts] 🎯 最終shifts配列:', shifts);
      console.log('🔍 [fetchShifts] 🎯 カスタム時間を持つシフト:', 
        shifts.filter((s: { customStartTime?: string; customEndTime?: string }) => s.customStartTime || s.customEndTime)
      );
      
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
      if (!currentUser?.id) {
        console.error('Current user not found');
        return [];
      }

      const actualEndDate = endDate || (() => {
        const weekEnd = new Date(startDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return weekEnd.toISOString().split('T')[0];
      })();
      
      const url = `/api/emergency-requests?store_id=${storeId}&date_from=${startDate}&date_to=${actualEndDate}&current_user_id=${currentUser.id}`;
      console.log('Fetching emergency requests from:', url, { currentUserId: currentUser.id });
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API response error:', response.status, errorText);
        throw new Error(`代打募集データの取得に失敗しました (${response.status})`);
      }
      
      const result = await response.json();
      console.log('Emergency requests fetched:', result);
      
      return result.data || [];
    } catch (error) {
      console.error('Error fetching emergency requests:', error);
      return [];
    }
  };

  // currentUser初期化
  useEffect(() => {
    loadCurrentUser();
  }, []);

  // 固定シフト更新イベントの監視
  useEffect(() => {
    const handleFixedShiftUpdate = (event: CustomEvent | StorageEvent) => {
      console.log('固定シフト更新を検知（シフト作成）:', event);
      // 固定シフトデータを再取得
      if (currentUser && selectedStore) {
        loadStoreData(selectedStore);
      }
    };

    // 同一タブ内のイベント監視
    window.addEventListener('fixedShiftUpdated', handleFixedShiftUpdate as EventListener);
    
    // 別タブからのストレージイベント監視
    window.addEventListener('storage', (event) => {
      if (event.key === 'fixedShiftUpdate') {
        handleFixedShiftUpdate(event);
      }
    });

    return () => {
      window.removeEventListener('fixedShiftUpdated', handleFixedShiftUpdate as EventListener);
      window.removeEventListener('storage', handleFixedShiftUpdate);
    };
  }, [currentUser, selectedStore]);

  // 初期データ読み込み（currentUserがセットされてから）
  useEffect(() => {
    if (!currentUser) return; // currentUserが読み込まれるまで待機
    
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [storesData, usersData] = await Promise.all([
          fetchStores(),
          fetchUsers()
        ]);
        
        setStores(storesData);
        setUsers(usersData);
        
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
  }, [currentUser, searchParams]);

  // ユーザーデータ更新イベントの監視（スタッフ管理ページで時給更新時など）
  useEffect(() => {
    if (!currentUser) return;

    const handleUserDataUpdate = async () => {
      try {
        console.log('🔄 [ShiftCreate] ユーザーデータ更新イベント検知 - ユーザーデータを再取得します');
        const usersData = await fetchUsers();
        setUsers(usersData);
        console.log('✅ [ShiftCreate] ユーザーデータ再取得完了（イベント経由）');
      } catch (error) {
        console.error('❌ [ShiftCreate] ユーザーデータ再取得エラー:', error);
      }
    };

    // 同一タブ内のイベント監視
    window.addEventListener('userDataUpdated', handleUserDataUpdate as EventListener);
    
    // 別タブからのストレージイベント監視
    window.addEventListener('storage', (event) => {
      if (event.key === 'userDataUpdate') {
        handleUserDataUpdate();
      }
    });

    return () => {
      window.removeEventListener('userDataUpdated', handleUserDataUpdate as EventListener);
    };
  }, [currentUser]);

  // ページフォーカス時にユーザーデータを再取得（時給更新を反映）
  useEffect(() => {
    if (!currentUser) return;

    const handleVisibilityChange = async () => {
      // ページが表示されたとき（フォーカスされたとき）にユーザーデータを再取得
      if (document.visibilityState === 'visible') {
        try {
          console.log('🔄 [ShiftCreate] ページフォーカス検知 - ユーザーデータを再取得します');
          const usersData = await fetchUsers();
          setUsers(usersData);
          console.log('✅ [ShiftCreate] ユーザーデータ再取得完了');
        } catch (error) {
          console.error('❌ [ShiftCreate] ユーザーデータ再取得エラー:', error);
        }
      }
    };

    // visibilitychangeイベントを監視
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // ページフォーカス時にも再取得（別タブから戻ってきたとき）
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [currentUser]);

  // 店舗データ（時間帯・固定シフト）を読み込む
  const loadStoreData = async (storeId: string) => {
    try {
      const [timeSlotsData, fixedShiftsData] = await Promise.all([
        fetchTimeSlots(storeId),
        fetchFixedShifts(storeId)
      ]);
      setTimeSlots(timeSlotsData);
      setFixedShifts(fixedShiftsData);
      console.log('🔍 [loadStoreData] 店舗データ読み込み完了:', {
        storeId,
        timeSlotsCount: timeSlotsData.length,
        fixedShiftsCount: fixedShiftsData.length
      });
    } catch (error) {
      console.error('Error loading store data:', error);
      setError('店舗データの読み込みに失敗しました');
    }
  };

  // 店舗変更時に時間帯データと固定シフトを取得
  useEffect(() => {
    if (selectedStore) {
      loadStoreData(selectedStore);
    }
  }, [selectedStore]);

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
          
          // 並列でデータを取得
          const [shiftsData, timeOffData, emergencyData, exceptionsData] = await Promise.all([
            fetchShifts(selectedStore, startDate, endDate),
            fetchApprovedTimeOffRequests(startDate, endDate),
            fetchEmergencyRequests(selectedStore, startDate, endDate),
            fetchFixedShiftExceptions(startDate, endDate)
          ]);
          
          setFixedShiftExceptions(exceptionsData);

          // シフトデータを種類でソート
          const sortedShifts = shiftsData.sort((a: DatabaseShift, b: DatabaseShift) => {
            // まず種類でソート（固定 → 確定 → 下書き）
            const getTypeOrder = (shift: DatabaseShift) => {
              if (shift.isFixedShift) return 0;
              if (shift.status === 'confirmed') return 1;
              return 2;
            };
            
            const typeOrderA = getTypeOrder(a);
            const typeOrderB = getTypeOrder(b);
            
            if (typeOrderA !== typeOrderB) {
              return typeOrderA - typeOrderB;
            }
            
            // 同じ種類の場合は日付と時間でソート
            const dateCompare = a.date.localeCompare(b.date);
            if (dateCompare !== 0) return dateCompare;
            
            const timeSlotA = timeSlots.find(ts => ts.id === a.time_slot_id);
            const timeSlotB = timeSlots.find(ts => ts.id === b.time_slot_id);
            
            if (timeSlotA && timeSlotB) {
              return timeSlotA.start_time.localeCompare(timeSlotB.start_time);
            }
            
            return 0;
          });

          // 一括でステート更新
          setShifts(sortedShifts);
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
  }, [selectedStore, selectedWeek, stores, viewMode, timeSlots]); // timeSlots を依存配列に追加

  // 表示期間に応じた日付を生成
  const getDisplayDates = (startDate: string, mode: 'week' | 'half-month' | 'month') => {
    const dates = [];
    
    // 日付文字列を 'YYYY-MM-DD' 形式で解析（タイムゾーンの影響を受けないように）
    const [yearStr, monthStr, dayStr] = startDate.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1; // JavaScriptの月は0-11
    const day = parseInt(dayStr);
    
    // 月の最終日を取得（タイムゾーンの影響を受けないように）
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    switch (mode) {
      case 'week':
        // 選択された日が含まれる週の月曜日から日曜日まで
        const weekMonday = getWeekMonday(startDate);
        const [mondayYearStr, mondayMonthStr, mondayDayStr] = weekMonday.split('-');
        const mondayYear = parseInt(mondayYearStr);
        const mondayMonth = parseInt(mondayMonthStr) - 1; // JavaScriptの月は0-11
        const mondayDay = parseInt(mondayDayStr);
        
        // 月曜日から日曜日まで（7日間）
        for (let i = 0; i < 7; i++) {
          const currentDate = new Date(Date.UTC(mondayYear, mondayMonth, mondayDay + i));
          dates.push(currentDate);
        }
        break;

      case 'half-month':
        // 1-15日または16日-月末
        const isFirstHalf = day <= 15;
        const startDay = isFirstHalf ? 1 : 16;
        const endDay = isFirstHalf ? 15 : lastDayOfMonth;
        
        for (let i = startDay; i <= endDay; i++) {
          const currentDate = new Date(Date.UTC(year, month, i));
          dates.push(currentDate);
        }
        break;

      case 'month':
        // 月の1日から月末まで
        for (let i = 1; i <= lastDayOfMonth; i++) {
          const currentDate = new Date(Date.UTC(year, month, i));
          dates.push(currentDate);
        }
        break;
    }

    return dates;
  };

  const displayDates = getDisplayDates(selectedWeek, viewMode);
  const selectedStoreData = stores.find(store => store.id === selectedStore);
  
  console.log('🔍 [ShiftCreate] 表示日付範囲:');
  console.log('  - 表示期間:', viewMode);
  console.log('  - 日付数:', displayDates.length, '日間');
  console.log('  - 開始日:', displayDates[0]?.toISOString().split('T')[0]);
  console.log('  - 終了日:', displayDates[displayDates.length - 1]?.toISOString().split('T')[0]);



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
      if (!shifts || !selectedStore || !timeSlots) {
        return [];
      }

      // 通常のシフトを取得
      const regularShifts = shifts.filter(shift => {
        if (shift.date !== date || shift.storeId !== selectedStore) return false;
        
        const pattern = timeSlots.find(ts => ts.id === timeSlot);
        if (!pattern || !pattern.start_time || !pattern.end_time) return false;

        // 時間帯の判定ロジック（time_slots ベース）
        return shift.timeSlotId === timeSlot;
      });

      // 固定シフトをチェックして追加（期間制限なし・恒常表示）
      // 日付文字列を 'YYYY-MM-DD' 形式で解析（タイムゾーンの影響を受けないように）
      const [yearStr, monthStr, dayStr] = date.split('-');
      const dayOfWeek = new Date(Date.UTC(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr))).getUTCDay();
      console.log(`🔍 [getShiftForSlot] ${date} (${dayOfWeek}曜日) - ${timeSlot}`);
      
      const fixedShiftsForSlot = fixedShifts.filter(fixedShift => 
        fixedShift.day_of_week === dayOfWeek &&
        fixedShift.time_slot_id === timeSlot &&
        fixedShift.store_id === selectedStore &&
        fixedShift.is_active
      );
      
      console.log(`  → 固定シフト候補: ${fixedShiftsForSlot.length}件`);
      fixedShiftsForSlot.forEach((fs, i) => {
        console.log(`    [${i}] ユーザー: ${fs.users?.name}, 時間帯: ${fs.time_slots?.name}, アクティブ: ${fs.is_active}`);
      });

      // 固定シフトユーザーが既に通常のシフトに入っているかチェック
      const existingUserIds = regularShifts.map(shift => shift.userId);
      
      // 固定シフト例外をチェック（この日付で例外が設定されている固定シフトを除外）
      const exceptionKeys = new Set(
        fixedShiftExceptions
          .filter(ex => ex.date === date)
          .map(ex => ex.fixed_shift_id)
      );
      
      // 固定シフトをshiftオブジェクトとして変換
      const fixedShiftsAsShifts = fixedShiftsForSlot
        .filter(fixedShift => 
          !existingUserIds.includes(fixedShift.user_id) &&
          !exceptionKeys.has(fixedShift.id) // 例外が設定されている固定シフトを除外
        )
        .map(fixedShift => ({
          id: `fixed-${fixedShift.id}`, // 固定シフト識別のためのプレフィックス
          userId: fixedShift.user_id,
          storeId: fixedShift.store_id,
          date: date,
          timeSlotId: fixedShift.time_slot_id,
          status: 'confirmed' as const, // 固定シフトは常に確定済み
          customStartTime: undefined,
          customEndTime: undefined,
          notes: '固定シフト',
          isFixedShift: true, // 固定シフトフラグ
          fixedShiftData: fixedShift // 元の固定シフトデータ
        }));

      console.log(`  → 生成された固定シフト: ${fixedShiftsAsShifts.length}件`);
      console.log(`  → 最終返却シフト数: ${regularShifts.length + fixedShiftsAsShifts.length}件 (通常: ${regularShifts.length}, 固定: ${fixedShiftsAsShifts.length})`);

      // シフトを種類と日時でソート
      const allShifts = [...regularShifts, ...fixedShiftsAsShifts].sort((a, b) => {
        // まず種類でソート（固定 → 確定 → 下書き）
        const getTypeOrder = (shift: any) => {
          if (shift.isFixedShift) return 0;
          if (shift.status === 'confirmed') return 1;
          return 2;
        };
        
        const typeOrderA = getTypeOrder(a);
        const typeOrderB = getTypeOrder(b);
        
        if (typeOrderA !== typeOrderB) {
          return typeOrderA - typeOrderB;
        }
        
        // 同じ種類の場合は時間でソート
        const timeSlotA = timeSlots.find(ts => ts.id === a.timeSlotId);
        const timeSlotB = timeSlots.find(ts => ts.id === b.timeSlotId);
        
        if (timeSlotA && timeSlotB) {
          return timeSlotA.start_time.localeCompare(timeSlotB.start_time);
        }
        
        return 0;
      });

      return allShifts;
    } catch (error) {
      console.error('Error in getShiftForSlot:', error);
      return [];
    }
  };

  // 確定済みシフトのみを取得する関数（閲覧モーダル用）
  const getConfirmedShiftsForSlot = (date: string, timeSlot: string) => {
    try {
      if (!shifts || !selectedStore || !timeSlots) {
        return [];
      }

      // 確定済みの通常シフトのみを取得
      const confirmedRegularShifts = shifts.filter(shift => {
        if (shift.date !== date || shift.storeId !== selectedStore) return false;
        if (shift.status !== 'confirmed') return false; // 確定済みのみ
        
        const pattern = timeSlots.find(ts => ts.id === timeSlot);
        if (!pattern || !pattern.start_time || !pattern.end_time) return false;

        return shift.timeSlotId === timeSlot;
      });

      // 固定シフトをチェックして追加
      const [yearStr, monthStr, dayStr] = date.split('-');
      const dayOfWeek = new Date(Date.UTC(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr))).getUTCDay();
      
      const fixedShiftsForSlot = fixedShifts.filter(fixedShift => 
        fixedShift.day_of_week === dayOfWeek &&
        fixedShift.time_slot_id === timeSlot &&
        fixedShift.store_id === selectedStore &&
        fixedShift.is_active
      );

      // 固定シフトユーザーが既に通常の確定シフトに入っているかチェック
      const existingUserIds = confirmedRegularShifts.map(shift => shift.userId);
      
      // 固定シフトをshiftオブジェクトとして変換
      const fixedShiftsAsShifts = fixedShiftsForSlot
        .filter(fixedShift => !existingUserIds.includes(fixedShift.user_id))
        .map(fixedShift => ({
          id: `fixed-${fixedShift.id}`,
          userId: fixedShift.user_id,
          storeId: fixedShift.store_id,
          date: date,
          timeSlotId: fixedShift.time_slot_id,
          status: 'confirmed' as const,
          customStartTime: undefined,
          customEndTime: undefined,
          notes: '固定シフト',
          isFixedShift: true,
          fixedShiftData: fixedShift
        }));

      // シフトを種類と日時でソート
      const allShifts = [...confirmedRegularShifts, ...fixedShiftsAsShifts].sort((a, b) => {
        const getTypeOrder = (shift: any) => {
          if (shift.isFixedShift) return 0;
          if (shift.status === 'confirmed') return 1;
          return 2;
        };
        
        const typeOrderA = getTypeOrder(a);
        const typeOrderB = getTypeOrder(b);
        
        if (typeOrderA !== typeOrderB) {
          return typeOrderA - typeOrderB;
        }
        
        const timeSlotA = timeSlots.find(ts => ts.id === a.timeSlotId);
        const timeSlotB = timeSlots.find(ts => ts.id === b.timeSlotId);
        
        if (timeSlotA && timeSlotB) {
          return timeSlotA.start_time.localeCompare(timeSlotB.start_time);
        }
        
        return 0;
      });

      return allShifts;
    } catch (error) {
      console.error('Error in getConfirmedShiftsForSlot:', error);
      return [];
    }
  };

  // 閲覧モーダル用の表示日付を計算（既存のgetDisplayDatesと同じロジックを使用）
  const getViewModalDisplayDates = useMemo(() => {
    if (!viewModalSelectedWeek) return [];
    return getDisplayDates(viewModalSelectedWeek, viewModalViewMode);
  }, [viewModalSelectedWeek, viewModalViewMode]);

  // セルクリックでモーダル開く
  const handleCellClick = async (date: string, timeSlot: string, dayIndex: number) => {
    if (!selectedStore) {
      setError('店舗を選択してください');
      return;
    }

    // シフト追加モーダルを表示
    setModalData({
      date,
      timeSlot,
      dayIndex
    });
    
    // モーダルの初期状態をリセット
    setSelectedUser('');
    setSelectedTimeSlot(timeSlot);
    setIsCustomTime(false);
    setCustomStartTime('');
    setCustomEndTime('');
    
    // 確定済みシフトのチェックを実行
    await checkAllStaffConfirmedShifts(date);
    
    setIsModalOpen(true);
  };

  // シフト追加
  const handleAddShift = async () => {
    if (!selectedUser || !selectedTimeSlot || !modalData) return;

      setSaving(true);
    try {
      // 異なる店舗への重複シフトチェック（通常シフト + 固定シフト）
      const shiftConflict = await checkStaffShiftStatus(selectedUser, modalData.date);
      
      // 異なる店舗への重複がある場合はエラー
      if (shiftConflict.hasOtherStoreConflict) {
        const conflictStores = shiftConflict.conflicts
          .filter((c: { isSameStore: boolean }) => !c.isSameStore)
          .map((c: { storeName: string }) => c.storeName)
          .join('、');
        throw new Error(`このスタッフは同日に他の店舗（${conflictStores}）でシフトが設定されています。異なる店舗への重複シフトは設定できません。`);
      }
      
      // 固定シフトの重複チェック
      const fixedShiftConflict = checkUserFixedShift(selectedUser, modalData.dayIndex, selectedTimeSlot);
      if (fixedShiftConflict) {
        throw new Error('このスタッフはこの時間帯に固定シフトが設定されています。固定シフトと重複するシフトは設定できません。');
      }
      
      // カスタム時間の値を検証
      const validateTime = (time: string) => {
        return time && time.trim() !== '' && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time) ? time : null;
      };
      
      const shiftData = {
        user_id: selectedUser,
        store_id: selectedStore,
        date: modalData.date,
        time_slot_id: selectedTimeSlot, // pattern_id から time_slot_id に変更
        status: 'draft' as const,
        custom_start_time: isCustomTime ? validateTime(customStartTime) : null,
        custom_end_time: isCustomTime ? validateTime(customEndTime) : null,
        notes: null
      };

      // デバッグ用ログ
      console.log('🚀 [handleAddShift] シフト作成データ:', {
        isCustomTime,
        customStartTime,
        customEndTime,
        validatedStart: shiftData.custom_start_time,
        validatedEnd: shiftData.custom_end_time,
        shiftData
      });

      const response = await fetch('/api/shifts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shiftData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('シフト作成エラー:', errorData);
        throw new Error(errorData.error || 'シフトの追加に失敗しました');
      }
      
      // API レスポンス確認
      const createdShift = await response.json();
      console.log('✅ [handleAddShift] 🔥 作成されたシフト詳細:', {
        createdShift,
        hasCustomTimes: !!(createdShift.data?.custom_start_time && createdShift.data?.custom_end_time),
        custom_start_time: createdShift.data?.custom_start_time,
        custom_end_time: createdShift.data?.custom_end_time
      });

      // 新しいシフトをShift型に変換して追加
      const newShift = {
        id: createdShift.data.id,
        userId: createdShift.data.user_id,
        storeId: createdShift.data.store_id,
        date: createdShift.data.date,
        timeSlotId: createdShift.data.time_slot_id,
        customStartTime: createdShift.data.custom_start_time,
        customEndTime: createdShift.data.custom_end_time,
        status: createdShift.data.status,
        notes: createdShift.data.notes
      };
      
      console.log('🔄 [handleAddShift] 新しいシフトをローカルに追加:', newShift);
      
      // 既存のシフトと新しいシフトを種類と日時でソート
      setShifts(prevShifts => {
        const updatedShifts = [...prevShifts, newShift].sort((a, b) => {
          // まず種類でソート（固定 → 確定 → 下書き）
          const getTypeOrder = (shift: any) => {
            if (shift.isFixedShift) return 0;
            if (shift.status === 'confirmed') return 1;
            return 2;
          };
          
          const typeOrderA = getTypeOrder(a);
          const typeOrderB = getTypeOrder(b);
          
          if (typeOrderA !== typeOrderB) {
            return typeOrderA - typeOrderB;
          }
          
          // 同じ種類の場合は日付と時間でソート
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          
          const timeSlotA = timeSlots.find(ts => ts.id === a.timeSlotId);
          const timeSlotB = timeSlots.find(ts => ts.id === b.timeSlotId);
          
          if (timeSlotA && timeSlotB) {
            return timeSlotA.start_time.localeCompare(timeSlotB.start_time);
          }
          
          return 0;
        });
        return updatedShifts;
      });

      // モーダルを閉じる
      handleCloseModal();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'シフトの追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // シフト削除（店長のみ確定シフトと固定シフトを削除可能）
  const handleDeleteShift = async (shiftId: string, shift?: Shift, date?: string) => {
    try {
      // 店長権限チェック
      const isManager = currentUser?.role === 'manager';
      
      // 固定シフトの削除（例外作成）
      if (shiftId.startsWith('fixed-')) {
        if (!isManager) {
          setError('固定シフトの削除は店長のみ可能です');
          return;
        }
        
        const fixedShiftId = shiftId.replace('fixed-', '');
        const targetDate = date || shift?.date;
        
        if (!targetDate) {
          setError('削除する日付が指定されていません');
          return;
        }
        
        // 固定シフト例外を作成
        const response = await fetch('/api/fixed-shift-exceptions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fixed_shift_id: fixedShiftId,
            date: targetDate
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '固定シフト例外の作成に失敗しました');
        }

        // 例外データを再取得
        if (selectedStore && selectedWeek) {
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
          
          const exceptionsData = await fetchFixedShiftExceptions(startDate, endDate);
          setFixedShiftExceptions(exceptionsData);
        }
        
        // マイシフト画面に通知（固定シフト例外作成時）
        window.dispatchEvent(new CustomEvent('shiftUpdated', {
          detail: { 
            action: 'fixed_shift_exception_created',
            date: targetDate,
            fixedShiftId: fixedShiftId
          }
        }));
        
        // ブラウザストレージ経由での通知（別タブ対応）
        const timestamp = Date.now();
        localStorage.setItem('shiftUpdate', JSON.stringify({
          action: 'fixed_shift_exception_created',
          date: targetDate,
          fixedShiftId: fixedShiftId,
          timestamp: timestamp
        }));
        setTimeout(() => localStorage.removeItem('shiftUpdate'), 100);
        
        return;
      }
      
      // 通常シフトの削除
      const shiftToDelete = shift || shifts.find(s => s.id === shiftId);
      
      // 確定済みシフトの削除は店長のみ可能
      if (shiftToDelete && shiftToDelete.status === 'confirmed') {
        if (!isManager) {
          setError('確定済みのシフトの削除は店長のみ可能です');
          return;
        }
      }

      const response = await fetch(`/api/shifts/${shiftId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'シフトの削除に失敗しました');
      }

      // データを再取得
      if (selectedStore && selectedWeek) {
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
        
        const updatedShifts = await fetchShifts(selectedStore, startDate, endDate);
        setShifts(updatedShifts);
      }
      
      // マイシフト画面に通知（通常シフト削除時）
      window.dispatchEvent(new CustomEvent('shiftUpdated', {
        detail: { 
          action: 'shift_deleted',
          shiftId: shiftId
        }
      }));
      
      // ブラウザストレージ経由での通知（別タブ対応）
      const timestamp = Date.now();
      localStorage.setItem('shiftUpdate', JSON.stringify({
        action: 'shift_deleted',
        shiftId: shiftId,
        timestamp: timestamp
      }));
      setTimeout(() => localStorage.removeItem('shiftUpdate'), 100);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'シフトの削除に失敗しました');
    }
  };

  // 個別シフト確定
  const handleConfirmSingleShift = async (shiftId: string) => {
    try {
      setSaving(true);
      
      // 個別シフトの更新は /api/shifts/[id] エンドポイントを使用
      const response = await fetch(`/api/shifts/${shiftId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'confirmed'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'シフトの確定に失敗しました');
      }

      const result = await response.json();
      console.log('📦 [SHIFT CONFIRM SINGLE] APIレスポンス:', {
        result,
        shiftId: shiftId
      });

      // バックグラウンドで完全なデータを再取得
      if (selectedStore && selectedWeek) {
        console.log('🔄 [handleConfirmSingleShift] バックグラウンドでデータ更新開始');
        fetchShifts(selectedStore, selectedWeek).then(updatedShifts => {
          console.log('🔄 [handleConfirmSingleShift] バックグラウンド更新完了:', updatedShifts.length + '件');
          setShifts(updatedShifts);
        }).catch(error => {
          console.error('バックグラウンド更新エラー:', error);
        });
      }
      
      // ナビゲーションの通知件数を更新
      window.dispatchEvent(new CustomEvent('updateShiftConfirmations'));
      
      // ダッシュボードを自動更新（データベースの更新が反映されるまで少し待機）
      const shiftDate = result.data?.date || new Date().toISOString().split('T')[0];
      console.log('🔄 [SHIFT CONFIRM SINGLE] 個別シフト確定完了、ダッシュボード更新イベントを発火', {
        shiftId: shiftId,
        shiftDate: shiftDate,
        today: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      });
      
      // localStorageにシフト確定の情報を保存（ダッシュボードが後からマウントされた場合でも更新できるように）
      const shiftConfirmInfo = {
        timestamp: new Date().toISOString(),
        shiftId: shiftId,
        shiftDate: shiftDate,
        source: 'shiftConfirmSingle'
      };
      localStorage.setItem('lastShiftConfirm', JSON.stringify(shiftConfirmInfo));
      console.log('💾 [SHIFT CONFIRM SINGLE] localStorageにシフト確定情報を保存', shiftConfirmInfo);
      
      // データベースの更新が確実に反映されるまで待機
      setTimeout(() => {
        try {
          console.log('🔄 [SHIFT CONFIRM SINGLE] dashboardRefreshイベントを発火', {
            shiftId: shiftId,
            shiftDate: shiftDate,
            timestamp: new Date().toISOString(),
            eventWillBeDispatched: true
          });
          const event = new CustomEvent('dashboardRefresh', {
            detail: {
              source: 'shiftConfirmSingle',
              shiftId: shiftId,
              shiftDate: shiftDate,
              timestamp: new Date().toISOString()
            }
          });
          window.dispatchEvent(event);
          console.log('✅ [SHIFT CONFIRM SINGLE] dashboardRefreshイベントを発火しました', {
            eventType: event.type,
            detail: event.detail
          });
          
          // イベントが受信されなかった場合に備えて、少し遅れて再度発火
          setTimeout(() => {
            console.log('🔄 [SHIFT CONFIRM SINGLE] dashboardRefreshイベントを再発火（念のため）');
            window.dispatchEvent(new CustomEvent('dashboardRefresh', {
              detail: shiftConfirmInfo
            }));
          }, 2000); // 2秒後に再発火
        } catch (error) {
          console.error('❌ [SHIFT CONFIRM SINGLE] イベント発火エラー:', error);
        }
      }, 500); // 500ms待機してからイベント発火
      
      // コンテキストメニューを閉じる
      setContextMenu({ show: false, x: 0, y: 0, shiftId: '', shift: null });
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'シフトの確定に失敗しました');
    } finally {
      setSaving(false);
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
      
      console.log('📦 [SHIFT CONFIRM] APIレスポンス:', {
        result,
        hasUpdatedCount: 'updated_count' in result,
        updatedCount: result.updated_count,
        dataLength: result.data?.length
      });
      
      // 成功メッセージを表示
      const periodName = viewMode === 'week' ? '週' : viewMode === 'half-month' ? '半月' : '月';
      const updatedCount = result.updated_count || result.data?.length || 0;
      alert(`${updatedCount}件の${periodName}間シフトを確定しました`);
      
      // ナビゲーションの通知件数を更新
      window.dispatchEvent(new CustomEvent('updateShiftConfirmations'));
      
      // ダッシュボードを自動更新（データベースの更新が反映されるまで少し待機）
      console.log('🔄 [SHIFT CONFIRM] シフト確定完了、ダッシュボード更新イベントを発火', {
        updatedCount: updatedCount,
        period: `${periodStart.toISOString().split('T')[0]} ～ ${periodEnd.toISOString().split('T')[0]}`,
        today: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      });
      
      // localStorageにシフト確定の情報を保存（ダッシュボードが後からマウントされた場合でも更新できるように）
      const shiftConfirmInfo = {
        timestamp: new Date().toISOString(),
        updatedCount: updatedCount,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        source: 'shiftConfirm'
      };
      localStorage.setItem('lastShiftConfirm', JSON.stringify(shiftConfirmInfo));
      console.log('💾 [SHIFT CONFIRM] localStorageにシフト確定情報を保存', shiftConfirmInfo);
      
      // データベースの更新が確実に反映されるまで待機
      setTimeout(() => {
        try {
          console.log('🔄 [SHIFT CONFIRM] dashboardRefreshイベントを発火', {
            timestamp: new Date().toISOString(),
            eventWillBeDispatched: true
          });
          const event = new CustomEvent('dashboardRefresh', {
            detail: {
              source: 'shiftConfirm',
              updatedCount: updatedCount,
              periodStart: periodStart.toISOString().split('T')[0],
              periodEnd: periodEnd.toISOString().split('T')[0],
              timestamp: new Date().toISOString()
            }
          });
          window.dispatchEvent(event);
          console.log('✅ [SHIFT CONFIRM] dashboardRefreshイベントを発火しました', {
            eventType: event.type,
            detail: event.detail
          });
          
          // イベントが受信されなかった場合に備えて、少し遅れて再度発火
          setTimeout(() => {
            console.log('🔄 [SHIFT CONFIRM] dashboardRefreshイベントを再発火（念のため）');
            window.dispatchEvent(new CustomEvent('dashboardRefresh', {
              detail: shiftConfirmInfo
            }));
          }, 2000); // 2秒後に再発火
        } catch (error) {
          console.error('❌ [SHIFT CONFIRM] イベント発火エラー:', error);
        }
      }, 500); // 500ms待機してからイベント発火
      
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
  const checkWorkRuleViolations = (userId: string, date: string, timeSlotId: string): string[] => {
    const warnings: string[] = [];
    
    // デバッグ: 勤怠ルールチェックの前提条件を確認
    console.log('🔍 [checkWorkRuleViolations] チェック開始:', {
      userId,
      date,
      timeSlotId,
      selectedStore,
      selectedStoreData: selectedStoreData?.name,
      workRules: selectedStoreData?.workRules,
      hasUsers: !!users,
      hasTimeSlots: !!timeSlots
    });
    
    if (!selectedStoreData?.workRules || !users || !timeSlots) {
      console.log('🔍 [checkWorkRuleViolations] 前提条件不足のため警告チェックスキップ');
      return warnings;
    }

    // 新しいシフトパターンの時間数を計算
    const newPattern = timeSlots.find(ts => ts.id === timeSlotId);
    let newShiftHours = 0;
    if (newPattern && newPattern.start_time && newPattern.end_time) {
      const startTime = newPattern.start_time.split(':').map(Number);
      const endTime = newPattern.end_time.split(':').map(Number);
      newShiftHours = (endTime[0] * 60 + endTime[1] - startTime[0] * 60 - startTime[1]) / 60;
      // TimeSlotには休憩時間がないため、休憩時間は0として計算
    }

    // その週のユーザーのシフトを包括的に取得（通常シフト + 固定シフト）
    // 選択された日が含まれる週の月曜日から日曜日までを計算
    const weekMondayStr = getWeekMonday(date);
    const weekSundayStr = getWeekSunday(date);
    const weekStart = new Date(weekMondayStr);
    const weekEnd = new Date(weekSundayStr);

     console.log('🔍 [checkWorkRuleViolations] 週範囲:', {
       weekStart: weekStart.toISOString().split('T')[0],
       weekEnd: weekEnd.toISOString().split('T')[0],
       hasFixedShifts: !!fixedShifts,
       fixedShiftsCount: fixedShifts?.length
     });

     // 通常のシフト（下書き + 確定済み。警告は早めに出す）
     const regularWeeklyShifts = shifts.filter(shift => {
       const shiftDate = new Date(shift.date);
       return shift.userId === userId && 
              shiftDate >= weekStart && 
              shiftDate <= weekEnd;
     });

     console.log('🔍 [checkWorkRuleViolations] 通常シフト:', regularWeeklyShifts.length);

     // 固定シフトを週の各日について動的に生成
     const fixedWeeklyShifts: any[] = [];
     if (fixedShifts && fixedShifts.length > 0) {
       for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
         const dayOfWeek = d.getDay();
         const dateStr = d.toISOString().split('T')[0];
         
         const userFixedShiftsForDay = fixedShifts.filter(fs => 
                       fs.user_id === userId && 
            fs.store_id === selectedStore && 
            fs.day_of_week === dayOfWeek &&
            fs.is_active
         );

         userFixedShiftsForDay.forEach(fixedShift => {
           fixedWeeklyShifts.push({
             id: `fixed-${fixedShift.id}-${dateStr}`,
                           userId: fixedShift.user_id,
              date: dateStr,
              timeSlotId: fixedShift.time_slot_id,
             status: 'confirmed', // 固定シフトは確定扱い
             isFixedShift: true
           });
         });
       }
     }

     console.log('🔍 [checkWorkRuleViolations] 固定シフト:', fixedWeeklyShifts.length);

     // 全シフトを結合（通常シフト + 固定シフト）
     const weeklyShifts = [...regularWeeklyShifts, ...fixedWeeklyShifts];

    // 週間労働時間のチェック
    let weeklyHours = newShiftHours;
    console.log(`🔍 [checkWorkRuleViolations] 週間労働時間チェック開始:`, {
      userId,
      date,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      newShiftHours,
      weeklyShiftsCount: weeklyShifts.length
    });

    // 日別労働時間を集計（同一日複数シフト対応）
    const dailyHours: { [date: string]: number } = {};
    
    weeklyShifts.forEach((shift, index) => {
      const pattern = timeSlots.find(ts => ts.id === shift.timeSlotId);
      if (pattern && pattern.start_time && pattern.end_time) {
        const startTime = pattern.start_time.split(':').map(Number);
        const endTime = pattern.end_time.split(':').map(Number);
        const hours = (endTime[0] * 60 + endTime[1] - startTime[0] * 60 - startTime[1]) / 60;
        
        if (!dailyHours[shift.date]) {
          dailyHours[shift.date] = 0;
        }
        dailyHours[shift.date] += hours;
        weeklyHours += hours;
        
        console.log(`🔍 [checkWorkRuleViolations] シフト${index}: ${shift.date} ${pattern.name} ${hours}時間 (日計: ${dailyHours[shift.date]}h, 週計: ${weeklyHours.toFixed(1)}h)`);
      }
    });
    
    // 同一日12時間超過チェック（労働基準法）
    Object.entries(dailyHours).forEach(([date, hours]) => {
      if (hours > 12) {
        warnings.push(`1日の労働時間が過度です（${date}: ${hours}時間 > 12時間）`);
      }
    });

    const maxWeeklyHours = selectedStoreData.workRules.maxWeeklyHours || 28;
    console.log(`🔍 [checkWorkRuleViolations] 週間労働時間結果: ${weeklyHours.toFixed(1)}時間 vs 上限${maxWeeklyHours}時間`);
    
    if (weeklyHours > maxWeeklyHours) {
      const warning = `週間労働時間が上限を超えます（${weeklyHours.toFixed(1)}時間 > ${maxWeeklyHours}時間） - 労働基準法に注意`;
      console.log(`🔍 [checkWorkRuleViolations] 週間労働時間違反: ${warning}`);
      warnings.push(warning);
    }

    // 連続勤務日数のチェック
    const userShifts = shifts.filter(shift => shift.userId === userId);
    console.log(`🔍 [checkWorkRuleViolations] 連続勤務チェック開始:`, {
      userId,
      date,
      userShiftsCount: userShifts.length,
      userShifts: userShifts.map(s => s.date).sort()
    });
    
    // 新しいシフトを含めて連続勤務日数を計算
    const allShifts = [...userShifts, { date, userId, timeSlotId: timeSlotId }]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    console.log(`🔍 [checkWorkRuleViolations] 全シフト（新規含む）:`, allShifts.map(s => s.date));

    let consecutiveDays = 1;
    let maxConsecutive = 1;

    for (let i = 1; i < allShifts.length; i++) {
      const prevDate = new Date(allShifts[i-1].date);
      const currentDate = new Date(allShifts[i].date);
      const diffDays = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (diffDays === 1) {
        consecutiveDays++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveDays);
      } else {
        consecutiveDays = 1;
      }
    }

    const maxConsecutiveDays = selectedStoreData.workRules.maxConsecutiveDays || 7;
    if (maxConsecutive > maxConsecutiveDays) {
      warnings.push(`連続勤務日数が上限を超えます（${maxConsecutive}日 > ${maxConsecutiveDays}日）`);
    }

    // 最低休息時間のチェック
    const minRestHours = selectedStoreData.workRules.minRestHours || 11;
    for (let i = 0; i < allShifts.length - 1; i++) {
      const currentShift = allShifts[i];
      const nextShift = allShifts[i + 1];
      
      const currentPattern = timeSlots.find(ts => ts.id === currentShift.timeSlotId);
      const nextPattern = timeSlots.find(ts => ts.id === nextShift.timeSlotId);
      
      if (currentPattern && nextPattern && currentPattern.end_time && nextPattern.start_time) {
        const currentEnd = new Date(`${currentShift.date}T${currentPattern.end_time}`);
        const nextStart = new Date(`${nextShift.date}T${nextPattern.start_time}`);
        
        const restHours = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60 * 60);
        
        if (restHours < minRestHours && restHours >= 0) {
          const restHoursFormatted = restHours.toFixed(1);
          warnings.push(`勤務間隔が不足しています（${restHoursFormatted}時間 < ${minRestHours}時間）`);
        }
      }
    }

    return warnings;
  };

  // シフト表全体の勤怠ルール違反をチェック
  const checkAllShiftViolations = () => {
         console.log('🔍 [checkAllShiftViolations] チェック開始:', {
      hasSelectedStoreData: !!selectedStoreData,
      hasWorkRules: !!selectedStoreData?.workRules,
      workRules: selectedStoreData?.workRules,
      hasUsers: !!users,
      usersCount: users?.length,
      hasTimeSlots: !!timeSlots,
      timeSlotsCount: timeSlots?.length,
      hasShifts: !!shifts,
      shiftsCount: shifts?.length,
      hasFixedShifts: !!fixedShifts,
      fixedShiftsCount: fixedShifts?.length,
      displayDatesCount: displayDates?.length
    });

    if (!selectedStoreData?.workRules || !users || !timeSlots || !shifts || !fixedShifts || !displayDates) {
      console.log('🔍 [checkAllShiftViolations] 前提条件不足のためスキップ:', {
        hasWorkRules: !!selectedStoreData?.workRules,
        hasUsers: !!users,
        hasTimeSlots: !!timeSlots,
        hasShifts: !!shifts,
        hasFixedShifts: !!fixedShifts,
        hasDisplayDates: !!displayDates
      });
      return [];
    }

    const allWarnings: { userId: string; userName: string; date: string; warnings: string[] }[] = [];

        // 表示期間内のすべてのシフト（通常 + 固定）を取得
    const allShiftsInPeriod: any[] = [];

    // 通常のシフトを追加（下書き + 確定済み。警告は早めに出す）
    if (shifts) {
      allShiftsInPeriod.push(...shifts);
    }

    // 固定シフトを動的に生成して追加
    if (fixedShifts && fixedShifts.length > 0 && displayDates) {
      displayDates.forEach(date => {
        const d = new Date(date);
        const dayOfWeek = d.getDay();
        
        const fixedShiftsForDay = fixedShifts.filter(fs => 
          fs.store_id === selectedStore && 
          fs.day_of_week === dayOfWeek &&
          fs.is_active
        );

        fixedShiftsForDay.forEach(fixedShift => {
          allShiftsInPeriod.push({
            id: `fixed-${fixedShift.id}-${date}`,
            userId: fixedShift.user_id,
            date: date,
            timeSlotId: fixedShift.time_slot_id,
            status: 'confirmed',
            isFixedShift: true
          });
        });
      });
    }

    console.log('🔍 [checkAllShiftViolations] 全シフト:', {
      regularShifts: shifts?.length || 0,
      fixedShifts: allShiftsInPeriod.filter(s => s.isFixedShift).length,
      total: allShiftsInPeriod.length
    });

    // 各ユーザーの各シフトに対してチェック
    console.log('🔍 [checkAllShiftViolations] シフトループ開始:', allShiftsInPeriod.length + '件');
    allShiftsInPeriod.forEach((shift, index) => {
      const user = users.find(u => u.id === shift.userId);
      if (!user) {
        console.log(`🔍 [checkAllShiftViolations] シフト${index}: ユーザーが見つからない ${shift.userId}`);
        return;
      }

      console.log(`🔍 [checkAllShiftViolations] シフト${index}: ${user.name} (${shift.date}) ${shift.isFixedShift ? '[固定]' : '[通常]'}`);
      const violations = checkWorkRuleViolations(shift.userId, shift.date, shift.timeSlotId);
      console.log(`🔍 [checkAllShiftViolations] シフト${index}: 違反${violations.length}件`, violations);
      
      if (violations.length > 0) {
        allWarnings.push({
          userId: shift.userId,
          userName: user.name,
          date: shift.date,
          warnings: violations
        });
      }
    });

    console.log('🔍 [checkAllShiftViolations] 最終結果:', allWarnings.length + '件の違反');
    return allWarnings;
  };

  // 現在表示されている期間の勤怠ルール違反サマリー
  const currentViolations = checkAllShiftViolations();
  const hasViolations = currentViolations.length > 0;

  // デバッグ: 違反チェック結果の確認
  console.log('🔍 [ShiftCreate] 勤怠ルール違反チェック結果:', {
    selectedStore,
    selectedStoreData: selectedStoreData?.name,
    workRules: selectedStoreData?.workRules,
    shiftsCount: shifts.length,
    usersCount: users.length,
    timeSlotsCount: timeSlots.length,
    violationsCount: currentViolations.length,
    violations: currentViolations
  });

  // 特定の日・ユーザーの固定シフトをチェック（getAvailableStaffより前に定義）
  const checkUserFixedShift = (userId: string, dayOfWeek: number, timeSlotId: string) => {
    return fixedShifts.find(fixedShift => 
      fixedShift.user_id === userId &&
      fixedShift.day_of_week === dayOfWeek && 
      fixedShift.time_slot_id === timeSlotId &&
      fixedShift.is_active
    );
  };

  // 店舗所属スタッフのみフィルタ（基本的なシフト作成は所属スタッフ内で完結）
  // 固定シフトが設定されているスタッフは除外
  const getAvailableStaff = (date: string, dayOfWeek: number, timeSlotId: string) => {
    if (!selectedStore) return [];
    
    return users.filter(user => {
      // 店舗に所属しているかチェック
      if (!user.stores?.includes(selectedStore)) return false;
      
      // 固定シフトが設定されている場合は除外
      if (timeSlotId && checkUserFixedShift(user.id, dayOfWeek, timeSlotId)) {
        return false;
      }
      
      return true;
    });
  };
  
  // モーダルが開いている場合は、選択された時間帯に基づいてフィルタリング
  // モーダルが閉じている場合は、店舗所属スタッフのみ
  const availableStaff = isModalOpen && modalData && selectedTimeSlot
    ? getAvailableStaff(modalData.date, modalData.dayIndex, selectedTimeSlot)
    : (selectedStore ? users.filter(user => user.stores?.includes(selectedStore)) : []);

  // 時給計算（個別給与ベース）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getHourlyWage = (user: any) => {
    if (!user) return 0;
    
    // 個別時給が設定されている場合はそれを使用（キャメルケースとスネークケースの両方をチェック）
    const hourlyWage = user.hourlyWage || user.hourly_wage;
    if (hourlyWage && hourlyWage > 0) {
      return hourlyWage;
    }
    
    // フォールバック：スキルレベルベースのデフォルト値
    const defaultWages: Record<string, number> = {
      'training': 900,
      'regular': 1000,
      'veteran': 1200
    };
    
    const skillLevel = user.skill_level || user.skillLevel || 'regular';
    return defaultWages[skillLevel] || 1000;
  };

  // シフトの実際の勤務時間を取得（カスタム時間を考慮）
  // 22時以降は深夜時間として分けて計算
  const getActualWorkTime = (shift: Shift, timeSlot: TimeSlot) => {
    // カスタム時間が設定されている場合はそれを使用
    const startTime = shift.customStartTime || timeSlot.start_time;
    const endTime = shift.customEndTime || timeSlot.end_time;
    
    const start = startTime.split(':').map(Number);
    const end = endTime.split(':').map(Number);
    
    if (start.length >= 2 && end.length >= 2 && 
        !isNaN(start[0]) && !isNaN(start[1]) && 
        !isNaN(end[0]) && !isNaN(end[1])) {
      
      const startMinutes = start[0] * 60 + start[1];
      let endMinutes = end[0] * 60 + end[1];
      
      // 日をまたぐ場合の処理（終了時間が開始時間より小さい場合）
      const crossesMidnight = endMinutes <= startMinutes;
      if (crossesMidnight) {
        endMinutes += 24 * 60; // 24時間（1440分）を加算
      }
      
      const workHours = Math.max(0, (endMinutes - startMinutes) / 60);
      
      // 22時（22:00 = 1320分）以降の深夜時間を計算
      const nightTimeStart = 22 * 60; // 22:00を分で表現
      const dayMinutes = 24 * 60; // 1日の分数（1440分）
      let regularHours = 0;
      let nightHours = 0;
      
      if (workHours > 0) {
        if (crossesMidnight) {
          // 日をまたぐ場合
          const actualEndMinutes = endMinutes % dayMinutes; // 0時からの分（1440分で割った余り）
          
          // 開始時間が22時以降の場合
          if (startMinutes >= nightTimeStart) {
            // 開始時間から24時（1440分）までが深夜時間
            nightHours += (dayMinutes - startMinutes) / 60;
            // 0時から終了時間まで
            if (actualEndMinutes >= nightTimeStart) {
              // 0時から22時までが通常時間、22時から終了時間までが深夜時間
              regularHours += nightTimeStart / 60;
              nightHours += (actualEndMinutes - nightTimeStart) / 60;
            } else {
              // 0時から終了時間までが通常時間
              regularHours += actualEndMinutes / 60;
            }
          } else {
            // 開始時間が22時前の場合
            // 開始時間から22時までが通常時間
            regularHours += (nightTimeStart - startMinutes) / 60;
            // 22時から24時までが深夜時間
            nightHours += (dayMinutes - nightTimeStart) / 60;
            // 0時から終了時間まで
            if (actualEndMinutes >= nightTimeStart) {
              // 0時から22時までが通常時間、22時から終了時間までが深夜時間
              regularHours += nightTimeStart / 60;
              nightHours += (actualEndMinutes - nightTimeStart) / 60;
            } else {
              // 0時から終了時間までが通常時間
              regularHours += actualEndMinutes / 60;
            }
          }
        } else {
          // 日をまたがない場合
          // 開始時間が22時以降の場合
          if (startMinutes >= nightTimeStart) {
            // 全て深夜時間
            nightHours = workHours;
          } 
          // 終了時間が22時以降で、開始時間が22時前の場合
          else if (endMinutes > nightTimeStart) {
            // 22時までの通常時間
            regularHours = (nightTimeStart - startMinutes) / 60;
            // 22時以降の深夜時間
            nightHours = (endMinutes - nightTimeStart) / 60;
          } 
          // 22時をまたがない場合
          else {
            // 全て通常時間
            regularHours = workHours;
          }
        }
      }
      
      return { 
        startTime, 
        endTime, 
        workHours,
        regularHours: Math.max(0, regularHours),
        nightHours: Math.max(0, nightHours)
      };
    }
    
    return { startTime, endTime, workHours: 0, regularHours: 0, nightHours: 0 };
  };

  // 週の統計計算
  const weeklyStats = useMemo(() => {
    try {
      // 基本的な初期値
      const defaultResult = {
          totalHours: 0,
          totalWage: 0,
          uniqueStaff: 0,
        averageHours: 0,
        fixedShiftHours: 0,
        fixedShiftWage: 0,
        regularShiftHours: 0,
        regularShiftWage: 0,
        nightHours: 0,
        nightWage: 0,
        nightPremium: 0 // 深夜帯増額分
      };

      // 必要なデータが揃っているかチェック
      if (!shifts || !selectedStore || !timeSlots || !users) {
        return defaultResult;
      }

      // 期間計算の安全性確保
      let periodStart: Date;
      let periodEnd: Date;
      
      try {
        periodStart = new Date(selectedWeek);
        periodEnd = new Date(selectedWeek);
      
      if (viewMode === 'week') {
        periodEnd.setDate(periodStart.getDate() + 6);
      } else if (viewMode === 'half-month') {
        periodEnd.setDate(periodStart.getDate() + 13);
      } else if (viewMode === 'month') {
        periodStart.setDate(1);
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
      }

        // 日付が有効かチェック
        if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
          console.error('Invalid date range:', { selectedWeek, viewMode });
          return defaultResult;
        }
      } catch (dateError) {
        console.error('Error calculating period dates:', dateError);
        return defaultResult;
      }

      // 期間内シフトのフィルタリング
      let periodShifts: Shift[] = [];
      try {
        periodShifts = shifts.filter(shift => {
        try {
            if (!shift || !shift.date || shift.storeId !== selectedStore) return false;
          const shiftDate = new Date(shift.date);
            return shiftDate >= periodStart && shiftDate <= periodEnd;
          } catch (filterError) {
            console.error('Error filtering shift:', filterError, { shift });
          return false;
        }
      });
      } catch (filterError) {
        console.error('Error filtering period shifts:', filterError);
        periodShifts = [];
      }

      let totalHours = 0;
      let totalWage = 0;
      let nightHours = 0;
      let nightWage = 0;
      let nightPremium = 0; // 深夜帯増額分（時給25%UPの増加分）
      const staffCount = new Set();

      // 通常シフトの統計計算
      try {
      periodShifts.forEach(shift => {
        try {
            const timeSlot = timeSlots.find(ts => ts.id === shift.timeSlotId);
          const user = users.find(u => u.id === shift.userId);
          
            if (timeSlot && user && typeof getActualWorkTime === 'function' && typeof getHourlyWage === 'function') {
              const { workHours, regularHours, nightHours: shiftNightHours } = getActualWorkTime(shift, timeSlot);
              const hourlyWage = getHourlyWage(user);
                
              if (workHours > 0 && !isNaN(workHours)) {
                totalHours += workHours;
                
                // 通常時間の給与
                const regularWage = regularHours * hourlyWage;
                // 深夜時間の給与（時給25%UP）
                const nightWageForShift = shiftNightHours * hourlyWage * 1.25;
                // 深夜帯増額分（通常時給との差額）
                const nightPremiumForShift = shiftNightHours * hourlyWage * 0.25;
                
                totalWage += regularWage + nightWageForShift;
                nightHours += shiftNightHours;
                nightWage += nightWageForShift;
                nightPremium += nightPremiumForShift;
                
                staffCount.add(shift.userId);
              }
            }
          } catch (shiftError) {
            console.error('Error calculating shift stats:', shiftError);
          }
        });
      } catch (regularShiftError) {
        console.error('Error in regular shift calculation:', regularShiftError);
      }

      // 固定シフトの統計計算
      let fixedShiftHours = 0;
      let fixedShiftWage = 0;
      let fixedShiftNightHours = 0;
      let fixedShiftNightWage = 0;
      let fixedShiftNightPremium = 0;

      try {
        if (fixedShifts && Array.isArray(fixedShifts) && fixedShifts.length > 0) {
          const diffTime = Math.abs(periodEnd.getTime() - periodStart.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const maxDays = Math.min(31, diffDays + 1);
          
          for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
            try {
              const currentDate = new Date(periodStart);
              currentDate.setDate(periodStart.getDate() + dayOffset);
              
              if (currentDate > periodEnd || isNaN(currentDate.getTime())) break;
              
              const dayOfWeek = currentDate.getDay();
              const dateString = currentDate.toISOString().split('T')[0];
              
              const dayFixedShifts = fixedShifts.filter(fixedShift => 
                fixedShift && 
                fixedShift.day_of_week === dayOfWeek && 
                fixedShift.is_active &&
                fixedShift.store_id === selectedStore
              );
              
              for (const fixedShift of dayFixedShifts) {
                try {
                  if (!fixedShift.user_id || !fixedShift.time_slot_id) continue;

                  const hasExistingShift = periodShifts.some(shift => 
                    shift && shift.userId === fixedShift.user_id && shift.date === dateString
                  );
                  
                  if (!hasExistingShift) {
                    const timeSlot = timeSlots.find(ts => ts.id === fixedShift.time_slot_id);
                    const user = users.find(u => u.id === fixedShift.user_id);
                    
                    if (timeSlot && user && typeof getActualWorkTime === 'function' && typeof getHourlyWage === 'function') {
                      const pseudoShift = {
                        id: `fixed-${fixedShift.id}-${dateString}`,
                        userId: fixedShift.user_id,
                        storeId: fixedShift.store_id,
                        date: dateString,
                        timeSlotId: fixedShift.time_slot_id,
                        customStartTime: undefined,
                        customEndTime: undefined,
                        status: 'confirmed' as const,
                        notes: '固定シフト'
                      };
                      
                      const { workHours, regularHours, nightHours: shiftNightHours } = getActualWorkTime(pseudoShift, timeSlot);
                      const hourlyWage = getHourlyWage(user);
                      
                      if (workHours > 0 && !isNaN(workHours)) {
                        fixedShiftHours += workHours;
                        
                        // 通常時間の給与
                        const regularWage = regularHours * hourlyWage;
                        // 深夜時間の給与（時給25%UP）
                        const nightWageForShift = shiftNightHours * hourlyWage * 1.25;
                        // 深夜帯増額分（通常時給との差額）
                        const nightPremiumForShift = shiftNightHours * hourlyWage * 0.25;
                        
                        fixedShiftWage += regularWage + nightWageForShift;
                        fixedShiftNightHours += shiftNightHours;
                        fixedShiftNightWage += nightWageForShift;
                        fixedShiftNightPremium += nightPremiumForShift;
                        
                        staffCount.add(fixedShift.user_id);
        }
                    }
                  }
                } catch (fixedShiftError) {
                  console.error('Fixed shift processing error:', fixedShiftError);
                }
              }
            } catch (dayError) {
              console.error('Day processing error:', dayError);
            }
          }
        }
      } catch (fixedShiftCalculationError) {
        console.error('Fixed shift calculation error:', fixedShiftCalculationError);
      }

      // 最終結果の計算と検証
      const combinedTotalHours = (totalHours || 0) + (fixedShiftHours || 0);
      const combinedTotalWage = (totalWage || 0) + (fixedShiftWage || 0);
      const combinedNightHours = (nightHours || 0) + (fixedShiftNightHours || 0);
      const combinedNightWage = (nightWage || 0) + (fixedShiftNightWage || 0);
      const combinedNightPremium = (nightPremium || 0) + (fixedShiftNightPremium || 0);
      const uniqueStaffCount = staffCount.size || 0;

      return {
        totalHours: Math.round((combinedTotalHours || 0) * 10) / 10,
        totalWage: Math.round(combinedTotalWage || 0),
        uniqueStaff: uniqueStaffCount,
        averageHours: uniqueStaffCount > 0 ? Math.round((combinedTotalHours / uniqueStaffCount) * 10) / 10 : 0,
        fixedShiftHours: Math.round((fixedShiftHours || 0) * 10) / 10,
        fixedShiftWage: Math.round(fixedShiftWage || 0),
        regularShiftHours: Math.round((totalHours || 0) * 10) / 10,
        regularShiftWage: Math.round(totalWage || 0),
        nightHours: Math.round((combinedNightHours || 0) * 10) / 10,
        nightWage: Math.round(combinedNightWage || 0),
        nightPremium: Math.round(combinedNightPremium || 0)
      };

    } catch (error) {
      console.error('Critical error in calculateWeeklyStats:', error);
      return {
        totalHours: 0,
        totalWage: 0,
        uniqueStaff: 0,
        averageHours: 0,
        fixedShiftHours: 0,
        fixedShiftWage: 0,
        regularShiftHours: 0,
        regularShiftWage: 0,
        nightHours: 0,
        nightWage: 0,
        nightPremium: 0
      };
    }
  }, [shifts, selectedStore, timeSlots, users, fixedShifts, selectedWeek, viewMode]);

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

  // 特定のスタッフの同日シフト状況をチェック（同店舗・他店舗両方、通常シフト + 固定シフト）
  const checkStaffShiftStatus = async (userId: string, date: string) => {
    try {
      // 通常シフトを取得
      const response = await fetch(`/api/shifts?user_id=${userId}&date_from=${date}&date_to=${date}`);
      const existingShifts: DatabaseShift[] = [];
      
      if (response.ok) {
        const result = await response.json();
        existingShifts.push(...(result.data || []));
      }
      
      // 固定シフトもチェック（指定された日の曜日を取得）
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay();
      const userFixedShifts = fixedShifts.filter(fs => 
        fs.user_id === userId && 
        fs.day_of_week === dayOfWeek && 
        fs.is_active
      );
      
      // 固定シフトを通常シフト形式に変換して追加
      const fixedShiftsAsConflicts = userFixedShifts.map(fs => ({
        id: `fixed-${fs.id}`,
        user_id: fs.user_id,
        store_id: fs.store_id,
        date: date,
        time_slot_id: fs.time_slot_id,
        status: 'confirmed' as const,
        stores: stores.find(s => s.id === fs.store_id) ? { name: stores.find(s => s.id === fs.store_id)!.name } : undefined,
        time_slots: timeSlots.find(ts => ts.id === fs.time_slot_id) ? {
          name: timeSlots.find(ts => ts.id === fs.time_slot_id)!.name,
          start_time: timeSlots.find(ts => ts.id === fs.time_slot_id)!.start_time,
          end_time: timeSlots.find(ts => ts.id === fs.time_slot_id)!.end_time
        } : undefined,
        isFixedShift: true
      }));
      
      // 通常シフトと固定シフトを結合
      const allShifts = [...existingShifts, ...fixedShiftsAsConflicts];
      
      const conflicts = allShifts.map((shift: any) => {
        // storesはリレーションで単一オブジェクトまたは配列として返される可能性がある
        const store = Array.isArray(shift.stores) ? shift.stores[0] : shift.stores;
        const timeSlot = Array.isArray(shift.time_slots) ? shift.time_slots[0] : shift.time_slots;
        
        return {
          storeName: store?.name || '不明な店舗',
          storeId: shift.store_id,
          status: shift.status,
          isConfirmed: shift.status === 'confirmed' || shift.isFixedShift,
          isSameStore: shift.store_id === selectedStore,
          isFixedShift: shift.isFixedShift || false,
          shiftPattern: timeSlot?.name || '不明なパターン',
          startTime: timeSlot?.start_time || '',
          endTime: timeSlot?.end_time || ''
        };
      });
       
      return {
        hasConflict: conflicts.length > 0,
        conflicts: conflicts,
        hasOtherStoreConflict: conflicts.some((c: { isSameStore: boolean }) => !c.isSameStore),
        hasSameStoreConflict: conflicts.some((c: { isSameStore: boolean }) => c.isSameStore),
        hasConfirmedConflict: conflicts.some((c: { isConfirmed: boolean }) => c.isConfirmed),
        hasFixedShiftConflict: conflicts.some((c: { isFixedShift: boolean }) => c.isFixedShift)
      };
    } catch (error) {
      console.error('Error checking staff shift status:', error);
      return { hasConflict: false, conflicts: [] };
    }
  };

  // 固定シフトを取得する関数
  const getFixedShiftForSlot = (dayOfWeek: number, timeSlotId: string = '') => {
    return fixedShifts.filter(fixedShift => 
      fixedShift.day_of_week === dayOfWeek && 
      (timeSlotId === '' || fixedShift.time_slot_id === timeSlotId) &&
      fixedShift.is_active
    );
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

  // モーダル開時に全スタッフの確定シフト状況をチェック（通常シフト + 固定シフト）
  const checkAllStaffConfirmedShifts = async (date: string) => {
    try {
      // 通常シフトの確定済みシフトを取得
      const response = await fetch(`/api/shifts?date_from=${date}&date_to=${date}&status=confirmed`);
      const confirmedShifts: { user_id: string }[] = [];
      
      if (response.ok) {
        const result = await response.json();
        confirmedShifts.push(...(result.data || []));
      }
      
      // 固定シフトもチェック（指定された日の曜日を取得）
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay();
      const fixedShiftsForDay = fixedShifts.filter(fs => 
        fs.day_of_week === dayOfWeek && 
        fs.is_active &&
        fs.store_id === selectedStore // 選択された店舗の固定シフトのみ
      );
      
      // 確定済みシフトと固定シフトのスタッフIDを結合
      const staffWithConfirmed = [
        ...confirmedShifts.map((shift: { user_id: string }) => shift.user_id),
        ...fixedShiftsForDay.map(fs => fs.user_id)
      ].filter((userId: string) => userId);
      
      setStaffWithConfirmedShifts(Array.from(new Set(staffWithConfirmed)));
    } catch (error) {
      console.error('Error checking confirmed shifts:', error);
    }
  };

  // 代打募集を作成
  const handleCreateEmergencyRequest = async (shift: DatabaseShift) => {
    try {
      setSubmittingEmergency(true);
      setError(null);

      // シフトの種類を判断（代打募集 or 人員不足募集）
      const isShortageRequest = shift.request_type === 'shortage';
      console.log('Creating emergency request:', {
        type: isShortageRequest ? '人員不足募集' : '代打募集',
        shift,
        reason: isShortageRequest ? shift.reason : emergencyReason,
        currentUser
      });

      // リクエストデータを作成
      const requestData = {
        original_user_id: isShortageRequest ? currentUser?.id : shift.user_id,
        store_id: shift.store_id,
        date: shift.date,
        time_slot_id: shift.time_slot_id,
        reason: isShortageRequest ? shift.reason : emergencyReason.trim(),
        request_type: isShortageRequest ? 'shortage' : 'substitute'
      };

      console.log('Request data:', requestData);

      const response = await fetch('/api/emergency-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '緊急募集の作成に失敗しました');
      }

      // メール送信は、emergency-requests APIで自動的に処理されるため削除

      // データを再取得
      if (selectedStore && selectedWeek) {
        const [updatedShifts, updatedEmergencyRequests] = await Promise.all([
          fetchShifts(selectedStore, selectedWeek),
          fetchEmergencyRequests(selectedStore, selectedWeek)
        ]);
        setShifts(updatedShifts);
        setEmergencyRequests(updatedEmergencyRequests);
      }

      setEmergencyModal({ show: false, shift: null });
      setEmergencyReason('');
      alert('緊急募集を作成しました。スタッフにメールが自動送信されます。');
    } catch (error) {
      setError(error instanceof Error ? error.message : '緊急募集の作成に失敗しました');
    } finally {
      setSubmittingEmergency(false);
    }
  };

  // 特定のシフトが代打募集中かチェック
  const getEmergencyRequestForShift = (shiftId: string) => {
    return emergencyRequests.find(req => 
      req.original_user_id === shifts.find(s => s.id === shiftId)?.userId &&
      req.date === shifts.find(s => s.id === shiftId)?.date &&
              req.time_slot_id === shifts.find(s => s.id === shiftId)?.timeSlotId &&
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
  const handleOpenEmergencyModal = (shift: DatabaseShift | Shift) => {
    // DatabaseShiftに変換
    const convertedShift: DatabaseShift = {
      id: shift.id,
      user_id: 'userId' in shift ? shift.userId : shift.user_id,
      store_id: 'storeId' in shift ? shift.storeId : shift.store_id,
      time_slot_id: 'timeSlotId' in shift ? shift.timeSlotId : shift.time_slot_id,
      date: shift.date,
      status: shift.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setEmergencyModal({ show: true, shift: convertedShift });
    handleCloseContextMenu();
  };

  // 代打募集管理画面を開く
  const handleEmergencyManagement = async (emergencyRequestId: string) => {
    try {
      const url = `/api/emergency-requests?id=${emergencyRequestId}`;
      console.log('Fetching emergency request details from:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API response error:', response.status, errorText);
        throw new Error(`代打募集データの取得に失敗しました (${response.status})`);
      }
      
      const result = await response.json();
      console.log('Emergency request details fetched:', result);
      
      if (result.data) {
        setEmergencyManagement({ show: true, request: result.data });
      } else {
        throw new Error('代打募集データが見つかりませんでした');
      }
    } catch (error) {
      console.error('Error in handleEmergencyManagement:', error);
      setError(error instanceof Error ? error.message : '代打募集データの取得に失敗しました');
    }
  };

  // 応募者承認・却下処理
  const handleVolunteerAction = async (requestId: string, volunteerId: string, action: 'accept' | 'reject', customStartTime?: string, customEndTime?: string) => {
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
          action: action,
          custom_start_time: customStartTime || null,
          custom_end_time: customEndTime || null
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

  // パターン変更時の処理
  const handlePatternChange = (patternId: string) => {
    setSelectedTimeSlot(patternId);
    
    if (patternId && isCustomTime) {
      // カスタムモードの場合のみ、パターンの時間を初期値として設定
      const pattern = timeSlots.find(p => p.id === patternId);
      if (pattern) {
        setCustomStartTime(pattern.start_time);
        setCustomEndTime(pattern.end_time);
      }
    } else {
      // カスタムモードでない場合はカスタム時間をクリア
      setCustomStartTime('');
      setCustomEndTime('');
    }
  };

  // カスタム時間モード切り替え
  const handleCustomTimeToggle = (enabled: boolean) => {
    setIsCustomTime(enabled);
    
    if (enabled && selectedTimeSlot) {
      // カスタムモード有効時は現在のパターン時間を初期値に設定
      const pattern = timeSlots.find(p => p.id === selectedTimeSlot);
      if (pattern) {
        setCustomStartTime(pattern.start_time);
        setCustomEndTime(pattern.end_time);
      }
    }
  };

  // モーダルを閉じる共通関数
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUser('');
    setSelectedTimeSlot('');
    setIsCustomTime(false);
    setCustomStartTime('');
    setCustomEndTime('');
  };

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
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">シフト作成</h1>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">期間単位でシフトを作成・編集できます</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button 
              variant="secondary" 
              disabled={saving || !shiftStatus.hasShifts} 
              onClick={handleSaveDraft}
              className="w-full sm:w-auto text-sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              下書き保存
            </Button>
            <Button 
              disabled={saving || !shiftStatus.hasShifts || shiftStatus.allConfirmed} 
              onClick={handleConfirmShifts}
              className={`w-full sm:w-auto text-sm ${shiftStatus.allConfirmed ? 'bg-green-600 hover:bg-green-700' : ''}`}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {shiftStatus.allConfirmed ? '確定済み' : 'シフト確定'}
            </Button>
          </div>
        </div>

        {/* 統計サマリー - スマホ対応 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <Card>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              <div className="text-lg sm:text-2xl font-bold text-blue-600">{weeklyStats.totalHours}h</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {viewMode === 'week' ? '総勤務時間' : 
                 viewMode === 'half-month' ? '半月勤務時間' : 
                 '月間勤務時間'}
              </p>
              {/* 固定シフト詳細を小さく表示 */}
              {(weeklyStats.fixedShiftHours || 0) > 0 && (
                <div className="text-xs text-purple-600 mt-1">
                  📌 固定: {weeklyStats.fixedShiftHours || 0}h
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              <div className="text-lg sm:text-2xl font-bold text-green-600">¥{weeklyStats.totalWage.toLocaleString()}</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {viewMode === 'week' ? '総人件費' : 
                 viewMode === 'half-month' ? '半月人件費' : 
                 '月間人件費'}
              </p>
              {/* 固定シフト詳細を小さく表示 */}
              {(weeklyStats.fixedShiftWage || 0) > 0 && (
                <div className="text-xs text-purple-600 mt-1">
                  📌 固定: ¥{(weeklyStats.fixedShiftWage || 0).toLocaleString()}
                </div>
              )}
              {/* 深夜帯増額分を表示 */}
              {(weeklyStats.nightPremium || 0) > 0 && (
                <div className="text-xs text-blue-600 mt-1">
                  🌙 深夜増額: ¥{(weeklyStats.nightPremium || 0).toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              <div className="text-lg sm:text-2xl font-bold text-purple-600">{weeklyStats.uniqueStaff}人</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">勤務スタッフ数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              <div className="text-lg sm:text-2xl font-bold text-orange-600">{weeklyStats.averageHours}h</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">平均勤務時間</p>
            </CardContent>
          </Card>
        </div>

        {/* 店舗・週選択 */}
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            {/* 表示期間切り替えタブ - スマホ対応 */}
            <div className="mb-4 sm:mb-6">
              <div className="flex bg-gray-100 p-1 rounded-lg w-full overflow-x-auto">
                <button
                  onClick={() => {
                    setViewMode('week');
                    setSelectedWeek(getAppropriateStartDate('week'));
                  }}
                  className={`px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-1 ${
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
                  className={`px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-1 ${
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
                  className={`px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-1 ${
                    viewMode === 'month'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  月表示
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  店舗選択
                </label>
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                {viewMode === 'month' ? (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const currentDate = new Date(selectedWeek);
                        currentDate.setMonth(currentDate.getMonth() - 1);
                        setSelectedWeek(formatDateString(
                          currentDate.getFullYear(),
                          currentDate.getMonth(),
                          1
                        ));
                      }}
                      disabled={loading}
                      className="px-2 sm:px-3 py-2"
                      size="sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </Button>
                <input
                      type="month"
                      value={selectedWeek.substring(0, 7)}
                      onChange={(e) => setSelectedWeek(e.target.value + '-01')}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  disabled={loading}
                />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const currentDate = new Date(selectedWeek);
                        currentDate.setMonth(currentDate.getMonth() + 1);
                        setSelectedWeek(formatDateString(
                          currentDate.getFullYear(),
                          currentDate.getMonth(),
                          1
                        ));
                      }}
                      disabled={loading}
                      className="px-2 sm:px-3 py-2"
                      size="sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Button>
              </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const currentDate = new Date(selectedWeek);
                        
                        if (viewMode === 'half-month') {
                          // 半月表示の場合
                          const day = currentDate.getDate();
                          if (day >= 16) {
                            // 後半から前半へ
                            currentDate.setDate(1);
                          } else {
                            // 前半から前月後半へ
                            currentDate.setMonth(currentDate.getMonth() - 1);
                            currentDate.setDate(16);
                          }
                          setSelectedWeek(formatDateString(
                            currentDate.getFullYear(),
                            currentDate.getMonth(),
                            currentDate.getDate()
                          ));
                        } else if (viewMode === 'week') {
                          // 週表示の場合、前週の月曜日を取得
                          const weekMonday = getWeekMonday(currentDate);
                          const [yearStr, monthStr, dayStr] = weekMonday.split('-');
                          const year = parseInt(yearStr);
                          const month = parseInt(monthStr) - 1;
                          const day = parseInt(dayStr);
                          const prevWeekMonday = new Date(year, month, day - 7);
                          setSelectedWeek(formatDateString(
                            prevWeekMonday.getFullYear(),
                            prevWeekMonday.getMonth(),
                            prevWeekMonday.getDate()
                          ));
                        } else {
                          // 月表示の場合
                          currentDate.setMonth(currentDate.getMonth() - 1);
                          setSelectedWeek(formatDateString(
                            currentDate.getFullYear(),
                            currentDate.getMonth(),
                            1
                          ));
                        }
                      }}
                      disabled={loading}
                      className="px-2 sm:px-3 py-2"
                      size="sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                    </Button>
                    <input
                      type="date"
                      value={selectedWeek}
                      onChange={(e) => {
                        const selectedDate = new Date(e.target.value);
                        if (viewMode === 'week') {
                          // 週表示の場合、選択された日が含まれる週の月曜日を設定
                          const weekMonday = getWeekMonday(selectedDate);
                          setSelectedWeek(weekMonday);
                        } else if (viewMode === 'half-month') {
                          // 1日か16日に調整
                          const day = selectedDate.getDate();
                          selectedDate.setDate(day < 16 ? 1 : 16);
                          setSelectedWeek(formatDateString(
                            selectedDate.getFullYear(),
                            selectedDate.getMonth(),
                            selectedDate.getDate()
                          ));
                        } else {
                          // 月表示の場合、選択された日が含まれる月の1日を設定
                          setSelectedWeek(formatDateString(
                            selectedDate.getFullYear(),
                            selectedDate.getMonth(),
                            1
                          ));
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      disabled={loading}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const currentDate = new Date(selectedWeek);
                        
                        if (viewMode === 'half-month') {
                          // 半月表示の場合
                          const day = currentDate.getDate();
                          if (day >= 16) {
                            // 後半から次月前半へ
                            currentDate.setMonth(currentDate.getMonth() + 1);
                            currentDate.setDate(1);
                          } else {
                            // 前半から後半へ
                            currentDate.setDate(16);
                          }
                          setSelectedWeek(formatDateString(
                            currentDate.getFullYear(),
                            currentDate.getMonth(),
                            currentDate.getDate()
                          ));
                        } else if (viewMode === 'week') {
                          // 週表示の場合、次週の月曜日を取得
                          const weekMonday = getWeekMonday(currentDate);
                          const [yearStr, monthStr, dayStr] = weekMonday.split('-');
                          const year = parseInt(yearStr);
                          const month = parseInt(monthStr) - 1;
                          const day = parseInt(dayStr);
                          const nextWeekMonday = new Date(year, month, day + 7);
                          setSelectedWeek(formatDateString(
                            nextWeekMonday.getFullYear(),
                            nextWeekMonday.getMonth(),
                            nextWeekMonday.getDate()
                          ));
                        } else {
                          // 月表示の場合
                          currentDate.setMonth(currentDate.getMonth() + 1);
                          setSelectedWeek(formatDateString(
                            currentDate.getFullYear(),
                            currentDate.getMonth(),
                            1
                          ));
                        }
                      }}
                      disabled={loading}
                      className="px-2 sm:px-3 py-2"
                      size="sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                </Button>
                  </div>
                )}
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  シフト状況
                </label>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">
                    {shiftStatus.allConfirmed ? '✅ 確定済み' : 
                     shiftStatus.hasShifts ? '📝 下書き中' : '📝 未作成'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {shiftStatus.totalShifts}件のシフト
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* シフト表 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{selectedStoreData?.name} - シフト表</CardTitle>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setViewModalSelectedWeek(selectedWeek);
                  setViewModalViewMode(viewMode);
                  setIsViewModalOpen(true);
                }}
                className="text-xs sm:text-sm"
              >
                <svg className="w-4 h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                確定シフト閲覧
              </Button>
            </div>
          </CardHeader>
          <CardContent>
              {timeSlots.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-lg font-medium mb-2">時間帯が設定されていません</p>
                  <p className="text-sm mb-4">シフトを作成するには、まず店舗設定で時間帯を追加してください</p>
                  <Button onClick={() => window.location.href = '/settings/store'}>
                    店舗設定へ
                  </Button>
                </div>
              ) : (
                <>
            <div className="mb-3 sm:mb-4 p-3 bg-yellow-50 rounded-xl">
              <h4 className="font-medium text-yellow-900 mb-1 text-sm sm:text-base">操作方法</h4>
              <p className="text-xs sm:text-sm text-yellow-800">
                <span className="hidden lg:inline">各セルをクリックしてシフトを追加・編集できます。</span>
                <span className="lg:hidden">各セルをタップしてシフトを追加・編集できます。</span>
                色分け：🔴不足 / 🟢適正 / 🔵過剰
                {viewMode === 'month' && (
                  <><br />月表示では横スクロールで全日程を確認できます。</>
                )}
                <br />
                <span className="hidden lg:inline">💡 固定シフトで登録されたスタッフのシフトは自動的に確定済みで表示されます。</span>
                <span className="lg:hidden">💡 固定シフトは確定済みで表示されます。</span>
              </p>
            </div>

            {/* 勤怠ルール違反警告サマリー */}
            {hasViolations && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-red-800 mb-2">⚠️ 勤怠ルール違反が検出されました</h4>
                    <div className="text-sm text-red-700 space-y-1">
                      {currentViolations.slice(0, 3).map((violation, index) => (
                        <div key={index}>
                          <strong>{violation.userName}</strong> ({new Date(violation.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}日):
                          {violation.warnings.map((warning, wIndex) => (
                            <div key={wIndex} className="ml-2">• {warning}</div>
                          ))}
                        </div>
                      ))}
                      {currentViolations.length > 3 && (
                        <div className="text-red-600 text-xs">
                          ...他 {currentViolations.length - 3} 件の違反があります
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-red-600 mt-2">
                      ※ 労働基準法の遵守を推奨します。シフトの見直しをご検討ください。
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* PC・スマホ別シフト表 */}
            <DesktopShiftTable
              selectedStore={selectedStore}
              selectedWeek={selectedWeek}
              viewMode={viewMode}
              displayDates={displayDates}
              getRequiredStaff={getRequiredStaff}
              getShiftForSlot={getShiftForSlot}
              getEmergencyRequestForShift={getEmergencyRequestForShift}
              handleCellClick={handleCellClick}
              handleDeleteShift={handleDeleteShift}
              setContextMenu={setContextMenu}
              setEmergencyModal={setEmergencyModal}
              setEmergencyManagement={setEmergencyManagement}
              currentUser={currentUser}
              shifts={shifts}
              users={users}
              timeSlots={timeSlots}
            />
            
            <MobileShiftTable
              selectedStore={selectedStore}
              selectedWeek={selectedWeek}
              viewMode={viewMode}
              displayDates={displayDates}
              getRequiredStaff={getRequiredStaff}
              getShiftForSlot={getShiftForSlot}
              getEmergencyRequestForShift={getEmergencyRequestForShift}
              handleCellClick={handleCellClick}
              handleDeleteShift={handleDeleteShift}
              setContextMenu={setContextMenu}
              setEmergencyManagement={setEmergencyManagement}
              setEmergencyModal={setEmergencyModal}
              currentUser={currentUser}
              shifts={shifts}
              users={users}
              timeSlots={timeSlots}
            />
            </>
            )}
          </CardContent>
        </Card>

        {/* シフトパターン凡例 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">シフトパターン凡例</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {timeSlots.map((timeSlot) => (
                <div key={timeSlot.id} className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 border border-gray-200 rounded-lg sm:rounded-xl hover:bg-gray-50 transition-colors">
                  <div
                    className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-blue-500 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 text-sm sm:text-base truncate">{timeSlot.name}</div>
                    <div className="text-xs sm:text-sm text-gray-500">
                      {timeSlot.start_time}-{timeSlot.end_time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <h5 className="font-medium text-blue-900 mb-2 text-sm">ステータス表示</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-green-600">📌</span>
                  <span className="text-gray-700">固定シフト（自動配置）</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-blue-600">✅</span>
                  <span className="text-blue-800">確定済みシフト（編集不可）</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">📝</span>
                  <span className="text-gray-700">下書きシフト（編集可）</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-red-600">🆘</span>
                  <span className="text-gray-700">代打募集中</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-purple-600">⏰</span>
                  <span className="text-gray-700">カスタム時間設定</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400">+</span>
                  <span className="text-gray-700">空きスロット</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* シフト追加モーダル */}
        {isModalOpen && modalData && (
          <div 
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4"
            onClick={handleCloseModal}
          >
            <div 
              className="bg-white rounded-xl p-4 sm:p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">シフト追加</h3>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">{/* 日時表示 */}
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
                    {(() => {
                      const slot = timeSlots.find(ts => ts.id === modalData.timeSlot);
                      return slot ? `${slot.name} (${slot.start_time}-${slot.end_time})` : '';
                    })()}
                  </p>
                </div>

                {/* スタッフ選択 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    スタッフ選択 *
                  </label>
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
                  
                  {/* 固定シフトスタッフの情報表示（選択肢から除外されていることを通知） */}
                  {selectedTimeSlot && users.some(user => 
                    user.stores?.includes(selectedStore) && 
                    checkUserFixedShift(user.id, modalData.dayIndex, selectedTimeSlot)
                  ) && (
                    <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <p className="text-sm text-purple-700">
                          📌 この時間帯に固定シフトが設定されているスタッフは選択肢から除外されています
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* シフトパターン選択 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    シフトパターン *
                  </label>
                  <select
                    value={selectedTimeSlot}
                    onChange={(e) => handlePatternChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">パターンを選択してください</option>
                    {timeSlots.map(pattern => (
                      <option key={pattern.id} value={pattern.id}>
                        {pattern.name} ({pattern.start_time}-{pattern.end_time})
                      </option>
                    ))}
                  </select>
                </div>

                {/* カスタム時間調整 */}
                {selectedTimeSlot && (
                  <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                    <AnimatedToggle
                      checked={isCustomTime}
                      onChange={handleCustomTimeToggle}
                      label="勤務時間調整"
                      description="必要に応じて出勤・退勤時間をカスタマイズできます"
                    />

                    <div className={`
                      overflow-hidden transition-all duration-500 ease-in-out
                      ${isCustomTime ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                    `}>
                      <div className="grid grid-cols-1 gap-4 pt-4 border-t border-gray-100">
                        <CompactTimeSlider
                          value={customStartTime}
                          onChange={setCustomStartTime}
                          label="開始時間"
                        />
                        <CompactTimeSlider
                          value={customEndTime}
                          onChange={setCustomEndTime}
                          label="終了時間"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 勤怠ルール警告表示 */}
                {selectedUser && selectedTimeSlot && modalData && (() => {
                  const warnings = checkWorkRuleViolations(selectedUser, modalData.date, selectedTimeSlot);
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

                {/* プレビュー */}
                {selectedUser && selectedTimeSlot && (
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 transition-all duration-300">
                    <h4 className="font-medium text-blue-900 mb-1 flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      プレビュー
                    </h4>
                    <div className="text-sm text-blue-800 space-y-1">
                      <div className="font-medium">
                      {users.find(u => u.id === selectedUser)?.name} - {' '}
                        {timeSlots.find(p => p.id === selectedTimeSlot)?.name}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-4">
                        <span>勤務時間: {(() => {
                          const pattern = timeSlots.find(p => p.id === selectedTimeSlot);
                        if (!pattern) return '0時間';
                          
                          // カスタム時間が設定されている場合はそれを使用
                          const startTime = isCustomTime && customStartTime ? customStartTime : pattern.start_time;
                          const endTime = isCustomTime && customEndTime ? customEndTime : pattern.end_time;
                          
                          const start = startTime.split(':').map(Number);
                          const end = endTime.split(':').map(Number);
                          
                          const startMinutes = start[0] * 60 + start[1];
                          let endMinutes = end[0] * 60 + end[1];
                          
                          // 日をまたぐ場合の処理（終了時間が開始時間より小さい場合）
                          if (endMinutes <= startMinutes) {
                            endMinutes += 24 * 60; // 24時間（1440分）を加算
                          }
                          
                          const hours = Math.max(0, (endMinutes - startMinutes) / 60);
                          
                          return `${startTime}-${endTime} (${hours}時間)`;
                        })()}</span>
                        {isCustomTime && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                            ⚡ カスタム時間
                          </span>
                        )}
                      </div>
                      <div className="text-blue-700">
                        時給: ¥{selectedUser ? getHourlyWage(users.find(u => u.id === selectedUser)) : 0}
                      </div>
                    </div>
                  </div>
                )}

                {/* ボタン */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    variant="secondary"
                    onClick={handleCloseModal}
                    className="flex-1"
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleAddShift}
                    disabled={!selectedUser || !selectedTimeSlot || saving}
                    className="flex-1"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        追加中...
                      </>
                    ) : (
                      'シフト追加'
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
            {/* 下書きシフトの場合は確定ボタンを表示 */}
            {contextMenu.shift && contextMenu.shift.status === 'draft' && (
              <button
                onClick={() => handleConfirmSingleShift(contextMenu.shiftId)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              >
                <svg className="w-4 h-4 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                シフト確定
              </button>
            )}
            
            {/* 確定済みシフトの場合は代打募集ボタンを表示 */}
            {contextMenu.shift && contextMenu.shift.status === 'confirmed' && (
              <button
                onClick={() => {
                  if (contextMenu.shift) {
                    handleOpenEmergencyModal(contextMenu.shift);
                    handleCloseContextMenu();
                  }
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              >
                <svg className="w-4 h-4 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                代打募集
              </button>
            )}
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
                <h3 className="text-lg font-semibold text-gray-900">
                  {emergencyModal.shift?.request_type === 'shortage' ? '人員不足募集' : '代打募集'}
                </h3>
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
                  {emergencyModal.shift?.request_type === 'shortage' ? (
                    <>
                      <p className="font-medium text-gray-900">
                        {timeSlots.find(ts => ts.id === emergencyModal.shift!.time_slot_id)?.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {emergencyModal.shift?.date}
                        {emergencyModal.shift && timeSlots.find(ts => ts.id === emergencyModal.shift!.time_slot_id) && 
                          ` (${timeSlots.find(ts => ts.id === emergencyModal.shift!.time_slot_id)!.start_time}-${timeSlots.find(ts => ts.id === emergencyModal.shift!.time_slot_id)!.end_time})`
                        }
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-gray-900">
                        {emergencyModal.shift && users.find(u => u.id === emergencyModal.shift!.user_id)?.name} - {' '}
                        {emergencyModal.shift && timeSlots.find(ts => ts.id === emergencyModal.shift!.time_slot_id)?.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {emergencyModal.shift?.date}
                        {emergencyModal.shift && timeSlots.find(ts => ts.id === emergencyModal.shift!.time_slot_id) && 
                          ` (${timeSlots.find(ts => ts.id === emergencyModal.shift!.time_slot_id)!.start_time}-${timeSlots.find(ts => ts.id === emergencyModal.shift!.time_slot_id)!.end_time})`
                        }
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    募集理由 {emergencyModal.shift?.request_type !== 'shortage' && '*'}
                  </label>
                  {emergencyModal.shift?.request_type === 'shortage' ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-gray-50">
                      {emergencyModal.shift.reason}
                    </div>
                  ) : (
                    <textarea
                      value={emergencyReason}
                      onChange={(e) => setEmergencyReason(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      placeholder="代打募集の理由を入力してください（例：急用のため、体調不良のため）"
                    />
                  )}
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
                    onClick={() => emergencyModal.shift && handleCreateEmergencyRequest(emergencyModal.shift)}
                    disabled={(!emergencyModal.shift?.request_type && !emergencyReason.trim()) || submittingEmergency}
                  >
                    {submittingEmergency ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        募集開始中...
                      </>
                    ) : (
                      emergencyModal.shift?.request_type === 'shortage' ? '人員不足募集開始' : '代打募集開始'
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
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4"
            onClick={() => setEmergencyManagement({ show: false, request: null })}
          >
            <div 
              className="bg-white/90 backdrop-blur-md border border-white/20 shadow-2xl rounded-xl p-4 sm:p-6 w-full max-w-sm sm:max-w-3xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900">代打募集管理</h3>
                <button
                  onClick={() => setEmergencyManagement({ show: false, request: null })}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 -m-2"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 募集情報 */}
              <div className="p-3 sm:p-4 bg-white/50 backdrop-blur-sm rounded-lg mb-4 sm:mb-6 border border-white/30">
                <h4 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">募集内容</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                  <div>
                    <p className="text-gray-600 text-xs sm:text-sm">店舗</p>
                    <p className="font-medium text-sm sm:text-base">{emergencyManagement.request.stores?.name || '不明な店舗'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-xs sm:text-sm">日時</p>
                    <p className="font-medium text-sm sm:text-base">
                      {new Date(emergencyManagement.request.date).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long'
                      })}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-gray-600 text-xs sm:text-sm">シフト</p>
                    <p className="font-medium text-sm sm:text-base">
                      {emergencyManagement.request.time_slots?.name || '不明なシフト'} 
                      ({emergencyManagement.request.time_slots?.start_time || '00:00'}-{emergencyManagement.request.time_slots?.end_time || '00:00'})
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-xs sm:text-sm">元の担当者</p>
                    <p className="font-medium text-sm sm:text-base">{emergencyManagement.request.original_user?.name || '不明なユーザー'}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-gray-600 text-xs sm:text-sm">理由</p>
                  <p className="font-medium text-sm sm:text-base">{emergencyManagement.request.reason}</p>
                </div>
              </div>

              {/* 応募者一覧 */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">
                  応募者一覧 ({emergencyManagement.request.emergency_volunteers?.length || 0}名)
                </h4>
                
                {emergencyManagement.request.emergency_volunteers && emergencyManagement.request.emergency_volunteers.length > 0 ? (
                  <div className="space-y-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {emergencyManagement.request.emergency_volunteers.map((volunteer: any) => (
                      <div key={volunteer.id} className="border border-white/20 bg-white/40 backdrop-blur-sm rounded-lg p-3 sm:p-4">
                        <div className="flex flex-col space-y-3">
                          <div className="flex items-start space-x-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100/70 backdrop-blur-sm rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-blue-600 font-medium text-xs sm:text-sm">
                                {volunteer.users?.name?.charAt(0) || '?'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm sm:text-base">{volunteer.users?.name || '不明なユーザー'}</p>
                              <p className="text-xs sm:text-sm text-gray-600">
                                {volunteer.users?.skill_level === 'veteran' ? 'ベテラン' :
                                 volunteer.users?.skill_level === 'regular' ? '一般' : '研修中'}
                              </p>
                              <p className="text-xs text-gray-500">
                                応募日時: {new Date(volunteer.responded_at).toLocaleString('ja-JP')}
                              </p>
                              {volunteer.notes && (
                                <div className="mt-2 p-2 bg-blue-50/70 backdrop-blur-sm rounded text-xs sm:text-sm border border-blue-200/30">
                                  <p className="text-gray-600 font-medium">応募メモ:</p>
                                  <p className="text-gray-700">{volunteer.notes}</p>
                                </div>
                              )}
                              
                              {/* 時間編集セクション */}
                              {customApprovalTime.volunteerId === volunteer.id && customApprovalTime.showCustomTime && (
                                <div className="mt-3 p-3 bg-white/60 backdrop-blur-sm border border-white/40 rounded-lg">
                                  <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <h5 className="text-sm font-medium text-gray-900">勤務時間カスタマイズ</h5>
                                      <div className="text-xs text-gray-500 bg-blue-50/70 px-2 py-1 rounded">
                                        元: {emergencyManagement.request.time_slots?.start_time || '00:00'} - {emergencyManagement.request.time_slots?.end_time || '00:00'}
                                      </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <CompactTimeSlider
                                        value={customApprovalTime.startTime}
                                        onChange={(time) => setCustomApprovalTime(prev => ({
                                          ...prev,
                                          startTime: time
                                        }))}
                                        label="開始時間"
                                      />
                                      <CompactTimeSlider
                                        value={customApprovalTime.endTime}
                                        onChange={(time) => setCustomApprovalTime(prev => ({
                                          ...prev,
                                          endTime: time
                                        }))}
                                        label="終了時間"
                                      />
                                    </div>
                                    
                                    <div className="flex flex-col sm:flex-row gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          handleVolunteerAction(
                                            emergencyManagement.request.id, 
                                            volunteer.id, 
                                            'accept',
                                            customApprovalTime.startTime,
                                            customApprovalTime.endTime
                                          );
                                          setCustomApprovalTime({
                                            volunteerId: '',
                                            startTime: '',
                                            endTime: '',
                                            showCustomTime: false
                                          });
                                        }}
                                        className="bg-green-600 hover:bg-green-700 flex-1 text-xs sm:text-sm"
                                        disabled={processingVolunteer === volunteer.id}
                                      >
                                        {processingVolunteer === volunteer.id ? (
                                          <>
                                            <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white mr-2"></div>
                                            確定中...
                                          </>
                                        ) : (
                                          `✅ ${customApprovalTime.startTime}-${customApprovalTime.endTime}で採用`
                                        )}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setCustomApprovalTime({
                                          volunteerId: '',
                                          startTime: '',
                                          endTime: '',
                                          showCustomTime: false
                                        })}
                                        className="px-4 text-xs sm:text-sm"
                                      >
                                        キャンセル
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2">
                            {customApprovalTime.volunteerId !== volunteer.id && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const originalStartTime = emergencyManagement.request.time_slots?.start_time || '09:00';
                                    const originalEndTime = emergencyManagement.request.time_slots?.end_time || '17:00';
                                    setCustomApprovalTime({
                                      volunteerId: volunteer.id,
                                      startTime: originalStartTime,
                                      endTime: originalEndTime,
                                      showCustomTime: true
                                    });
                                  }}
                                  className="bg-blue-600 hover:bg-blue-700 text-xs flex-1 sm:flex-none"
                                >
                                  時間設定
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleVolunteerAction(emergencyManagement.request.id, volunteer.id, 'accept')}
                                  className="bg-green-600 hover:bg-green-700 text-xs flex-1 sm:flex-none"
                                  disabled={processingVolunteer === volunteer.id}
                                >
                                  {processingVolunteer === volunteer.id ? (
                                    <>
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                                      処理中
                                    </>
                                  ) : (
                                    'そのまま採用'
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleVolunteerAction(emergencyManagement.request.id, volunteer.id, 'reject')}
                                  className="text-xs border-red-300 text-red-600 hover:bg-red-50 flex-1 sm:flex-none"
                                  disabled={processingVolunteer === volunteer.id}
                                >
                                  削除
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 sm:py-8 text-gray-500 bg-white/30 backdrop-blur-sm rounded-lg border border-white/20">
                    <p className="text-sm sm:text-base">まだ応募者がいません</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 確定シフト閲覧モーダル */}
        {isViewModalOpen && (
          <div
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4"
            onClick={() => setIsViewModalOpen(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-[95vw] w-full max-h-[90vh] overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* モーダルヘッダー */}
              <div className="p-4 sm:p-6 border-b border-blue-200 bg-gradient-to-br from-blue-100 via-indigo-50 to-blue-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">確定シフト閲覧</h2>
                    <p className="text-sm text-gray-600 mt-1">確定済みシフトのみを表示（編集不可）</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsViewModalOpen(false)}
                    className="flex-shrink-0"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>

                {/* 表示期間切り替え */}
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex bg-white/80 backdrop-blur-sm border border-blue-200 p-1 rounded-lg shadow-sm">
                    <button
                      onClick={() => {
                        setViewModalViewMode('week');
                        setViewModalSelectedWeek(getAppropriateStartDate('week'));
                      }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                        viewModalViewMode === 'week'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      週表示
                    </button>
                    <button
                      onClick={() => {
                        setViewModalViewMode('half-month');
                        setViewModalSelectedWeek(getAppropriateStartDate('half-month'));
                      }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                        viewModalViewMode === 'half-month'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      半月表示
                    </button>
                    <button
                      onClick={() => {
                        setViewModalViewMode('month');
                        setViewModalSelectedWeek(getAppropriateStartDate('month'));
                      }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                        viewModalViewMode === 'month'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      月表示
                    </button>
                  </div>

                  {/* 週選択（週表示・半月表示の場合） */}
                  {(viewModalViewMode === 'week' || viewModalViewMode === 'half-month') && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = new Date(viewModalSelectedWeek);
                          const offset = viewModalViewMode === 'week' ? -7 : -14;
                          current.setDate(current.getDate() + offset);
                          setViewModalSelectedWeek(formatDateString(current.getFullYear(), current.getMonth(), current.getDate()));
                        }}
                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <input
                        type="date"
                        value={viewModalSelectedWeek}
                        onChange={(e) => setViewModalSelectedWeek(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <button
                        onClick={() => {
                          const current = new Date(viewModalSelectedWeek);
                          const offset = viewModalViewMode === 'week' ? 7 : 14;
                          current.setDate(current.getDate() + offset);
                          setViewModalSelectedWeek(formatDateString(current.getFullYear(), current.getMonth(), current.getDate()));
                        }}
                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* 月選択（月表示の場合） */}
                  {viewModalViewMode === 'month' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = new Date(viewModalSelectedWeek);
                          current.setMonth(current.getMonth() - 1);
                          setViewModalSelectedWeek(formatDateString(current.getFullYear(), current.getMonth(), 1));
                        }}
                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <input
                        type="month"
                        value={`${new Date(viewModalSelectedWeek).getFullYear()}-${String(new Date(viewModalSelectedWeek).getMonth() + 1).padStart(2, '0')}`}
                        onChange={(e) => {
                          const [year, month] = e.target.value.split('-');
                          setViewModalSelectedWeek(formatDateString(parseInt(year), parseInt(month) - 1, 1));
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <button
                        onClick={() => {
                          const current = new Date(viewModalSelectedWeek);
                          current.setMonth(current.getMonth() + 1);
                          setViewModalSelectedWeek(formatDateString(current.getFullYear(), current.getMonth(), 1));
                        }}
                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* モーダルコンテンツ */}
              <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-4 sm:p-6">
                {selectedStore && timeSlots.length > 0 ? (
                  <>
                    {/* PC・スマホ別シフト表（編集不可モード） */}
                    <DesktopShiftTable
                      selectedStore={selectedStore}
                      selectedWeek={viewModalSelectedWeek}
                      viewMode={viewModalViewMode}
                      displayDates={getViewModalDisplayDates}
                      getRequiredStaff={getRequiredStaff}
                      getShiftForSlot={getConfirmedShiftsForSlot}
                      getEmergencyRequestForShift={getEmergencyRequestForShift}
                      handleCellClick={() => {}} // クリック無効化
                      handleDeleteShift={() => {}} // 削除無効化
                      setContextMenu={() => {}} // コンテキストメニュー無効化
                      setEmergencyModal={() => {}} // 代打モーダル無効化
                      setEmergencyManagement={() => {}} // 代打管理無効化
                      currentUser={currentUser}
                      shifts={shifts.filter(s => s.status === 'confirmed')} // 確定済みシフトのみ
                      users={users}
                      timeSlots={timeSlots}
                      readOnly={true} // 閲覧専用モード
                    />
                    
                    <MobileShiftTable
                      selectedStore={selectedStore}
                      selectedWeek={viewModalSelectedWeek}
                      viewMode={viewModalViewMode}
                      displayDates={getViewModalDisplayDates}
                      getRequiredStaff={getRequiredStaff}
                      getShiftForSlot={getConfirmedShiftsForSlot}
                      getEmergencyRequestForShift={getEmergencyRequestForShift}
                      handleCellClick={() => {}} // クリック無効化
                      handleDeleteShift={() => {}} // 削除無効化
                      setContextMenu={() => {}} // コンテキストメニュー無効化
                      setEmergencyModal={() => {}} // 代打モーダル無効化
                      setEmergencyManagement={() => {}} // 代打管理無効化
                      currentUser={currentUser}
                      shifts={shifts.filter(s => s.status === 'confirmed')} // 確定済みシフトのみ
                      users={users}
                      timeSlots={timeSlots}
                      readOnly={true} // 閲覧専用モード
                    />
                  </>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p>店舗または時間帯が設定されていません</p>
                  </div>
                )}
              </div>

              {/* ステータス表示（凡例） */}
              <div className="border-t border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3 sm:mb-4">ステータス表示</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                  {/* 固定シフト */}
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 text-base sm:text-lg">📌</div>
                    <span className="text-xs sm:text-sm text-gray-700">固定シフト (自動配置)</span>
                  </div>

                  {/* 下書きシフト */}
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 text-base sm:text-lg">📝</div>
                    <span className="text-xs sm:text-sm text-gray-700">下書きシフト (編集可)</span>
                  </div>

                  {/* カスタム時間設定 */}
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 text-base sm:text-lg">⏰</div>
                    <span className="text-xs sm:text-sm text-gray-700">カスタム時間設定</span>
                  </div>

                  {/* 確定済みシフト */}
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 text-base sm:text-lg">✅</div>
                    <span className="text-xs sm:text-sm text-gray-700">確定済みシフト (編集不可)</span>
                  </div>

                  {/* 代打募集中 */}
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 text-base sm:text-lg">🆘</div>
                    <span className="text-xs sm:text-sm text-gray-700">代打募集中</span>
                  </div>

                  {/* 空きスロット */}
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 text-base sm:text-lg text-gray-600">+</div>
                    <span className="text-xs sm:text-sm text-gray-700">空きスロット</span>
                  </div>
                </div>
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