/**
 * backfill-pe-platform-links: Automated PE firm → platform company linking
 *
 * Four-stage pipeline that converts pe_firm_name text fields into real
 * parent_pe_firm_id foreign key relationships.
 *
 * Stages:
 *   1. Candidate collection
 *   2. Name cleaning
 *   3. Match attempt (5 methods: exact, domain, fuzzy, AI, auto-create)
 *   4. Outcome assignment
 *
 * Fully idempotent — safe to run multiple times on the same data.
 *
 * POST body (optional):
 *   - batch_size: number (default 50, max 200)
 *   - dry_run: boolean (default false)
 *   - process_queue: boolean (default true) — also process pe_link_queue items
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';

// ── Name cleaning ──

const PREFIX_PATTERNS = [
  /^a\s+portfolio\s+company\s+of\s+/i,
  /^portfolio\s+company\s+of\s+/i,
  /^owned\s+by\s+/i,
  /^backed\s+by\s+/i,
  /^a\s+company\s+of\s+/i,
  /^an?\s+.{0,30}\s+company\s+of\s+/i,
  /^invested\s+in\s+by\s+/i,
];

const SUFFIX_PATTERNS = [
  /,?\s*(LLC|L\.L\.C\.|LP|L\.P\.|Inc\.?|Corp\.?|Co\.?|Ltd\.?|LLP|L\.L\.P\.|PLC|GP|Partners|Advisors|Advisory|Management|Capital\s+Management)\s*$/i,
  /\s*Fund\s+[IVXLCDM]+\s*$/i,
  /\s*Fund\s+\d{4}\s*$/i,
  /\s*Fund\s+\d+\s*$/i,
];

const STOPLIST = [
  'private equity',
  'investment firm',
  'pe firm',
  'equity firm',
  'capital',
  'investments',
  'holdings',
  'group',
  'partners',
  'management',
];

function cleanPEFirmName(raw: string): { cleaned: string; isGeneric: boolean } {
  let name = raw.trim();

  // Strip prefix phrases
  for (const pattern of PREFIX_PATTERNS) {
    name = name.replace(pattern, '');
  }

  // Strip legal suffixes
  for (const pattern of SUFFIX_PATTERNS) {
    name = name.replace(pattern, '');
  }

  name = name.trim();

  // Title case
  name = name
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());

  // Check stoplist
  const isGeneric = STOPLIST.includes(name.toLowerCase()) || name.length < 3;

  return { cleaned: name, isGeneric };
}

// ── Confidence mapping ──

function fuzzyScoreToConfidence(score: number): number {
  if (score >= 0.85) return 85;
  if (score >= 0.70) return 75;
  if (score >= 0.55) return 65;
  if (score >= 0.40) return 55;
  return 40;
}

// ── Domain guessing ──

function guessDomain(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    + '.com';
}

// ── Main handler ──

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const headers = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let batchSize = 50;
    let dryRun = false;
    let processQueue = true;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        batchSize = Math.min(body.batch_size || 50, 200);
        dryRun = body.dry_run || false;
        processQueue = body.process_queue !== false;
      } catch {
        // No body or invalid JSON — use defaults
      }
    }

    const runId = crypto.randomUUID();
    const stats = {
      total_candidates: 0,
      auto_linked: 0,
      flagged_for_review: 0,
      stubs_created: 0,
      unresolvable: 0,
      skipped: 0,
      errors: 0,
    };

    // ── Stage 1: Candidate Collection ──

    // First, process pe_link_queue items
    if (processQueue) {
      const { data: queueItems } = await supabase
        .from('pe_link_queue')
        .select('buyer_id, pe_firm_name_raw')
        .eq('status', 'pending')
        .limit(batchSize);

      if (queueItems && queueItems.length > 0) {
        // Mark as processing
        const queueIds = queueItems.map(q => q.buyer_id);
        if (!dryRun) {
          await supabase
            .from('pe_link_queue')
            .update({ status: 'processing' })
            .in('buyer_id', queueIds);
        }
      }
    }

    // Main candidate query
    const { data: candidates, error: candidateError } = await supabase
      .from('remarketing_buyers')
      .select('id, company_name, pe_firm_name, company_website, buyer_type')
      .eq('buyer_type', 'corporate')
      .not('pe_firm_name', 'is', null)
      .neq('pe_firm_name', '')
      .is('parent_pe_firm_id', null)
      .or('backfill_status.is.null,backfill_status.eq.retry')
      .eq('archived', false)
      .limit(batchSize);

    if (candidateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch candidates', details: candidateError.message }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No candidates to process', run_id: runId, stats }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    stats.total_candidates = candidates.length;

    // ── Process each candidate ──
    for (const candidate of candidates) {
      try {
        // ── Stage 2: Name Cleaning ──
        const { cleaned, isGeneric } = cleanPEFirmName(candidate.pe_firm_name);

        if (isGeneric) {
          if (!dryRun) {
            await supabase
              .from('remarketing_buyers')
              .update({ backfill_status: 'unresolvable' })
              .eq('id', candidate.id);

            await logDecision(supabase, {
              run_id: runId,
              platform_buyer_id: candidate.id,
              platform_name: candidate.company_name,
              pe_firm_name_raw: candidate.pe_firm_name,
              pe_firm_name_cleaned: cleaned,
              method_used: 'stoplist',
              confidence_score: 0,
              outcome: 'unresolvable',
              reasoning: `Name "${cleaned}" is too generic (matches stoplist)`,
            });
          }
          stats.unresolvable++;
          continue;
        }

        // ── Stage 3: Match Attempt ──
        let matchResult = await tryAllMethods(supabase, cleaned, candidate);

        // ── Stage 4: Outcome Assignment ──
        if (dryRun) {
          await logDecision(supabase, {
            run_id: runId,
            platform_buyer_id: candidate.id,
            platform_name: candidate.company_name,
            pe_firm_name_raw: candidate.pe_firm_name,
            pe_firm_name_cleaned: cleaned,
            method_used: matchResult.method,
            confidence_score: matchResult.confidence,
            matched_pe_firm_id: matchResult.matchedId,
            matched_pe_firm_name: matchResult.matchedName,
            outcome: `dry_run_${getOutcome(matchResult.confidence)}`,
            reasoning: matchResult.reasoning,
          });
          continue;
        }

        const confidence = matchResult.confidence;

        if (confidence >= 85) {
          // AUTO-LINK
          await autoLink(supabase, candidate.id, matchResult.matchedId!);
          await supabase
            .from('remarketing_buyers')
            .update({ backfill_status: 'done' })
            .eq('id', candidate.id);
          stats.auto_linked++;
        } else if (confidence >= 70) {
          // AUTO-LINK with review tag
          await autoLink(supabase, candidate.id, matchResult.matchedId!);
          await supabase
            .from('remarketing_buyers')
            .update({ backfill_status: 'done' })
            .eq('id', candidate.id);
          stats.auto_linked++;
        } else if (confidence >= 55) {
          // FLAG FOR REVIEW
          await createReviewEntry(supabase, candidate, cleaned, matchResult);
          await supabase
            .from('remarketing_buyers')
            .update({ backfill_status: 'flagged' })
            .eq('id', candidate.id);
          stats.flagged_for_review++;
        } else if (confidence > 0) {
          // LOW CONFIDENCE — flag for review
          await createReviewEntry(supabase, candidate, cleaned, matchResult);
          await supabase
            .from('remarketing_buyers')
            .update({ backfill_status: 'flagged' })
            .eq('id', candidate.id);
          stats.flagged_for_review++;
        } else {
          // NO MATCH — Auto-create stub PE firm
          const stubId = await createStubPEFirm(supabase, cleaned);
          if (stubId) {
            await autoLink(supabase, candidate.id, stubId);
            await supabase
              .from('remarketing_buyers')
              .update({ backfill_status: 'done' })
              .eq('id', candidate.id);
            matchResult = {
              ...matchResult,
              matchedId: stubId,
              matchedName: cleaned,
              method: 'auto_create',
              reasoning: 'No match found. Created stub PE firm record.',
            };
            stats.stubs_created++;
          } else {
            stats.errors++;
          }
        }

        await logDecision(supabase, {
          run_id: runId,
          platform_buyer_id: candidate.id,
          platform_name: candidate.company_name,
          pe_firm_name_raw: candidate.pe_firm_name,
          pe_firm_name_cleaned: cleaned,
          method_used: matchResult.method,
          confidence_score: matchResult.confidence,
          matched_pe_firm_id: matchResult.matchedId,
          matched_pe_firm_name: matchResult.matchedName,
          outcome: getOutcome(matchResult.confidence),
          reasoning: matchResult.reasoning,
        });

      } catch (err) {
        console.error(`Error processing candidate ${candidate.id}:`, err);
        stats.errors++;
      }
    }

    // Update pe_link_queue items to done
    if (!dryRun && processQueue) {
      await supabase
        .from('pe_link_queue')
        .update({ status: 'done' })
        .eq('status', 'processing');
    }

    return new Response(
      JSON.stringify({ success: true, run_id: runId, stats, dry_run: dryRun }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('backfill-pe-platform-links error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});

// ── Match methods ──

interface MatchResult {
  confidence: number;
  matchedId: string | null;
  matchedName: string | null;
  method: string;
  reasoning: string;
  candidates?: Array<{ id: string; name: string; score: number }>;
}

async function tryAllMethods(
  supabase: ReturnType<typeof createClient>,
  cleanedName: string,
  candidate: Record<string, unknown>,
): Promise<MatchResult> {
  // Method 1: Exact name match
  const { data: exactMatches } = await supabase
    .from('remarketing_buyers')
    .select('id, company_name')
    .eq('buyer_type', 'private_equity')
    .eq('archived', false)
    .ilike('company_name', cleanedName);

  if (exactMatches && exactMatches.length === 1) {
    return {
      confidence: 95,
      matchedId: exactMatches[0].id,
      matchedName: exactMatches[0].company_name,
      method: 'exact_match',
      reasoning: `Exact name match: "${cleanedName}" = "${exactMatches[0].company_name}"`,
    };
  }

  // Method 3: Fuzzy match via pg_trgm (run before Method 2 to inform domain validation)
  let fuzzyResults: Array<{ id: string; company_name: string; score: number }> = [];

  try {
    const { data: fuzzyData } = await supabase.rpc('search_pe_firms_by_similarity', {
      search_name: cleanedName.toLowerCase(),
      min_similarity: 0.40,
    });

    if (fuzzyData && fuzzyData.length > 0) {
      fuzzyResults = fuzzyData.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        company_name: r.company_name as string,
        score: r.score as number,
      }));
    }
  } catch {
    // RPC may not exist yet — fall back to basic ILIKE search
    const { data: likeData } = await supabase
      .from('remarketing_buyers')
      .select('id, company_name')
      .eq('buyer_type', 'private_equity')
      .eq('archived', false)
      .ilike('company_name', `%${cleanedName}%`)
      .limit(3);

    if (likeData) {
      fuzzyResults = likeData.map(r => ({
        id: r.id,
        company_name: r.company_name,
        score: 0.6,
      }));
    }
  }

  // Method 2: Domain cross-match
  const domainGuess = guessDomain(cleanedName);
  const { data: domainMatches } = await supabase
    .from('remarketing_buyers')
    .select('id, company_name')
    .eq('buyer_type', 'private_equity')
    .eq('archived', false)
    .or(`company_website.ilike.%${domainGuess}%,company_website.ilike.%${cleanedName.toLowerCase().replace(/\s+/g, '')}%`)
    .limit(3);

  if (domainMatches && domainMatches.length === 1) {
    // Only use domain match if fuzzy score is also >= 70
    const fuzzyForDomain = fuzzyResults.find(f => f.id === domainMatches[0].id);
    if (fuzzyForDomain && fuzzyForDomain.score >= 0.70) {
      return {
        confidence: 90,
        matchedId: domainMatches[0].id,
        matchedName: domainMatches[0].company_name,
        method: 'domain_cross_match',
        reasoning: `Domain cross-match: "${domainGuess}" matched website, fuzzy score ${fuzzyForDomain.score.toFixed(2)}`,
      };
    }
  }

  // Process fuzzy results
  if (fuzzyResults.length > 0) {
    const top = fuzzyResults[0];
    const topConfidence = fuzzyScoreToConfidence(top.score);

    // Check for ambiguity: top 2 results within 5 points
    if (fuzzyResults.length >= 2) {
      const second = fuzzyResults[1];
      const secondConfidence = fuzzyScoreToConfidence(second.score);
      if (Math.abs(topConfidence - secondConfidence) <= 5) {
        return {
          confidence: Math.min(topConfidence, 55),
          matchedId: top.id,
          matchedName: top.company_name,
          method: 'fuzzy_match_ambiguous',
          reasoning: `Ambiguous: "${top.company_name}" (${top.score.toFixed(2)}) vs "${second.company_name}" (${second.score.toFixed(2)})`,
          candidates: fuzzyResults.slice(0, 3).map(f => ({
            id: f.id,
            name: f.company_name,
            score: fuzzyScoreToConfidence(f.score),
          })),
        };
      }
    }

    if (topConfidence >= 55) {
      return {
        confidence: topConfidence,
        matchedId: top.id,
        matchedName: top.company_name,
        method: 'fuzzy_match',
        reasoning: `Fuzzy match: "${cleanedName}" ~ "${top.company_name}" (score: ${top.score.toFixed(2)})`,
        candidates: fuzzyResults.slice(0, 3).map(f => ({
          id: f.id,
          name: f.company_name,
          score: fuzzyScoreToConfidence(f.score),
        })),
      };
    }
  }

  // Method 4: AI-assisted resolution
  try {
    const aiResult = await aiAssistedMatch(supabase, cleanedName, candidate);
    if (aiResult && aiResult.confidence >= 70) {
      return aiResult;
    }
    if (aiResult && aiResult.confidence > 0) {
      return aiResult;
    }
  } catch (err) {
    console.error('AI match failed:', err);
  }

  // No match found
  return {
    confidence: 0,
    matchedId: null,
    matchedName: null,
    method: 'no_match',
    reasoning: `No PE firm match found for "${cleanedName}"`,
    candidates: fuzzyResults.slice(0, 3).map(f => ({
      id: f.id,
      name: f.company_name,
      score: fuzzyScoreToConfidence(f.score),
    })),
  };
}

async function aiAssistedMatch(
  supabase: ReturnType<typeof createClient>,
  cleanedName: string,
  candidate: Record<string, unknown>,
): Promise<MatchResult | null> {
  // Get candidate PE firms that share words with the cleaned name
  const words = cleanedName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return null;

  const searchTerms = words.slice(0, 3);
  let candidatePEFirms: Array<{ id: string; company_name: string; company_website: string | null }> = [];

  for (const word of searchTerms) {
    const { data } = await supabase
      .from('remarketing_buyers')
      .select('id, company_name, company_website')
      .eq('buyer_type', 'private_equity')
      .eq('archived', false)
      .ilike('company_name', `%${word}%`)
      .limit(10);

    if (data) {
      for (const item of data) {
        if (!candidatePEFirms.find(c => c.id === item.id)) {
          candidatePEFirms.push(item);
        }
      }
    }
  }

  if (candidatePEFirms.length === 0) return null;
  candidatePEFirms = candidatePEFirms.slice(0, 10);

  const systemPrompt = `You are a private equity industry expert. Does the extracted pe_firm_name refer to any of the candidate PE firms? Return only JSON: { "match_found": boolean, "matched_id": string|null, "matched_name": string|null, "confidence": number, "reasoning": string }`;

  const userMessage = `PE firm name extracted from platform company: "${cleanedName}"
Platform company: "${candidate.company_name}"
Platform website: "${candidate.company_website || 'unknown'}"

Candidate PE firms:
${candidatePEFirms.map(c => `- ID: ${c.id}, Name: "${c.company_name}", Website: ${c.company_website || 'unknown'}`).join('\n')}

Does the extracted pe_firm_name match any of these candidates?`;

  const response = await callClaude({
    model: CLAUDE_MODELS.sonnet,
    maxTokens: 500,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    timeoutMs: 15000,
  });

  const responseText = response.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text?: string }) => b.text || '')
    .join('');

  try {
    const cleaned = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;

    const result = JSON.parse(cleaned.substring(start, end + 1));

    if (result.match_found && result.matched_id && result.confidence >= 50) {
      return {
        confidence: Math.min(result.confidence, 80),
        matchedId: result.matched_id,
        matchedName: result.matched_name,
        method: 'ai_match',
        reasoning: result.reasoning,
      };
    }

    return {
      confidence: result.confidence || 0,
      matchedId: null,
      matchedName: null,
      method: 'ai_no_match',
      reasoning: result.reasoning || 'AI found no match',
    };
  } catch {
    return null;
  }
}

// ── Helper functions ──

async function autoLink(
  supabase: ReturnType<typeof createClient>,
  childId: string,
  parentId: string,
) {
  await supabase
    .from('remarketing_buyers')
    .update({
      parent_pe_firm_id: parentId,
      is_pe_backed: true,
    })
    .eq('id', childId);
}

async function createStubPEFirm(
  supabase: ReturnType<typeof createClient>,
  name: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('remarketing_buyers')
    .insert({
      company_name: name,
      buyer_type: 'private_equity',
      buyer_type_source: 'import',
      data_completeness: 'low',
      archived: false,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create stub PE firm:', error);
    return null;
  }

  return data?.id || null;
}

async function createReviewEntry(
  supabase: ReturnType<typeof createClient>,
  candidate: Record<string, unknown>,
  cleanedName: string,
  matchResult: MatchResult,
) {
  const candidateMatches = (matchResult.candidates || []).map(c => ({
    id: c.id,
    company_name: c.name,
    confidence_score: c.score,
  }));

  // Add the primary match if not already in candidates
  if (matchResult.matchedId && !candidateMatches.find(c => c.id === matchResult.matchedId)) {
    candidateMatches.unshift({
      id: matchResult.matchedId,
      company_name: matchResult.matchedName || '',
      confidence_score: matchResult.confidence,
    });
  }

  await supabase
    .from('pe_backfill_review_queue')
    .insert({
      platform_buyer_id: candidate.id as string,
      platform_name: candidate.company_name as string,
      pe_firm_name_raw: candidate.pe_firm_name as string,
      pe_firm_name_cleaned: cleanedName,
      candidate_matches: candidateMatches,
      ai_reasoning: matchResult.reasoning,
      confidence_score: matchResult.confidence,
      status: 'pending',
    });
}

async function logDecision(
  supabase: ReturnType<typeof createClient>,
  entry: Record<string, unknown>,
) {
  await supabase
    .from('pe_backfill_log')
    .insert(entry);
}

function getOutcome(confidence: number): string {
  if (confidence >= 85) return 'auto_linked';
  if (confidence >= 70) return 'auto_linked_review_recommended';
  if (confidence >= 55) return 'flagged_for_review';
  if (confidence > 0) return 'flagged_low_confidence';
  return 'auto_created';
}
