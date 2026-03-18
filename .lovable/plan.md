

# Plan: Test Smartlead API Lead Lookup

## Goal
Create a temporary test edge function that calls the Smartlead API with real data from your account, logs the full response, and returns it so we can inspect all available fields before committing to a schema.

## What We'll Do

### 1. Create `smartlead-test-lead-lookup` edge function
A lightweight, no-auth function that:
- Takes a `campaign_id` and `lead_id` (or `email`) as input
- Calls two Smartlead API endpoints using the existing `smartlead-client.ts`:
  - `GET /campaigns/{campaign_id}/leads/{lead_id}` — single lead detail
  - `GET /campaigns/{campaign_id}/leads?limit=1` — list endpoint (may return different fields)
- Returns the raw JSON responses so we can see every field

We'll test with these real records from your inbox:
- Campaign `1654146`, Lead `3174912111` (danm@diygaragedoor.com)
- Campaign `2842565`, Lead `3260647508` (management@unifursity.com)

### 2. Add to config.toml
```toml
[functions.smartlead-test-lead-lookup]
verify_jwt = false
```

### 3. Deploy, call, and review
After deploying, we'll invoke the function, capture the full response, and review which fields Smartlead returns (company, website, LinkedIn, phone, custom fields, etc.).

### 4. Clean up
Delete the test function after we've captured the results.

## Technical Details
- Uses the existing `smartleadRequest` helper from `_shared/smartlead-client.ts` — no new API key setup needed.
- No database changes yet — this is purely a read-only API probe.
- The function will be temporary (created, tested, then deleted).

