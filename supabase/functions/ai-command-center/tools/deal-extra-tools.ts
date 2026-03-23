/**
 * Deal Extra Tools
 * Deal comments, referrals, listing conversations, scoring adjustments.
 *
 * MERGED Feb 2026: get_deal_comments + get_deal_conversations
 * → unified get_deal_communication with a `source` parameter.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
type SupabaseClient = ReturnType<typeof createClient>;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const dealExtraTools: ClaudeTool[] = [
  {
    name: 'get_deal_communication',
    description:
      'Get deal communication — internal admin comments and/or listing conversation threads. Use `source` to target specific data: "comments" for internal deal team notes/observations, "conversations" for messaging threads between admins and buyers/sellers, or "all" for both.',
    input_schema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['comments', 'conversations', 'all'],
          description:
            '"comments" for internal admin comments/notes, "conversations" for listing message threads, "all" for both (default "all")',
        },
        deal_id: { type: 'string', description: 'Filter by deal/listing UUID' },
        connection_request_id: {
          type: 'string',
          description:
            'Filter conversations by specific connection request UUID (conversations only)',
        },
        status: {
          type: 'string',
          description: 'Filter conversations by status (conversations only)',
        },
        days: { type: 'number', description: 'Lookback period in days for comments (default 30)' },
        limit: {
          type: 'number',
          description: 'Max results per source (default 50 for comments, 25 for conversations)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_deal_referrals',
    description:
      'Get deal referral emails — tracking when a deal listing was shared via email referral. Shows recipient, open/conversion status, delivery tracking, and whether the referral led to a connection request.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'Filter by deal/listing UUID' },
        converted: {
          type: 'boolean',
          description: 'Filter by whether the referral converted to a connection request',
        },
        opened: { type: 'boolean', description: 'Filter by whether the referral email was opened' },
        days: { type: 'number', description: 'Lookback period in days (default 90)' },
        limit: { type: 'number', description: 'Max results (default 100)' },
      },
      required: [],
    },
  },
  {
    name: 'get_deal_scoring_adjustments',
    description:
      "Get scoring weight adjustments and custom AI instructions for a deal — geography/service weight multipliers, custom scoring instructions, and historical pass/approve counts by dimension. Use to understand why a deal's buyer scoring is tuned differently from defaults. Note: size_weight_mult is legacy and has no effect on v3 scoring.",
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'Filter by deal/listing UUID' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeDealExtraTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    // Merged tool
    case 'get_deal_communication':
      return getDealCommunication(supabase, args);
    // Backward compatibility aliases
    case 'get_deal_comments':
      return getDealCommunication(supabase, { ...args, source: 'comments' });
    case 'get_deal_conversations':
      return getDealCommunication(supabase, { ...args, source: 'conversations' });
    case 'get_deal_referrals':
      return getDealReferrals(supabase, args);
    case 'get_deal_scoring_adjustments':
      return getDealScoringAdjustments(supabase, args);
    default:
      return { error: `Unknown deal extra tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function getDealCommunication(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const source = (args.source as string) || 'all';
  const results: Record<string, unknown> = { source_filter: source };
  const errors: string[] = [];

  if (source === 'all' || source === 'comments') {
    const res = await getDealComments(supabase, args);
    if (res.error) errors.push(`comments: ${res.error}`);
    else results.comments = res.data;
  }

  if (source === 'all' || source === 'conversations') {
    const res = await getDealConversations(supabase, args);
    if (res.error) errors.push(`conversations: ${res.error}`);
    else results.conversations = res.data;
  }

  if (errors.length > 0) results.errors = errors;
  return { data: results };
}

async function getDealComments(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 200);
  const days = Number(args.days) || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabase
    .from('deal_comments')
    .select('id, deal_id, admin_id, comment_text, mentioned_admins, created_at, updated_at')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) query = query.eq('deal_id', args.deal_id as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return { data: { comments: data || [], total: (data || []).length } };
}

async function getDealReferrals(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 100, 500);
  const days = Number(args.days) || 90;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabase
    .from('deal_referrals')
    .select(
      'id, listing_id, referrer_user_id, recipient_email, recipient_name, personal_message, opened, opened_at, converted, converted_at, delivery_status, sent_at, created_at',
    )
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) query = query.eq('listing_id', args.deal_id as string);
  if (args.converted === true) query = query.eq('converted', true);
  if (args.converted === false) query = query.eq('converted', false);
  if (args.opened === true) query = query.eq('opened', true);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const referrals = data || [];
  return {
    data: {
      referrals,
      total: referrals.length,
      opened: referrals.filter((r: { opened: boolean }) => r.opened).length,
      converted: referrals.filter((r: { converted: boolean }) => r.converted).length,
    },
  };
}

/**
 * Get deal conversations via listing_conversations + connection_messages.
 * Updated Feb 2026: listing_messages table was dropped in the migration.
 * Messages now come from connection_messages joined via connection_request_id.
 */
async function getDealConversations(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 25, 100);

  let convQuery = supabase
    .from('listing_conversations')
    .select(
      'id, listing_id, connection_request_id, user_id, admin_id, status, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) convQuery = convQuery.eq('listing_id', args.deal_id as string);
  if (args.connection_request_id)
    convQuery = convQuery.eq('connection_request_id', args.connection_request_id as string);
  if (args.status) convQuery = convQuery.eq('status', args.status as string);

  const { data: conversations, error } = await convQuery;
  if (error) return { error: error.message };

  const convs = conversations || [];
  if (convs.length === 0) return { data: { conversations: [], total: 0, total_messages: 0 } };

  // Fetch messages via connection_messages joined through connection_request_id
  const connectionRequestIds = convs
    .map((c: { connection_request_id?: string }) => c.connection_request_id)
    .filter(Boolean);

  let messages: Record<string, unknown>[] = [];
  if (connectionRequestIds.length > 0) {
    const { data: msgData } = await supabase
      .from('connection_messages')
      .select(
        'id, connection_request_id, sender_type, message_text, is_internal_note, read_at, created_at',
      )
      .in('connection_request_id', connectionRequestIds)
      .order('created_at', { ascending: true })
      .limit(500);
    messages = (msgData || []) as Record<string, unknown>[];
  }

  // Group messages by connection_request_id, then map back to conversations
  const msgsByConnReq: Record<string, unknown[]> = {};
  for (const m of messages) {
    const key = m.connection_request_id as string;
    if (!msgsByConnReq[key]) msgsByConnReq[key] = [];
    msgsByConnReq[key].push(m);
  }

  const enriched = convs.map(
    (c: {
      id: string;
      listing_id: string;
      connection_request_id?: string;
      user_id: string;
      admin_id: string;
      status: string;
      created_at: string;
      updated_at: string;
    }) => ({
      ...c,
      messages: c.connection_request_id ? msgsByConnReq[c.connection_request_id] || [] : [],
    }),
  );

  return {
    data: {
      conversations: enriched,
      total: enriched.length,
      total_messages: messages.length,
    },
  };
}

async function getDealScoringAdjustments(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 10, 50);

  let query = supabase
    .from('deal_scoring_adjustments')
    .select(
      'id, listing_id, adjustment_type, adjustment_value, reason, created_by, geography_weight_mult, size_weight_mult, services_weight_mult, custom_instructions, approved_count, rejected_count, passed_geography, passed_size, passed_services, last_calculated_at, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) query = query.eq('listing_id', args.deal_id as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return { data: { adjustments: data || [], total: (data || []).length } };
}
