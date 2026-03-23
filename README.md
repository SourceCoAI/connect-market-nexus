# Connect Market Nexus

An M&A deal management platform that connects business sellers with qualified buyers through a curated marketplace, AI-powered buyer-deal matching, and a full remarketing pipeline.

**Production URL**: https://marketplace.sourcecodeals.com

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Environment Variables](#environment-variables)
- [Key Features](#key-features)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## Overview

Connect Market Nexus is a B2B M&A (Mergers & Acquisitions) deal marketplace platform. It provides:

- **Buyer Marketplace** -- Approved buyers browse active deal listings with advanced filtering by industry, location, revenue, and EBITDA.
- **Admin Dashboard** -- Internal team manages deals, approves users, tracks connection requests, and monitors pipeline progress.
- **ReMarketing Engine** -- Outbound deal sourcing with buyer universes, AI-powered scoring and matching, contact discovery, and introduction automation.
- **M&A Intelligence** -- Deal trackers, buyer research profiles, and transcription analysis tools.
- **Data Room** -- Per-deal document storage with granular access control (teaser / full memo / data room) and complete audit trails.
- **Lead Memos** -- AI-generated deal summaries with rich text editing, version history, and email distribution tracking.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite 5 |
| UI Components | shadcn/ui (Radix UI primitives), Tailwind CSS 3 |
| State Management | TanStack React Query 5, React Context |
| Routing | React Router DOM 6 |
| Backend / Database | Supabase (PostgreSQL 15, Auth, Storage, Edge Functions) |
| Edge Functions | Deno (TypeScript), 113+ functions with 24 shared modules |
| AI | Gemini 2.0 Flash (via shared `ai-providers.ts` module) |
| Email | Brevo (Sendinblue) transactional email |
| Rich Text | TipTap editor |
| Maps | Mapbox GL |
| Charts | Recharts |
| Forms | React Hook Form + Zod validation |
| Document Generation | docx (Word), PandaDoc (e-signatures) |
| Drag and Drop | dnd-kit |
| Testing | Vitest 4 |

---

## Prerequisites

- **Node.js** >= 20.x (LTS recommended)
- **npm** >= 10.x
- **Supabase CLI** (for local development with edge functions and migrations)
  ```bash
  npm install -g supabase
  ```
- **Git**

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd connect-market-nexus
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root (see [Environment Variables](#environment-variables)):

```env
VITE_SUPABASE_URL="https://<project-id>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<your-anon-key>"
VITE_SUPABASE_PROJECT_ID="<project-id>"
```

### 4. Start the development server

```bash
npm run dev
```

The application will be available at `http://localhost:8080`.

### 5. (Optional) Run Supabase locally

```bash
supabase start
supabase db reset   # Apply all migrations
supabase functions serve   # Start edge functions locally
```

---

## Project Structure

```
connect-market-nexus/
├── src/
│   ├── App.tsx                # Root component with all route definitions
│   ├── main.tsx               # Entry point (BrowserRouter + React StrictMode)
│   ├── pages/                 # Route-level page components
│   │   ├── admin/             # Admin dashboard pages
│   │   │   ├── remarketing/   # ReMarketing module (universes, buyers, deals)
│   │   │   ├── ma-intelligence/ # M&A Intelligence (trackers, all-buyers)
│   │   │   ├── analytics/     # Analytics pages
│   │   │   └── settings/      # Admin settings pages
│   │   ├── Marketplace.tsx    # Buyer marketplace (landing page for buyers)
│   │   ├── ListingDetail.tsx  # Individual deal detail page
│   │   ├── Profile.tsx        # Buyer profile management
│   │   ├── Login.tsx          # Authentication
│   │   ├── Signup.tsx         # Registration (multi-step)
│   │   └── ...
│   ├── components/            # Reusable UI components
│   │   ├── admin/             # Admin-specific components
│   │   ├── listing/           # Deal card and grid components
│   │   ├── listing-detail/    # Deal detail sections
│   │   ├── marketplace/       # Buyer marketplace components
│   │   ├── remarketing/       # ReMarketing system components
│   │   ├── ma-intelligence/   # M&A Intelligence components
│   │   ├── filters/           # Filter panel components
│   │   ├── navbar/            # Navigation bar components
│   │   ├── onboarding/        # Buyer onboarding flow
│   │   ├── ui/                # shadcn/ui base components
│   │   └── ...
│   ├── hooks/                 # Custom React hooks
│   │   ├── admin/             # Admin data hooks
│   │   ├── auth/              # Authentication hooks
│   │   ├── marketplace/       # Marketplace data hooks
│   │   ├── permissions/       # Permission checking hooks
│   │   └── use-*.ts           # Feature-specific hooks
│   ├── lib/                   # Utility libraries and business logic
│   │   ├── auth-helpers.ts    # Authentication utility functions
│   │   ├── deal-scoring-v5.ts # Buyer-deal scoring algorithm
│   │   ├── financial-parser.ts # Financial data parsing
│   │   ├── error-handler.ts   # Centralized error handling
│   │   ├── query-keys.ts      # React Query key factories
│   │   └── ...
│   ├── context/               # React Context providers
│   │   ├── AuthContext.tsx     # Authentication state
│   │   ├── AnalyticsContext.tsx # Analytics tracking
│   │   ├── NavigationStateContext.tsx # Navigation state
│   │   └── TabVisibilityContext.tsx   # Tab visibility tracking
│   ├── contexts/              # Additional context providers
│   │   ├── SessionContext.tsx  # Session management
│   │   └── SearchSessionContext.tsx # Search session tracking
│   ├── types/                 # TypeScript type definitions
│   ├── integrations/supabase/ # Supabase client and auto-generated types
│   ├── config/                # Feature flags and configuration
│   ├── constants/             # Application constants
│   ├── features/              # Feature modules
│   └── utils/                 # Utility functions
├── supabase/
│   ├── functions/             # 113+ Deno edge functions
│   │   ├── _shared/           # 24 shared modules (auth, CORS, AI, etc.)
│   │   ├── data-room-*/       # Data room operations
│   │   ├── enrich-*/          # AI enrichment functions
│   │   ├── score-*/           # Scoring functions
│   │   ├── send-*/            # Email sending functions
│   │   └── ...
│   ├── migrations/            # 590+ SQL migrations
│   └── config.toml            # Supabase project configuration
├── docs/                      # Project documentation
├── scripts/                   # Build and maintenance scripts
├── public/                    # Static assets
├── package.json
├── vite.config.ts             # Vite build configuration
├── vitest.config.ts           # Test configuration
├── tailwind.config.ts         # Tailwind CSS configuration
├── tsconfig.json              # TypeScript configuration
└── eslint.config.js           # ESLint configuration
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server on port 8080 with HMR |
| `npm run build` | Production build (strips `console.log` and `debugger`) |
| `npm run build:dev` | Development build (preserves console output) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across all TypeScript files |
| `npm test` | Run the test suite once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

---

## Environment Variables

All client-side environment variables use the `VITE_` prefix (required by Vite).

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL (`https://<id>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | Yes | Supabase project identifier |

Edge functions use server-side secrets configured in the Supabase dashboard:

| Secret | Used By | Description |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | All functions | Service-role key for admin DB operations |
| `GEMINI_API_KEY` | AI functions | Google Gemini API key |
| `BREVO_API_KEY` | Email functions | Brevo transactional email API key |
| `MAPBOX_TOKEN` | `get-mapbox-token` | Mapbox GL access token |
| `FIRECRAWL_API_KEY` | `firecrawl-scrape` | Firecrawl web scraping API key |
| `APIFY_API_TOKEN` | `apify-*` functions | Apify scraping platform token |
| `PANDADOC_API_KEY` | `create-pandadoc-document` | PandaDoc e-signature API key |
| `FIREFLIES_API_KEY` | `fetch-fireflies-content` | Fireflies.ai transcription API key |

---

## Key Features

### Buyer Marketplace
- Browse active deal listings with filters (industry, location, revenue, EBITDA)
- Connection request workflow with admin approval
- Deal bookmarking and saved listings
- Buyer profile management with investment criteria

### Admin Dashboard
- Deal CRUD with rich text editor (TipTap)
- User approval and management workflow
- Connection request pipeline with stage tracking
- Email notifications (approval, NDA, fee agreements)
- Referral partner tracking
- System health monitoring

### ReMarketing Engine
- Buyer universe management
- External buyer database with AI enrichment
- Multi-dimensional buyer-deal scoring (geography, size, service alignment)
- Contact discovery and outreach automation
- CapTarget and GP Partner deal imports

### M&A Intelligence
- Deal trackers with buyer research
- Transcription analysis
- Investment criteria extraction

### Data Room
- Per-deal document storage via Supabase Storage
- Three-level access control (teaser / full memo / data room)
- Document tracked links with open tracking
- Complete audit trail

### Security
- Supabase Auth with JWT tokens
- TOTP-based MFA for admin users
- Row Level Security (RLS) on all database tables
- SSRF protection in edge functions
- Rate limiting on sensitive operations
- Input sanitization and anti-hallucination guards

---

## Testing

The project uses **Vitest 4** as the test framework.

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

Test files follow the `*.test.ts` convention and are co-located with their source files:

- `src/lib/*.test.ts` -- Unit tests for scoring engine, currency parsing, financial extraction
- `supabase/functions/_shared/*.test.ts` -- Tests for shared edge function modules (auth, security, validation)

Coverage is configured for `src/lib/` and `supabase/functions/_shared/` directories using the V8 provider.

---

## Deployment

The frontend is deployed as a static site. The backend runs on Supabase (managed PostgreSQL + edge functions).

```bash
# Build for production
npm run build

# Deploy edge functions
supabase functions deploy --project-ref <project-id>

# Apply database migrations
supabase db push --project-ref <project-id>
```

For detailed deployment instructions, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Documentation

| Document | Description |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines, workflow, and code style |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and design decisions |
| [docs/DATABASE.md](docs/DATABASE.md) | Database schema, tables, RLS policies, and migration workflow |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment guide and production checklist |
| [docs/API.md](docs/API.md) | API reference (RPCs, edge functions, query patterns) |
| [docs/EDGE_FUNCTIONS.md](docs/EDGE_FUNCTIONS.md) | Edge functions reference and shared modules |
| [docs/architecture/](docs/architecture/) | Detailed architecture specs (permissions, deal pages) |
| [docs/security/](docs/security/) | Security audits and reports |
| [docs/features/](docs/features/) | Feature-specific documentation |
| [docs/guides/](docs/guides/) | Testing and smoke test guides |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, branch naming conventions, commit message format, PR process, and code style guidelines.

---

## License

This project is proprietary. All rights reserved.
