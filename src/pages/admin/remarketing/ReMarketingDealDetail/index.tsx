// ACTIVE — this is the component rendered at /admin/remarketing/deals/:dealId
// and /admin/remarketing/leads/captarget/:dealId and /admin/remarketing/leads/gp-partners/:dealId
// The monolithic sibling file ReMarketingDealDetail.tsx (1,675 lines) is ORPHANED.
// AUDIT REF: CTO Audit February 2026

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Eye, Activity, UserPlus, FolderOpen, ListChecks } from 'lucide-react';
import { CreateTaskButton, EntityTasksTab, DealSignalsPanel } from '@/components/daily-tasks';
import { useDealDetail } from './useDealDetail';
import { CapTargetInfoCard } from './CapTargetInfoCard';
import { SalesforceInfoCard } from './SalesforceInfoCard';
import { DealHeader } from './DealHeader';
import { OverviewTab } from './OverviewTab';
import { DataRoomTab } from './DataRoomTab';
import { DealCallActivityTab } from './DealCallActivityTab';
import {
  DealContactHistoryTab,
  DealBuyerHistoryTab,
  BuyerIntroductionTracker,
  RecommendedBuyersPanel,
} from '@/components/remarketing/deal-detail';
import { ListingNotesLog } from '@/components/remarketing/deal-detail/ListingNotesLog';

const ReMarketingDealDetail = () => {
  const {
    dealId,
    navigate,
    backTo,
    queryClient,
    deal,
    dealLoading,
    scoreStats,
    pipelineStats,
    transcripts,
    transcriptsLoading,
    updateDealMutation,
    toggleUniverseFlagMutation,
    toggleContactOwnerMutation,
    toggleBuyerSearchMutation,
    updateNameMutation,
    isEnriching,
    enrichmentProgress,
    enrichmentStage,
    isAnalyzingNotes,
    buyerHistoryOpen,
    setBuyerHistoryOpen,
    editFinancialsOpen,
    setEditFinancialsOpen,
    isEditingName,
    setIsEditingName,
    editedName,
    setEditedName,
    handleEnrichFromWebsite,
    handleSaveName,
    handleCancelEdit,
    handleAnalyzeNotes,
    effectiveWebsite,
    dataCompleteness,
    tier,
    displayName,
    listedName,
  } = useDealDetail();

  if (dealLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg">Deal not found</h3>
            <p className="text-muted-foreground">The deal you're looking for doesn't exist.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/deals')}>
              Back to Active Deals
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <CapTargetInfoCard deal={deal} dealId={dealId!} />
      <SalesforceInfoCard deal={deal} />

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <DealHeader
            deal={deal}
            backTo={backTo}
            navigate={(to: string | number) => navigate(to as string)}
            displayName={displayName}
            listedName={listedName}
            dataCompleteness={dataCompleteness}
            tier={tier}
            isEditingName={isEditingName}
            setIsEditingName={setIsEditingName}
            editedName={editedName}
            setEditedName={setEditedName}
            handleSaveName={handleSaveName}
            handleCancelEdit={handleCancelEdit}
            updateNameMutation={updateNameMutation}
          />
        </div>
        <CreateTaskButton entityType="deal" entityId={dealId!} entityName={displayName} />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="text-sm">
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="contact-history" className="text-sm">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            Contact History
          </TabsTrigger>
          <TabsTrigger value="buyer-introductions" className="text-sm">
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Buyer Introductions
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-sm">
            <ListChecks className="mr-1.5 h-3.5 w-3.5" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="data-room" className="text-sm">
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            Data Room
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab
            deal={deal as any}
            dealId={dealId!}
            scoreStats={scoreStats}
            pipelineStats={pipelineStats}
            transcripts={transcripts}
            transcriptsLoading={transcriptsLoading}
            effectiveWebsite={effectiveWebsite}
            isEnriching={isEnriching}
            enrichmentProgress={enrichmentProgress}
            enrichmentStage={enrichmentStage}
            isAnalyzingNotes={isAnalyzingNotes}
            buyerHistoryOpen={buyerHistoryOpen}
            setBuyerHistoryOpen={setBuyerHistoryOpen}
            editFinancialsOpen={editFinancialsOpen}
            setEditFinancialsOpen={setEditFinancialsOpen}
            handleEnrichFromWebsite={handleEnrichFromWebsite}
            handleAnalyzeNotes={handleAnalyzeNotes}
            updateDealMutation={updateDealMutation}
            toggleContactOwnerMutation={toggleContactOwnerMutation}
            toggleBuyerSearchMutation={toggleBuyerSearchMutation}
            toggleUniverseFlagMutation={toggleUniverseFlagMutation}
            queryClient={queryClient}
          />
        </TabsContent>

        <TabsContent value="contact-history" className="space-y-6">
          <DealContactHistoryTab
            listingId={dealId!}
            primaryContactEmail={deal.main_contact_email}
            primaryContactName={deal.main_contact_name}
          />
          <DealCallActivityTab listingId={dealId!} />
          <ListingNotesLog listingId={dealId!} />
        </TabsContent>

        <TabsContent value="buyer-introductions" className="space-y-6">
          <RecommendedBuyersPanel listingId={dealId!} listingTitle={displayName} />
          <BuyerIntroductionTracker listingId={dealId!} listingTitle={displayName} />
          <DealBuyerHistoryTab listingId={dealId!} listingTitle={displayName} />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-6">
          <DealSignalsPanel dealId={dealId!} />
          <EntityTasksTab
            entityType="deal"
            entityId={dealId!}
            entityName={displayName}
            dealId={dealId!}
          />
        </TabsContent>

        <TabsContent value="data-room" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <DataRoomTab deal={deal} dealId={dealId!} scoreStats={scoreStats} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReMarketingDealDetail;
