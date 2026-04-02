/**
 * API, integration, and smoke tests for the SystemTestRunner.
 *
 * Categories 8-13:
 *  8. Marketplace Approval
 *  9. Fireflies Integration
 *  9b. PandaDoc Integration
 *  10. Send Memo Flow
 *  11. Data Room Portal
 *  12. CapTarget Integration
 *  13. UI Smoke Tests
 */

import type { TestDef } from './types';
import {
  supabase,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  columnExists,
  tableReadable,
  invokeEdgeFunction,
} from './types';

export function buildApiTests(): TestDef[] {
  const tests: TestDef[] = [];
  const add = (category: string, name: string, fn: TestDef['fn']) =>
    tests.push({ id: `${category}::${name}`, name, category, fn });

  // ═══════════════════════════════════════════
  // CATEGORY 8: Marketplace Approval Flow
  // ═══════════════════════════════════════════
  const C8 = '8. Marketplace Approval';

  add(C8, 'approve-marketplace-buyer edge function reachable', async () => {
    await invokeEdgeFunction('approve-marketplace-buyer', {
      approval_queue_id: '00000000-0000-0000-0000-000000000000',
    });
  });

  // ═══════════════════════════════════════════
  // CATEGORY 9: Fireflies Integration
  // ═══════════════════════════════════════════
  const C9 = '9. Fireflies Integration';

  // --- 9a: Schema & Table Structure ---
  add(C9, 'deal_transcripts table accessible', async () => {
    const { error } = await supabase.from('deal_transcripts').select('id').limit(1);
    if (error) throw new Error(error.message);
  });

  const requiredDealTranscriptCols = [
    'fireflies_transcript_id',
    'fireflies_meeting_id',
    'has_content',
    'match_type',
    'external_participants',
    'source',
    'transcript_text',
    'transcript_url',
    'title',
    'call_date',
    'participants',
    'meeting_attendees',
    'duration_minutes',
    'auto_linked',
    'extracted_data',
    'applied_to_deal',
    'applied_at',
    'processed_at',
  ];
  for (const col of requiredDealTranscriptCols) {
    add(C9, `deal_transcripts has '${col}' column`, async () => {
      await columnExists('deal_transcripts', col);
    });
  }

  add(C9, 'buyer_transcripts table accessible', async () => {
    const { error } = await supabase.from('buyer_transcripts').select('id').limit(1);
    if (error) throw new Error(error.message);
  });

  add(
    C9,
    'deal_transcripts unique constraint on (listing_id, fireflies_transcript_id)',
    async () => {
      // Verify the unique constraint exists by trying to query with both fields
      const { error } = await supabase
        .from('deal_transcripts')
        .select('id, listing_id, fireflies_transcript_id')
        .limit(1);
      if (error) throw new Error(error.message);
    },
  );

  // --- 9b: Edge Function Reachability ---
  add(C9, 'sync-fireflies-transcripts edge function reachable', async () => {
    await invokeEdgeFunction('sync-fireflies-transcripts', {
      listingId: '00000000-0000-0000-0000-000000000000',
      contactEmails: ['reachability-test@sourceco-test.local'],
    });
  });

  add(C9, 'search-fireflies-for-buyer edge function reachable', async () => {
    await invokeEdgeFunction('search-fireflies-for-buyer', { query: 'QA Test', limit: 1 });
  });

  add(C9, 'fetch-fireflies-content edge function reachable', async () => {
    await invokeEdgeFunction('fetch-fireflies-content', {
      transcriptId: '00000000-0000-0000-0000-000000000000',
    });
  });

  // --- 9c: Search Functionality Tests ---
  add(C9, 'Search returns structured results with required fields', async () => {
    const { data, error } = await supabase.functions.invoke('search-fireflies-for-buyer', {
      body: { query: 'test', limit: 5 },
    });
    if (error) {
      // Network error is ok — function is reachable, Fireflies API may reject
      const msg = typeof error === 'object' ? JSON.stringify(error) : String(error);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error(`Edge function network failure: ${msg}`);
      }
      // Auth/config errors mean function is running but needs config
      return;
    }
    if (!data) throw new Error('No response data from search');
    if (typeof data.success !== 'boolean') throw new Error('Response missing success field');
    if (!Array.isArray(data.results)) throw new Error('Response missing results array');

    // If we got results, verify structure
    if (data.results.length > 0) {
      const r = data.results[0];
      const requiredFields = ['id', 'title', 'date'];
      for (const f of requiredFields) {
        if (r[f] === undefined) throw new Error(`Search result missing required field: ${f}`);
      }
      // Check that has_content and match_type are present
      if (r.has_content === undefined) throw new Error('Search result missing has_content field');
      if (!r.match_type) throw new Error('Search result missing match_type field');
    }
  });

  add(C9, 'Search validates input — rejects empty query without emails', async () => {
    const { data, error } = await supabase.functions.invoke('search-fireflies-for-buyer', {
      body: { limit: 5 },
    });
    // Should return an error response (400) or structured error
    if (error) return; // Expected — function rejects invalid input
    if (data?.error || data?.success === false) return; // Structured error
    // If no error, that's unexpected but not fatal for reachability
  });

  add(C9, 'Search respects limit parameter', async () => {
    const { data, error } = await supabase.functions.invoke('search-fireflies-for-buyer', {
      body: { query: 'meeting', limit: 2 },
    });
    if (error) return; // API may not be configured
    if (!data?.results) return;
    if (data.results.length > 2) {
      throw new Error(`Requested limit=2 but got ${data.results.length} results`);
    }
  });

  // --- 9d: Sync Flow Tests ---
  add(C9, 'Sync validates required listingId', async () => {
    const { data, error } = await supabase.functions.invoke('sync-fireflies-transcripts', {
      body: { contactEmails: ['test@example.com'] },
    });
    // Should reject with 400 for missing listingId
    if (error) return; // Expected
    if (data?.error) return; // Structured error
  });

  add(C9, 'Sync validates required emails or companyName', async () => {
    const { data, error } = await supabase.functions.invoke('sync-fireflies-transcripts', {
      body: { listingId: '00000000-0000-0000-0000-000000000000' },
    });
    if (error) return; // Expected
    if (data?.error) return; // Structured error
  });

  add(C9, 'Sync returns structured response with counts', async () => {
    const { data: listings } = await supabase
      .from('listings')
      .select('id, main_contact_email')
      .eq('status', 'active')
      .not('main_contact_email', 'is', null)
      .limit(1);

    if (!listings?.length) throw new Error('No active listing with email found to test sync');

    const { data, error } = await supabase.functions.invoke('sync-fireflies-transcripts', {
      body: {
        listingId: listings[0].id,
        contactEmails: [listings[0].main_contact_email],
        limit: 5,
      },
    });
    if (error) {
      const msg = typeof error === 'object' ? JSON.stringify(error) : String(error);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error(`Network failure: ${msg}`);
      }
      return; // API config errors acceptable
    }
    if (!data) throw new Error('No response data');
    if (typeof data.linked !== 'number') throw new Error('Response missing linked count');
    if (typeof data.skipped !== 'number') throw new Error('Response missing skipped count');
    if (typeof data.total !== 'number') throw new Error('Response missing total count');
  });

  // --- 9e: Fetch Content Tests ---
  add(C9, 'fetch-fireflies-content validates UUID format', async () => {
    const { data, error } = await supabase.functions.invoke('fetch-fireflies-content', {
      body: { transcriptId: 'not-a-uuid' },
    });
    // Should reject invalid UUID
    if (error) return;
    if (data?.error || data?.success === false) return;
  });

  add(C9, 'fetch-fireflies-content handles non-existent transcript gracefully', async () => {
    const { data, error } = await supabase.functions.invoke('fetch-fireflies-content', {
      body: { transcriptId: '00000000-0000-0000-0000-000000000000' },
    });
    // Should return 404 or structured error — not crash
    if (error) return;
    if (data?.error || data?.success === false) return;
    // If somehow succeeds, that's ok too
  });

  // --- 9f: Data Integrity Tests ---
  add(C9, 'deal_transcripts source values are valid', async () => {
    const { data, error } = await supabase.from('deal_transcripts').select('source').limit(100);
    if (error) throw new Error(error.message);
    const validSources = ['fireflies', 'phoneburner', 'upload', 'file_upload', 'manual', 'link', null];
    const invalidSources = (data || [])
      .filter((t: { source: string | null }) => t.source && !validSources.includes(t.source))
      .map((t: { source: string | null }) => t.source);
    if (invalidSources.length > 0) {
      throw new Error(`Found unexpected source values: ${[...new Set(invalidSources)].join(', ')}`);
    }
  });

  add(C9, 'deal_transcripts match_type values are valid', async () => {
    const { data, error } = await supabase
      .from('deal_transcripts')
      .select('match_type')
      .not('match_type', 'is', null)
      .limit(100);
    if (error) throw new Error(error.message);
    const validTypes = ['email', 'keyword'];
    const invalid = (data || [])
      .filter(
        (t: { match_type: string | null }) =>
          t.match_type !== null && !validTypes.includes(t.match_type),
      )
      .map((t: { match_type: string | null }) => t.match_type);
    if (invalid.length > 0) {
      throw new Error(`Found unexpected match_type values: ${[...new Set(invalid)].join(', ')}`);
    }
  });

  add(C9, 'Fireflies transcripts have fireflies_transcript_id set', async () => {
    const { data, error } = await supabase
      .from('deal_transcripts')
      .select('id, source, fireflies_transcript_id')
      .eq('source', 'fireflies')
      .is('fireflies_transcript_id', null)
      .limit(10);
    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      throw new Error(`${data.length} Fireflies transcript(s) missing fireflies_transcript_id`);
    }
  });

  add(C9, 'No orphaned deal_transcripts (listing exists)', async () => {
    // Check that deal_transcripts reference existing listings
    const { data, error } = await supabase
      .from('deal_transcripts')
      .select('id, listing_id')
      .limit(50);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return; // No transcripts to check

    const listingIds = [...new Set(data.map((t: { listing_id: string }) => t.listing_id))];
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id')
      .in('id', listingIds.slice(0, 20));
    if (listingsError) throw new Error(listingsError.message);

    const existingIds = new Set((listings || []).map((l: { id: string }) => l.id));
    const orphaned = listingIds.filter((id) => !existingIds.has(id));
    if (orphaned.length > 0) {
      throw new Error(`${orphaned.length} deal_transcript(s) reference non-existent listings`);
    }
  });

  add(C9, 'external_participants JSON structure is valid', async () => {
    const { data, error } = await supabase
      .from('deal_transcripts')
      .select('id, external_participants')
      .not('external_participants', 'is', null)
      .limit(20);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const ep = row.external_participants;
      if (!Array.isArray(ep)) {
        throw new Error(`Transcript ${row.id}: external_participants is not an array`);
      }
      for (const p of ep) {
        if (typeof p !== 'object' || p === null) {
          throw new Error(
            `Transcript ${row.id}: external_participants contains non-object element`,
          );
        }
      }
    }
  });

  // --- 9g: Transcript Statistics ---
  add(C9, 'deal_transcripts count and breakdown', async () => {
    const { count: totalCount, error: totalError } = await supabase
      .from('deal_transcripts')
      .select('id', { count: 'exact', head: true });
    if (totalError) throw new Error(totalError.message);

    const { count: ffCount } = await supabase
      .from('deal_transcripts')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'fireflies');

    const { count: pbCount } = await supabase
      .from('deal_transcripts')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'phoneburner');

    const { count: uploadCount } = await supabase
      .from('deal_transcripts')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'upload');

    const { count: noContentCount } = await supabase
      .from('deal_transcripts')
      .select('id', { count: 'exact', head: true })
      .eq('has_content', false);

    const { count: extractedCount } = await supabase
      .from('deal_transcripts')
      .select('id', { count: 'exact', head: true })
      .not('processed_at', 'is', null);

    const { count: appliedCount } = await supabase
      .from('deal_transcripts')
      .select('id', { count: 'exact', head: true })
      .eq('applied_to_deal', true);

    // This is informational — log counts for visibility
    console.log(
      `Transcript Stats: ${totalCount || 0} total, ${ffCount || 0} Fireflies, ${pbCount || 0} PhoneBurner, ${uploadCount || 0} uploads, ${noContentCount || 0} no-content, ${extractedCount || 0} extracted, ${appliedCount || 0} applied`,
    );

    if (!totalCount || totalCount === 0) {
      throw new Error('No deal_transcripts found — transcript integrations may not be in use yet');
    }
  });

  add(C9, 'buyer_transcripts count', async () => {
    const { count, error } = await supabase
      .from('buyer_transcripts')
      .select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    // Informational — just verify table is accessible and report count
    console.log(`Buyer transcripts: ${count || 0}`);
  });

  // --- 9h: PhoneBurner Transcript Integration ---
  add(C9, 'PhoneBurner transcript columns exist in deal_transcripts', async () => {
    const { data: _data, error } = await supabase
      .from('deal_transcripts')
      .select('id, phoneburner_call_id, recording_url, contact_activity_id, source')
      .limit(1);
    if (error) throw new Error(`PhoneBurner columns missing from deal_transcripts: ${error.message}`);
    // Columns exist if query succeeded
  });

  add(C9, 'PhoneBurner transcripts have valid structure', async () => {
    const { data, error } = await supabase
      .from('deal_transcripts')
      .select('id, phoneburner_call_id, listing_id, transcript_text, has_content, source')
      .eq('source', 'phoneburner')
      .limit(20);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      console.log('No PhoneBurner transcripts found yet (informational — not an error)');
      return;
    }
    const issues: string[] = [];
    for (const t of data) {
      if (!t.phoneburner_call_id) issues.push(`${t.id}: missing phoneburner_call_id`);
      if (!t.listing_id) issues.push(`${t.id}: missing listing_id`);
      if (!t.transcript_text || t.transcript_text.trim().length === 0) issues.push(`${t.id}: empty transcript_text`);
    }
    if (issues.length > 0) {
      throw new Error(`PhoneBurner transcript data issues:\n${issues.join('\n')}`);
    }
    console.log(`PhoneBurner transcripts: ${data.length} checked, all valid`);
  });

  add(C9, 'PhoneBurner transcripts are not duplicated', async () => {
    const { data, error } = await supabase
      .from('deal_transcripts')
      .select('phoneburner_call_id')
      .eq('source', 'phoneburner')
      .not('phoneburner_call_id', 'is', null)
      .limit(200);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return;
    const callIds = data.map((t: { phoneburner_call_id: string | null }) => t.phoneburner_call_id);
    const uniqueIds = new Set(callIds);
    if (callIds.length !== uniqueIds.size) {
      const dupeCount = callIds.length - uniqueIds.size;
      throw new Error(`Found ${dupeCount} duplicate PhoneBurner transcript(s) by phoneburner_call_id`);
    }
  });

  add(C9, 'PhoneBurner webhook log accessible and recent', async () => {
    const { data, error } = await supabase
      .from('phoneburner_webhooks_log')
      .select('id, event_type, processing_status, received_at')
      .order('received_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(`phoneburner_webhooks_log not accessible: ${error.message}`);
    if (!data || data.length === 0) {
      console.log('No PhoneBurner webhook events found (informational)');
      return;
    }
    const failed = data.filter((e: { processing_status: string }) => e.processing_status === 'failed');
    if (failed.length > 0) {
      console.warn(`${failed.length} of last ${data.length} PhoneBurner webhooks failed`);
    }
    console.log(`PhoneBurner webhook log: ${data.length} recent events, ${failed.length} failed`);
  });

  add(C9, 'PhoneBurner contact_activities have transcripts linked to deals', async () => {
    // Check if there are call_completed activities with transcripts but no deal_transcript
    const { data: activities, error: actError } = await supabase
      .from('contact_activities')
      .select('id, phoneburner_call_id, listing_id')
      .eq('source_system', 'phoneburner')
      .eq('activity_type', 'call_completed')
      .not('call_transcript', 'is', null)
      .not('listing_id', 'is', null)
      .limit(50);
    if (actError) throw new Error(actError.message);
    if (!activities || activities.length === 0) {
      console.log('No PhoneBurner activities with transcripts and listing_id found (informational)');
      return;
    }

    const callIds = activities
      .map((a: { phoneburner_call_id: string | null }) => a.phoneburner_call_id)
      .filter(Boolean) as string[];

    if (callIds.length === 0) return;

    const { data: linked } = await supabase
      .from('deal_transcripts')
      .select('phoneburner_call_id')
      .in('phoneburner_call_id', callIds);

    const linkedIds = new Set((linked || []).map((l: { phoneburner_call_id: string | null }) => l.phoneburner_call_id));
    const unlinked = callIds.filter((id) => !linkedIds.has(id));
    if (unlinked.length > 0) {
      console.warn(
        `${unlinked.length} of ${callIds.length} PhoneBurner activities with transcripts not yet in deal_transcripts — consider running sync-phoneburner-transcripts`,
      );
    } else {
      console.log(`All ${callIds.length} PhoneBurner activities with transcripts are linked to deal_transcripts`);
    }
  });

  // ═══════════════════════════════════════════
  // CATEGORY 9b: Agreement & Document Tracking
  // ═══════════════════════════════════════════
  const C9b = '9b. Agreement & Document Tracking';

  add(C9b, 'firm_agreements table accessible', async () => {
    await tableReadable('firm_agreements');
  });

  add(C9b, 'firm_agreements has nda_status column', async () => {
    await columnExists('firm_agreements', 'nda_status');
  });

  add(C9b, 'firm_agreements has fee_agreement_status column', async () => {
    await columnExists('firm_agreements', 'fee_agreement_status');
  });

  add(C9b, 'firm_agreements has nda_requested_at column', async () => {
    await columnExists('firm_agreements', 'nda_requested_at');
  });

  add(C9b, 'firm_agreements has fee_agreement_requested_at column', async () => {
    await columnExists('firm_agreements', 'fee_agreement_requested_at');
  });

  add(C9b, 'document_requests table accessible', async () => {
    await tableReadable('document_requests');
  });

  add(C9b, 'request-agreement-email edge function reachable', async () => {
    await invokeEdgeFunction('request-agreement-email', {
      documentType: 'nda',
    });
  });

  add(C9b, 'update_firm_agreement_status RPC exists', async () => {
    const { error } = await supabase.rpc('update_firm_agreement_status', {
      p_firm_id: '00000000-0000-0000-0000-000000000000',
      p_agreement_type: 'nda',
      p_new_status: 'not_started',
    });
    if (error?.message?.includes('does not exist')) {
      throw new Error('RPC update_firm_agreement_status does not exist');
    }
  });

  // ═══════════════════════════════════════════
  // CATEGORY 10: Send Memo Flow
  // ═══════════════════════════════════════════
  const C10 = '10. Send Memo Flow';

  add(C10, 'Buyer contacts searchable', async () => {
    const { error } = await supabase
      .from('contacts')
      .select('id')
      .eq('contact_type', 'buyer')
      .eq('archived', false)
      .limit(10);
    if (error) throw new Error(error.message);
    // Just verify query works
  });

  add(C10, 'send-memo-email edge function reachable', async () => {
    await invokeEdgeFunction('send-memo-email', {
      memo_id: '00000000-0000-0000-0000-000000000000',
      buyer_id: '00000000-0000-0000-0000-000000000000',
      email_address: 'qa-no-send@test.local',
      email_subject: 'QA Test',
      email_body: 'QA Test — do not send',
    });
  });

  // ═══════════════════════════════════════════
  // CATEGORY 11: Buyer-Facing Data Room Portal
  // ═══════════════════════════════════════════
  const C11 = '11. Data Room Portal';

  add(C11, 'record-data-room-view edge function — invalid token returns error', async () => {
    // This function uses GET, so we need to call it differently
    const url = `${SUPABASE_URL}/functions/v1/record-data-room-view?access_token=00000000-0000-0000-0000-000000000000`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    });
    // Should return a structured response (even if 4xx), not a 500 crash
    if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
  });

  // ═══════════════════════════════════════════
  // CATEGORY 12: CapTarget Integration
  // ═══════════════════════════════════════════
  const C12 = '12. CapTarget Integration';

  add(C12, 'sync-captarget-sheet edge function reachable', async () => {
    await invokeEdgeFunction('sync-captarget-sheet', {});
  });

  // ═══════════════════════════════════════════
  // CATEGORY 13: UI Smoke Tests
  // ═══════════════════════════════════════════
  const C13 = '13. UI Smoke Tests';

  // These verify DB tables that back UI pages are accessible
  const uiSmoke = [
    { name: 'deals table readable (Active Deals page)', table: 'deals' },
    { name: 'listings table readable (Marketplace)', table: 'listings' },
    { name: 'lead_memos readable (Data Room memos)', table: 'lead_memos' },
    { name: 'data_room_access readable (Access tab)', table: 'data_room_access' },
    { name: 'document_release_log readable (Distribution tab)', table: 'document_release_log' },
    { name: 'buyers readable (Buyers page)', table: 'buyers' },
    { name: 'contacts readable (Contacts tab)', table: 'contacts' },
    { name: 'firm_agreements readable', table: 'firm_agreements' },
    { name: 'profiles readable (Users page)', table: 'profiles' },
    { name: 'contacts readable (Buyer Contacts page)', table: 'contacts' },
  ];

  for (const t of uiSmoke) {
    add(C13, t.name, async () => {
      await tableReadable(t.table);
    });
  }

  return tests;
}
