import React from 'react';
import { Loader2 } from 'lucide-react'; 

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean; // Add this line!
}

const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size = 'md', 
  isLoading = false, 
  className = '', 
  children, 
  ...props 
}) => {
  
  const baseStyles = "inline-flex items-center justify-center font-semibold transition-all duration-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-[#f97316] text-white hover:bg-[#ea580c] focus:ring-orange-500", // Orange
    secondary: "bg-[#4FD1C5] text-black hover:bg-[#38b2ac] focus:ring-teal-400", // Teal
    ghost: "border border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white focus:ring-gray-500",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-8 py-3.5 text-base",
  };

  return (
    <button
      // This part prevents clicking while it's loading
      disabled={isLoading || props.disabled} 
      className={`flex items-center justify-center gap-2 transition-all ${variants[variant]} ${sizes[size]} ${className} ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
      {...props}
    >
      {/* If isLoading is true, show the spinning circle */}
      {isLoading && (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      
      {/* This is your button text */}
      {children}
    </button>
  );
};

export default Button;