import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState } from 'react';
import { formatCompactCurrency } from '@/lib/utils';

interface CopyDealDeal {
  title?: string | null;
  internal_company_name?: string | null;
  website?: string | null;
  industry?: string | null;
  category?: string | null;
  location?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  status?: string | null;
  revenue?: number | null;
  ebitda?: number | null;
  deal_total_score?: number | null;
  seller_interest_score?: number | null;
  full_time_employees?: number | null;
  linkedin_employee_count?: number | null;
  linkedin_employee_range?: string | null;
  google_review_count?: number | null;
  google_rating?: number | null;
  main_contact_name?: string | null;
  main_contact_email?: string | null;
  main_contact_phone?: string | null;
  main_contact_title?: string | null;
  executive_summary?: string | null;
  description?: string | null;
  service_mix?: string[] | null;
  geographic_states?: string[] | null;
  deal_source?: string | null;
  is_priority_target?: boolean | null;
  [key: string]: unknown;
}

function line(label: string, value: unknown): string {
  if (value == null || value === '' || value === false) return '';
  if (typeof value === 'boolean') return `${label}: Yes\n`;
  return `${label}: ${value}\n`;
}

function section(title: string, lines: string): string {
  const trimmed = lines.trim();
  if (!trimmed) return '';
  return `\n${title}\n${trimmed}\n`;
}

export function formatDealAsText(deal: CopyDealDeal): string {
  const name = deal.internal_company_name || deal.title || 'Untitled Deal';
  
  const ebitdaMargin = deal.revenue && deal.ebitda
    ? `${((deal.ebitda / deal.revenue) * 100).toFixed(1)}%`
    : null;

  let text = `DEAL: ${name}\n${'='.repeat(40)}\n`;

  text += section('COMPANY OVERVIEW',
    line('Company Name', name) +
    line('Website', deal.website) +
    line('Industry', deal.industry) +
    line('Category', deal.category) +
    line('Location', deal.location) +
    line('City', deal.address_city) +
    line('State', deal.address_state) +
    line('Status', deal.status) +
    line('Deal Source', deal.deal_source) +
    line('Priority Target', deal.is_priority_target)
  );

  text += section('EMPLOYEES',
    line('Full-Time Employees', deal.full_time_employees) +
    line('LinkedIn Employee Count', deal.linkedin_employee_count) +
    line('LinkedIn Employee Range', deal.linkedin_employee_range)
  );

  text += section('FINANCIALS',
    line('Revenue', deal.revenue != null ? formatCompactCurrency(deal.revenue) : null) +
    line('EBITDA', deal.ebitda != null ? formatCompactCurrency(deal.ebitda) : null) +
    line('EBITDA Margin', ebitdaMargin) +
    line('Quality Score', deal.deal_total_score != null ? `${deal.deal_total_score}/100` : null) +
    line('Seller Interest Score', deal.seller_interest_score != null ? `${deal.seller_interest_score}/100` : null)
  );

  text += section('ONLINE PRESENCE',
    line('Google Rating', deal.google_rating != null && deal.google_review_count != null
      ? `${deal.google_rating} (${deal.google_review_count} reviews)`
      : deal.google_rating) +
    (deal.google_rating == null && deal.google_review_count != null
      ? line('Google Reviews', deal.google_review_count)
      : '')
  );

  text += section('CONTACT',
    line('Name', deal.main_contact_name) +
    line('Title', deal.main_contact_title) +
    line('Email', deal.main_contact_email) +
    line('Phone', deal.main_contact_phone)
  );

  if (deal.executive_summary) {
    text += section('EXECUTIVE SUMMARY', deal.executive_summary);
  }

  if (deal.description) {
    text += section('DESCRIPTION', deal.description);
  }

  text += section('SERVICES & GEOGRAPHY',
    line('Service Mix', deal.service_mix?.join(', ')) +
    line('Geographic States', deal.geographic_states?.join(', '))
  );

  return text.trim();
}

interface CopyDealInfoButtonProps {
  deal: CopyDealDeal;
  iconOnly?: boolean;
}

export function CopyDealInfoButton({ deal, iconOnly }: CopyDealInfoButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const text = formatDealAsText(deal);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Deal info copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy — try again');
    }
  };

  const Icon = copied ? Check : Copy;

  if (iconOnly) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleCopy}
        title="Copy deal info"
      >
        <Icon className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      <Icon className="h-4 w-4 mr-1.5" />
      {copied ? 'Copied!' : 'Copy Info'}
    </Button>
  );
}
