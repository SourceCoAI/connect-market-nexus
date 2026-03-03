/**
 * AI Command Center - Tool Registry & Executor
 * Central registry for all tools the AI can call.
 *
 * MERGED Feb 2026: Consolidated ~85 tools to ~40 by merging overlapping tools.
 * Old tool names are still routed via backward-compatibility aliases in each module's executor.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import { dealTools, executeDealTool } from './deal-tools.ts';
import { buyerTools, executeBuyerTool } from './buyer-tools.ts';
import { transcriptTools, executeTranscriptTool } from './transcript-tools.ts';
import { outreachTools, executeOutreachTool } from './outreach-tools.ts';
import { analyticsTools, executeAnalyticsTool } from './analytics-tools.ts';
import { userTools, executeUserTool } from './user-tools.ts';
import { actionTools, executeActionTool } from './action-tools.ts';
import { uiActionTools, executeUIActionTool } from './ui-action-tools.ts';
import { contentTools, executeContentTool } from './content-tools.ts';
import { universeTools, executeUniverseTool } from './universe-tools.ts';
import { signalTools, executeSignalTool } from './signal-tools.ts';
import { leadTools, executeLeadTool } from './lead-tools.ts';
import { contactTools, executeContactTool } from './contact-tools.ts';
import { connectionTools, executeConnectionTool } from './connection-tools.ts';
import { dealExtraTools, executeDealExtraTool } from './deal-extra-tools.ts';
import { followupTools, executeFollowupTool } from './followup-tools.ts';
// cross-deal-analytics-tools is now accessed via analytics-tools.ts (merged into get_analytics)
import {
  crossDealAnalyticsTools as _crossDealAnalyticsTools,
  executeCrossDealAnalyticsTool as _executeCrossDealAnalyticsTool,
} from './cross-deal-analytics-tools.ts';
import { semanticSearchTools, executeSemanticSearchTool } from './semantic-search-tools.ts';
import {
  integrationActionTools,
  executeIntegrationActionTool,
} from './integration-action-tools.ts';
import { proactiveTools, executeProactiveTool } from './proactive-tools.ts';
import { smartleadTools, executeSmartleadTool } from './smartlead-tools.ts';
import { knowledgeTools, executeKnowledgeTool } from './knowledge-tools.ts';
import { taskTools, executeTaskTool } from './task-tools.ts';
import { industryResearchTools, executeIndustryResearchTool } from './industry-research-tools.ts';
import { firefliesSummaryTools, executeFirefliesSummaryTool } from './fireflies-summary-tools.ts';
import { alertTools, executeAlertTool } from './alert-tools.ts';
import { recommendedBuyerTools, executeRecommendedBuyerTool } from './recommended-buyer-tools.ts';

// ---------- Tool Result Types ----------

export interface ToolResult {
  data?: unknown;
  error?: string;
  partial?: boolean;
}

// ---------- All tool definitions ----------
// NOTE: crossDealAnalyticsTools excluded — its analysis types are now served via the merged get_analytics tool

const ALL_TOOLS: ClaudeTool[] = [
  ...dealTools,
  ...buyerTools,
  ...transcriptTools,
  ...outreachTools,
  ...analyticsTools,
  ...userTools,
  ...actionTools,
  ...uiActionTools,
  ...contentTools,
  ...universeTools,
  ...signalTools,
  ...leadTools,
  ...contactTools,
  ...connectionTools,
  ...dealExtraTools,
  ...followupTools,
  // crossDealAnalyticsTools removed — merged into analyticsTools
  ...semanticSearchTools,
  ...integrationActionTools,
  ...proactiveTools,
  ...smartleadTools,
  ...knowledgeTools,
  ...taskTools,
  ...industryResearchTools,
  ...firefliesSummaryTools,
  ...alertTools,
  ...recommendedBuyerTools,
];

// ---------- Backward-compat: old tool name → executor mapping ----------
// Maps old (removed) tool names to the executor that handles them via aliases.
// Each module's switch statement handles the old name internally.
const LEGACY_TOOL_ROUTING: Record<
  string,
  (
    supabase: SupabaseClient,
    name: string,
    args: Record<string, unknown>,
    userId: string,
  ) => Promise<ToolResult>
> = {
  // Transcript merges
  search_buyer_transcripts: (sb, name, args) => executeTranscriptTool(sb, name, args),
  search_fireflies: (sb, name, args) => executeTranscriptTool(sb, name, args),
  // Outreach merge
  get_remarketing_outreach: (sb, name, args) => executeUniverseTool(sb, name, args),
  // Contact enrichment merges
  enrich_buyer_contacts: (sb, name, args, uid) => executeIntegrationActionTool(sb, name, args, uid),
  enrich_linkedin_contact: (sb, name, args, uid) =>
    executeIntegrationActionTool(sb, name, args, uid),
  find_contact_linkedin: (sb, name, args, uid) => executeIntegrationActionTool(sb, name, args, uid),
  find_and_enrich_person: (sb, name, args, uid) =>
    executeIntegrationActionTool(sb, name, args, uid),
  // Deal communication merge
  get_deal_comments: (sb, name, args) => executeDealExtraTool(sb, name, args),
  get_deal_conversations: (sb, name, args) => executeDealExtraTool(sb, name, args),
  // Signal merges
  get_engagement_signals: (sb, name, args) => executeSignalTool(sb, name, args),
  get_buyer_decisions: (sb, name, args) => executeSignalTool(sb, name, args),
  get_interest_signals: (sb, name, args) => executeSignalTool(sb, name, args),
  get_score_history: (sb, name, args) => executeSignalTool(sb, name, args),
  get_buyer_learning_history: (sb, name, args) => executeSignalTool(sb, name, args),
  // Analytics merge
  get_cross_deal_analytics: (sb, name, args) => executeAnalyticsTool(sb, name, args),
};

const TOOL_CATEGORIES: Record<string, string[]> = {
  // Deal pipeline
  DEAL_STATUS: [
    'query_deals',
    'get_deal_details',
    'get_deal_activities',
    'get_pipeline_summary',
    'get_deal_memos',
    'get_deal_documents',
    'get_deal_communication', // merged: was get_deal_comments
    'get_deal_scoring_adjustments',
    'search_contacts',
    'get_connection_requests',
  ],
  FOLLOW_UP: [
    'get_deal_tasks',
    'get_outreach_status',
    'get_outreach_records', // merged: now includes remarketing_outreach
    'get_meeting_action_items',
    'get_current_user_context',
    'get_connection_requests',
    'get_follow_up_queue',
    'get_call_history',
    'get_stale_deals',
    'get_deal_health',
  ],

  // Buyer intelligence
  BUYER_SEARCH: [
    'search_buyers',
    'search_lead_sources',
    'search_valuation_leads',
    'query_deals',
    'search_inbound_leads',
    'select_table_rows',
    'apply_table_filter',
    'sort_table_column',
    'trigger_page_action',
  ],
  BUYER_ANALYSIS: [
    'search_buyers',
    'query_deals',
    'get_buyer_profile',
    'get_top_buyers_for_deal',
    'get_recommended_buyers',
    'generate_buyer_narrative',
    'get_buyer_signals', // merged: was get_buyer_decisions
    'get_buyer_history', // merged: was get_score_history + get_buyer_learning_history
    'search_pe_contacts',
    'search_contacts',
    'select_table_rows',
  ],

  // Universe & outreach
  BUYER_UNIVERSE: [
    'search_buyer_universes',
    'get_universe_details',
    'get_universe_buyer_fits',
    'get_outreach_records', // merged: includes remarketing_outreach
    'get_top_buyers_for_deal',
    'search_buyers',
    'select_table_rows',
    'apply_table_filter',
    'sort_table_column',
    'trigger_page_action',
  ],

  // Meeting intelligence
  MEETING_INTEL: [
    'search_transcripts', // merged: was search_buyer_transcripts + search_transcripts + search_fireflies
    'get_meeting_action_items',
    'semantic_transcript_search',
    'summarize_transcript_to_notes',
    'get_unprocessed_transcripts',
  ],

  // Analytics
  PIPELINE_ANALYTICS: [
    'get_pipeline_summary',
    'query_deals',
    'get_analytics', // merged: now includes cross-deal analysis types
    'get_enrichment_status',
    'get_industry_trackers',
    'get_connection_requests',
  ],
  DAILY_BRIEFING: [
    'get_current_user_context',
    'get_follow_up_queue',
    'get_analytics', // merged: was get_cross_deal_analytics + get_analytics
    'get_deal_tasks',
    'get_outreach_status',
    'get_connection_requests',
    'get_call_history',
    'get_stale_deals',
    'get_deal_health',
    'get_daily_briefing',
    'get_task_inbox',
    'get_overdue_tasks',
    'get_buyer_spotlight',
    'get_deal_signals_summary',
    'get_proactive_alerts',
  ],

  // General / context
  GENERAL: [
    'get_current_user_context',
    'query_deals',
    'search_buyers',
    'search_contacts',
    'get_pipeline_summary',
    'get_follow_up_queue',
    'get_connection_requests',
    'google_search_companies',
    'clay_find_email',
    'enrich_contact',
    'find_contact',
    'retrieve_knowledge',
  ],

  // Actions
  ACTION: [
    'create_deal_task',
    'create_task',
    'complete_deal_task',
    'add_deal_note',
    'log_deal_activity',
    'update_deal_stage',
    'grant_data_room_access',
    'send_document',
    'push_to_phoneburner',
    'push_to_smartlead',
    'reassign_deal_task',
    'convert_to_pipeline_deal',
    'save_contacts_to_crm',
  ],
  UI_ACTION: [
    'select_table_rows',
    'apply_table_filter',
    'sort_table_column',
    'trigger_page_action',
    'navigate_to_page',
  ],

  // Remarketing workflow
  REMARKETING: [
    'search_buyers',
    'get_top_buyers_for_deal',
    'get_universe_buyer_fits',
    'select_table_rows',
    'apply_table_filter',
    'sort_table_column',
    'trigger_page_action',
    'get_buyer_signals', // merged: was get_engagement_signals + get_buyer_decisions
  ],

  // Content generation
  MEETING_PREP: [
    'generate_meeting_prep',
    'search_transcripts', // merged: covers all transcript sources
    'semantic_transcript_search',
    'get_outreach_records', // merged: covers both outreach tables
    'get_connection_messages',
    'generate_eod_recap',
  ],
  OUTREACH_DRAFT: [
    'get_deal_details',
    'get_buyer_profile',
    'draft_outreach_email',
    'search_pe_contacts',
    'search_contacts',
    'get_firm_agreements',
  ],
  PIPELINE_REPORT: ['generate_pipeline_report', 'generate_eod_recap'],

  // Lead & referral
  LEAD_INTEL: [
    'search_inbound_leads',
    'get_referral_data',
    'search_valuation_leads',
    'search_lead_sources',
    'get_deal_referrals',
  ],

  // Signals & engagement
  ENGAGEMENT: [
    'get_buyer_signals', // merged: was get_engagement_signals + get_interest_signals + get_buyer_decisions
    'get_buyer_history', // merged: was get_score_history + get_buyer_learning_history
    'get_call_history',
    'get_document_engagement',
    'get_smartlead_email_history',
  ],

  // Connection requests & conversations
  CONNECTION: ['get_connection_requests', 'get_connection_messages', 'get_deal_communication'], // merged: was get_deal_conversations

  // Contacts & agreements
  CONTACTS: [
    'search_pe_contacts',
    'search_contacts',
    'search_buyers',
    'get_buyer_profile',
    'get_firm_agreements',
    'get_nda_logs',
    'get_call_history',
    'enrich_contact', // merged: was enrich_buyer_contacts + enrich_linkedin_contact
    'find_contact', // merged: was find_contact_linkedin + find_and_enrich_person
    'clay_find_email',
    'send_document',
  ],

  // Platform guide / help — knowledge-based response
  PLATFORM_GUIDE: ['get_current_user_context', 'retrieve_knowledge'],

  // Industry research & trackers
  INDUSTRY: [
    'research_industry',
    'google_search_companies',
    'semantic_transcript_search',
    'search_buyers',
    'search_buyer_universes',
    'get_universe_details',
    'query_deals',
    'get_industry_trackers',
    'retrieve_knowledge',
  ],

  // Cross-deal analytics (now served by merged get_analytics)
  CROSS_DEAL: ['get_analytics', 'get_pipeline_summary'],

  // Semantic search
  SEMANTIC_SEARCH: ['semantic_transcript_search', 'search_transcripts'], // merged: covers all transcript sources

  // Contact enrichment (external API-based)
  CONTACT_ENRICHMENT: [
    'google_search_companies',
    'enrich_contact', // merged: was enrich_buyer_contacts + enrich_linkedin_contact
    'find_contact', // merged: was find_contact_linkedin + find_and_enrich_person
    'clay_find_email',
    'save_contacts_to_crm',
    'search_contacts',
    'search_pe_contacts',
    'search_buyers',
    'get_buyer_profile',
    'push_to_phoneburner',
    'push_to_smartlead',
    'get_smartlead_campaigns',
  ],

  // Document actions
  DOCUMENT_ACTION: [
    'send_document',
    'get_firm_agreements',
    'get_nda_logs',
    'get_document_engagement',
    'search_contacts',
    'search_buyers',
  ],

  // Proactive operations — data quality, health, conflicts, lead matching
  PROACTIVE: [
    'get_data_quality_report',
    'detect_buyer_conflicts',
    'get_deal_health',
    'match_leads_to_deals',
    'get_stale_deals',
  ],

  // EOD / recap
  EOD_RECAP: [
    'generate_eod_recap',
    'get_follow_up_queue',
    'get_deal_health',
    'get_analytics', // merged: was get_cross_deal_analytics
  ],

  // Google search / company discovery
  GOOGLE_SEARCH: [
    'google_search_companies',
    'enrich_contact', // merged: was enrich_buyer_contacts
    'clay_find_email',
    'search_buyers',
    'search_lead_sources',
  ],

  // Pipeline conversion
  DEAL_CONVERSION: [
    'convert_to_pipeline_deal',
    'get_deal_details',
    'search_buyers',
    'get_firm_agreements',
  ],

  // Recommended buyers & strategy narrative (Feature 1)
  RECOMMENDED_BUYERS: [
    'get_recommended_buyers',
    'generate_buyer_narrative',
    'get_deal_details',
    'get_buyer_profile',
    'get_top_buyers_for_deal',
    'get_buyer_signals',
    'add_deal_note',
    'draft_outreach_email',
    'push_to_smartlead',
    'send_document',
  ],

  // Proactive alerts (Feature 2: Proactive Deal Alerts)
  ALERTS: [
    'get_proactive_alerts',
    'dismiss_alert',
    'snooze_alert',
    'get_deal_health',
    'get_data_quality_report',
    'get_deal_signals_summary',
    'get_overdue_tasks',
    'get_stale_deals',
    'create_task',
  ],

  // Transcript summarization (Feature 3: Fireflies Auto-Summary)
  TRANSCRIPT_SUMMARY: [
    'summarize_transcript_to_notes',
    'get_unprocessed_transcripts',
    'search_transcripts',
    'get_meeting_action_items',
    'add_deal_note',
    'create_task',
  ],

  // Smartlead email outreach
  SMARTLEAD_OUTREACH: [
    'get_smartlead_campaigns',
    'get_smartlead_campaign_stats',
    'get_smartlead_email_history',
    'push_to_smartlead',
    'search_buyers',
    'search_contacts',
  ],

  // Task inbox & management
  TASK_INBOX: [
    'get_task_inbox',
    'get_daily_briefing',
    'get_overdue_tasks',
    'get_buyer_spotlight',
    'get_deal_signals_summary',
    'create_task',
    'snooze_task',
    'confirm_ai_task',
    'dismiss_ai_task',
    'add_task_comment',
    'bulk_reassign_tasks',
  ],
};

// Tools that require user confirmation before executing
const CONFIRMATION_REQUIRED = new Set([
  'update_deal_stage',
  'grant_data_room_access',
  'send_document',
  'push_to_phoneburner',
  'push_to_smartlead',
  'save_contacts_to_crm',
  'reassign_deal_task',
  'convert_to_pipeline_deal',
  'create_deal_task',
  'create_task',
  'snooze_task',
  'bulk_reassign_tasks',
  'summarize_transcript_to_notes',
  'dismiss_alert',
  'snooze_alert',
]);

// ---------- Public API ----------

/**
 * Get tools available for a given intent category.
 * When specificTools are provided (from bypass rules), they are MERGED with
 * the category's default tools — not used as a replacement. This ensures
 * Claude always has the full category toolset plus any extras the bypass rule adds.
 */
