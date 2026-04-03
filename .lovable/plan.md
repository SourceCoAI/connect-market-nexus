

# Email Catalog Refinement: Ultra-Premium Polish Pass

## Current State

The catalog is clean (no em dashes, no emojis, no borders, correct brand palette). But it's not yet at Apple/Stripe level. Several patterns create visual heaviness and corporate filler that undermine the premium feel.

## Issues Found

### 1. Stacked grey boxes create visual heaviness (~12 emails)
Many emails chain `infoBox()` + `detailBox()` back-to-back, creating two grey `#F7F6F3` blocks in a row. This looks boxy and cluttered. Apple emails never stack tinted sections. The fix: consolidate into a single block, or replace the `infoBox` with a plain text sentence and keep only one grey block for structured data.

Affected: Connection Admin Notification, Deal Alert, New Deal Owner Assigned, Deal Reassignment, Owner Inquiry, Owner Intro, Enhanced Admin Notification, Task Notification, Admin New Message, Journey Admin New User, Journey User Created, Journey Email Verified, Journey Profile Approved.

### 2. Corporate filler copy (~8 instances)
Phrases like "In the meantime, feel free to explore other opportunities" and "Our team will review your application and get back to you shortly" are generic padding. Premium emails say what needs to be said and stop. Every sentence should carry information.

### 3. Inconsistent sign-offs
Some emails end with "Best regards, The SourceCo Team" and others just end with a CTA. Should standardize: external-facing emails (to Buyers/Users) get a brief sign-off; internal admin notifications do not.

### 4. Preview wrapper missing outer background
Production emails render on `#FAFAF8` background. The preview wrapper uses only `#FFFFFF`, making previews look different from production. Adding the warm off-white outer background would make previews match reality.

### 5. Quotation marks around message excerpts
The Messaging category emails wrap excerpts in typographic quotes (`"Hi Jane..."`). This adds unnecessary decoration. The grey background already signals it's a quote.

### 6. Some preview headings use larger font-size
Deal Referral has `font-size: 17px` and User Notification has a pseudo-heading at `font-size: 15px`. These should be regular body text to maintain the letter-like feel.

## Plan

### Single file: `src/components/admin/emails/EmailCatalog.tsx`

1. **Add outer background to wrapper**: Wrap the preview in a `#FAFAF8` container so it matches production rendering.

2. **Eliminate stacked grey boxes**: For every email that chains `infoBox` + `detailBox`, merge into a single block or convert the `infoBox` to plain text. No two grey boxes should appear consecutively.

3. **Tighten copy**: Remove filler phrases. Every sentence must convey new information. Cut "In the meantime" and "feel free to" patterns. Shorten where possible.

4. **Standardize sign-offs**: User/Buyer-facing emails get a simple closing line. Admin notifications do not.

5. **Remove decorative quotes**: Strip `"..."` wrapping from message excerpts in Messaging emails.

6. **Normalize font sizes**: Remove `font-size: 17px` and any pseudo-heading styling from body content. All body text is `15px` (inherited from wrapper).

7. **Simplify Feedback Notification**: Remove the nested white `#FFFFFF` div inside the `#F7F6F3` detail box (line 409). This creates a box-within-a-box.

### No edge function changes needed.

