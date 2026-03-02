

## Redesign: My Deals Page -- Clean, Minimal, High-End

### Current Problems

The My Deals page is cluttered with too many overlapping concerns:
- The ActionHub (navy bar), WhatsNew section, DealNextSteps (inside Overview tab), AND a Documents tab all redundantly show signing status
- Documents tab inside a deal doesn't make sense -- agreements are firm-level, not deal-level
- The Overview tab stacks 4 heavy sections (NextSteps, MetricsCard, ProcessSteps, DetailsCard) creating information overload
- The pipeline progress bar in both the sidebar card AND the detail header is duplicative

### Design Philosophy

Strip everything back to a clean, premium layout. The buyer should land on this page and immediately understand:
1. What deals they have
2. What they need to do (sign documents? wait for review?)
3. Green checkmarks when everything is good

### New Layout

```text
+----------------------------------------------------------------------+
|  My Deals                                                            |
|  Track your active opportunities                                     |
+----------------------------------------------------------------------+
|                                                                      |
|  ACCOUNT STATUS (only if documents need signing)                     |
|  +----------------------------------------------------------------+  |
|  |  [check] NDA           Signed                            [v]   |  |
|  |  [!]     Fee Agreement Ready to sign              [Sign Now]   |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
|  YOUR DEALS                                                          |
|  +------------------+  +------------------------------------------+  |
|  |  Deal Card 1  *  |  |  Deal Title              $1.2M EBITDA   |  |
|  |  Deal Card 2     |  |  Category . Location      [Approved]    |  |
|  |                  |  |                                          |  |
|  |                  |  |  [Overview]  [Messages 2]  [Activity]    |  |
|  |                  |  |                                          |  |
|  |                  |  |  Process Timeline                        |  |
|  |                  |  |  Deal Info                               |  |
|  |                  |  +------------------------------------------+  |
|  +------------------+                                                |
+----------------------------------------------------------------------+
```

### Key Changes

#### 1. Replace ActionHub with a minimal "Account Status" strip

Remove the heavy navy ActionHub bar. Replace with a clean, white card at the top showing only NDA and Fee Agreement status as two rows with:
- Green checkmark + "Signed" when done
- Gold accent + "Sign Now" button when pending
- This is firm-level, shown once at the top, NOT per-deal

**File: `src/pages/MyRequests.tsx`**
- Remove ActionHub import and usage
- Remove WhatsNewSection entirely (redundant noise)
- Add a new inline `AccountStatusBar` component that shows NDA/Fee status with signing capability
- The bar disappears entirely when both documents are signed (clean state)

#### 2. Remove Documents tab from deal detail panel

Documents (NDA, Fee Agreement) are firm-level, not deal-level. They don't belong inside a per-deal tab.

**File: `src/pages/MyRequests.tsx`** (DetailPanel)
- Remove the "Documents" tab trigger and TabsContent
- Keep only 3 tabs: Overview, Messages, Activity Log
- Remove `unreadDocsByDeal` tracking

#### 3. Simplify DealNextSteps to show only deal-specific progress

Remove signing CTAs from DealNextSteps since signing now lives in the Account Status bar at the top. Keep it as a clean read-only progress indicator.

**File: `src/components/deals/DealNextSteps.tsx`**
- Remove the AgreementSigningModal (signing handled by AccountStatusBar)
- Show NDA/Fee as read-only checkmarks (green check = done, gray = not yet)
- Focus on deal-specific steps: Interest Expressed, Documents Signed, Under Review, Deal Memo Available
- Each step is a simple row with icon + label + green check or gray circle
- Much cleaner visual -- no CTAs, no gold accent bars, just status

#### 4. Simplify the sidebar DealPipelineCard

**File: `src/components/deals/DealPipelineCard.tsx`**
- Remove the per-deal CTA button ("Sign NDA" on the card) -- signing is now at the top
- Keep the pipeline progress bar and basic info
- Cleaner, less busy cards

#### 5. Streamline the Overview tab

**File: `src/pages/MyRequests.tsx`** (DetailPanel)
- Remove DealMetricsCard from Overview (the header already shows EBITDA, and the listing link is available)
- Keep: DealNextSteps (simplified), DealProcessSteps, DealDetailsCard
- The Overview becomes much lighter -- just progress + deal info

### Files Changed

| File | Change |
|------|--------|
| `src/pages/MyRequests.tsx` | Replace ActionHub with AccountStatusBar, remove WhatsNew, remove Documents tab, remove DealMetricsCard from Overview |
| `src/components/deals/DealNextSteps.tsx` | Remove signing modal, make read-only progress indicator with clean checkmarks |
| `src/components/deals/DealPipelineCard.tsx` | Remove per-deal CTA button for signing |

### What Stays the Same

- DealDetailHeader (navy header with pipeline stages) -- already clean
- DealProcessSteps (request lifecycle with review/wait/rejection panels) -- essential
- DealDetailsCard (about the opportunity) -- useful context
- DealMessagesTab -- core functionality
- DealActivityLog -- useful reference
- Profile Documents tab -- this is where actual signing lives (per previous work)
- Messages page AgreementSection -- still shows signing prompts there too

### Visual Result

When all documents are signed: The page loads clean with just the deal cards and detail panel. No banners, no action bars, no signing prompts. Pure deal tracking.

When documents need signing: A subtle, elegant status strip appears at the top with clear green checks for signed items and a single "Sign Now" button for unsigned items. One click opens the signing modal.

