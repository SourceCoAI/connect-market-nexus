/**
 * Transcript Processing Module for enrich-deal
 *
 * Handles Step 0: Processing deal transcripts (highest priority source).
 * - 0A: Apply existing extracted_data from previously-processed transcripts
 * - 0B: Process transcripts that need AI extraction
 *
 * Extracted from enrich-deal/index.ts to reduce monolith size.
 * All functionality is preserved — this is a pure extraction.
 */

import { mergeStates } from "../_shared/geography.ts";
import { buildPriorityUpdates, updateExtractionSources, createFieldSource, type ExtractionSources } from "../_shared/source-priority.ts";
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  NUMERIC_LISTING_FIELDS,
  mapTranscriptToListing,
  sanitizeListingUpdates,
  isPlaceholder,
} from "../_shared/deal-extraction.ts";
import { getErrorMessage } from "../_shared/enrichment/pipeline.ts";

interface DealTranscript {
  id: string;
  title?: string;
  source?: string;
  transcript_text?: string;
  transcript_url?: string;
  fireflies_transcript_id?: string;
  extracted_data?: Record<string, unknown>;
  processed_at?: string | null;
}

interface DealRecord {
  [key: string]: unknown;
  title?: string;
  internal_company_name?: string;
  industry?: string;
  location?: string;
  address_city?: string;
  revenue?: number;
  ebitda?: number;
  geographic_states?: string[];
  extraction_sources?: ExtractionSources | null;
}

export interface TranscriptReport {
  totalTranscripts: number;
  processable: number;
  skipped: number;
  processed: number;
  appliedFromExisting: number;
  appliedFromExistingTranscripts: number;
  errors: string[];
  processedThisRun?: number;
}

export interface TranscriptProcessingResult {
  transcriptReport: TranscriptReport;
  transcriptsProcessed: number;
  transcriptFieldNames: string[];
}

/**
 * Step 0A: Apply existing extracted_data from previously-processed transcripts.
 * Returns the cumulative updates and source records applied.
 */
export async function applyExistingTranscriptData(
  supabase: SupabaseClient,
  deal: DealRecord,
  dealId: string,
  transcriptsWithExtracted: DealTranscript[],
  forceReExtract: boolean,
): Promise<{ appliedFieldCount: number; appliedTranscriptCount: number; fieldNames: string[]; updatedSources: ExtractionSources | null | undefined }> {
  const listingKeys = new Set(Object.keys(deal));
  let cumulativeUpdates: Record<string, unknown> = {};
  let cumulativeSources = deal.extraction_sources;
  let appliedTranscriptCount = 0;

  for (const t of transcriptsWithExtracted) {
    const extracted = (t.extracted_data ?? {}) as Record<string, unknown>;
    const flat = mapTranscriptToListing(extracted, listingKeys);
    if (Object.keys(flat).length === 0) continue;

    let updates: Record<string, unknown>;
    let sourceUpdates: Record<string, unknown>;

    if (forceReExtract) {
      updates = { ...flat };
      sourceUpdates = {};
      for (const key of Object.keys(flat)) {
        sourceUpdates[key] = createFieldSource('transcript', t.id, undefined, t.title || undefined);
      }
    } else {
      const result = buildPriorityUpdates(
        deal as Record<string, unknown>,
        cumulativeSources,
        flat as Partial<Record<string, unknown>>,
        'transcript',
        t.id,
        isPlaceholder,
        t.title || undefined
      );
      updates = result.updates as Record<string, unknown>;
      sourceUpdates = result.sourceUpdates;
    }

    if (Object.keys(updates).length === 0) continue;

    appliedTranscriptCount++;

    if (!forceReExtract && updates.geographic_states && Array.isArray(deal.geographic_states) && deal.geographic_states.length > 0) {
      updates.geographic_states = mergeStates(deal.geographic_states, updates.geographic_states as string[]);
    }

    cumulativeUpdates = { ...cumulativeUpdates, ...updates };
    cumulativeSources = updateExtractionSources(cumulativeSources, sourceUpdates as Record<string, ReturnType<typeof createFieldSource>>);

    Object.assign(deal, updates);
  }

  if (Object.keys(cumulativeUpdates).length > 0) {
    const sanitizedUpdates = sanitizeListingUpdates(cumulativeUpdates);

    const numericPreview = Object.fromEntries(
      Object.entries(sanitizedUpdates)
        .filter(([k]) => NUMERIC_LISTING_FIELDS.has(k))
        .map(([k, v]) => [k, { value: v, type: typeof v }])
    );
    console.log('[Transcripts] Numeric payload preview (post-sanitize):', numericPreview);

    const { error: applyExistingError } = await supabase
      .from('listings')
      .update({
        ...sanitizedUpdates,
        enriched_at: new Date().toISOString(),
        extraction_sources: cumulativeSources,
      })
      .eq('id', dealId);

    if (applyExistingError) {
      console.error('Failed applying existing transcript intelligence:', applyExistingError);
      return { appliedFieldCount: 0, appliedTranscriptCount: 0, fieldNames: [], updatedSources: deal.extraction_sources };
    }

    deal.extraction_sources = cumulativeSources;
    return {
      appliedFieldCount: Object.keys(cumulativeUpdates).length,
      appliedTranscriptCount,
      fieldNames: Object.keys(cumulativeUpdates),
      updatedSources: cumulativeSources,
    };
  }

  return { appliedFieldCount: 0, appliedTranscriptCount: 0, fieldNames: [], updatedSources: deal.extraction_sources };
}

