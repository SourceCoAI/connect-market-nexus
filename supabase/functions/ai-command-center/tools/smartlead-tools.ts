/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Smartlead Tools
 * Tools for interacting with Smartlead cold email campaigns:
 * listing campaigns, viewing email history for contacts,
 * getting campaign stats, and pushing contacts to campaigns.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';
import { smartleadRequest } from '../../_shared/smartlead-client.ts';

// ---------- Tool definitions ----------

export const smartleadTools: ClaudeTool[] = [
  {
    name: 'get_smartlead_campaigns',
    description:
      'List Smartlead email campaigns with their stats (sent, opened, replied, bounced). Can filter by status or deal. Use when the user asks "show me the email campaigns", "what campaigns are running?", "smartlead campaigns for this deal", or "how are our cold email campaigns doing?".',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED', 'DRAFTED', 'COMPLETED', 'STOPPED'],
          description: 'Filter campaigns by status (optional)',
        },
        deal_id: {
          type: 'string',
          description: 'Filter campaigns linked to this deal/listing UUID (optional)',
        },
        limit: {
          type: 'number',
          description: 'Max campaigns to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_smartlead_campaign_stats',
    description:
      'Get detailed statistics for a specific Smartlead campaign: total leads, sent, opened, clicked, replied, bounced, interested, not interested. Use when the user asks about a specific campaign\'s performance or "how is campaign X doing?".',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The Smartlead campaign UUID from our database',
        },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'get_smartlead_email_history',
    description:
      'Get Smartlead email outreach history for a contact or buyer. Shows which campaigns they were pushed to, their lead status, and all email events (sent, opened, clicked, replied, bounced). Use when the user asks "what emails have we sent to [buyer]?", "show me the email outreach for [contact]", "smartlead history for [name]", or "has [buyer] responded to any emails?".',
    input_schema: {
      type: 'object',
      properties: {
        remarketing_buyer_id: {
          type: 'string',
          description: 'The remarketing buyer UUID to look up',
        },
        email: {
          type: 'string',
          description: 'The email address to look up (alternative to buyer ID)',
        },
        contact_id: {
          type: 'string',
          description: 'Unified contact ID to look up (will resolve to email)',
        },
      },
      required: [],
    },
  },
  {
    name: 'push_to_smartlead',
    description:
      'Push contacts to a Smartlead cold email campaign. Accepts buyer IDs or contact IDs — resolves to contacts with email addresses and adds them to the specified Smartlead campaign. REQUIRES CONFIRMATION. Use when the user says "push these to Smartlead", "add to email campaign", or "start emailing these buyers".',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: {
          type: 'string',
          description: 'The Smartlead campaign UUID to push leads to',
        },
        entity_type: {
          type: 'string',
          enum: ['contacts', 'buyers'],
          description:
            'Type of entity: "contacts" for unified contact IDs, "buyers" for remarketing_buyer IDs',
        },
        entity_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of UUIDs to push',
        },
      },
      required: ['campaign_id', 'entity_type', 'entity_ids'],
    },
  },
];

// ---------- Executor ----------

export async function executeSmartleadTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_smartlead_campaigns':
      return getSmartleadCampaigns(supabase, args);
    case 'get_smartlead_campaign_stats':
      return getSmartleadCampaignStats(supabase, args);
    case 'get_smartlead_email_history':
      return getSmartleadEmailHistory(supabase, args);
    case 'push_to_smartlead':
      return pushToSmartlead(supabase, args, userId);
    default:
      return { error: `Unknown smartlead tool: ${toolName}` };
  }
}

// ---------- get_smartlead_campaigns ----------

