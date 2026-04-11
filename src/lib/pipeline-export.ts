import type { Deal } from '@/hooks/admin/use-deals';

const HEADERS = [
  'Deal ID',
  'Title',
  'Company',
  'Listing',
  'Stage',
  'Value',
  'Probability',
  'Priority',
  'Expected Close Date',
  'Created At',
  'Days in Stage',
  'Owner',
  'Owner Email',
  'Buyer Name',
  'Buyer Email',
  'Buyer Company',
  'Buyer Type',
  'Contact Phone',
  'Contact LinkedIn URL',
  'Contact Mobile Phone 1',
  'Contact Mobile Phone 2',
  'Contact Mobile Phone 3',
  'Contact Office Phone',
  'NDA Status',
  'Fee Agreement Status',
  'Under LOI',
  'Meeting Scheduled',
  'Followed Up',
  'Negative Followup',
  'Source',
  'Listing Revenue',
  'Listing EBITDA',
  'Listing Location',
  'Listing Category',
  'Last Activity At',
  'Deal Score',
  'LOI Value',
  'LOI Submitted At',
  'LOI Signed At',
  'LOI Expiry',
  'LOI Counterparty',
  'Final Price',
  'Closed At',
  'Lost Reason',
  'Lost Reason Detail',
  'Commission Rate (%)',
  'Fee Earned',
];

function escapeCsvField(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function daysBetween(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  return String(Math.floor(ms / 86_400_000));
}

export function dealsToCsv(deals: Deal[]): string {
  const rows = [HEADERS.join(',')];
  for (const d of deals) {
    const row = [
      d.deal_id,
      d.title,
      d.listing_real_company_name || '',
      d.listing_title || '',
      d.stage_name || '',
      d.deal_value ?? '',
      d.deal_probability ?? '',
      d.deal_priority || '',
      d.deal_expected_close_date || '',
      d.deal_created_at || '',
      daysBetween(d.deal_stage_entered_at),
      d.assigned_admin_name || '',
      d.assigned_admin_email || '',
      d.buyer_name || d.contact_name || '',
      d.buyer_email || d.contact_email || '',
      d.buyer_company || d.contact_company || '',
      d.buyer_type || '',
      d.contact_phone || '',
      d.contact_linkedin_url || '',
      d.contact_mobile_phone_1 || '',
      d.contact_mobile_phone_2 || '',
      d.contact_mobile_phone_3 || '',
      d.contact_office_phone || '',
      d.nda_status || '',
      d.fee_agreement_status || '',
      d.under_loi ? 'yes' : 'no',
      d.meeting_scheduled ? 'yes' : 'no',
      d.followed_up ? 'yes' : 'no',
      d.negative_followed_up ? 'yes' : 'no',
      d.deal_source || '',
      d.listing_revenue ?? '',
      d.listing_ebitda ?? '',
      d.listing_location || '',
      d.listing_category || '',
      d.last_activity_at || '',
      d.deal_score ?? '',
      d.loi_value ?? '',
      d.loi_submitted_at || '',
      d.loi_signed_at || '',
      d.loi_expiry_date || '',
      d.loi_counterparty || '',
      d.final_price ?? '',
      d.closed_at || '',
      d.lost_reason || '',
      d.lost_reason_detail || '',
      d.commission_rate ?? '',
      d.fee_earned ?? '',
    ];
    rows.push(row.map(escapeCsvField).join(','));
  }
  return rows.join('\n');
}

export function downloadPipelineCsv(deals: Deal[]): void {
  const csv = dealsToCsv(deals);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `pipeline-export-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
