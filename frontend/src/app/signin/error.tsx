"use client";

import { RouteErrorState } from "@/component/route-error-state";

type SignInErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function SignInErrorPage({
  error,
  reset,
}: SignInErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Sign In"
      description="We couldn't finish loading the sign-in page. Retry to continue accessing your account."
    />
  );
}
