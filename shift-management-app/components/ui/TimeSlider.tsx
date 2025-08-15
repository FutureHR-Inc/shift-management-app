import React, { useState, useEffect, useCallback } from 'react';

interface TimeSliderProps {
  value: string; // "HH:MM" format
  onChange: (time: string) => void;
  label: string;
  disabled?: boolean;
}

export function TimeSlider({ value, onChange, label, disabled = false }: TimeSliderProps) {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);

  // valueから時間と分を抽出
  useEffect(() => {
    if (value && value.includes(':')) {
      const [h, m] = value.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        setHours(h);
        setMinutes(m);
      }
    }
  }, [value]);

  // 時間や分が変更されたときにonChangeを呼ぶ（useCallbackで安定化）
  const updateTime = useCallback((newHours: number, newMinutes: number) => {
    const timeString = `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
    onChange(timeString);
  }, [onChange]);

  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHours = Number(e.target.value);
    setHours(newHours);
    updateTime(newHours, minutes);
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMinutes = Number(e.target.value);
    setMinutes(newMinutes);
    updateTime(hours, newMinutes);
  };

  return (
    <>
      <style jsx>{`
        .time-slider-hours::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: ${disabled ? '#9CA3AF' : '#3B82F6'};
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          border: 2px solid #fff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .time-slider-hours::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: ${disabled ? '#9CA3AF' : '#3B82F6'};
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          border: 2px solid #fff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .time-slider-minutes::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: ${disabled ? '#9CA3AF' : '#10B981'};
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          border: 2px solid #fff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .time-slider-minutes::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: ${disabled ? '#9CA3AF' : '#10B981'};
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          border: 2px solid #fff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .time-slider-hours:hover::-webkit-slider-thumb {
          background: ${disabled ? '#9CA3AF' : '#2563EB'};
        }

        .time-slider-minutes:hover::-webkit-slider-thumb {
          background: ${disabled ? '#9CA3AF' : '#059669'};
        }
      `}</style>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {label} *
        </label>
        
        {/* 時間表示 */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-2xl font-mono font-semibold text-gray-900">
              {hours.toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* 時間スライダー */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">時間</span>
              <span className="text-sm font-medium text-gray-900">{hours}時</span>
            </div>
            <div className="relative">
              <input
                type="range"
                min="0"
                max="23"
                step="1"
                value={hours}
                onChange={handleHoursChange}
                disabled={disabled}
                className={`time-slider-hours w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none ${
                  disabled ? 'bg-gray-300' : 'bg-gray-200'
                }`}
                style={{
                  background: disabled 
                    ? '#D1D5DB' 
                    : `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${(hours / 23) * 100}%, #E5E7EB ${(hours / 23) * 100}%, #E5E7EB 100%)`
                }}
              />
              {/* 時間の目盛り表示 */}
              <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                <span>0</span>
                <span>6</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
              </div>
            </div>
          </div>

          {/* 分スライダー */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">分</span>
              <span className="text-sm font-medium text-gray-900">{minutes}分</span>
            </div>
            <div className="relative">
              <input
                type="range"
                min="0"
                max="59"
                step="1"
                value={minutes}
                onChange={handleMinutesChange}
                disabled={disabled}
                className={`time-slider-minutes w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none ${
                  disabled ? 'bg-gray-300' : 'bg-gray-200'
                }`}
                style={{
                  background: disabled 
                    ? '#D1D5DB' 
                    : `linear-gradient(to right, #10B981 0%, #10B981 ${(minutes / 59) * 100}%, #E5E7EB ${(minutes / 59) * 100}%, #E5E7EB 100%)`
                }}
              />
              {/* 分の目盛り表示 */}
              <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                <span>0</span>
                <span>15</span>
                <span>30</span>
                <span>45</span>
                <span>59</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 