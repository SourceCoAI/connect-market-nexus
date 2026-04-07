import { useState, useMemo, useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User } from '@/types';
import { CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { UserDataCompleteness } from './UserDataCompleteness';
import { BuyerTierBadge, BuyerScoreBadge } from './BuyerQualityBadges';
import { DualFeeAgreementToggle } from './DualFeeAgreementToggle';
import { SimpleFeeAgreementDialog } from './SimpleFeeAgreementDialog';
import { DualNDAToggle } from './DualNDAToggle';
import { SimpleNDADialog } from './SimpleNDADialog';
import { UserFirmBadge } from './UserFirmBadge';
import type { BulkFirmData } from '@/hooks/admin/use-bulk-user-firms';

import { useAllUserRoles } from '@/hooks/permissions/useAllUserRoles';
import { RoleBadge } from './permissions/RoleBadge';
import { AppRole } from '@/hooks/permissions/usePermissions';

import { supabase } from '@/integrations/supabase/client';

import { UserDetails } from './users-table/UserDetails';
import { UserActionButtons } from './users-table/UserActionButtons';
import { UsersTableSkeleton } from './users-table/UsersTableSkeleton';

const PAGE_SIZE = 50;

interface UsersTableProps {
  users: User[];
  onApprove: (user: User) => void;
  onMakeAdmin: (user: User) => void;
  onRevokeAdmin: (user: User) => void;
  onDelete: (user: User) => void;
  isLoading: boolean;
  firmDataMap?: Map<string, BulkFirmData>;
}

export function UsersTable({
  users,
  onApprove,
  onMakeAdmin,
  onRevokeAdmin,
  onDelete,
  isLoading,
  firmDataMap,
}: UsersTableProps) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [selectedUserForEmail, setSelectedUserForEmail] = useState<User | null>(null);
  const [selectedUserForNDA, setSelectedUserForNDA] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const { allUserRoles, isLoadingRoles } = useAllUserRoles();

  const roleMap = useMemo(() => {
    const map = new Map<string, AppRole>();
    if (allUserRoles) {
      for (const ur of allUserRoles) {
        map.set(ur.user_id, ur.role as AppRole);
      }
    }
    return map;
  }, [allUserRoles]);

  const getUserRole = (userId: string): AppRole => roleMap.get(userId) || 'viewer';



  // Pagination
  const totalPages = Math.ceil(users.length / PAGE_SIZE);
  const paginatedUsers = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return users.slice(start, start + PAGE_SIZE);
  }, [users, currentPage]);

  // Reset page when users change
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [users.length, totalPages, currentPage]);

  const toggleExpand = (userId: string) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
  };

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  if (isLoading) {
    return <UsersTableSkeleton />;
  }

  return (
    <>
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="min-w-[200px]">User & Company</TableHead>
              <TableHead className="w-20">Type</TableHead>
              <TableHead className="w-24">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 cursor-default border-b border-dashed border-muted-foreground/40">
                        Tier
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      <p className="text-xs">Buyer classification (T1–T4) based on capital structure and verification. T1 = Platform Add-On, T2 = Committed Capital, T3 = Indep. Sponsor, T4 = Unverified.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="w-16">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 cursor-default border-b border-dashed border-muted-foreground/40">
                        Score
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      <p className="text-xs">Quality score (0–100) computed from buyer type, available capital, profile completeness, and acquisition signals.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="w-20">Profile</TableHead>
              <TableHead className="w-16">Fee</TableHead>
              <TableHead className="w-16">NDA</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="hidden lg:table-cell w-24">Joined</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedUsers.flatMap((user) => [
              <TableRow
                key={user.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => toggleExpand(user.id)}
              >
                <TableCell className="w-8">
                  <Button variant="ghost" size="sm">
                    {expandedUserId === user.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {user.first_name} {user.last_name}
                      </span>
                      {!isLoadingRoles &&
                        (() => {
                          const role = getUserRole(user.id);
                          const effectiveRole: AppRole =
                            role === 'viewer' && user?.is_admin === true ? 'admin' : role;
                          const displayRole = effectiveRole === 'owner' ? 'admin' : effectiveRole;
                          if (displayRole === 'admin') {
                            return <RoleBadge role={displayRole} showTooltip={false} />;
                          }
                          return null;
                        })()}
                      {user.email_verified && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-blue-50 text-blue-700 px-1 py-0"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />✓
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {user.company && (
                        <div className="text-xs font-medium text-foreground truncate">
                          {user.company}
                        </div>
                      )}
                      <UserFirmBadge userId={user.id} compact firmData={firmDataMap?.get(user.id)} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  <div className="text-xs">
                    {(() => {
                      const bt = user.buyer_type;
                      if (!bt) return '\u2014';
                      const map: Record<string, string> = {
                        private_equity: 'PE', privateEquity: 'PE',
                        family_office: 'FO', familyOffice: 'FO',
                        search_fund: 'SF', searchFund: 'SF',
                        independent_sponsor: 'IS', independentSponsor: 'IS',
                        corporate: 'Corp',
                        individual_buyer: 'Indiv', individual: 'Indiv',
                        advisor: 'Advisor',
                        business_owner: 'Owner', businessOwner: 'Owner',
                      };
                      return map[bt] || bt;
                    })()}
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-1">
                    <BuyerTierBadge
                      tier={user.buyer_tier}
                      isOverride={user.admin_tier_override != null}
                    />
                    {user.platform_signal_detected && (
                      <Zap className="h-3 w-3 text-green-600" aria-label="Add-On Signal" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  <BuyerScoreBadge score={user.buyer_quality_score} />
                </TableCell>
                <TableCell className="py-2">
                  <UserDataCompleteness user={user} size="sm" />
                </TableCell>
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  <DualFeeAgreementToggle
                    user={user}
                    onSendEmail={setSelectedUserForEmail}
                    size="sm"
                    firmData={firmDataMap?.get(user.id) as { [key: string]: unknown } | undefined}
                  />
                </TableCell>
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  <DualNDAToggle
                    user={user}
                    onSendEmail={setSelectedUserForNDA}
                    size="sm"
                    firmData={firmDataMap?.get(user.id) as { [key: string]: unknown } | undefined}
                  />
                </TableCell>
                <TableCell className="py-2">
                  {user.approval_status === 'approved' && (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs px-2 py-1">
                      ✓
                    </Badge>
                  )}
                  {user.approval_status === 'pending' && (
                    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-xs px-2 py-1">
                      ⏳
                    </Badge>
                  )}
                  {user.approval_status === 'rejected' && (
                    <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs px-2 py-1">
                      ✗
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs py-2">
                  {formatDate(user.created_at)}
                </TableCell>
                <TableCell className="text-right py-2">
                  <UserActionButtons
                    user={user}
                    onApprove={onApprove}
                    onMakeAdmin={onMakeAdmin}
                    onRevokeAdmin={onRevokeAdmin}
                    onDelete={onDelete}
                    isLoading={isLoading}
                  />
                </TableCell>
              </TableRow>,
              ...(expandedUserId === user.id
                ? [
                    <TableRow key={`${user.id}-details`}>
                      <TableCell colSpan={12} className="p-0">
                        <UserDetails user={user} />
                      </TableCell>
                    </TableRow>,
                  ]
                : []),
            ])}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, users.length)} of {users.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-3">
                Page {currentPage + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <SimpleFeeAgreementDialog
        user={selectedUserForEmail}
        isOpen={!!selectedUserForEmail}
        onClose={() => setSelectedUserForEmail(null)}
        onSendEmail={async (user, options) => {
          const { error } = await supabase.functions.invoke('request-agreement-email', {
            body: {
              documentType: 'fee_agreement',
              recipientEmail: user.email,
              recipientName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
              adminOverride: true,
              customSubject: options?.subject,
              customMessage: options?.content,
              customSignatureText: options?.customSignatureText,
            },
          });
          if (error) throw error;
        }}
      />

      <SimpleNDADialog
        open={!!selectedUserForNDA}
        onOpenChange={(open) => !open && setSelectedUserForNDA(null)}
        user={selectedUserForNDA}
        onSendEmail={async (user, options) => {
          const { error } = await supabase.functions.invoke('request-agreement-email', {
            body: {
              documentType: 'nda',
              recipientEmail: user.email,
              recipientName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
              adminOverride: true,
              customSubject: options?.subject,
              customMessage: options?.message,
              customSignatureText: options?.customSignatureText,
            },
          });
          if (error) throw error;
        }}
      />
    </>
  );
}
