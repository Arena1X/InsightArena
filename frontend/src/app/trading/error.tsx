"use client";

import { RouteErrorState } from "@/component/route-error-state";

type TradingErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function TradingErrorPage({
  error,
  reset,
}: TradingErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Trading"
      description="Trading data couldn't be loaded. Please retry to refresh the market view."
    />
  );
}
