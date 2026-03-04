import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Unified activity entry combining SmartLead emails, PhoneBurner calls,
 * and HeyReach LinkedIn outreach into a single chronological timeline.
 */
export interface UnifiedActivityEntry {
  id: string;
  timestamp: string;
  channel: 'email' | 'call' | 'linkedin';
  /** e.g. EMAIL_SENT, EMAIL_OPENED, call_completed, CONNECTION_REQUEST_SENT */
  event_type: string;
  /** Human-readable label */
  label: string;
  /** Campaign or session context */
  context: string | null;
  /** Extra details: disposition, recording, etc. */
  details: {
    campaign_name?: string | null;
    lead_email?: string | null;
    lead_linkedin_url?: string | null;
    lead_status?: string | null;
    call_outcome?: string | null;
    disposition_code?: string | null;
    disposition_label?: string | null;
    disposition_notes?: string | null;
    call_duration_seconds?: number | null;
    talk_time_seconds?: number | null;
    recording_url?: string | null;
    recording_url_public?: string | null;
    call_transcript?: string | null;
    call_connected?: boolean | null;
    call_direction?: string | null;
    phoneburner_status?: string | null;
    contact_notes?: string | null;
    callback_scheduled_date?: string | null;
    user_name?: string | null;
  };
}

const EMAIL_EVENT_LABELS: Record<string, string> = {
  EMAIL_SENT: 'Email Sent',
  EMAIL_OPENED: 'Email Opened',
  OPENED: 'Email Opened',
  LINK_CLICKED: 'Link Clicked',
  CLICKED: 'Link Clicked',
  EMAIL_REPLIED: 'Email Replied',
  REPLIED: 'Email Replied',
  EMAIL_BOUNCED: 'Email Bounced',
  BOUNCED: 'Email Bounced',
  UNSUBSCRIBED: 'Unsubscribed',
  INTERESTED: 'Marked Interested',
  NOT_INTERESTED: 'Not Interested',
  MANUAL_STEP_REACHED: 'Manual Step',
};

const LINKEDIN_EVENT_LABELS: Record<string, string> = {
  CONNECTION_REQUEST_SENT: 'Connection Request Sent',
  CONNECTION_REQUEST_ACCEPTED: 'Connection Accepted',
  MESSAGE_SENT: 'LinkedIn Message Sent',
  MESSAGE_RECEIVED: 'LinkedIn Message Received',
  INMAIL_SENT: 'InMail Sent',
  INMAIL_RECEIVED: 'InMail Received',
  PROFILE_VIEWED: 'Profile Viewed',
  FOLLOW_SENT: 'Followed',
  LIKE_SENT: 'Liked Post',
  LEAD_REPLIED: 'Lead Replied',
  LEAD_INTERESTED: 'Marked Interested',
  LEAD_NOT_INTERESTED: 'Not Interested',
};

/**
 * Fetches combined SmartLead email + PhoneBurner call history for a given
 * buyer (remarketing_buyer_id). Returns a unified, reverse-chronological
 * timeline of all communication activity.
 */
