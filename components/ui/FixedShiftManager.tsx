import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import type { DatabaseFixedShift, TimeSlot } from '@/lib/types';

interface FixedShiftManagerProps {
  userId: string;
  userStores: string[]; // ユーザーが所属する店舗IDの配列
  onUpdate?: () => void; // 更新後のコールバック
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
  onUpdate
}) => {
  const [fixedShifts, setFixedShifts] = useState<DatabaseFixedShift[]>([]);
  const [timeSlotsByStore, setTimeSlotsByStore] = useState<Record<string, TimeSlot[]>>({});
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新規追加用のフォーム
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newShiftForm, setNewShiftForm] = useState<FixedShiftFormData>({
    store_id: '',
    day_of_week: 1, // 月曜日をデフォルト
    time_slot_id: '',
    is_active: true
  });

  useEffect(() => {
    if (userId && userStores.length > 0) {
      loadData();
    }
  }, [userId, userStores]);

  // データ読み込み
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 固定シフト取得
      const fixedShiftsRes = await fetch(`/api/fixed-shifts?user_id=${userId}`);
      const fixedShiftsData = await fixedShiftsRes.json();
      
      if (!fixedShiftsRes.ok) {
        throw new Error(fixedShiftsData.error || '固定シフトの取得に失敗しました');
      }
      
      setFixedShifts(fixedShiftsData.data || []);

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
    try {
      setSaving(true);
      setError(null);

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
        <h3 className="text-lg font-semibold text-gray-900">固定出勤設定</h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsAddingNew(!isAddingNew)}
          disabled={saving}
        >
          {isAddingNew ? 'キャンセル' : '+ 新規追加'}
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
            >
              キャンセル
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddFixedShift}
              disabled={saving || !newShiftForm.store_id || !newShiftForm.time_slot_id}
            >
              {saving ? '追加中...' : '追加'}
            </Button>
          </div>
        </div>
      )}

      {/* 既存の固定シフト一覧 */}
      <div className="space-y-2">
        {fixedShifts.length === 0 ? (
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
      </div>
    </div>
  );
}; 