"use client";

import { RouteErrorState } from "@/component/route-error-state";

type MyPredictionsErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function MyPredictionsErrorPage({
  error,
  reset,
}: MyPredictionsErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="My Predictions"
      description="We couldn't load your predictions right now. Retry to restore your latest picks and results."
      fullScreen={false}
    />
  );
}
