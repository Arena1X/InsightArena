"use client";

import { RouteErrorState } from "@/component/route-error-state";

type LeaderboardsErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function LeaderboardsErrorPage({
  error,
  reset,
}: LeaderboardsErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Leaderboards"
      description="Leaderboards are temporarily unavailable. Retry to fetch the latest standings."
      fullScreen={false}
    />
  );
}
