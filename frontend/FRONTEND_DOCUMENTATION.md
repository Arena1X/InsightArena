# Frontend Documentation

## 📋 Project Overview

The InsightArena frontend is a modern web application built for a decentralized prediction market platform on the Stellar blockchain. It provides users with an intuitive interface to participate in prediction markets, compete in leaderboards, and manage their rewards.

### Purpose
- Enable users to create and participate in prediction markets
- Display real-time leaderboards and competition rankings
- Manage user profiles, wallets, and rewards
- Provide seamless blockchain integration with Stellar network

### Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.1.6 | React framework with App Router (SSR/SSG) |
| **React** | 19.2.4 | UI library |
| **TypeScript** | 5.x | Type-safe development |
| **Tailwind CSS** | 4.x | Utility-first styling |
| **Framer Motion** | 12.23.3 | Animations |
| **Radix UI** | Various | Accessible UI primitives |
| **Lucide React** | 0.503.0 | Icon library |
| **Three.js** | 0.182.0 | 3D graphics |

### Architecture
- **Type**: Server-Side Rendered (SSR) with App Router
- **Pattern**: Feature-based component organization
- **Rendering**: Hybrid (SSR + Client Components)
- **State Management**: React hooks (useState, useEffect, useRef)
- **Routing**: File-based routing (Next.js App Router)

---

## 📁 Folder Structure

```
frontend/
├── public/                    # Static assets
│   ├── assets/               # Images, icons, badges
│   ├── *.png                 # Blockchain logos, avatars
│   └── *.svg                 # Vector icons
│
├── src/
│   ├── app/                  # Next.js App Router pages
│   │   ├── (authenticated)/  # Protected routes group
│   │   │   ├── competitions/
│   │   │   ├── dashboard/
│   │   │   ├── leaderboards/
│   │   │   ├── markets/
│   │   │   ├── my-predictions/
│   │   │   ├── profile/
│   │   │   ├── rewards/
│   │   │   ├── settings/
│   │   │   ├── wallet/
│   │   │   ├── layout.tsx    # Auth layout wrapper
│   │   │   └── not-found.tsx
│   │   │
│   │   ├── contact/          # Public contact page
│   │   ├── docs/             # Documentation page
│   │   ├── events/           # Events listing
│   │   ├── externaltools/    # External tools page
│   │   ├── Faq/              # FAQ page
│   │   ├── leaderboard/      # Public leaderboard
│   │   ├── privacy/          # Privacy policy
│   │   ├── terms/            # Terms of service
│   │   ├── trading/          # Trading interface
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Homepage
│   │   ├── globals.css       # Global styles
│   │   ├── error.tsx         # Error boundary
│   │   ├── loading.tsx       # Loading state
│   │   ├── not-found.tsx     # 404 page
│   │   └── sitemap.ts        # SEO sitemap
│   │
│   ├── component/            # React components
│   │   ├── events/           # Event-related components
│   │   ├── Homepage/         # Landing page sections
│   │   ├── leaderboard/      # Leaderboard components
│   │   ├── resources/        # Resource components
│   │   ├── rewards/          # Reward system components
│   │   ├── trading/          # Trading interface components
│   │   ├── ui/               # Reusable UI primitives
│   │   ├── Header.tsx        # Global header
│   │   ├── Footer.tsx        # Global footer
│   │   └── *.tsx             # Shared components
│   │
│   └── lib/                  # Utility functions
│       └── utils.ts          # Helper functions
│
├── components.json           # shadcn/ui configuration
├── next.config.ts            # Next.js configuration
├── package.json              # Dependencies
├── pnpm-lock.yaml           # Lock file
├── postcss.config.mjs       # PostCSS config
├── tailwind.config.js       # Tailwind configuration
└── tsconfig.json            # TypeScript configuration
```

### Directory Purposes

#### `/public`
- **Purpose**: Static assets served directly
- **Contents**: Images, icons, logos, fonts
- **Access**: Via `/filename.ext` in code
- **Example**: `<img src="/bitcoin.png" />`

