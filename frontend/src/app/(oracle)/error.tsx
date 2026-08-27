"use client";

import { RouteErrorState } from "@/component/route-error-state";

type OracleErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function OracleErrorPage({
  error,
  reset,
}: OracleErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Oracle"
      description="The oracle workspace ran into a problem. Retry to reload this section."
      fullScreen={false}
    />
  );
}
