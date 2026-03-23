import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { callGeminiWithTool, callGeminiWithRetry, DEFAULT_GEMINI_MODEL, GEMINI_API_URL, getGeminiHeaders } from "../_shared/ai-providers.ts";

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

interface DocumentExtractionRequest {
  universe_id: string;
  document_url: string;
  document_name: string;
  industry_name?: string;
}

interface DocumentContent {
  text?: string;
  base64?: string;
  mimeType?: string;
}

/**
 * Extract content from uploaded documents (PDF, DOCX, text, etc.)
 * Returns either text for text files, or base64 + mimeType for binary docs.
 */
async function extractDocumentContent(documentUrl: string): Promise<DocumentContent> {
  console.log(`[DOCUMENT_FETCH] Downloading from storage: "${documentUrl}"`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Decode in case the path was URL-encoded
  const storagePath = decodeURIComponent(documentUrl);
  console.log(`[DOCUMENT_FETCH] Resolved path: "${storagePath}"`);

  const { data, error } = await supabase.storage
    .from('universe-documents')
    .download(storagePath);

  if (error || !data) {
    const errName = (error as { name?: string })?.name || 'Unknown';
    const errMsg = error?.message || (error as { statusCode?: string })?.statusCode || JSON.stringify(error);
    console.error(`[DOCUMENT_FETCH] Storage error (${errName}):`, JSON.stringify(error));
    throw new Error(`Failed to download document from path "${storagePath}": ${errName} - ${errMsg}. The file may not exist in storage — please re-upload.`);
  }

  const buffer = await data.arrayBuffer();
  const ext = storagePath.split('.').pop()?.toLowerCase() || '';
  console.log(`[DOCUMENT_FETCH] Downloaded ${buffer.byteLength} bytes, ext="${ext}"`);

  // For binary document formats, return as base64 for Gemini native processing
  const binaryFormats = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'];
  if (binaryFormats.includes(ext)) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ppt: 'application/vnd.ms-powerpoint',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    console.log(`[DOCUMENT_LOADED] Binary: ${ext}, ${buffer.byteLength} bytes`);
    return { base64, mimeType };
  }

  // For text-based files, decode as UTF-8
  const text = new TextDecoder().decode(buffer);
  console.log(`[DOCUMENT_LOADED] Text: ${text.length} characters`);
  return { text };
}

/**
 * Extract buyer criteria and deal information from uploaded documents
 * SOURCE PRIORITY: 60 (Document — lower than Transcript at 100)
 */