#### `/src/app`
- **Purpose**: Next.js App Router pages and layouts
- **Routing**: File-based (folder = route segment)
- **Special Files**:
  - `page.tsx` - Route UI
  - `layout.tsx` - Shared layout
  - `loading.tsx` - Loading UI
  - `error.tsx` - Error boundary
  - `not-found.tsx` - 404 UI

#### `/src/app/(authenticated)`
- **Purpose**: Route group for protected pages
- **Behavior**: Shares `layout.tsx` with auth shell
- **Routes**: Dashboard, profile, wallet, etc.
- **Note**: Parentheses don't affect URL path

#### `/src/component`
- **Purpose**: Reusable React components
- **Organization**: Feature-based folders
- **Naming**: PascalCase for components
- **Pattern**: Modular and composable

#### `/src/component/ui`
- **Purpose**: Base UI primitives (shadcn/ui)
- **Contents**: Button, Card, Badge, Tabs, etc.
- **Style**: Radix UI + Tailwind variants
- **Customization**: Via `class-variance-authority`

#### `/src/lib`
- **Purpose**: Utility functions and helpers
- **Contents**: Type utilities, formatters, helpers
- **Example**: `cn()` for className merging

---

## 🧩 Component Architecture

### Design Pattern
The project follows a **feature-based component architecture** with reusable UI primitives.

### Component Structure

```typescript
// Example: Button Component (UI Primitive)
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md gap-1.5 px-3",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

### Props Handling & Typing

```typescript
// Feature Component Example
interface HeaderProps {
  // Props are typically inferred from component usage
}

export default function Header() {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  
  // Component logic...
}
```

### Component Categories

1. **UI Primitives** (`/component/ui/`)
   - Base components (Button, Card, Badge)
   - Radix UI wrappers
   - Highly reusable
   - Variant-based styling

2. **Feature Components** (`/component/[feature]/`)
   - Domain-specific (trading, leaderboard, rewards)
   - Composed from UI primitives
   - Business logic included

3. **Layout Components**
   - Header, Footer, DashboardShell
   - Page structure and navigation
   - Shared across routes

4. **Page Components** (`/app/**/page.tsx`)
   - Route-specific UI
   - Compose feature components
   - Handle data fetching

### Naming Conventions

- **Components**: PascalCase (`Header.tsx`, `LeaderboardTable.tsx`)
- **Utilities**: camelCase (`utils.ts`, `cn()`)
- **Files**: kebab-case for routes (`my-predictions/`)
- **CSS Classes**: Tailwind utilities

### Reusability Patterns

```typescript
// 1. Composition Pattern
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>

// 2. Variant Pattern
<Button variant="destructive" size="lg">Delete</Button>

// 3. Slot Pattern (Polymorphic)
<Button asChild>
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>
```

---

## 🗂️ State Management

### Approach
The application uses **React's built-in state management** without external libraries like Redux or Zustand.

### State Patterns

#### 1. Local Component State
```typescript
const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
const [isLoading, setIsLoading] = useState(true)
```

#### 2. Refs for DOM Access
```typescript
const menuButtonRef = useRef<HTMLButtonElement | null>(null)
const mobileMenuRef = useRef<HTMLDivElement | null>(null)
```

#### 3. URL State (Next.js)
```typescript
import { usePathname, useSearchParams } from 'next/navigation'

const pathname = usePathname() // Current route
const searchParams = useSearchParams() // Query params
```

#### 4. Server State (Future)
For API data, consider:
- React Query / TanStack Query
- SWR
- Next.js Server Components with fetch

### State Management Guidelines

- **Local state**: Use `useState` for component-specific data
- **Shared state**: Lift state up or use Context API
- **Server state**: Use Server Components or data fetching libraries
- **URL state**: Use `useSearchParams` for filters/pagination
- **Form state**: Use controlled components or React Hook Form

---

## 🌐 API & Data Fetching

### Current Implementation
The project structure suggests API integration is handled through:

1. **Server Components** (Next.js 13+ App Router)
2. **Client-side fetching** (future implementation)

### Recommended Patterns

#### Server Components (Preferred)
```typescript
// app/dashboard/page.tsx
async function DashboardPage() {
  const data = await fetch('https://api.insightarena.com/user/stats', {
    cache: 'no-store' // or 'force-cache'
  })
  const stats = await data.json()
  
  return <DashboardContent stats={stats} />
}
```

#### Client Components
```typescript
'use client'

