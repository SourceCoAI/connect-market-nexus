

## Deploy Edge Functions: seed-buyers + score-deal-buyers

### What

Deploy two edge functions to production:

1. **`seed-buyers`** -- Recently updated to use Claude Opus instead of Sonnet, with increased timeout (90s) and token limits (8192)
2. **`score-deal-buyers`** -- Algorithmic buyer-deal scoring (no AI model changes, deploy as-is)

### Action

Use the Supabase deploy tool to deploy both functions in a single operation. No code changes needed -- just deployment of the current code.

### Files Deployed

| Function | Key Config |
|----------|-----------|
| `supabase/functions/seed-buyers/index.ts` | `verify_jwt = false` (in config.toml) |
| `supabase/functions/score-deal-buyers/index.ts` | `verify_jwt = false` (in config.toml) |

