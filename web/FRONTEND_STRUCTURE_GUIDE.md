# Pumpy frontend structure guide

Pumpy-specific conventions for the React, TanStack Start, Three.js, and
DreamDEX frontend. The priority is one legible mobile match, not a generic
dashboard component library.

## Core Philosophy

- **Dead simple** - No overengineering, no early abstractions
- **Practical tidiness** - Organized but not obsessively neat
- **Easy to navigate** - New devs should understand the structure in minutes
- **Componentize by feature/flow** - Not by every UI element

---

## Folder Structure

```
src/
├── components/
│   ├── pumpy/         # Arena, rivals, trade readout, timeline, result
│   └── console/       # 3D handheld, controls, and DOM fallback
├── routes/            # TanStack Router file-based routes
├── providers/         # React context providers
├── hooks/             # Custom hooks
├── lib/
│   ├── dreamdex/      # Typed Event Contract adapter and watches
│   ├── audio.ts       # Feedback engine
│   └── haptics.ts     # Mobile haptic engine
├── utils/             # Helper functions
├── integrations/      # Framework integrations (tanstack-query, etc.)
├── data/              # Static data, mock data
├── config.ts          # App configuration & constants
├── router.tsx         # Router setup
└── styles.css         # Global styles

public/
└── assets/            # Images, fonts, icons, etc.
    ├── images/
    ├── icons/
    └── fonts/
```

---

## Config File

**`src/config.ts`** - Single source of truth for app-wide constants.

```ts
export const config = {
  appName: 'Pumpy',
  appDescription: 'Beat the market. Then beat the bot.',

  // Social/external links
  links: {
    twitter: '',
    github: '',
    telegram: '',
    docs: '',
  },

  // Deployment-specific DreamDEX values are discovered, never hard-coded here.
} as const
```

**Why?** One file to update when deploying to different environments. No hunting through code for hardcoded values.

---

## Providers Pattern

For any shared functionality (HeroUI, smooth scroll, etc.), use providers.

### Structure

```
src/
├── providers/
│   ├── HeroUIProvider.tsx
│   └── LenisSmoothScrollProvider.tsx
```

Providers are composed in the root route (`src/routes/__root.tsx`).

### Example: HeroUI Provider

**`providers/HeroUIProvider.tsx`**

```tsx
import { HeroUIProvider as Provider } from '@heroui/react'

export default function HeroUIProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <Provider>{children}</Provider>
}
```

---

## Lib Folder

**`src/lib/`** - External integrations as SDK-like modules.

```
lib/
├── dreamdex/          # Event Contract types, discovery, quotes, wallet writes
│   ├── network.ts     # Somnia Shannon identity and public endpoints
│   ├── types.ts       # Pumpy-facing domain types
│   └── adapter.ts     # Official SDK isolation boundary
├── api/              # Backend API client
│   ├── client.ts     # Base client setup
│   └── user.ts       # User-related endpoints
└── analytics.ts
```

### Centralize all DreamDEX calls

All backend and smart contract interactions live in `lib/` as clean, SDK-like functions.

Pumpy components never construct raw contract calls or parse market questions.
They consume typed market, quote, position, and claim objects from the adapter.

**Good** - centralized in `lib/dreamdex`:

```ts
// lib/api/user.ts
import { client } from './client'

export async function getBalance(userId: string) {
  const res = await client.get(`/user/${userId}/balance`)
  return res.data
}
```

```tsx
// Components just import and use
import { getBalance } from '@/lib/api/user'

function Dashboard() {
  useEffect(() => {
    getBalance(userId).then(setBalance)
  }, [])
}
```

---

## Utils Folder

**`src/utils/`** - Pure helper functions. No React, no side effects.

```
utils/
├── style.ts          # cnm (clsx + tailwind-merge)
├── format.ts         # formatCurrency, formatDate, truncateAddress
└── validation.ts     # isValidEmail, isValidAmount
```

**Example:**

```ts
// utils/style.ts
import clsx, { type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cnm = (...cn: ClassValue[]) => twMerge(clsx(cn))
```

---

## Component Organization

### Rule: Componentize by Flow, Not by Element

**Good** - Componentized by purpose:

```
components/
├── elements/         # Reusable animation/UI elements
│   └── AnimateComponent.tsx
├── WebstarterOnboarding.tsx  # Domain-specific component
├── TokenCard.tsx
└── WalletConnect.tsx
```

**`components/elements/`** is for generic elements that could be reused across pages - AnimateComponent, LoadingSpinner, etc.

Everything else in `components/` is domain-specific but reused across multiple pages.

### Page-Level Components

Keep page-specific components **in the route file** until they're reused elsewhere.

```
routes/
├── index.tsx              # Main page
├── dashboard/
│   └── index.tsx          # Dashboard page with inline components
└── settings.tsx           # Simple enough for single file
```

**Move to `components/` only when:**

1. Used in 2+ different routes
2. Complex enough to warrant isolation
3. Genuinely reusable

---

## Routes (TanStack Router)

This project uses TanStack Router with file-based routing.

```
routes/
├── __root.tsx         # Root layout, providers, meta tags
├── index.tsx          # Home page (/)
└── demo/              # Demo pages (/demo/*)
    ├── form.simple.tsx
    └── tanstack-query.tsx
```

### Root Route

The `__root.tsx` file is where you:

- Set up providers (HeroUI, etc.)
- Define meta tags (title, description)
- Include global styles
- Add dev tools

---

## Public Assets

Keep `public/` root clean. Use `assets/` subfolder.

```
public/
├── favicon.ico           # Root-level essentials only
├── robots.txt
└── assets/
    ├── images/
    │   └── logo.svg
    ├── icons/
    └── fonts/
```

**Reference in code:**

```tsx
<img src="/assets/images/logo.svg" alt="Logo" />
```

---

## Quick Reference

| What                     | Where                  | Example                                   |
| ------------------------ | ---------------------- | ----------------------------------------- |
| App constants            | `config.ts`            | API URLs, social links                    |
| Providers                | `providers/`           | HeroUIProvider, LenisSmoothScrollProvider |
| Custom hooks             | `hooks/`               | useAuth, useWallet                        |
| External SDKs/contracts  | `lib/`                 | Contract ABIs, API clients                |
| Pure helpers             | `utils/`               | cnm, formatDate, truncateAddress          |
| Reusable UI elements     | `components/elements/` | AnimateComponent                          |
| Domain-specific reusable | `components/`          | TokenCard, WalletConnect                  |
| Page routes              | `routes/`              | index.tsx, dashboard/index.tsx            |
| Static files             | `public/assets/`       | Images, fonts, icons                      |

---

## Anti-Patterns to Avoid

1. **Creating a component for everything** - 3 lines of JSX doesn't need its own file
2. **Premature abstraction** - Don't create `useApi` until you have 3+ similar API calls
3. **Deeply nested folders** - Max 2-3 levels deep
4. **Separating by file type** - Don't do `components/buttons/`, `components/cards/`
5. **Barrel files / index.ts re-exports** - Just import directly from the actual file
6. **Comments explaining obvious code** - Code should be self-explanatory

---

## When to Create New Files

✅ **Do create** when:

- Logic is reused in 2+ places
- File exceeds ~300 lines
- Distinct domain/responsibility

❌ **Don't create** when:

- "It might be reused someday"
- "This looks like it could be a component"
- Just to make folders look organized

---

Keep it simple. Ship fast. Refactor when needed, not before.
