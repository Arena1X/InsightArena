"use client";

import type { ReactNode } from "react";

type PageBackgroundProps = {
  children?: ReactNode;
};

export default function PageBackground({ children }: PageBackgroundProps) {
  return (
    <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900" />
      <svg
        className="absolute inset-0 w-full h-full opacity-15"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient
            id="pageBackgroundGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path
          d="M100,200 Q300,100 500,200 T900,200"
          stroke="url(#pageBackgroundGradient)"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M200,400 Q400,300 600,400 T1000,400"
          stroke="url(#pageBackgroundGradient)"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M50,600 Q250,500 450,600 T850,600"
          stroke="url(#pageBackgroundGradient)"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M150,800 Q350,700 550,800 T950,800"
          stroke="url(#pageBackgroundGradient)"
          strokeWidth="2"
          fill="none"
        />
      </svg>
      {children}
    </div>
  );
}
