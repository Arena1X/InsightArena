export const NAV_LINKS = [
  { name: "Home", link: "/" },
  { name: "Markets", link: "/markets" },
  { name: "Events", link: "/events" },
  { name: "Leaderboard", link: "/leaderboard" },
  { name: "Docs", link: "/docs" },
];

export type NavLinkItem = (typeof NAV_LINKS)[number];

export function isActivePath(pathname: string, path: string) {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export const truncateAddress = (walletAddress: string) =>
  `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

export const truncateAddressForDropdown = (walletAddress: string) =>
  walletAddress.length <= 16
    ? walletAddress
    : `${walletAddress.slice(0, 12)}...${walletAddress.slice(-4)}`;