async function getSmartleadCampaigns(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const status = args.status as string | undefined;
  const dealId = args.deal_id as string | undefined;
  const limit = Math.min((args.limit as number) || 20, 50);

  let query = (supabase as any)
    .from('smartlead_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (dealId) query = query.eq('deal_id', dealId);

  const { data: campaigns, error } = await query;

  if (error) return { error: `Failed to fetch campaigns: ${error.message}` };
  if (!campaigns || campaigns.length === 0) {
    return {
      data: {
        campaigns: [],
        total: 0,
        message: status
          ? `No Smartlead campaigns found with status "${status}"`
          : 'No Smartlead campaigns found',
      },
    };
  }

  // Get latest stats for each campaign
  const campaignIds = campaigns.map((c: { id: string }) => c.id);
  const { data: allStats } = await (supabase as any)
    .from('smartlead_campaign_stats')
    .select('*')
    .in('campaign_id', campaignIds)
    .order('snapshot_at', { ascending: false });

  // Build stats map (latest snapshot per campaign)
  const statsMap = new Map<
    string,
    { sent: number; opened: number; replied: number; bounced: number; total_leads: number }
  >();
  if (allStats) {
    for (const stat of allStats) {
      if (!statsMap.has(stat.campaign_id)) {
        statsMap.set(stat.campaign_id, stat);
      }
    }
  }

  // Get linked deal names
  const dealIds = [
    ...new Set(
      campaigns
        .filter((c: { deal_id?: string }) => c.deal_id)
        .map((c: { deal_id: string }) => c.deal_id),
    ),
  ];
  const dealMap = new Map<string, string>();
  if (dealIds.length > 0) {
    const { data: deals } = await (supabase as any)
      .from('listings')
      .select('id, title')
      .in('id', dealIds);
    for (const d of deals || []) dealMap.set(d.id, d.title);
  }

  const enriched = campaigns.map((c: Record<string, unknown>) => {
    const stats = statsMap.get(c.id as string);
    return {
      id: c.id,
      smartlead_campaign_id: c.smartlead_campaign_id,
      name: c.name,
      status: c.status,
      deal_name: c.deal_id ? dealMap.get(c.deal_id) || null : null,
      deal_id: c.deal_id,
      lead_count: c.lead_count,
      stats: stats
        ? {
            total_leads: stats.total_leads,
            sent: stats.sent,
            opened: stats.opened,
            replied: stats.replied,
            bounced: stats.bounced,
          }
        : null,
      last_synced_at: c.last_synced_at,
      created_at: c.created_at,
    };
  });

  return {
    data: {
      campaigns: enriched,
      total: enriched.length,
      message: `Found ${enriched.length} Smartlead campaign(s)${status ? ` with status "${status}"` : ''}`,
    },
  };
}

// ---------- get_smartlead_campaign_stats ----------

async function getSmartleadCampaignStats(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const campaignId = args.campaign_id as string;
  if (!campaignId) return { error: 'campaign_id is required' };

  // Get campaign info
  const { data: campaign, error: campaignError } = await (supabase as any)
    .from('smartlead_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    return { error: `Campaign not found: ${campaignId}` };
  }

  // Get latest stats snapshot
  const { data: stats } = await (supabase as any)
    .from('smartlead_campaign_stats')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get lead count by category
  const { data: leads } = await (supabase as any)
    .from('smartlead_campaign_leads')
    .select('lead_status, lead_category')
    .eq('campaign_id', campaignId);

  const categoryBreakdown: Record<string, number> = {};
  const statusBreakdown: Record<string, number> = {};
  if (leads) {
    for (const lead of leads) {
      const cat = lead.lead_category || 'uncategorized';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
      const st = lead.lead_status || 'unknown';
      statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
    }
  }

  // Get recent webhook events for this campaign
  const { data: recentEvents } = await (supabase as any)
    .from('smartlead_webhook_events')
    .select('event_type, lead_email, created_at')
    .eq('smartlead_campaign_id', campaign.smartlead_campaign_id)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    data: {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        smartlead_campaign_id: campaign.smartlead_campaign_id,
        lead_count: campaign.lead_count,
        last_synced_at: campaign.last_synced_at,
      },
      stats: stats
        ? {
            total_leads: stats.total_leads,
            sent: stats.sent,
            opened: stats.opened,
            clicked: stats.clicked,
            replied: stats.replied,
            bounced: stats.bounced,
            unsubscribed: stats.unsubscribed,
            interested: stats.interested,
            not_interested: stats.not_interested,
            open_rate:
              stats.sent > 0 ? `${((stats.opened / stats.sent) * 100).toFixed(1)}%` : 'N/A',
            reply_rate:
              stats.sent > 0 ? `${((stats.replied / stats.sent) * 100).toFixed(1)}%` : 'N/A',
            bounce_rate:
              stats.sent > 0 ? `${((stats.bounced / stats.sent) * 100).toFixed(1)}%` : 'N/A',
            snapshot_at: stats.snapshot_at,
          }
        : null,
      lead_categories: categoryBreakdown,
      lead_statuses: statusBreakdown,
      recent_events: recentEvents || [],
      message: `Campaign "${campaign.name}" — ${stats ? `${stats.sent} sent, ${stats.opened} opened, ${stats.replied} replied` : 'No stats available yet'}`,
    },
  };
}