async function extractCriteriaFromDocument(
  content: DocumentContent,
  documentName: string,
  industryName: string
): Promise<unknown> {
  console.log('[EXTRACTION_START] Processing document');

  const systemPrompt = `You are an expert M&A advisor analyzing a document to extract buyer fit criteria and deal information. These documents may be shorter and more focused than comprehensive M&A guides — they could be deal memos, broker packages, internal research notes, or one-pagers.

RULES:
1. ADAPT TO DOCUMENT TYPE: A deal memo will have detailed financials. A broker teaser will have limited info. A research note may have industry data but no specific deal data. Extract what's available and flag what's missing.

2. CONFIDENCE SCORING:
   - 90-100: Explicit criteria with specific numbers from a primary source (deal memo financials, audited statements).
   - 70-89: Clear patterns or stated preferences from a reliable secondary source.
   - 50-69: General patterns, inferred criteria, or data from an unverified source.
   - Below 50: Vague statements, unreliable context, or high uncertainty.

3. SOURCE PRIORITY: Document data (priority 60) cannot overwrite transcript data (priority 100). If the extraction system has existing data from a transcript, document data fills gaps only.

4. FINANCIAL PRECISION: Documents often contain more precise financial data than transcripts (audited figures, detailed P&Ls). Extract with appropriate confidence — audited financials get confidence 95-100, management projections get 70-80.

5. DISTINGUISH HISTORICAL FROM PROJECTED: "2024 revenue was $8.2M" (historical, confidence 95) is different from "2025 projected revenue of $10M" (projected, confidence 70). Tag appropriately.

6. NUMBERS AS RAW INTEGERS: All dollar amounts as raw numbers. "$7.5M" = 7500000.

7. PERCENTAGES AS DECIMALS: 18% = 0.18.

8. STATE CODES: Always 2-letter uppercase.`;

  const userPrompt = `Analyze the following document and extract all buyer fit criteria and deal information.

First, identify the DOCUMENT TYPE (one of: CIM, broker_teaser, deal_memo, research_note, one_pager, financial_statement, other) and adjust your extraction approach accordingly.

Document Name: "${documentName}"
Industry: ${industryName}`;

  const tool = {
    type: "function",
    function: {
      name: "extract_document_criteria",
      description: "Extract buyer fit criteria and deal information from uploaded document",
      parameters: {
        type: "object",
        properties: {
          document_metadata: {
            type: "object",
            properties: {
              document_type: {
                type: "string",
                enum: ["CIM", "broker_teaser", "deal_memo", "research_note", "one_pager", "financial_statement", "other"],
                description: "Type of document being analyzed"
              },
              company_name: { type: "string", description: "Company name if identifiable" },
              date: { type: "string", description: "Document date if present" },
              author: { type: "string", description: "Document author/firm if identified" },
              page_count_estimate: { type: "number", description: "Estimated page count" }
            },
            required: ["document_type"]
          },
          financial_data: {
            type: "object",
            properties: {
              revenue: {
                type: "object",
                properties: {
                  value: { type: "number", description: "Revenue in raw dollars" },
                  period: { type: "string", description: "Time period (FY2024, TTM, etc.)" },
                  is_projected: { type: "boolean", description: "Whether this is projected vs historical" },
                  confidence: { type: "number", description: "Confidence 0-100" }
                }
              },
              ebitda: {
                type: "object",
                properties: {
                  value: { type: "number", description: "EBITDA in raw dollars" },
                  margin: { type: "number", description: "EBITDA margin as decimal (0.18 for 18%)" },
                  period: { type: "string" },
                  is_projected: { type: "boolean" },
                  confidence: { type: "number" }
                }
              },
              revenue_history: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    year: { type: "number" },
                    value: { type: "number", description: "Revenue in raw dollars" }
                  },
                  required: ["year", "value"]
                }
              },
              ebitda_history: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    year: { type: "number" },
                    value: { type: "number", description: "EBITDA in raw dollars" }
                  },
                  required: ["year", "value"]
                }
              },
              other_financials: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    metric: { type: "string" },
                    value: { type: "string" },
                    period: { type: "string" },
                    confidence: { type: "number" }
                  },
                  required: ["metric", "value"]
                }
              }
            }
          },
          buyer_criteria: {
            type: "object",
            description: "Only populate if the document contains buyer-side information",
            properties: {
              size_criteria: {
                type: "object",
                properties: {
                  revenue_min: { type: "number" },
                  revenue_max: { type: "number" },
                  ebitda_min: { type: "number" },
                  ebitda_max: { type: "number" },
                  confidence: { type: "number" }
                }
              },
              service_criteria: {
                type: "object",
                properties: {
                  target_services: { type: "array", items: { type: "string" } },
                  service_exclusions: { type: "array", items: { type: "string" } },
                  confidence: { type: "number" }
                }
              },
              geography_criteria: {
                type: "object",
                properties: {
                  target_regions: { type: "array", items: { type: "string" } },
                  target_states: { type: "array", items: { type: "string" } },
                  geographic_exclusions: { type: "array", items: { type: "string" } },
                  confidence: { type: "number" }
                }
              },
              deal_preferences: {
                type: "object",
                properties: {
                  deal_types: { type: "array", items: { type: "string" } },
                  structure_preferences: { type: "array", items: { type: "string" } },
                  valuation_parameters: { type: "string" },
                  deal_breakers: { type: "array", items: { type: "string" } },
                  confidence: { type: "number" }
                }
              }
            }
          },
          deal_information: {
            type: "object",
            description: "Only populate if document describes a specific deal/company for sale",
            properties: {
              company_overview: { type: "string" },
              industry: { type: "string" },
              location: { type: "string" },
              services: { type: "array", items: { type: "string" } },
              employees: { type: "number" },
              founded: { type: "number" },
              ownership: { type: "string" },
              growth_story: { type: "string" },
              key_risks: { type: "array", items: { type: "string" } },
              asking_price: { type: "number" },
              implied_multiple: { type: "string" }
            }
          },
          extraction_gaps: {
            type: "array",
            items: { type: "string" },
            description: "What information is NOT in this document that would be valuable."
          },
          overall_confidence: {
            type: "number",
            description: "Overall extraction confidence 0-100"
          }
        },
        required: ["document_metadata", "extraction_gaps", "overall_confidence"]
      }
    }
  };

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const startTime = Date.now();

  // For binary documents, use Gemini's native multimodal with inline_data
  if (content.base64 && content.mimeType) {
    console.log(`[EXTRACTION] Using Gemini multimodal for binary document (${content.mimeType})`);

    // Normalize tool format
    const toolName = tool.function.name;
    const fullPrompt = `${userPrompt}\n\nPlease analyze the attached document thoroughly.`;

    const response = await callGeminiWithRetry(
      GEMINI_API_URL,
      getGeminiHeaders(geminiApiKey),
      {
        model: DEFAULT_GEMINI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: documentName,
                  file_data: `data:${content.mimeType};base64,${content.base64}`,
                },
              },
              { type: "text", text: fullPrompt },
            ],
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: toolName } },
        temperature: 0,
        max_tokens: 8192,
      },
      120000, // 2 min for large docs
      'Gemini/doc-extract'
    );

    const duration = Date.now() - startTime;
    console.log(`[EXTRACTION_COMPLETE] ${duration}ms`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Gemini multimodal error: ${response.status}`, errText.substring(0, 500));
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const responseData = await response.json();
    if (responseData.usage) {
      console.log(`[USAGE] Input: ${responseData.usage.prompt_tokens}, Output: ${responseData.usage.completion_tokens}`);
    }

    const toolCalls = responseData.choices?.[0]?.message?.tool_calls;
    if (!toolCalls?.length) {
      throw new Error('No tool calls in AI response for binary document');
    }

    try {
      return JSON.parse(toolCalls[0].function.arguments);
    } catch (e: unknown) {
      throw new Error(`Failed to parse extraction result: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // For text documents, use the standard text-based extraction
  const textContent = content.text || '';
  const fullUserPrompt = `${userPrompt}\n\nDOCUMENT CONTENT:\n${textContent.slice(0, 50000)}`;

  const result = await callGeminiWithTool(
    systemPrompt,
    fullUserPrompt,
    tool,
    geminiApiKey,
    DEFAULT_GEMINI_MODEL,
    60000,
    8192
  );

  const duration = Date.now() - startTime;
  console.log(`[EXTRACTION_COMPLETE] ${duration}ms`);

  if (result.usage) {
    console.log(`[USAGE] Input: ${result.usage.input_tokens}, Output: ${result.usage.output_tokens}`);
  }

  if (!result.data) {
    throw new Error(result.error?.message || 'No data extracted from document');
  }

  return result.data;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const {
      universe_id,
      document_url,
      document_name,
      industry_name = 'Unknown Industry'
    }: DocumentExtractionRequest = await req.json();

    if (!universe_id || !document_url || !document_name) {
      throw new Error('Missing required fields: universe_id, document_url, document_name');
    }

    console.log(`[REQUEST] Universe: ${universe_id}, Document: ${document_name}`);

    const { data: sourceRecord, error: sourceError } = await supabase
      .from('criteria_extraction_sources')
      .insert({
        universe_id,
        source_type: 'uploaded_document',
        source_name: document_name,
        source_url: document_url,
        source_metadata: { industry_name, document_url },
        extraction_status: 'processing',
        extraction_started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (sourceError) {
      throw new Error(`Failed to create source record: ${sourceError.message}`);
    }

    console.log(`[SOURCE_CREATED] ID: ${sourceRecord.id}`);

    try {
      const content = await extractDocumentContent(document_url);
      const extractionResult = await extractCriteriaFromDocument(content, document_name, industry_name);

      const confidenceScores: Record<string, unknown> = {
        overall: extractionResult.overall_confidence,
        document_type: extractionResult.document_metadata?.document_type,
      };
      if (extractionResult.buyer_criteria?.size_criteria?.confidence) {
        confidenceScores.size = extractionResult.buyer_criteria.size_criteria.confidence;
      }
      if (extractionResult.buyer_criteria?.service_criteria?.confidence) {
        confidenceScores.service = extractionResult.buyer_criteria.service_criteria.confidence;
      }
      if (extractionResult.buyer_criteria?.geography_criteria?.confidence) {
        confidenceScores.geography = extractionResult.buyer_criteria.geography_criteria.confidence;
      }
      if (extractionResult.financial_data?.revenue?.confidence) {
        confidenceScores.financial = extractionResult.financial_data.revenue.confidence;
      }

      const { error: updateError } = await supabase
        .from('criteria_extraction_sources')
        .update({
          extraction_status: 'completed',
          extraction_completed_at: new Date().toISOString(),
          extracted_data: extractionResult,
          confidence_scores: confidenceScores
        })
        .eq('id', sourceRecord.id);

      if (updateError) {
        throw new Error(`Failed to update source record: ${updateError.message}`);
      }

      console.log(`[SUCCESS] Extraction completed: type=${extractionResult.document_metadata?.document_type}, confidence=${extractionResult.overall_confidence}%`);

      return new Response(
        JSON.stringify({
          success: true,
          source_id: sourceRecord.id,
          extraction: extractionResult,
          message: 'Document criteria extracted successfully'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );

    } catch (extractionError: unknown) {
      await supabase
        .from('criteria_extraction_sources')
        .update({
          extraction_status: 'failed',
          extraction_error: extractionError instanceof Error ? extractionError.message : String(extractionError),
          extraction_completed_at: new Date().toISOString()
        })
        .eq('id', sourceRecord.id);

      throw extractionError;
    }

  } catch (error: unknown) {
    console.error('[ERROR]', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
