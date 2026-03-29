"use client";

import { RouteErrorState } from "@/component/route-error-state";

type EventsErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function EventsErrorPage({
  error,
  reset,
}: EventsErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Events"
      description="The events page couldn't finish loading. Retry to fetch the latest event details."
    />
  );
}
