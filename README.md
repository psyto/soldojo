# SolDojo — Where Solana Builders Train

Interactive learning platform for Solana development. Gamified progression, on-chain credentials, and a community-driven experience built for crypto natives.

Built for [Superteam Brazil](https://twitter.com/SuperteamBR).

## Features

- **Gamified Learning** — XP, levels, streaks, achievements, and leaderboards
- **Hands-on Challenges** — Solve Rust/TypeScript coding exercises with real-time feedback
- **On-Chain Credentials** — Anchor program records completions; cNFT certificates via Metaplex Bubblegum
- **Wallet Integration** — Phantom/Solflare with signature verification
- **Multi-language** — PT-BR (default), English, Spanish
- **CI/CD** — GitHub Actions pipeline with lint, typecheck, test, and build

## On-Chain Program

Deployed on **Solana Devnet**:

| | |
|---|---|
| Program ID | `CzTcLkeLZvk77ZJQpaL5fCYVgxqU63JV8rZBwC1kQ3rQ` |
| Framework | Anchor v0.32.0 |
| Instructions | `init_profile`, `record_completion` |
| Accounts | `LearnerProfile` (PDA per wallet), `CourseCompletion` (PDA per wallet+course) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS + Radix UI primitives |
| Auth | NextAuth v5 (Google, GitHub) + Solana Wallet Adapter |
| Database | PostgreSQL + Prisma ORM |
| CMS | Sanity (headless) |
| Code Editor | Monaco Editor |
| State | Zustand + TanStack React Query |
| Analytics | GA4 + PostHog + Sentry |
| On-chain | Anchor v0.32.0, Metaplex Bubblegum (cNFTs), Helius DAS API |
| Blockchain | Solana Devnet |
| Testing | Vitest (39 tests) |
| CI/CD | GitHub Actions |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Solana wallet (Phantom or Solflare) for testing

### Setup

```bash
# Clone
git clone https://github.com/psyto/soldojo.git
cd soldojo

# Install dependencies
npm install --legacy-peer-deps

# Copy environment variables
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | NextAuth encryption secret |
| `GOOGLE_CLIENT_ID` | For Google auth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Google auth | Google OAuth client secret |
| `GITHUB_ID` | For GitHub auth | GitHub OAuth app ID |
| `GITHUB_SECRET` | For GitHub auth | GitHub OAuth app secret |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | No | Solana RPC endpoint (defaults to Devnet) |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | For CMS | Sanity project ID |
| `NEXT_PUBLIC_GA4_ID` | For analytics | Google Analytics 4 measurement ID |
| `NEXT_PUBLIC_POSTHOG_KEY` | For heatmaps | PostHog project API key |
| `NEXT_PUBLIC_SENTRY_DSN` | For errors | Sentry DSN for error monitoring |
| `ENABLE_DEV_AUTH` | For dev | Set to `true` to enable dev credentials login |

## Project Structure

```
soldojo/
├── prisma/
│   └── schema.prisma         # Database schema
├── src/
│   ├── app/                   # Next.js App Router pages
│   │   ├── page.tsx           # Landing page
│   │   ├── courses/           # Catalog + detail + lessons
│   │   ├── dashboard/         # User dashboard
│   │   ├── leaderboard/       # XP rankings
│   │   ├── profile/           # User profile
│   │   ├── settings/          # User settings
│   │   └── certificates/      # On-chain credential view
│   ├── components/
│   │   ├── editor/            # Monaco code editor
│   │   ├── layout/            # Header + footer
│   │   ├── providers/         # Auth, Solana, session
│   │   └── ui/                # Radix UI primitives
│   ├── lib/
│   │   ├── auth/              # NextAuth configuration
│   │   ├── analytics/         # GA4, PostHog, Sentry
│   │   ├── cms/               # Sanity CMS client + schema
│   │   ├── i18n/              # Translations (EN, PT-BR, ES)
│   │   ├── services/          # LearningProgressService (stubbed)
│   │   └── solana/            # RPC config, explorer URLs
│   ├── contexts/              # React contexts (locale)
│   ├── hooks/                 # Custom React hooks
│   └── types/                 # TypeScript interfaces
└── docs/
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript type checking |
| `npm test` | Run test suite (Vitest) |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:studio` | Open Prisma Studio |

## Deployment

Deploy to Vercel with one click — the project is fully configured for Next.js on Vercel:

1. Push your repo to GitHub
2. Import into [Vercel](https://vercel.com)
3. Set the required environment variables (see `.env.example`)
4. Deploy

For the Anchor program, install [Anchor CLI](https://www.anchor-lang.com/docs/installation) and run:

```bash
cd programs/soldojo
anchor build
anchor deploy --provider.cluster devnet
```

## License

MIT — see [LICENSE](LICENSE).
