import {
  Building2,
  DollarSign,
  MapPin,
  Users,
  Calendar,
  Activity,
  TrendingUp,
  Star,
  Briefcase,
  Hash,
  Globe,
} from 'lucide-react';

import type { FilterFieldDef } from './types';

/** SourceCo Deals */
export const SOURCECO_FIELDS: FilterFieldDef[] = [
  {
    key: 'internal_company_name',
    label: 'Company Name',
    type: 'text',
    group: 'Core',
    icon: Building2,
    accessor: (item: Record<string, unknown>) =>
      (item.internal_company_name as string) || (item.title as string) || '',
  },
  {
    key: 'main_contact_name',
    label: 'Contact Name',
    type: 'text',
    group: 'Contact',
    icon: Users,
  },
  {
    key: 'main_contact_email',
    label: 'Contact Email',
    type: 'text',
    group: 'Contact',
    icon: Users,
  },
  {
    key: 'website',
    label: 'Website',
    type: 'text',
    group: 'Core',
    icon: Globe,
    accessor: (item: Record<string, unknown>) => {
      const raw = item.website as string | null;
      if (!raw || !raw.trim() || raw.includes('@')) return null;
      const v = raw
        .trim()
        .replace(/^[a-z]{3,6}:\/\//i, '')
        .replace(/^www\./i, '')
        .split('/')[0]
        .split('?')[0]
        .split('#')[0];
      return v && v.includes('.') && !v.includes(' ') && !/^(test|no|example)\./i.test(v)
        ? v
        : null;
    },
  },
  {
    key: 'industry',
    label: 'Industry',
    type: 'select',
    group: 'Business',
    icon: Briefcase,
    dynamicOptions: true,
  },
  {
    key: 'category',
    label: 'Category',
    type: 'select',
    group: 'Business',
    icon: Briefcase,
    dynamicOptions: true,
  },
  {
    key: 'pushed_to_all_deals',
    label: 'Pushed to Active Deals',
    type: 'boolean',
    group: 'Status',
    icon: Activity,
  },
  {
    key: 'is_priority_target',
    label: 'Priority Target',
    type: 'boolean',
    group: 'Status',
    icon: Star,
  },
  {
    key: 'deal_quality_score',
    label: 'Quality Score',
    type: 'number',
    group: 'Scoring',
    icon: TrendingUp,
  },
  {
    key: 'linkedin_employee_count',
    label: 'Employee Count',
    type: 'number',
    group: 'Business',
    icon: Users,
  },
  {
    key: 'linkedin_employee_range',
    label: 'Employee Range',
    type: 'select',
    group: 'Business',
    icon: Users,
    dynamicOptions: true,
  },
  {
    key: 'google_rating',
    label: 'Google Rating',
    type: 'number',
    group: 'Scoring',
    icon: Star,
  },
  {
    key: 'google_review_count',
    label: 'Google Reviews',
    type: 'number',
    group: 'Scoring',
    icon: Hash,
  },
  {
    key: 'revenue',
    label: 'Revenue',
    type: 'currency',
    group: 'Financial',
    icon: DollarSign,
  },
  {
    key: 'ebitda',
    label: 'EBITDA',
    type: 'currency',
    group: 'Financial',
    icon: DollarSign,
  },
  {
    key: 'address_state',
    label: 'State',
    type: 'select',
    group: 'Location',
    icon: MapPin,
    dynamicOptions: true,
  },
  {
    key: 'location',
    label: 'Location',
    type: 'text',
    group: 'Location',
    icon: MapPin,
  },
  {
    key: 'created_at',
    label: 'Created Date',
    type: 'date',
    group: 'Admin',
    icon: Calendar,
  },
  {
    key: 'deal_owner_id',
    label: 'Deal Owner',
    type: 'user',
    group: 'Admin',
    icon: Users,
  },
];
