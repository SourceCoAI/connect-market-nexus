import {
  Building2,
  DollarSign,
  MapPin,
  Tag,
  Users,
  Calendar,
  Activity,
  TrendingUp,
  Star,
  Briefcase,
  Globe,
} from 'lucide-react';

import type { FilterFieldDef } from './types';

/** Valuation Calculator Leads */
export const VALUATION_LEAD_FIELDS: FilterFieldDef[] = [
  // ── Core ─────────────────────────────────────────────────────────
  {
    key: 'display_name',
    label: 'Lead Name',
    type: 'text',
    group: 'Core',
    icon: Building2,
    accessor: (item: Record<string, unknown>) =>
      (item.business_name as string) ||
      (item.display_name as string) ||
      (item.full_name as string) ||
      '',
  },
  {
    key: 'website',
    label: 'Website',
    type: 'text',
    group: 'Core',
    // Mirrors inferWebsite logic: validates the website is a real domain (no spaces, contains dot)
    accessor: (item: Record<string, unknown>) => {
      // Helper: check if a string is a valid-looking domain
      const isValidDomain = (s: string): boolean => {
        const v = s
          .trim()
          .toLowerCase()
          .replace(/^[a-z]{3,6}:\/\//i, '') // strip protocol
          .replace(/^www\./i, '') // strip www
          .split('/')[0]
          .split('?')[0]
          .split('#')[0]; // strip path
        return !!(v && v.includes('.') && !v.includes(' ') && !/^(test|no|example)\./i.test(v));
      };
      const raw = item.website as string | null;
      if (raw && raw.trim() && !raw.includes('@') && isValidDomain(raw)) return raw.trim();
      // No valid website — return null (filter treats as empty)
      return null;
    },
    icon: Globe,
  },
  {
    key: 'calculator_type',
    label: 'Calculator Type',
    type: 'select',
    group: 'Core',
    icon: Tag,
    options: [
      { label: 'General', value: 'general' },
      { label: 'Auto Shop', value: 'auto_shop' },
      { label: 'Collision', value: 'collision' },
      { label: 'Mechanical', value: 'mechanical' },
      { label: 'Specialty', value: 'specialty' },
      { label: 'HVAC', value: 'hvac' },
      { label: 'Dental', value: 'dental' },
      { label: 'Plumbing', value: 'plumbing' },
      { label: 'Electrical', value: 'electrical' },
      { label: 'Landscaping', value: 'landscaping' },
      { label: 'Pest Control', value: 'pest_control' },
    ],
  },
  // ── Contact ───────────────────────────────────────────────────────
  {
    key: 'full_name',
    label: 'Contact Name',
    type: 'text',
    group: 'Contact',
    icon: Users,
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    group: 'Contact',
    icon: Users,
  },
  // ── Business ──────────────────────────────────────────────────────
  {
    key: 'industry',
    label: 'Industry',
    type: 'select',
    group: 'Business',
    icon: Briefcase,
    dynamicOptions: true,
  },
  {
    key: 'growth_trend',
    label: 'Growth Trend',
    type: 'select',
    group: 'Business',
    icon: TrendingUp,
    options: [
      { label: '100%+ Growth', value: '100-plus' },
      { label: '50-100% Growth', value: '50-100' },
      { label: '25-50% Growth', value: '25-50' },
      { label: '10-25% Growth', value: '10-25' },
      { label: '0-10% Growth', value: '0-10' },
      { label: 'Negative', value: 'negative' },
    ],
  },
  {
    key: 'owner_dependency',
    label: 'Owner Dependency',
    type: 'number',
    group: 'Business',
    icon: Users,
  },
  {
    key: 'buyer_lane',
    label: 'Buyer Lane',
    type: 'select',
    group: 'Business',
    icon: Tag,
    dynamicOptions: true,
  },
  // ── Seller Intent ─────────────────────────────────────────────────
  {
    key: 'open_to_intros',
    label: 'Open to Intros',
    type: 'boolean',
    group: 'Seller Intent',
    icon: Activity,
  },
  {
    key: 'exit_timing',
    label: 'Exit Timing',
    type: 'select',
    group: 'Seller Intent',
    icon: Activity,
    options: [
      { label: 'Exit Now', value: 'now' },
      { label: '1-2 Years', value: '1-2years' },
      { label: 'Exploring', value: 'exploring' },
    ],
  },
  {
    key: 'cta_clicked',
    label: 'CTA Clicked',
    type: 'boolean',
    group: 'Seller Intent',
    icon: Activity,
  },
  // ── Status ────────────────────────────────────────────────────────
  {
    key: 'is_priority_target',
    label: 'Priority Target',
    type: 'boolean',
    group: 'Status',
    icon: Star,
  },
  {
    key: 'pushed_to_all_deals',
    label: 'Pushed to Active Deals',
    type: 'boolean',
    group: 'Status',
    icon: Activity,
  },
  {
    key: 'status',
    label: 'Lead Status',
    type: 'select',
    group: 'Status',
    icon: Tag,
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Pushed', value: 'pushed' },
      { label: 'Contacted', value: 'contacted' },
      { label: 'Qualified', value: 'qualified' },
      { label: 'Excluded', value: 'excluded' },
    ],
  },
  {
    key: 'lead_source',
    label: 'Lead Source',
    type: 'select',
    group: 'Status',
    icon: Tag,
    dynamicOptions: true,
  },
  // ── Scoring ───────────────────────────────────────────────────────
  {
    key: 'quality_label',
    label: 'Quality Tier',
    type: 'select',
    group: 'Scoring',
    icon: TrendingUp,
    options: [
      { label: 'Very Strong', value: 'Very Strong' },
      { label: 'Strong', value: 'Strong' },
      { label: 'Solid', value: 'Solid' },
      { label: 'Average', value: 'Average' },
      { label: 'Needs Work', value: 'Needs Work' },
    ],
  },
  {
    key: 'lead_score',
    label: 'Lead Score',
    type: 'number',
    group: 'Scoring',
    icon: TrendingUp,
  },
  {
    key: 'readiness_score',
    label: 'Readiness Score',
    type: 'number',
    group: 'Scoring',
    icon: TrendingUp,
  },
  // ── Financial ─────────────────────────────────────────────────────
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
  // ── Location ──────────────────────────────────────────────────────
  {
    key: 'region',
    label: 'Region',
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
  // ── Admin ─────────────────────────────────────────────────────────
  {
    key: 'created_at',
    label: 'Submitted Date',
    type: 'date',
    group: 'Admin',
    icon: Calendar,
  },
];
