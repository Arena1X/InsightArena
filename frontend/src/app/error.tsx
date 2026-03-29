"use client";

import { RouteErrorState } from "@/component/route-error-state";

type RootErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RootErrorPage({
  error,
  reset,
}: RootErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="InsightArena"
      description="We couldn't load the experience right now. Please retry, or head back home while we reset things behind the scenes."
    />
  );
}
