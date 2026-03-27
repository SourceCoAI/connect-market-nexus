

# Phase 9: Document Signing Flow, Notifications & Messaging Audit

## Verified Working (Phases 1-8)
- Connection request gates (profile, fee, buyer type, NDA) across cards and detail pages
- `on_hold` status across all deal components
- Profile tab deep-linking via `?tab=`
- Password verification via `signInWithPassword`
- Agreement RPC resilience (404/400 safe defaults)
- Session heartbeat delay
- Realtime sync for firm_agreements changes

## Issues Found

### Issue 1: ProfileDocuments "Sign Now" Missing for Not-Sent Documents (MEDIUM)

**Evidence**: `ProfileDocuments.tsx` line 241: `!doc.signed && doc.hasSubmission` gates the "Sign Now" button. `hasSubmission` is `!!firm.nda_pandadoc_document_id` (line 86). For firms where no PandaDoc document has been created yet, `hasSubmission` is false, and no button renders at all — just blank space.

**Problem**: The memory notes state "Unsigned documents show 'Sign Now' CTAs even in 'pending' or 'not_sent' states." The edge functions `get-buyer-nda-embed` and `get-buyer-fee-embed` create documents on-demand, so "Sign Now" should always be available for unsigned documents.

**Fix**: In `ProfileDocuments.tsx`, show "Sign Now" for any unsigned document regardless of `hasSubmission`. Keep the "Ready to Sign" vs "Not Sent" badge distinction for informational purposes, but always render the button.

### Issue 2: ProfileDocuments Shows "Processing..." for Signed Docs Without URL (LOW)

**Evidence**: Line 250-251: when `doc.signed` is true but `doc.documentUrl` doesn't start with `https://`, it shows "Processing..." text. This could persist indefinitely if the signed URL is never populated (e.g., if PandaDoc webhook fails to deliver the URL).

**Fix**: Change "Processing..." to a "Download" button that invokes `get-agreement-document` edge function on-demand (same pattern as the signing modal's download button), rather than relying on a pre-cached URL.

### Issue 3: Admin Notification Bell Missing Document Signing Types (MEDIUM)

**Evidence**: `AdminNotificationBell.tsx` `getNotificationIcon` (line 27-38) only handles `task_assigned`, `task_completed`, and `remarketing_a_tier_match`. The `confirm-agreement-signed` edge function creates admin notifications with type `document_completed` (line 514), but this type has no icon case — it falls through to the default bell icon.

Additionally, `handleNotificationClick` (line 40-82) only handles notifications with `action_url` by navigating to the pipeline. Document signing notifications have no `action_url` set, so clicking them does nothing.

**Fix**: 
- Add `document_completed` and `document_signing_requested` cases to `getNotificationIcon` (use FileSignature or CheckCircle icons)
- Add click handler for document notifications to navigate to `/admin/documents`

### Issue 4: Admin Notification Bell Only Shows Unread Then 5 Read (COSMETIC)

**Evidence**: Line 198-229: read notifications are sliced to 5. Combined with unread shown above, the total visible is limited. The "View all notifications" link goes to `/admin/settings/notifications` — need to verify this route exists.

**Fix**: Not critical but worth noting. Verify `/admin/settings/notifications` route exists.

---

## Plan

### File 1: `src/pages/Profile/ProfileDocuments.tsx`
- Change line 241 condition from `!doc.signed && doc.hasSubmission` to `!doc.signed` — always show "Sign Now" for unsigned documents
- Replace the "Processing..." fallback (line 250-251) with a "Download" button that calls `get-agreement-document` edge function on-demand

### File 2: `src/components/admin/AdminNotificationBell.tsx`
- Add `document_completed` and `document_signing_requested` icon cases in `getNotificationIcon`
- Add navigation to `/admin/documents` for document-type notifications in `handleNotificationClick`

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Profile/ProfileDocuments.tsx` | Show "Sign Now" for all unsigned docs; replace "Processing..." with on-demand download |
| `src/components/admin/AdminNotificationBell.tsx` | Add document notification icon cases and click-to-navigate handler |

