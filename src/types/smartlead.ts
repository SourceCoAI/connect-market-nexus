/**
 * TypeScript types for the Smartlead API integration.
 */

// ─── Campaign types ─────────────────────────────────────────────────────────

export interface SmartleadCampaign {
  id: number;
  user_id?: number;
  name: string;
  status: SmartleadCampaignStatus;
  track_settings?: string[];
  scheduler_cron_value?: Record<string, unknown>;
  min_time_btwn_emails?: number;
  max_leads_per_day?: number;
  stop_lead_settings?: string;
  client_id?: number | null;
  enable_ai_esp_matching?: boolean;
  send_as_plain_text?: boolean;
  follow_up_percentage?: number;
  created_at?: string;
  updated_at?: string;
}

export type SmartleadCampaignStatus = 'DRAFTED' | 'ACTIVE' | 'COMPLETED' | 'STOPPED' | 'PAUSED';

// ─── Lead types ─────────────────────────────────────────────────────────────

export interface SmartleadLead {
  id?: number;
  email: string;
  first_name: string;
  last_name: string;
  company_name?: string;
  phone_number?: string;
  website?: string;
  location?: string;
  linkedin_profile?: string;
  custom_fields?: Record<string, string>;
}

export interface SmartleadCampaignLead {
  id: string;
  campaign_id: string;
  smartlead_lead_id: number | null;
  buyer_contact_id: string | null;
  remarketing_buyer_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  lead_status: string;
  lead_category: string | null;
  last_activity_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Statistics types ───────────────────────────────────────────────────────

export interface SmartleadCampaignStats {
  id: string;
  campaign_id: string;
  total_leads: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  interested: number;
  not_interested: number;
  snapshot_at: string;
}

// ─── Sequence types ─────────────────────────────────────────────────────────

export interface SmartleadSequence {
  seq_number: number;
  seq_delay_details?: {
    delay_in_days: number;
    delayInDays?: number;
  };
  subject?: string;
  email_body?: string;
  variant_distribution?: Record<string, number>;
  sequence_variants?:
    | {
        id: number;
        subject?: string;
        email_body?: string;
        variant_label?: string;
        is_deleted?: boolean;
      }[]
    | null;
}

// ─── Webhook event types ────────────────────────────────────────────────────

export interface SmartleadWebhookEvent {
  id: string;
  smartlead_campaign_id: number | null;
  event_type: string;
  lead_email: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
}

// ─── API request/response types ─────────────────────────────────────────────

export type SmartleadEntityType = 'contacts' | 'buyer_contacts' | 'buyers' | 'listings' | 'leads';

export interface PushLeadsRequest {
  campaign_id: number;
  entity_type: SmartleadEntityType;
  entity_ids: string[];
}

export interface PushLeadsResponse {
  success: boolean;
  total_resolved: number;
  total_pushed: number;
  errors?: string[];
}

export interface CreateCampaignRequest {
  name: string;
  deal_id?: string;
  universe_id?: string;
  client_id?: number;
}

export interface ListCampaignsResponse {
  campaigns: SmartleadCampaign[];
  local_campaigns: {
    id: string;
    smartlead_campaign_id: number;
    name: string;
    status: string;
    deal_id: string | null;
    universe_id: string | null;
    lead_count: number;
    last_synced_at: string | null;
    created_at: string;
    updated_at: string;
  }[];
}

export interface CampaignStatsResponse {
  statistics: Record<string, number>;
}

export interface SyncCampaignsResponse {
  success: boolean;
  total_remote: number;
  synced: number;
}
