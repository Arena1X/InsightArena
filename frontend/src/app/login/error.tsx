"use client";

import { RouteErrorState } from "@/component/route-error-state";

type LoginErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function LoginErrorPage({
  error,
  reset,
}: LoginErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Login"
      description="The login flow hit an unexpected error. Retry to continue signing in securely."
    />
  );
}
