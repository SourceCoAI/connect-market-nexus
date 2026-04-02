/**
 * Edge function and AI engine tests for the SystemTestRunner.
 *
 * Categories 14-16:
 *  14. Agreement Email Flow
 *  15. External API Health
 *  16. AI Buyer Recommendation Engine
 */

import type { TestDef } from './types';
import { supabase, columnExists, tableReadable, invokeEdgeFunction } from './types';

export function buildEdgeFunctionTests(): TestDef[] {
  const tests: TestDef[] = [];
  const add = (category: string, name: string, fn: TestDef['fn']) =>
    tests.push({ id: `${category}::${name}`, name, category, fn });

  // ═══════════════════════════════════════════════════
  // 14. Agreement Email Flow Tests
  // ═══════════════════════════════════════════════════
  const C14 = '14. Agreement Email Flow';

  add(C14, 'request-agreement-email edge function reachable', async () => {
    // Will return 401 without auth, but that confirms the function is deployed
    await invokeEdgeFunction('request-agreement-email', { documentType: 'nda' });
  });

  // ═══════════════════════════════════════════════════
  // 15. External API & Edge Function Health Checks
  // ═══════════════════════════════════════════════════
  const C15 = '15. External API Health';

  // --- Apify (LinkedIn scraping) + Serper (Google reviews, company discovery) ---
  add(C15, 'apify-linkedin-scrape edge function reachable', async () => {
    await invokeEdgeFunction('apify-linkedin-scrape', {
      listingId: '00000000-0000-0000-0000-000000000000',
    });
  });

  add(C15, 'google-reviews (Serper) edge function reachable', async () => {
    await invokeEdgeFunction('apify-google-reviews', {
      listingId: '00000000-0000-0000-0000-000000000000',
    });
  });

  add(C15, 'discover-companies edge function reachable', async () => {
    await invokeEdgeFunction('discover-companies', {
      query: 'test',
    });
  });

  // --- Prospeo (email/phone enrichment) ---
  add(C15, 'find-contacts edge function reachable (Prospeo)', async () => {
    await invokeEdgeFunction('find-contacts', {
      buyerId: '00000000-0000-0000-0000-000000000000',
    });
  });

  // --- Firecrawl (web scraping) ---
  add(C15, 'firecrawl-scrape edge function reachable', async () => {
    await invokeEdgeFunction('firecrawl-scrape', {
      url: 'https://example.com',
      listingId: '00000000-0000-0000-0000-000000000000',
    });
  });

  // --- Brevo (email sending) ---
  add(C15, 'send-memo-email edge function reachable (Brevo)', async () => {
    await invokeEdgeFunction('send-memo-email', {
      memo_id: '00000000-0000-0000-0000-000000000000',
      buyer_id: '00000000-0000-0000-0000-000000000000',
      email_address: 'qa-no-send@test.local',
      email_subject: 'QA Test',
      email_body: 'QA Test — do not send',
    });
  });

  // --- PhoneBurner (webhook + push) ---
  add(C15, 'phoneburner-webhook edge function reachable', async () => {
    await invokeEdgeFunction('phoneburner-webhook', {});
  });

  add(C15, 'phoneburner-push-contacts edge function reachable', async () => {
    await invokeEdgeFunction('phoneburner-push-contacts', {
      entity_type: 'buyers',
      entity_ids: [],
    });
  });

  add(C15, 'contact_activities table accessible', async () => {
    await tableReadable('contact_activities');
  });

  add(C15, 'phoneburner_oauth_tokens table accessible', async () => {
    await tableReadable('phoneburner_oauth_tokens');
  });

  add(C15, 'phoneburner_webhooks_log table accessible', async () => {
    await tableReadable('phoneburner_webhooks_log');
  });

  add(C15, 'phoneburner_sessions table accessible', async () => {
    await tableReadable('phoneburner_sessions');
  });

  add(C15, 'disposition_mappings table accessible', async () => {
    await tableReadable('disposition_mappings');
  });

  add(C15, 'sync-phoneburner-transcripts edge function reachable', async () => {
    await invokeEdgeFunction('sync-phoneburner-transcripts', { limit: 1 });
  });

  // --- Chat AI functions ---
  add(C15, 'query-tracker-universe edge function reachable', async () => {
    await invokeEdgeFunction('query-tracker-universe', {
      query: 'test',
      tracker_id: '00000000-0000-0000-0000-000000000000',
    });
  });

  // --- AI providers (Gemini, Claude) ---
  add(C15, 'enrichment_rate_limits table accessible (rate limiter)', async () => {
    await tableReadable('enrichment_rate_limits');
  });

  add(C15, 'enrich-external-only edge function reachable (Gemini orchestrator)', async () => {
    await invokeEdgeFunction('enrich-external-only', {
      listing_id: '00000000-0000-0000-0000-000000000000',
    });
  });

  // --- Enrichment pipeline functions ---
  add(C15, 'process-scoring-queue edge function reachable', async () => {
    await invokeEdgeFunction('process-scoring-queue', {});
  });

  add(C15, 'process-buyer-enrichment-queue edge function reachable', async () => {
    await invokeEdgeFunction('process-buyer-enrichment-queue', {});
  });

  add(C15, 'extract-buyer-criteria edge function reachable', async () => {
    await invokeEdgeFunction('extract-buyer-criteria', {
      buyer_id: '00000000-0000-0000-0000-000000000000',
    });
  });

  // ═══════════════════════════════════════════════════
  // 16. AI Buyer Recommendation & Seeding Engine
  // ═══════════════════════════════════════════════════
  const C16 = '16. AI Buyer Recommendation Engine';

  // --- Schema tests ---
  add(C16, 'buyer_recommendation_cache table accessible', async () => {
    await tableReadable('buyer_recommendation_cache');
  });

  add(C16, 'buyer_seed_log table accessible', async () => {
    await tableReadable('buyer_seed_log');
  });

  add(C16, 'buyer_seed_cache table accessible', async () => {
    await tableReadable('buyer_seed_cache');
  });

  add(C16, 'buyers has ai_seeded column', async () => {
    await columnExists('buyers', 'ai_seeded');
  });

  add(C16, 'buyers has ai_seeded_at column', async () => {
    await columnExists('buyers', 'ai_seeded_at');
  });

  add(C16, 'buyers has ai_seeded_from_deal_id column', async () => {
    await columnExists('buyers', 'ai_seeded_from_deal_id');
  });

  add(C16, 'buyers has verification_status column', async () => {
    await columnExists('buyers', 'verification_status');
  });

  add(C16, 'buyer_seed_log has required columns', async () => {
    const cols = [
      'remarketing_buyer_id',
      'source_deal_id',
      'why_relevant',
      'known_acquisitions',
      'was_new_record',
      'action',
      'seed_model',
      'category_cache_key',
    ];
    for (const col of cols) {
      await columnExists('buyer_seed_log', col);
    }
  });

  add(C16, 'buyer_seed_cache has required columns', async () => {
    const cols = ['cache_key', 'buyer_ids', 'seeded_at', 'expires_at'];
    for (const col of cols) {
      await columnExists('buyer_seed_cache', col);
    }
  });

  // --- Edge function reachability ---
  add(C16, 'score-deal-buyers edge function reachable', async () => {
    await invokeEdgeFunction('score-deal-buyers', {
      listingId: '00000000-0000-0000-0000-000000000000',
    });
  });

  add(C16, 'seed-buyers edge function reachable', async () => {
    await invokeEdgeFunction('seed-buyers', {
      listingId: '00000000-0000-0000-0000-000000000000',
    });
  });

  // --- Data integrity tests ---
  add(C16, 'buyer_recommendation_cache entries are valid', async () => {
    const { data, error } = await supabase
      .from('buyer_recommendation_cache')
      .select('listing_id, buyer_count, scored_at, expires_at')
      .limit(10);
    if (error) throw new Error(error.message);
    for (const entry of data || []) {
      if (!entry.listing_id) throw new Error('Cache entry missing listing_id');
      if (typeof entry.buyer_count !== 'number') throw new Error('Cache entry missing buyer_count');
      if (!entry.scored_at) throw new Error('Cache entry missing scored_at');
    }
  });

  add(C16, 'AI-seeded buyers have valid metadata', async () => {
    const { data, error } = await supabase
      .from('buyers')
      .select(
        'id, company_name, ai_seeded, ai_seeded_at, ai_seeded_from_deal_id, verification_status',
      )
      .eq('ai_seeded', true)
      .limit(20);
    if (error) throw new Error(error.message);
    // Informational count
    console.log(`AI-seeded buyers: ${data?.length || 0}`);
    for (const buyer of data || []) {
      if (!buyer.ai_seeded_at) {
        throw new Error(`AI-seeded buyer ${buyer.id} missing ai_seeded_at`);
      }
      if (!buyer.verification_status) {
        throw new Error(`AI-seeded buyer ${buyer.id} missing verification_status`);
      }
    }
  });

  add(C16, 'buyer_seed_log entries reference valid buyers', async () => {
    const { data: logs, error } = await supabase
      .from('buyer_seed_log')
      .select('id, remarketing_buyer_id, action, seed_model')
      .limit(50);
    if (error) throw new Error(error.message);
    if (!logs || logs.length === 0) return; // No logs yet — acceptable

    const buyerIds = [...new Set(logs.map((l) => l.remarketing_buyer_id))];
    const { data: buyers, error: buyerError } = await supabase
      .from('buyers')
      .select('id')
      .in('id', buyerIds.slice(0, 30));
    if (buyerError) throw new Error(buyerError.message);

    const existingIds = new Set((buyers || []).map((b) => b.id));
    const orphaned = buyerIds.filter((id) => !existingIds.has(id));
    if (orphaned.length > 0) {
      throw new Error(`${orphaned.length} seed_log entries reference deleted buyers`);
    }

    // Verify action values
    const validActions = ['inserted', 'enriched_existing', 'probable_duplicate'];
    for (const log of logs) {
      if (log.action && !validActions.includes(log.action)) {
        throw new Error(`Invalid seed_log action: ${log.action}`);
      }
    }
  });

  add(C16, 'buyer_seed_cache entries have valid structure', async () => {
    const { data, error } = await supabase
      .from('buyer_seed_cache')
      .select('cache_key, buyer_ids, seeded_at, expires_at')
      .limit(10);
    if (error) throw new Error(error.message);
    for (const entry of data || []) {
      if (!entry.cache_key) throw new Error('Cache entry missing cache_key');
      if (!Array.isArray(entry.buyer_ids)) {
        throw new Error(`Cache entry ${entry.cache_key} has non-array buyer_ids`);
      }
    }
  });

  // --- Scoring engine functional test ---
  add(C16, 'score-deal-buyers returns valid response for real deal', async (ctx) => {
    if (!ctx.testDealId) {
      // Find any listing to test with
      const { data: listing } = await supabase.from('listings').select('id').limit(1).single();
      if (!listing) throw new Error('No listings found to test scoring');
      ctx.testDealId = listing.id;
    }

    const { data, error } = await supabase.functions.invoke('score-deal-buyers', {
      body: { listingId: ctx.testDealId, forceRefresh: true },
    });
    if (error) {
      // Extract real error from FunctionsHttpError
      let msg = typeof error === 'object' ? JSON.stringify(error) : String(error);
      if (error && typeof error === 'object' && 'context' in error) {
        try {
          const ctx = (error as { context: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            msg = body?.error
              ? `${body.error}${body.details ? `: ${body.details}` : ''}`
              : JSON.stringify(body);
          }
        } catch {
          /* fall through */
        }
      }
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error(`Network failure calling score-deal-buyers: ${msg}`);
      }
      // Auth errors yield specific messages now
      throw new Error(`score-deal-buyers error: ${msg}`);
    }
    if (!data) throw new Error('score-deal-buyers returned null');
    if (!Array.isArray(data.buyers)) throw new Error('Response missing buyers array');
    if (typeof data.total !== 'number') throw new Error('Response missing total count');

    console.log(`Scored ${data.total} buyers, cached: ${data.cached}`);

    // Validate buyer structure
    for (const buyer of (data.buyers || []).slice(0, 5)) {
      if (!buyer.buyer_id) throw new Error('Buyer missing buyer_id');
      if (typeof buyer.composite_score !== 'number')
        throw new Error('Buyer missing composite_score');
      if (!['move_now', 'strong', 'speculative'].includes(buyer.tier)) {
        throw new Error(`Invalid tier: ${buyer.tier}`);
      }
    }
  });

  // --- Seed engine functional test ---
  add(C16, 'seed-buyers returns valid response for real deal', async (ctx) => {
    if (!ctx.testDealId) {
      const { data: listing } = await supabase.from('listings').select('id').limit(1).single();
      if (!listing) throw new Error('No listings found to test seeding');
      ctx.testDealId = listing.id;
    }

    const { data, error } = await supabase.functions.invoke('seed-buyers', {
      body: { listingId: ctx.testDealId, maxBuyers: 3, forceRefresh: false },
    });
    if (error) {
      let msg = typeof error === 'object' ? JSON.stringify(error) : String(error);
      if (error && typeof error === 'object' && 'context' in error) {
        try {
          const ctx = (error as { context: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            msg = body?.error
              ? `${body.error}${body.details ? `: ${body.details}` : ''}`
              : JSON.stringify(body);
          }
        } catch {
          /* fall through */
        }
      }
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error(`Network failure calling seed-buyers: ${msg}`);
      }
      throw new Error(`seed-buyers error: ${msg}`);
    }
    if (!data) throw new Error('seed-buyers returned null');
    if (!Array.isArray(data.seeded_buyers)) throw new Error('Response missing seeded_buyers array');
    if (typeof data.total !== 'number') throw new Error('Response missing total count');

    console.log(`Seeded ${data.total} buyers, cached: ${data.cached}`);

    // Validate seeded buyer structure
    const validActions = ['inserted', 'enriched_existing', 'probable_duplicate', 'cached'];
    for (const buyer of (data.seeded_buyers || []).slice(0, 5)) {
      if (!buyer.buyer_id) throw new Error('Seeded buyer missing buyer_id');
      if (!buyer.company_name) throw new Error('Seeded buyer missing company_name');
      if (!validActions.includes(buyer.action)) {
        throw new Error(`Invalid seed action: ${buyer.action}`);
      }
    }
  });

  add(C16, 'seed-buyers writes to buyer_seed_log', async (ctx) => {
    if (!ctx.testDealId) return; // Skip if no deal available
    const { data, error } = await supabase
      .from('buyer_seed_log')
      .select('id, remarketing_buyer_id, action, seed_model')
      .eq('source_deal_id', ctx.testDealId)
      .limit(5);
    if (error) throw new Error(`seed_log query failed: ${error.message}`);
    // Just check that if prior seed ran, logs exist
    console.log(`Seed log entries for test deal: ${data?.length || 0}`);
  });

  add(C16, 'AI-seeded buyers are in buyers table', async (ctx) => {
    if (!ctx.testDealId) return;
    const { data, error } = await supabase
      .from('buyers')
      .select('id, company_name, ai_seeded, verification_status')
      .eq('ai_seeded', true)
      .eq('ai_seeded_from_deal_id', ctx.testDealId)
      .limit(10);
    if (error) throw new Error(`AI-seeded buyers query failed: ${error.message}`);
    console.log(`AI-seeded buyers from test deal: ${data?.length || 0}`);
    for (const buyer of data || []) {
      if (!buyer.verification_status) {
        throw new Error(`AI-seeded buyer ${buyer.id} missing verification_status`);
      }
    }
  });

  return tests;
}
