import React, { useState, useEffect, useCallback } from 'react';

interface CompactTimeSliderProps {
  value: string; // "HH:MM" format
  onChange: (time: string) => void;
  label: string;
  disabled?: boolean;
  minTime?: string; // "HH:MM" format - 最小時間
  maxTime?: string; // "HH:MM" format - 最大時間
}

export function CompactTimeSlider({ 
  value, 
  onChange, 
  label, 
  disabled = false,
  minTime,
  maxTime 
}: CompactTimeSliderProps) {
  const [totalMinutes, setTotalMinutes] = useState(0);

  // 時間文字列を分に変換
  const timeToMinutes = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  // 最小・最大分数を計算
  const minMinutes = minTime ? timeToMinutes(minTime) : 0;
  const maxMinutes = maxTime ? timeToMinutes(maxTime) : 1439; // 23:59

  // valueから総分数を計算
  useEffect(() => {
    if (value && value.includes(':')) {
      const [h, m] = value.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const minutes = h * 60 + m;
        // 範囲内に制限
        const constrainedMinutes = Math.max(minMinutes, Math.min(maxMinutes, minutes));
        setTotalMinutes(constrainedMinutes);
      }
    }
  }, [value, minMinutes, maxMinutes]);

  // 総分数が変更されたときにonChangeを呼ぶ
  const updateTime = useCallback((minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const timeString = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    onChange(timeString);
  }, [onChange]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTotalMinutes = Number(e.target.value);
    setTotalMinutes(newTotalMinutes);
    updateTime(newTotalMinutes);
  };

  // 総分数から時:分の表示を計算
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        {label} *
      </label>
      
      {/* 時間表示 */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <span className="text-xl font-mono font-semibold text-gray-900">
            {formatTime(totalMinutes)}
          </span>
        </div>
      </div>

      {/* 統合スライダー */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">時刻調整</span>
          <span className="text-sm font-medium text-gray-900">
            {Math.floor(totalMinutes / 60)}時{totalMinutes % 60}分
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={minMinutes}
            max={maxMinutes}
            step="15"   // 15分単位
            value={totalMinutes}
            onChange={handleSliderChange}
            disabled={disabled}
            className={`time-slider w-full h-3 rounded-lg appearance-none cursor-pointer focus:outline-none ${
              disabled ? 'bg-gray-300' : 'bg-gray-200'
            }`}
            style={{
              background: disabled 
                ? '#D1D5DB' 
                : `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${((totalMinutes - minMinutes) / (maxMinutes - minMinutes)) * 100}%, #E5E7EB ${((totalMinutes - minMinutes) / (maxMinutes - minMinutes)) * 100}%, #E5E7EB 100%)`
            }}
          />
          {/* 時間の目盛り表示 */}
          <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
            {minTime && maxTime ? (
              <>
                <span>{formatTime(minMinutes)}</span>
                {maxMinutes - minMinutes > 720 && ( // 12時間以上の場合は中間点を表示
                  <span>{formatTime(Math.floor((minMinutes + maxMinutes) / 2))}</span>
                )}
                <span>{formatTime(maxMinutes)}</span>
              </>
            ) : (
              <>
                <span>0:00</span>
                <span>6:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:59</span>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .time-slider::-webkit-slider-thumb {
          appearance: none;
          height: 24px;
          width: 24px;
          border-radius: 50%;
          background: ${disabled ? '#9CA3AF' : '#3B82F6'};
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          border: 3px solid #fff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }

        .time-slider::-moz-range-thumb {
          height: 24px;
          width: 24px;
          border-radius: 50%;
          background: ${disabled ? '#9CA3AF' : '#3B82F6'};
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          border: 3px solid #fff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          border: none;
        }

        .time-slider:hover::-webkit-slider-thumb {
          background: ${disabled ? '#9CA3AF' : '#2563EB'};
          transform: scale(1.1);
        }

        .time-slider:hover::-moz-range-thumb {
          background: ${disabled ? '#9CA3AF' : '#2563EB'};
        }
      `}</style>
    </div>
  );
} 