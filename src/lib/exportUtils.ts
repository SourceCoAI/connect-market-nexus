import { supabase } from "@/integrations/supabase/client";

/**
 * Utility functions for exporting data to CSV
 */

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
): void {
  if (data.length === 0) return;

  // Determine columns from first item if not provided
  const cols = columns || Object.keys(data[0]).map(key => ({ 
    key: key as keyof T, 
    label: formatHeader(key) 
  }));

  // Build CSV content
  const headers = cols.map(c => `"${c.label}"`).join(',');
  const rows = data.map(row => 
    cols.map(col => {
      const value = row[col.key];
      // Handle different value types
      if (value === null || value === undefined) return '""';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
      if (typeof value === 'number') return value.toString();
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')
  );

  const csvContent = [headers, ...rows].join('\n');
  
  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatHeader(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s/, '')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface DealExportRow {
  id: string;
  deal_identifier: string | null;
  title: string;
  internal_company_name: string | null;
  website: string | null;
  deal_source: string | null;
  industry: string | null;
  category: string;
  description: string;
  executive_summary: string | null;
  location: string;
  address_city: string | null;
  address_state: string | null;
  revenue: number;
  ebitda: number;
  full_time_employees: number | null;
  linkedin_employee_count: number | null;
  linkedin_employee_range: string | null;
  google_review_count: number | null;
  google_rating: number | null;
  deal_total_score: number | null;
  seller_interest_score: number | null;
  is_priority_target: boolean | null;
  status: string;
  deal_owner_id: string | null;
  main_contact_name: string | null;
  main_contact_title: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  enriched_at: string | null;
  created_at: string;
  not_a_fit: boolean;
  not_a_fit_reason: string | null;
  referral_partner_id: string | null;
  referral_partners: { name: string } | null;
  deal_owner: { first_name: string | null; last_name: string | null } | null;
}

const DEAL_EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "deal_identifier", label: "Deal #" },
  { key: "title", label: "Deal Name" },
  { key: "internal_company_name", label: "Company Name" },
  { key: "website", label: "Website" },
  { key: "deal_source", label: "Deal Source" },
  { key: "referral_partner_name", label: "Referral Source" },
  { key: "industry", label: "Industry" },
  { key: "category", label: "Category" },
  { key: "description", label: "Description" },
  { key: "executive_summary", label: "Executive Summary" },
  { key: "location", label: "Location" },
  { key: "address_city", label: "City" },
  { key: "address_state", label: "State" },
  { key: "revenue", label: "Revenue" },
  { key: "ebitda", label: "EBITDA" },
  { key: "full_time_employees", label: "Employees" },
  { key: "linkedin_employee_count", label: "LinkedIn Employees" },
  { key: "linkedin_employee_range", label: "LinkedIn Employee Range" },
  { key: "google_review_count", label: "Google Reviews" },
  { key: "google_rating", label: "Google Rating" },
  { key: "deal_total_score", label: "Quality Score" },
  { key: "seller_interest_score", label: "Seller Interest" },
  { key: "is_priority_target", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "deal_owner_name", label: "Deal Owner" },
  // Contact fields
  { key: "main_contact_name", label: "Contact Name" },
  { key: "main_contact_title", label: "Contact Title" },
  { key: "main_contact_email", label: "Contact Email" },
  { key: "main_contact_phone", label: "Contact Phone" },
  { key: "enriched_at", label: "Enriched At" },
  { key: "created_at", label: "Added" },
  { key: "not_a_fit", label: "Not a Fit" },
  { key: "not_a_fit_reason", label: "Not a Fit Reason" },
];

export async function exportDealsToCSV(dealIds: string[]): Promise<{ success: boolean; count: number; error?: string }> {
  if (dealIds.length === 0) return { success: false, count: 0, error: "No deals selected" };

  const { data, error } = await supabase
    .from("listings")
    .select(`
      id, deal_identifier, title, internal_company_name, website, deal_source,
      industry, category, description, executive_summary,
      location, address_city, address_state,
      revenue, ebitda, full_time_employees,
      linkedin_employee_count, linkedin_employee_range,
      google_review_count, google_rating,
      deal_total_score, seller_interest_score, is_priority_target, status,
      deal_owner_id,
      main_contact_name, main_contact_title, main_contact_email, main_contact_phone,
      enriched_at, created_at,
      not_a_fit, not_a_fit_reason,
      referral_partner_id,
      referral_partners(name),
      deal_owner:profiles!listings_deal_owner_id_fkey(first_name, last_name)
    `)
    .in("id", dealIds);

  if (error) return { success: false, count: 0, error: error.message };
  if (!data || data.length === 0) return { success: false, count: 0, error: "No data found" };

  const rows = (data as DealExportRow[]).map((d) => ({
    ...d,
    referral_partner_name: d.referral_partners?.name || "",
    deal_owner_name: d.deal_owner
      ? [d.deal_owner.first_name, d.deal_owner.last_name].filter(Boolean).join(" ")
      : "",
    is_priority_target: d.is_priority_target ? "Yes" : "No",
    not_a_fit: d.not_a_fit ? "Yes" : "No",
    created_at: d.created_at ? new Date(d.created_at).toLocaleDateString() : "",
    enriched_at: d.enriched_at ? new Date(d.enriched_at).toLocaleDateString() : "",
  }));

  exportToCSV(rows, `deals-export-${new Date().toISOString().slice(0, 10)}`, DEAL_EXPORT_COLUMNS as { key: keyof typeof rows[number]; label: string }[]);
  return { success: true, count: rows.length };
}
