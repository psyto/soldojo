# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                 │
│                                                       │
│  Landing ─ Courses ─ Lessons ─ Dashboard ─ Profile   │
│  Leaderboard ─ Certificates ─ Settings               │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ NextAuth │  │  Solana   │  │   i18n Context   │   │
│  │  (JWT)   │  │  Wallet   │  │  (EN/PT-BR/ES)   │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
├─────────────────────────────────────────────────────┤
│               Service Layer (Swappable)              │
│                                                       │
│  ┌──────────────────────────────────────────────┐    │
│  │        LearningProgressService               │    │
│  │                                               │    │
│  │  getProgress() ─ completeLesson() ─ getXP()  │    │
│  │  getStreak() ─ getLeaderboard()              │    │
│  │  getCredentials()                             │    │
│  └──────────────────────────────────────────────┘    │
│         │ Current: Prisma/PostgreSQL                  │
│         │ Future:  On-chain (Anchor program)          │
├─────────────────────────────────────────────────────┤
│                   Data Layer                          │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Prisma   │  │  Sanity  │  │  Solana Devnet   │   │
│  │ Postgres │  │   CMS    │  │  (XP tokens,     │   │
│  │          │  │          │  │   cNFT creds)    │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. Service Interface Pattern

All learning progress logic goes through `LearningProgressService`. This interface is the seam between the frontend and whatever backend stores the data.

```typescript
interface LearningProgressService {
  getProgress(userId, courseId): Promise<Progress>;
  completeLesson(userId, courseId, lessonIndex): Promise<void>;
  getXP(userId): Promise<number>;
  getStreak(userId): Promise<StreakData>;
  getLeaderboard(timeframe): Promise<LeaderboardEntry[]>;
  getCredentials(wallet): Promise<Credential[]>;
}
```

**Current implementation:** `StubLearningProgressService` uses Prisma/PostgreSQL.

**Future swap:** Replace with on-chain calls to the Anchor program at `github.com/solanabr/superteam-academy`. The interface stays the same — only the implementation changes.

### 2. On-Chain Integration Points

| Feature | Current (Stubbed) | Future (On-Chain) |
|---------|-------------------|-------------------|
| XP balance | `User.totalXP` in Prisma | Token-2022 soulbound token balance |
| Level | `floor(sqrt(xp/100))` computed | Same formula, reads token account |
| Credentials | Empty array | cNFT read via Helius DAS API |
| Enrollment | `Enrollment` table in Prisma | PDA per learner per course |
| Lesson progress | `LessonProgress` table | Bitmap on Enrollment PDA |
| Streaks | `StreakDay` table | Side effect of `complete_lesson` |
| Achievements | Hex string on User | Bitmap (256 bits) on Learner PDA |
| Leaderboard | `ORDER BY totalXP DESC` | Index XP token balances (Helius) |

### 3. Authentication Flow

```
User arrives → Choose auth method:
  ├── Google OAuth → NextAuth session (JWT)
  ├── GitHub OAuth → NextAuth session (JWT)
  └── Wallet only → Guest mode (limited features)

After initial auth:
  └── Link additional methods in Settings
      ├── Link wallet → Required for on-chain credentials
      ├── Link Google → Alternative sign-in
      └── Link GitHub → Alternative sign-in
```

Wallet linking is required to finalize courses and receive credential cNFTs.

### 4. i18n Architecture

```
src/lib/i18n/
├── index.ts    # t(), formatT(), locale management
├── en.ts       # English (source of truth for types)
├── pt-br.ts    # Portuguese (Brazil)
└── es.ts       # Spanish

LocaleContext (React Context)
  ├── Persisted to localStorage
  ├── Language switcher in Header
  └── Settings page for preference
```

All UI strings are externalized. Course content remains in its original language (CMS-driven).

### 5. Component Architecture

```
Providers (root)
├── AuthProvider (NextAuth session)
├── LocaleProvider (i18n context)
├── SolanaProvider (wallet connection)
└── QueryClientProvider (React Query)

Layout
├── Header (nav, language switcher, wallet button)
├── Main content (page-specific)
└── Footer (links, social)
```

### 6. Data Flow: Lesson Completion

```
User completes lesson
  → Frontend calls completeLesson(userId, courseId, lessonIdx)
  → Service creates LessonProgress record
  → Service awards XP (creates XPEvent, updates User.totalXP)
  → Service updates StreakDay (upsert today's date)
  → Service recalculates streak count
  → Service updates Enrollment progress percentage
  → If course 100% → award course XP + mark COMPLETED
  → Frontend re-fetches dashboard data via React Query
```

### 7. Gamification Design

**XP & Leveling:**
- `Level = floor(sqrt(totalXP / 100))`
- XP is cumulative and never decreases
- Source: soulbound Token-2022 (NonTransferable) on-chain

**Streaks:**
- Updated as side effect of lesson completion
- Calendar visualization shows last 28 days
- Milestones at 7, 30, 100 days

**Achievements:**
- 256 possible (bitmap)
- Categories: Progress, Streaks, Skills, Community, Special
- Stored as hex string, each bit = one achievement

**Leaderboard:**
- Off-chain computation, on-chain data source
- Weekly / monthly / all-time views
- Sorted by total XP

### 8. CMS Content Model

```
Track (Learning Path)
  └── Course
        ├── Metadata (title, slug, difficulty, duration, xpReward)
        └── Module[]
              └── Lesson[]
                    ├── Content lesson (markdown + code blocks)
                    ├── Challenge lesson (starter code, tests, hints)
                    └── Video lesson (URL)
```

### 9. Performance Strategy

- Static generation for landing, catalog pages
- Dynamic rendering for dashboard, profile (user-specific)
- Monaco Editor lazy-loaded (dynamic import, no SSR)
- React Query for server state caching (30s stale time)
- Image optimization via Next.js Image component
- Code splitting by route (automatic with App Router)
