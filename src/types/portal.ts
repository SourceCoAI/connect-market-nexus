// ── Client Portal Types ──────────────────────────────────────────────
// All types for the portal feature. These are NEW types that do not
// modify any existing type definitions.

export type PortalOrgStatus = 'active' | 'paused' | 'archived';
export type PortalUserRole = 'primary_contact' | 'admin' | 'viewer';
export type PortalNotificationFrequency = 'instant' | 'daily_digest' | 'weekly_digest';

export type PortalDealPushStatus =
  | 'pending_review'
  | 'viewed'
  | 'interested'
  | 'passed'
  | 'needs_info'
  | 'reviewing'
  | 'under_nda'
  | 'archived';

export type PortalDealPriority = 'standard' | 'high' | 'urgent';

export type PortalResponseType =
  | 'interested'
  | 'pass'
  | 'need_more_info'
  | 'reviewing';

export type PortalNotificationType =
  | 'new_deal'
  | 'reminder'
  | 'status_update'
  | 'document_ready'
  | 'welcome'
  | 'digest';

export type PortalNotificationChannel = 'email' | 'in_app' | 'both';

export type PortalActorType = 'portal_user' | 'admin';

export type PortalActivityAction =
  | 'deal_pushed'
  | 'deal_viewed'
  | 'response_submitted'
  | 'document_downloaded'
  | 'message_sent'
  | 'login'
  | 'settings_changed'
  | 'reminder_sent'
  | 'user_invited'
  | 'user_deactivated'
  | 'portal_created'
  | 'portal_archived'
  | 'converted_to_pipeline';

// ── Database row types ───────────────────────────────────────────────

export interface PortalOrganization {
  id: string;
  name: string;
  buyer_id: string | null;
  profile_id: string | null;
  relationship_owner_id: string | null;
  status: PortalOrgStatus;
  portal_slug: string;
  welcome_message: string | null;
  logo_url: string | null;
  preferred_industries: string[];
  preferred_deal_size_min: number | null;
  preferred_deal_size_max: number | null;
  preferred_geographies: string[];
  notification_frequency: PortalNotificationFrequency;
  auto_reminder_enabled: boolean;
  auto_reminder_days: number | null;
  auto_reminder_max: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PortalUser {
  id: string;
  portal_org_id: string;
  contact_id: string | null;
  profile_id: string | null;
  role: PortalUserRole;
  email: string;
  name: string;
  is_active: boolean;
  last_login_at: string | null;
  invite_sent_at: string | null;
  invite_accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeaserSection {
  key: string;
  title: string;
  content: string;
}

export interface DealSnapshot {
  headline: string;
  industry: string;
  sub_industry?: string;
  geography: string;
  ebitda: number | null;
  revenue: number | null;
  business_description?: string;
  category?: string;
  /** Anonymous teaser sections (BUSINESS OVERVIEW, DEAL SNAPSHOT, KEY FACTS, etc.) */
  teaser_sections?: TeaserSection[];
  /** Full memo HTML (rich text from TipTap editor) */
  memo_html?: string;
  /** Project codename used in the teaser */
  project_name?: string;
  /** Branding for the memo (sourceco, new_heritage, etc.) */
  branding?: string;
}

export interface PortalDealPush {
  id: string;
  portal_org_id: string;
  listing_id: string;
  pushed_by: string;
  push_note: string | null;
  status: PortalDealPushStatus;
  priority: PortalDealPriority;
  deal_snapshot: DealSnapshot;
  first_viewed_at: string | null;
  response_due_by: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  data_room_access_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalDealResponse {
  id: string;
  push_id: string;
  responded_by: string;
  response_type: PortalResponseType;
  notes: string | null;
  internal_notes: string | null; // admin-only field
  created_at: string;
}

export interface PortalNotification {
  id: string;
  portal_user_id: string;
  portal_org_id: string;
  push_id: string | null;
  type: PortalNotificationType;
  channel: PortalNotificationChannel;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  read_at: string | null;
  clicked_at: string | null;
  created_at: string;
}

export interface PortalActivityLog {
  id: string;
  portal_org_id: string;
  actor_id: string;
  actor_type: PortalActorType;
  action: PortalActivityAction;
  push_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Joined / enriched types for the UI ───────────────────────────────

export interface PortalOrganizationWithDetails extends PortalOrganization {
  relationship_owner?: { id: string; first_name: string; last_name: string; email: string } | null;
  buyer?: { id: string; company_name: string; company_website: string | null; buyer_type: string | null } | null;
  user_count?: number;
  active_push_count?: number;
  last_activity_at?: string | null;
}

export interface PortalDealPushWithDetails extends PortalDealPush {
  pushed_by_profile?: { id: string; first_name: string; last_name: string } | null;
  latest_response?: PortalDealResponse | null;
  response_count?: number;
  portal_org?: { id: string; name: string; portal_slug: string } | null;
}

export interface PortalActivityLogWithDetails extends PortalActivityLog {
  actor_name?: string;
  push_headline?: string;
}

// ── Form input types ─────────────────────────────────────────────────

export interface CreatePortalOrgInput {
  name: string;
  buyer_id?: string | null;
  profile_id?: string | null;
  relationship_owner_id?: string | null;
  portal_slug: string;
  welcome_message?: string;
  logo_url?: string;
  preferred_industries?: string[];
  preferred_deal_size_min?: number | null;
  preferred_deal_size_max?: number | null;
  preferred_geographies?: string[];
  notification_frequency?: PortalNotificationFrequency;
  notes?: string;
}

export interface InvitePortalUserInput {
  portal_org_id: string;
  contact_id?: string | null;
  profile_id?: string | null;
  role: PortalUserRole;
  email: string;
  name: string;
}

export interface PushDealToPortalInput {
  portal_org_id: string;
  listing_id: string;
  push_note?: string;
  priority?: PortalDealPriority;
  response_due_by?: string | null;
  data_room_access_token?: string;
}

export interface SubmitDealResponseInput {
  push_id: string;
  response_type: PortalResponseType;
  notes?: string;
}
