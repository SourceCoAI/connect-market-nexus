/**
 * Integration Tools — Barrel Export
 *
 * Re-exports all integration tool definitions and executors from domain-based files.
 * This module was split from the monolithic integration-action-tools.ts (2,899 lines)
 * into domain-based files for maintainability:
 *
 *   - search-tools.ts      — google_search_companies
 *   - contact-tools.ts     — save_contacts_to_crm
 *   - enrichment-tools.ts  — enrich_contact (company/linkedin), find_contact (person/decision_makers/linkedin_search)
 *   - outreach-tools.ts    — push_to_phoneburner
 *   - agreement-tools.ts   — send_document
 *   - common.ts            — shared types, helpers (title matching, LinkedIn scoring, discovery)
 */

// Search tools
export { searchToolDefinitions, googleSearchCompanies } from './search-tools.ts';

// Contact CRM tools
export { contactToolDefinitions, saveContactsToCrm } from './contact-tools.ts';

// Enrichment tools
export {
  enrichmentToolDefinitions,
  enrichBuyerContacts,
  enrichLinkedInContact,
  findAndEnrichPerson,
  findDecisionMakers,
  findContactLinkedIn,
} from './enrichment-tools.ts';

// Outreach tools
export { outreachToolDefinitions, pushToPhoneBurner } from './outreach-tools.ts';

// Agreement tools
export { agreementToolDefinitions, sendDocument } from './agreement-tools.ts';

// Clay email lookup tools + shared helpers
export {
  clayToolDefinitions,
  clayFindEmail,
  clayLookupEmail,
  clayBatchSend,
  clayBatchPoll,
} from './clay-tools.ts';
export type { ClayLookupParams, ClayLookupResult } from './clay-tools.ts';

// Re-export common types for external consumers
export type { SupabaseClient, ClaudeTool, ToolResult } from './common.ts';
export type { DiscoveredContact, LinkedInMatch } from './common.ts';
