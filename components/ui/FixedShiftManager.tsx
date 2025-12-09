import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import type { DatabaseFixedShift, TimeSlot } from '@/lib/types';

interface FixedShiftManagerProps {
  userId?: string; // 新規作成時はundefined
  userStores: string[]; // ユーザーが所属する店舗IDの配列
  onUpdate?: () => void; // 更新後のコールバック
  isNewUser?: boolean; // 新規ユーザー作成時かどうか
  onFixedShiftsChange?: (shifts: FixedShiftFormData[]) => void; // 新規作成時の固定シフトデータコールバック
}

interface FixedShiftFormData {
  store_id: string;
  day_of_week: number;
  time_slot_id: string;
  is_active: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: '日曜日' },
  { value: 1, label: '月曜日' },
  { value: 2, label: '火曜日' },
  { value: 3, label: '水曜日' },
  { value: 4, label: '木曜日' },
  { value: 5, label: '金曜日' },
  { value: 6, label: '土曜日' },
];

export const FixedShiftManager: React.FC<FixedShiftManagerProps> = ({
  userId,
  userStores,
  onUpdate,
  isNewUser,
  onFixedShiftsChange
}) => {
  const [fixedShifts, setFixedShifts] = useState<DatabaseFixedShift[]>([]);
  const [timeSlotsByStore, setTimeSlotsByStore] = useState<Record<string, TimeSlot[]>>({});
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新規作成時の固定シフト管理用
  const [newUserFixedShifts, setNewUserFixedShifts] = useState<FixedShiftFormData[]>([]);

  // 新規追加用のフォーム
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newShiftForm, setNewShiftForm] = useState<FixedShiftFormData>({
    store_id: '',
    day_of_week: 1, // 月曜日をデフォルト
    time_slot_id: '',
    is_active: true
  });

  useEffect(() => {
    if ((userId || isNewUser) && userStores.length > 0) {
      loadData();
    }
  }, [userId, userStores, isNewUser]);

  // データ読み込み
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 固定シフト取得（新規作成時はスキップ）
      if (userId && !isNewUser) {
        const fixedShiftsRes = await fetch(`/api/fixed-shifts?user_id=${userId}`);
        const fixedShiftsData = await fixedShiftsRes.json();
        
        if (!fixedShiftsRes.ok) {
          throw new Error(fixedShiftsData.error || '固定シフトの取得に失敗しました');
        }
        
        setFixedShifts(fixedShiftsData.data || []);
      } else {
        // 新規作成時は空配列
        setFixedShifts([]);
      }

      // 店舗情報取得
      const storesRes = await fetch('/api/stores');
      const storesData = await storesRes.json();
      
      if (!storesRes.ok) {
        throw new Error(storesData.error || '店舗情報の取得に失敗しました');
      }
      
      setStores(storesData.data || []);

      // 各店舗の時間帯情報取得
      const timeSlotsData: Record<string, TimeSlot[]> = {};
      
      for (const storeId of userStores) {
        const timeSlotsRes = await fetch(`/api/time-slots?store_id=${storeId}`);
        const timeSlotsJson = await timeSlotsRes.json();
        
        if (timeSlotsRes.ok) {
          timeSlotsData[storeId] = timeSlotsJson.data || [];
        }
      }
      
      setTimeSlotsByStore(timeSlotsData);

    } catch (err) {
      console.error('固定シフトデータ読み込みエラー:', err);
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // 固定シフト追加
  const handleAddFixedShift = async () => {
    // バリデーション
    if (!newShiftForm.store_id || !newShiftForm.time_slot_id) {
      setError('店舗と時間帯を選択してください');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // 新規ユーザーの場合は配列に追加するだけ
      if (isNewUser) {
        const newShift = { ...newShiftForm };
        const updatedShifts = [...newUserFixedShifts, newShift];
        setNewUserFixedShifts(updatedShifts);
        onFixedShiftsChange?.(updatedShifts);
        
        // フォームをリセット
        setIsAddingNew(false);
        setNewShiftForm({
          store_id: '',
          day_of_week: 1,
          time_slot_id: '',
          is_active: true
        });
        
        return;
      }

      // 既存ユーザーの場合はAPIに送信
      const response = await fetch('/api/fixed-shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          ...newShiftForm
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '固定シフトの追加に失敗しました');
      }

      // 固定シフトは動的表示のため、自動生成は行わない
      console.log('固定シフトが追加されました。シフト表に動的に表示されます。');
      
      // 成功フィードバック表示
      const successMessage = `固定シフトが追加されました！シフト表に即座に反映されます。`;
      // 簡易的な成功通知（必要に応じてtoast等に変更可能）
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          console.log('✅ ' + successMessage);
        }, 300);
      }

      // 他のページ/タブに固定シフト更新を通知
      window.dispatchEvent(new CustomEvent('fixedShiftUpdated', {
        detail: { 
          action: 'added',
          userId: userId,
          storeId: newShiftForm.store_id,
          dayOfWeek: newShiftForm.day_of_week,
          timeSlotId: newShiftForm.time_slot_id
        }
      }));

      // ブラウザストレージ経由での通知（別タブ対応）
      const timestamp = Date.now();
      localStorage.setItem('fixedShiftUpdate', JSON.stringify({
        action: 'added',
        userId: userId,
        timestamp: timestamp
      }));
      // 即座に削除（イベント発火のみが目的）
      setTimeout(() => localStorage.removeItem('fixedShiftUpdate'), 100);

      // 成功時にリロードしてフォームをリセット
      await loadData();
      setIsAddingNew(false);
      setNewShiftForm({
        store_id: '',
        day_of_week: 1,
        time_slot_id: '',
        is_active: true
      });
      
      onUpdate?.();

    } catch (err) {
      console.error('固定シフト追加エラー:', err);
      setError(err instanceof Error ? err.message : '追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 固定シフト削除
  const handleDeleteFixedShift = async (fixedShiftId: string) => {
    if (!window.confirm('この固定シフトを削除しますか？')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/fixed-shifts?id=${fixedShiftId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '固定シフトの削除に失敗しました');
      }

      // 他のページ/タブに固定シフト削除を通知
      window.dispatchEvent(new CustomEvent('fixedShiftUpdated', {
        detail: { 
          action: 'deleted',
          userId: userId,
          fixedShiftId: fixedShiftId
        }
      }));

      // ブラウザストレージ経由での通知（別タブ対応）
      const timestamp = Date.now();
      localStorage.setItem('fixedShiftUpdate', JSON.stringify({
        action: 'deleted',
        userId: userId,
        timestamp: timestamp
      }));
      setTimeout(() => localStorage.removeItem('fixedShiftUpdate'), 100);

      // 成功時にリロード
      await loadData();
      onUpdate?.();

    } catch (err) {
      console.error('固定シフト削除エラー:', err);
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // アクティブ状態切り替え
  const handleToggleActive = async (fixedShift: DatabaseFixedShift) => {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch('/api/fixed-shifts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: fixedShift.id,
          is_active: !fixedShift.is_active
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '固定シフトの更新に失敗しました');
      }

      // 固定シフトは動的表示のため、シフト生成は行わない
      console.log('固定シフトの状態が更新されました。シフト表に動的に反映されます。');

      // 成功時にリロード
      await loadData();
      onUpdate?.();

    } catch (err) {
      console.error('固定シフト更新エラー:', err);
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 新規作成時の固定シフト削除
  const handleDeleteNewUserFixedShift = (index: number) => {
    if (!window.confirm('この固定シフトを削除しますか？')) {
      return;
    }
    
    const updatedShifts = newUserFixedShifts.filter((_, i) => i !== index);
    setNewUserFixedShifts(updatedShifts);
    onFixedShiftsChange?.(updatedShifts);
  };

  // 店舗名取得
  const getStoreName = (storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    return store?.name || storeId;
  };

  // 時間帯名取得
  const getTimeSlotName = (storeId: string, timeSlotId: string) => {
    const timeSlots = timeSlotsByStore[storeId] || [];
    const timeSlot = timeSlots.find(ts => ts.id === timeSlotId);
    return timeSlot ? `${timeSlot.name} (${timeSlot.start_time}-${timeSlot.end_time})` : timeSlotId;
  };

  if (loading) {
    return <div className="text-center p-4">読み込み中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">固定出勤設定</h3>
          <p className="text-sm text-gray-600 mt-1">
            固定シフトを登録すると、現在の週と来週のシフト表に自動的に反映されます
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsAddingNew(!isAddingNew)}
          disabled={saving}
          className="whitespace-nowrap"
        >
          {isAddingNew ? 'キャンセル' : '+ 新規'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 新規追加フォーム */}
      {isAddingNew && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
          <h4 className="font-medium text-gray-900">新しい固定シフト</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 店舗選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">店舗</label>
              <select
                value={newShiftForm.store_id}
                onChange={(e) => setNewShiftForm({ ...newShiftForm, store_id: e.target.value, time_slot_id: '' })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">店舗を選択</option>
                {stores.filter(store => userStores.includes(store.id)).map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>

            {/* 曜日選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">曜日</label>
              <select
                value={newShiftForm.day_of_week}
                onChange={(e) => setNewShiftForm({ ...newShiftForm, day_of_week: parseInt(e.target.value) })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                {DAYS_OF_WEEK.map(day => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
            </div>

            {/* 時間帯選択 */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">時間帯</label>
              <select
                value={newShiftForm.time_slot_id}
                onChange={(e) => setNewShiftForm({ ...newShiftForm, time_slot_id: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
                disabled={!newShiftForm.store_id}
              >
                <option value="">時間帯を選択</option>
                {newShiftForm.store_id && timeSlotsByStore[newShiftForm.store_id]?.map(timeSlot => (
                  <option key={timeSlot.id} value={timeSlot.id}>
                    {timeSlot.name} ({timeSlot.start_time}-{timeSlot.end_time})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsAddingNew(false)}
              disabled={saving}
              className="whitespace-nowrap"
            >
              キャンセル
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddFixedShift}
              disabled={saving || !newShiftForm.store_id || !newShiftForm.time_slot_id}
              className="whitespace-nowrap"
            >
              {saving ? '追加中...' : '追加'}
            </Button>
          </div>
        </div>
      )}

      {/* 既存の固定シフト一覧 */}
      <div className="space-y-2">
        {/* 新規作成時の固定シフト表示 */}
        {isNewUser && newUserFixedShifts.length > 0 && (
          <>
            <h4 className="font-medium text-gray-900 mt-4">設定予定の固定シフト</h4>
            {newUserFixedShifts.map((shift, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg border bg-blue-50 border-blue-200"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {DAYS_OF_WEEK.find(d => d.value === shift.day_of_week)?.label} - {getStoreName(shift.store_id)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {getTimeSlotName(shift.store_id, shift.time_slot_id)}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {/* 削除ボタン */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteNewUserFixedShift(index)}
                    disabled={saving}
                    className="text-red-600 hover:text-red-800"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* 既存ユーザーの固定シフト表示 */}
        {!isNewUser && (
          <>
            {fixedShifts.length === 0 && newUserFixedShifts.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                固定シフトが設定されていません
              </div>
            ) : (
              fixedShifts.map(fixedShift => (
                <div
                  key={fixedShift.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    fixedShift.is_active 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {DAYS_OF_WEEK.find(d => d.value === fixedShift.day_of_week)?.label} - {getStoreName(fixedShift.store_id)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {getTimeSlotName(fixedShift.store_id, fixedShift.time_slot_id)}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* アクティブ切り替えトグル */}
                    <button
                      onClick={() => handleToggleActive(fixedShift)}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        fixedShift.is_active ? 'bg-green-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          fixedShift.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    
                    {/* 削除ボタン */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteFixedShift(fixedShift.id)}
                      disabled={saving}
                      className="text-red-600 hover:text-red-800"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* 新規作成時のプレースホルダー */}
        {isNewUser && newUserFixedShifts.length === 0 && (
          <div className="text-center text-gray-500 py-4">
            固定シフトを追加してください（任意）
          </div>
        )}
      </div>
    </div>
  );
}; 