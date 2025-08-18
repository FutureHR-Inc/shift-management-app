import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth = false, ...props }, ref) => {
    return (
      <button
        className={cn(
          // ベーススタイル - Apple HIGの原則に基づく
          'relative inline-flex items-center justify-center font-medium transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'rounded-xl', // iOS風の角丸
          
          // バリアント
          {
            'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 shadow-lg hover:shadow-xl': 
              variant === 'primary',
            'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 border border-gray-200': 
              variant === 'secondary',
            'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 shadow-lg hover:shadow-xl': 
              variant === 'destructive',
            'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200': 
              variant === 'ghost',
            'bg-white text-gray-900 hover:bg-gray-50 active:bg-gray-100 border border-gray-300 hover:border-gray-400': 
              variant === 'outline',
          },
          
          // サイズ
          {
            'px-3 py-2 text-sm h-9': size === 'sm',
            'px-4 py-2.5 text-base h-11': size === 'md',
            'px-6 py-3 text-lg h-12': size === 'lg',
          },
          
          // 幅
          {
            'w-full': fullWidth,
          },
          
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button }; 