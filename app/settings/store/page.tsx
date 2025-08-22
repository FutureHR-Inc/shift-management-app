'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import TimeSlotManager from '@/components/TimeSlotManager';
import type { TimeSlot } from '@/lib/types';

// APIから取得するデータ用の型
interface ApiStore {
  id: string;
  name: string;
  required_staff: {
    [day: string]: {
      [timeSlot: string]: number;
    };
  };
  work_rules?: {
    max_weekly_hours?: number;
    max_consecutive_days?: number;
    min_rest_hours?: number;
  } | null;
  user_stores?: Array<{
    user_id: string;
    is_flexible: boolean;
    users: {
      id: string;
      name: string;
      role: string;
      skill_level: string;
    };
  }>;
}

interface ApiUser {
  id: string;
  name: string;
  role: string;
  skill_level: string;
  user_stores?: Array<{
    store_id: string;
    stores: { id: string; name: string };
  }>;
}

// フロントエンド用の型変換後
interface DisplayStore {
  id: string;
  name: string;
  requiredStaff: {
    [day: string]: {
      [timeSlot: string]: number;
    };
  };
  workRules: {
    maxWeeklyHours: number;
    maxConsecutiveDays: number;
    minRestHours: number;
  };
  flexibleStaff: string[];
}

interface DisplayUser {
  id: string;
  name: string;
  role: string;
  skillLevel: string;
  stores: string[];
}

