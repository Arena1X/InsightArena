const raw = process.env.NEXT_PUBLIC_API_URL;

if (!raw) {
  const msg =
    "Set NEXT_PUBLIC_API_URL in frontend/.env.local — see .env.example";
  if (process.env.NODE_ENV === "development") {
    throw new Error(msg);
  } else {
    console.error(`[env] ${msg}`);
  }
}

export const env = {
  API_URL: (raw ?? "").replace(/\/+$/, ""),
  STELLAR_EXPLORER_URL:
    process.env.NEXT_PUBLIC_STELLAR_EXPLORER_URL ?? "https://stellar.expert/explorer",
  STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet",
};

export function getStellarExplorerUrl(
  contractId: string,
  network?: string,
): string {
  const net = network ?? env.STELLAR_NETWORK;
  const baseUrl = env.STELLAR_EXPLORER_URL.replace(/\/+$/, "");
  return `${baseUrl}/${net}/contract/${contractId}`;
}

