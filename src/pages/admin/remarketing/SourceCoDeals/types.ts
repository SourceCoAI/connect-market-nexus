export interface SourceCoDeal {
  id: string;
  title: string | null;
  internal_company_name: string | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  main_contact_title: string | null;
  main_contact_phone: string | null;
  website: string | null;
  description: string | null;
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
  is_priority_target: boolean | null;
  needs_owner_contact: boolean | null;
  category: string | null;
  executive_summary: string | null;
  industry: string | null;
  revenue: number | null;
  ebitda: number | null;
  location: string | null;
  address_city: string | null;
  address_state: string | null;
  deal_owner_id: string | null;
  deal_owner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  remarketing_status: string | null;
}

export type SortColumn =
  | 'company_name'
  | 'industry'
  | 'owner'
  | 'revenue'
  | 'ebitda'
  | 'score'
  | 'linkedin_employee_count'
  | 'linkedin_employee_range'
  | 'google_review_count'
  | 'google_rating'
  | 'created_at'
  | 'pushed'
  | 'priority';

export type SortDirection = 'asc' | 'desc';

export interface NewDealForm {
  company_name: string;
  website: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_title: string;
  industry: string;
  description: string;
  location: string;
  revenue: string;
  ebitda: string;
}

export const EMPTY_NEW_DEAL: NewDealForm = {
  company_name: '',
  website: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  contact_title: '',
  industry: '',
  description: '',
  location: '',
  revenue: '',
  ebitda: '',
};
