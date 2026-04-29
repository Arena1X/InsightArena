import React from "react";
// These icons are common in React projects.
// If they aren't installed, we can switch to simple emojis for now!
import { Zap, UserPlus, Gift, Trophy } from "lucide-react";

const QuickActions = () => {
  const actions = [
    {
      label: "Make Prediction",
      icon: <Zap size={28} />,
      bg: "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/15",
      text: "text-orange-400",
    },
    {
      label: "Join With Invite Code",
      icon: <UserPlus size={28} />,
      bg: "bg-white/5 border-white/10 hover:bg-white/10",
      text: "text-gray-300",
    },
    {
      label: "Claim Rewards",
      icon: <Gift size={28} />,
      bg: "bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/15",
      text: "text-yellow-400",
    },
    {
      label: "View Leaderboard",
      icon: <Trophy size={28} />,
      bg: "bg-white/5 border-white/10 hover:bg-white/10",
      text: "text-gray-300",
    },
  ];

  return (
    <section className="mt-10 mb-6 px-4">
      <h2 className="text-center text-white text-xl font-bold mb-6">
        Quick Actions
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {actions.map((item, index) => (
          <button
            key={index}
            className={`${item.bg} aspect-square rounded-2xl border flex flex-col items-center justify-center p-4 transition-colors`}
          >
            <div className={`${item.text} mb-2`}>{item.icon}</div>
            <span
              className={`${item.text} text-sm font-medium text-center leading-tight`}
            >
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
