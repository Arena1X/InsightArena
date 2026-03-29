"use client";

import { RouteErrorState } from "@/component/route-error-state";

type SettingsErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function SettingsErrorPage({
  error,
  reset,
}: SettingsErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Settings"
      description="Your settings page ran into an unexpected issue. Retry to continue managing your preferences."
      fullScreen={false}
    />
  );
}