// ---------- get_smartlead_email_history ----------

async function getSmartleadEmailHistory(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const buyerId = args.remarketing_buyer_id as string | undefined;
  const contactId = args.contact_id as string | undefined;
  let email = args.email as string | undefined;

  if (!buyerId && !email && !contactId) {
    return { error: 'At least one of remarketing_buyer_id, contact_id, or email is required' };
  }

  // Resolve contact_id to email if provided
  if (contactId && !email) {
    const { data: contact } = await (supabase as any)
      .from('contacts')
      .select('email, remarketing_buyer_id')
      .eq('id', contactId)
      .single();
    if (contact?.email) email = contact.email;
  }

  // Get campaigns the buyer/contact is in
  let campaignLeadsQuery = (supabase as any)
    .from('smartlead_campaign_leads')
    .select('*, campaign:smartlead_campaigns(id, name, status, smartlead_campaign_id)');

  if (buyerId) {
    campaignLeadsQuery = campaignLeadsQuery.eq('remarketing_buyer_id', buyerId);
  } else if (email) {
    campaignLeadsQuery = campaignLeadsQuery.eq('email', email);
  }

  const { data: campaignLeads, error: leadsError } = await campaignLeadsQuery;

  if (leadsError) {
    return { error: `Failed to fetch email history: ${leadsError.message}` };
  }

  // Get email events from webhooks
  const emails: string[] = [];
  if (email) emails.push(email);
  if (campaignLeads) {
    for (const lead of campaignLeads) {
      if (lead.email && !emails.includes(lead.email)) emails.push(lead.email);
    }
  }

  // Also look up emails from buyer contacts if we have a buyer ID
  if (buyerId && emails.length === 0) {
    const { data: contacts } = await (supabase as any)
      .from('contacts')
      .select('email')
      .eq('remarketing_buyer_id', buyerId)
      .eq('contact_type', 'buyer')
      .not('email', 'is', null);
    if (contacts) {
      for (const c of contacts) {
        if (c.email && !emails.includes(c.email)) emails.push(c.email);
      }
    }
  }

  let events: Array<{
    event_type: string;
    lead_email: string;
    created_at: string;
    smartlead_campaign_id: number;
  }> = [];
  if (emails.length > 0) {
    const { data: webhookEvents } = await (supabase as any)
      .from('smartlead_webhook_events')
      .select('event_type, lead_email, created_at, smartlead_campaign_id')
      .in('lead_email', emails)
      .order('created_at', { ascending: false })
      .limit(50);
    events = webhookEvents || [];
  }

  // Get buyer name for context
  let buyerName: string | null = null;
  if (buyerId) {
    const { data: buyer } = await (supabase as any)
      .from('buyers')
      .select('company_name')
      .eq('id', buyerId)
      .single();
    buyerName = buyer?.company_name || null;
  }

  // Build campaign participation list
  const campaigns = (campaignLeads || []).map(
    (cl: Record<string, unknown> & { campaign?: Record<string, unknown> }) => ({
      campaign_name: cl.campaign?.name || 'Unknown',
      campaign_status: cl.campaign?.status || 'Unknown',
      email: cl.email,
      lead_status: cl.lead_status,
      lead_category: cl.lead_category,
      last_activity_at: cl.last_activity_at,
      created_at: cl.created_at,
    }),
  );

  // Summarize events by type
  const eventSummary: Record<string, number> = {};
  for (const e of events) {
    eventSummary[e.event_type] = (eventSummary[e.event_type] || 0) + 1;
  }

  const target = buyerName || email || contactId || 'Unknown';

  return {
    data: {
      target,
      buyer_id: buyerId || null,
      emails_tracked: emails,
      campaigns,
      campaign_count: campaigns.length,
      events: events.slice(0, 20),
      event_summary: eventSummary,
      total_events: events.length,
      message:
        campaigns.length > 0
          ? `${target} is in ${campaigns.length} Smartlead campaign(s). ${events.length} email event(s) recorded: ${Object.entries(
              eventSummary,
            )
              .map(([k, v]) => `${v} ${k}`)
              .join(', ')}`
          : `No Smartlead email history found for ${target}`,
    },
  };
}

// ---------- push_to_smartlead ----------

