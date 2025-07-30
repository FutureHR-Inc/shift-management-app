// 基本型定義
export interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: 'manager' | 'staff';
  stores: string[];
  skillLevel: 'training' | 'regular' | 'veteran';
  memo?: string;
}

export interface Store {
  id: string;
  name: string;
  requiredStaff: {
    [dayOfWeek: string]: {
      [timeSlot: string]: number;
    };
  };
  flexibleStaff: string[]; // 応援可能なスタッフID
}

export interface ShiftPattern {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  breakTime?: number; // 分単位
}

export interface Shift {
  id: string;
  userId: string;
  storeId: string;
  date: string;
  patternId: string;
  status: 'draft' | 'confirmed' | 'completed';
  notes?: string;
}

export interface TimeOffRequest {
  id: string;
  userId: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  respondedAt?: string;
  respondedBy?: string;
}

export interface EmergencyRequest {
  id: string;
  originalUserId: string;
  storeId: string;
  date: string;
  shiftPatternId: string;
  reason: string;
  status: 'open' | 'filled' | 'cancelled';
  createdAt: string;
  volunteers: {
    userId: string;
    respondedAt: string;
  }[];
}

// 追加型定義

// 緊急応募ボランティア
export interface EmergencyVolunteer {
  id: string;
  emergency_request_id: string;
  user_id: string;
  created_at: string;
  user?: DatabaseUser;
}

// データベースから取得するシフト詳細情報
export interface DatabaseShift {
  id: string;
  user_id: string;
  store_id: string;
  date: string;
  shift_pattern_id: string;
  status: 'draft' | 'confirmed' | 'completed';
  notes?: string;
  created_at: string;
  updated_at: string;
  users?: DatabaseUser;
  stores?: DatabaseStore;
  shift_patterns?: ShiftPattern;
}

// データベースから取得する店舗情報
export interface DatabaseStore {
  id: string;
  name: string;
  required_staff: Record<string, Record<string, number>>;
  work_rules?: {
    max_weekly_hours?: number;
    max_consecutive_days?: number;
    min_rest_hours?: number;
  } | null;
  created_at: string;
  updated_at: string;
}

// データベースから取得する緊急要請情報
export interface DatabaseEmergencyRequest {
  id: string;
  original_user_id: string;
  store_id: string;
  date: string;
  shift_pattern_id: string;
  reason: string;
  status: 'open' | 'filled' | 'cancelled';
  created_at: string;
  emergency_volunteers?: EmergencyVolunteer[];
  users?: DatabaseUser;
  stores?: DatabaseStore;
  shift_patterns?: ShiftPattern;
}

// ダッシュボード用の型定義
export interface StoreStaffing {
  store_id: string;
  store_name: string;
  total_shifts: number;
  assigned_shifts: number;
  staffing_percentage: number;
}

export interface DashboardStats {
  totalShifts: number;
  assignedShifts: number;
  pendingRequests: number;
  openEmergencies: number;
  totalStaff: number;
}

export interface DashboardTimeOffRequest {
  id: string;
  user_id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  users?: DatabaseUser;
}

// UI用の型定義
export interface ContextMenu {
  show: boolean;
  x: number;
  y: number;
  shiftId: string;
  shift: DatabaseShift | null;
}

export interface EmergencyModal {
  show: boolean;
  shift: DatabaseShift | null;
}

// Supabase用の型定義
export interface UserStore {
  store_id: string;
  store?: Store;
}

export interface DatabaseUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'manager' | 'staff';
  skill_level: 'training' | 'regular' | 'veteran';
  memo?: string;
  user_stores?: UserStore[];
}

// API エラー型
export interface ApiError {
  code?: string;
  message: string;
  details?: unknown;
}

// フォームイベント用の型定義
export type FormEvent = React.FormEvent<HTMLFormElement>;
export type ChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

// 時間帯管理用の型定義
export interface TimeSlot {
  id: string;
  store_id: string;
  name: string;
  start_time: string; // "HH:MM" format
  end_time: string;   // "HH:MM" format
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

// 時間帯作成・更新用の型
export interface TimeSlotInput {
  name: string;
  start_time: string;
  end_time: string;
  display_order?: number;
} 