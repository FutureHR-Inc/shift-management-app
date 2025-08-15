import { useState, useEffect } from 'react';

// 型定義（既存の型を再利用）
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'manager' | 'staff';
  skillLevel: 'training' | 'regular' | 'veteran';
  hourlyWage: number;
}

export interface TimeSlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  store_id: string;
  display_order: number;
}

export interface Shift {
  id: string;
  userId: string;
  storeId: string;
  date: string;
  timeSlotId: string;
  status: 'draft' | 'confirmed';
  customStartTime?: string;
  customEndTime?: string;
  notes?: string;
  isFixedShift?: boolean;
  fixedShiftData?: any;
}

export interface DatabaseFixedShift {
  id: string;
  user_id: string;
  store_id: string;
  day_of_week: number;
  time_slot_id: string;
  is_active: boolean;
  users?: any;
  stores?: any;
  time_slots?: any;
}

export const useShiftData = (selectedStore: string, selectedWeek: string, viewMode: string) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [fixedShifts, setFixedShifts] = useState<DatabaseFixedShift[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<any[]>([]);
  const [approvedTimeOffRequests, setApprovedTimeOffRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // データ取得関数（既存のfetch関数をそのまま移植）
  const fetchTimeSlots = async (storeId: string) => {
    try {
      const response = await fetch(`/api/time-slots?store_id=${storeId}`);
      if (!response.ok) throw new Error('時間帯データの取得に失敗しました');
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Error fetching time slots:', error);
      return [];
    }
  };

  const fetchFixedShifts = async (storeId: string) => {
    try {
      const response = await fetch(`/api/fixed-shifts?store_id=${storeId}&is_active=true`);
      if (!response.ok) throw new Error('固定シフトデータの取得に失敗しました');
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Error fetching fixed shifts:', error);
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

      const response = await fetch(`/api/shifts?store_id=${storeId}&date_from=${startDate}&date_to=${actualEndDate}`);
      if (!response.ok) throw new Error('シフトデータの取得に失敗しました');
      const result = await response.json();
      
      return (result.data || []).map((shift: any) => ({
        id: shift.id,
        userId: shift.user_id,
        storeId: shift.store_id,
        date: shift.date,
        timeSlotId: shift.time_slot_id || shift.shift_pattern_id,
        status: shift.status,
        customStartTime: shift.custom_start_time,
        customEndTime: shift.custom_end_time,
        notes: shift.notes
      }));
    } catch (error) {
      console.error('Error fetching shifts:', error);
      return [];
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('ユーザーデータの取得に失敗しました');
      const result = await response.json();
      
      return (result.data || []).map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        skillLevel: user.skill_level,
        hourlyWage: user.hourly_wage
      }));
    } catch (error) {
      console.error('Error fetching users:', error);
      return [];
    }
  };

  const fetchEmergencyRequests = async (storeId: string, startDate: string, endDate: string) => {
    try {
      const response = await fetch(`/api/emergency-requests?store_id=${storeId}&date_from=${startDate}&date_to=${endDate}`);
      if (!response.ok) throw new Error('代打募集データの取得に失敗しました');
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Error fetching emergency requests:', error);
      return [];
    }
  };

  const fetchApprovedTimeOffRequests = async (startDate: string, endDate: string) => {
    try {
      const response = await fetch(`/api/time-off-requests?date_from=${startDate}&date_to=${endDate}&status=approved`);
      if (!response.ok) throw new Error('休暇申請データの取得に失敗しました');
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Error fetching time off requests:', error);
      return [];
    }
  };

  // データ読み込み
  useEffect(() => {
    const loadData = async () => {
      if (!selectedStore) return;
      
      try {
        setLoading(true);
        setError(null);

        // 店舗データ読み込み
        const [timeSlotsData, fixedShiftsData, usersData] = await Promise.all([
          fetchTimeSlots(selectedStore),
          fetchFixedShifts(selectedStore),
          fetchUsers()
        ]);
        
        setTimeSlots(timeSlotsData);
        setFixedShifts(fixedShiftsData);
        setUsers(usersData);

        // シフトデータ読み込み
        if (selectedWeek) {
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
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : '不明なエラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedStore, selectedWeek, viewMode]);

  // 固定シフトを含むシフト取得
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

        return shift.timeSlotId === timeSlot;
      });

      // 固定シフトをチェックして追加
      const dayOfWeek = new Date(date).getDay();
      const fixedShiftsForSlot = fixedShifts.filter(fixedShift => 
        fixedShift.day_of_week === dayOfWeek &&
        fixedShift.time_slot_id === timeSlot &&
        fixedShift.store_id === selectedStore &&
        fixedShift.is_active
      );

      // 固定シフトユーザーが既に通常のシフトに入っているかチェック
      const existingUserIds = regularShifts.map(shift => shift.userId);
      
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

      return [...regularShifts, ...fixedShiftsAsShifts];
    } catch (error) {
      console.error('Error in getShiftForSlot:', error);
      return [];
    }
  };

  return {
    // データ
    shifts,
    users,
    timeSlots,
    fixedShifts,
    emergencyRequests,
    approvedTimeOffRequests,
    loading,
    error,
    
    // 関数
    getShiftForSlot,
    setShifts,
    setError
  };
}; 