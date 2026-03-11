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

// ─── API request/response types ─────────────────────────────────────────────

export interface PushLeadsRequest {
  campaign_id: number;
  entity_type: 'contacts' | 'buyer_contacts' | 'buyers' | 'listings' | 'leads';
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
  local_campaigns: {
    id: string;
    heyreach_campaign_id: number;
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
