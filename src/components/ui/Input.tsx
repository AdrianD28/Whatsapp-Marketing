import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ElementType;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ 
    label,
    error,
    icon: Icon,
    helperText,
    className = '',
    ...props
  }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="block text-sm font-medium text-gray-200">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon className="h-5 w-5 text-gray-400" />
            </div>
          )}
          <input
            ref={ref}
            className={`
              block w-full rounded-lg border-gray-600 bg-gray-700 text-white placeholder-gray-400
              focus:border-green-500 focus:ring-green-500 transition-colors duration-200
              ${Icon ? 'pl-10' : 'pl-3'} pr-3 py-2.5
              ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-sm text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';