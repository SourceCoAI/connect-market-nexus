/**
 * Shared return types for the data access layer.
 *
 * These types define the shape of data returned by query functions,
 * decoupled from the raw database row types. This lets us reshape
 * data at the query boundary without changing consumer code.
 */

// Re-export base types from the database utility layer
export type { DatabaseResult, DatabaseError, PaginatedResult } from '@/lib/database';

/** Minimal listing summary for list views. */
export interface ListingSummary {
  id: string;
  title: string;
  description: string | null;
  asking_price: number | null;
  revenue: number | null;
  ebitda: number | null;
  status: string;
  category: string | null;
  location: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Full listing detail. */
export interface ListingDetail extends ListingSummary {
  description_html: string | null;
  owner_id: string | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  is_published: boolean;
}

/** Buyer summary for list views. */
export interface BuyerSummary {
  id: string;
  company_name: string | null;
  buyer_type: string | null;
  thesis_summary: string | null;
  target_revenue_min: number | null;
  target_revenue_max: number | null;
  geographic_focus: string[] | null;
  status: string | null;
  created_at: string;
}

/** Buyer with profile info (joined). */
export interface BuyerWithProfile extends BuyerSummary {
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
}

/** Deal pipeline summary. */
export interface DealSummary {
  id: string;
  listing_id: string | null;
  listing_title: string | null;
  stage: string;
  source: string | null;
  buyer_priority_score: number | null;
  buyer_contact_id: string | null;
  seller_contact_id: string | null;
  assigned_admin_id: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Contact record. */
export interface ContactRecord {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  title: string | null;
  contact_type: string;
  firm_id: string | null;
  nda_signed: boolean | null;
  fee_agreement_signed: boolean | null;
  created_at: string;
}

/** Agreement status (resolved from firm_agreements). */
export interface AgreementStatus {
  firm_id: string;
  firm_name: string | null;
  nda_status: string;
  fee_agreement_status: string;
  nda_signed_at: string | null;
  fee_agreement_signed_at: string | null;
}

/** Admin view state. */
export interface AdminViewState {
  view_type: string;
  last_viewed_at: string;
}
