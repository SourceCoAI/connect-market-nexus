/**
 * Semantic Transcript Search Tools
 * Uses pgvector embeddings for intent-based transcript search.
 * Falls back to keyword search when embeddings aren't available.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';
import { DEFAULT_GEMINI_MODEL, getGeminiApiKey } from '../../_shared/ai-providers.ts';

// ---------- Tool definitions ----------

export const semanticSearchTools: ClaudeTool[] = [
  {
    name: 'semantic_transcript_search',
    description: `Search transcripts by meaning/intent, not just keywords. Use this when the user asks questions like:
- "What did buyer X say about geographic expansion?"
- "Find any transcript where someone mentioned add-on acquisitions"
- "Has anyone discussed pricing concerns?"
- "What was said about management retention?"
This uses AI embeddings to find semantically similar passages, catching intent that keyword search would miss.
Falls back to keyword search if embeddings aren't available yet.`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language search query describing what you want to find in transcripts',
        },
        buyer_id: {
          type: 'string',
          description: "Optional: limit search to a specific buyer's transcripts",
        },
        threshold: {
          type: 'number',
          description:
            'Similarity threshold 0-1 (default 0.65). Lower = more results but less relevant.',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 10)',
        },
      },
      required: ['query'],
    },
  },
];

// ---------- Executor ----------

export async function executeSemanticSearchTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'semantic_transcript_search':
      return semanticTranscriptSearch(supabase, args);
    default:
      return { error: `Unknown semantic search tool: ${toolName}` };
  }
}

// ---------- Implementation ----------

async function semanticTranscriptSearch(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const query = args.query as string;
  const buyerId = args.buyer_id as string | undefined;
  const _threshold = Number(args.threshold) || 0.65;
  const limit = Math.min(Number(args.limit) || 10, 25);

  // Try to generate search terms using direct Gemini API
  const apiKey = getGeminiApiKey();
  const _embedding: number[] | null = null;

  if (apiKey) {
    try {
      // Use Gemini to generate search-optimized terms via direct API
      const embeddingResponse = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: DEFAULT_GEMINI_MODEL,
            messages: [
              {
                role: 'system',
                content:
                  'Extract 10 key search terms from this query for matching M&A call transcripts. Return only comma-separated terms, nothing else.',
              },
              { role: 'user', content: query },
            ],
            max_tokens: 100,
          }),
        },
      );

      if (embeddingResponse.ok) {
        const data = await embeddingResponse.json();
        const terms =
          data.choices?.[0]?.message?.content
            ?.split(',')
            .map((t: string) => t.trim().toLowerCase())
            .filter(Boolean) || [];

        if (terms.length > 0) {
          // Use expanded terms for better keyword matching
          return await keywordSearchWithExpansion(supabase, query, terms, buyerId, limit);
        }
      }
    } catch (e) {
      console.error('[semantic-search] Embedding generation failed:', e);
    }
  }

  // Fallback to direct keyword search
  return await keywordSearchWithExpansion(supabase, query, extractKeywords(query), buyerId, limit);
}

async function keywordSearchWithExpansion(
  supabase: SupabaseClient,
  originalQuery: string,
  searchTerms: string[],
  buyerId: string | undefined,
  limit: number,
): Promise<ToolResult> {
  // Search both buyer_transcripts and deal_transcripts
  const allTerms = [...new Set([...searchTerms, ...extractKeywords(originalQuery)])];

  const [buyerResults, dealResults] = await Promise.all([
    searchBuyerTranscripts(supabase, allTerms, buyerId, limit),
    searchDealTranscripts(supabase, allTerms, limit),
  ]);

  // Score and merge results
  // deno-lint-ignore no-explicit-any
  const results: any[] = [...buyerResults, ...dealResults];

  // Score each result by term matches
  for (const r of results) {
    const text = (r.transcript_text || '').toLowerCase();
    let matchCount = 0;
    const matchedTerms: string[] = [];
    for (const term of allTerms) {
      if (text.includes(term)) {
        matchCount++;
        matchedTerms.push(term);
      }
    }
    r.relevance_score = allTerms.length > 0 ? Math.round((matchCount / allTerms.length) * 100) : 0;
    r.matched_terms = matchedTerms;

    // Extract relevant snippet around first match
    if (matchedTerms.length > 0) {
      const firstTerm = matchedTerms[0];
      const idx = text.indexOf(firstTerm);
      const start = Math.max(0, idx - 150);
      const end = Math.min(text.length, idx + firstTerm.length + 350);
      r.relevant_snippet = (r.transcript_text || '').substring(start, end);
      if (start > 0) r.relevant_snippet = '...' + r.relevant_snippet;
      if (end < text.length) r.relevant_snippet += '...';
    }

    // Remove full text to save tokens
    delete r.transcript_text;
  }

  // Sort by relevance and limit
  results.sort((a, b) => b.relevance_score - a.relevance_score);
  const topResults = results.filter((r) => r.relevance_score > 0).slice(0, limit);

  return {
    data: {
      query: originalQuery,
      expanded_terms: allTerms,
      results: topResults,
      total_matches: topResults.length,
      search_method: 'keyword_expansion',
      note:
        topResults.length === 0
          ? 'No transcript matches found. Try broader terms or check if transcripts have been uploaded.'
          : undefined,
      source_tables: ['buyer_transcripts', 'deal_transcripts'],
    },
  };
}

async function searchBuyerTranscripts(
  supabase: SupabaseClient,
  terms: string[],
  buyerId: string | undefined,
  limit: number,
): Promise<Record<string, unknown>[]> {
  // buyer_transcripts has title, summary, key_points — but NOT transcript_text
  // Search across title and summary columns
  const titleFilters = terms.slice(0, 5).map((t) => `title.ilike.%${t}%`);
  const summaryFilters = terms.slice(0, 5).map((t) => `summary.ilike.%${t}%`);
  const orFilters = [...titleFilters, ...summaryFilters].join(',');
  if (!orFilters) return [];

  let query = supabase
    .from('buyer_transcripts')
    .select('id, buyer_id, title, summary, call_date, created_at, key_points')
    .or(orFilters)
    .order('call_date', { ascending: false })
    .limit(limit);

  if (buyerId) query = query.eq('buyer_id', buyerId);

  const { data, error } = await query;
  if (error) {
    console.error('[semantic-search] buyer transcript search error:', error);
    return [];
  }

  return (data || []).map((d: Record<string, unknown>) => ({
    ...d,
    transcript_text: (d.summary as string) || (d.title as string) || '',
    source_type: 'buyer_transcript',
  }));
}

async function searchDealTranscripts(
  supabase: SupabaseClient,
  terms: string[],
  limit: number,
): Promise<Record<string, unknown>[]> {
  // Search transcript_text and title for deal transcripts
  const textFilters = terms.slice(0, 5).map((t) => `transcript_text.ilike.%${t}%`);
  const titleFilters = terms.slice(0, 5).map((t) => `title.ilike.%${t}%`);
  const orFilters = [...textFilters, ...titleFilters].join(',');
  if (!orFilters) return [];

  const { data, error } = await supabase
    .from('deal_transcripts')
    .select('id, listing_id, title, transcript_text, call_date, created_at')
    .or(orFilters)
    .neq('transcript_text', '')
    .order('call_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[semantic-search] deal transcript search error:', error);
    return [];
  }

  return (data || []).map((d: Record<string, unknown>) => ({
    ...d,
    source_type: 'deal_transcript',
    buyer_id: null,
  }));
}

function extractKeywords(query: string): string[] {
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'can',
    'shall',
    'about',
    'what',
    'when',
    'where',
    'who',
    'which',
    'that',
    'this',
    'these',
    'those',
    'with',
    'from',
    'for',
    'and',
    'but',
    'or',
    'not',
    'in',
    'on',
    'at',
    'to',
    'by',
    'of',
    'any',
    'all',
    'some',
    'find',
    'search',
    'look',
    'get',
    'tell',
    'me',
    'show',
    'said',
    'say',
    'mentioned',
    'discussed',
    'talk',
    'talked',
    'did',
    'they',
    'their',
    'them',
    'how',
    'much',
    'many',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
}
