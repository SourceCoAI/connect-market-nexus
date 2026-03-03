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
  Mail,
} from 'lucide-react';

import type { FilterFieldDef } from './types';

/** Referral Partner Detail — Deal fields */
export const REFERRAL_PARTNER_DEAL_FIELDS: FilterFieldDef[] = [
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
    key: 'website',
    label: 'Website',
    type: 'text',
    group: 'Core',
    icon: Globe,
  },
  {
    key: 'category',
    label: 'Industry',
    type: 'select',
    group: 'Business',
    icon: Briefcase,
    dynamicOptions: true,
  },
  {
    key: 'location',
    label: 'Location',
    type: 'text',
    group: 'Location',
    icon: MapPin,
    accessor: (item: Record<string, unknown>) => {
      const city = item.address_city as string | null;
      const state = item.address_state as string | null;
      if (city && state) return `${city}, ${state}`;
      return (item.location as string) || '';
    },
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
    key: 'status',
    label: 'Status',
    type: 'select',
    group: 'Status',
    icon: Activity,
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Draft', value: 'draft' },
      { label: 'Pending Review', value: 'pending_referral_review' },
      { label: 'Archived', value: 'archived' },
    ],
  },
  {
    key: 'is_priority_target',
    label: 'Priority Target',
    type: 'boolean',
    group: 'Status',
    icon: Star,
  },
  {
    key: 'deal_total_score',
    label: 'Quality Score',
    type: 'number',
    group: 'Scoring',
    icon: TrendingUp,
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
    icon: Mail,
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
    key: 'remarketing_status',
    label: 'Remarketing Status',
    type: 'select',
    group: 'Status',
    icon: Activity,
    dynamicOptions: true,
  },
  {
    key: 'created_at',
    label: 'Date Added',
    type: 'date',
    group: 'Admin',
    icon: Calendar,
  },
];
