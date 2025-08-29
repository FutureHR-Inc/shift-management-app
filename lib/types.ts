// 基本型定義
export interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: 'manager' | 'staff';
  stores: string[];
  skillLevel: 'training' | 'regular' | 'veteran';
  hourlyWage?: number; // 時給（円）
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
  timeSlotId: string; // pattern_id から time_slot_id に変更
  status: 'draft' | 'confirmed' | 'completed';
  customStartTime?: string; // カスタム開始時間 "HH:MM"
  customEndTime?: string;   // カスタム終了時間 "HH:MM"
  notes?: string;
  isFixedShift?: boolean;
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
  notes?: string; // 応募時のメモ
  responded_at: string; // 応募日時
  created_at: string;
  user?: DatabaseUser;
}

// データベースから取得するシフト詳細情報
export interface DatabaseShift {
  id: string;
  user_id: string;
  store_id: string;
  date: string;
  time_slot_id: string; // shift_pattern_id から time_slot_id に変更
  status: 'draft' | 'confirmed' | 'completed';
  custom_start_time?: string; // カスタム開始時間
  custom_end_time?: string;   // カスタム終了時間
  notes?: string;
  created_at: string;
  updated_at: string;
  request_type?: 'substitute' | 'shortage';
  reason?: string;
  users?: DatabaseUser;
  stores?: DatabaseStore;
  time_slots?: TimeSlot; // shift_patterns から time_slots に変更
}

// データベースから取得する店舗情報
export interface DatabaseStore {
  id: string;
  name: string;
  address: string;
  phone: string;
  required_staff: {
    [timeSlotId: string]: number;
  };
  created_at: string;
  updated_at: string;
}

// シフト希望提出関連の型定義
export interface ShiftRequest {
  id: string;
  userId: string;
  storeId: string;
  submissionPeriod: string; // '2024-01-first', '2024-01-second'
  date: string;
  timeSlotId?: string;
  preferredStartTime?: string;
  preferredEndTime?: string;
  priority: 1 | 2 | 3; // 1:最優先, 2:希望, 3:可能
  notes?: string;
  status: 'submitted' | 'approved' | 'rejected' | 'converted_to_shift';
  submittedAt: string;
  createdAt: string;
}

export interface DatabaseShiftRequest {
  id: string;
  user_id: string;
  store_id: string;
  submission_period: string;
  date: string;
  time_slot_id: string | null;
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  priority: number;
  notes: string | null;
  status: 'submitted' | 'approved' | 'rejected' | 'converted_to_shift';
  submitted_at: string;
  created_at: string;
  users?: DatabaseUser;
  stores?: DatabaseStore;
  time_slots?: TimeSlot;
}

export interface SubmissionPeriod {
  id: string;
  label: string; // '2024年1月前半', '2024年1月後半'
  startDate: string;
  endDate: string;
  submissionDeadline: string;
  isSubmissionOpen: boolean;
  isCurrentPeriod: boolean;
}

// 固定シフト（固定出勤）
export interface FixedShift {
  id: string;
  userId: string;
  storeId: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  timeSlotId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user?: User;
  store?: Store;
  timeSlot?: TimeSlot;
}

export interface DatabaseFixedShift {
  id: string;
  user_id: string;
  store_id: string;
  day_of_week: number;
  time_slot_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  users?: DatabaseUser;
  stores?: DatabaseStore;
  time_slots?: TimeSlot;
}

// データベースから取得する緊急募集リクエスト詳細情報
export interface DatabaseEmergencyRequest {
  id: string;
  original_user_id: string;
  store_id: string;
  date: string;
  shift_pattern_id?: string; // 旧フィールド（移行期間のため）
  time_slot_id?: string; // 新フィールド
  reason: string;
  status: 'open' | 'filled' | 'cancelled';
  created_at: string;
  emergency_volunteers?: EmergencyVolunteer[];
  users?: DatabaseUser;
  stores?: DatabaseStore;
  shift_patterns?: ShiftPattern; // 旧フィールド
  time_slots?: TimeSlot; // 新フィールド
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
  shift: DatabaseShift | Shift | null;
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
  hourly_wage?: number; // 時給（円）
  memo?: string;
  user_stores?: UserStore[];
}

// APIレスポンス用のユーザー型（フロントエンド用）
export interface ApiUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'manager' | 'staff';
  skill_level: 'training' | 'regular' | 'veteran'; // snake_case - DB互換性のため
  skillLevel?: 'training' | 'regular' | 'veteran'; // camelCase - フロントエンド互換性のため（オプショナル）
  hourly_wage?: number; // snake_case - DB互換性のため
  hourlyWage?: number; // camelCase - フロントエンド互換性のため（オプショナル）
  memo?: string;
  login_id?: string; // 一部のケースで必要
  stores?: string[]; // 一部のケースで必要
  user_stores?: Array<{
    store_id: string;
    store?: {
      id: string;
      name: string;
    };
  }>; // 一部のケースで必要
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