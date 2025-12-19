'use client';

import React from 'react';
import type { Shift, ApiUser as User, TimeSlot } from '../../lib/types';

interface MobileShiftTableProps {
  selectedStore: string;
  selectedWeek: string;
  viewMode: string;
  displayDates: Date[];
  getRequiredStaff: (dayOfWeek: number, timeSlotId: string) => number;
  getShiftForSlot?: (date: string, timeSlot: string) => Shift[]; // 親のgetShiftForSlotを使用
  getEmergencyRequestForShift: (shiftId: string) => any;
  handleCellClick: (date: string, timeSlot: string, dayIndex: number) => void;
  handleDeleteShift: (shiftId: string, shift?: Shift, date?: string) => void;
  setContextMenu: (menu: any) => void;
  setEmergencyManagement: (emergency: any) => void;
  setEmergencyModal: (modal: { show: boolean; shift: any | null }) => void;
  currentUser?: { id: string; role?: string };
  shifts: Shift[];
  users: User[];
  timeSlots: TimeSlot[];
  readOnly?: boolean; // 閲覧専用モード
}

export const MobileShiftTable: React.FC<MobileShiftTableProps> = ({
  selectedStore,
  selectedWeek,
  viewMode,
  displayDates,
  getRequiredStaff,
  getShiftForSlot: parentGetShiftForSlot,
  getEmergencyRequestForShift,
  handleCellClick,
  handleDeleteShift,
  setContextMenu,
  setEmergencyManagement,
  setEmergencyModal,
  currentUser,
  shifts,
  users,
  timeSlots,
  readOnly = false
}) => {
  // getShiftForSlot関数（親の関数を優先使用、固定シフト対応）
  const getShiftForSlot = (date: string, timeSlotId: string) => {
    // 親コンポーネントからgetShiftForSlotが渡されている場合はそれを使用（固定シフト対応）
    if (parentGetShiftForSlot) {
      return parentGetShiftForSlot(date, timeSlotId);
    }
    
    // フォールバック: props.shiftsのみを使用（固定シフトなし）
    const dateString = date;
    return (shifts || []).filter(shift =>
      shift.date === dateString &&
      shift.timeSlotId === timeSlotId &&
      shift.storeId === selectedStore
    );
  };

  return (
    <div className="lg:hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-auto" style={{ 
          minWidth: viewMode === 'month' ? '1200px' : viewMode === 'half-month' ? '800px' : '600px',
          maxWidth: viewMode === 'month' ? '2000px' : viewMode === 'half-month' ? '1400px' : '1000px'
        }}>
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left p-2 sm:p-3 font-medium text-gray-900 bg-gray-50 sticky left-0 z-10 text-xs sm:text-sm min-w-[80px]">時間帯</th>
              {(displayDates || []).map((date, index) => (
                <th key={index} className={`text-center p-1 sm:p-2 font-medium text-gray-900 bg-gray-50 ${viewMode === 'month' ? 'min-w-20 sm:min-w-24' : 'min-w-24 sm:min-w-32'
                  }`}>
                  <div className="text-xs sm:text-sm">
                    {date.toLocaleDateString('ja-JP', {
                      month: viewMode === 'month' ? 'numeric' : 'short',
                      day: 'numeric'
                    })}
                  </div>
                  <div className="text-xs text-gray-500">
                    {date.toLocaleDateString('ja-JP', { weekday: 'short' })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(timeSlots || []).map((timeSlot) => (
              <tr key={timeSlot.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-2 sm:p-3 bg-gray-50 sticky left-0 z-10">
                  <div className="font-medium text-gray-900 text-xs sm:text-sm">{timeSlot.name}</div>
                  <div className="text-xs text-gray-500">{timeSlot.start_time}-{timeSlot.end_time}</div>
                </td>
                {(displayDates || []).map((date, dayIndex) => {
                  try {
                    const dateString = date.toISOString().split('T')[0];
                    const dayShifts = getShiftForSlot(dateString, timeSlot.id);
                    const required = getRequiredStaff(date.getDay(), timeSlot.id);
                    const current = dayShifts ? dayShifts.length : 0;

                    // 人数過不足による色分け
                    let cellStyle = '';
                    if (current < required) {
                      cellStyle = 'border-red-300 bg-red-50';
                    } else if (current > required) {
                      cellStyle = 'border-blue-300 bg-blue-50';
                    } else if (current === required && required > 0) {
                      cellStyle = 'border-green-300 bg-green-50';
                    } else {
                      cellStyle = 'border-gray-200 bg-gray-50';
                    }

                    return (
                      <td key={dayIndex} className="p-1 sm:p-2 align-top">
                        <div
                          className={`min-h-20 sm:min-h-28 border-2 rounded-lg sm:rounded-xl p-1 sm:p-2 ${readOnly ? 'cursor-default' : 'cursor-pointer hover:shadow-md'} transition-all touch-manipulation h-auto ${cellStyle}`}
                          onClick={readOnly ? undefined : () => handleCellClick(dateString, timeSlot.id, date.getDay())}
                        >
                          {/* 必要人数表示 */}
                          <div className="flex items-center justify-between mb-1 sm:mb-2 min-h-[24px] sm:min-h-[28px]">
                            <span className="text-xs sm:text-sm font-medium text-gray-600 whitespace-nowrap">
                              {current}/{required}人
                            </span>
                            {!readOnly && current < required ? (
                              <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    try {
                                                                          // 不足分の募集用にデータを作成
                                    const convertedShift = {
                                      id: `shortage-${dateString}-${timeSlot.id}`,
                                      user_id: currentUser?.id || '',  // 募集作成者のID
                                      store_id: selectedStore,
                                      time_slot_id: timeSlot.id,
                                      date: dateString,
                                      status: 'confirmed',
                                      created_at: new Date().toISOString(),
                                      updated_at: new Date().toISOString(),
                                      request_type: 'shortage',  // 不足分の募集であることを明示
                                      reason: `人員不足のため（必要人数: ${required}人、現在: ${current}人）`
                                    };
                                      if (setEmergencyModal) {
                                        setEmergencyModal({ show: true, shift: convertedShift });
                                      }
                                    } catch (error) {
                                      console.error('Error showing emergency modal for shortage:', error);
                                    }
                                  }}
                                className="text-xs sm:text-sm px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 active:bg-red-300 whitespace-nowrap shrink-0 ml-1"
                              >
                                募集{required - current}人
                              </button>
                            ) : current > required ? (
                              <span className="text-xs sm:text-sm">🔵</span>
                            ) : null}
                          </div>

                          {/* スタッフ表示 */}
                          <div className="space-y-1">
                            {/* 既存のシフト表示 */}
                            {dayShifts && dayShifts.length > 0 && (
                              dayShifts.map((shift) => {
                                try {
                                  const user = (users || []).find(u => u.id === shift.userId);
                                  const timeSlotData = (timeSlots || []).find(ts => ts.id === shift.timeSlotId);

                                  if (!user || !timeSlotData) {
                                    return null;
                                  }

                                  // 確定済みシフトかどうかを判定
                                  const isConfirmed = shift.status === 'confirmed';
                                  const isFixedShift = (shift as any).isFixedShift || shift.id?.startsWith('fixed-');
                                  
                                  // カスタム時間かどうかを判定（開始時間または終了時間のいずれかがあればOK）
                                  const hasCustomTime = Boolean(
                                    (shift.customStartTime && 
                                     shift.customStartTime !== null &&
                                     typeof shift.customStartTime === 'string' &&
                                     shift.customStartTime.trim() !== '') ||
                                    (shift.customEndTime && 
                                     shift.customEndTime !== null &&
                                     typeof shift.customEndTime === 'string' &&
                                     shift.customEndTime.trim() !== '')
                                  );
                                  console.log(`🔍 [MobileTable] カスタム時間: start=${shift.customStartTime}, end=${shift.customEndTime}, hasCustom=${hasCustomTime}`);

                                  // 代打募集状況をチェック（固定シフトは代打募集不可）
                                  const emergencyRequest = isFixedShift ? null : getEmergencyRequestForShift(shift.id);
                                  const isEmergencyRequested = !!emergencyRequest;

                                  return (
                                    <div
                                      key={shift.id}
                                      className={`text-xs sm:text-sm p-1.5 sm:p-2 rounded-md border transition-all group relative ${isFixedShift
                                        ? 'bg-green-100 border-green-300 text-green-800'
                                        : isConfirmed
                                          ? 'bg-blue-100 border-blue-300 text-blue-800'
                                          : 'bg-white border-gray-200 text-gray-700'
                                        } ${isEmergencyRequested ? 'ring-2 ring-red-300' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        
                                        // 閲覧モードでは何もしない
                                        if (readOnly) {
                                          return;
                                        }
                                        
                                        // 店長権限チェック
                                        const isManager = currentUser?.role === 'manager';
                                        
                                        if (isFixedShift) {
                                          // 固定シフトの場合は代打募集と削除の両方を選択可能（店長のみ）
                                          if (!isManager) {
                                            return;
                                          }
                                          
                                          // 店長の場合は選択肢を表示
                                          const action = window.confirm(
                                            `${user.name}さんの固定シフト\n\nOK: 代打募集を開始\nキャンセル: この日のみ削除`
                                          );
                                          
                                          if (action) {
                                            // 代打募集モーダルを表示
                                            try {
                                              const convertedShift = {
                                                id: shift.id,
                                                user_id: shift.userId,
                                                store_id: shift.storeId,
                                                time_slot_id: shift.timeSlotId,
                                                date: shift.date,
                                                status: 'confirmed', // 固定シフトは確定済みとして扱う
                                                created_at: new Date().toISOString(),
                                                updated_at: new Date().toISOString()
                                              };
                                              if (setEmergencyModal) {
                                                setEmergencyModal({ show: true, shift: convertedShift });
                                              }
                                            } catch (error) {
                                              console.error('Error showing emergency modal:', error);
                                            }
                                          } else {
                                            // 削除
                                            if (window.confirm(`${user.name}さんの固定シフトをこの日のみ削除しますか？\n他の週は通常通り表示されます。`)) {
                                              // 日付を確実に取得（shift.dateが設定されていない場合のフォールバック）
                                              const deleteDate = shift.date || dateString;
                                              console.log('🔍 [MobileTable] 固定シフト削除:', {
                                                shiftId: shift.id,
                                                shiftDate: shift.date,
                                                dateString,
                                                deleteDate
                                              });
                                              handleDeleteShift(shift.id, shift, deleteDate);
                                            }
                                          }
                                          
                                          return;
                                        }
                                        
                                        if (isEmergencyRequested) {
                                          const volunteerCount = emergencyRequest.emergency_volunteers?.length || 0;
                                          if (volunteerCount > 0) {
                                            setEmergencyManagement({
                                              show: true,
                                              request: emergencyRequest
                                            });
                                          } else {
                                            alert('まだ応募者がいません。');
                                          }
                                        } else if (isConfirmed) {
                                          // 確定済みシフトの場合は代打募集と削除の選択肢を表示
                                          if (isManager) {
                                            // 店長の場合は選択肢を表示
                                            const action = window.confirm(
                                              `${user.name}さんのシフト\n\nOK: 代打募集を開始\nキャンセル: 削除`
                                            );
                                            
                                            if (action) {
                                              // 代打募集モーダルを表示
                                              try {
                                                const convertedShift = {
                                                  id: shift.id,
                                                  user_id: shift.userId,
                                                  store_id: shift.storeId,
                                                  time_slot_id: shift.timeSlotId,
                                                  date: shift.date,
                                                  status: shift.status,
                                                  created_at: new Date().toISOString(),
                                                  updated_at: new Date().toISOString()
                                                };
                                                if (setEmergencyModal) {
                                                  setEmergencyModal({ show: true, shift: convertedShift });
                                                }
                                              } catch (error) {
                                                console.error('Error showing emergency modal:', error);
                                              }
                                            } else {
                                              // 削除
                                              if (window.confirm(`${user.name}さんのシフトを削除しますか？`)) {
                                                // 日付を確実に取得（shift.dateが設定されていない場合のフォールバック）
                                                const deleteDate = shift.date || dateString;
                                                handleDeleteShift(shift.id, shift, deleteDate);
                                              }
                                            }
                                          } else {
                                            // 店長以外は代打募集のみ
                                            try {
                                              const convertedShift = {
                                                id: shift.id,
                                                user_id: shift.userId,
                                                store_id: shift.storeId,
                                                time_slot_id: shift.timeSlotId,
                                                date: shift.date,
                                                status: shift.status,
                                                created_at: new Date().toISOString(),
                                                updated_at: new Date().toISOString()
                                              };
                                              if (setEmergencyModal) {
                                                setEmergencyModal({ show: true, shift: convertedShift });
                                              }
                                            } catch (error) {
                                              console.error('Error showing emergency modal:', error);
                                            }
                                          }
                                        } else {
                                          setContextMenu({
                                            show: true,
                                            x: e.pageX,
                                            y: e.pageY,
                                            shiftId: shift.id,
                                            shift: shift
                                          });
                                        }
                                      }}
                                    >
                                      {/* スマホ・タブレット版：詳細表示 */}
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1 mr-1 min-w-0">
                                          <div className="flex items-center space-x-1 mb-0.5">
                                            <div className="flex-shrink-0">
                                              {isFixedShift && <span>📌</span>}
                                              {!isFixedShift && isConfirmed && <span>✅</span>}
                                              {!isFixedShift && shift.status === 'draft' && <span>📝</span>}
                                              {!isFixedShift && hasCustomTime && <span>⏰</span>}
                                            </div>
                                            <div className="font-medium truncate">
                                              {user.name}
                                            </div>
                                          </div>
                                          {/* 時間表示 */}
                                          <div className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">
                                            {hasCustomTime 
                                              ? `${shift.customStartTime || timeSlotData.start_time}-${shift.customEndTime || timeSlotData.end_time}`
                                              : `${timeSlotData.start_time}-${timeSlotData.end_time}`
                                            }
                                          </div>
                                        </div>
                                        <div className="flex items-center space-x-1">
                                          {isEmergencyRequested && (
                                            <span className="text-red-600 font-bold text-xs">🆘</span>
                                          )}
                                          {/* 削除ボタン - 下書きシフトのみ表示（確定シフトと固定シフトはクリックで削除可能） */}
                                          {!isConfirmed && !isEmergencyRequested && !isFixedShift && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                // 日付を確実に取得（shift.dateが設定されていない場合のフォールバック）
                                                const deleteDate = shift.date || dateString;
                                                handleDeleteShift(shift.id, shift, deleteDate);
                                              }}
                                              className="w-4 h-4 sm:w-5 sm:h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold opacity-70 group-hover:opacity-100 transition-all"
                                              title="削除"
                                            >
                                              ×
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      {/* ステータスバッジ */}
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {/* カスタム時間表示 */}
                                        {(shift.customStartTime && shift.customEndTime) && (
                                          <div className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                            ⏰ {shift.customStartTime}-{shift.customEndTime}
                                          </div>
                                        )}
                                        {/* 固定シフト表示 */}
                                        {isFixedShift && (
                                          <div className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                            📌 固定
                                          </div>
                                        )}
                                        {/* 確定マーク */}
                                        {isConfirmed && !isFixedShift && (
                                          <div className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                            ✓ 確定
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                } catch (shiftError) {
                                  console.error('Error rendering shift:', shiftError);
                                  return null;
                                }
                              })
                            )}

                            {/* スタッフ追加ボタン（閲覧モードでは非表示、シフトがない場合のみ「シフトなし」を表示） */}
                            {readOnly ? (
                              dayShifts && dayShifts.length === 0 ? (
                                <div className="flex items-center justify-center p-1.5 sm:p-2 text-gray-400 text-xs sm:text-sm">
                                  シフトなし
                                </div>
                              ) : null
                            ) : (
                              <div
                                className="flex items-center justify-center p-1.5 sm:p-2 border-2 border-dashed border-gray-300 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCellClick(dateString, timeSlot.id, date.getDay());
                                }}
                              >
                                <div className="text-center text-gray-500 hover:text-blue-600">
                                  <div className="text-lg sm:text-xl mb-1">+</div>
                                  <div className="text-xs sm:text-sm">
                                    <span className="sm:inline">タップして</span>追加
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  } catch (cellError) {
                    console.error('Error rendering cell:', cellError);
                    return (
                      <td key={dayIndex} className="p-1 sm:p-2 align-top">
                        <div className="min-h-20 sm:min-h-28 border-2 rounded-lg sm:rounded-xl p-1 sm:p-2 border-red-300 bg-red-50">
                          <span className="text-xs text-red-600">エラー</span>
                        </div>
                      </td>
                    );
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}; 