import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Copy,
  Edit,
  KeyRound,
  XCircle,
  Plus,
  Upload,
  Loader2,
  Building2,
  Mail,
  Phone,
  Calendar,
  Handshake,
  Sparkles,
  BarChart3,
  ChevronDown,
  EyeOff,
  ThumbsDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AddPartnerDialog } from '@/components/remarketing/AddPartnerDialog';
import { AddDealDialog } from '@/components/remarketing/AddDealDialog';
import { DealImportDialog } from '@/components/remarketing/DealImportDialog';
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';
import { PushToSmartleadModal } from '@/components/remarketing/PushToSmartleadModal';
import {
  DealBulkActionBar,
  AddDealsToListDialog,
  PushToHeyreachModal,
} from '@/components/remarketing';
import type { DealForList } from '@/components/remarketing';
import { SubmissionReviewQueue } from '@/components/remarketing/SubmissionReviewQueue';
import { EnrichmentProgressIndicator } from '@/components/remarketing/EnrichmentProgressIndicator';
import { SingleDealEnrichmentDialog } from '@/components/remarketing/SingleDealEnrichmentDialog';
import { ArchiveDealDialog } from '@/components/admin/deals/ArchiveDealDialog';
import { PushToPortalDialog } from '@/components/portal/PushToPortalDialog';

import { FilterBar } from '@/components/filters/FilterBar';
import { usePartnerData } from './usePartnerData';
import { usePartnerActions } from './usePartnerActions';
import { DealsTable } from './DealsTable';

