import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 型安全なデータベース操作のためのヘルパー型
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          name: string
          phone: string
          email: string
          role: 'manager' | 'staff'
          skill_level: 'training' | 'regular' | 'veteran'
          memo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          phone: string
          email: string
          role: 'manager' | 'staff'
          skill_level: 'training' | 'regular' | 'veteran'
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string
          email?: string
          role?: 'manager' | 'staff'
          skill_level?: 'training' | 'regular' | 'veteran'
          memo?: string | null
          updated_at?: string
        }
      }
      stores: {
        Row: {
          id: string
          name: string
          required_staff: Record<string, Record<string, number>>
          work_rules: {
            max_weekly_hours?: number
            max_consecutive_days?: number
            min_rest_hours?: number
          } | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          required_staff: Record<string, Record<string, number>>
          work_rules?: {
            max_weekly_hours?: number
            max_consecutive_days?: number
            min_rest_hours?: number
          } | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          required_staff?: Record<string, Record<string, number>>
          work_rules?: {
            max_weekly_hours?: number
            max_consecutive_days?: number
            min_rest_hours?: number
          } | null
          updated_at?: string
        }
      }
      user_stores: {
        Row: {
          id: string
          user_id: string
          store_id: string
          is_flexible: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          store_id: string
          is_flexible?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          store_id?: string
          is_flexible?: boolean
        }
      }
      shift_patterns: {
        Row: {
          id: string
          name: string
          start_time: string
          end_time: string
          color: string
          break_time: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          start_time: string
          end_time: string
          color: string
          break_time?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          start_time?: string
          end_time?: string
          color?: string
          break_time?: number
          updated_at?: string
        }
      }
      shifts: {
        Row: {
          id: string
          user_id: string
          store_id: string
          date: string
          pattern_id?: string | null // 旧カラム（段階的削除予定）
          time_slot_id?: string | null // 新カラム
          status: 'draft' | 'confirmed' | 'completed'
          custom_start_time?: string | null // カスタム開始時間
          custom_end_time?: string | null   // カスタム終了時間
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          store_id: string
          date: string
          pattern_id?: string | null
          time_slot_id?: string | null
          status?: 'draft' | 'confirmed' | 'completed'
          custom_start_time?: string | null
          custom_end_time?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          store_id?: string
          date?: string
          pattern_id?: string | null
          time_slot_id?: string | null
          status?: 'draft' | 'confirmed' | 'completed'
          custom_start_time?: string | null
          custom_end_time?: string | null
          notes?: string | null
          updated_at?: string
        }
      }
      time_off_requests: {
        Row: {
          id: string
          user_id: string
          date: string
          reason: string
          status: 'pending' | 'approved' | 'rejected'
          responded_at: string | null
          responded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          reason: string
          status?: 'pending' | 'approved' | 'rejected'
          responded_at?: string | null
          responded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          reason?: string
          status?: 'pending' | 'approved' | 'rejected'
          responded_at?: string | null
          responded_by?: string | null
        }
      }
      emergency_requests: {
        Row: {
          id: string
          original_user_id: string
          store_id: string
          date: string
          shift_pattern_id?: string | null // 旧カラム（段階的削除予定）
          time_slot_id?: string | null // 新カラム
          reason: string
          status: 'open' | 'filled' | 'cancelled'
          created_at: string
        }
        Insert: {
          id?: string
          original_user_id: string
          store_id: string
          date: string
          shift_pattern_id?: string | null
          time_slot_id?: string | null
          reason: string
          status?: 'open' | 'filled' | 'cancelled'
          created_at?: string
        }
        Update: {
          id?: string
          original_user_id?: string
          store_id?: string
          date?: string
          shift_pattern_id?: string | null
          time_slot_id?: string | null
          reason?: string
          status?: 'open' | 'filled' | 'cancelled'
        }
      }
      emergency_volunteers: {
        Row: {
          id: string
          emergency_request_id: string
          user_id: string
          responded_at: string
        }
        Insert: {
          id?: string
          emergency_request_id: string
          user_id: string
          responded_at?: string
        }
        Update: {
          id?: string
          emergency_request_id?: string
          user_id?: string
          responded_at?: string
        }
      }
    }
  }
} 