import { useEffect, useState } from 'react'

export function MarketList() {
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    fetch('/api/markets')
      .then(res => res.json())
      .then(data => {
        setMarkets(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])
  
  if (loading) return <LoadingSkeleton />
  if (error) return <ErrorState message={error} />
  
  return <div>{/* Render markets */}</div>
}
```

### API Service Layer (Recommended)

Create `/src/services/api.ts`:

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export const api = {
  async getMarkets() {
    const res = await fetch(`${API_BASE_URL}/api/markets`)
    if (!res.ok) throw new Error('Failed to fetch markets')
    return res.json()
  },
  
  async getUserProfile(userId: string) {
    const res = await fetch(`${API_BASE_URL}/api/users/${userId}`)
    if (!res.ok) throw new Error('Failed to fetch user')
    return res.json()
  },
  
  async submitPrediction(data: PredictionData) {
    const res = await fetch(`${API_BASE_URL}/api/predictions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error('Failed to submit prediction')
    return res.json()
  }
}
```

### Error Handling

```typescript
// app/markets/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

### Loading States

```typescript
// app/markets/loading.tsx
export default function Loading() {
  return <MarketListSkeleton />
}
```

---

## 🛣️ Routing System

### Next.js App Router

The project uses **Next.js 13+ App Router** with file-based routing.

### Route Structure

```
app/
├── page.tsx                    → /
├── events/page.tsx             → /events
├── leaderboard/page.tsx        → /leaderboard
├── (authenticated)/            → Route group (no URL segment)
│   ├── layout.tsx              → Shared layout for auth routes
│   ├── dashboard/page.tsx      → /dashboard
│   ├── profile/page.tsx        → /profile
│   └── wallet/page.tsx         → /wallet
```

### Route Groups
- **Syntax**: `(groupName)/`
- **Purpose**: Organize routes without affecting URL
- **Example**: `(authenticated)/` wraps protected routes with auth layout

### Dynamic Routes
```typescript
// app/markets/[id]/page.tsx
export default function MarketPage({ params }: { params: { id: string } }) {
  return <div>Market ID: {params.id}</div>
}
```

### Navigation

#### Link Component
```typescript
import Link from 'next/link'

<Link href="/dashboard">Dashboard</Link>
<Link href="/markets/123">Market 123</Link>
```

#### Programmatic Navigation
```typescript
'use client'
import { useRouter } from 'next/navigation'

export function MyComponent() {
  const router = useRouter()
  
  const handleClick = () => {
    router.push('/dashboard')
    // router.back()
    // router.refresh()
  }
}
```

#### Active Link Detection
```typescript
'use client'
import { usePathname } from 'next/navigation'

export function NavLink({ href, children }) {
  const pathname = usePathname()
  const isActive = pathname === href
  
  return (
    <Link 
      href={href}
      className={isActive ? 'text-white font-semibold' : 'text-gray-200'}
      aria-current={isActive ? 'page' : undefined}
    >
      {children}
    </Link>
  )
}
```

### Special Files

| File | Purpose |
|------|---------|
| `layout.tsx` | Shared UI for route segment |
| `page.tsx` | Unique UI for route |
| `loading.tsx` | Loading UI (Suspense boundary) |
| `error.tsx` | Error UI (Error boundary) |
| `not-found.tsx` | 404 UI |
| `route.ts` | API endpoint |

---

## 🎨 Styling System

### Tailwind CSS

The project uses **Tailwind CSS v4** with custom configuration.

### Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/component/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', /* ... */],
        mono: ['"SF Mono"', 'Monaco', 'Inconsolata', /* ... */],
      },
    },
  },
  plugins: [],
}
```

### Global Styles

Located in `src/app/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  /* ... more CSS variables */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ... dark mode overrides */
}
```

### Theming

The project uses **CSS variables** for theming:

- Light/dark mode support via `.dark` class
- OKLCH color space for better color perception
- Semantic color tokens (primary, secondary, destructive, etc.)

### Utility Function

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Usage**:
```typescript
<div className={cn(
  "base-class",
  isActive && "active-class",
  className
)} />
```

### Component Styling Patterns

#### 1. Utility Classes
```typescript
<button className="rounded-lg bg-orange-500 px-6 py-2 font-semibold text-white hover:bg-orange-600">
  Connect Wallet