export function getToolsForCategory(category: string, specificTools?: string[]): ClaudeTool[] {
  const categoryToolNames = TOOL_CATEGORIES[category] || TOOL_CATEGORIES.GENERAL;
  if (specificTools && specificTools.length > 0) {
    const merged = new Set([...categoryToolNames, ...specificTools]);
    return ALL_TOOLS.filter((t) => merged.has(t.name));
  }
  return ALL_TOOLS.filter((t) => categoryToolNames.includes(t.name));
}

/**
 * Get all available tools.
 */
export function getAllTools(): ClaudeTool[] {
  return ALL_TOOLS;
}

/**
 * Check if a tool requires user confirmation.
 */
export function requiresConfirmation(toolName: string): boolean {
  return CONFIRMATION_REQUIRED.has(toolName);
}

/**
 * Execute a tool call by name, routing to the appropriate handler.
 */
export async function executeTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const startTime = Date.now();

  // Enrichment tools get 90s (Apify LinkedIn scraper polls up to 120s internally)
  const ENRICHMENT_TOOLS = new Set([
    'enrich_contact',
    'find_contact',
    'clay_find_email',
    // Legacy names (backward compat)
    'enrich_buyer_contacts',
    'enrich_linkedin_contact',
    'find_and_enrich_person',
    'find_contact_linkedin',
  ]);
  // Other external API tools get 45s (Google search, Fireflies, etc.)
  const EXTERNAL_API_TOOLS = new Set([
    'google_search_companies',
    'push_to_phoneburner',
    'push_to_smartlead',
    'search_fireflies',
    'semantic_transcript_search',
    'research_industry',
    'get_recommended_buyers',
    'generate_buyer_narrative',
  ]);
  const timeoutMs = ENRICHMENT_TOOLS.has(toolName)
    ? 90000
    : EXTERNAL_API_TOOLS.has(toolName)
      ? 45000
      : 15000;

  try {
    const result = await Promise.race([
      _executeToolInternal(supabase, toolName, args, userId),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool timeout (${timeoutMs / 1000}s)`)), timeoutMs),
      ),
    ]);

    const durationMs = Date.now() - startTime;
    console.log(`[ai-cc] Tool ${toolName} completed in ${durationMs}ms`);
    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ai-cc] Tool ${toolName} failed after ${durationMs}ms: ${message}`);
    return { error: message, partial: message.includes('timeout') };
  }
}

