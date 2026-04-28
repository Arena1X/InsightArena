"use client";

import { RouteErrorState } from "@/component/route-error-state";

type RewardsErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RewardsErrorPage({
  error,
  reset,
}: RewardsErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Rewards"
      description="Rewards information couldn't be loaded. Retry to fetch your latest earnings and payouts."
      fullScreen={false}
    />
  );
}