async function pushToSmartlead(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const campaignId = args.campaign_id as string;
  const entityType = args.entity_type as string;
  const entityIds = args.entity_ids as string[];

  if (!campaignId) return { error: 'campaign_id is required' };
  if (!entityIds?.length) return { error: 'entity_ids is required and must not be empty' };

  // Get campaign info
  const { data: campaign, error: campaignError } = await (supabase as any)
    .from('smartlead_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    return { error: `Campaign not found: ${campaignId}` };
  }

  // Resolve contacts based on entity type
  interface SmartleadContact {
    id: string;
    name: string;
    email: string | null;
    company: string | null;
    remarketing_buyer_id: string | null;
  }

  let contacts: SmartleadContact[] = [];

  if (entityType === 'contacts') {
    const { data } = await (supabase as any)
      .from('contacts')
      .select('id, first_name, last_name, email, company_name, remarketing_buyer_id')
      .in('id', entityIds)
      .eq('archived', false);

    contacts = (data || []).map(
      (c: {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        company_name: string;
        remarketing_buyer_id: string;
      }) => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        email: c.email,
        company: c.company_name,
        remarketing_buyer_id: c.remarketing_buyer_id,
      }),
    );
  } else if (entityType === 'buyers') {
    // Resolve contacts from buyers
    const { data } = await (supabase as any)
      .from('contacts')
      .select('id, first_name, last_name, email, remarketing_buyer_id')
      .in('remarketing_buyer_id', entityIds)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const { data: buyers } = await (supabase as any)
      .from('buyers')
      .select('id, company_name')
      .in('id', entityIds);
    const buyerMap = new Map<string, string>();
    for (const b of buyers || []) buyerMap.set(b.id, b.company_name);

    contacts = (data || []).map(
      (c: {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        remarketing_buyer_id: string;
      }) => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        email: c.email,
        company: buyerMap.get(c.remarketing_buyer_id) || null,
        remarketing_buyer_id: c.remarketing_buyer_id,
      }),
    );
  } else {
    return { error: `Invalid entity_type: ${entityType}. Use "contacts" or "buyers".` };
  }

  if (contacts.length === 0) {
    return { error: 'No contacts found for the given entity IDs' };
  }

  // Filter: must have email
  const eligible: SmartleadContact[] = [];
  const excluded: { name: string; reason: string }[] = [];

  for (const contact of contacts) {
    if (!contact.email) {
      excluded.push({ name: contact.name, reason: 'No email address' });
      continue;
    }
    eligible.push(contact);
  }

  if (eligible.length === 0) {
    return {
      data: {
        success: false,
        contacts_added: 0,
        contacts_excluded: excluded.length,
        exclusions: excluded,
        message: 'All contacts were excluded (no email address)',
      },
    };
  }

  // Push to Smartlead API
  const leadList = eligible.map((c) => ({
    email: c.email,
    first_name: c.name.split(' ')[0] || '',
    last_name: c.name.split(' ').slice(1).join(' ') || '',
    company_name: c.company || '',
  }));

  const apiResult = await smartleadRequest({
    method: 'POST',
    path: `/campaigns/${campaign.smartlead_campaign_id}/leads`,
    body: { lead_list: leadList, settings: {} },
  });

  if (!apiResult.ok) {
    return {
      error: `Smartlead API error: ${apiResult.error || `HTTP ${apiResult.status}`}`,
    };
  }

  // Record leads in our database
  const leadsToInsert = eligible.map((c) => ({
    campaign_id: campaignId,
    email: c.email,
    first_name: c.name.split(' ')[0] || '',
    last_name: c.name.split(' ').slice(1).join(' ') || '',
    company_name: c.company,
    remarketing_buyer_id: c.remarketing_buyer_id,
    lead_status: 'pending',
    metadata: { source: 'ai_command_center', pushed_by: userId },
  }));

  await (supabase as any)
    .from('smartlead_campaign_leads')
    .upsert(leadsToInsert, { onConflict: 'campaign_id,email', ignoreDuplicates: true });

  // Update campaign lead count
  await (supabase as any)
    .from('smartlead_campaigns')
    .update({
      lead_count: (campaign.lead_count || 0) + eligible.length,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', campaignId);

  return {
    data: {
      success: true,
      campaign_name: campaign.name,
      contacts_added: eligible.length,
      contacts_excluded: excluded.length,
      exclusions: excluded.length > 0 ? excluded : undefined,
      message: `Pushed ${eligible.length} contact(s) to Smartlead campaign "${campaign.name}"${excluded.length > 0 ? ` (${excluded.length} excluded — no email)` : ''}`,
    },
  };
}
