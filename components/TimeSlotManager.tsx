'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { TimeSlot, TimeSlotInput } from '@/lib/types';

interface TimeSlotManagerProps {
  storeId: string;
  onTimeSlotsChange?: (timeSlots: TimeSlot[]) => void;
}

interface TimeSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (timeSlot: TimeSlotInput) => void;
  editingSlot?: TimeSlot | null;
  existingSlots: TimeSlot[];
}

// 時間帯編集モーダル
function TimeSlotModal({ isOpen, onClose, onSave, editingSlot, existingSlots }: TimeSlotModalProps) {
  const [formData, setFormData] = useState<TimeSlotInput>({
    name: '',
    start_time: '',
    end_time: '',
    display_order: 0
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingSlot) {
      setFormData({
        name: editingSlot.name,
        start_time: editingSlot.start_time,
        end_time: editingSlot.end_time,
        display_order: editingSlot.display_order
      });
    } else {
      setFormData({
        name: '',
        start_time: '',
        end_time: '',
        display_order: (existingSlots.length + 1) * 10
      });
    }
    setErrors({});
  }, [editingSlot, existingSlots, isOpen]);

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = '時間帯名は必須です';
    }

    if (!formData.start_time) {
      newErrors.start_time = '開始時間は必須です';
    }

    if (!formData.end_time) {
      newErrors.end_time = '終了時間は必須です';
    }

    if (formData.start_time && formData.end_time) {
      const [startHour, startMin] = formData.start_time.split(':').map(Number);
      const [endHour, endMin] = formData.end_time.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes >= endMinutes) {
        newErrors.end_time = '終了時間は開始時間より後である必要があります';
      }

      // 他の時間帯との重複チェック
      const currentSlotId = editingSlot?.id;
      const hasOverlap = existingSlots.some(slot => {
        if (currentSlotId && slot.id === currentSlotId) return false;

        const [slotStartHour, slotStartMin] = slot.start_time.split(':').map(Number);
        const [slotEndHour, slotEndMin] = slot.end_time.split(':').map(Number);
        const slotStartMinutes = slotStartHour * 60 + slotStartMin;
        const slotEndMinutes = slotEndHour * 60 + slotEndMin;

        return (
          (startMinutes < slotEndMinutes && endMinutes > slotStartMinutes)
        );
      });

      if (hasOverlap) {
        newErrors.start_time = '他の時間帯と重複しています';
        newErrors.end_time = '他の時間帯と重複しています';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving time slot:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900">
            {editingSlot ? '時間帯編集' : '時間帯追加'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              時間帯名 *
            </label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例：モーニング、ランチタイム"
              className={errors.name ? 'border-red-300' : ''}
            />
            {errors.name && (
              <p className="text-sm text-red-600 mt-1">{errors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                開始時間 *
              </label>
              <Input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className={errors.start_time ? 'border-red-300' : ''}
              />
              {errors.start_time && (
                <p className="text-sm text-red-600 mt-1">{errors.start_time}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                終了時間 *
              </label>
              <Input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className={errors.end_time ? 'border-red-300' : ''}
              />
              {errors.end_time && (
                <p className="text-sm text-red-600 mt-1">{errors.end_time}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              表示順序
            </label>
            <Input
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
              min="0"
              step="10"
              className="w-24"
            />
            <p className="text-xs text-gray-500 mt-1">小さい値ほど上に表示されます</p>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  保存中...
                </>
              ) : (
                editingSlot ? '更新' : '追加'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// メインコンポーネント
export default function TimeSlotManager({ storeId, onTimeSlotsChange }: TimeSlotManagerProps) {
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);

  // 時間帯データを取得
  const fetchTimeSlots = useCallback(async () => {
    if (!storeId) return;
    
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/time-slots?store_id=${storeId}`);
      if (!response.ok) {
        throw new Error('時間帯データの取得に失敗しました');
      }

      const result = await response.json();
      const slots = result.data || [];
      setTimeSlots(prevSlots => {
        // データが変更された場合のみ状態とコールバックを更新
        if (JSON.stringify(slots) !== JSON.stringify(prevSlots)) {
          onTimeSlotsChange?.(slots);
          return slots;
        }
        return prevSlots;
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : '時間帯データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [storeId]); // onTimeSlotsChangeを依存配列から除外して無限ループを防止

  useEffect(() => {
    if (storeId) {
      fetchTimeSlots();
    }
  }, [storeId, fetchTimeSlots]);

  // 時間帯保存
  const handleSaveTimeSlot = async (timeSlotData: TimeSlotInput) => {
    try {
      const url = editingSlot ? `/api/time-slots` : `/api/time-slots`;
      const method = editingSlot ? 'PUT' : 'POST';
      const body = editingSlot 
        ? { id: editingSlot.id, ...timeSlotData }
        : { store_id: storeId, ...timeSlotData };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '時間帯の保存に失敗しました');
      }

      await fetchTimeSlots();
      setEditingSlot(null);
    } catch (error) {
      throw error;
    }
  };

  // 時間帯削除
  const handleDeleteTimeSlot = async (slotId: string) => {
    if (!confirm('この時間帯を削除しますか？\n既存のシフトで使用されている場合は削除できません。')) {
      return;
    }

    try {
      setDeletingSlotId(slotId);
      
      const response = await fetch(`/api/time-slots?id=${slotId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '時間帯の削除に失敗しました');
      }

      await fetchTimeSlots();
    } catch (error) {
      setError(error instanceof Error ? error.message : '時間帯の削除に失敗しました');
    } finally {
      setDeletingSlotId(null);
    }
  };

  // 編集開始
  const handleEditTimeSlot = (slot: TimeSlot) => {
    setEditingSlot(slot);
    setIsModalOpen(true);
  };

  // 新規追加開始
  const handleAddTimeSlot = () => {
    setEditingSlot(null);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">時間帯を読み込み中...</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>時間帯設定</CardTitle>
          <Button onClick={handleAddTimeSlot}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            時間帯を追加
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
            >
              閉じる
            </button>
          </div>
        )}

        {timeSlots.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-lg font-medium mb-2">時間帯が設定されていません</p>
            <p className="text-sm mb-4">シフト管理を開始するために時間帯を追加してください</p>
            <Button onClick={handleAddTimeSlot}>
              最初の時間帯を追加
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {timeSlots.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                <div className="flex-1">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{slot.name}</h4>
                      <p className="text-sm text-gray-500">
                        {slot.start_time} - {slot.end_time}
                      </p>
                    </div>
                    <div className="text-xs text-gray-400">
                      順序: {slot.display_order}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleEditTimeSlot(slot)}
                  >
                    編集
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDeleteTimeSlot(slot.id)}
                    disabled={deletingSlotId === slot.id}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    {deletingSlotId === slot.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                    ) : (
                      '削除'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">時間帯設定のヒント</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• 営業時間に合わせて適切な時間帯を設定してください</li>
            <li>• 時間帯同士の重複はできません</li>
            <li>• 表示順序で時間帯の並び順を調整できます</li>
            <li>• 既存のシフトで使用中の時間帯は削除できません</li>
          </ul>
        </div>
      </CardContent>

      <TimeSlotModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTimeSlot}
        editingSlot={editingSlot}
        existingSlots={timeSlots}
      />
    </Card>
  );
} 