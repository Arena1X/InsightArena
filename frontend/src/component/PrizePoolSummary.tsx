type RewardBreakdownItem = {
  label: string;
  amountXlm: number;
  percentage?: number;
};

type PrizePoolSummaryProps = {
  prizePoolXlm: number;
  rewardBreakdown: RewardBreakdownItem[];
};

function formatXlm(amount: number) {
  return `${amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} XLM`;
}

export default function PrizePoolSummary({
  prizePoolXlm,
  rewardBreakdown,
}: PrizePoolSummaryProps) {
  return (
    <section className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-200/80">
            Prize Pool
          </p>
          <p className="mt-1 text-2xl font-bold text-white">
            {formatXlm(prizePoolXlm)}
          </p>
        </div>
        <div className="rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-xs font-semibold text-orange-100">
          XLM Rewards
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {rewardBreakdown.length > 0 ? (
          rewardBreakdown.map((reward) => (
            <div
              key={reward.label}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm"
            >
              <span className="text-gray-300">
                {reward.label}
                {typeof reward.percentage === "number" ? (
                  <span className="text-gray-500"> · {reward.percentage}%</span>
                ) : null}
              </span>
              <span className="font-semibold text-white">
                {formatXlm(reward.amountXlm)}
              </span>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm text-gray-400">
            Reward distribution will be available after prizes are configured.
          </p>
        )}
      </div>
    </section>
  );
}
