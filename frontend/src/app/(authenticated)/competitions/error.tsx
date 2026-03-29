"use client";

import { RouteErrorState } from "@/component/route-error-state";

type CompetitionsErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function CompetitionsErrorPage({
  error,
  reset,
}: CompetitionsErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Competitions"
      description="Your competitions view ran into a problem. Retry to reload the latest competition data."
      fullScreen={false}
    />
  );
}
