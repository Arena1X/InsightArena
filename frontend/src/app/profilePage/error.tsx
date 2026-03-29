"use client";

import { RouteErrorState } from "@/component/route-error-state";

type ProfilePageErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ProfilePageErrorPage({
  error,
  reset,
}: ProfilePageErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Profile Page"
      description="Your profile page couldn't be loaded. Retry to restore your profile details."
    />
  );
}
