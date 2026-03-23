import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GEMINI_API_BASE } from '../_shared/ai-providers.ts';
import { validateUrl, ssrfErrorResponse } from '../_shared/security.ts';
import { encode as base64Encode } from 'https://deno.land/std@0.190.0/encoding/base64.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

const GEMINI_MODEL = 'gemini-2.0-flash';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const _supabase = createClient(supabaseUrl, supabaseKey);

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const { document_url, document_type, tracker_id } = await req.json();

    // SECURITY: Validate document URL to prevent SSRF
    const urlValidation = validateUrl(document_url);
    if (!urlValidation.valid) {
      console.error(`SSRF blocked for document URL: ${document_url} - ${urlValidation.reason}`);
      return ssrfErrorResponse(urlValidation.reason || 'Invalid URL', corsHeaders);
    }

    console.log('[parse-tracker-documents] Processing:', {
      document_type,
      tracker_id,
    });

    // Fetch document content (using validated URL)
    const safeDocumentUrl = urlValidation.normalizedUrl || document_url;
    const docResponse = await fetch(safeDocumentUrl);
    if (!docResponse.ok) {
      throw new Error(`Failed to fetch document: ${docResponse.statusText}`);
    }

    const docBuffer = await docResponse.arrayBuffer();
    const base64Doc = base64Encode(new Uint8Array(docBuffer) as unknown as ArrayBuffer);

    const system_prompt = `You are a document analysis assistant specialized in analyzing M&A documents.

Your task is to extract key information from documents such as:
- Deal memos and investment memorandums
- Investment presentations
- Company profiles
- Deal teaser documents

Extract and structure:
1. Company overview and business description
2. Financial information (revenue, EBITDA, margins)
3. Geographic footprint and locations
4. Services/products offered
5. Growth metrics and trends
6. Key risks and opportunities
7. Target buyer profile hints

Return a JSON object with the extracted information.`;

    const userPrompt =
      'Please analyze this document and extract all relevant M&A intelligence information. Return the extracted data as a structured JSON object.';

    // Use Gemini native endpoint for PDF processing
    const geminiUrl = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: base64Doc,
                },
              },
              {
                text: `${system_prompt}\n\n${userPrompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 300)}`);
    }

    const aiData = await response.json();
    const assistant_message = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    let extracted_data = {};
    try {
      const jsonMatch = assistant_message.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted_data = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('[parse-tracker-documents] Could not parse JSON from response');
      extracted_data = { raw_text: assistant_message };
    }

    console.log('[parse-tracker-documents] Extracted data successfully');

    return new Response(
      JSON.stringify({
        extracted_data,
        raw_response: assistant_message,
        usage: aiData.usageMetadata
          ? {
              input_tokens: aiData.usageMetadata.promptTokenCount || 0,
              output_tokens: aiData.usageMetadata.candidatesTokenCount || 0,
            }
          : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    console.error('[parse-tracker-documents] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
