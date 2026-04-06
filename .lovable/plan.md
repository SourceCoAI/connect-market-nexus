

# Update Sender Name to "Adam Haile - SourceCo"

## Changes

Two files need updating:

### 1. `supabase/functions/approve-marketplace-buyer/index.ts`
- Line 113: Change `senderName: 'Adam Haile'` → `senderName: 'Adam Haile - SourceCo'`

### 2. `src/components/admin/emails/AdminEmailRouting.tsx`
- Line 58: Change `senderName: 'Adam Haile'` → `senderName: 'Adam Haile - SourceCo'` for the Marketplace Buyer Approved entry

### Deploy
- Redeploy `approve-marketplace-buyer` edge function

