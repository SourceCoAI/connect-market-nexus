import { cn } from '@/lib/utils';

export type OutreachStatusType =
  | 'not_contacted'
  | 'launched'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'call_answered'
  | 'call_voicemail'
  | 'call_no_answer'
  | 'interested'
  | 'not_a_fit'
  | 'unsubscribed';

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  interested: { label: 'Interested', bg: 'bg-[#D1FAE5]', text: 'text-[#064E3B]' },
  not_a_fit: { label: 'Not a Fit', bg: 'bg-[#FEF2F2]', text: 'text-[#991B1B]' },
  replied: { label: 'Replied', bg: 'bg-[#ECFDF5]', text: 'text-[#065F46]' },
  call_answered: { label: 'Replied', bg: 'bg-[#ECFDF5]', text: 'text-[#065F46]' },
  opened: { label: 'Opened', bg: 'bg-[#FFFBEB]', text: 'text-[#92400E]' },
  clicked: { label: 'Opened', bg: 'bg-[#FFFBEB]', text: 'text-[#92400E]' },
  call_voicemail: { label: 'Voicemail Left', bg: 'bg-[#EFF6FF]', text: 'text-[#1D4ED8]' },
  launched: { label: 'Active', bg: 'bg-[#EFF6FF]', text: 'text-[#1D4ED8]' },
  call_no_answer: { label: 'Active', bg: 'bg-[#EFF6FF]', text: 'text-[#1D4ED8]' },
  unsubscribed: { label: 'Not a Fit', bg: 'bg-[#FEF2F2]', text: 'text-[#991B1B]' },
  not_contacted: { label: 'Not Contacted', bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]' },
};

// Priority order for determining display status from multiple events
const STATUS_PRIORITY: string[] = [
  'interested',
  'not_a_fit',
  'replied',
  'call_answered',
  'opened',
  'clicked',
  'call_voicemail',
  'launched',
  'call_no_answer',
  'unsubscribed',
];

export function getHighestPriorityStatus(eventTypes: string[]): OutreachStatusType {
  if (!eventTypes.length) return 'not_contacted';
  for (const status of STATUS_PRIORITY) {
    if (eventTypes.includes(status)) return status as OutreachStatusType;
  }
  return 'not_contacted';
}

interface StatusBadgeProps {
  status: OutreachStatusType | string;
  className?: string;
  onClick?: () => void;
}

export function StatusBadge({ status, className, onClick }: StatusBadgeProps) {
  const config = STATUS_MAP[status] || STATUS_MAP.not_contacted;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.bg,
        config.text,
        onClick && 'cursor-pointer hover:opacity-80',
        className,
      )}
      onClick={onClick}
    >
      {config.label}
    </span>
  );
}