export default function StoreSettingsPage() {
  // データベースから取得するstate
  const [stores, setStores] = useState<DisplayStore[]>([]);
  const [users, setUsers] = useState<DisplayUser[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // UI state
  const [selectedStore, setSelectedStore] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingStore, setIsCreatingStore] = useState(false);
  const [showCreateStore, setShowCreateStore] = useState(false);

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 新規店舗作成用state
  const [newStoreName, setNewStoreName] = useState('');

  // 店舗編集・削除用state
  const [showEditStore, setShowEditStore] = useState(false);
  const [showDeleteStore, setShowDeleteStore] = useState(false);
  const [editStoreName, setEditStoreName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // フォーム用state
  const [requiredStaffData, setRequiredStaffData] = useState<{ [day: string]: { [timeSlot: string]: number } }>({});
  const [flexibleStaffData, setFlexibleStaffData] = useState<string[]>([]);
  const [workRulesData, setWorkRulesData] = useState({
    maxWeeklyHours: 28,
    maxConsecutiveDays: 7,
    minRestHours: 11
  });

  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];

  // データ取得関数
  const fetchStores = async () => {
    try {
      // 🔧 企業フィルタリング追加: current_user_idパラメータを必須にする
      if (!currentUser?.id) {
        console.log('🔍 [STORE SETTINGS] currentUser.id not found, returning empty array');
        return [];
      }

      const currentUserIdParam = `?current_user_id=${currentUser.id}`;
      console.log('🔍 [STORE SETTINGS] API URL:', `/api/stores${currentUserIdParam}`);

      const response = await fetch(`/api/stores${currentUserIdParam}`);
      if (!response.ok) throw new Error('店舗データの取得に失敗しました');
      const result = await response.json();

      // API response を DisplayStore 型に変換
      const storesData = result.data?.map((store: ApiStore) => ({
        id: store.id,
        name: store.name,
        requiredStaff: store.required_staff || {},
        workRules: {
          maxWeeklyHours: store.work_rules?.max_weekly_hours || 28,
          maxConsecutiveDays: store.work_rules?.max_consecutive_days || 7,
          minRestHours: store.work_rules?.min_rest_hours || 11
        },
        flexibleStaff: store.user_stores?.filter(us => us.is_flexible).map(us => us.user_id) || []
      })) || [];

      return storesData;
    } catch (error) {
      console.error('Error fetching stores:', error);
      throw error;
    }
  };

  const fetchUsers = async () => {
    try {
      // 🔧 企業フィルタリング追加: current_user_idパラメータを必須にする
      if (!currentUser?.id) {
        console.log('🔍 [STORE SETTINGS] fetchUsers - currentUser.id not found, returning empty array');
        return [];
      }

      const currentUserIdParam = `?current_user_id=${currentUser.id}`;
      const response = await fetch(`/api/users${currentUserIdParam}`);
      if (!response.ok) throw new Error('ユーザーデータの取得に失敗しました');
      const result = await response.json();

      // API response を DisplayUser 型に変換
      const usersData = result.data?.map((user: ApiUser) => ({
        id: user.id,
        name: user.name,
        role: user.role,
        skillLevel: user.skill_level,
        stores: user.user_stores?.map(us => us.store_id) || []
      })) || [];

      return usersData;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  };

  // ユーザー情報取得
  useEffect(() => {
    const userData = localStorage.getItem('currentUser');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setCurrentUser(user);
      } catch (error) {
        console.error('Error parsing user data:', error);
        setError('ユーザー情報の読み込みに失敗しました');
      }
    } else {
      setError('ユーザー情報が見つかりません');
    }
  }, []);

  // 初期データ読み込み（currentUserが設定された後に実行）
  useEffect(() => {
    if (!currentUser) {
      console.log('🔍 [STORE SETTINGS] currentUser not set, skipping data load');
      return;
    }

    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔍 [STORE SETTINGS] Loading data for user:', currentUser.id);

        const [storesData, usersData] = await Promise.all([
          fetchStores(),
          fetchUsers()
        ]);

        setStores(storesData);
        setUsers(usersData);

        console.log('🔍 [STORE SETTINGS] Loaded stores:', storesData.length);
        console.log('🔍 [STORE SETTINGS] Loaded users:', usersData.length);

        // 最初の店舗を選択
        if (storesData.length > 0) {
          setSelectedStore(storesData[0].id);
        }

      } catch (error) {
        setError(error instanceof Error ? error.message : '初期データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [currentUser]);

  // 選択された店舗が変更された時にフォームデータを更新
  useEffect(() => {
    const currentStore = stores.find(store => store.id === selectedStore);
    if (currentStore) {
      setRequiredStaffData(currentStore.requiredStaff);
      setFlexibleStaffData(currentStore.flexibleStaff);
      setWorkRulesData(currentStore.workRules);
    }
  }, [selectedStore, stores]);

  // 設定保存
  const handleSave = async () => {
    if (!selectedStore) return;

    setIsSaving(true);
    setError(null);

    try {
      // 1. 必要人数設定と勤怠ルールの更新
      const storeResponse = await fetch('/api/stores', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedStore,
          required_staff: requiredStaffData,
          work_rules: {
            max_weekly_hours: workRulesData.maxWeeklyHours,
            max_consecutive_days: workRulesData.maxConsecutiveDays,
            min_rest_hours: workRulesData.minRestHours
          },
          current_user_id: currentUser?.id // 企業分離のため追加
        }),
      });

      if (!storeResponse.ok) {
        const errorData = await storeResponse.json();
        throw new Error(errorData.error || '店舗設定の更新に失敗しました');
      }

      // 2. 応援スタッフ設定の更新（user_stores テーブルの is_flexible フラグを更新）
      // まず現在の応援スタッフ設定をリセット
      const resetResponse = await fetch('/api/user-stores/flexible', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          store_id: selectedStore,
          flexible_users: flexibleStaffData
        }),
      });

      if (!resetResponse.ok) {
        console.warn('応援スタッフ設定の更新に一部失敗しました');
      }

      // ローカル状態を更新
      setStores(stores.map(store =>
        store.id === selectedStore
          ? {
            ...store,
            requiredStaff: requiredStaffData,
            workRules: workRulesData,
            flexibleStaff: flexibleStaffData
          }
          : store
      ));

      alert('設定を保存しました');
    } catch (error) {
      setError(error instanceof Error ? error.message : '設定の保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  // 必要人数の更新
  const handleRequiredStaffChange = (day: string, timeSlot: string, value: number) => {
    setRequiredStaffData(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [timeSlot]: value
      }
    }));
  };

  // 応援スタッフの切り替え
  const handleFlexibleStaffToggle = (userId: string, isFlexible: boolean) => {
    if (isFlexible) {
      setFlexibleStaffData(prev => [...prev, userId]);
    } else {
      setFlexibleStaffData(prev => prev.filter(id => id !== userId));
    }
  };

  // 勤怠ルールの変更
  const handleWorkRulesChange = (field: keyof typeof workRulesData, value: number) => {
    setWorkRulesData({
      ...workRulesData,
      [field]: value
    });
  };

  // 新規店舗作成
  const handleCreateStore = async () => {
    if (!newStoreName.trim()) {
      setError('店舗名を入力してください');
      return;
    }

    if (!currentUser?.id) {
      setError('ユーザー情報が見つかりません');
      return;
    }

    setIsCreatingStore(true);
    setError(null);

    try {
      // 店舗IDを生成（企業名ベース）
      const storeId = `${currentUser.company_id || 'company'}_${Date.now()}`;

      const response = await fetch('/api/stores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: storeId,
          name: newStoreName.trim(),
          required_staff: {},
          work_rules: {
            max_weekly_hours: 28,
            max_consecutive_days: 7,
            min_rest_hours: 11
          },
          company_id: currentUser.company_id,
          current_user_id: currentUser.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '店舗の作成に失敗しました');
      }

      const result = await response.json();

      // ローカル状態を更新
      const newStore: DisplayStore = {
        id: result.data.id,
        name: result.data.name,
        requiredStaff: {},
        workRules: {
          maxWeeklyHours: 28,
          maxConsecutiveDays: 7,
          minRestHours: 11
        },
        flexibleStaff: []
      };

      setStores(prev => [...prev, newStore]);
      setSelectedStore(newStore.id);
      setNewStoreName('');
      setShowCreateStore(false);

      alert('店舗を作成しました');
    } catch (error) {
      setError(error instanceof Error ? error.message : '店舗の作成に失敗しました');
    } finally {
      setIsCreatingStore(false);
    }
  };

  // 店舗編集機能
  const handleEditStore = async () => {
    if (!editStoreName.trim()) {
      setError('店舗名を入力してください');
      return;
    }

    if (!selectedStore) {
      setError('編集する店舗を選択してください');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/stores', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedStore,
          name: editStoreName.trim(),
          current_user_id: currentUser?.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '店舗の更新に失敗しました');
      }

      // ローカル状態を更新
      setStores(prev => prev.map(store =>
        store.id === selectedStore
          ? { ...store, name: editStoreName.trim() }
          : store
      ));

      setEditStoreName('');
      setShowEditStore(false);

      alert('店舗名を更新しました');
    } catch (error) {
      setError(error instanceof Error ? error.message : '店舗の更新に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  // 店舗削除機能
  const handleDeleteStore = async () => {
    if (!selectedStore) {
      setError('削除する店舗を選択してください');
      return;
    }

    const storeName = stores.find(s => s.id === selectedStore)?.name || '';

    if (!confirm(`店舗「${storeName}」を削除してもよろしいですか？\n\n注意：関連するシフト、時間帯、スタッフ配属データがある場合は削除できません。`)) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/stores?id=${selectedStore}&current_user_id=${currentUser?.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 409) {
          setError(`削除できません: ${errorData.details || errorData.error}`);
        } else {
          throw new Error(errorData.error || '店舗の削除に失敗しました');
        }
        return;
      }

      // ローカル状態を更新
      setStores(prev => prev.filter(store => store.id !== selectedStore));
      setSelectedStore(stores.length > 1 ? stores.find(s => s.id !== selectedStore)?.id || '' : '');
      setShowDeleteStore(false);

      alert('店舗を削除しました');
    } catch (error) {
      setError(error instanceof Error ? error.message : '店舗の削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  // 店舗編集モーダルを開く
  const openEditModal = () => {
    if (!selectedStore) {
      setError('編集する店舗を選択してください');
      return;
    }
    const storeName = stores.find(s => s.id === selectedStore)?.name || '';
    setEditStoreName(storeName);
    setShowEditStore(true);
  };

  // 店舗削除モーダルを開く
  const openDeleteModal = () => {
    if (!selectedStore) {
      setError('削除する店舗を選択してください');
      return;
    }
    setShowDeleteStore(true);
  };

  const getTimeSlotLabel = (slotId: string) => {
    const slot = timeSlots.find(ts => ts.id === slotId);
    return slot ? `${slot.name} (${slot.start_time}-${slot.end_time})` : slotId;
  };

  // 時間帯データ更新コールバック
  const handleTimeSlotsChange = useCallback((newTimeSlots: TimeSlot[]) => {
    setTimeSlots(newTimeSlots);
  }, []);

  const getSkillLevelText = (level: string) => {
    switch (level) {
      case 'veteran': return 'ベテラン';
      case 'regular': return '一般';
      case 'training': return '研修中';
      default: return '不明';
    }
  };

  const currentStore = stores.find(store => store.id === selectedStore);

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

  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        {/* エラー表示バー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ヘッダー */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">店舗設定</h1>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">各店舗の必要人数と応援可能スタッフを設定できます</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving || !selectedStore}
            className="w-full sm:w-auto sm:self-start"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                保存中...
              </>
            ) : (
              '設定を保存'
            )}
          </Button>
        </div>

        {/* 店舗選択・作成 */}
        <Card>
          <CardContent className="pt-6">
            {stores.length > 0 ? (
              <div className="space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <label className="text-sm font-medium text-gray-700 flex-shrink-0">
                      設定する店舗:
                    </label>
                    <select
                      value={selectedStore}
                      onChange={(e) => setSelectedStore(e.target.value)}
                      className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={loading || isSaving}
                    >
                      {stores.map(store => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    onClick={() => setShowCreateStore(true)}
                    variant="secondary"
                    disabled={loading || isSaving}
                    className="w-full lg:w-auto text-sm"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    新しい店舗を追加
                  </Button>
                </div>

                {/* 店舗管理ボタン */}
                {selectedStore && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-gray-200">
                    <span className="text-sm text-gray-600 font-medium">店舗管理:</span>
                    <div className="flex flex-col sm:flex-row gap-2 flex-1">
                      <Button
                        onClick={openEditModal}
                        variant="secondary"
                        size="sm"
                        disabled={loading || isSaving || isDeleting}
                        className="w-full sm:w-auto text-sm"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        店舗名を編集
                      </Button>
                      <Button
                        onClick={openDeleteModal}
                        variant="secondary"
                        size="sm"
                        disabled={loading || isSaving || isDeleting}
                        className="w-full sm:w-auto text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        店舗を削除
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-blue-100 rounded-xl mx-auto mb-4 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">店舗が登録されていません</h3>
                <p className="text-gray-600 mb-6">まず最初の店舗を作成してください</p>
                <Button
                  onClick={() => setShowCreateStore(true)}
                  disabled={loading || isSaving}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  最初の店舗を作成
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 店舗作成モーダル */}
        {showCreateStore && (
          <div
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setShowCreateStore(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">新しい店舗を作成</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateStore(false)}
                    disabled={isCreatingStore}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      店舗名 *
                    </label>
                    <Input
                      placeholder="例：渋谷店、本店、第2店舗"
                      value={newStoreName}
                      onChange={(e) => setNewStoreName(e.target.value)}
                      disabled={isCreatingStore}
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <Button
                      variant="secondary"
                      onClick={() => setShowCreateStore(false)}
                      disabled={isCreatingStore}
                      className="flex-1"
                    >
                      キャンセル
                    </Button>
                    <Button
                      onClick={handleCreateStore}
                      disabled={isCreatingStore || !newStoreName.trim()}
                      className="flex-1"
                    >
                      {isCreatingStore ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          作成中...
                        </>
                      ) : (
                        '店舗を作成'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 店舗編集モーダル */}
        {showEditStore && (
          <div
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setShowEditStore(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">店舗名を編集</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEditStore(false)}
                    disabled={isSaving}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      店舗名 *
                    </label>
                    <Input
                      placeholder="新しい店舗名を入力"
                      value={editStoreName}
                      onChange={(e) => setEditStoreName(e.target.value)}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <Button
                      variant="secondary"
                      onClick={() => setShowEditStore(false)}
                      disabled={isSaving}
                      className="flex-1"
                    >
                      キャンセル
                    </Button>
                    <Button
                      onClick={handleEditStore}
                      disabled={isSaving || !editStoreName.trim()}
                      className="flex-1"
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          更新中...
                        </>
                      ) : (
                        '店舗名を更新'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 店舗削除モーダル */}
        {showDeleteStore && (
          <div
            className="fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setShowDeleteStore(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-red-600">店舗を削除</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteStore(false)}
                    disabled={isDeleting}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-3 p-4 bg-red-50 rounded-xl">
                    <svg className="w-8 h-8 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 15.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                      <h3 className="font-medium text-red-900">この操作は取り消せません</h3>
                      <p className="text-sm text-red-700 mt-1">
                        店舗「{stores.find(s => s.id === selectedStore)?.name}」を完全に削除します。
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-yellow-50 rounded-xl">
                    <h4 className="font-medium text-yellow-900 mb-2">削除前の注意事項</h4>
                    <ul className="text-sm text-yellow-800 space-y-1">
                      <li>• 関連するシフトデータがある場合は削除できません</li>
                      <li>• 時間帯設定やスタッフの配属も全て削除されます</li>
                      <li>• 代打募集データも全て削除されます</li>
                    </ul>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <Button
                      variant="secondary"
                      onClick={() => setShowDeleteStore(false)}
                      disabled={isDeleting}
                      className="flex-1"
                    >
                      キャンセル
                    </Button>
                    <Button
                      onClick={handleDeleteStore}
                      disabled={isDeleting}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    >
                      {isDeleting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          削除中...
                        </>
                      ) : (
                        '削除を実行'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStore && (
          <>
            {/* 時間帯設定 */}
            <TimeSlotManager
              storeId={selectedStore}
              onTimeSlotsChange={handleTimeSlotsChange}
            />

            {/* 必要人数設定 */}
            <Card>
              <CardHeader>
                <CardTitle>{currentStore.name} - 必要人数設定</CardTitle>
              </CardHeader>
              <CardContent>
                {timeSlots.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-lg font-medium mb-2">時間帯が設定されていません</p>
                    <p className="text-sm">まず上記の「時間帯設定」で時間帯を追加してください</p>
                  </div>
                ) : (
                  <>
                    {/* モバイル表示 */}
                    <div className="block lg:hidden space-y-4">
                      {timeSlots.map((timeSlot) => (
                        <Card key={timeSlot.id} className="border border-gray-200">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base font-medium text-gray-900">
                              {getTimeSlotLabel(timeSlot.id)}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="grid grid-cols-2 gap-3">
                              {dayNames.map((dayName, dayIndex) => {
                                const currentValue = requiredStaffData[dayName]?.[timeSlot.id] || 0;
                                return (
                                  <div key={dayIndex} className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-700">
                                      {dayLabels[dayIndex]}
                                    </label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="10"
                                      value={currentValue}
                                      onChange={(e) => handleRequiredStaffChange(dayName, timeSlot.id, parseInt(e.target.value) || 0)}
                                      className="w-16 text-center"
                                      disabled={isSaving}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* デスクトップ表示 */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left p-3 font-medium text-gray-900 bg-gray-50">時間帯</th>
                            {dayLabels.map((day, index) => (
                              <th key={index} className="text-center p-3 font-medium text-gray-900 bg-gray-50 min-w-20">
                                {day}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {timeSlots.map((timeSlot) => (
                            <tr key={timeSlot.id} className="border-b border-gray-100">
                              <td className="p-3 bg-gray-50 font-medium text-gray-900">
                                {getTimeSlotLabel(timeSlot.id)}
                              </td>
                              {dayNames.map((dayName, dayIndex) => {
                                const currentValue = requiredStaffData[dayName]?.[timeSlot.id] || 0;
                                return (
                                  <td key={dayIndex} className="p-2 text-center">
                                    <Input
                                      type="number"
                                      min="0"
                                      max="10"
                                      value={currentValue}
                                      onChange={(e) => handleRequiredStaffChange(dayName, timeSlot.id, parseInt(e.target.value) || 0)}
                                      className="w-16 text-center"
                                      disabled={isSaving}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                      <h4 className="font-medium text-blue-900 mb-2">設定のヒント</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• 平日と週末で異なる人数設定が可能です</li>
                        <li>• 繁忙時間帯（ランチ、ディナー）は多めに設定することをお勧めします</li>
                        <li>• 0を設定すると該当時間帯は営業していないことを表します</li>
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 勤怠ルール設定 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span>勤怠ルール設定</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <p className="text-sm text-gray-600">
                    シフト作成時に自動で警告される勤怠ルールを設定してください
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        週間上限時間
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="1"
                          max="40"
                          value={workRulesData.maxWeeklyHours}
                          onChange={(e) => handleWorkRulesChange('maxWeeklyHours', parseInt(e.target.value) || 28)}
                          className="pr-12"
                          disabled={isSaving}
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                          時間
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        週28時間を超える場合に警告
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        連続勤務上限日数
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="1"
                          max="14"
                          value={workRulesData.maxConsecutiveDays}
                          onChange={(e) => handleWorkRulesChange('maxConsecutiveDays', parseInt(e.target.value) || 7)}
                          className="pr-12"
                          disabled={isSaving}
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                          日
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        7日連続勤務で警告
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        最低休息時間
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="8"
                          max="24"
                          value={workRulesData.minRestHours}
                          onChange={(e) => handleWorkRulesChange('minRestHours', parseInt(e.target.value) || 11)}
                          className="pr-12"
                          disabled={isSaving}
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                          時間
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        勤務間隔11時間未満で警告
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50 rounded-xl">
                    <h4 className="font-medium text-amber-900 mb-2">勤怠ルールについて</h4>
                    <ul className="text-sm text-amber-800 space-y-1">
                      <li>• これらのルールに違反する場合、シフト作成時に警告が表示されます</li>
                      <li>• 警告が表示されてもシフトの保存は可能ですが、労働基準法の遵守をお勧めします</li>
                      <li>• 設定値は店舗ごとに個別に管理されます</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 応援可能スタッフ設定 */}
            <Card>
              <CardHeader>
                <CardTitle>{currentStore.name} - 応援可能スタッフ</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    この店舗に所属していないスタッフの中から、応援可能な人を選択してください
                  </p>

                  {users.filter(user => user.role === 'staff' && !user.stores.includes(selectedStore)).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {users
                        .filter(user => user.role === 'staff' && !user.stores.includes(selectedStore))
                        .map((user) => {
                          const isFlexible = flexibleStaffData.includes(user.id);
                          const userStores = user.stores.map(storeId => {
                            const store = stores.find(s => s.id === storeId);
                            return store?.name;
                          }).filter(Boolean).join(', ');

                          return (
                            <div key={user.id} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl">
                              <input
                                type="checkbox"
                                id={`flexible-${user.id}`}
                                checked={isFlexible}
                                onChange={(e) => handleFlexibleStaffToggle(user.id, e.target.checked)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                disabled={isSaving}
                              />
                              <div className="flex-1">
                                <label htmlFor={`flexible-${user.id}`} className="font-medium text-gray-900 cursor-pointer">
                                  {user.name}
                                </label>
                                <div className="text-sm text-gray-500">
                                  所属: {userStores || '未設定'} | スキル: {getSkillLevelText(user.skillLevel)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p>応援可能なスタッフがいません</p>
                      <p className="text-sm mt-1">（この店舗に所属していないスタッフのみが応援対象となります）</p>
                    </div>
                  )}

                  <div className="p-4 bg-green-50 rounded-xl">
                    <h4 className="font-medium text-green-900 mb-2">応援スタッフのメリット</h4>
                    <ul className="text-sm text-green-800 space-y-1">
                      <li>• 急な欠員時に迅速な対応が可能になります</li>
                      <li>• 店舗間での人員調整がスムーズになります</li>
                      <li>• スタッフのスキル向上と経験拡大に貢献します</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AuthenticatedLayout>
  );
} 