

## Plan: Add Clay Phone Number Lookup Tool — ✅ COMPLETED

### Summary
Mirrored the existing `clay_find_email` pattern to add a `clay_find_phone` tool that sends LinkedIn URLs to a new Clay phone lookup table and receives results via an inbound webhook. No auth/secret requirements on the webhook endpoint.

### Completed Changes

1. ✅ Database Migration — Added `result_phone TEXT` column to `clay_enrichment_requests`
2. ✅ `clay-client.ts` — Added phone webhook URL + `sendToClayPhone` sender
3. ✅ New edge function: `clay-webhook-phone/index.ts` — No auth, updates `result_phone`, `enriched_contacts.phone`, `contacts.phone`
4. ✅ `config.toml` — Added `[functions.clay-webhook-phone]` with `verify_jwt = false`
5. ✅ `clay-tools.ts` — Added `clayLookupPhone`, `ClayPhoneLookupResult`, `clay_find_phone` tool definition, `clayFindPhone` executor
6. ✅ `integration/index.ts` — Re-exported `clayFindPhone`, `clayLookupPhone`, `ClayPhoneLookupResult`
7. ✅ `integration-action-tools.ts` — Wired `case 'clay_find_phone'`
8. ✅ `tools/index.ts` — Registered in GENERAL, CONTACTS, CONTACT_ENRICHMENT, REMARKETING, GOOGLE_SEARCH categories
9. ✅ `system-prompt.ts` — Added phone lookup guidance
10. ✅ Tested — Inbound webhook deployed and verified working

### Inbound Webhook URL
`https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/clay-webhook-phone`

Configure Clay to POST results to this URL with `request_id` and `phone` fields.
