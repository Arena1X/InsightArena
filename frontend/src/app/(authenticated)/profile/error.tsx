"use client";

import { RouteErrorState } from "@/component/route-error-state";

type ProfileErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ProfileErrorPage({
  error,
  reset,
}: ProfileErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Profile"
      description="Your profile settings couldn't be displayed. Retry to reload your account details."
      fullScreen={false}
    />
  );
}
