"use client";

import { RouteErrorState } from "@/component/route-error-state";

type FaqErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function FaqErrorPage({
  error,
  reset,
}: FaqErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="FAQ"
      description="We couldn't open the FAQ right now. Retry to reload the answers and support resources."
    />
  );
}
