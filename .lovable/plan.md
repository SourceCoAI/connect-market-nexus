

# Root Cause: Missing Database Columns

## The Problem

The `firm_agreements` table does **not** have these PandaDoc-specific columns that the edge functions reference:
- `nda_pandadoc_document_id`
- `nda_pandadoc_status`
- `fee_pandadoc_document_id`
- `fee_pandadoc_status`

When `get-buyer-nda-embed` runs this query (line 147):
```sql
SELECT id, nda_signed, nda_pandadoc_document_id, nda_pandadoc_status
FROM firm_agreements WHERE id = '...'
```
PostgREST silently returns `null` because the columns don't exist. The function then hits `if (!firm)` → returns `{ hasFirm: false }` → frontend shows "Your account hasn't been set up for signing yet."

The same issue affects `get-buyer-fee-embed` and `confirm-agreement-signed` (which queries `nda_pandadoc_document_id` / `fee_pandadoc_document_id`).

## What the User Should See

After clicking "Sign NDA Now", they should see the PandaDoc embedded signing form inside the modal — not an error.

## Fix

### 1. Add the missing columns to `firm_agreements`

Run migration to add:
- `nda_pandadoc_document_id` (text, nullable)
- `nda_pandadoc_status` (text, nullable)
- `fee_pandadoc_document_id` (text, nullable)
- `fee_pandadoc_status` (text, nullable)

### 2. Redeploy all affected edge functions

After the schema change, redeploy:
- `get-buyer-nda-embed`
- `get-buyer-fee-embed`
- `confirm-agreement-signed`

No code changes needed — the edge function code is already correct, it just references columns that don't exist yet.

### Impact

| File/Component | Change |
|---|---|
| Database: `firm_agreements` table | Add 4 PandaDoc columns via SQL migration |
| `get-buyer-nda-embed` | Redeploy (no code change) |
| `get-buyer-fee-embed` | Redeploy (no code change) |
| `confirm-agreement-signed` | Redeploy (no code change) |
| `pandadoc-webhook-handler` | Likely also references these columns — verify and redeploy |

