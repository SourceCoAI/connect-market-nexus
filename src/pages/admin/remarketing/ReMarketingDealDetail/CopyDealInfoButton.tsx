import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState } from 'react';
import { formatCompactCurrency } from '@/lib/utils';

/** Accept any deal shape — we read fields dynamically. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CopyDealDeal = Record<string, any>;

function str(deal: CopyDealDeal, key: string): string | null {
  const v = deal[key];
  if (v == null || v === '') return null;
  return String(v);
}

function num(deal: CopyDealDeal, key: string): number | null {
  const v = deal[key];
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function safeJoin(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? v.join(', ') : null;
  if (typeof v === 'string') {
    if (!v.trim()) return null;
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.length ? parsed.join(', ') : null;
    } catch { /* not JSON */ }
    return v;
  }
  return null;
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
  const name = str(deal, 'internal_company_name') || str(deal, 'title') || 'Untitled Deal';

  const revenue = num(deal, 'revenue');
  const ebitda = num(deal, 'ebitda');
  const ebitdaMargin = revenue && ebitda
    ? `${((ebitda / revenue) * 100).toFixed(1)}%`
    : null;

  let text = `DEAL: ${name}\n${'='.repeat(40)}\n`;

  text += section('COMPANY OVERVIEW',
    line('Company Name', name) +
    line('Website', str(deal, 'website')) +
    line('Industry', str(deal, 'industry')) +
    line('Category', str(deal, 'category')) +
    line('Location', str(deal, 'location')) +
    line('Street Address', str(deal, 'street_address')) +
    line('City', str(deal, 'address_city')) +
    line('State', str(deal, 'address_state')) +
    line('Zip', str(deal, 'address_zip')) +
    line('Country', str(deal, 'address_country')) +
    line('Founded', num(deal, 'founded_year')) +
    line('Status', str(deal, 'status')) +
    line('Deal Source', str(deal, 'deal_source')) +
    line('Priority Target', deal.is_priority_target === true)
  );

  text += section('EMPLOYEES',
    line('Full-Time Employees', num(deal, 'full_time_employees')) +
    line('Part-Time Employees', num(deal, 'part_time_employees')) +
    line('LinkedIn Employee Count', num(deal, 'linkedin_employee_count')) +
    line('LinkedIn Employee Range', str(deal, 'linkedin_employee_range'))
  );

  text += section('FINANCIALS',
    line('Revenue', revenue != null ? formatCompactCurrency(revenue) : null) +
    line('EBITDA', ebitda != null ? formatCompactCurrency(ebitda) : null) +
    line('EBITDA Margin', ebitdaMargin) +
    line('Quality Score', num(deal, 'deal_total_score') != null ? `${num(deal, 'deal_total_score')}/100` : null) +
    line('Seller Interest Score', num(deal, 'seller_interest_score') != null ? `${num(deal, 'seller_interest_score')}/100` : null) +
    line('Scoring Notes', str(deal, 'scoring_notes')) +
    line('Revenue Source Quote', str(deal, 'revenue_source_quote')) +
    line('EBITDA Source Quote', str(deal, 'ebitda_source_quote')) +
    line('Financial Notes', str(deal, 'financial_notes'))
  );

  text += section('ONLINE PRESENCE',
    line('Google Rating', num(deal, 'google_rating') != null && num(deal, 'google_review_count') != null
      ? `${num(deal, 'google_rating')} (${num(deal, 'google_review_count')} reviews)`
      : num(deal, 'google_rating')) +
    (num(deal, 'google_rating') == null && num(deal, 'google_review_count') != null
      ? line('Google Reviews', num(deal, 'google_review_count'))
      : '') +
    line('LinkedIn URL', str(deal, 'linkedin_url')) +
    line('Google Maps URL', str(deal, 'google_maps_url')) +
    line('Fireflies URL', str(deal, 'fireflies_url'))
  );

  text += section('CONTACT',
    line('Name', str(deal, 'main_contact_name')) +
    line('Title', str(deal, 'main_contact_title')) +
    line('Email', str(deal, 'main_contact_email')) +
    line('Phone', str(deal, 'main_contact_phone'))
  );

  if (str(deal, 'executive_summary')) {
    text += section('EXECUTIVE SUMMARY', str(deal, 'executive_summary')!);
  }

  if (str(deal, 'description')) {
    text += section('DESCRIPTION', str(deal, 'description')!);
  }

  text += section('SERVICES & GEOGRAPHY',
    line('Service Mix', safeJoin(deal.service_mix)) +
    line('Services', safeJoin(deal.services)) +
    line('Geographic States', safeJoin(deal.geographic_states)) +
    line('Number of Locations', num(deal, 'number_of_locations'))
  );

  text += section('BUSINESS MODEL',
    line('Revenue Model', str(deal, 'revenue_model')) +
    line('Business Model', str(deal, 'business_model')) +
    line('Growth Trajectory', str(deal, 'growth_trajectory')) +
    line('Customer Types', safeJoin(deal.customer_types)) +
    line('Customer Concentration', str(deal, 'customer_concentration')) +
    line('Customer Geography', str(deal, 'customer_geography')) +
    line('Competitive Position', str(deal, 'competitive_position'))
  );

  text += section('OWNER INFO',
    line('Owner Goals', str(deal, 'owner_goals')) +
    line('Ownership Structure', str(deal, 'ownership_structure')) +
    line('Special Requirements', str(deal, 'special_requirements')) +
    line('Owner Response', str(deal, 'owner_response')) +
    line('Seller Motivation', str(deal, 'seller_motivation')) +
    line('Seller Involvement Preference', str(deal, 'seller_involvement_preference')) +
    line('Timeline Preference', str(deal, 'timeline_preference')) +
    line('Transition Preferences', str(deal, 'transition_preferences')) +
    line('Timeline Notes', str(deal, 'timeline_notes')) +
    line('Management Depth', str(deal, 'management_depth')) +
    line('Growth Drivers', safeJoin(deal.growth_drivers))
  );

  text += section('ADDITIONAL DETAILS',
    line('Key Risks', str(deal, 'key_risks')) +
    line('Technology Systems', str(deal, 'technology_systems')) +
    line('Real Estate Info', str(deal, 'real_estate_info'))
  );

  text += section('NOTES',
    line('Owner Notes', str(deal, 'owner_notes')) +
    line('General Notes', str(deal, 'general_notes')) +
    line('Internal Notes', str(deal, 'internal_notes')) +
    line('Notes', str(deal, 'notes')) +
    line('CapTarget Call Notes', str(deal, 'captarget_call_notes'))
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
