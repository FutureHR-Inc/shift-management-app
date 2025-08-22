'use client';

import React from 'react';
import type { Shift, ApiUser as User, TimeSlot } from '../../lib/types';

interface DesktopShiftTableProps {
  selectedStore: string;
  selectedWeek: string;
  viewMode: string;
  displayDates: Date[];
  getRequiredStaff: (dayOfWeek: number, timeSlotId: string) => number;
  getEmergencyRequestForShift: (shiftId: string) => any;
  handleCellClick: (date: string, timeSlot: string, dayIndex: number) => void;
  handleDeleteShift: (shiftId: string) => void;
  setContextMenu: (menu: any) => void;
  setEmergencyManagement: (emergency: any) => void;
  currentUser?: { id: string };
  shifts: Shift[];
  users: User[];
  timeSlots: TimeSlot[];
}

export const DesktopShiftTable: React.FC<DesktopShiftTableProps> = ({
  selectedStore,
  selectedWeek,
  viewMode,
  displayDates,
  getRequiredStaff,
  getEmergencyRequestForShift,
  handleCellClick,
  handleDeleteShift,
  setContextMenu,
  setEmergencyManagement,
  currentUser,
  shifts,
  users,
  timeSlots
}) => {
  // getShiftForSlot関数を再実装
  const getShiftForSlot = (date: string, timeSlotId: string) => {
    const dateString = date;
    return shifts.filter(shift =>
      shift.date === dateString &&
      shift.timeSlotId === timeSlotId &&
      shift.storeId === selectedStore
    );
  };

  return (
    <div className="hidden lg:block">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed" style={{ width: viewMode === 'month' ? '1800px' : viewMode === 'half-month' ? '1200px' : '100%' }}>
          <colgroup>
            <col style={{ width: viewMode === 'week' ? '120px' : '100px' }} />
            {displayDates.map((_, index) => (
              <col key={index} style={{
                width: viewMode === 'month' ? '120px' :
                  viewMode === 'half-month' ? '150px' :
                    `calc((100% - 120px) / ${displayDates.length})`
              }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left p-2 sm:p-3 lg:p-2 font-medium text-gray-900 bg-gray-50 sticky left-0 z-10 text-xs sm:text-sm lg:text-sm">時間帯</th>
              {displayDates.map((date, index) => (
                <th key={index} className="text-center p-1 sm:p-2 lg:p-1 font-medium text-gray-900 bg-gray-50">
                  <div className="text-xs sm:text-sm lg:text-sm">
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
            {timeSlots.map((timeSlot) => (
              <tr key={timeSlot.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-2 sm:p-3 lg:p-2 bg-gray-50 sticky left-0 z-10">
                  <div className="font-medium text-gray-900 text-xs sm:text-sm lg:text-sm">{timeSlot.name}</div>
                  <div className="text-xs text-gray-500">{timeSlot.start_time}-{timeSlot.end_time}</div>
                </td>
                {displayDates.map((date, dayIndex) => {
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
                      <td key={dayIndex} className="p-1 sm:p-2 lg:p-1 align-top">
                        <div
                          className={`min-h-16 border-2 rounded-lg sm:rounded-xl lg:rounded-lg p-1 sm:p-2 lg:p-2 cursor-pointer hover:shadow-md transition-all touch-manipulation h-auto ${cellStyle}`}
                          onClick={() => handleCellClick(dateString, timeSlot.id, date.getDay())}
                        >
                          {/* 必要人数表示 */}
                          <div className="flex items-center justify-between mb-1 sm:mb-2 lg:mb-1">
                            <span className="text-xs sm:text-sm lg:text-xs font-medium text-gray-600">
                              {current}/{required}人
                            </span>
                            {current !== required && (
                              <span className="text-xs sm:text-sm lg:text-xs">
                                {current < required ? '🔴' : '🔵'}
                              </span>
                            )}
                          </div>

                          {/* スタッフ表示 */}
                          <div className="space-y-1 lg:space-y-0.5">
                            {/* 既存のシフト表示 */}
                            {dayShifts && dayShifts.length > 0 && (
                              dayShifts.map((shift) => {
                                try {
                                  const user = users.find(u => u.id === shift.userId);
                                  const timeSlotData = timeSlots.find(ts => ts.id === shift.timeSlotId);

                                  if (!user || !timeSlotData) {
                                    return null;
                                  }

                                  // 確定済みシフトかどうかを判定
                                  const isConfirmed = shift.status === 'confirmed';
                                  const isFixedShift = (shift as any).isFixedShift || shift.id?.startsWith('fixed-');

                                  // 代打募集状況をチェック（固定シフトは代打募集不可）
                                  const emergencyRequest = isFixedShift ? null : getEmergencyRequestForShift(shift.id);
                                  const isEmergencyRequested = !!emergencyRequest;

                                  // 表示する時間を決定
                                  const displayTime = shift.customStartTime && shift.customEndTime
                                    ? `${shift.customStartTime}-${shift.customEndTime}`
                                    : `${timeSlotData.start_time}-${timeSlotData.end_time}`;

                                  return (
                                    <div
                                      key={shift.id}
                                      className={`text-xs sm:text-sm lg:text-xs p-1.5 sm:p-2 lg:p-1.5 rounded-md border transition-all group relative ${isFixedShift
                                        ? 'bg-green-100 border-green-300 text-green-800'
                                        : isConfirmed
                                          ? 'bg-blue-100 border-blue-300 text-blue-800'
                                          : 'bg-white border-gray-200 text-gray-700'
                                        } ${isEmergencyRequested ? 'ring-2 ring-red-300' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isFixedShift) {
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
                                      {/* PC版：コンパクト表示 */}
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium truncate">
                                            {isFixedShift && <span className="mr-1">📌</span>}
                                            {user.name}
                                          </div>
                                          <div className="text-xs text-gray-600 truncate mt-0.5">
                                            {displayTime}
                                          </div>
                                        </div>
                                        <div className="flex items-center space-x-1 ml-2">
                                          {isEmergencyRequested && (
                                            <span className="text-red-600 font-bold text-xs">🆘</span>
                                          )}
                                          {/* 削除ボタン - 固定シフトと確定済みシフトは削除不可 */}
                                          {!isConfirmed && !isEmergencyRequested && !isFixedShift && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteShift(shift.id);
                                              }}
                                              className="w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold opacity-70 group-hover:opacity-100 transition-all"
                                              title="削除"
                                            >
                                              ×
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                } catch (shiftError) {
                                  console.error('Error rendering shift:', shiftError);
                                  return null;
                                }
                              })
                            )}

                            {/* 常に表示されるスタッフ追加ボタン */}
                            <div
                              className="flex items-center justify-center p-1.5 sm:p-2 lg:p-1.5 border-2 border-dashed border-gray-300 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCellClick(dateString, timeSlot.id, date.getDay());
                              }}
                            >
                              <div className="text-center text-gray-500 hover:text-blue-600">
                                <div className="text-sm lg:text-xs mb-1">+</div>
                                <div className="text-xs lg:text-xs">
                                  スタッフ追加
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    );
                  } catch (cellError) {
                    console.error('Error rendering cell:', cellError);
                    return (
                      <td key={dayIndex} className="p-1 sm:p-2 lg:p-1 align-top">
                        <div className="min-h-16 border-2 rounded-lg sm:rounded-xl lg:rounded-lg p-1 sm:p-2 lg:p-2 border-red-300 bg-red-50">
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