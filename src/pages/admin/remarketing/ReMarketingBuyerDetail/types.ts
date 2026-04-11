export interface BuyerData {
  id: string;
  company_name: string;
  company_website: string | null;
  buyer_type: string | null;
  universe_id: string | null;
  thesis_summary: string | null;
  target_revenue_min: number | null;
  target_revenue_max: number | null;
  target_ebitda_min: number | null;
  target_ebitda_max: number | null;
  target_geographies: string[] | null;
  target_services: string[] | null;
  geographic_footprint: string[] | null;
  notes: string | null;
  data_last_updated: string | null;
  pe_firm_name: string | null;
  pe_firm_website: string | null;
  is_pe_backed: boolean;
  parent_pe_firm_id: string | null;
  parent_pe_firm_name: string | null;
  platform_website: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  has_fee_agreement: boolean | null;
  marketplace_firm_id?: string | null;
  fee_agreement_source?: string | null;
  industry_vertical: string | null;
  business_summary: string | null;
  acquisition_appetite: string | null;
  acquisition_timeline: string | null;
  total_acquisitions: number | null;
  acquisition_frequency: string | null;
  primary_customer_size: string | null;
  customer_geographic_reach: string | null;
  customer_industries: string[] | null;
  target_customer_profile: string | null;
  investment_date: string | null;
  founded_year?: number | null;
  num_employees?: number | null;
  number_of_locations?: number | null;
  operating_locations?: string[] | null;
  service_regions?: string[] | null;
  services_offered?: string | null;
  business_type?: string | null;
  revenue_model?: string | null;
}

export interface Contact {
  id: string;
  name: string; // derived: first_name + ' ' + last_name
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: string | null; // mapped from title
  linkedin_url: string | null;
  is_primary: boolean | null; // mapped from is_primary_at_firm
  mobile_phone_1: string | null;
  mobile_phone_2: string | null;
  mobile_phone_3: string | null;
  office_phone: string | null;
  phone_source: string | null;
}

export interface Transcript {
  id: string;
  transcript_text: string;
  source: string | null;
  file_name: string | null;
  file_url: string | null;
  processed_at: string | null;
  extracted_data: Record<string, unknown> | null;
  created_at: string;
}

export type EditDialogType = 'business' | 'investment' | 'dealStructure' | 'geographic' | 'customer' | 'acquisition' | 'companyOverview' | 'servicesModel' | null;
