import {
  Target,
  CheckCircle,
  ThumbsDown,
  Send,
  Calendar,
  Zap,
  Star,
  HelpCircle,
} from 'lucide-react';
import type { IntroductionStatus } from '@/types/buyer-introductions';
import type { BuyerScore } from '@/hooks/admin/use-new-recommended-buyers';

export const STATUS_CONFIG: Record<
  IntroductionStatus,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  need_to_show_deal: {
    label: 'Need to Show Deal',
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    icon: Target,
  },
  outreach_initiated: {
    label: 'Outreach Initiated',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Send,
  },
  meeting_scheduled: {
    label: 'Meeting Scheduled',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Calendar,
  },
  not_a_fit: {
    label: 'Not a Fit',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: ThumbsDown,
  },
  fit_and_interested: {
    label: 'Fit & Interested',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
  },
  deal_created: {
    label: 'Deal Created',
    color: 'bg-sky-100 text-sky-700 border-sky-200',
    icon: CheckCircle,
  },
};

export const TIER_CONFIG: Record<
  BuyerScore['tier'],
  { label: string; color: string; icon: typeof Zap }
> = {
  move_now: {
    label: 'Move Now',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: Zap,
  },
  strong: { label: 'Strong', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Star },
  speculative: {
    label: 'Speculative',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: HelpCircle,
  },
};

export const SOURCE_BADGE: Record<BuyerScore['source'], { label: string; color: string }> = {
  ai_seeded: { label: 'AI Search', color: 'bg-purple-100 text-purple-700' },
  marketplace: { label: 'Marketplace', color: 'bg-blue-100 text-blue-700' },
  scored: { label: 'Buyer Pool', color: 'bg-gray-100 text-gray-600' },
};

export function formatBuyerType(type: string | null): string {
  if (!type) return '';
  const map: Record<string, string> = {
    private_equity: 'PE Firm',
    corporate: 'Corporate',
    family_office: 'Family Office',
    independent_sponsor: 'Ind. Sponsor',
    search_fund: 'Search Fund',
    individual_buyer: 'Individual',
  };
  return map[type] || type.replace('_', ' ');
}

export interface UniverseAssignmentData {
  id: string;
  universe_id: string;
  buyer_universes: { id: string; name: string };
}
