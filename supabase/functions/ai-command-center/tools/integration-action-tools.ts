/**
 * Integration Action Tools
 * Tools that integrate with external services: contact enrichment (Serper+Prospeo),
 * PhoneBurner dialer push, and DocuSeal document sending.
 *
 * These tools call external APIs directly using shared clients or API keys from env,
 * avoiding the need to call other edge functions (which require JWT auth).
 *
 * Contact discovery uses Serper (Google search) to find decision makers at companies,
 * replacing the previous Apify LinkedIn scraping approach. This is faster (~2s vs ~60-120s),
 * more reliable (no actor polling/timeouts), and cheaper (Serper vs Apify credits).
 *
 * MERGED Feb 2026: Contact enrichment tools consolidated:
 *   enrich_buyer_contacts + enrich_linkedin_contact → enrich_contact (with mode param)
 *   find_contact_linkedin + find_and_enrich_person → find_contact (with mode param)
 *
 * REFACTORED Mar 2026: Split from monolithic 2,899-line file into domain-based modules
 * under ./integration/. This file now re-exports everything to maintain the same public API.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
type SupabaseClient = ReturnType<typeof createClient>;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// Import from domain-based modules
import {
  searchToolDefinitions,
  googleSearchCompanies,
  contactToolDefinitions,
  saveContactsToCrm,
  enrichmentToolDefinitions,
  enrichBuyerContacts,
  enrichLinkedInContact,
  findAndEnrichPerson,
  findDecisionMakers,
  findContactLinkedIn,
  outreachToolDefinitions,
  pushToPhoneBurner,
  agreementToolDefinitions,
  sendDocument,
  clayToolDefinitions,
  clayFindEmail,
} from './integration/index.ts';

// ---------- Tool definitions ----------
// Assembled from domain-based modules — same tools as before, same order.

export const integrationActionTools: ClaudeTool[] = [
  ...searchToolDefinitions,
  ...contactToolDefinitions,
  ...enrichmentToolDefinitions,
  ...outreachToolDefinitions,
  ...agreementToolDefinitions,
  ...clayToolDefinitions,
];

// ---------- Executor ----------

export async function executeIntegrationActionTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'google_search_companies':
      return googleSearchCompanies(args);
    case 'save_contacts_to_crm':
      return saveContactsToCrm(supabase, args, userId);
    // Merged: enrich_contact routes to company or linkedin mode
    case 'enrich_contact': {
      const mode = (args.mode as string) || (args.linkedin_url ? 'linkedin' : 'company');
      if (mode === 'linkedin') return enrichLinkedInContact(supabase, args, userId);
      return enrichBuyerContacts(supabase, args, userId);
    }
    // Merged: find_contact routes to person or linkedin_search mode
    case 'find_contact': {
      const mode = (args.mode as string) || (args.contact_ids ? 'linkedin_search' : 'person');
      if (mode === 'linkedin_search') return findContactLinkedIn(supabase, args, userId);
      if (mode === 'decision_makers') return findDecisionMakers(supabase, args, userId);
      return findAndEnrichPerson(supabase, args, userId);
    }
    case 'push_to_phoneburner':
      return pushToPhoneBurner(supabase, args, userId);
    case 'send_document':
      return sendDocument(supabase, args, userId);
    case 'clay_find_email':
      return clayFindEmail(supabase, args, userId);
    // Backward compatibility aliases for old tool names
    case 'enrich_buyer_contacts':
      return enrichBuyerContacts(supabase, args, userId);
    case 'enrich_linkedin_contact':
      return enrichLinkedInContact(supabase, args, userId);
    case 'find_and_enrich_person':
      return findAndEnrichPerson(supabase, args, userId);
    case 'find_contact_linkedin':
      return findContactLinkedIn(supabase, args, userId);
    default:
      return { error: `Unknown integration action tool: ${toolName}` };
  }
}
