import { User, Store, ShiftPattern, Shift, TimeOffRequest, EmergencyRequest } from './types';

// モックユーザー（実際のデータベースを使用するため空に）
export const mockUsers: User[] = [];

// モック店舗データ（実際のデータベースを使用するため空に）
export const mockStores: Store[] = [];

// モックシフトパターン（実際のデータベースを使用するため空に）
export const mockShiftPatterns: ShiftPattern[] = [];

// モックシフトデータ（実際のデータベースを使用するため空に）
export const mockShifts: Shift[] = [];

// モック希望休申請（実際のデータベースを使用するため空に）
export const mockTimeOffRequests: TimeOffRequest[] = [];

// モック代打募集（実際のデータベースを使用するため空に）
export const mockEmergencyRequests: EmergencyRequest[] = [];

// 現在のユーザー（Navigation用の一時的なモック）
export const currentUser: User = {
  id: '1',
  name: '田中 太郎',
  phone: '090-1234-5678',
  email: 'tanaka@example.com',
  role: 'manager',
  stores: ['kyobashi', 'tenma'],
  skillLevel: 'veteran',
  memo: '店長経験5年、京橋店責任者'
}; 