async function _executeToolInternal(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const resolvedArgs = resolveCurrentUser(args, userId);

  // Check registered tool modules first (new merged tool names)
  if (dealTools.some((t) => t.name === toolName))
    return executeDealTool(supabase, toolName, resolvedArgs);
  if (buyerTools.some((t) => t.name === toolName))
    return executeBuyerTool(supabase, toolName, resolvedArgs);
  if (transcriptTools.some((t) => t.name === toolName))
    return executeTranscriptTool(supabase, toolName, resolvedArgs);
  if (outreachTools.some((t) => t.name === toolName))
    return executeOutreachTool(supabase, toolName, resolvedArgs);
  if (analyticsTools.some((t) => t.name === toolName))
    return executeAnalyticsTool(supabase, toolName, resolvedArgs);
  if (userTools.some((t) => t.name === toolName))
    return executeUserTool(supabase, toolName, resolvedArgs, userId);
  if (actionTools.some((t) => t.name === toolName))
    return executeActionTool(supabase, toolName, resolvedArgs, userId);
  if (uiActionTools.some((t) => t.name === toolName))
    return executeUIActionTool(supabase, toolName, resolvedArgs);
  if (contentTools.some((t) => t.name === toolName))
    return executeContentTool(supabase, toolName, resolvedArgs);
  if (universeTools.some((t) => t.name === toolName))
    return executeUniverseTool(supabase, toolName, resolvedArgs);
  if (signalTools.some((t) => t.name === toolName))
    return executeSignalTool(supabase, toolName, resolvedArgs);
  if (leadTools.some((t) => t.name === toolName))
    return executeLeadTool(supabase, toolName, resolvedArgs);
  if (contactTools.some((t) => t.name === toolName))
    return executeContactTool(supabase, toolName, resolvedArgs);
  if (connectionTools.some((t) => t.name === toolName))
    return executeConnectionTool(supabase, toolName, resolvedArgs);
  if (dealExtraTools.some((t) => t.name === toolName))
    return executeDealExtraTool(supabase, toolName, resolvedArgs);
  if (followupTools.some((t) => t.name === toolName))
    return executeFollowupTool(supabase, toolName, resolvedArgs, userId);
  if (semanticSearchTools.some((t) => t.name === toolName))
    return executeSemanticSearchTool(supabase, toolName, resolvedArgs);
  if (integrationActionTools.some((t) => t.name === toolName))
    return executeIntegrationActionTool(supabase, toolName, resolvedArgs, userId);
  if (proactiveTools.some((t) => t.name === toolName))
    return executeProactiveTool(supabase, toolName, resolvedArgs);
  if (smartleadTools.some((t) => t.name === toolName))
    return executeSmartleadTool(supabase, toolName, resolvedArgs, userId);
  if (knowledgeTools.some((t) => t.name === toolName))
    return executeKnowledgeTool(supabase, toolName, resolvedArgs);
  if (taskTools.some((t) => t.name === toolName))
    return executeTaskTool(supabase, toolName, resolvedArgs, userId);
  if (industryResearchTools.some((t) => t.name === toolName))
    return executeIndustryResearchTool(supabase, toolName, resolvedArgs);
  if (firefliesSummaryTools.some((t) => t.name === toolName))
    return executeFirefliesSummaryTool(supabase, toolName, resolvedArgs, userId);
  if (alertTools.some((t) => t.name === toolName))
    return executeAlertTool(supabase, toolName, resolvedArgs, userId);
  if (recommendedBuyerTools.some((t) => t.name === toolName))
    return executeRecommendedBuyerTool(supabase, toolName, resolvedArgs);

  // Backward compatibility: route old (merged) tool names to their new executors
  const legacyRouter = LEGACY_TOOL_ROUTING[toolName];
  if (legacyRouter) {
    console.log(`[ai-cc] Legacy tool name "${toolName}" — routing via backward compat`);
    return legacyRouter(supabase, toolName, resolvedArgs, userId);
  }

  return { error: `Unknown tool: ${toolName}` };
}

function resolveCurrentUser(
  args: Record<string, unknown>,
  userId: string,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    resolved[key] = value === 'CURRENT_USER' ? userId : value;
  }
  return resolved;
}
