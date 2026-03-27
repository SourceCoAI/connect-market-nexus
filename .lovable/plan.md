

# Phase 8: Profile System — Deep Links, Password UX & Notification Persistence

## Verified Working (from code audit)
- Profile form saves via `updateUserProfile` → Supabase profiles table update → re-fetches profile
- ProfileDocuments resolves firm via `resolve_user_firm_id` RPC, shows NDA + Fee Agreement status with Sign Now / Download buttons
- ProfileTeamMembers queries `firm_members` joined with profiles
- DealAlertsTab: full CRUD with `useDealAlerts` hook
- ProfileSecurity: password change + account deactivation request
- Connection request gates (all 8) verified across both marketplace card and detail page
- `on_hold` status supported across all deal components

## Issues Found

### Issue 1: Profile `?tab=` Deep Links Are Broken (CRITICAL)

**Evidence**: Two places deep-link to `/profile?tab=documents`:
- `ListingCard.tsx` line 221: fee gate toast action links to `/profile?tab=documents`
- `BuyerNotificationBell.tsx` line 144: `agreement_pending` notifications navigate to `/profile?tab=documents`

**Problem**: `Profile/index.tsx` line 90 uses `<Tabs defaultValue="profile">` — a static default. It never reads `useSearchParams()` to pick up the `?tab=` query parameter. Result: user clicks "Go to Documents" from a notification or toast and lands on the Profile Information tab instead.

**Fix**: In `Profile/index.tsx`:
- Import `useSearchParams` from react-router-dom
- Read `tab` param, use it as initial value for a controlled `Tabs` component
- Update URL when user switches tabs (optional but improves UX)

### Issue 2: Current Password Field Is Collected But Never Verified

**Evidence**: `ProfileSecurity.tsx` renders a "Current Password" input (line 98-108). The value is stored in `passwordData.currentPassword`. However, `handlePasswordChange` in `useProfileData.ts` (line 195) calls `supabase.auth.updateUser({ password: passwordData.newPassword })` without ever verifying the current password.

**Impact**: Low security risk — Supabase's `updateUser` requires a valid session JWT, so an attacker would need the session token anyway. However, the UX is misleading: the user fills in their current password thinking it's being verified, but it's silently ignored.

**Fix**: Two options:
1. **Remove the "Current Password" field** — since Supabase doesn't support server-side current password verification via the client SDK, remove the misleading field
2. **Add re-authentication** — call `supabase.auth.signInWithPassword()` first to verify the current password before calling `updateUser`

Recommendation: Option 2 (verify current password via `signInWithPassword` before allowing the update). This is the secure approach.

### Issue 3: Notification Preferences Are localStorage-Only

**Evidence**: `Profile/index.tsx` lines 52-76 — notification preferences (email frequency, connection updates, message alerts, platform announcements) are stored exclusively in `localStorage`. They are never persisted to the database.

**Impact**: 
- Preferences are lost when user switches devices or clears browser data
- Backend email systems can't read these preferences — they'll send notifications regardless of user settings
- The UI gives false confidence that preferences are being respected

**Fix**: This is a known limitation but not urgent. For now, add a small disclaimer text below the Save button: "Preferences are saved locally to this browser." Long-term: persist to a `notification_preferences` table.

### Issue 4: Notification Preferences Not Server-Enforced

Related to Issue 3 — even if we persist preferences to the database, the email notification edge functions (`send-connection-notification`, etc.) don't check user preferences before sending. This is a backend gap that should be noted but is out of scope for this phase.

## Plan

### File 1: `src/pages/Profile/index.tsx`
- Import `useSearchParams` from `react-router-dom`
- Read `?tab=` param to set initial tab value
- Make `Tabs` controlled with `value` + `onValueChange`
- Update URL search params when tab changes

### File 2: `src/pages/Profile/useProfileData.ts`
- In `handlePasswordChange`: before calling `updateUser`, call `supabase.auth.signInWithPassword({ email: user.email, password: passwordData.currentPassword })` to verify the current password
- If verification fails, set `passwordError` to "Current password is incorrect" and return early

### File 3: `src/pages/Profile/index.tsx` (notifications section)
- Add small muted text below Save button: "Preferences are saved locally to this browser and may not affect all email notifications."

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Profile/index.tsx` | Add `useSearchParams` for tab deep-linking; add localStorage disclaimer to notifications |
| `src/pages/Profile/useProfileData.ts` | Verify current password via `signInWithPassword` before allowing password change |