export function useContactCombinedHistory(buyerId: string | null) {
  return useQuery<UnifiedActivityEntry[]>({
    queryKey: ['contact-combined-history', buyerId],
    queryFn: async () => {
      if (!buyerId) return [];

      const entries: UnifiedActivityEntry[] = [];

      // ── 1. PhoneBurner Call Activities ──
      // Get contacts belonging to this buyer from unified contacts table
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('remarketing_buyer_id', buyerId)
        .eq('archived', false);

      const contactIds = (contacts || []).map((c) => c.id);

      if (contactIds.length > 0) {
        const { data: callActivities } = await supabase
          .from('contact_activities')
          .select('*')
          .in('contact_id', contactIds)
          .order('created_at', { ascending: false })
          .limit(100);

        for (const a of callActivities || []) {
          entries.push({
            id: `call-${a.id}`,
            timestamp: a.call_started_at || a.created_at,
            channel: 'call',
            event_type: a.activity_type,
            label: a.activity_type
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c: string) => c.toUpperCase()),
            context: a.user_name ? `Called by ${a.user_name}` : null,
            details: {
              call_outcome: a.call_outcome,
              disposition_code: a.disposition_code,
              disposition_label: a.disposition_label,
              disposition_notes: a.disposition_notes,
              call_duration_seconds: a.call_duration_seconds,
              talk_time_seconds: a.talk_time_seconds,
              recording_url: a.recording_url,
              recording_url_public: a.recording_url_public,
              call_transcript: a.call_transcript,
              call_connected: a.call_connected,
              call_direction: a.call_direction,
              phoneburner_status: a.phoneburner_status,
              contact_notes: a.contact_notes,
              callback_scheduled_date: a.callback_scheduled_date,
              user_name: a.user_name,
            },
          });
        }
      }

      // Also check contact_activities directly linked by remarketing_buyer_id
      const { data: directCallActivities } = await supabase
        .from('contact_activities')
        .select('*')
        .eq('remarketing_buyer_id', buyerId)
        .order('created_at', { ascending: false })
        .limit(100);

      const existingCallIds = new Set(entries.map((e) => e.id));
      for (const a of directCallActivities || []) {
        const entryId = `call-${a.id}`;
        if (existingCallIds.has(entryId)) continue;
        entries.push({
          id: entryId,
          timestamp: a.call_started_at || a.created_at,
          channel: 'call',
          event_type: a.activity_type,
          label: a.activity_type
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase()),
          context: a.user_name ? `Called by ${a.user_name}` : null,
          details: {
            call_outcome: a.call_outcome,
            disposition_code: a.disposition_code,
            disposition_label: a.disposition_label,
            disposition_notes: a.disposition_notes,
            call_duration_seconds: a.call_duration_seconds,
            talk_time_seconds: a.talk_time_seconds,
            recording_url: a.recording_url,
            recording_url_public: a.recording_url_public,
            call_transcript: a.call_transcript,
            call_connected: a.call_connected,
            call_direction: a.call_direction,
            phoneburner_status: a.phoneburner_status,
            contact_notes: a.contact_notes,
            callback_scheduled_date: a.callback_scheduled_date,
            user_name: a.user_name,
          },
        });
      }

      // ── 2. SmartLead Email Events ──
      const { data: campaignLeads } = await supabase
        .from('smartlead_campaign_leads')
        .select('id, campaign_id, email, lead_status, lead_category, last_activity_at, created_at')
        .eq('remarketing_buyer_id', buyerId)
        .order('created_at', { ascending: false });

      // Get emails for webhook event lookup
      const emails = [...new Set((campaignLeads || []).map((c) => c.email).filter(Boolean))];

      if (emails.length > 0) {
        const { data: webhookEvents } = await supabase
          .from('smartlead_webhook_events')
          .select('id, event_type, lead_email, smartlead_campaign_id, payload, created_at')
          .in('lead_email', emails)
          .order('created_at', { ascending: false })
          .limit(100);

        // Build smartlead_campaign_id -> name map
        const slCampaignIds = [
          ...new Set((webhookEvents || []).map((e) => e.smartlead_campaign_id).filter(Boolean)),
        ] as number[];

        let slCampaignNameMap = new Map<number, string>();
        if (slCampaignIds.length > 0) {
          const { data: slCampaigns } = await supabase
            .from('smartlead_campaigns')
            .select('id, name, smartlead_campaign_id')
            .in('smartlead_campaign_id', slCampaignIds);
          if (slCampaigns) {
            slCampaignNameMap = new Map(slCampaigns.map((c) => [c.smartlead_campaign_id, c.name]));
          }
        }

        for (const e of webhookEvents || []) {
          const campaignName = e.smartlead_campaign_id
            ? slCampaignNameMap.get(e.smartlead_campaign_id) || null
            : null;

          entries.push({
            id: `email-${e.id}`,
            timestamp: e.created_at || new Date().toISOString(),
            channel: 'email',
            event_type: e.event_type,
            label: EMAIL_EVENT_LABELS[e.event_type] || e.event_type.replace(/_/g, ' '),
            context: campaignName ? `Campaign: ${campaignName}` : null,
            details: {
              campaign_name: campaignName,
              lead_email: e.lead_email,
            },
          });
        }
      }

      // ── 3. HeyReach LinkedIn Events ──
      const { data: hrCampaignLeads } = await supabase
        .from('heyreach_campaign_leads')
        .select(
          'id, campaign_id, linkedin_url, email, lead_status, lead_category, last_activity_at, created_at',
        )
        .eq('remarketing_buyer_id', buyerId)
        .order('created_at', { ascending: false });

      const hrLinkedInUrls = [
        ...new Set((hrCampaignLeads || []).map((c) => c.linkedin_url).filter(Boolean)),
      ];
      const hrEmails = [
        ...new Set((hrCampaignLeads || []).map((c) => c.email).filter(Boolean)),
      ] as string[];

      if (hrLinkedInUrls.length > 0 || hrEmails.length > 0) {
        let hrWebhookEvents: Array<Record<string, unknown>> = [];

        if (hrLinkedInUrls.length > 0) {
          const { data: urlEvents } = await supabase
            .from('heyreach_webhook_events')
            .select(
              'id, event_type, lead_linkedin_url, lead_email, heyreach_campaign_id, payload, created_at',
            )
            .in('lead_linkedin_url', hrLinkedInUrls)
            .order('created_at', { ascending: false })
            .limit(100);
          hrWebhookEvents = (urlEvents || []) as Array<Record<string, unknown>>;
        }

        if (hrEmails.length > 0) {
          const existingHrIds = new Set(hrWebhookEvents.map((e) => e.id));
          const { data: emailEvents } = await supabase
            .from('heyreach_webhook_events')
            .select(
              'id, event_type, lead_linkedin_url, lead_email, heyreach_campaign_id, payload, created_at',
            )
            .in('lead_email', hrEmails)
            .order('created_at', { ascending: false })
            .limit(100);
          for (const e of emailEvents || []) {
            if (!existingHrIds.has(e.id)) {
              hrWebhookEvents.push(e as Record<string, unknown>);
            }
          }
        }

        const hrCampaignIds = [
          ...new Set(hrWebhookEvents.map((e) => e.heyreach_campaign_id).filter(Boolean)),
        ] as number[];

        let hrCampaignNameMap = new Map<number, string>();
        if (hrCampaignIds.length > 0) {
          const { data: hrCampaigns } = await supabase
            .from('heyreach_campaigns')
            .select('id, name, heyreach_campaign_id')
            .in('heyreach_campaign_id', hrCampaignIds);
          if (hrCampaigns) {
            hrCampaignNameMap = new Map(hrCampaigns.map((c) => [c.heyreach_campaign_id, c.name]));
          }
        }

        for (const e of hrWebhookEvents) {
          const campaignName = e.heyreach_campaign_id
            ? hrCampaignNameMap.get(e.heyreach_campaign_id as number) || null
            : null;

          entries.push({
            id: `linkedin-${e.id}`,
            timestamp: (e.created_at as string) || new Date().toISOString(),
            channel: 'linkedin',
            event_type: e.event_type as string,
            label:
              LINKEDIN_EVENT_LABELS[e.event_type as string] ||
              (e.event_type as string).replace(/_/g, ' '),
            context: campaignName ? `Campaign: ${campaignName}` : null,
            details: {
              campaign_name: campaignName,
              lead_linkedin_url: e.lead_linkedin_url as string | null,
              lead_email: e.lead_email as string | null,
            },
          });
        }
      }

      // Sort by timestamp descending (newest first)
      entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return entries;
    },
    enabled: !!buyerId,
    staleTime: 60_000,
  });
}

