export interface CapTargetDeal {
  id: string;
  title: string | null;
  internal_company_name: string | null;
  captarget_client_name: string | null;
  captarget_contact_date: string | null;
  captarget_outreach_channel: string | null;
  captarget_interest_type: string | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  main_contact_title: string | null;
  main_contact_phone: string | null;
  captarget_sheet_tab: string | null;
  website: string | null;
  description: string | null;
  owner_response: string | null;
  pushed_to_all_deals: boolean | null;
  pushed_to_all_deals_at: string | null;
  deal_source: string | null;
  status: string | null;
  created_at: string;
  enriched_at: string | null;
  deal_total_score: number | null;
  linkedin_employee_count: number | null;
  linkedin_employee_range: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  captarget_status: string | null;
  is_priority_target: boolean | null;
  needs_buyer_search: boolean | null;
  needs_owner_contact: boolean | null;
  category: string | null;
  executive_summary: string | null;
  industry: string | null;
  remarketing_status: string | null;
}

export type SortColumn =
  | 'company_name'
  | 'client_name'
  | 'contact_name'
  | 'interest_type'
  | 'outreach_channel'
  | 'contact_date'
  | 'pushed'
  | 'score'
  | 'linkedin_employee_count'
  | 'linkedin_employee_range'
  | 'google_review_count'
  | 'google_rating'
  | 'priority';

export type SortDirection = 'asc' | 'desc';

export interface SyncProgress {
  inserted: number;
  updated: number;
  skipped: number;
  excluded: number;
  page: number;
}

export interface SyncSummary {
  inserted: number;
  updated: number;
  skipped: number;
  excluded: number;
  status: 'success' | 'error';
  message?: string;
}

export interface CleanupResult {
  cleaned: number;
  total_checked: number;
  breakdown?: Record<string, number>;
  sample?: Array<{ company: string; reason: string }>;
}

export const PAGE_SIZE = 50;

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  checkbox: 40,
  number: 50,
  company: 180,
  description: 200,
  industry: 130,
  contact: 120,
  interest: 80,
  channel: 100,
  liCount: 80,
  liRange: 90,
  reviews: 80,
  rating: 70,
  sourceTab: 90,
  score: 70,
  date: 80,
  status: 80,
};
