"use client";

import { RouteErrorState } from "@/component/route-error-state";

type AdminErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminErrorPage({
  error,
  reset,
}: AdminErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Admin"
      description="The admin section couldn't finish loading. Retry to restore this view."
      fullScreen={false}
    />
  );
}