/**
 * Step 0B: Process transcripts that need AI extraction.
 * Handles Fireflies URL detection, content fetching, and batch extraction.
 */
export async function processNewTranscripts(
  supabase: SupabaseClient,
  deal: DealRecord,
  needsExtraction: DealTranscript[],
  supabaseUrl: string,
  supabaseServiceKey: string,
  supabaseAnonKey: string,
): Promise<{ processed: number; errors: string[]; processable: number; skipped: number; fieldNames: string[] }> {
  let transcriptsProcessed = 0;
  const transcriptErrors: string[] = [];
  const allFieldNames: string[] = [];

  // Detect Fireflies URLs in link-type transcripts and convert them.
  // Pattern 1: URLs with "::" separator (e.g. fireflies.ai/view/Title::ApiId)
  // Pattern 2: URLs without "::" (e.g. fireflies.ai/view/SomeSlug) — convert to
  //   source='fireflies' with no ID; fetch-fireflies-content will resolve via URL search.
  const firefliesIdPattern = /fireflies\.ai\/view\/[^:]+::([a-zA-Z0-9]+)/;
  const firefliesUrlPattern = /fireflies\.ai\/view\/[^/?#\s]+/;
  for (const t of needsExtraction) {
    if (t.source === 'link' && !t.fireflies_transcript_id) {
      const textToCheck = (t.transcript_text || '') + ' ' + (t.transcript_url || '');
      const idMatch = textToCheck.match(firefliesIdPattern);
      if (idMatch) {
        const ffId = idMatch[1];
        console.log(`[Transcripts] Detected Fireflies URL in link transcript ${t.id}, extracted ID: ${ffId}`);
        const { error: convertErr } = await supabase
          .from('deal_transcripts')
          .update({
            source: 'fireflies',
            fireflies_transcript_id: ffId,
          })
          .eq('id', t.id);
        if (!convertErr) {
          t.source = 'fireflies';
          t.fireflies_transcript_id = ffId;
          t.transcript_text = '';
        } else {
          console.warn(`[Transcripts] Failed to convert link transcript ${t.id}:`, convertErr);
        }
      } else if (textToCheck.match(firefliesUrlPattern)) {
        // Fireflies URL without :: separator — convert source so content fetch resolves via URL
        console.log(`[Transcripts] Detected Fireflies URL (no ID) in link transcript ${t.id}, converting to source=fireflies`);
        const { error: convertErr } = await supabase
          .from('deal_transcripts')
          .update({ source: 'fireflies' })
          .eq('id', t.id);
        if (!convertErr) {
          t.source = 'fireflies';
          t.transcript_text = '';
        }
      }
    }
  }

  // Fetch Fireflies content for transcripts with empty text
  const firefliesEmpty = needsExtraction.filter(
    (t: DealTranscript) => {
      if (t.transcript_text && t.transcript_text.trim().length >= 100) return false;
      if (t.source === 'fireflies' && t.fireflies_transcript_id) return true;
      if (t.source === 'fireflies') return true;
      return false;
    }
  );
  if (firefliesEmpty.length > 0) {
    console.log(`[Transcripts] Fetching Fireflies content for ${firefliesEmpty.length} transcript(s)...`);
    for (const t of firefliesEmpty) {
      try {
        const { data: fetchResult, error: fetchErr } = await supabase.functions.invoke(
          'fetch-fireflies-content',
          { body: { transcriptId: t.id } }
        );
        if (!fetchErr && fetchResult?.content) {
          t.transcript_text = fetchResult.content;
          console.log(`[Transcripts] Fetched ${fetchResult.content.length} chars for Fireflies transcript ${t.id}`);
        } else {
          console.warn(`[Transcripts] Failed to fetch Fireflies content for ${t.id}:`, fetchErr?.message || 'no content');
        }
      } catch (err) {
        console.warn(`[Transcripts] Error fetching Fireflies content for ${t.id}:`, err);
      }
    }
  }

  const validTranscripts = needsExtraction.filter((t: DealTranscript) =>
    t.transcript_text && t.transcript_text.trim().length >= 100
  );

  const processable = validTranscripts.length;
  const skipped = needsExtraction.length - validTranscripts.length;

  if (skipped > 0) {
    console.log(`[Transcripts] Skipping ${skipped} transcripts with insufficient content (<100 chars)`);
  }

  console.log(`[Transcripts] Processing ${validTranscripts.length} transcripts in batches...`);

  const failedTranscriptIds = validTranscripts
    .filter((t: DealTranscript) => t.processed_at)
    .map((t: DealTranscript) => t.id);

  if (failedTranscriptIds.length > 0) {
    console.log(`[Transcripts] Resetting processed_at for ${failedTranscriptIds.length} previously-failed transcripts`);
    const { error: resetError } = await supabase
      .from('deal_transcripts')
      .update({ processed_at: null, extracted_data: null })
      .in('id', failedTranscriptIds);
    if (resetError) {
      console.error(`[Transcripts] Failed to reset processed_at:`, resetError);
    }
  }

  const BATCH_SIZE = 10;
  for (let i = 0; i < validTranscripts.length; i += BATCH_SIZE) {
    const batch = validTranscripts.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (transcript: DealTranscript) => {
        const MAX_RETRIES = 1;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            console.log(`[Transcripts] Retrying transcript ${transcript.id} (attempt ${attempt + 1})`);
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          }

          try {
            const extractResponse = await fetch(
              `${supabaseUrl}/functions/v1/extract-deal-transcript`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'apikey': supabaseAnonKey,
                  'x-internal-secret': supabaseServiceKey,
                },
                body: JSON.stringify({
                  transcriptId: transcript.id,
                  transcriptText: transcript.transcript_text,
                  applyToDeal: true,
                  dealInfo: {
                    company_name: deal.title || deal.internal_company_name,
                    industry: deal.industry,
                    location: deal.location || deal.address_city,
                    revenue: deal.revenue,
                    ebitda: deal.ebitda,
                  },
                }),
              }
            );

            if (!extractResponse.ok) {
              const errText = await extractResponse.text();
              lastError = new Error(errText.slice(0, 200));
              if (extractResponse.status < 500 && extractResponse.status !== 429) {
                throw lastError;
              }
              continue;
            }

            // Parse response to capture which fields were applied
            const responseBody = await extractResponse.json().catch(() => ({}));
            return {
              transcriptId: transcript.id,
              fieldsUpdated: responseBody.fieldsUpdated || [],
            };
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt === MAX_RETRIES) throw lastError;
          }
        }

        throw lastError || new Error('Transcript extraction failed after retries');
      })
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const transcript = batch[j];

      if (result.status === 'fulfilled') {
        transcriptsProcessed++;
        const { fieldsUpdated } = result.value;
        if (fieldsUpdated?.length > 0) {
          allFieldNames.push(...fieldsUpdated);
        }
        console.log(`[Transcripts] Successfully processed transcript ${transcript.id} (${fieldsUpdated?.length || 0} fields applied)`);
      } else {
        const errMsg = getErrorMessage(result.reason);
        console.error(`[Transcripts] Failed transcript ${transcript.id}:`, errMsg);
        transcriptErrors.push(`Transcript ${transcript.id.slice(0, 8)}: ${errMsg.slice(0, 200)}`);
      }
    }

    if (i + BATCH_SIZE < validTranscripts.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { processed: transcriptsProcessed, errors: transcriptErrors, processable, skipped, fieldNames: [...new Set(allFieldNames)] };
}
