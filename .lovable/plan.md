

# Switch Enrichment from Lovable AI Gateway to OpenAI Direct

## What Changes

Both enrichment functions currently use the Lovable AI Gateway with `google/gemini-2.5-flash`. Switch to direct OpenAI API calls using the existing `OPENAI_API_KEY` secret.

### File 1: `supabase/functions/enrich-match-tool-lead/index.ts`

- Replace `LOVABLE_API_KEY` check with `OPENAI_API_KEY` check
- Change fetch URL from `https://ai.gateway.lovable.dev/v1/chat/completions` to `https://api.openai.com/v1/chat/completions`
- Change auth header to `Bearer ${OPENAI_API_KEY}`
- Change model from `google/gemini-2.5-flash` to `gpt-4o-mini` (fast, cheap, great at structured extraction)
- Keep tool calling schema identical (OpenAI native format)
- Update error messages to reference OpenAI

### File 2: `supabase/functions/ingest-match-tool-lead/index.ts`

Same changes in the inline `enrichLead()` function (lines 78-112):
- `LOVABLE_API_KEY` → `OPENAI_API_KEY`
- Gateway URL → `https://api.openai.com/v1/chat/completions`
- Model → `gpt-4o-mini`

### No other changes needed
- `OPENAI_API_KEY` is already configured as a secret
- The tool calling format is identical (OpenAI invented it)
- Response parsing stays the same (`choices[0].message.tool_calls[0].function.arguments`)

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/enrich-match-tool-lead/index.ts` | Switch AI provider to OpenAI |
| `supabase/functions/ingest-match-tool-lead/index.ts` | Switch AI provider to OpenAI in enrichLead() |

Both functions will be redeployed.

