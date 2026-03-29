"use client";

import { RouteErrorState } from "@/component/route-error-state";

type NotificationsDemoErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function NotificationsDemoErrorPage({
  error,
  reset,
}: NotificationsDemoErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Notifications Demo"
      description="Notifications couldn't be displayed right now. Retry to reload the latest updates."
    />
  );
}
