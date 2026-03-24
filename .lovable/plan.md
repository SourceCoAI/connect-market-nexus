

# Fix Enrichment: Switch from Direct Gemini to Lovable AI Gateway

## Root Cause
The enrichment edge functions call the Gemini API directly, which is hitting **429 rate limits**. This means every enrichment attempt fails, and the panel always shows "No enrichment data available."

## Fix
Switch both enrichment functions from direct Gemini API calls to the **Lovable AI Gateway** (`https://ai.gateway.lovable.dev/v1/chat/completions`), which uses `LOVABLE_API_KEY` (already configured) and has separate rate limiting.

### Changes

**File 1: `supabase/functions/enrich-match-tool-lead/index.ts`**

Replace the Gemini API section (lines 87-145) with a Lovable AI Gateway call:
- Use `LOVABLE_API_KEY` instead of `GEMINI_API_KEY`
- Call `https://ai.gateway.lovable.dev/v1/chat/completions` with `google/gemini-2.5-flash` model
- Use tool calling (structured output) instead of `responseMimeType: 'application/json'` for reliable JSON extraction
- Keep the same prompt and same output schema
- Add 429/402 error handling with clear error messages

**File 2: `supabase/functions/ingest-match-tool-lead/index.ts`**

Same change in the inline `enrichLead` function (lines 56-100):
- Switch from direct Gemini to Lovable AI Gateway
- Same structured output approach

### Technical Detail

Replace:
```typescript
const geminiResponse = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
  { ... }
);
```

With:
```typescript
const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [
      { role: 'system', content: 'Extract structured company data. Return JSON only.' },
      { role: 'user', content: prompt }
    ],
    tools: [{ type: 'function', function: { name: 'extract_company', parameters: { ... schema ... } } }],
    tool_choice: { type: 'function', function: { name: 'extract_company' } },
  }),
});
```

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/enrich-match-tool-lead/index.ts` | Switch Gemini → Lovable AI Gateway |
| `supabase/functions/ingest-match-tool-lead/index.ts` | Switch Gemini → Lovable AI Gateway in enrichLead() |

Both functions will be redeployed after changes.

