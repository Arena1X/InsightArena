"use client";

import { RouteErrorState } from "@/component/route-error-state";

type ExternalToolsErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ExternalToolsErrorPage({
  error,
  reset,
}: ExternalToolsErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="External Tools"
      description="Something interrupted the external tools page. Please retry to load the latest integrations."
    />
  );
}
