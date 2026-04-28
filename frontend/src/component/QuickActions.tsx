import React from "react";
// These icons are common in React projects.
// If they aren't installed, we can switch to simple emojis for now!
import { Zap, UserPlus, Gift, Trophy } from "lucide-react";

const QuickActions = () => {
  // We put data in an array so the code is easy to read/update
  const actions = [
    {
      label: "Make Prediction",
      icon: <Zap size={32} />,
      color: "bg-orange-500",
    },
    {
      label: "Join With Invite Code",
      icon: <UserPlus size={32} />,
      color: "bg-[#6366F1]",
    },
    { label: "Claim Rewards", icon: <Gift size={32} />, color: "bg-[#EAB308]" },
    {
      label: "View Leaderboard",
      icon: <Trophy size={32} />,
      color: "bg-orange-500",
    },
  ];

  return (
    <section className="mt-10 mb-6 px-4">
      {/* Requirement: Centered Header */}
      <h2 className="text-center text-white text-xl font-bold mb-6">
        Quick Actions
      </h2>

      {/* Requirement: Responsive Grid. 2 columns on mobile, 4 on tablet/desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {actions.map((item, index) => (
          <button
            key={index}
            className={`${item.color} aspect-square rounded-2xl flex flex-col items-center justify-center p-4 shadow-lg hover:scale-105 transition-transform`}
          >
            {/* Centering the icon above the text */}
            <div className="text-white mb-2">{item.icon}</div>
            <span className="text-white text-sm font-semibold text-center leading-tight">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
