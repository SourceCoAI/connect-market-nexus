# Components Directory Map

> **Last updated:** 2026-02-26 (CTO Audit)
> **Total component files:** 646
> **UI Library:** shadcn/ui (Radix UI + Tailwind CSS)

---

## Directory Structure

```
src/components/
├── admin/                    # Admin dashboard components (largest group)
│   ├── CreateDealModal/      # Multi-step deal creation
│   ├── analytics/            # Analytics dashboards
│   │   ├── datafast/         # DataFast analytics
│   │   └── realtime/         # Real-time analytics
│   ├── dashboard/            # Admin dashboard views
│   ├── data-recovery/        # Data recovery tools
│   ├── data-room/            # Data room management
│   ├── deals/                # Deal management in admin
│   ├── document-distribution/ # Document distribution
│   ├── editor-sections/      # Rich text editor sections
│   ├── firm-agreements/      # Firm agreement management
│   ├── form-monitoring/      # Form monitoring
│   ├── non-marketplace/      # Non-marketplace user management
│   ├── permissions/          # Permission management
│   ├── pipeline/             # Pipeline views and management
│   │   ├── tabs/             # Pipeline tab components
│   │   │   └── task-management/ # Task management within pipeline
│   │   └── views/            # Pipeline view variants
│   ├── user-overview/        # User overview panels
│   └── users-table/          # User table components
│
├── ai-command-center/        # AI Command Center UI
├── auth/                     # Authentication components
├── buyer/                    # Buyer profile and detail views
├── buyers/                   # Buyer list and management
├── common/                   # Common/shared components
├── connection/               # Connection request components
├── daily-tasks/              # Daily task management
├── deal-alerts/              # Deal alert components
├── deals/                    # Deal components
├── pandadoc/                 # PandaDoc e-signature components
├── filters/                  # Filter components
│   ├── filter-definitions/   # Filter type definitions
│   └── value-inputs/         # Filter value input components
├── icons/                    # Custom icon components
├── layout/                   # Layout components
├── listing/                  # Listing components
├── listing-detail/           # Listing detail page components
├── marketplace/              # Marketplace components
├── navbar/                   # Navigation bar components
├── onboarding/               # User onboarding flow
├── realtime/                 # Real-time data components
├── remarketing/              # ReMarketing components
│   ├── AIResearchSection/    # AI research panel
│   ├── DealTranscriptSection/ # Deal transcript panel
│   ├── buyer-detail/         # Buyer detail in remarketing
│   ├── csv-import/           # CSV import for remarketing
│   ├── deal-detail/          # Deal detail in remarketing
│   └── transcript/           # Transcript components
├── security/                 # Security components
├── settings/                 # Settings components
├── shared/                   # Shared/reusable components
├── transcripts/              # Transcript components
└── ui/                       # shadcn/ui base components
```

## Key Component Groups

### Highest Priority (business-critical)
- `admin/` — Core admin functionality, deal management, user management
- `ai-command-center/` — AI chatbot interface
- `remarketing/` — ReMarketing pipeline, buyer matching, deal detail
- `marketplace/` — Buyer-facing marketplace

### Data-Heavy (performance-sensitive)
- `admin/analytics/` — Analytics dashboards with charts and real-time data
- `admin/pipeline/` — Pipeline views with drag-and-drop
- `buyers/` — Buyer universe tables with scoring
- `filters/` — Complex filter engine

### Integration Components
- `pandadoc/` — E-signature integration
- `transcripts/` — Fireflies transcript integration
