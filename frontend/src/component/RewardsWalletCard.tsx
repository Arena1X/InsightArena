import { Wallet } from "lucide-react";

export default function RewardsWalletCard() {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/5 p-5 w-full shadow-lg overflow-hidden">
      {/* TOP GOLD EDGE */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-yellow-500/60 rounded-t-2xl" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">Rewards Wallet</h2>
        <Wallet className="h-5 w-5 text-yellow-400" />
      </div>

      {/* Total Earned */}
      <div className="mt-5 text-center">
        <p className="text-gray-400 text-xs tracking-wide">TOTAL EARNED</p>

        <div className="flex items-center justify-center gap-2 mt-1 text-2xl font-bold text-yellow-400">
          <span>⭐</span>
          <span>$1,240</span>
          <span>⭐</span>
        </div>
      </div>

      {/* Line Items */}
      <div className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between text-gray-300">
          <span>Claimable Rewards</span>
          <span className="text-orange-400">$150</span>
        </div>

        <div className="flex justify-between text-gray-300">
          <span>Pending Payouts</span>
          <span>$95</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-300">Wallet Balance</span>
          <span className="text-orange-400 font-medium">420 XLM</span>
        </div>
      </div>

      {/* Button */}
      <button className="mt-6 w-full py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition">
        Claim Rewards
      </button>
    </div>
  );
}
