import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PortalOrgStatus, PortalDealPushStatus, PortalDealPriority } from '@/types/portal';

const orgStatusConfig: Record<PortalOrgStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800 border-green-200' },
  paused: { label: 'Paused', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  archived: { label: 'Archived', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const pushStatusConfig: Record<PortalDealPushStatus, { label: string; className: string }> = {
  pending_review: { label: 'Pending Review', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  viewed: { label: 'Viewed', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  interested: { label: 'Interested', className: 'bg-green-100 text-green-800 border-green-200' },
  passed: { label: 'Passed', className: 'bg-red-100 text-red-700 border-red-200' },
  needs_info: { label: 'Needs Info', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  under_nda: { label: 'Under NDA', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  archived: { label: 'Archived', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const priorityConfig: Record<PortalDealPriority, { label: string; className: string }> = {
  standard: { label: 'Standard', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-800 border-red-200' },
};

export function OrgStatusBadge({ status }: { status: PortalOrgStatus }) {
  const config = orgStatusConfig[status];
  return <Badge variant="outline" className={cn('text-xs', config.className)}>{config.label}</Badge>;
}

export function PushStatusBadge({ status }: { status: PortalDealPushStatus }) {
  const config = pushStatusConfig[status];
  return <Badge variant="outline" className={cn('text-xs', config.className)}>{config.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: PortalDealPriority }) {
  if (priority === 'standard') return null;
  const config = priorityConfig[priority];
  return <Badge variant="outline" className={cn('text-xs', config.className)}>{config.label}</Badge>;
}
