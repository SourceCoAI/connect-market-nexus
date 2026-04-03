

# Email Catalog — Completeness & Accuracy Audit Results

## Current State

The catalog has **42 email entries** across 8 categories. After auditing all 33 email-sending edge functions against the catalog:

### What's Accurate
- All 33 email-sending edge functions are represented
- Subject lines are correct for all entries
- Edge function names are correct
- Variant labels properly distinguish multi-type functions (connection notification x3, journey x5, templated approval x2, agreement x2)
- Preview HTML renders the branded SourceCo wrapper with representative content

### What's Missing or Could Be Improved

1. **`admin-digest` email is missing** — sends `[Type] Admin Digest - SourceCo Marketplace` to admins. BUT it calls the deleted `enhanced-email-delivery` function, so it's currently **broken**. Should be added with a "BROKEN" status indicator.

2. **Feedback notification subject could be more precise** — catalog says `[Emoji] New Feedback: [Category]`, actual code is `${priorityEmoji} New Feedback: ${categoryLabel} (URGENT)` (conditional URGENT suffix). Minor but imprecise.

3. **No status indicator for broken/deprecated emails** — `admin-digest` is broken (calls deleted function). The catalog should indicate this.

4. **Preview HTML is representative but generic** — the previews show the right layout structure (branded header, info boxes, CTA buttons, detail tables) but use placeholder content. The actual edge function code has more specific HTML in many cases. The previews could be made more faithful to the real templates by reading the actual `wrapEmailHtml` calls.

5. **No "copy subject line" or "copy function name" quick actions** — useful for admin reference.

6. **Sender identity not shown** — every email goes from `adam.haile@sourcecodeals.com` but this isn't displayed anywhere in the catalog.

## Plan

### Step 1: Add missing `admin-digest` entry with broken status
Add a `status` field to the `CatalogEmail` interface (`'active' | 'broken' | 'deprecated'`). Add the admin-digest entry with `status: 'broken'` and a note explaining it calls the deleted `enhanced-email-delivery` function. Show a red badge for broken emails.

### Step 2: Fix feedback notification subject precision
Change from `[Emoji] New Feedback: [Category]` to `${priorityEmoji} New Feedback: [Category] (URGENT if urgent)`.

### Step 3: Add sender identity display
Show `From: adam.haile@sourcecodeals.com` at the top of the catalog as a reference, and in the preview modal.

### Step 4: Add copy-to-clipboard on subject lines and function names
Click on a subject line or function name to copy it.

### Files changed
- `src/components/admin/emails/EmailCatalog.tsx` — add status field, admin-digest entry, sender display, copy actions, fix feedback subject