export default function ReMarketingReferralPartnerDetail() {
  const { partnerId } = useParams<{ partnerId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialerOpen, setDialerOpen] = useState(false);
  const [smartleadOpen, setSmartleadOpen] = useState(false);
  const [heyreachOpen, setHeyreachOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);

  const data = usePartnerData(partnerId);
  const actions = usePartnerActions(partnerId, data.partner, data.deals);

  const selectedDealsForList = useMemo((): DealForList[] => {
    if (!data.deals || actions.selectedDealIds.size === 0) return [];
    return data.deals
      .filter((d) => actions.selectedDealIds.has(d.id))
      .map((d) => ({
        dealId: d.id,
        dealName: d.internal_company_name || d.title || 'Unknown Deal',
        contactName: d.main_contact_name,
        contactEmail: d.main_contact_email,
        contactPhone: d.main_contact_phone,
      }));
  }, [data.deals, actions.selectedDealIds]);

  if (data.partnerLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data.partner) {
    return (
      <div className="flex-1 p-6">
        <Button variant="ghost" onClick={() => navigate('/admin/remarketing/leads/referrals')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Partners
        </Button>
        <div className="text-center py-12 text-muted-foreground">Partner not found</div>
      </div>
    );
  }

  const partner = data.partner;
  const pendingCount = data.submissions?.length || 0;

  return (
    <TooltipProvider>
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Back + Header */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/remarketing/leads/referrals')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Partners
          </Button>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Handshake className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{partner.name}</h1>
                  <Badge variant={partner.is_active ? 'default' : 'secondary'}>
                    {partner.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                  {partner.company && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {partner.company}
                    </span>
                  )}
                  {partner.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {partner.email}
                    </span>
                  )}
                  {partner.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {partner.phone}
                    </span>
                  )}
                  {partner.created_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Added {format(new Date(partner.created_at), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => actions.setAddDealOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Deal
              </Button>
              <Button variant="outline" size="sm" onClick={() => actions.setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-1" />
                Import Deals
              </Button>
              <Button variant="outline" size="sm" onClick={() => actions.setEditDialogOpen(true)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => actions.deactivateMutation.mutate()}
              >
                <XCircle className="h-4 w-4 mr-1" />
                {partner.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        </div>

        {/* Share Link & Password */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium mb-1">Partner Tracker Link</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {window.location.origin}/referrals/{partner.share_token || '...'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={actions.handleCopyShareLink}>
                <Copy className="h-3 w-3 mr-1" />
                Copy URL
              </Button>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <p className="text-sm font-medium mb-1">Password</p>
                <p className="text-xs font-mono text-muted-foreground">
                  {partner?.share_password_plaintext ||
                    actions.lastGeneratedPassword ||
                    'Not set — click Reset Password'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(partner?.share_password_plaintext || actions.lastGeneratedPassword) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        partner?.share_password_plaintext || actions.lastGeneratedPassword || '',
                      );
                      toast.success('Password copied to clipboard');
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Password
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => actions.resetPasswordMutation.mutate()}
                  disabled={actions.resetPasswordMutation.isPending}
                >
                  <KeyRound className="h-3 w-3 mr-1" />
                  Reset Password
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Deals</div>
              <div className="text-2xl font-bold">{data.kpis.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Enriched
              </div>
              <div className="text-2xl font-bold">{data.kpis.enriched}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <BarChart3 className="h-3 w-3" /> Scored
              </div>
              <div className="text-2xl font-bold">{data.kpis.scored}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Avg Quality</div>
              <div className="text-2xl font-bold">
                {data.kpis.avgQuality > 0 ? data.kpis.avgQuality.toFixed(0) : '-'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enrichment Progress */}
        {data.enrichmentProgress && data.enrichmentProgress.total > 0 && (
          <EnrichmentProgressIndicator
            completedCount={data.enrichmentProgress.completed}
            totalCount={data.enrichmentProgress.total}
            progress={(data.enrichmentProgress.completed / data.enrichmentProgress.total) * 100}
            itemLabel="deals"
          />
        )}

        {/* Pending Submissions */}
        {pendingCount > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                Pending Submissions
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  {pendingCount}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SubmissionReviewQueue
                submissions={data.submissions || []}
                isLoading={data.submissionsLoading}
                showPartnerColumn={false}
              />
            </CardContent>
          </Card>
        )}

        {/* Deals Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">
                  Referred Deals ({data.deals?.length || 0})
                </CardTitle>
                {(() => {
                  const pc =
                    data.deals?.filter((d) => d.status === 'pending_referral_review').length || 0;
                  return pc > 0 ? (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                      {pc} pending review
                    </Badge>
                  ) : null;
                })()}
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Sparkles className="h-4 w-4 mr-1" />
                      Enrich
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => actions.handleBulkEnrich('unenriched')}>
                      Enrich Unenriched
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => actions.handleBulkEnrich('all')}>
                      Re-enrich All
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <BarChart3 className="h-4 w-4 mr-1" />
                      Score
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => actions.handleBulkScore('unscored')}>
                      Score Unscored
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => actions.handleBulkScore('all')}>
                      Recalculate All
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <FilterBar
              filterState={data.filterState}
              onFilterStateChange={data.setFilterState}
              fieldDefinitions={data.fieldDefinitions}
              dynamicOptions={data.dynamicOptions}
              totalCount={data.totalCount}
              filteredCount={data.sortedDeals.length}
              compact
            >
              <button
                onClick={() => data.setHidePushed((h) => !h)}
                className={cn(
                  'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap',
                  data.hidePushed
                    ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                <EyeOff className="h-3.5 w-3.5" />
                {data.hidePushed ? 'Un-Pushed Only' : 'Hide Pushed'}
              </button>
              <button
                onClick={() => data.setHideNotFit((h) => !h)}
                className={cn(
                  'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap',
                  data.hideNotFit
                    ? 'bg-orange-100 border-orange-300 text-orange-700 font-medium'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                {data.hideNotFit ? 'Not Fit Hidden' : 'Show Not Fit'}
              </button>
            </FilterBar>
          </CardHeader>

          {/* Bulk Actions */}
          {actions.someSelected && (
            <div className="px-6 pb-3">
              <DealBulkActionBar
                selectedIds={actions.selectedDealIds}
                deals={data.deals || []}
                onClearSelection={() => actions.setSelectedDealIds(new Set())}
                onRefetch={() =>
                  queryClient.invalidateQueries({
                    queryKey: ['referral-partners', partnerId, 'deals'],
                  })
                }
                onApproveToActiveDeals={() => actions.handleBulkApprove()}
                onEnrichSelected={(_dealIds, mode) => actions.handleBulkEnrich(mode || 'unenriched')}
                enrichDropdown
                onPushToDialer={() => setDialerOpen(true)}
                onPushToSmartlead={() => setSmartleadOpen(true)}
                onPushToHeyreach={() => setHeyreachOpen(true)}
                onPushToPortal={() => setPortalOpen(true)}
                onAddToList={() => setAddToListOpen(true)}
                onMarkNotFit={actions.handleMarkNotFit}
                isMarkingNotFit={actions.isMarkingNotFit}
                onArchive={actions.handleBulkArchive}
                onDelete={actions.handleBulkDelete}
              />
            </div>
          )}

          <CardContent className="p-0">
            {data.dealsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !data.deals?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No deals referred by this partner yet</p>
              </div>
            ) : (
              <DealsTable
                deals={data.sortedDeals}
                sortField={data.sortField}
                sortDir={data.sortDir}
                toggleSort={data.toggleSort}
                selectedDealIds={actions.selectedDealIds}
                setSelectedDealIds={actions.setSelectedDealIds}
                allSelected={actions.allSelected}
                toggleSelectAll={actions.toggleSelectAll}
                toggleSelect={actions.toggleSelect}
                onEnrichDeal={actions.handleEnrichDeal}
                onConfirmAction={actions.setConfirmAction}
                partnerId={partnerId!}
              />
            )}
          </CardContent>
        </Card>

        {/* Dialogs */}
        <AddPartnerDialog
          open={actions.editDialogOpen}
          onOpenChange={actions.setEditDialogOpen}
          editingPartner={partner ? { ...partner, partner_type: partner.partner_type ?? undefined } as any : undefined}
        />
        <AddDealDialog
          open={actions.addDealOpen}
          onOpenChange={actions.setAddDealOpen}
          onDealCreated={actions.handleDealCreated}
          referralPartnerId={partnerId}
        />
        <DealImportDialog
          open={actions.importDialogOpen}
          onOpenChange={actions.setImportDialogOpen}
          onImportComplete={actions.handleImportComplete}
          onImportCompleteWithIds={actions.handleImportCompleteWithIds}
          referralPartnerId={partnerId}
        />
        <SingleDealEnrichmentDialog
          open={actions.enrichmentDialogOpen}
          onOpenChange={actions.setEnrichmentDialogOpen}
          result={actions.enrichmentResult}
        />

        <AlertDialog
          open={actions.confirmAction?.type === 'delete'}
          onOpenChange={(open) => !open && actions.setConfirmAction(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Deals</AlertDialogTitle>
              <AlertDialogDescription>
                {`This will permanently delete ${actions.confirmAction?.ids.length ?? 0} deal(s) and all associated data. This cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={actions.handleBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ArchiveDealDialog
          open={actions.confirmAction?.type === 'archive'}
          onOpenChange={(open) => { if (!open) actions.setConfirmAction(null); }}
          deal={
            actions.confirmAction?.type === 'archive'
              ? {
                  id: actions.confirmAction.ids[0],
                  name: data.deals?.find((d) => d.id === actions.confirmAction!.ids[0])?.internal_company_name
                    || data.deals?.find((d) => d.id === actions.confirmAction!.ids[0])?.title
                    || 'Unknown Deal',
                }
              : null
          }
          onConfirmArchive={async (reason) => {
            await actions.handleBulkArchive(reason);
          }}
        />
        <PushToDialerModal
          open={dialerOpen}
          onOpenChange={setDialerOpen}
          contactIds={Array.from(actions.selectedDealIds)}
          contactCount={actions.selectedDealIds.size}
          entityType="listings"
        />
        <PushToSmartleadModal
          open={smartleadOpen}
          onOpenChange={setSmartleadOpen}
          contactIds={Array.from(actions.selectedDealIds)}
          contactCount={actions.selectedDealIds.size}
          entityType="listings"
        />
        <PushToHeyreachModal
          open={heyreachOpen}
          onOpenChange={setHeyreachOpen}
          contactIds={Array.from(actions.selectedDealIds)}
          contactCount={actions.selectedDealIds.size}
          entityType="listings"
        />
        <AddDealsToListDialog
          open={addToListOpen}
          onOpenChange={setAddToListOpen}
          selectedDeals={selectedDealsForList}
          entityType="referral_deal"
        />
        <PushToPortalDialog
          open={portalOpen}
          onOpenChange={setPortalOpen}
          listingIds={Array.from(actions.selectedDealIds)}
        />
      </div>
    </TooltipProvider>
  );
}
