/**
 * Connection Request & Messaging Tools
 * Buyer connection requests, deal conversation messages, NDA/fee agreement tracking.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
type SupabaseClient = ReturnType<typeof createClient>;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const connectionTools: ClaudeTool[] = [
  {
    name: 'get_connection_requests',
    description: `Get buyer connection requests for deals — formal requests from buyers/leads to connect with a listing.
DATA SOURCE: connection_requests table.
USE WHEN: "who requested access to this deal", "pending connection requests", "NDA signed connections".
SEARCHABLE FIELDS: search param checks lead_name, lead_email, lead_company, lead_role, decision_notes, last_message_preview.
Includes NDA status, fee agreement status, conversation state, approval/rejection info.`,
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'Filter by deal/listing UUID' },
        status: { type: 'string', description: 'Filter by status: pending, approved, rejected' },
        conversation_state: {
          type: 'string',
          description: 'Filter by conversation state: new, active, resolved',
        },
        has_nda: { type: 'boolean', description: 'Filter to requests where NDA was signed' },
        has_fee_agreement: {
          type: 'boolean',
          description: 'Filter to requests where fee agreement was signed',
        },
        search: {
          type: 'string',
          description:
            'Search across lead_name, lead_email, lead_company, lead_role, decision_notes, last_message_preview',
        },
        days: { type: 'number', description: 'Lookback period in days (default 90)' },
        limit: { type: 'number', description: 'Max results (default 100)' },
      },
      required: [],
    },
  },
  {
    name: 'get_connection_messages',
    description:
      'Get messages in a buyer-admin conversation thread for a connection request. Shows the actual back-and-forth communication between the deal team and a buyer, including system messages and decisions. Use to review what was said in a specific buyer conversation.',
    input_schema: {
      type: 'object',
      properties: {
        connection_request_id: {
          type: 'string',
          description: 'The connection request UUID to get messages for',
        },
        deal_id: {
          type: 'string',
          description: 'Get all messages across all connection requests for a deal',
        },
        sender_role: { type: 'string', description: 'Filter by sender: admin or buyer' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeConnectionTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_connection_requests':
      return getConnectionRequests(supabase, args);
    case 'get_connection_messages':
      return getConnectionMessages(supabase, args);
    default:
      return { error: `Unknown connection tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function getConnectionRequests(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 100, 1000);
  const days = Number(args.days) || 90;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabase
    .from('connection_requests')
    .select(
      'id, listing_id, user_id, status, lead_name, lead_email, lead_phone, lead_role, lead_company, lead_nda_signed, lead_nda_signed_at, lead_fee_agreement_signed, lead_fee_agreement_signed_at, firm_id, approved_by, approved_at, rejected_by, rejected_at, decision_notes, conversation_state, last_message_at, last_message_preview, buyer_priority_score, deal_specific_buyer_score, created_at, updated_at',
    )
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) query = query.eq('listing_id', args.deal_id as string);
  if (args.status) query = query.eq('status', args.status as string);
  if (args.conversation_state)
    query = query.eq('conversation_state', args.conversation_state as string);
  if (args.has_nda === true) query = query.eq('lead_nda_signed', true);
  if (args.has_fee_agreement === true) query = query.eq('lead_fee_agreement_signed', true);

  const { data, error } = await query;
  if (error) return { error: error.message };

  let results = data || [];
  const totalFromDb = results.length;

  if (args.search) {
    const term = (args.search as string).toLowerCase();
    results = results.filter(
      (r: {
        lead_name?: string;
        lead_email?: string;
        lead_company?: string;
        lead_role?: string;
        decision_notes?: string;
        last_message_preview?: string;
      }) =>
        r.lead_name?.toLowerCase().includes(term) ||
        r.lead_email?.toLowerCase().includes(term) ||
        r.lead_company?.toLowerCase().includes(term) ||
        r.lead_role?.toLowerCase().includes(term) ||
        r.decision_notes?.toLowerCase().includes(term) ||
        r.last_message_preview?.toLowerCase().includes(term),
    );
  }

  const byStatus: Record<string, number> = {};
  const byConvState: Record<string, number> = {};
  let nda_signed = 0,
    fee_signed = 0;
  for (const r of results as any[]) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const cs = r.conversation_state || 'new';
    byConvState[cs] = (byConvState[cs] || 0) + 1;
    if (r.lead_nda_signed) nda_signed++;
    if (r.lead_fee_agreement_signed) fee_signed++;
  }

  const filtersApplied: Record<string, unknown> = { lookback_days: days };
  if (args.deal_id) filtersApplied.deal_id = args.deal_id;
  if (args.status) filtersApplied.status = args.status;
  if (args.conversation_state) filtersApplied.conversation_state = args.conversation_state;
  if (args.has_nda) filtersApplied.has_nda = args.has_nda;
  if (args.has_fee_agreement) filtersApplied.has_fee_agreement = args.has_fee_agreement;
  if (args.search) filtersApplied.search = args.search;

  return {
    data: {
      requests: results,
      total: results.length,
      total_before_filtering: totalFromDb,
      by_status: byStatus,
      by_conversation_state: byConvState,
      nda_signed,
      fee_agreement_signed: fee_signed,
      filters_applied: filtersApplied,
      ...(results.length === 0
        ? {
            suggestion:
              totalFromDb > 0
                ? `${totalFromDb} connection requests found in the last ${days} days but none matched your search "${args.search}". Try broader keywords.`
                : `No connection requests found in the last ${days} days. Try increasing the days parameter or removing status/deal_id filters.`,
          }
        : {}),
    },
  };
}

async function getConnectionMessages(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 500);

  // If deal_id provided, first resolve all connection request IDs for that deal
  let connectionRequestIds: string[] | null = null;
  if (args.deal_id && !args.connection_request_id) {
    const { data: crData } = await supabase
      .from('connection_requests')
      .select('id')
      .eq('listing_id', args.deal_id as string);
    connectionRequestIds = (crData || []).map((r: { id: string }) => r.id);
    if (connectionRequestIds!.length === 0) return { data: { messages: [], total: 0 } };
  }

  let query = supabase
    .from('connection_messages')
    .select(
      'id, connection_request_id, sender_id, sender_role, body, message_type, is_read_by_buyer, is_read_by_admin, created_at',
    )
    .order('created_at', { ascending: true })
    .limit(limit);

  if (args.connection_request_id) {
    query = query.eq('connection_request_id', args.connection_request_id as string);
  } else if (connectionRequestIds) {
    query = query.in('connection_request_id', connectionRequestIds);
  }
  if (args.sender_role) query = query.eq('sender_role', args.sender_role as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const messages = data || [];
  return {
    data: {
      messages,
      total: messages.length,
      unread_by_admin: messages.filter(
        (m: { is_read_by_admin: boolean; sender_role: string }) =>
          !m.is_read_by_admin && m.sender_role === 'buyer',
      ).length,
      unread_by_buyer: messages.filter(
        (m: { is_read_by_buyer: boolean; sender_role: string }) =>
          !m.is_read_by_buyer && m.sender_role === 'admin',
      ).length,
    },
  };
}