</button>
```

#### 2. Conditional Classes
```typescript
<Link
  className={`transition-colors ${
    isActive ? "text-white font-semibold" : "text-gray-200 hover:text-white"
  }`}
>
  {link.name}
</Link>
```

#### 3. Class Variance Authority (CVA)
```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive text-white",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

### Responsive Design

```typescript
<div className="
  flex flex-col          // Mobile: column
  md:flex-row            // Tablet+: row
  lg:gap-8               // Desktop: larger gap
  xl:max-w-7xl           // Extra large: max width
">
  {/* Content */}
</div>
```

### Animations

Using **Framer Motion**:

```typescript
import { motion } from 'framer-motion'

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>
  Content
</motion.div>
```

---

## 🔧 Environment Variables

### Setup

Create `.env.local` in the frontend root:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001

# Stellar Network
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org

# Contract Addresses
NEXT_PUBLIC_PREDICTION_CONTRACT=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_REWARD_CONTRACT=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Feature Flags
NEXT_PUBLIC_ENABLE_WALLET_CONNECT=true
NEXT_PUBLIC_ENABLE_LEADERBOARD=true

# Analytics (Optional)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

### Usage

```typescript
// Client-side (must start with NEXT_PUBLIC_)
const apiUrl = process.env.NEXT_PUBLIC_API_URL

// Server-side (any name)
const secretKey = process.env.SECRET_KEY
```

### Environment Files

- `.env.local` - Local development (gitignored)
- `.env.development` - Development defaults
- `.env.production` - Production defaults
- `.env` - Shared defaults

### Best Practices

1. **Never commit secrets** - Use `.env.local` for sensitive data
2. **Prefix client vars** - Use `NEXT_PUBLIC_` for browser access
3. **Validate on startup** - Check required vars in `next.config.ts`
4. **Document all vars** - Keep this section updated

---

## 🚀 Development Workflow

### Prerequisites

- **Node.js**: 20.x or higher
- **pnpm**: 10.32.1 (specified in package.json)
- **Git**: For version control

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/InsightArena.git
cd InsightArena/frontend

# Install dependencies
pnpm install
```

### Available Scripts

```bash
# Development server (with Turbopack)
pnpm dev
# → http://localhost:3000

# Production build
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

### Development Server

```bash
pnpm dev
```

- Runs on `http://localhost:3000`
- Hot Module Replacement (HMR) enabled
- Uses Turbopack for faster builds

### Project Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

3. **Run development server**:
   ```bash
   pnpm dev
   ```

4. **Open browser**:
   Navigate to `http://localhost:3000`

### Code Style Guidelines

#### TypeScript
- Use TypeScript for all new files
- Define interfaces for props
- Avoid `any` type
- Use type inference when possible

#### Components
- One component per file
- Use functional components
- Prefer named exports for components
- Use default export for pages

