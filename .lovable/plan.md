

# Make Agreement Emails Work — Upload Documents & Fix References

## Problem
The `request-agreement-email` edge function is deployed and reachable, but the actual document files have never been uploaded to the `agreement-templates` storage bucket. The bucket is empty. Additionally, the code references `NDA.pdf` and `FeeAgreement.pdf`, but the actual documents are DOCX files.

## Changes

### Step 1: Upload DOCX files to Supabase Storage
Upload both provided documents to the `agreement-templates` bucket:
- `SourceCo_Form_Bilateral_NDA_2025_1.docx` → `NDA.docx`
- `SourceCo_Fee_Agreement_Add-On.docx` → `FeeAgreement.docx`

Use a script with the Supabase service role key to upload via the Storage API.

### Step 2: Fix file references in the edge function
**File:** `supabase/functions/request-agreement-email/index.ts` (line 173)

Change:
```
NDA.pdf → NDA.docx
FeeAgreement.pdf → FeeAgreement.docx
```

Update the download button label to say "Download NDA Document" / "Download Fee Agreement Document" instead of implying PDF.

### Step 3: Redeploy the edge function
Deploy `request-agreement-email` so the corrected references take effect.

### Step 4: Verify end-to-end
Test the function via curl to confirm the email sends with the correct download link pointing to the actual DOCX files in storage.

## What Already Works
- Edge function deployed, booted, and reachable
- `agreement-templates` bucket exists and is public
- Brevo API key is configured
- Email sends via `sendViaBervo()` with reply-to `support@sourcecodeals.com`
- Document request tracking in `document_requests` + `firm_agreements` status sync
- Admin notifications on request

## Files Changed
- `supabase/functions/request-agreement-email/index.ts` — `.pdf` → `.docx` references
- Upload 2 DOCX files to `agreement-templates` storage bucket

