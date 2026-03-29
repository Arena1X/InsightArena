"use client";

import { RouteErrorState } from "@/component/route-error-state";

type CompetitionsDemoErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function CompetitionsDemoErrorPage({
  error,
  reset,
}: CompetitionsDemoErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Competitions Demo"
      description="The competitions demo ran into an unexpected issue. Retry to fetch the latest demo state."
    />
  );
}