#### Naming
- Components: PascalCase (`UserProfile.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- Constants: UPPER_SNAKE_CASE (`API_BASE_URL`)
- CSS classes: Tailwind utilities

#### File Organization
```
component/
├── feature/
│   ├── FeatureComponent.tsx      # Main component
│   ├── FeatureSubComponent.tsx   # Sub-component
│   └── index.ts                  # Optional barrel export
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/add-market-filters

# Make changes and commit
git add .
git commit -m "feat: add market filtering functionality"

# Push to remote
git push origin feature/add-market-filters

# Create Pull Request on GitHub
```

### Commit Message Convention

```
feat: add new feature
fix: bug fix
docs: documentation changes
style: formatting, missing semicolons, etc.
refactor: code restructuring
test: adding tests
chore: maintenance tasks
```

### Building for Production

```bash
# Create optimized build
pnpm build

# Test production build locally
pnpm start
```

### Debugging

#### React DevTools
Install [React Developer Tools](https://react.dev/learn/react-developer-tools)

#### Next.js DevTools
Built-in at `http://localhost:3000/__nextjs_dev_tools__`

#### Console Logging
```typescript
console.log('Debug:', data)
console.error('Error:', error)
console.table(arrayData)
```

#### VS Code Debugging
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "pnpm dev"
    }
  ]
}
```

---

## 📦 Adding New Features

### Adding a New Page

1. **Create page file**:
   ```bash
   # Public page
   src/app/new-page/page.tsx
   
   # Authenticated page
   src/app/(authenticated)/new-page/page.tsx
   ```

2. **Create page component**:
   ```typescript
   export default function NewPage() {
     return (
       <div>
         <h1>New Page</h1>
       </div>
     )
   }
   ```

3. **Add navigation link**:
   ```typescript
   // src/component/Header.tsx
   const navLinks = [
     // ...
     { name: "New Page", link: "/new-page" },
   ]
   ```

### Adding a New Component

1. **Create component file**:
   ```bash
   src/component/feature/NewComponent.tsx
   ```

2. **Define component**:
   ```typescript
   interface NewComponentProps {
     title: string
     onAction: () => void
   }
   
   export function NewComponent({ title, onAction }: NewComponentProps) {
     return (
       <div>
         <h2>{title}</h2>
         <button onClick={onAction}>Action</button>
       </div>
     )
   }
   ```

3. **Use component**:
   ```typescript
   import { NewComponent } from '@/component/feature/NewComponent'
   
   <NewComponent title="Hello" onAction={() => console.log('clicked')} />
   ```

### Adding a UI Component (shadcn/ui)

```bash
# Install shadcn/ui CLI (if not already)
pnpm dlx shadcn@latest init

# Add a component
pnpm dlx shadcn@latest add dialog
pnpm dlx shadcn@latest add dropdown-menu
```

This adds the component to `src/component/ui/`.

---

## 🧪 Testing (Future Implementation)

### Recommended Testing Stack

- **Unit Tests**: Vitest or Jest
- **Component Tests**: React Testing Library
- **E2E Tests**: Playwright or Cypress
- **Type Checking**: TypeScript

### Example Test Structure

```typescript
// __tests__/components/Button.test.tsx
import { render, screen } from '@testing-library/react'
import { Button } from '@/component/ui/button'

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })
  
  it('calls onClick handler', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click</Button>)
    screen.getByText('Click').click()
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
```

---

## 🔐 Security Best Practices

1. **Environment Variables**: Never commit `.env.local`
2. **API Keys**: Use server-side only vars (no `NEXT_PUBLIC_`)
3. **Input Validation**: Validate all user inputs
4. **XSS Prevention**: React escapes by default, avoid `dangerouslySetInnerHTML`
5. **CSRF Protection**: Use Next.js built-in protections
6. **Dependencies**: Regularly update with `pnpm update`

---

## 📚 Additional Resources

### Official Documentation
- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript](https://www.typescriptlang.org/docs)

### UI Libraries
- [Radix UI](https://www.radix-ui.com)
- [shadcn/ui](https://ui.shadcn.com)
- [Lucide Icons](https://lucide.dev)

### Learning Resources
- [Next.js Learn](https://nextjs.org/learn)
- [React Tutorial](https://react.dev/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

---

## 🤝 Contributing

### Getting Started

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Update documentation
6. Submit a pull request

### Code Review Process

1. Ensure all tests pass
2. Follow code style guidelines
3. Update relevant documentation
4. Request review from maintainers
5. Address feedback
6. Merge after approval

---

## 📞 Support

- **Telegram**: https://t.me/+hR9dZKau8f84YTk0
- **GitHub Issues**: [Create an issue](https://github.com/your-org/InsightArena/issues)
- **Documentation**: `/docs` page in the app

---

## 📝 Changelog

### Version 0.1.0 (Current)
- Initial frontend implementation
- Next.js 16 with App Router
- Tailwind CSS v4 styling
- Basic routing structure
- Component library setup
- Homepage and landing pages
- Authentication layout structure

---

**Last Updated**: 2024
**Maintained By**: InsightArena Team
