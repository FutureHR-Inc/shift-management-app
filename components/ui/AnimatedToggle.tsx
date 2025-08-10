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
      <div className="flex-1 mr-4">
        <h4 className="font-medium text-gray-900 text-sm sm:text-base">{label}</h4>
        {description && (
          <p className="text-xs sm:text-sm text-gray-500 mt-1">{description}</p>
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
            relative w-11 h-6 rounded-full transition-all duration-200 ease-in-out
            ${disabled 
              ? 'bg-gray-300 cursor-not-allowed' 
              : checked 
                ? 'bg-blue-600' 
                : 'bg-gray-200'
            }
          `}
        >
          <div 
            className={`
              absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full 
              shadow-sm transition-all duration-200 ease-in-out transform
              ${checked ? 'translate-x-5' : 'translate-x-0'}
              ${!disabled && 'shadow-md'}
            `}
          />
        </div>
        <span className={`ml-3 text-sm font-medium ${
          disabled 
            ? 'text-gray-400' 
            : checked 
              ? 'text-blue-700' 
              : 'text-gray-600'
        }`}>
          {checked ? 'ON' : 'OFF'}
        </span>
      </label>
    </div>
  );
} 