/**
 * Fetches combined history by contact email address.
 * Useful on deal pages where we have buyer email but not necessarily the buyer ID.
 */
export function useContactCombinedHistoryByEmail(email: string | null) {
  return useQuery<UnifiedActivityEntry[]>({
    queryKey: ['contact-combined-history-email', email],
    queryFn: async () => {
      if (!email) return [];

      const entries: UnifiedActivityEntry[] = [];

      // ── 1. PhoneBurner Calls by email ──
      const { data: callActivities } = await supabase
        .from('contact_activities')
        .select('*')
        .eq('contact_email', email)
        .order('created_at', { ascending: false })
        .limit(100);

      for (const a of callActivities || []) {
        entries.push({
          id: `call-${a.id}`,
          timestamp: a.call_started_at || a.created_at,
          channel: 'call',
          event_type: a.activity_type,
          label: a.activity_type
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase()),
          context: a.user_name ? `Called by ${a.user_name}` : null,
          details: {
            call_outcome: a.call_outcome,
            disposition_code: a.disposition_code,
            disposition_label: a.disposition_label,
            disposition_notes: a.disposition_notes,
            call_duration_seconds: a.call_duration_seconds,
            talk_time_seconds: a.talk_time_seconds,
            recording_url: a.recording_url,
            recording_url_public: a.recording_url_public,
            call_transcript: a.call_transcript,
            call_connected: a.call_connected,
            call_direction: a.call_direction,
            phoneburner_status: a.phoneburner_status,
            contact_notes: a.contact_notes,
            callback_scheduled_date: a.callback_scheduled_date,
            user_name: a.user_name,
          },
        });
      }

      // ── 2. SmartLead Email Events by email ──
      const { data: webhookEvents } = await supabase
        .from('smartlead_webhook_events')
        .select('id, event_type, lead_email, smartlead_campaign_id, payload, created_at')
        .eq('lead_email', email)
        .order('created_at', { ascending: false })
        .limit(100);

      const slCampaignIds = [
        ...new Set((webhookEvents || []).map((e) => e.smartlead_campaign_id).filter(Boolean)),
      ] as number[];

      let slCampaignNameMap = new Map<number, string>();
      if (slCampaignIds.length > 0) {
        const { data: slCampaigns } = await supabase
          .from('smartlead_campaigns')
          .select('id, name, smartlead_campaign_id')
          .in('smartlead_campaign_id', slCampaignIds);
        if (slCampaigns) {
          slCampaignNameMap = new Map(slCampaigns.map((c) => [c.smartlead_campaign_id, c.name]));
        }
      }

      for (const e of webhookEvents || []) {
        const campaignName = e.smartlead_campaign_id
          ? slCampaignNameMap.get(e.smartlead_campaign_id) || null
          : null;

        entries.push({
          id: `email-${e.id}`,
          timestamp: e.created_at || new Date().toISOString(),
          channel: 'email',
          event_type: e.event_type,
          label: EMAIL_EVENT_LABELS[e.event_type] || e.event_type.replace(/_/g, ' '),
          context: campaignName ? `Campaign: ${campaignName}` : null,
          details: {
            campaign_name: campaignName,
            lead_email: e.lead_email,
          },
        });
      }

      // ── 3. HeyReach LinkedIn Events by email ──
      const { data: hrWebhookEvents } = await supabase
        .from('heyreach_webhook_events')
        .select(
          'id, event_type, lead_linkedin_url, lead_email, heyreach_campaign_id, payload, created_at',
        )
        .eq('lead_email', email)
        .order('created_at', { ascending: false })
        .limit(100);

      // Also check by LinkedIn URLs from heyreach_campaign_leads with matching email
      const { data: hrCampaignLeadsByEmail } = await supabase
        .from('heyreach_campaign_leads')
        .select('linkedin_url')
        .eq('email', email);

      const hrLinkedInUrls = [
        ...new Set((hrCampaignLeadsByEmail || []).map((l) => l.linkedin_url).filter(Boolean)),
      ];
      const hrExistingIds = new Set((hrWebhookEvents || []).map((e) => e.id));

      if (hrLinkedInUrls.length > 0) {
        const { data: urlEvents } = await supabase
          .from('heyreach_webhook_events')
          .select(
            'id, event_type, lead_linkedin_url, lead_email, heyreach_campaign_id, payload, created_at',
          )
          .in('lead_linkedin_url', hrLinkedInUrls)
          .order('created_at', { ascending: false })
          .limit(100);

        for (const e of urlEvents || []) {
          if (!hrExistingIds.has(e.id)) {
            (hrWebhookEvents || []).push(e);
          }
        }
      }

      const hrCampaignIds = [
        ...new Set((hrWebhookEvents || []).map((e) => e.heyreach_campaign_id).filter(Boolean)),
      ] as number[];

      let hrCampaignNameMap = new Map<number, string>();
      if (hrCampaignIds.length > 0) {
        const { data: hrCampaigns } = await supabase
          .from('heyreach_campaigns')
          .select('id, name, heyreach_campaign_id')
          .in('heyreach_campaign_id', hrCampaignIds);
        if (hrCampaigns) {
          hrCampaignNameMap = new Map(hrCampaigns.map((c) => [c.heyreach_campaign_id, c.name]));
        }
      }

      for (const e of hrWebhookEvents || []) {
        const campaignName = e.heyreach_campaign_id
          ? hrCampaignNameMap.get(e.heyreach_campaign_id) || null
          : null;

        entries.push({
          id: `linkedin-${e.id}`,
          timestamp: e.created_at || new Date().toISOString(),
          channel: 'linkedin',
          event_type: e.event_type,
          label: LINKEDIN_EVENT_LABELS[e.event_type] || e.event_type.replace(/_/g, ' '),
          context: campaignName ? `Campaign: ${campaignName}` : null,
          details: {
            campaign_name: campaignName,
            lead_linkedin_url: e.lead_linkedin_url,
            lead_email: e.lead_email,
          },
        });
      }

      // Sort newest first
      entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return entries;
    },
    enabled: !!email,
    staleTime: 60_000,
  });
}
