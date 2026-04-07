import React from 'react';
import { Building2, Users, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserFirm } from '@/hooks/admin/use-user-firm';
import { Link } from 'react-router-dom';

interface UserFirmBadgeProps {
  userId: string;
  compact?: boolean;
  firmData?: { firm_id: string; primary_company_name: string | null; fee_agreement_signed: boolean | null; nda_signed: boolean | null } | null;
}

export const UserFirmBadge = React.memo(function UserFirmBadge({ userId, compact = false, firmData }: UserFirmBadgeProps) {
  // Skip individual query if bulk data was provided
  const { data: fetchedFirmInfo, isLoading } = useUserFirm(firmData !== undefined ? undefined : userId);

  const firmInfo = firmData
    ? { firm_id: firmData.firm_id, firm_name: firmData.primary_company_name, member_count: null, fee_agreement_signed: firmData.fee_agreement_signed ?? false, nda_signed: firmData.nda_signed ?? false }
    : fetchedFirmInfo;

  if (isLoading) {
    return <Badge variant="outline" className="text-xs">Loading...</Badge>;
  }

  if (!firmInfo) {
    return compact ? null : <Badge variant="secondary" className="text-xs">No Firm</Badge>;
  }

  const content = (
    <div className="flex items-center gap-1.5">
      <Building2 className="h-3 w-3" />
      {!compact && <span>{firmInfo.firm_name}</span>}
      <Users className="h-3 w-3" />
      <span>{firmInfo.member_count}</span>
      {(firmInfo.fee_agreement_signed || firmInfo.nda_signed) && (
        <CheckCircle2 className="h-3 w-3 text-green-600" />
      )}
    </div>
  );

  const tooltip = (
    <div className="space-y-1 text-xs">
      <p className="font-semibold">{firmInfo.firm_name}</p>
      <p>{firmInfo.member_count} {firmInfo.member_count === 1 ? 'member' : 'members'}</p>
      {firmInfo.fee_agreement_signed && <p className="text-green-600">✓ Fee Agreement Signed (Firm-wide)</p>}
      {firmInfo.nda_signed && <p className="text-green-600">✓ NDA Signed (Firm-wide)</p>}
      <p className="text-muted-foreground mt-2">Click to view firm details</p>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/admin/buyers/firm-agreements">
            <Badge variant="outline" className="cursor-pointer hover:bg-muted text-xs">
              {content}
            </Badge>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
