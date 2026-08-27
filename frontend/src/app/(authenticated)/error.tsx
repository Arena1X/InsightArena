"use client";

import { RouteErrorState } from "@/component/route-error-state";

type AuthenticatedErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AuthenticatedErrorPage({
  error,
  reset,
}: AuthenticatedErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Your account"
      description="This section couldn't finish loading. Retry to restore it without leaving your account."
      fullScreen={false}
    />
  );
}
