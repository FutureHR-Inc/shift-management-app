import React from 'react';

interface AnimatedToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function AnimatedToggle({ 
  checked, 
  onChange, 
  label, 
  description, 
  disabled = false 
}: AnimatedToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h4 className="font-medium text-gray-900">{label}</h4>
        {description && (
          <p className="text-sm text-gray-500">{description}</p>
        )}
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div 
          className={`
            relative w-11 h-6 rounded-full transition-all duration-300 ease-in-out transform
            ${disabled 
              ? 'bg-gray-300 cursor-not-allowed' 
              : checked 
                ? 'bg-blue-600 shadow-lg' 
                : 'bg-gray-200 hover:bg-gray-300'
            }
          `}
        >
          <div 
            className={`
              absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full 
              shadow-md transition-all duration-300 ease-in-out transform
              ${checked ? 'translate-x-5' : 'translate-x-0'}
              ${disabled ? 'shadow-sm' : 'shadow-md hover:shadow-lg'}
            `}
          >
            {/* 内側のインジケーター */}
            <div 
              className={`
                absolute inset-0 rounded-full transition-all duration-300 ease-in-out
                ${checked 
                  ? 'bg-gradient-to-r from-blue-100 to-blue-200' 
                  : 'bg-gradient-to-r from-gray-50 to-gray-100'
                }
              `}
            />
          </div>
          
          {/* アクティブ状態のグロー効果 */}
          {checked && !disabled && (
            <div className="absolute inset-0 rounded-full bg-blue-400 opacity-20 animate-pulse" />
          )}
        </div>
        <span className={`ml-3 text-sm font-medium transition-colors duration-200 ${
          disabled 
            ? 'text-gray-400' 
            : checked 
              ? 'text-blue-700' 
              : 'text-gray-700'
        }`}>
          {checked ? 'カスタム' : '標準'}
        </span>
      </label>
    </div>
  );
} 