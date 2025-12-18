'use client';

import React from 'react';
import type { Shift, ApiUser as User, TimeSlot, DatabaseShift } from '../../lib/types';

interface DesktopShiftTableProps {
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

export const DesktopShiftTable: React.FC<DesktopShiftTableProps> = ({
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
      const allShifts = parentGetShiftForSlot(date, timeSlotId);
      console.log(`🔍 [DesktopTable] ${date} ${timeSlotId}: ${allShifts.length}件のシフト（親関数使用）`);
      allShifts.forEach((shift, i) => {
        console.log(`  [${i}] ${shift.userId} - ${shift.isFixedShift ? '固定' : '通常'}シフト`);
      });
      return allShifts;
    }
    
    // フォールバック: props.shiftsのみを使用（固定シフトなし）
    const dateString = date;
    const dayShifts = (shifts || []).filter(shift =>
      shift.date === dateString &&
      shift.timeSlotId === timeSlotId &&
      shift.storeId === selectedStore
    );
    
    console.log(`🔍 [DesktopTable] ${date} ${timeSlotId}: ${dayShifts.length}件のシフト（フォールバック）`);
    return dayShifts;
  };

  return (
    <div className="hidden lg:block">
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse table-fixed print-table"
          style={{ 
          width: viewMode === 'month' ? '2000px' : 
                 viewMode === 'half-month' ? '1400px' : 
                 '100%',
          minWidth: '800px'
        }}>
          <colgroup>
            <col style={{ width: viewMode === 'week' ? '140px' : '120px' }} />
            {(displayDates || []).map((_, index) => (
              <col key={index} style={{
                width: viewMode === 'month' ? '140px' :
                       viewMode === 'half-month' ? '160px' :
                       `calc((100% - 140px) / ${displayDates.length})`
              }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left p-2 sm:p-3 lg:p-2 font-medium text-gray-900 bg-gray-50 sticky left-0 z-10 text-xs sm:text-sm lg:text-sm">時間帯</th>
              {(displayDates || []).map((date, index) => (
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
            {(timeSlots || []).map((timeSlot) => (
              <tr key={timeSlot.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-2 sm:p-3 lg:p-2 bg-gray-50 sticky left-0 z-10">
                  <div className="font-medium text-gray-900 text-xs sm:text-sm lg:text-sm">{timeSlot.name}</div>
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
                      <td key={dayIndex} className="p-1 sm:p-2 lg:p-1 align-top">
                        <div
                          className={`min-h-16 border-2 rounded-lg sm:rounded-xl lg:rounded-lg p-1 sm:p-2 lg:p-2 ${readOnly ? 'cursor-default' : 'cursor-pointer hover:shadow-md'} transition-all touch-manipulation h-auto overflow-hidden ${cellStyle}`}
                          onClick={readOnly ? undefined : () => handleCellClick(dateString, timeSlot.id, date.getDay())}
                        >
                          {/* 必要人数表示 */}
                          <div className="flex items-center justify-between mb-1 sm:mb-2 lg:mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm lg:text-xs font-medium text-gray-600">
                                {current}/{required}人
                              </span>
                              {!readOnly && current < required ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // 不足分の募集用にデータを作成
                                    const convertedShift: DatabaseShift = {
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
                                    setEmergencyModal({ show: true, shift: convertedShift });
                                  }}
                                  className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 active:bg-red-300 transition-colors"
                                >
                                  募集 {required - current}人
                                </button>
                              ) : current > required ? (
                                <span className="text-xs sm:text-sm lg:text-xs">🔵</span>
                              ) : null}
                            </div>
                          </div>

                          {/* スタッフ表示 */}
                          <div className="space-y-1 lg:space-y-0.5">
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
                                  
                                  // デバッグ: シフトの詳細情報を出力
                                  console.log('🔍 シフト詳細:', {
                                    id: shift.id,
                                    status: shift.status,
                                    isConfirmed,
                                    isFixedShift,
                                    rawShift: shift,
                                    rawStatus: typeof shift.status,
                                    statusCheck: shift.status === 'confirmed'
                                  });
                                  
                                  // デバッグ: ステータス確認
                                  console.log(`🔍 [DesktopTable] シフト ${shift.id}: ステータス=${shift.status}, 固定=${isFixedShift}, 確定=${isConfirmed}`, {
                                    shift,
                                    status: shift.status,
                                    isConfirmed,
                                    isFixedShift,
                                    rawStatus: shift.status,
                                    typeofStatus: typeof shift.status,
                                    statusComparison: shift.status === 'confirmed'
                                  });
                                  
                                  // デバッグ: 詳細なシフトデータ確認
                                  console.log(`🔍 [DesktopTable] 🔥 シフトデータ詳細 ${shift.id}:`, {
                                    userId: shift.userId,
                                    userName: user.name,
                                    customStartTime: shift.customStartTime,
                                    customEndTime: shift.customEndTime,
                                    timeSlotStart: timeSlotData.start_time,
                                    timeSlotEnd: timeSlotData.end_time,
                                    status: shift.status,
                                    isFixedShift: isFixedShift,
                                    fullShiftObject: shift
                                  });

                                  // 代打募集状況をチェック（固定シフトは代打募集不可）
                                  const emergencyRequest = isFixedShift ? null : getEmergencyRequestForShift(shift.id);
                                  const isEmergencyRequested = !!emergencyRequest;

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
                                  
                                  console.log(`🔍 [DesktopTable] 🧪 カスタム時間判定:`, {
                                    customStartTime: shift.customStartTime,
                                    customEndTime: shift.customEndTime,
                                    customStartTimeType: typeof shift.customStartTime,
                                    customEndTimeType: typeof shift.customEndTime,
                                    hasCustomTime: hasCustomTime
                                  });
                                  
                                  // 表示する時間を決定（カスタム時間がある場合は柔軟に組み合わせ）
                                  const displayTime = hasCustomTime
                                    ? `${shift.customStartTime || timeSlotData.start_time}-${shift.customEndTime || timeSlotData.end_time}`
                                    : `${timeSlotData.start_time}-${timeSlotData.end_time}`;
                                    
                                  console.log(`🔍 [DesktopTable] 🎯 最終表示時間: "${displayTime}" (カスタム: ${hasCustomTime}, カスタム開始: "${shift.customStartTime}", カスタム終了: "${shift.customEndTime}")`);

                                  return (
                                    <div
                                      key={shift.id}
                                      className={`text-xs sm:text-sm lg:text-xs p-1.5 sm:p-2 lg:p-1.5 rounded-md border transition-all group relative overflow-hidden ${isFixedShift
                                        ? 'bg-green-100 border-green-300 text-green-800'
                                        : isConfirmed
                                          ? 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200'
                                          : 'bg-white border-gray-200 text-gray-700'
                                        } ${isEmergencyRequested ? 'ring-2 ring-red-300' : ''} ${
                                          isConfirmed && !readOnly ? 'cursor-pointer' : ''
                                        }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        
                                        // 閲覧モードでは何もしない
                                        if (readOnly) {
                                          return;
                                        }
                                        
                                        console.log('🔍 シフトクリック:', {
                                          shiftId: shift.id,
                                          status: shift.status,
                                          isFixedShift,
                                          isConfirmed,
                                          isEmergencyRequested,
                                          event: {
                                            pageX: e.pageX,
                                            pageY: e.pageY,
                                            target: e.target,
                                            currentTarget: e.currentTarget
                                          }
                                        });

                                        // デバッグ: クリックされた要素の位置情報
                                        const target = e.target as HTMLElement;
                                        const currentTarget = e.currentTarget as HTMLElement;
                                        const targetRect = target.getBoundingClientRect();
                                        const currentTargetRect = currentTarget.getBoundingClientRect();
                                        
                                        console.log('🔍 クリック位置情報:', {
                                          target: {
                                            rect: targetRect,
                                            className: target.className
                                          },
                                          currentTarget: {
                                            rect: currentTargetRect,
                                            className: currentTarget.className
                                          },
                                          scroll: {
                                            x: window.scrollX,
                                            y: window.scrollY
                                          },
                                          viewport: {
                                            width: window.innerWidth,
                                            height: window.innerHeight
                                          }
                                        });

                                        // 店長権限チェック
                                        const isManager = currentUser?.role === 'manager';
                                        
                                        if (isFixedShift) {
                                          // 固定シフトの場合は代打募集と削除の両方を選択可能（店長のみ）
                                          if (!isManager) {
                                            return;
                                          }
                                          
                                          console.log('✅ 固定シフト - 代打募集と削除ボタンを表示');
                                          // 代打募集と削除ボタンを表示
                                          console.log('🎯 ボタン要素を作成開始');
                                          // ボタンのコンテナを作成
                                          const container = document.createElement('div');
                                          container.style.position = 'fixed';
                                          container.style.top = '0';
                                          container.style.left = '0';
                                          container.style.width = '100%';
                                          container.style.height = '100%';
                                          container.style.pointerEvents = 'none';
                                          container.style.zIndex = '9999';

                                          // ボタン要素を作成
                                          const buttonElement = document.createElement('div');
                                          buttonElement.className = 'bg-white rounded-xl shadow-lg border border-gray-200 p-4';
                                          buttonElement.style.position = 'absolute';
                                          buttonElement.style.pointerEvents = 'auto';
                                          buttonElement.style.display = 'block';
                                          buttonElement.style.visibility = 'visible';
                                          
                                          buttonElement.innerHTML = `
                                            <div class="flex flex-col gap-3">
                                              <div class="flex items-center gap-2 text-gray-900">
                                                <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                                                </svg>
                                                <span class="font-medium">固定シフト</span>
                                              </div>
                                              <div class="text-sm text-gray-600">
                                                ${user.name}さんのシフト
                                                <div class="mt-1">${displayTime}</div>
                                              </div>
                                              <button class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 active:bg-red-300 transition-colors">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                                                </svg>
                                                代打募集を開始
                                              </button>
                                              <button class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                この日のみ削除
                                              </button>
                                            </div>
                                          `;

                                          // クリックされた要素の位置情報を取得
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          
                                          // ビューポート内での位置を計算（クリックされた要素の中央に配置）
                                          const buttonLeft = rect.left + (rect.width / 2);
                                          const buttonTop = rect.top + (rect.height / 2);
                                          
                                          // ボタンを配置
                                          buttonElement.style.left = `${buttonLeft}px`;
                                          buttonElement.style.top = `${buttonTop}px`;
                                          buttonElement.style.transform = 'translate(-50%, -50%)';  // 中央揃え
                                          
                                          // 画面端に近い場合の調整
                                          setTimeout(() => {
                                            const buttonRect = buttonElement.getBoundingClientRect();
                                            const viewportWidth = window.innerWidth;
                                            const viewportHeight = window.innerHeight;

                                            // 右端からはみ出す場合
                                            if (buttonRect.right > viewportWidth) {
                                              const newLeft = viewportWidth - buttonRect.width - 10;
                                              buttonElement.style.left = `${newLeft + scrollX}px`;
                                            }

                                            // 下端からはみ出す場合
                                            if (buttonRect.bottom > viewportHeight) {
                                              const newTop = viewportHeight - buttonRect.height - 10;
                                              buttonElement.style.top = `${newTop + scrollY}px`;
                                            }
                                          }, 0);
                                          
                                          // ボタンのクリックイベントを設定
                                          const buttons = buttonElement.querySelectorAll('button');
                                          if (buttons.length > 0) {
                                            // 最初のボタン（代打募集）
                                            buttons[0].onclick = (e) => {
                                              e.stopPropagation();
                                              // containerごと削除
                                              if (container.parentNode) {
                                                container.parentNode.removeChild(container);
                                              }
                                              // DatabaseShiftに変換
                                              const convertedShift: DatabaseShift = {
                                                id: shift.id,
                                                user_id: shift.userId,
                                                store_id: shift.storeId,
                                                time_slot_id: shift.timeSlotId,
                                                date: shift.date,
                                                status: 'confirmed', // 固定シフトは確定済みとして扱う
                                                created_at: new Date().toISOString(),
                                                updated_at: new Date().toISOString()
                                              };
                                              setEmergencyModal({ show: true, shift: convertedShift });
                                            };
                                            
                                            // 2番目のボタン（削除）
                                            if (buttons.length > 1) {
                                              buttons[1].onclick = (e) => {
                                                e.stopPropagation();
                                                // containerごと削除
                                                if (container.parentNode) {
                                                  container.parentNode.removeChild(container);
                                                }
                                                if (window.confirm(`${user.name}さんの固定シフトをこの日のみ削除しますか？\n他の週は通常通り表示されます。`)) {
                                                  handleDeleteShift(shift.id, shift, shift.date);
                                                }
                                              };
                                            }
                                          }
                                          
                                          // ボタンをコンテナに追加
                                          container.appendChild(buttonElement);
                                          // コンテナをbodyに追加
                                          document.body.appendChild(container);

                                          // クリックイベントのリスナーを追加して、ボタン以外をクリックしたら削除
                                          const handleClickOutside = (event: MouseEvent) => {
                                            if (!buttonElement.contains(event.target as Node)) {
                                              if (container.parentNode) {
                                                container.parentNode.removeChild(container);
                                              }
                                              document.removeEventListener('click', handleClickOutside);
                                            }
                                          };
                                          setTimeout(() => {
                                            document.addEventListener('click', handleClickOutside);
                                          }, 0);
                                          
                                          return;
                                        }

                                        if (isEmergencyRequested) {
                                          console.log('🔄 既に代打募集中');
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
                                          console.log('✅ 確定済みシフト - 代打募集と削除ボタンを表示');
                                          // 代打募集と削除ボタンを表示
                                          console.log('🎯 ボタン要素を作成開始');
                                          // ボタンのコンテナを作成
                                          const container = document.createElement('div');
                                          container.style.position = 'fixed';
                                          container.style.top = '0';
                                          container.style.left = '0';
                                          container.style.width = '100%';
                                          container.style.height = '100%';
                                          container.style.pointerEvents = 'none';
                                          container.style.zIndex = '9999';

                                          // ボタン要素を作成
                                          const buttonElement = document.createElement('div');
                                          buttonElement.className = 'bg-white rounded-xl shadow-lg border border-gray-200 p-4';
                                          buttonElement.style.position = 'absolute';
                                          buttonElement.style.pointerEvents = 'auto';
                                          buttonElement.style.display = 'block';
                                          buttonElement.style.visibility = 'visible';
                                          console.log('🎯 ボタン要素を作成完了:', {
                                            element: buttonElement,
                                            className: buttonElement.className,
                                            style: buttonElement.style,
                                            position: buttonElement.style.position,
                                            zIndex: buttonElement.style.zIndex
                                          });
                                          
                                          // 店長の場合は削除ボタンも表示
                                          const deleteButtonHtml = isManager ? `
                                            <button class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors mt-2">
                                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                              削除
                                            </button>
                                          ` : '';
                                          
                                          buttonElement.innerHTML = `
                                            <div class="flex flex-col gap-3">
                                              <div class="flex items-center gap-2 text-gray-900">
                                                <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                                                </svg>
                                                <span class="font-medium">代打募集</span>
                                              </div>
                                              <div class="text-sm text-gray-600">
                                                ${user.name}さんのシフト
                                                <div class="mt-1">${displayTime}</div>
                                              </div>
                                              <button class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 active:bg-red-300 transition-colors">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                                                </svg>
                                                募集を開始
                                              </button>
                                              ${deleteButtonHtml}
                                            </div>
                                          `;

                                          console.log('✅ ボタンの位置を計算');
                                          // クリックされた要素の位置情報を取得
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          
                                          // ビューポート内での位置を計算（クリックされた要素の中央に配置）
                                          const buttonLeft = rect.left + (rect.width / 2);
                                          const buttonTop = rect.top + (rect.height / 2);
                                          
                                          // ボタンを配置
                                          buttonElement.style.left = `${buttonLeft}px`;
                                          buttonElement.style.top = `${buttonTop}px`;
                                          buttonElement.style.transform = 'translate(-50%, -50%)';  // 中央揃え
                                          
                                          console.log('✅ ボタンの位置を設定:', {
                                            rect,
                                            buttonLeft,
                                            buttonTop,
                                            finalLeft: `${buttonLeft + rect.width + 10}px`,
                                            finalTop: `${buttonTop}px`,
                                            viewportWidth: window.innerWidth,
                                            viewportHeight: window.innerHeight,
                                            documentWidth: document.documentElement.clientWidth,
                                            documentHeight: document.documentElement.clientHeight,
                                            scrollWidth: document.documentElement.scrollWidth,
                                            scrollHeight: document.documentElement.scrollHeight
                                          });

                                          // 画面端に近い場合の調整
                                          setTimeout(() => {
                                            const buttonRect = buttonElement.getBoundingClientRect();
                                            const viewportWidth = window.innerWidth;
                                            const viewportHeight = window.innerHeight;

                                            // 右端からはみ出す場合
                                            if (buttonRect.right > viewportWidth) {
                                              const newLeft = viewportWidth - buttonRect.width - 10;
                                              buttonElement.style.left = `${newLeft + scrollX}px`;
                                            }

                                            // 下端からはみ出す場合
                                            if (buttonRect.bottom > viewportHeight) {
                                              const newTop = viewportHeight - buttonRect.height - 10;
                                              buttonElement.style.top = `${newTop + scrollY}px`;
                                            }
                                          }, 0);
                                          // 募集開始ボタンのクリックイベントを設定
                                          const buttons = buttonElement.querySelectorAll('button');
                                          if (buttons.length > 0) {
                                            // 最初のボタン（募集開始）
                                            buttons[0].onclick = (e) => {
                                              e.stopPropagation();
                                              // containerごと削除
                                              if (container.parentNode) {
                                                container.parentNode.removeChild(container);
                                              }
                                              // DatabaseShiftに変換
                                              const convertedShift: DatabaseShift = {
                                                id: shift.id,
                                                user_id: shift.userId,
                                                store_id: shift.storeId,
                                                time_slot_id: shift.timeSlotId,
                                                date: shift.date,
                                                status: shift.status,
                                                created_at: new Date().toISOString(),
                                                updated_at: new Date().toISOString()
                                              };
                                              setEmergencyModal({ show: true, shift: convertedShift });
                                            };
                                            
                                            // 2番目のボタン（削除、店長のみ）
                                            if (buttons.length > 1 && isManager) {
                                              buttons[1].onclick = (e) => {
                                                e.stopPropagation();
                                                // containerごと削除
                                                if (container.parentNode) {
                                                  container.parentNode.removeChild(container);
                                                }
                                                if (window.confirm(`${user.name}さんのシフトを削除しますか？`)) {
                                                  handleDeleteShift(shift.id, shift, shift.date);
                                                }
                                              };
                                            }
                                          }
                                          console.log('🎯 DOMにボタンを追加');
                                          // ボタンをコンテナに追加
                                          container.appendChild(buttonElement);
                                          // コンテナをbodyに追加
                                          document.body.appendChild(container);
                                          console.log('🎯 ボタンがDOMに追加されました:', {
                                            buttonInDOM: document.body.contains(buttonElement),
                                            buttonRect: buttonElement.getBoundingClientRect(),
                                            buttonVisible: buttonElement.offsetParent !== null,
                                            buttonStyles: window.getComputedStyle(buttonElement)
                                          });

                                          // クリックイベントのリスナーを追加して、ボタン以外をクリックしたら削除
                                          const handleClickOutside = (event: MouseEvent) => {
                                            if (!buttonElement.contains(event.target as Node)) {
                                              if (container.parentNode) {
                                                container.parentNode.removeChild(container);
                                              }
                                              document.removeEventListener('click', handleClickOutside);
                                            }
                                          };
                                          setTimeout(() => {
                                            document.addEventListener('click', handleClickOutside);
                                          }, 0);
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
                                          <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1">
                                              <div className="flex flex-wrap items-center gap-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-1 shrink-0">
                                                  {isFixedShift && (
                                                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-xs">
                                                      📌 固定
                                                    </span>
                                                  )}
                                                  {!isFixedShift && isConfirmed && (
                                                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">
                                                      ✅ 確定
                                                    </span>
                                                  )}
                                                  {!isFixedShift && shift.status === 'draft' && (
                                                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs">
                                                      📝 下書き
                                                    </span>
                                                  )}
                                                                                                  {!isFixedShift && hasCustomTime && (
                                                  <span className="shrink-0 inline-flex items-center text-purple-800 text-xs">
                                                    ⏰
                                                  </span>
                                                )}
                                                </div>
                                                <div className="flex items-center gap-1 min-w-0 flex-1">
                                                  <span className="font-medium truncate">{user.name}</span>
                                                  {isEmergencyRequested && (
                                                    <span className="shrink-0 text-red-600 font-bold text-xs">🆘</span>
                                                  )}
                                                </div>
                                              </div>
                                              {/* 削除ボタン - 下書きシフトのみ表示（確定シフトと固定シフトはクリックで削除可能） */}
                                              {!isConfirmed && !isEmergencyRequested && !isFixedShift && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteShift(shift.id, shift, shift.date);
                                                  }}
                                                  className="shrink-0 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold opacity-70 group-hover:opacity-100 transition-all"
                                                  title="削除"
                                                >
                                                  ×
                                                </button>
                                              )}
                                            </div>
                                            <div className="text-xs text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                                              {displayTime}
                                            </div>
                                          </div>
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

                            {/* スタッフ追加ボタン（閲覧モードでは非表示、シフトがない場合のみ「シフトなし」を表示） */}
                            {readOnly ? (
                              dayShifts && dayShifts.length === 0 ? (
                                <div className="flex items-center justify-center p-1.5 sm:p-2 lg:p-1.5 text-gray-400 text-xs lg:text-xs">
                                  シフトなし
                                </div>
                              ) : null
                            ) : (
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
                            )}
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