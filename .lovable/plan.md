

## Fix and Complete Email Notification System

### Problem
Several email notifications are broken or missing entirely:
1. **`user-journey-notifications`** edge function exists but is **never called** from the frontend -- welcome emails, email verification, profile approval/rejection emails are all dead
2. **`notify-buyer-rejection`** and **`send-approval-email`** are missing from `config.toml` -- they default to `verify_jwt = true` and will fail when invoked from the frontend
3. No dedicated "connection request approved" email to the buyer (only a generic message notification fires)
4. No "new user registered" admin notification
5. No "document signed" notification (NDA/Fee Agreement)

### Existing Working Notifications
These are wired and functional:
- Connection request submitted: buyer confirmation + admin notification (`send-connection-notification`)
- New message: buyer notified when admin replies (`notify-buyer-new-message`)
- New message: admins notified when buyer sends message (`notify-admin-new-message`)

### Complete Notification Matrix After Fix

| Event | Who Gets Notified | Edge Function | Status |
|-------|-------------------|---------------|--------|
| User registers | User (welcome) | `user-journey-notifications` | Fix: wire to signup |
| Email verified | User (confirmation) | `user-journey-notifications` | Fix: wire to verification |
| Profile approved by admin | User (approved email) | `user-journey-notifications` | Fix: wire to approval flow |
| Profile rejected by admin | User (rejection email) | `user-journey-notifications` | Fix: wire to rejection flow |
| New user registers | All admins | `user-journey-notifications` | NEW: add admin notification |
| Connection request submitted | User (confirmation) | `send-connection-notification` | Working |
| Connection request submitted | All admins | `send-connection-notification` | Working |
| Connection approved | User (approved email) | `notify-buyer-new-message` | Fix: send dedicated approval email |
| Connection rejected | User (rejection email) | `notify-buyer-rejection` | Fix: add to config.toml |
| Message sent by buyer | All admins | `notify-admin-new-message` | Working |
| Message sent by admin | Buyer | `notify-buyer-new-message` | Working |
| Document signed (NDA/Fee) | All admins | `notify-admin-new-message` | NEW: dedicated notification |

### Implementation Plan

#### Phase 1: Fix config.toml (critical -- unblocks existing functions)

**File: `supabase/config.toml`**
- Add `notify-buyer-rejection` with `verify_jwt = false`
- Add `send-approval-email` with `verify_jwt = false`

#### Phase 2: Wire `user-journey-notifications` to frontend

**File: `src/hooks/useAuth.ts` (or signup flow)**
- After successful signup, invoke `user-journey-notifications` with `event_type: 'user_created'`

**File: `src/pages/VerificationSuccess.tsx` (or email verification handler)**
- After email verification confirmed, invoke with `event_type: 'email_verified'`

**File: `src/hooks/admin/requests/use-lead-status-updates.ts` or equivalent admin approval action**
- When admin approves a user profile, invoke with `event_type: 'profile_approved'`
- When admin rejects, invoke with `event_type: 'profile_rejected'`

#### Phase 3: Add admin notification for new user registrations

**File: `supabase/functions/user-journey-notifications/index.ts`**
- In the `user_created` event handler, after sending welcome email to user, also notify all admins
- Build a simple admin notification HTML: "New User Registration: [name] ([email])"
- Look up admin emails via `user_roles` table (same pattern as `notify-admin-new-message`)

#### Phase 4: Add dedicated connection approval email

**File: `src/components/admin/connection-request-actions/useConnectionRequestActions.ts`**
- In `handleAccept`, after approving the request, invoke `send-connection-notification` with a new type `'approval_notification'` or invoke `send-user-notification` with connection-approved type

**File: `supabase/functions/send-connection-notification/index.ts`**
- Add a third type handler: `'approval_notification'`
- Build branded HTML: "Your connection request for [listing] has been approved. Log in to view deal details."
- Include CTA button linking to the buyer's messages/deal view

#### Phase 5: Add document signed notification to admins

**File: `supabase/functions/confirm-agreement-signed/index.ts`** (or docuseal webhook handler)
- After successfully recording a document signature, notify all admins
- Use `sendViaBervo` directly with a simple branded HTML: "[Buyer Name] signed [NDA/Fee Agreement] for [Deal Title]"

### Technical Details

**Files to modify:**

| File | Change |
|------|--------|
| `supabase/config.toml` | Add 2 missing function entries |
| `supabase/functions/user-journey-notifications/index.ts` | Add admin notification on `user_created` |
| `supabase/functions/send-connection-notification/index.ts` | Add `approval_notification` type |
| `src/hooks/useAuth.ts` or signup hook | Wire `user_created` event |
| `src/pages/VerificationSuccess.tsx` or verification handler | Wire `email_verified` event |
| Admin approval/rejection hooks | Wire `profile_approved`/`profile_rejected` events |
| `src/components/admin/connection-request-actions/useConnectionRequestActions.ts` | Add approval email in `handleAccept` |
| `supabase/functions/confirm-agreement-signed/index.ts` | Add admin notification on document signed |

### What This Fixes
- Welcome emails will actually send when users sign up
- Email verification confirmation emails will send
- Profile approval/rejection emails will send
- Admin notification on new user registration
- Connection approval gets a dedicated branded email (not just a message notification)
- `notify-buyer-rejection` stops silently failing (config.toml fix)
- `send-approval-email` stops silently failing (config.toml fix)
- Document signature triggers admin notification
- All notifications use the shared `sendViaBervo` with retry logic and `logEmailDelivery` for audit trail
