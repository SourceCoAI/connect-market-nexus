

# Fix Welcome + Email Verified Emails: Accurate Process Copy

## Problems

### Email 1: Welcome (user_created)
- Says "sign a single NDA that unlocks your access" then mentions fee agreement as a secondary thing "before your first introduction" - buries it
- Says "verify your email address using the link we just sent you" but this email now arrives 60 seconds AFTER signup, so the verification email has already been sent separately
- The "What you are applying for" section is fine but the document signing copy needs to match reality: both NDA + Fee Agreement are sent together

### Email 2: Email Verified
- Lists only NDA signing. Completely omits Fee Agreement
- Says "Full access to browse every deal in the pipeline immediately after" NDA - misleading. Fee Agreement is required for data rooms and connection requests
- Says "While you wait, log in and complete your profile" - this is NOT possible while pending approval. The user sees the pending approval screen, not their profile
- The "Log In" CTA is pointless since they can't do anything after logging in except see the pending screen

## Updated Copy

### Email 1: Welcome (subject: "Your application to SourceCo is in.")

```
Hi [Name],

Your application is in. Our team will review it and you will hear from us
by email the moment you are approved, typically within a few hours.

While you wait, verify your email address using the link we sent you.
If you have already verified, sit tight. A team member is reviewing your
profile now.

What happens when you are approved

1. We send you two documents to sign: an NDA and a Fee Agreement.
   Both are standard, take about 60 seconds each.
2. Once signed, you get full access to the deal pipeline, including
   confidential business details, financials, and direct introductions.

The NDA protects the information we share with you. The Fee Agreement
only applies if you close a deal sourced through SourceCo. No upfront cost.

Questions? Reply to this email.

The SourceCo Team
```

Changes: Removed "What you are applying for" fluff paragraph. Replaced with concrete numbered steps. Made both documents equally prominent. Removed misleading "single NDA unlocks access" framing.

### Email 2: Email Verified (subject: "Email confirmed. You are in the queue.")

```
Hi [Name],

Your email is confirmed. Your application is now with our team.

We review applications same day during business hours. You will get an
email the moment you are approved, typically within a few hours, never
more than one business day.

What happens next

1. Our team reviews and approves your profile.
2. You sign two documents: an NDA and a Fee Agreement. Both are
   standard, sent to your email, 60 seconds each.
3. Full access to the deal pipeline: confidential details, financials,
   and direct introductions to founders.

Nothing for you to do right now. We will email you the moment you
are cleared.

The SourceCo Team
```

Changes: Removed the bullet list that only mentioned NDA. Removed "log in and complete your profile" (not possible). Removed "Log In" CTA button (nothing to do there). Added "Nothing for you to do right now" for clarity. Made both documents equally visible.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/user-journey-notifications/index.ts` | Rewrite `buildWelcomeHtml` and `buildEmailVerifiedHtml` with corrected copy. Remove Log In CTA from email verified. |
| `src/pages/admin/EmailTestCentre.tsx` | Update preview HTML for emails e02 (welcome) and e03 (email verified) to match |

## Post-Change

Edge function `user-journey-notifications` must be redeployed.

