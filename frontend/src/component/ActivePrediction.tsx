// frontend/src/component/ActivePrediction.tsx
import React from "react";

type Prediction = {
  category: string;
  market: string;
  stance: string;
  status: string;
  timeRemaining: string;
  reward: string;
};

const predictions: Prediction[] = [
  {
    category: "Crypto",
    market: "BTC above $95,000 by Friday",
    stance: "Yes",
    status: "Live",
    timeRemaining: "Ends in 19h",
    reward: "92 XLM",
  },
  {
    category: "Finance",
    market: "S&P 500 above 4500 by Friday",
    stance: "No",
    status: "Live",
    timeRemaining: "Ends in 12h",
    reward: "50 XLM",
  },
];

const ActivePrediction: React.FC = () => {
  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Active Predictions</h2>
        <a href="/predictions" className="text-blue-600 hover:underline">
          View All Predictions &gt;
        </a>
      </div>

      {/* Predictions List */}
      <div className="flex gap-4 overflow-x-auto">
        {predictions.map((p, idx) => (
          <div
            key={idx}
            className="min-w-[250px] bg-gray-50 rounded-lg p-4 flex flex-col gap-2 shadow-sm"
          >
            <span className="text-xs font-medium text-gray-500">
              {p.category}
            </span>
            <h3 className="font-bold text-md">{p.market}</h3>
            <span className="text-sm">Prediction: {p.stance}</span>

            {/* Status & Time */}
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span>{p.status}</span>
              <span className="ml-auto text-gray-500">{p.timeRemaining}</span>
            </div>

            {/* Footer Reward */}
            <div className="mt-2 font-semibold text-right text-blue-600">
              Potential Reward → {p.reward}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActivePrediction;
