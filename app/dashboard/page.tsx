'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

import { supabase } from '@/lib/supabase';
import { DatabaseUser, DatabaseEmergencyRequest, TimeSlot, DatabaseFixedShift } from '@/lib/types';
import { getSubmissionPeriods } from '@/lib/utils';

// ダッシュボード専用の型定義
interface DashboardStats {
  totalShifts: number;
  pendingRequests: number;
  openEmergencies: number;
  totalStaff: number;
}

interface StoreStaffing {
  store: string;
  scheduled: number;
  required: number;
  status: 'sufficient' | 'insufficient' | 'no_setting' | 'no_assignment';
  details: {
    timeSlots: Array<{
      name: string;
      scheduled: number;
      required: number;
      status: 'sufficient' | 'insufficient' | 'no_setting';
    }>;
  };
}

interface DashboardShiftRequest {
  id: string;
  user_id: string;
  submission_period: string;
  date: string;
  priority: number;
  status: string;
  created_at: string;
  submitted_at: string;
  users?: DatabaseUser;
  stores?: { id: string; name: string };
  time_slots?: TimeSlot;
}

interface DashboardShift {
  id: string;
  user_id: string;
  store_id: string;
  date: string;
  pattern_id: string;
  status: 'draft' | 'confirmed' | 'completed';
}

interface DashboardStore {
  id: string;
  name: string;
  required_staff: {
    [day: string]: {
      [timeSlot: string]: number;
    };
  };
}

interface DashboardShiftPattern {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
  color: string;
  break_time: number;
}

