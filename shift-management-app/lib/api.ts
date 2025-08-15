// APIクライアント - フロントエンドからAPIを呼び出すためのヘルパー関数

const API_BASE_URL = '/api';

// 共通のAPIリクエスト関数
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const result = await response.json();

    if (!response.ok) {
      return { error: result.error || `HTTP ${response.status}` };
    }

    return { data: result.data || result };
  } catch (error) {
    console.error('API request failed:', error);
    return { error: 'ネットワークエラーが発生しました' };
  }
}

// ユーザー関連API
export const userApi = {
  // ユーザー一覧取得
  getAll: (params?: {
    store_id?: string;
    role?: 'manager' | 'staff';
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.store_id) searchParams.set('store_id', params.store_id);
    if (params?.role) searchParams.set('role', params.role);
    
    const query = searchParams.toString();
    return apiRequest(`/users${query ? `?${query}` : ''}`);
  },

  // ユーザー作成
  create: (userData: {
    name: string;
    phone: string;
    email: string;
    role: 'manager' | 'staff';
    skill_level: 'training' | 'regular' | 'veteran';
    memo?: string;
    stores: string[];
  }) => {
    return apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // ユーザー更新
  update: (userData: {
    id: string;
    name?: string;
    phone?: string;
    email?: string;
    role?: 'manager' | 'staff';
    skill_level?: 'training' | 'regular' | 'veteran';
    memo?: string;
    stores?: string[];
  }) => {
    return apiRequest('/users', {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  // ユーザー削除
  delete: (id: string) => {
    return apiRequest(`/users?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// 店舗関連API
export const storeApi = {
  // 店舗一覧取得
  getAll: () => {
    return apiRequest('/stores');
  },

  // 店舗作成
  create: (storeData: {
    id: string;
    name: string;
    required_staff: Record<string, Record<string, number>>;
  }) => {
    return apiRequest('/stores', {
      method: 'POST',
      body: JSON.stringify(storeData),
    });
  },

  // 店舗更新
  update: (storeData: {
    id: string;
    name?: string;
    required_staff?: Record<string, Record<string, number>>;
  }) => {
    return apiRequest('/stores', {
      method: 'PUT',
      body: JSON.stringify(storeData),
    });
  },

  // 店舗削除
  delete: (id: string) => {
    return apiRequest(`/stores?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// シフト関連API
export const shiftApi = {
  // シフト取得
  getAll: (params?: {
    user_id?: string;
    store_id?: string;
    date_from?: string;
    date_to?: string;
    status?: 'draft' | 'confirmed' | 'completed';
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.user_id) searchParams.set('user_id', params.user_id);
    if (params?.store_id) searchParams.set('store_id', params.store_id);
    if (params?.date_from) searchParams.set('date_from', params.date_from);
    if (params?.date_to) searchParams.set('date_to', params.date_to);
    if (params?.status) searchParams.set('status', params.status);
    
    const query = searchParams.toString();
    return apiRequest(`/shifts${query ? `?${query}` : ''}`);
  },

  // シフト作成
  create: (shiftData: {
    user_id: string;
    store_id: string;
    date: string;
    pattern_id: string;
    status?: 'draft' | 'confirmed' | 'completed';
    notes?: string;
  }) => {
    return apiRequest('/shifts', {
      method: 'POST',
      body: JSON.stringify(shiftData),
    });
  },

  // シフト更新
  update: (shiftData: {
    id: string;
    user_id?: string;
    store_id?: string;
    date?: string;
    pattern_id?: string;
    status?: 'draft' | 'confirmed' | 'completed';
    notes?: string;
  }) => {
    return apiRequest('/shifts', {
      method: 'PUT',
      body: JSON.stringify(shiftData),
    });
  },

  // シフト削除
  delete: (id: string) => {
    return apiRequest(`/shifts?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// 希望休申請関連API
export const timeOffRequestApi = {
  // 希望休申請取得
  getAll: (params?: {
    user_id?: string;
    status?: 'pending' | 'approved' | 'rejected';
    date_from?: string;
    date_to?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.user_id) searchParams.set('user_id', params.user_id);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.date_from) searchParams.set('date_from', params.date_from);
    if (params?.date_to) searchParams.set('date_to', params.date_to);
    
    const query = searchParams.toString();
    return apiRequest(`/time-off-requests${query ? `?${query}` : ''}`);
  },

  // 希望休申請作成
  create: (requestData: {
    user_id: string;
    date: string;
    reason: string;
  }) => {
    return apiRequest('/time-off-requests', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  },

  // 希望休申請承認・却下
  respond: (responseData: {
    id: string;
    status: 'approved' | 'rejected';
    responded_by: string;
  }) => {
    return apiRequest('/time-off-requests', {
      method: 'PUT',
      body: JSON.stringify(responseData),
    });
  },

  // 希望休申請削除
  delete: (id: string) => {
    return apiRequest(`/time-off-requests?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// 代打募集関連API
export const emergencyRequestApi = {
  // 代打募集取得
  getAll: (params?: {
    store_id?: string;
    status?: 'open' | 'filled' | 'cancelled';
    date_from?: string;
    date_to?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.store_id) searchParams.set('store_id', params.store_id);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.date_from) searchParams.set('date_from', params.date_from);
    if (params?.date_to) searchParams.set('date_to', params.date_to);
    
    const query = searchParams.toString();
    return apiRequest(`/emergency-requests${query ? `?${query}` : ''}`);
  },

  // 代打募集作成
  create: (requestData: {
    original_user_id: string;
    store_id: string;
    date: string;
    shift_pattern_id: string;
    reason: string;
  }) => {
    return apiRequest('/emergency-requests', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  },

  // 代打募集ステータス更新
  updateStatus: (updateData: {
    id: string;
    status: 'open' | 'filled' | 'cancelled';
  }) => {
    return apiRequest('/emergency-requests', {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  },

  // 代打応募者承認（シフト表自動更新）
  processVolunteer: (volunteerData: {
    emergency_request_id: string;
    volunteer_id: string;
    action: 'accept' | 'reject';
  }) => {
    return apiRequest('/emergency-requests', {
      method: 'PATCH',
      body: JSON.stringify(volunteerData),
    });
  },

  // 代打募集削除
  delete: (id: string) => {
    return apiRequest(`/emergency-requests?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// 代打応募関連API
export const emergencyVolunteerApi = {
  // 代打応募取得
  getAll: (params?: {
    emergency_request_id?: string;
    user_id?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.emergency_request_id) searchParams.set('emergency_request_id', params.emergency_request_id);
    if (params?.user_id) searchParams.set('user_id', params.user_id);
    
    const query = searchParams.toString();
    return apiRequest(`/emergency-volunteers${query ? `?${query}` : ''}`);
  },

  // 代打応募
  create: (volunteerData: {
    emergency_request_id: string;
    user_id: string;
  }) => {
    return apiRequest('/emergency-volunteers', {
      method: 'POST',
      body: JSON.stringify(volunteerData),
    });
  },

  // 代打応募取り消し
  delete: (params: { id: string } | { emergency_request_id: string; user_id: string }) => {
    if ('id' in params) {
      return apiRequest(`/emergency-volunteers?id=${params.id}`, {
        method: 'DELETE',
      });
    } else {
      return apiRequest(`/emergency-volunteers?emergency_request_id=${params.emergency_request_id}&user_id=${params.user_id}`, {
        method: 'DELETE',
      });
    }
  },
};

// 便利な日付フォーマット関数
export const dateUtils = {
  // YYYY-MM-DD形式にフォーマット
  formatDate: (date: Date): string => {
    return date.toISOString().split('T')[0];
  },

  // 今日の日付を取得
  getToday: (): string => {
    return dateUtils.formatDate(new Date());
  },

  // 週の開始日を取得（月曜日）
  getWeekStart: (date: Date = new Date()): string => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 月曜日を週の開始とする
    const monday = new Date(date.setDate(diff));
    return dateUtils.formatDate(monday);
  },

  // 週の終了日を取得（日曜日）
  getWeekEnd: (date: Date = new Date()): string => {
    const weekStart = new Date(dateUtils.getWeekStart(date));
    const sunday = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    return dateUtils.formatDate(sunday);
  },
};

// メール送信API用の型定義
export interface EmailRequest {
  type: 'basic' | 'shift-confirmation' | 'time-off-response' | 'emergency-request' | 'notification';
  to: string;
  subject: string;
  body: string;
  [key: string]: unknown;
}

/**
 * メール送信
 */
export async function sendEmailNotification(emailData: EmailRequest) {
  const response = await fetch('/api/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to send email');
  }

  return response.json();
}

/**
 * シフト確定通知メールを送信
 */
export async function sendShiftConfirmationNotification(
  userEmail: string,
  userName: string,
  shifts: Array<{
    date: string;
    storeName: string;
    shiftPattern: string;
    startTime: string;
    endTime: string;
  }>
) {
  return sendEmailNotification({
    type: 'shift-confirmation',
    to: userEmail,
    subject: `シフト確認 - ${userName}`,
    body: '本日のシフトをご確認ください',
    userEmail,
    userName,
    shifts,
  });
}

/**
 * 希望休申請承認・拒否通知メールを送信
 */
export async function sendTimeOffResponseNotification(
  userEmail: string,
  userName: string,
  requestDate: string,
  status: 'approved' | 'rejected',
  reason?: string
) {
  return sendEmailNotification({
    type: 'time-off-response',
    to: userEmail,
    subject: `希望休申請${status === 'approved' ? '承認' : '拒否'}通知 - ${userName}`,
    body: `希望休申請が${status === 'approved' ? '承認' : '拒否'}されました`,
    userEmail,
    userName,
    requestDate,
    status,
    reason,
  });
}

/**
 * 代打募集通知メールを送信
 */
export async function sendEmergencyRequestNotification(
  userEmails: string[],
  details: {
    storeName: string;
    date: string;
    shiftPattern: string;
    startTime: string;
    endTime: string;
    reason: string;
  }
) {
  return sendEmailNotification({
    type: 'emergency-request',
    to: userEmails.join(','),
    subject: `緊急代打募集 - ${details.storeName}`,
    body: `緊急の代打を募集しています`,
    userEmails,
    details,
  });
}

/**
 * 一般的な通知メールを送信
 */
export async function sendGeneralNotification(
  userEmail: string,
  userName: string,
  title: string,
  message: string
) {
  return sendEmailNotification({
    type: 'notification',
    to: userEmail,
    subject: title,
    body: message,
    userEmail,
    userName,
    title,
    message,
  });
}

/**
 * 基本的なメール送信
 */
export async function sendBasicEmail(
  to: string | string[],
  subject: string,
  html?: string,
  text?: string,
  from?: string
) {
  return sendEmailNotification({
    type: 'basic',
    to: Array.isArray(to) ? to.join(',') : to,
    subject,
    body: html || text || '',
    html,
    text,
    from,
  });
} 