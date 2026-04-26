# Frontend Components Documentation

This document describes all components in `frontend/src/component/` and subdirectories.

## PageBackground

**File path:** `frontend/src/component/PageBackground.tsx`

**Description:** Wraps public pages with the standard gradient background and SVG network lines. Provides consistent visual foundation for non-authenticated pages.

**Props interface:**
```typescript
type PageBackgroundProps = {
  children?: ReactNode;
};
```

**Minimal usage example:**
```tsx
<PageBackground>
  <div>Page content</div>
</PageBackground>
```

**Which pages currently use it:** Used in multiple public pages like about, docs, events, contact, Faq.

## Header

**File path:** `frontend/src/component/Header.tsx`

**Description:** Fixed top navigation bar with logo, nav links, and Connect Wallet button. Handles mobile menu and wallet connection state.

**Props interface:** No props

**Minimal usage example:**
```tsx
<Header />
```

**Which pages currently use it:** Used in layout, appears on all pages.

## Footer

**File path:** `frontend/src/component/Footer.tsx`

**Description:** Site footer with 4 link columns (Platform, Resources, Company, Community). Provides navigation to various sections of the site.

**Props interface:** No props

**Minimal usage example:**
```tsx
<Footer />
```

**Which pages currently use it:** Used in layout, appears on all pages.

## DashboardShell

**File path:** `frontend/src/component/dashboard-shell.tsx`

**Description:** Authenticated app shell providing sidebar, top navigation, and layout for all /(authenticated)/ pages. Manages mobile responsiveness and navigation state.

**Props interface:**
```typescript
type DashboardShellProps = {
  children: ReactNode;
};
```

**Minimal usage example:**
```tsx
<DashboardShell>
  <div>Dashboard content</div>
</DashboardShell>
```

**Which pages currently use it:** Used in authenticated layout for dashboard, markets, etc.

## ConnectWalletModal

**File path:** `frontend/src/component/ConnectWalletModal.tsx`

**Description:** Modal for wallet connection flow with 5 states (idle, connecting, signing, success, error). Supports Freighter wallet integration.

**Props interface:**
```typescript
interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (address: string, token: string) => void;
}
```

**Minimal usage example:**
```tsx
<ConnectWalletModal
  isOpen={true}
  onClose={() => {}}
  onSuccess={(address, token) => {}}
/>
```

**Which pages currently use it:** Used via WalletContext, appears when connecting wallet.

## LeaderboardTable

**File path:** `frontend/src/component/leaderboard/LeaderboardTable.tsx`

**Description:** Sortable table displaying leaderboard entries with rank, username, points, win rate. Supports custom entry data.

**Props interface:**
```typescript
interface LeaderboardTableProps {
  entries?: LeaderboardEntry[];
}
```

**Minimal usage example:**
```tsx
<LeaderboardTable entries={customEntries} />
```

**Which pages currently use it:** Used in leaderboard page.

## LeaderboardFilters

**File path:** `frontend/src/component/leaderboard/LeaderboardFilters.tsx`

**Description:** Filter controls for leaderboard with time range, category, and sort options. Manages filter state and callbacks.

**Props interface:**
```typescript
interface LeaderboardFiltersProps {
  onChange?: (filters: LeaderboardFiltersState) => void;
}
```

**Minimal usage example:**
```tsx
<LeaderboardFilters onChange={(filters) => console.log(filters)} />
```

**Which pages currently use it:** Used in leaderboard page.

## LeaderboardOverview

**File path:** `frontend/src/component/leaderboard/LeaderboardOverview.tsx`

**Description:** 4-card stats overview row for the leaderboard page. Displays key metrics with icons and supporting text.

**Props interface:**
```typescript
interface LeaderboardOverviewProps {
  stats?: StatCardProps[];
}
```

**Minimal usage example:**
```tsx
<LeaderboardOverview stats={customStats} />
```

**Which pages currently use it:** Used in leaderboard page.

## NotificationsCard

**File path:** `frontend/src/component/NotificationsCard.tsx`

**Description:** Notifications panel shown in the dashboard right sidebar. Displays market, competition, reward, and social notifications with read/unread states.

**Props interface:** No props

**Minimal usage example:**
```tsx
<NotificationsCard />
```

**Which pages currently use it:** Used in dashboard shell sidebar.

## RewardsWalletCard

**File path:** `frontend/src/component/RewardsWalletCard.tsx`

**Description:** Rewards and wallet balance card shown in dashboard right sidebar. Shows total earned, claimable rewards, pending payouts, and wallet balance.

**Props interface:** No props

**Minimal usage example:**
```tsx
<RewardsWalletCard />
```

**Which pages currently use it:** Used in dashboard shell sidebar.

## StatCard

**File path:** `frontend/src/component/rewards/StatCard.tsx`

**Description:** Generic reusable stat display card with label, value, supporting text, and icon. Used for displaying various metrics.

**Props interface:**
```typescript
export interface StatCardProps {
  label: string;
  value: string;
  supportingText?: string;
  icon?: ReactNode;
  valueColor?: string;
}
```

**Minimal usage example:**
```tsx
<StatCard
  label="Total Users"
  value="1,234"
  supportingText="Active this month"
  icon={<UsersIcon />}
  valueColor="text-[#4FD1C5]"
/>
```

**Which pages currently use it:** Used in leaderboard overview and other stat displays.

## Additional Components

### ActivePrediction.tsx
Displays active predictions in a horizontal scrollable list.

### Button.tsx
Customizable button with variants and loading state.

### CommunityCard.tsx
Card for community courses with author info and ratings.

### CompetitionsJoined.tsx
Grid of joined competitions with progress and prizes.

### CourseCard.tsx
Card for displaying course information.

### ui/button.tsx
Reusable button component with styling variants.

### Homepage Components
- Antigravity.tsx: Homepage section with animations
- ComparisonSection.tsx: Platform comparison section
- Cta.tsx: Call-to-action section
- Faq.tsx: FAQ section
- Feature.tsx: Feature showcase
- FeaturedThisWeek.tsx: Weekly featured content
- HeroSection.tsx: Main hero section

### Other Components
- app-not-found.tsx: 404 error page
- courseModal.tsx: Course modal dialog
- coursenav.tsx: Course navigation
- events/ (directory): Event-related components
- loading-route-skeletons.tsx: Loading skeletons
- resourceModal.tsx: Resource modal
- resources/ (directory): Resource components
- rewards/ (directory): Reward-related components
- route-error-state.tsx: Error state component
- trading/ (directory): Trading components