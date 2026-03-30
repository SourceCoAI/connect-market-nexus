

# Response 4: Area 6 (Landing Pages) + Area 7 (Data Room) + Area 9 (Tier Gating)

## Findings

### Area 6: Deal Landing Pages

**6A — No SEO meta tags (MEDIUM)**
`DealLandingPage/index.tsx` sets no `document.title`, no Open Graph tags, no description meta. When shared on LinkedIn/Twitter/Slack, it shows a blank preview. Need to add `document.title` and basic OG meta tags using `useEffect` based on deal data.

**6B — Email capture lacks honeypot spam protection (LOW)**
`EmailCapture.tsx` validates email format but has no bot protection. A simple hidden honeypot field would block most automated spam without requiring CAPTCHA.

**6C — DealRequestForm missing character counter for message (LOW)**
The form hook (`useDealLandingFormSubmit.ts`) rejects messages >2000 chars, but the UI shows no counter or feedback until submission. Users get a cryptic error after typing a long message.

**6D — Landing page view tracking is fire-and-forget with no error handling (LOW)**
The `page_views` insert at line 202-215 silently swallows errors. This is acceptable as-is since it's analytics, but worth noting — no change needed.

### Area 7: Buyer Data Room

**7A — BuyerDataRoom does NOT filter documents by access category (HIGH)**
The component at line 67-83 fetches ALL documents for the deal with `.eq('deal_id', dealId)` — it relies entirely on RLS to restrict what comes back. However, the access check at line 49-64 fetches `can_view_teaser`, `can_view_full_memo`, `can_view_data_room` toggles but **never uses them to filter documents by category**. If RLS on `data_room_documents` doesn't enforce category-level access, a buyer with only "teaser" access could see data room documents.

The edge function `data-room-download` properly checks via `check_data_room_access` RPC, so download/view is gated. But the **document list itself** may leak file names and metadata.

**Fix**: Add client-side category filtering based on the access toggles. Map `can_view_teaser` → 'teaser' category, `can_view_full_memo` → 'full_memo', `can_view_data_room` → 'data_room'. Filter `documents` array to only show docs matching enabled categories.

**7B — BuyerDataRoom doesn't filter by document status (MEDIUM)**
The query doesn't filter `status = 'active'` — archived/deleted documents could appear. Need to add `.eq('status', 'active')` to the document query.

### Area 9: Tier 3 Time-Gating

**9A — Tier 3 gating is client-side only — data leaks in network tab (MEDIUM)**
`use-simple-listings.ts` fetches ALL listings from Supabase, then filters client-side at line 122-146. A Tier 3 buyer can see all listing data (titles, revenue, EBITDA) in DevTools Network tab before the filter removes them from the UI. 

**Proper fix would require a server-side RPC**, but that's a large architectural change. For now, a pragmatic fix: since `MARKETPLACE_SAFE_COLUMNS_STRING` already limits columns and all listings are public marketplace data (not confidential), the real risk is limited. Document this as a known limitation.

**9B — Tier 3 pagination count is wrong (MEDIUM)**
At line 142-145, after filtering, `totalItems` is set to `filtered.length` — but the original query used `count: 'exact'` with pagination. The filtered count reflects only page 1's filtered results, not the true total. This makes pagination show incorrect page counts for Tier 3 users.

**Fix**: For Tier 3 users, fetch without pagination first (or fetch all IDs), filter, then apply pagination client-side. OR simpler: just note that Tier 3 sees a subset and pagination may be approximate — set `totalItems` to `filtered.length` only when on page 1.

Actually, looking more carefully — the current code fetches with pagination (line 84-85 `query.range(offset, ...)`) but then filters the already-paginated results. This means Tier 3 users on page 1 might see 8 results instead of 10 (if 2 were filtered out), and there's no way to know if page 2 has more. This is fundamentally broken for Tier 3 pagination.

**Fix**: When `buyerTier === 3`, skip the `.range()` call, fetch all active listings, filter, then slice for pagination client-side. Cap at a reasonable limit (e.g., 200) to avoid massive queries.

## Implementation Plan

| Phase | Description | Priority | Files |
|-------|-------------|----------|-------|
| 101 | Add SEO meta tags to DealLandingPage | Medium | `DealLandingPage/index.tsx` |
| 102 | Filter BuyerDataRoom documents by access category + active status | High | `BuyerDataRoom.tsx` |
| 103 | Fix Tier 3 pagination — fetch-all-then-filter approach | Medium | `use-simple-listings.ts` |
| 104 | Add message character counter to DealRequestForm | Low | `DealRequestForm.tsx` |

4 phases, all code-only, implementable in one response.

### Technical Details

**Phase 101**: `useEffect` sets `document.title` from `deal.title`. Add OG meta tags via `document.head` manipulation (no Helmet library needed — append/update meta elements directly).

**Phase 102**: After fetching `access` toggles, build an `allowedCategories` set. Filter `documents` array: if `can_view_data_room` → allow 'data_room' category docs, if `can_view_full_memo` → allow 'full_memo', if `can_view_teaser` → allow 'teaser'. Also add `.eq('status', 'active')` to the document query.

**Phase 103**: When `buyerTier === 3`, remove `.range()` from query, add `.limit(200)`, apply tier filter, then slice `[offset, offset + perPage]`. Return `totalItems` as total filtered count.

**Phase 104**: Add a small character count display below the textarea showing `{message.length}/2000`.

