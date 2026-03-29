"use client";

import { RouteErrorState } from "@/component/route-error-state";

type WalletErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function WalletErrorPage({
  error,
  reset,
}: WalletErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Wallet"
      description="Wallet details couldn't be displayed. Retry to load your balances and transaction history."
      fullScreen={false}
    />
  );
}
