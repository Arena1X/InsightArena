"use client";

import { RouteErrorState } from "@/component/route-error-state";

type MarketsErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function MarketsErrorPage({
  error,
  reset,
}: MarketsErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Markets"
      description="Market data didn't load correctly. Retry to refresh the latest market activity."
      fullScreen={false}
    />
  );
}
