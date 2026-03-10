import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, Eye, Send, Clock, FileDown, MoreHorizontal, AlertCircle } from 'lucide-react';
import type { PandaDocStatus } from '@/hooks/admin/use-pandadoc';

interface AgreementStatusBadgeProps {
  status: PandaDocStatus;
  signedDocumentUrl?: string | null;
  onSend?: () => void;
  onResend?: () => void;
  onManualOverride?: () => void;
  label?: string;
}

const STATUS_CONFIG: Record<PandaDocStatus, {
  label: string;
  variant: string;
  className: string;
  icon: typeof Check;
}> = {
  not_sent: {
    label: 'Not Sent',
    variant: 'outline',
    className: 'border-border/40 bg-muted/30 text-muted-foreground',
    icon: Clock,
  },
  sent: {
    label: 'Sent',
    variant: 'outline',
    className: 'border-blue-500/20 bg-blue-50 text-blue-700',
    icon: Send,
  },
  viewed: {
    label: 'Viewed',
    variant: 'outline',
    className: 'border-amber-500/20 bg-amber-50 text-amber-700',
    icon: Eye,
  },
  signed: {
    label: 'Signed',
    variant: 'outline',
    className: 'border-emerald-500/20 bg-emerald-50 text-emerald-700',
    icon: Check,
  },
  declined: {
    label: 'Declined',
    variant: 'outline',
    className: 'border-red-500/20 bg-red-50 text-red-700',
    icon: AlertCircle,
  },
};

/**
 * Color-coded badge showing agreement signing status.
 * Replaces DocuSealStatusBadge — maps PandaDoc statuses.
 * Clicking opens action menu (Send/Resend, View Signed Doc, Manual Override).
 */
export function AgreementStatusBadge({
  status,
  signedDocumentUrl,
  onSend,
  onResend,
  onManualOverride,
  label,
}: AgreementStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_sent;
  const Icon = config.icon;

  const hasActions = onSend || onResend || onManualOverride || signedDocumentUrl;

  const badge = (
    <Badge
      variant="outline"
      className={`h-5 px-2 font-medium text-[11px] cursor-pointer ${config.className}`}
    >
      <Icon className="h-2.5 w-2.5 mr-1" />
      {label || config.label}
    </Badge>
  );

  if (!hasActions) return badge;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1 focus:outline-none" aria-label={`${label || config.label} status actions`}>
          {badge}
          <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {status === 'not_sent' && onSend && (
          <DropdownMenuItem onClick={onSend}>
            <Send className="h-3.5 w-3.5 mr-2" />
            Send for Signing
          </DropdownMenuItem>
        )}
        {(status === 'sent' || status === 'viewed' || status === 'declined') && onResend && (
          <DropdownMenuItem onClick={onResend}>
            <Send className="h-3.5 w-3.5 mr-2" />
            Resend
          </DropdownMenuItem>
        )}
        {status === 'signed' && signedDocumentUrl && signedDocumentUrl.startsWith('https://') && (
          <DropdownMenuItem onClick={() => window.open(signedDocumentUrl, '_blank', 'noopener,noreferrer')}>
            <FileDown className="h-3.5 w-3.5 mr-2" />
            Download Signed Doc
          </DropdownMenuItem>
        )}
        {onManualOverride && status !== 'signed' && (
          <DropdownMenuItem onClick={onManualOverride}>
            <Check className="h-3.5 w-3.5 mr-2" />
            Manual Override
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
