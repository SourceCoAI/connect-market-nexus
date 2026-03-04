/**
 * Schema integrity and CRUD tests for the SystemTestRunner.
 *
 * Categories 1-7:
 *  1. Schema Integrity
 *  2. Contacts — Buyer Side
 *  3. Contacts — Seller Side
 *  4. Data Room — Documents
 *  5. Access Matrix
 *  6. Release Log
 *  7. Tracked Links
 */

import type { TestDef } from './types';
import { supabase, columnExists, tableReadable, invokeEdgeFunction } from './types';

export function buildSchemaTests(): TestDef[] {
  const tests: TestDef[] = [];
  const add = (category: string, name: string, fn: TestDef['fn']) =>
    tests.push({ id: `${category}::${name}`, name, category, fn });

  // ═══════════════════════════════════════════
  // CATEGORY 1: Database Schema Integrity
  // ═══════════════════════════════════════════
  const C1 = '1. Schema Integrity';

  add(C1, 'contacts table exists', async () => {
    await tableReadable('contacts');
  });

  const requiredContactCols = [
    'first_name',
    'last_name',
    'email',
    'contact_type',
    'firm_id',
    'remarketing_buyer_id',
    'profile_id',
    'listing_id',
    'is_primary_at_firm',
    'is_primary_seller_contact',
    'nda_signed',
    'fee_agreement_signed',
  ];
  for (const col of requiredContactCols) {
    add(C1, `contacts has '${col}' column`, async () => {
      await columnExists('contacts', col);
    });
  }

  add(C1, 'buyers has marketplace_firm_id column', async () => {
    await columnExists('buyers', 'marketplace_firm_id');
  });

  add(C1, 'data_room_access has contact_id column', async () => {
    await columnExists('data_room_access', 'contact_id');
  });

  add(C1, 'data_room_access has access_token column', async () => {
    await columnExists('data_room_access', 'access_token');
  });

  add(C1, 'remarketing_outreach has contact_id column', async () => {
    await columnExists('remarketing_outreach', 'contact_id');
  });

  add(C1, 'document_release_log has contact_id column', async () => {
    await columnExists('document_release_log', 'contact_id');
  });

  add(C1, 'document_tracked_links has contact_id column', async () => {
    await columnExists('document_tracked_links', 'contact_id');
  });

  add(C1, 'resolve_contact_agreement_status RPC exists', async () => {
    // Try calling the RPC with a dummy ID — expect "not found" not "function does not exist"
    const { error } = await supabase.rpc('resolve_contact_agreement_status', {
      p_contact_id: '00000000-0000-0000-0000-000000000000',
    });
    if (error?.message?.includes('does not exist')) {
      throw new Error('RPC resolve_contact_agreement_status does not exist');
    }
    // Any other error (e.g. not found) is fine — means the RPC exists
  });

  add(C1, 'contacts backfill ran (count > 0)', async () => {
    const { count, error } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    if (!count || count === 0)
      throw new Error('contacts table is empty — backfill may not have run');
  });

  add(C1, 'seller contacts backfill ran', async () => {
    const { count, error } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('contact_type', 'seller');
    if (error) throw new Error(error.message);
    if (!count || count === 0) throw new Error('No seller contacts found');
  });

  add(C1, 'buyer contacts backfill ran', async () => {
    const { count, error } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('contact_type', 'buyer');
    if (error) throw new Error(error.message);
    if (!count || count === 0) throw new Error('No buyer contacts found');
  });

  add(C1, 'marketplace_firm_id match ran on buyers', async () => {
    const { count, error } = await supabase
      .from('buyers')
      .select('id', { count: 'exact', head: true })
      .not('marketplace_firm_id', 'is', null);
    if (error) throw new Error(error.message);
    // This is informational — only fail if firm_agreements exist but no matches
    if (!count || count === 0) {
      const { count: faCount } = await supabase
        .from('firm_agreements')
        .select('id', { count: 'exact', head: true });
      if (faCount && faCount > 0) {
        throw new Error('firm_agreements exist but no buyers have marketplace_firm_id set');
      }
    }
  });

  // ═══════════════════════════════════════════
  // CATEGORY 2: Contacts — Buyer Side
  // ═══════════════════════════════════════════
  const C2 = '2. Contacts — Buyer Side';
  let testContactId: string | null = null;
  let testLinkToken: string | null = null;

  add(C2, 'Create buyer contact', async (ctx) => {
    // Get first buyer
    const { data: buyers, error: buyersError } = await supabase
      .from('buyers')
      .select('id')
      .limit(1);
    if (buyersError) throw buyersError;
    if (!buyers?.length) throw new Error('No buyers found to test with');
    ctx.testBuyerId = buyers[0].id;

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        contact_type: 'buyer',
        remarketing_buyer_id: ctx.testBuyerId,
        first_name: 'QATest',
        last_name: 'BuyerContact',
        email: 'qa-test-buyer@sourceco-test.local',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    testContactId = data.id;
    ctx.createdContactIds.push(data.id);
  });

  add(C2, 'Read buyer contact', async () => {
    if (!testContactId) throw new Error('No test contact created');
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', testContactId)
      .single();
    if (error) throw new Error(error.message);
    if (data.first_name !== 'QATest') throw new Error('first_name mismatch');
  });

  add(C2, 'Update buyer contact', async () => {
    if (!testContactId) throw new Error('No test contact created');
    const { error } = await supabase
      .from('contacts')
      .update({ title: 'QA Manager' })
      .eq('id', testContactId);
    if (error) throw new Error(error.message);
    const { data, error: readError } = await supabase
      .from('contacts')
      .select('title')
      .eq('id', testContactId)
      .single();
    if (readError) throw new Error(readError.message);
    if (data?.title !== 'QA Manager') throw new Error('Update not reflected');
  });

  add(C2, 'resolve_contact_agreement_status — no agreements', async () => {
    if (!testContactId) throw new Error('No test contact created');
    const { data, error } = await supabase.rpc('resolve_contact_agreement_status', {
      p_contact_id: testContactId,
    });
    if (error && !error.message.includes('does not exist')) throw new Error(error.message);
    // If RPC exists, check the result
    if (data) {
      // Just verify it returns something structured
      if (typeof data !== 'object') throw new Error('Expected JSONB return');
    }
  });

  add(C2, 'Cleanup buyer contacts', async (ctx) => {
    for (const id of ctx.createdContactIds) {
      await supabase.from('contacts').delete().eq('id', id);
    }
    ctx.createdContactIds = [];
    testContactId = null;
  });

  // ═══════════════════════════════════════════
  // CATEGORY 3: Contacts — Seller Side
  // ═══════════════════════════════════════════
  const C3 = '3. Contacts — Seller Side';
  let sellerTestListingId: string | null = null;
  let originalContactName: string | null = null;

  add(C3, 'Create seller contact (primary)', async (ctx) => {
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id, main_contact_name')
      .eq('status', 'active')
      .limit(1);
    if (listingsError) throw listingsError;
    if (!listings?.length) throw new Error('No active listings to test with');
    sellerTestListingId = listings[0].id;
    originalContactName = listings[0].main_contact_name;
    ctx.testListingId = sellerTestListingId;

    // Clean up stale test contacts from previous runs that may not have cleaned up
    await supabase
      .from('contacts')
      .delete()
      .eq('contact_type', 'seller')
      .eq('listing_id', sellerTestListingId)
      .in('email', [
        'qa-seller-primary@sourceco-test.local',
        'qa-seller-second@sourceco-test.local',
      ]);

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        contact_type: 'seller',
        listing_id: sellerTestListingId,
        first_name: 'QASellerPrimary',
        last_name: 'Test',
        is_primary_seller_contact: true,
        email: 'qa-seller-primary@sourceco-test.local',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    void data.id; // sellerContactId1
    ctx.createdContactIds.push(data.id);
  });

  add(C3, 'Second seller contact (non-primary)', async (ctx) => {
    if (!sellerTestListingId) throw new Error('No test listing');
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        contact_type: 'seller',
        listing_id: sellerTestListingId,
        first_name: 'QASellerSecond',
        last_name: 'Test',
        is_primary_seller_contact: false,
        email: 'qa-seller-second@sourceco-test.local',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    void data.id; // sellerContactId2
    ctx.createdContactIds.push(data.id);
  });

  add(C3, 'Multiple contacts per deal', async () => {
    if (!sellerTestListingId) throw new Error('No test listing');
    const { count, error } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', sellerTestListingId)
      .eq('contact_type', 'seller');
    if (error) throw new Error(error.message);
    if (!count || count < 2) throw new Error(`Expected ≥2 seller contacts, got ${count}`);
  });

  add(C3, 'Cleanup seller contacts + restore listing', async (ctx) => {
    for (const id of ctx.createdContactIds) {
      await supabase.from('contacts').delete().eq('id', id);
    }
    // Restore original contact name
    if (sellerTestListingId && originalContactName !== null) {
      await supabase
        .from('listings')
        .update({ main_contact_name: originalContactName })
        .eq('id', sellerTestListingId);
    }
    ctx.createdContactIds = [];
  });

  // ═══════════════════════════════════════════
  // CATEGORY 4: Data Room — Documents
  // ═══════════════════════════════════════════
  const C4 = '4. Data Room — Documents';

  add(C4, 'data_room_documents readable', async () => {
    await tableReadable('data_room_documents');
  });

  add(C4, 'lead_memos readable', async () => {
    await tableReadable('lead_memos');
  });

  add(C4, 'generate-lead-memo edge function reachable', async () => {
    const { data: listings, error: listingsError2 } = await supabase
      .from('listings')
      .select('id')
      .eq('status', 'active')
      .limit(1);
    if (listingsError2) throw listingsError2;
    const listingId = listings?.[0]?.id || '00000000-0000-0000-0000-000000000000';
    await invokeEdgeFunction('generate-lead-memo', {
      listing_id: listingId,
      memo_type: 'anonymous_teaser',
    });
  });

  // ═══════════════════════════════════════════
  // CATEGORY 5: Data Room — Access Matrix
  // ═══════════════════════════════════════════
  const C5 = '5. Access Matrix';

  add(C5, 'data_room_access readable', async () => {
    await tableReadable('data_room_access');
  });

  add(C5, 'Create + read access record', async (ctx) => {
    // deal_id FK references listings, not deals
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id')
      .limit(1);
    if (listingsError) throw listingsError;
    if (!listings?.length) throw new Error('No listings found');
    ctx.testDealId = listings[0].id;

    // Get or create a contact
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id')
      .limit(1);
    if (contactsError) throw contactsError;
    if (!contacts?.length) throw new Error('No contacts exist to test access matrix');

    const { data, error } = await supabase
      .from('data_room_access')
      .insert({
        deal_id: ctx.testDealId,
        contact_id: contacts[0].id,
        can_view_teaser: true,
      })
      .select('id, access_token')
      .single();
    if (error) throw new Error(error.message);
    if (!data.access_token) throw new Error('access_token not auto-generated');
    ctx.createdAccessIds.push(data.id);
  });

  add(C5, 'Toggle can_view_full_memo', async (ctx) => {
    if (!ctx.createdAccessIds.length) throw new Error('No test access record');
    const { error } = await supabase
      .from('data_room_access')
      .update({ can_view_full_memo: true })
      .eq('id', ctx.createdAccessIds[0]);
    if (error) throw new Error(error.message);
  });

  add(C5, 'Revoke access', async (ctx) => {
    if (!ctx.createdAccessIds.length) throw new Error('No test access record');
    const { error } = await supabase
      .from('data_room_access')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', ctx.createdAccessIds[0]);
    if (error) throw new Error(error.message);
  });

  add(C5, 'Cleanup access records', async (ctx) => {
    for (const id of ctx.createdAccessIds) {
      await supabase.from('data_room_access').delete().eq('id', id);
    }
    ctx.createdAccessIds = [];
  });

  // ═══════════════════════════════════════════
  // CATEGORY 6: Document Distribution — Release Log
  // ═══════════════════════════════════════════
  const C6 = '6. Release Log';

  add(C6, 'document_release_log readable', async () => {
    await tableReadable('document_release_log');
  });

  add(C6, 'Create release log entry with contact_id', async (ctx) => {
    // deal_id FK references listings, not deals
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id')
      .limit(1);
    if (listingsError) throw listingsError;
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id')
      .limit(1);
    if (contactsError) throw contactsError;
    if (!listings?.length || !contacts?.length) throw new Error('Need listings + contacts');

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('document_release_log')
      .insert({
        deal_id: listings[0].id,
        contact_id: contacts[0].id,
        release_method: 'pdf_download',
        released_by: user.id,
        buyer_name: 'QA Test Buyer',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    ctx.createdReleaseLogIds.push(data.id);
  });

  add(C6, 'Cleanup release log entries', async (ctx) => {
    for (const id of ctx.createdReleaseLogIds) {
      await supabase.from('document_release_log').delete().eq('id', id);
    }
    ctx.createdReleaseLogIds = [];
  });

  // ═══════════════════════════════════════════
  // CATEGORY 7: Document Tracked Links
  // ═══════════════════════════════════════════
  const C7 = '7. Tracked Links';

  add(C7, 'document_tracked_links readable', async () => {
    await tableReadable('document_tracked_links');
  });

  add(C7, 'Create tracked link', async (ctx) => {
    // deal_id FK references listings
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id')
      .limit(1);
    if (listingsError) throw listingsError;
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, email')
      .limit(1);
    if (contactsError) throw contactsError;
    if (!listings?.length || !contacts?.length) throw new Error('Need listings + contacts');

    // Get a document (required — document_id FK references deal_documents)
    const { data: dealDocs, error: dealDocsError } = await supabase
      .from('deal_documents')
      .select('id')
      .limit(1);
    if (dealDocsError) throw dealDocsError;
    let docId: string;
    if (!dealDocs?.length) {
      // Try data_room_documents as fallback
      const { data: docs, error: docsError } = await supabase
        .from('data_room_documents')
        .select('id')
        .limit(1);
      if (docsError) throw docsError;
      if (!docs?.length)
        throw new Error('No documents exist to create tracked link (document_id is NOT NULL)');
      docId = docs[0].id;
    } else {
      docId = dealDocs[0].id;
    }

    const token = crypto.randomUUID();
    const { data, error } = await supabase
      .from('document_tracked_links')
      .insert({
        deal_id: listings[0].id,
        contact_id: contacts[0].id,
        buyer_email: contacts[0].email || 'qa@test.local',
        buyer_name: 'QA Test Buyer',
        link_token: token,
        document_id: docId,
        created_by: (await supabase.auth.getUser()).data.user?.id || '',
      })
      .select('id, link_token')
      .single();
    if (error) throw new Error(error.message);
    ctx.createdTrackedLinkIds.push(data.id);
    testLinkToken = data.link_token;
  });

  add(C7, 'record-link-open edge function reachable', async (_ctx) => {
    // Use the real token from the tracked link created above
    await invokeEdgeFunction('record-link-open', {
      link_token: testLinkToken || '00000000-0000-0000-0000-000000000000',
    });
  });

  add(C7, 'Cleanup tracked links', async (ctx) => {
    for (const id of ctx.createdTrackedLinkIds) {
      await supabase.from('document_tracked_links').delete().eq('id', id);
    }
    ctx.createdTrackedLinkIds = [];
  });

  return tests;
}
