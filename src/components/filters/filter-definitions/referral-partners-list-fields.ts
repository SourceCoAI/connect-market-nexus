import {
  Building2,
  Users,
  Calendar,
  Mail,
  Phone,
  Activity,
  Hash,
} from 'lucide-react';

import type { FilterFieldDef } from './types';

/** Referral Partners list page fields */
export const REFERRAL_PARTNERS_LIST_FIELDS: FilterFieldDef[] = [
  {
    key: 'name',
    label: 'Partner Name',
    type: 'text',
    group: 'Core',
    icon: Users,
  },
  {
    key: 'company',
    label: 'Firm / Company',
    type: 'text',
    group: 'Core',
    icon: Building2,
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    group: 'Contact',
    icon: Mail,
  },
  {
    key: 'phone',
    label: 'Phone',
    type: 'text',
    group: 'Contact',
    icon: Phone,
  },
  {
    key: 'deal_count',
    label: 'Deal Count',
    type: 'number',
    group: 'Stats',
    icon: Hash,
  },
  {
    key: 'is_active',
    label: 'Active Status',
    type: 'boolean',
    group: 'Status',
    icon: Activity,
  },
  {
    key: 'created_at',
    label: 'Date Added',
    type: 'date',
    group: 'Admin',
    icon: Calendar,
  },
];
