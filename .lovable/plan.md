

# Connect Deal Match AI to Marketplace — Implementation Instructions

## What's Already Done (This Project)
- `match_tool_leads` table with `merge_match_tool_lead` RPC (deduplicates by website)
- `ingest-match-tool-lead` Edge Function deployed and tested
- Match Tool Leads admin page at `/admin/remarketing/leads/match-tool`

## What Needs to Happen in the Deal Match AI Project

The Deal Match AI project has 3 stages managed in `src/pages/Index.tsx`:
1. **Hero** — user enters website → transitions to form
2. **FinancialDataForm** — user picks revenue + profit → transitions to analysis
3. **LeadCaptureModal** — user submits name/email/phone/timeline

### Changes Required (3 files + 1 new utility)

**File 1: Create `src/lib/sync-to-marketplace.ts`**

A single reusable helper function:

```typescript
export const syncToMarketplace = (data: Record<string, unknown>) => {
  fetch('https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/ingest-match-tool-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, source: 'deal-match-ai' }),
  }).catch(() => {});
};
```

**File 2: `src/components/Hero.tsx` — line 19, after `trackEvent`**

Add:
```typescript
import { syncToMarketplace } from '@/lib/sync-to-marketplace';
// ...
// Inside handleSubmit, after trackEvent line:
syncToMarketplace({ website: website.trim() });
```

**File 3: `src/components/FinancialDataForm.tsx` — line 21, after `trackEvent`**

Add:
```typescript
import { syncToMarketplace } from '@/lib/sync-to-marketplace';
// ...
// Inside handleSubmit, after trackEvent line:
syncToMarketplace({ website, revenue, profit });
```

**File 4: `src/components/LeadCaptureModal.tsx` — line 44, after the successful insert**

Add:
```typescript
import { syncToMarketplace } from '@/lib/sync-to-marketplace';
// ...
// Inside handleSubmit, after the successful supabase insert (after line 43, before trackEvent):
syncToMarketplace({
  website: businessData.website,
  revenue: businessData.revenue,
  profit: businessData.profit,
  full_name: formData.fullName,
  email: formData.email,
  phone: formData.phone,
  timeline: formData.timeline,
});
```

---

## Summary for Copy-Paste to the Other Project

Give the Deal Match AI project exactly this prompt:

> **Create a new file `src/lib/sync-to-marketplace.ts`** with a fire-and-forget helper that POSTs to `https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/ingest-match-tool-lead`. Then call it at 3 points:
>
> 1. **`Hero.tsx` handleSubmit** (line 19) — call `syncToMarketplace({ website: website.trim() })` after `trackEvent`
> 2. **`FinancialDataForm.tsx` handleSubmit** (line 21) — call `syncToMarketplace({ website, revenue, profit })` after `trackEvent`
> 3. **`LeadCaptureModal.tsx` handleSubmit** (after line 43, inside the try block after the successful supabase insert) — call `syncToMarketplace({ website: businessData.website, revenue: businessData.revenue, profit: businessData.profit, full_name: formData.fullName, email: formData.email, phone: formData.phone, timeline: formData.timeline })`
>
> The helper:
> ```typescript
> export const syncToMarketplace = (data: Record<string, unknown>) => {
>   fetch('https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/ingest-match-tool-lead', {
>     method: 'POST',
>     headers: { 'Content-Type': 'application/json' },
>     body: JSON.stringify({ ...data, source: 'deal-match-ai' }),
>   }).catch(() => {});
> };
> ```
>
> This is fire-and-forget — no await, no error handling needed. The receiving endpoint deduplicates by website URL and progressively enriches the lead record. Do not modify any existing behavior — just add the sync call after each stage's existing logic.

No changes are needed on this project's side. Everything is already deployed and ready to receive.

