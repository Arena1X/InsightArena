import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost';
  isLoading?: boolean;
}

const Button = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled, 
  ...props 
}: ButtonProps) => {
  
  // Base styles that all buttons share
  const baseStyles = "inline-flex items-center justify-center font-bold transition-all duration-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed";
  
  // Variant styles based on task requirements
  const variants = {
    primary: "bg-[#f97316] text-white hover:bg-[#ea580c] px-6 py-3", // Orange
    secondary: "bg-teal-600 text-white hover:bg-teal-700 px-6 py-3", // Teal
    tertiary: "border-2 border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10 px-6 py-3",
    ghost: "bg-transparent" // Important: This prevents "spoiling" existing designs
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-5 w-5 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;