/**
 * TypeScript types for the HeyReach API integration.
 *
 * HeyReach is a LinkedIn automation and outreach platform.
 * API Base URL: https://api.heyreach.io/api/public/
 * Auth: X-API-KEY header
 */

// ─── Campaign types ─────────────────────────────────────────────────────────

export interface HeyReachCampaign {
  id: number;
  name: string;
  status: HeyReachCampaignStatus;
  creationTime?: string;
  campaignAccountIds?: number[];
}

export type HeyReachCampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'STOPPED';

// ─── Local campaign tracking ────────────────────────────────────────────────

export interface LocalHeyReachCampaign {
  id: string;
  heyreach_campaign_id: number;
  name: string;
  status: string;
  deal_id: string | null;
  universe_id: string | null;
  created_by: string | null;
  settings: Record<string, unknown>;
  lead_count: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Lead types ─────────────────────────────────────────────────────────────

export interface HeyReachLead {
  firstName?: string;
  lastName?: string;
  linkedInUrl: string;
  email?: string;
  companyName?: string;
  title?: string;
  phone?: string;
  customFields?: Record<string, string>;
}

export interface HeyReachCampaignLead {
  id: string;
  campaign_id: string;
  heyreach_lead_id: string | null;
  buyer_contact_id: string | null;
  remarketing_buyer_id: string | null;
  linkedin_url: string;
  email: string | null;
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

export interface HeyReachCampaignStats {
  id: string;
  campaign_id: string;
  total_leads: number;
  contacted: number;
  connected: number;
  replied: number;
  interested: number;
  not_interested: number;
  response_rate: number;
  connection_rate: number;
  snapshot_at: string;
}

// ─── LinkedIn Account types ─────────────────────────────────────────────────

export interface HeyReachLinkedInAccount {
  id: number;
  name?: string;
  linkedInUrl?: string;
  status?: string;
}

// ─── List types ─────────────────────────────────────────────────────────────

export interface HeyReachList {
  id: number;
  name: string;
  listType?: string;
  leadCount?: number;
}

// ─── Webhook event types ────────────────────────────────────────────────────

export interface HeyReachWebhookEvent {
  id: string;
  heyreach_campaign_id: number | null;
  event_type: string;
  lead_linkedin_url: string | null;
  lead_email: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
}

export type HeyReachEventType =
  | 'CONNECTION_REQUEST_SENT'
  | 'CONNECTION_REQUEST_ACCEPTED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_RECEIVED'
  | 'INMAIL_SENT'
  | 'INMAIL_RECEIVED'
  | 'PROFILE_VIEWED'
  | 'FOLLOW_SENT'
  | 'LIKE_SENT'
  | 'LEAD_REPLIED'
  | 'LEAD_INTERESTED'
  | 'LEAD_NOT_INTERESTED';

// ─── API request/response types ─────────────────────────────────────────────

export type HeyReachEntityType = 'contacts' | 'buyer_contacts' | 'buyers' | 'listings' | 'leads';

export interface PushLeadsRequest {
  campaign_id: number;
  entity_type: HeyReachEntityType;
  entity_ids: string[];
  list_id?: number;
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
}

export interface ListCampaignsResponse {
  campaigns: HeyReachCampaign[];
  local_campaigns: LocalHeyReachCampaign[];
}

export interface CampaignStatsResponse {
  statistics: Record<string, number>;
}

export interface SyncCampaignsResponse {
  success: boolean;
  total_remote: number;
  synced: number;
}
