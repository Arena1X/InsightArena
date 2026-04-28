# Frontend Contributing Guide

## Prerequisites and Getting Started

- Node.js 20+
- pnpm 9
- Clone the repository and navigate to the frontend directory

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local to set NEXT_PUBLIC_API_URL=http://localhost:3000
pnpm dev
```

The development server will start at http://localhost:3001.

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| NEXT_PUBLIC_API_URL | Backend API base URL | Yes | http://localhost:3000 |

## Project Structure

```
frontend/src/
├── app/                    # Next.js App Router pages
│   ├── (authenticated)/    # Pages requiring wallet connection — wrapped in DashboardShell
│   └── (public routes)/    # Pages accessible without auth — use PageBackground
├── component/              # Reusable UI components
├── hooks/                  # Custom React hooks (useWalletConnection, useAuth)
├── context/                # React context providers (WalletContext)
└── types/                  # TypeScript type definitions
```

## Key Conventions

### Page Background Rule

Public pages (/, /markets, /leaderboard, /events, /about, etc.) MUST use `PageBackground` from `@/component/PageBackground` as the root wrapper.

Authenticated pages inside `/(authenticated)/` use `DashboardShell` via the layout — do NOT add extra backgrounds.

Never use `bg-black`, `bg-[#0a0a0a]`, `bg-[#141824]`, or any other custom background on a public page.

**Correct usage:**
```tsx
// pages/about/page.tsx
import PageBackground from "@/component/PageBackground";

export default function AboutPage() {
  return (
    <PageBackground>
      <div className="container mx-auto px-4 py-8">
        {/* page content */}
      </div>
    </PageBackground>
  );
}
```

**Incorrect usage:**
```tsx
// WRONG: custom background on public page
export default function AboutPage() {
  return (
    <div className="bg-[#141824] min-h-screen">
      {/* content */}
    </div>
  );
}
```

### Auth State

Always use `useWallet()` from `@/context/WalletContext` to read auth state.

Never read `localStorage` directly — use the hook.

Never hardcode wallet addresses or usernames.

### Styling

Tailwind CSS only — no new UI libraries.

Color palette (use these exact values):
- Primary teal: #4FD1C5 / text-[#4FD1C5]
- Orange accent: orange-500 / bg-orange-500
- Dark gradient bg: bg-gradient-to-br from-gray-900 via-black to-gray-900
- Card background: bg-[#111726]
- Secondary card: bg-[#0f172a]
- Border: border-white/10
- Body text: text-[#94a3b8]
- Heading text: text-white
- Additional colors: #141824, #1a1f2e, #d8dee9, #F5C451, #475569, #3dbbb0, #38b2ac, #cd7c3a, #9ca3af

### Placeholder Data

All static placeholder data must be defined as a `const` array at the top of the file.

Mark it with a comment: `// TODO: replace with real API data`

Never inline placeholder data inside JSX.

### TypeScript

Strict mode is enabled — no `any` types.

All component props must have an explicit interface or type.

Use `ReactNode` for children props.

## Running CI Locally

```bash
pnpm lint        # ESLint
pnpm build       # Next.js production build (catches type errors)
pnpm type-check  # tsc --noEmit (if script exists)
```

## Pull Request Checklist

- [ ] `pnpm build` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] New public pages use `PageBackground` wrapper
- [ ] New authenticated pages do NOT add `DashboardShell` (handled by layout)
- [ ] No hardcoded wallet addresses or usernames
- [ ] All placeholder data is a `const` at the top of the file marked with `// TODO`
- [ ] Page is responsive at 375px (mobile), 768px (tablet), 1280px (desktop)
- [ ] No new npm/pnpm dependencies added without discussion