// DatabaseEmergencyRequestを使用するため、この型定義は削除

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalShifts: 0,
    pendingRequests: 0,
    openEmergencies: 0,
    totalStaff: 0
  });
  const [storeStaffing, setStoreStaffing] = useState<StoreStaffing[]>([]);
  const [recentRequests, setRecentRequests] = useState<DashboardShiftRequest[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<DatabaseEmergencyRequest[]>([]);
  const [openEmergencies, setOpenEmergencies] = useState<DatabaseEmergencyRequest[]>([]);
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [stores, setStores] = useState<DashboardStore[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [shiftPatterns, setShiftPatterns] = useState<DashboardShiftPattern[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [timeSlots, setTimeSlots] = useState<{ [storeId: string]: TimeSlot[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<DatabaseUser | null>(null);
  const router = useRouter();
  
  useEffect(() => {
    // ローカルストレージからcurrentUserを取得
    const user = localStorage.getItem('currentUser');
    if (user) {
      setCurrentUser(JSON.parse(user));
    }
  }, []);

  // 代打募集に応募する関数
  const handleApplyEmergency = async (requestId: string) => {
    if (!currentUser) return;

    try {
      const response = await fetch('/api/emergency-volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergency_request_id: requestId,
          user_id: currentUser.id
        })
      });

      if (response.ok) {
        // データを再読み込み
        loadDashboardData();
        alert('代打募集に応募しました');
      } else {
        const errorData = await response.json();
        alert(errorData.error || '応募に失敗しました');
      }
    } catch (error) {
      console.error('応募エラー:', error);
      alert('応募に失敗しました');
    }
  };

  // loadDashboardDataをuseCallbackでメモ化
  const loadDashboardData = useCallback(async () => {
      try {
        setIsLoading(true);

        // currentUserが設定されていない場合は待機
        if (!currentUser?.id) {
          console.log('currentUser not set, waiting...');
          setIsLoading(false);
          return;
        }

      // 並列でデータを取得（企業フィルタリング対応）
      // キャッシュを無効化して最新データを取得
      const cacheOptions = { cache: 'no-store' as RequestCache };
      const [
        shiftsResponse,
        shiftRequestsResponse,
        emergencyResponse,
        usersResponse,
        storesResponse,
        timeSlotsResponse,
        fixedShiftsResponse
      ] = await Promise.all([
        fetch(`/api/shifts?current_user_id=${currentUser.id}`, cacheOptions), // 企業フィルタリング付き
        fetch(`/api/shift-requests?status=submitted&current_user_id=${currentUser.id}`, cacheOptions),
        fetch(`/api/emergency-requests?current_user_id=${currentUser.id}`, cacheOptions),
        fetch(`/api/users?current_user_id=${currentUser.id}`, cacheOptions),
        fetch(`/api/stores?current_user_id=${currentUser.id}`, cacheOptions),
        fetch(`/api/time-slots?current_user_id=${currentUser.id}`, cacheOptions),
        fetch(`/api/fixed-shifts?current_user_id=${currentUser.id}`, cacheOptions) // 固定シフトも取得
      ]);

      // emergency_requestsはAPIレスポンスから取得
      let emergencyData = [];
      if (emergencyResponse.ok) {
        const emergencyResult = await emergencyResponse.json();
        emergencyData = emergencyResult.data || [];
      } else {
        console.error('Emergency requests API error:', await emergencyResponse.text());
      }

      // shift_requestsはAPIレスポンスから取得
      let requestsData = [];
      if (shiftRequestsResponse.ok) {
        const shiftRequestsResult = await shiftRequestsResponse.json();
        requestsData = shiftRequestsResult.data || [];
      } else {
        console.error('Shift requests API error:', await shiftRequestsResponse.text());
      }

      // シフトデータを取得
      let shiftsData: DashboardShift[] = [];
      if (shiftsResponse.ok) {
        const shiftsResult = await shiftsResponse.json();
        shiftsData = (shiftsResult.data || []) as DashboardShift[];
        // 確定済みシフトの日付を詳しく確認
        const confirmedShifts = shiftsData.filter((s: DashboardShift) => s.status === 'confirmed');
        const confirmedShiftsDates = confirmedShifts.map((s: DashboardShift) => s.date).sort();
        const uniqueDates: string[] = [...new Set(confirmedShiftsDates)];
        
        console.log('📦 [DASHBOARD] シフトデータ取得:', {
          totalShifts: shiftsData.length,
          // 確定済みシフトの詳細
          confirmedShiftsCount: confirmedShifts.length,
          confirmedShiftsDates: uniqueDates.slice(0, 10), // 最初の10件の日付
          confirmedShiftsByDate: uniqueDates.slice(0, 10).map((date: string) => ({
            date: date,
            count: confirmedShifts.filter((s: DashboardShift) => s.date === date).length,
            shifts: confirmedShifts.filter((s: DashboardShift) => s.date === date).slice(0, 3).map((s: DashboardShift) => ({
              id: s.id,
              date: s.date,
              status: s.status,
              store_id: s.store_id,
              user_id: s.user_id
            }))
          })),
          // 今日の日付のシフトを確認（取得時点での日付を使用）
          todayShiftsInData: shiftsData.filter((s: DashboardShift) => {
            const now = new Date();
            const todayUTC = now.toISOString().split('T')[0];
            // 日本時間の今日の日付を正しく取得
            const japanNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
            const japanDateStr = japanNow.toISOString().split('T')[0];
            // より正確な方法: Intl.DateTimeFormatを使用
            const japanDateFormatter = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Tokyo',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            const todayJapan = japanDateFormatter.format(now);
            return s.date === todayUTC || s.date === todayJapan || s.date === japanDateStr;
          }).map((s: DashboardShift) => ({
            id: s.id,
            date: s.date,
            status: s.status,
            store_id: s.store_id,
            user_id: s.user_id
          })),
          // 日付の範囲を確認
          dateRange: shiftsData.length > 0 ? {
            min: shiftsData.map((s: DashboardShift) => s.date).sort()[0],
            max: shiftsData.map((s: DashboardShift) => s.date).sort().reverse()[0]
          } : null
        });
      } else {
        console.error('Shifts API error:', await shiftsResponse.text());
      }

      // 固定シフトデータを取得
      let fixedShiftsData = [];
      if (fixedShiftsResponse.ok) {
        const fixedShiftsResult = await fixedShiftsResponse.json();
        fixedShiftsData = fixedShiftsResult.data || [];
      } else {
        console.error('Fixed shifts API error:', await fixedShiftsResponse.text());
      }

      // 今日の日付
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const todayDayOfWeek = now.getDay();
      
      // 日本時間で今日の日付を取得（より正確に）
      // Intl.DateTimeFormatを使用して日本時間の日付を取得
      const japanDateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const todayJapan = japanDateFormatter.format(now);
      
      console.log('📅 [DASHBOARD DEBUG] 日付情報:', {
        todayUTC: today,
        todayJapan: todayJapan,
        todayDayOfWeek,
        nowISO: now.toISOString(),
        nowLocal: now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
        shiftsDataCount: shiftsData.length,
        fixedShiftsDataCount: fixedShiftsData.length,
        // 今日の日付に該当するシフトを確認
        shiftsForToday: shiftsData.filter((s: DashboardShift) => s.date === today || s.date === todayJapan).map((s: DashboardShift) => ({
          id: s.id,
          date: s.date,
          status: s.status,
          store_id: s.store_id,
          user_id: s.user_id
        }))
      });
      
      // 日本時間の今日の日付を使用
      const todayToUse = todayJapan;

      // 固定シフト例外（この日だけ表示しない固定シフト）を取得
      let fixedShiftExceptions: Array<{ fixed_shift_id: string; date: string }> = [];
      try {
        const exceptionsResponse = await fetch(`/api/fixed-shift-exceptions?date=${todayToUse}`);
        if (exceptionsResponse.ok) {
          const exceptionsResult = await exceptionsResponse.json();
          fixedShiftExceptions = (exceptionsResult.data || []).map((ex: any) => ({
            fixed_shift_id: ex.fixed_shift_id,
            date: ex.date
          }));
        } else {
          console.error('Fixed shift exceptions API error:', await exceptionsResponse.text());
        }
      } catch (error) {
        console.error('Fixed shift exceptions fetch error:', error);
      }

      const exceptionIdSet = new Set(
        fixedShiftExceptions
          .filter((ex) => ex.date === todayToUse)
          .map((ex) => ex.fixed_shift_id)
      );

      // 今日の固定シフトを取得（例外が設定されているものは除外）
      const todayFixedShifts = (fixedShiftsData as DatabaseFixedShift[])
        .filter((fs: DatabaseFixedShift) => 
          fs.day_of_week === todayDayOfWeek && 
          fs.is_active &&
          !exceptionIdSet.has(fs.id)
        )
        .map((fs: DatabaseFixedShift) => ({
          id: `fixed-${fs.id}`,
          user_id: fs.user_id,
          store_id: fs.store_id,
          date: todayToUse,
          time_slot_id: fs.time_slot_id,
          status: 'confirmed',
          isFixedShift: true
        }));

      console.log('📅 [DASHBOARD DEBUG] 固定シフト:', {
        todayFixedShiftsCount: todayFixedShifts.length,
        todayFixedShifts: todayFixedShifts.map((fs: { user_id: string; store_id: string; date: string }) => ({
          user_id: fs.user_id,
          store_id: fs.store_id,
          date: fs.date
        })),
        fixedShiftExceptionsForToday: Array.from(exceptionIdSet)
      });

      // 今日の通常シフトを取得（確定済みのみ）
      // UTCと日本時間の両方でチェック
      // 日付の比較をより柔軟に行う（タイムゾーンの違いを考慮）
      console.log('🔍 [DASHBOARD] シフトデータの詳細確認:', {
        totalShiftsInData: shiftsData.length,
        todayToUse: todayToUse,
        todayUTC: today,
        // 全シフトのステータス内訳
        allShiftsStatusBreakdown: shiftsData.reduce((acc, shift) => {
          acc[shift.status] = (acc[shift.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        // 確定済みシフトの総数（日付関係なく）
        totalConfirmedShifts: shiftsData.filter((s: DashboardShift) => s.status === 'confirmed').length,
        // 今日の日付のシフト（ステータス関係なく）
        todayShiftsAllStatus: shiftsData.filter((s: DashboardShift) => 
          s.date === todayToUse || s.date === today
        ).length
      });
      
      // 確定済みシフトの日付を詳しく確認
      const confirmedShiftsForDebug = shiftsData.filter((s: DashboardShift) => s.status === 'confirmed');
      console.log('🔍 [DASHBOARD] 確定済みシフトの日付確認:', {
        totalConfirmed: confirmedShiftsForDebug.length,
        todayToUse: todayToUse,
        todayUTC: today,
        // 確定済みシフトの日付一覧（重複排除）
        confirmedDates: [...new Set(confirmedShiftsForDebug.map(s => s.date))].sort(),
        // 今日の日付と一致する確定済みシフト
        confirmedForToday: confirmedShiftsForDebug.filter(s => 
          s.date === todayToUse || s.date === today
        ).map(s => ({
          id: s.id,
          date: s.date,
          status: s.status,
          store_id: s.store_id,
          user_id: s.user_id,
          matchesToday: s.date === todayToUse || s.date === today
        })),
        // 今日の日付に近い確定済みシフト（前後3日）
        confirmedNearToday: confirmedShiftsForDebug.filter(s => {
          const shiftDate = new Date(s.date);
          const todayDate = new Date(todayToUse);
          const diffDays = Math.abs((shiftDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 3;
        }).map(s => ({
          id: s.id,
          date: s.date,
          status: s.status,
          store_id: s.store_id,
          user_id: s.user_id,
          daysFromToday: Math.round((new Date(s.date).getTime() - new Date(todayToUse).getTime()) / (1000 * 60 * 60 * 24))
        }))
      });
      
      const allTodayShiftsRaw = shiftsData.filter((shift: DashboardShift) => {
        const shiftDate = shift.date;
        // 日付文字列を直接比較（YYYY-MM-DD形式）
        const matches = shiftDate === todayToUse || shiftDate === today;
        return matches;
      });
      
      console.log('📅 [DASHBOARD DEBUG] 今日の日付の全シフト:', {
        allTodayShiftsCount: allTodayShiftsRaw.length,
        todayToUse: todayToUse,
        todayUTC: today,
        allTodayShifts: allTodayShiftsRaw.map(s => ({
          id: s.id,
          date: s.date,
          status: s.status,
          store_id: s.store_id,
          user_id: s.user_id,
          matchesToday: s.date === todayToUse || s.date === today
        })),
        // ステータス別の内訳
        statusBreakdown: allTodayShiftsRaw.reduce((acc, shift) => {
          acc[shift.status] = (acc[shift.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        // デバッグ: 日付が一致しないシフトも確認
        shiftsNotMatching: shiftsData.filter((s: DashboardShift) => {
          const shiftDate = s.date;
          return shiftDate !== todayToUse && shiftDate !== today;
        }).slice(0, 5).map((s: DashboardShift) => ({
          id: s.id,
          date: s.date,
          status: s.status,
          dateDiff: Math.abs(new Date(s.date).getTime() - new Date(todayToUse).getTime()) / (1000 * 60 * 60 * 24)
        }))
      });

      // 確定済みシフトをフィルタリング（デバッグ用）
      // ※ 実際の店舗別人数計算は全ステータス（draft/confirmed/completed）を対象とする
      const todayRegularShifts = allTodayShiftsRaw.filter((shift: DashboardShift) => shift.status === 'confirmed');
      
      console.log('📅 [DASHBOARD DEBUG] 今日の確定済みシフト（シフト表で確定したもの）:', {
        todayRegularShiftsCount: todayRegularShifts.length,
        todayToUse: todayToUse,
        todayUTC: today,
        todayRegularShifts: todayRegularShifts.map(s => ({
          id: s.id,
          date: s.date,
          status: s.status,
          store_id: s.store_id,
          user_id: s.user_id
        })),
        // ステータス別の内訳（今日のシフト全体）
        statusBreakdown: allTodayShiftsRaw.reduce((acc, shift) => {
          acc[shift.status] = (acc[shift.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        // 確定済みでないシフトの詳細（デバッグ用）
        nonConfirmedShifts: allTodayShiftsRaw.filter(s => s.status !== 'confirmed').map(s => ({
          id: s.id,
          date: s.date,
          status: s.status,
          store_id: s.store_id,
          user_id: s.user_id
        }))
      });

      // 全てのシフトを結合（通常シフト全ステータス + 固定シフト）
      // 固定シフトは常に確定扱いとして含める
      const allTodayShifts = [...allTodayShiftsRaw, ...todayFixedShifts];
      
      // 今日の確定済みシフト数（確定済み通常シフト + 固定シフト）
      // 下書きシフトは含めない
      const todayShifts = allTodayShifts;
      
      console.log(`📅 [DASHBOARD] 今日の日付: ${todayToUse} (UTC: ${today})`);
      console.log(`📊 [DASHBOARD] 今日のシフト統計（固定シフト + 確定シフト）:`, {
        allShifts: allTodayShifts.length,
        confirmedShifts: todayShifts.length,
        regularShifts: todayRegularShifts.length, // シフト表で確定したシフト
        fixedShifts: todayFixedShifts.length, // 固定シフト
        draftShifts: allTodayShifts.filter(s => s.status === 'draft').length,
        statusBreakdown: allTodayShifts.reduce((acc, shift) => {
          const status = shift.isFixedShift ? 'fixed' : shift.status;
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        // ユニークなスタッフ数の確認
        uniqueStaffFromRegular: new Set(todayRegularShifts.map((s: DashboardShift) => s.user_id)).size,
        uniqueStaffFromFixed: new Set(todayFixedShifts.map((fs: { user_id: string }) => fs.user_id)).size,
        uniqueStaffTotal: new Set(allTodayShifts.map((s: DashboardShift | { user_id: string }) => s.user_id)).size,
        // デバッグ: 取得した全シフトデータの詳細
        allShiftsData: shiftsData.map((s: DashboardShift) => ({
          id: s.id,
          date: s.date,
          status: s.status,
          store_id: s.store_id,
          user_id: s.user_id
        })).filter((s: { date: string; status: string }) => s.date === today),
        todayRegularShiftsDetail: todayRegularShifts.map((s: DashboardShift) => ({
          id: s.id,
          date: s.date,
          status: s.status,
          store_id: s.store_id,
          user_id: s.user_id
        }))
      });
      const pendingRequestsArray = (requestsData as DashboardShiftRequest[]) || [];
      const pendingRequests = pendingRequestsArray.filter(req => req.status === 'submitted');
      const filteredEmergencies = (emergencyData as DatabaseEmergencyRequest[])?.filter(req => 
        req.status === 'open' && req.original_user_id !== currentUser?.id
      ) || [];
      
      // 日付順でソート
      const openEmergencies = [...filteredEmergencies].sort((a, b) => 
        new Date(a.date || '').getTime() - new Date(b.date || '').getTime()
      );

      // users と stores データをAPIレスポンスから取得
      let usersData = [];
      if (usersResponse.ok) {
        const usersResult = await usersResponse.json();
        usersData = usersResult.data || [];
      } else {
        console.error('Users API error:', await usersResponse.text());
      }

      let storesData = [];
      if (storesResponse.ok) {
        const storesResult = await storesResponse.json();
        storesData = storesResult.data || [];
        console.log('🏪 Stores データ取得成功:', storesData.map((store: DashboardStore) => ({
          name: store.name,
          hasRequiredStaff: !!store.required_staff,
          requiredStaffKeys: store.required_staff ? Object.keys(store.required_staff) : []
        })));
      } else {
        console.error('Stores API error:', await storesResponse.text());
      }

      // time_slotsレスポンス処理（staffingData計算前に必要）
      let timeSlotsData = [];
      if (timeSlotsResponse.ok) {
        const timeSlotsResult = await timeSlotsResponse.json();
        timeSlotsData = timeSlotsResult.data || [];
        console.log('⏰ Time Slots データ取得成功:', timeSlotsData);
      } else {
        console.error('Time slots API error:', await timeSlotsResponse.text());
      }

      // state変数を設定
      setUsers(usersData);
      setStores(storesData);
      setEmergencyRequests(emergencyData as DatabaseEmergencyRequest[]);
      setOpenEmergencies(openEmergencies);

      // 時間帯別の枠判定を行うヘルパー関数
      const getTimeSlotForPattern = (patternId: string, storeId: string): string | null => {
        const pattern = (shiftPatterns as DashboardShiftPattern[])?.find(p => p.id === patternId);
        if (!pattern) return null;

        const startTime = pattern.start_time.split(':').map(Number);
        if (startTime.length < 2 || isNaN(startTime[0]) || isNaN(startTime[1])) return null;

        const startMinutes = startTime[0] * 60 + startTime[1];

        // 動的時間帯の判定（該当店舗の時間帯設定を使用）
        const storeTimeSlots = timeSlots[storeId] || [];
        for (const slot of storeTimeSlots) {
          const [slotStartHour, slotStartMin] = slot.start_time.split(':').map(Number);
          const [slotEndHour, slotEndMin] = slot.end_time.split(':').map(Number);
          const slotStartMinutes = slotStartHour * 60 + slotStartMin;
          const slotEndMinutes = slotEndHour * 60 + slotEndMin;
          
          if (startMinutes >= slotStartMinutes && startMinutes < slotEndMinutes) {
            return slot.id;
      }
        }
        
        return null;
      };

      // 店舗別スタッフィング状況
      const staffingData = (storesData as DashboardStore[] || []).map(store => {
        // 確定シフトと固定シフトを結合
        const storeShifts = todayShifts.filter(shift => shift.store_id === store.id);
        
        console.log(`🏪 [${store.name}] 店舗別シフトフィルタリング詳細:`, {
          storeId: store.id,
          todayShiftsTotal: todayShifts.length,
          todayRegularShiftsCount: todayRegularShifts.length,
          todayFixedShiftsCount: todayFixedShifts.length,
          storeShiftsCount: storeShifts.length,
          storeShiftsDetail: storeShifts.map(s => ({
            id: s.id,
            user_id: s.user_id,
            date: s.date,
            status: s.status,
            isFixedShift: s.isFixedShift || false,
            store_id: s.store_id
          })),
          // 全シフトからこの店舗のシフトを確認
          allShiftsForStore: allTodayShifts.filter(s => s.store_id === store.id).map(s => ({
            id: s.id,
            user_id: s.user_id,
            date: s.date,
            status: s.status,
            isFixedShift: s.isFixedShift || false,
            store_id: s.store_id
          })),
          // 確定済み通常シフトからこの店舗のシフトを確認
          regularShiftsForStore: todayRegularShifts.filter((s: DashboardShift) => s.store_id === store.id).map((s: DashboardShift) => ({
            id: s.id,
            user_id: s.user_id,
            date: s.date,
            status: s.status,
            store_id: s.store_id
          })),
          // 固定シフトからこの店舗のシフトを確認
          fixedShiftsForStore: todayFixedShifts.filter((s: { store_id: string }) => s.store_id === store.id).map((s: { id: string; user_id: string; date: string; store_id: string }) => ({
            id: s.id,
            user_id: s.user_id,
            date: s.date,
            store_id: s.store_id
          }))
        });
        
        // 今日の曜日を取得
        const today = new Date();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayDayName = dayNames[today.getDay()];
        
        // 実際のシフト枠数（同じ人が複数シフトに入っていればその分だけカウント）
        const actualShiftCount = storeShifts.length;
        // 参考用にユニークなスタッフ数も算出（表示には使用しない）
        const uniqueStaffIds = new Set(storeShifts.map(shift => shift.user_id));
        const actualStaffCount = uniqueStaffIds.size;

        console.log(`🏪 [${store.name}] シフト内訳:`, {
          totalSlots: actualShiftCount,
          fixedSlots: storeShifts.filter(s => s.isFixedShift).length,
          confirmedSlots: storeShifts.filter(s => !s.isFixedShift && s.status === 'confirmed').length,
          uniqueStaff: actualStaffCount,
          uniqueStaffIds: Array.from(uniqueStaffIds)
        });
        
        console.log(`👥 [${store.name}] 今日のシフト:`, {
          totalShifts: actualShiftCount,
          uniqueStaff: actualStaffCount,
          shifts: storeShifts.map(s => ({ user_id: s.user_id, status: s.status, pattern_id: s.pattern_id }))
        });
        
        // required_staffから直接必要人数を計算（time_slotsに依存しない）
        let totalRequired = 0;
        
        console.log(`🏪 [${store.name}] 曜日: ${todayDayName}`, {
          hasRequiredStaff: !!store.required_staff,
          dayData: store.required_staff?.[todayDayName],
          requiredStaffKeys: store.required_staff ? Object.keys(store.required_staff) : []
        });
        
        if (store.required_staff && store.required_staff[todayDayName]) {
          const dayRequiredStaff = store.required_staff[todayDayName];
          
          // required_staffの時間帯別人数を直接合計
          Object.entries(dayRequiredStaff).forEach(([timeSlotId, required]) => {
            if (typeof required === 'number' && required > 0) {
              console.log(`   時間帯 ${timeSlotId}: ${required}人`);
              totalRequired += required;
            }
          });
        }
        
        console.log(`📊 [${store.name}] 必要人数合計: ${totalRequired}人`);
        console.log(`🔍 [${store.name}] デバッグ情報:`, {
          totalRequired,
          hasRequiredStaff: !!store.required_staff,
          hasRequiredStaffForToday: !!(store.required_staff && store.required_staff[todayDayName]),
          todayDayName,
          dayRequiredStaff: store.required_staff?.[todayDayName]
        });
        
        // デフォルト値は一切適用しない（設定値をそのまま使用）
        if (totalRequired === 0) {
          console.log(`ℹ️ [${store.name}] 必要人数設定なし → 0人として表示`);
        }

        // 充足判定: 実際のシフト枠数 >= 必要人数
        const status = actualShiftCount >= totalRequired ? 'sufficient' : 'insufficient';

        // 時間帯別の詳細情報（表示用）
        const timeSlotDetails = store.required_staff?.[todayDayName] 
          ? Object.entries(store.required_staff[todayDayName]).map(([timeSlotId, required]) => {
              const slotShifts = storeShifts.filter(shift => getTimeSlotForPattern(shift.pattern_id, store.id) === timeSlotId);
              return {
                name: timeSlotId,
                scheduled: slotShifts.length,
                required: typeof required === 'number' ? required : 0,
                status: slotShifts.length >= (typeof required === 'number' ? required : 0) ? 'sufficient' : 'insufficient'
              };
            })
          : [];

        return {
          store: store.name,
          // 店舗別出勤状況では「シフト枠数」を人数として扱う
          scheduled: actualShiftCount,
          required: totalRequired,
          status,
          details: {
            timeSlots: timeSlotDetails
          }
        } as StoreStaffing;
      });

      // 全店舗のシフト人数の合計を計算（各店舗のユニークなスタッフ数の合計）
      const totalStaffCount = staffingData.reduce((sum, staffing) => sum + staffing.scheduled, 0);

      console.log(`📊 [DASHBOARD] 全店舗のシフト人数合計: ${totalStaffCount}人（固定シフト + 確定シフト）`, {
        breakdown: staffingData.map(s => ({ 
          store: s.store, 
          count: s.scheduled, 
          required: s.required, 
          status: s.status 
        })),
        todayShiftsCount: todayShifts.length,
        todayRegularShiftsCount: todayRegularShifts.length, // シフト表で確定したシフト
        todayFixedShiftsCount: todayFixedShifts.length, // 固定シフト
        // 店舗別の内訳
        storeBreakdown: staffingData.map(s => {
          const storeRegularShifts = todayRegularShifts.filter((shift: DashboardShift) => {
            const store = storesData.find((st: DashboardStore) => st.name === s.store);
            return store && shift.store_id === store.id;
          });
          const storeFixedShifts = todayFixedShifts.filter((shift: { store_id: string }) => {
            const store = storesData.find((st: DashboardStore) => st.name === s.store);
            return store && shift.store_id === store.id;
          });
          return {
            store: s.store,
            scheduled: s.scheduled,
            regularShiftsCount: storeRegularShifts.length,
            fixedShiftsCount: storeFixedShifts.length,
            uniqueStaffFromRegular: new Set(storeRegularShifts.map((s: DashboardShift) => s.user_id)).size,
            uniqueStaffFromFixed: new Set(storeFixedShifts.map((s: { user_id: string }) => s.user_id)).size
          };
        }),
        timestamp: new Date().toISOString()
      });

      // 統計情報を設定（企業フィルタリング済みデータ）
      setStats({
        totalShifts: totalStaffCount, // 各店舗のシフト人数の合計
        pendingRequests: pendingRequests.length,
        openEmergencies: openEmergencies.length,
        totalStaff: usersData.length || 0 // 企業別スタッフ数
      });

      // 店舗ごとのtimeSlots配列を構築  
      const timeSlotsByStore: { [storeId: string]: TimeSlot[] } = {};
      storesData.forEach((store: DashboardStore) => {
        timeSlotsByStore[store.id] = timeSlotsData.filter((slot: TimeSlot) => slot.store_id === store.id);
        console.log(`🕐 [${store.name}] 時間帯データ:`, timeSlotsByStore[store.id].map(slot => ({
          id: slot.id,
          name: slot.name,
          start_time: slot.start_time,
          end_time: slot.end_time
        })));
      });

      setStoreStaffing(staffingData);
      setRecentRequests((requestsData as DashboardShiftRequest[])?.slice(0, 3) || []);
      setUsers((usersData as DatabaseUser[]) || []);
      setStores((storesData as DashboardStore[]) || []);
      setTimeSlots(timeSlotsByStore); // ⭐ 重要: timeSlots stateを設定
      setShiftPatterns((timeSlotsData as DashboardShiftPattern[]) || []); // time_slotsをshift_patternsとして使用

    } catch (error) {
      console.error('Dashboard data loading error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    // currentUserが設定された後にデータを読み込み
    if (currentUser) {
      loadDashboardData();
      
      // localStorageに保存されたシフト確定情報をチェック（イベントが発火された後にマウントされた場合）
      const lastShiftConfirm = localStorage.getItem('lastShiftConfirm');
      if (lastShiftConfirm) {
        try {
          const confirmInfo = JSON.parse(lastShiftConfirm);
          const confirmTime = new Date(confirmInfo.timestamp);
          const now = new Date();
          const timeDiff = now.getTime() - confirmTime.getTime();
          
          // 5分以内のシフト確定であれば、自動的に更新
          if (timeDiff < 5 * 60 * 1000) {
            console.log('🔄 [DASHBOARD] localStorageからシフト確定情報を検出、自動更新を実行', {
              confirmInfo,
              timeDiffSeconds: Math.floor(timeDiff / 1000)
            });
            setTimeout(() => {
              loadDashboardData();
              // 処理済みなので削除
              localStorage.removeItem('lastShiftConfirm');
            }, 1000);
          } else {
            // 古い情報は削除
            localStorage.removeItem('lastShiftConfirm');
          }
        } catch (error) {
          console.error('❌ [DASHBOARD] localStorageのシフト確定情報の解析エラー:', error);
          localStorage.removeItem('lastShiftConfirm');
        }
      }
    }
  }, [currentUser, loadDashboardData]);

  // シフト確定時の自動更新をリッスン
  useEffect(() => {
    console.log('🎧 [DASHBOARD] イベントリスナーを設定', {
      currentUser: currentUser?.id,
      timestamp: new Date().toISOString()
    });

    const handleDashboardRefresh = (event?: Event) => {
      console.log('🔄 [DASHBOARD] ダッシュボード自動更新イベントを受信', {
        eventType: event?.type,
        currentUser: currentUser?.id,
        eventDetail: (event as CustomEvent)?.detail,
        timestamp: new Date().toISOString()
      });
      
      if (currentUser) {
        // localStorageのシフト確定情報を削除（イベントが受信されたので処理済み）
        localStorage.removeItem('lastShiftConfirm');
        
        // データベースの更新が反映されるまで少し待機してからデータを取得
        setTimeout(() => {
          console.log('🔄 [DASHBOARD] ダッシュボードデータを再読み込み開始', {
            currentUser: currentUser.id,
            timestamp: new Date().toISOString()
          });
          loadDashboardData();
        }, 500); // 500ms待機してからデータ取得（データベース更新の反映を待つ）
      } else {
        console.warn('⚠️ [DASHBOARD] currentUserが設定されていません');
      }
    };

    window.addEventListener('dashboardRefresh', handleDashboardRefresh);
    window.addEventListener('updateShiftRequestNotifications', handleDashboardRefresh);
    console.log('✅ [DASHBOARD] dashboardRefreshイベントリスナーを登録しました');

    return () => {
      console.log('🗑️ [DASHBOARD] dashboardRefreshイベントリスナーを削除します');
      window.removeEventListener('dashboardRefresh', handleDashboardRefresh);
      window.removeEventListener('updateShiftRequestNotifications', handleDashboardRefresh);
    };
  }, [currentUser, loadDashboardData]);

  if (isLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">データを読み込み中...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  const userRole = currentUser?.role;

  return (
    <AuthenticatedLayout>
      <div className="space-y-8">
        {/* ヘッダー */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-gray-600 mt-2">
            {new Date().toLocaleDateString('ja-JP', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              weekday: 'long'
            })}
          </p>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">今日のシフト</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.totalShifts}</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">人の勤務予定</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">代打募集中</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-orange-600">{stats.openEmergencies}</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">件の募集</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">未確認希望</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-red-600">{stats.pendingRequests}</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">件の希望</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">総スタッフ数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-green-600">{stats.totalStaff}</div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">人のスタッフ</p>
            </CardContent>
          </Card>
        </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          {/* 今日の店舗別出勤状況 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">今日の店舗別出勤状況</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3 sm:space-y-4">
                {storeStaffing.map((staffing, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 text-sm sm:text-base">{staffing.store}</p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {staffing.scheduled} / {staffing.required} 人
                        </p>
                      </div>
                      <div className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                      staffing.status === 'sufficient'
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                      {staffing.status === 'sufficient' ? '充足' : '不足'}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* 代打募集セクション */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span>代打募集</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => router.push('/emergency-management')}
                    size="sm"
                    className="flex-1 sm:flex-none text-xs sm:text-sm"
                  >
                    募集作成
                  </Button>
                  {userRole === 'manager' && (
                    <Button
                      onClick={() => router.push('/emergency-management?tab=manage')}
                      variant="secondary"
                      size="sm" 
                      className="flex-1 sm:flex-none text-xs sm:text-sm"
                    >
                      応募管理
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {openEmergencies.length === 0 ? (
                <p className="text-gray-500 text-sm">現在、代打募集はありません</p>
              ) : (
                <div className="space-y-3">
                  {openEmergencies.slice(0, 3).map((emergency: DatabaseEmergencyRequest) => (
                    <div 
                      key={emergency.id} 
                      className={`border-l-4 border-orange-400 pl-3 ${
                        userRole === 'manager' 
                          ? 'cursor-pointer hover:bg-gray-50 transition-colors rounded-r-lg p-2 -ml-2' 
                          : ''
                      }`}
                      onClick={userRole === 'manager' ? () => router.push(`/emergency-management?tab=manage&manage=${emergency.id}`) : undefined}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                                                  <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {users.find(u => u.id === emergency.original_user_id)?.name || '不明なユーザー'}さん
                              </p>
                              {emergency.request_type === 'shortage' && (
                                <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                                  人員不足
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              {new Date(emergency.date || '').toLocaleDateString('ja-JP', { 
                                month: 'numeric', 
                                day: 'numeric', 
                                weekday: 'short' 
                              })} | {stores.find(s => s.id === emergency.store_id)?.name || '不明な店舗'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              📝 {emergency.reason}
                            </p>
                            {emergency.emergency_volunteers && emergency.emergency_volunteers.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {emergency.emergency_volunteers.map((volunteer) => (
                                  <span key={volunteer.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                                    {volunteer.user?.name || '不明なスタッフ'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                            {userRole === 'manager' && (emergency.emergency_volunteers?.length || 0) > 0 && (
                              <>
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full whitespace-nowrap">
                                  応募{emergency.emergency_volunteers?.length || 0}名
                                </span>
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/emergency-management?tab=manage&manage=${emergency.id}`);
                                  }}
                                  size="sm"
                                  variant="secondary"
                                  className="text-xs whitespace-nowrap w-full sm:w-auto"
                                >
                                  応募確認
                                </Button>
                              </>
                            )}
                            {userRole === 'staff' && !emergency.emergency_volunteers?.some(v => v.user_id === currentUser?.id) && (
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApplyEmergency(emergency.id);
                                }}
                                size="sm"
                                className="text-xs whitespace-nowrap w-full sm:w-auto"
                              >
                                応募する
                              </Button>
                            )}
                          </div>
                      </div>
                    </div>
                  ))}
                  {openEmergencies.length > 3 && (
                    <div className="text-center">
                      <Button
                        onClick={() => router.push('/emergency-management')}
                        variant="ghost"
                        size="sm"
                        className="text-blue-600 hover:text-blue-700 text-sm"
                      >
                        すべて見る ({openEmergencies.length}件)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 最近のシフト希望 */}
          <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>最近のシフト希望</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
              onClick={() => router.push('/shift-requests')}
                >
              すべて表示
                </Button>
            </CardHeader>
            <CardContent>
            <div className="space-y-3">
              {recentRequests.length > 0 ? (
                recentRequests.map((request) => {
                  const user = users.find(u => u.id === request.user_id);
                  const submissionPeriods = getSubmissionPeriods();
                  const period = submissionPeriods.find(p => p.id === request.submission_period);
                  
                  return (
                    <div key={request.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{user?.name || '不明なユーザー'}</p>
                        <p className="text-sm text-gray-500">
                          {request.date} - {period?.label || request.submission_period} 
                          (優先度: {request.priority === 1 ? '最優先' : request.priority === 2 ? '希望' : '可能'})
                        </p>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        request.status === 'submitted' 
                          ? 'bg-blue-100 text-blue-800'
                          : request.status === 'converted_to_shift'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                        }`}>
                        {request.status === 'submitted' ? '提出済み' : 
                         request.status === 'converted_to_shift' ? 'シフト化済み' : request.status}
                        </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-4">シフト希望はありません</p>
              )}
            </div>
            </CardContent>
          </Card>

        {/* クイックアクション */}
        <Card>
          <CardHeader>
            <CardTitle>クイックアクション</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                className="h-16 flex flex-col items-center justify-center space-y-1"
                onClick={() => router.push('/shift/create')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>新しいシフト作成</span>
              </Button>
              
              <Button 
                variant="secondary" 
                className="h-16 flex flex-col items-center justify-center space-y-1"
                onClick={() => router.push('/staff')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                <span>スタッフ管理</span>
              </Button>
              
              <Button 
                variant="secondary" 
                className="h-16 flex flex-col items-center justify-center space-y-1"
                onClick={() => router.push('/settings/store')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>店舗設定</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
} 