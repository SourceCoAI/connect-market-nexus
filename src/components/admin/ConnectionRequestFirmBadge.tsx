import { Users, FileCheck, FileSignature } from 'lucide-react';
import { useConnectionRequestFirm } from '@/hooks/admin/use-connection-request-firm';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';

interface ConnectionRequestFirmBadgeProps {
  requestId: string;
  compact?: boolean;
}

export function ConnectionRequestFirmBadge({ requestId, compact = false }: ConnectionRequestFirmBadgeProps) {
  const { data: firmInfo, isLoading } = useConnectionRequestFirm(requestId);

  if (isLoading || !firmInfo || !firmInfo.firm_id) {
    return null;
  }

  const hasSignedAgreements = firmInfo.fee_agreement_signed || firmInfo.nda_signed;
  const memberCount = firmInfo.member_count || 0;

  const content = (
    <Link
      to={`/admin/buyers/pe-firms/${firmInfo.firm_id}`}
      className="inline-flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="font-medium">{firmInfo.firm_name}</span>
      {memberCount > 1 && (
        <span className="text-muted-foreground">({memberCount})</span>
      )}
      {hasSignedAgreements && (
        <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
      )}
    </Link>
  );

  if (compact) {
    return content;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-semibold text-sm">{firmInfo.firm_name}</div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <Users className="h-3 w-3" />
                <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileCheck className="h-3 w-3" />
                <span>Fee Agreement: {firmInfo.fee_agreement_signed ? '✓ Signed' : '✗ Not Signed'}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileSignature className="h-3 w-3" />
                <span>NDA: {firmInfo.nda_signed ? '✓ Signed' : '✗ Not Signed'}</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
