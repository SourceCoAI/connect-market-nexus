import { useState, useEffect, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core';
import { usePipelineCore } from '@/hooks/admin/use-pipeline-core';
import { useUpdateDealStage } from '@/hooks/admin/use-deals';
import { PipelineKanbanColumn } from './PipelineKanbanColumn';
import { PipelineKanbanCardOverlay } from './PipelineKanbanCardOverlay';
import { DealOwnerWarningDialog } from '@/components/admin/DealOwnerWarningDialog';
import { AssignOwnerDialog } from '@/components/admin/AssignOwnerDialog';
import { OwnerIntroConfigDialog } from '@/components/admin/OwnerIntroConfigDialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUpdateDeal } from '@/hooks/admin/use-deals';
import { useUpdateListing } from '@/hooks/admin/listings/use-update-listing';
import { useToast } from '@/hooks/use-toast';

interface PipelineKanbanViewProps {
  pipeline: ReturnType<typeof usePipelineCore>;
  onOpenCreateDeal?: (stageId?: string) => void;
}

export function PipelineKanbanView({ pipeline, onOpenCreateDeal }: PipelineKanbanViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [ownerWarning, setOwnerWarning] = useState<{
    show: boolean;
    ownerName: string;
    dealTitle: string;
    dealId: string;
    stageId: string;
  } | null>(null);
  const [ownerAssignmentNeeded, setOwnerAssignmentNeeded] = useState<{
    show: boolean;
    dealTitle: string;
    dealId: string;
    stageId: string;
    fromStage?: string;
    toStage?: string;
  } | null>(null);
  const [ownerIntroConfig, setOwnerIntroConfig] = useState<{
    show: boolean;
    dealTitle: string;
    dealId: string;
    listingId: string;
    stageId: string;
    currentDealOwner: { id: string; name: string; email: string } | null;
    currentPrimaryOwner: { id: string; name: string; email: string } | null;
    fromStage?: string;
    toStage?: string;
  } | null>(null);

  const updateDealStage = useUpdateDealStage();
  const updateDeal = useUpdateDeal();
  const updateListing = useUpdateListing();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setCurrentUserId(data.user?.id || null))
      .catch(() => null);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Transform stages to include metrics
  const stagesWithMetrics = useMemo(() => {
    return pipeline.stages.map((stage) => {
      const stageDeals = pipeline.deals.filter((d) => d.stage_id === stage.id);
      return {
        ...stage,
        dealCount: stageDeals.length,
        totalValue: stageDeals.reduce((sum, d) => sum + (Number(d.deal_value) || 0), 0),
        avgProbability:
          stageDeals.length > 0
            ? stageDeals.reduce((sum, d) => sum + (d.deal_probability || 0), 0) / stageDeals.length
            : 0,
        deals: stageDeals,
      };
    });
  }, [pipeline.stages, pipeline.deals]);

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));
  const handleDragOver = (_event: DragOverEvent) => {};

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeIdStr = String(active?.id ?? '');
    const overIdStr = String(over?.id ?? '');

    if (!over || !pipeline.deals) {
      setActiveId(null);
      return;
    }

    const dealId = activeIdStr.startsWith('deal:') ? activeIdStr.slice(5) : activeIdStr;
    let destStageId: string | null = null;

    if (overIdStr.startsWith('stage:')) {
      destStageId = overIdStr.slice(6);
    } else if (overIdStr.startsWith('deal:')) {
      const overDeal = pipeline.deals.find((d) => d.deal_id === overIdStr.slice(5));
      destStageId = overDeal?.stage_id || null;
    }

    if (!destStageId) {
      setActiveId(null);
      return;
    }

    const deal = pipeline.deals.find((d) => d.deal_id === dealId);
    const targetStage = pipeline.stages.find((s) => s.id === destStageId);

    if (!deal || !targetStage || deal.stage_id === destStageId) {
      setActiveId(null);
      return;
    }

    // H-5 FIX: Use stage type instead of hardcoded name for owner intro check.
    // Supports both the preferred type-based check and legacy name match as fallback.
    if ((targetStage as any).type === 'owner_intro' || targetStage.name === 'Owner intro requested') {
      try {
        if (!deal.listing_id) {
          toast({
            title: 'Error',
            description: 'This deal is not linked to a listing.',
            variant: 'destructive',
          });
          setActiveId(null);
          return;
        }

        // Fetch listing data with primary owner
        const { data: listingData, error: listingDataError } = await supabase
          .from('listings')
          .select(
            `
            id,
            primary_owner_id,
            primary_owner:profiles!listings_primary_owner_id_fkey(id, first_name, last_name, email)
          `,
          )
          .eq('id', deal.listing_id)
          .single();
        if (listingDataError) throw listingDataError;

        if (!listingData) {
          toast({
            title: 'Error',
            description: 'Could not find listing information.',
            variant: 'destructive',
          });
          setActiveId(null);
          return;
        }

        // Fetch deal owner if assigned
        let dealOwner = null;
        if (deal.assigned_to) {
          const { data: ownerData, error: ownerDataError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .eq('id', deal.assigned_to)
            .single();
          if (ownerDataError) throw ownerDataError;

          if (ownerData) {
            dealOwner = {
              id: ownerData.id,
              name:
                `${ownerData.first_name || ''} ${ownerData.last_name || ''}`.trim() ||
                ownerData.email,
              email: ownerData.email,
            };
          }
        }

        // Format primary owner
        const primaryOwner = listingData?.primary_owner
          ? {
              id: listingData.primary_owner.id,
              name:
                `${listingData.primary_owner.first_name || ''} ${listingData.primary_owner.last_name || ''}`.trim() ||
                listingData.primary_owner.email,
              email: listingData.primary_owner.email,
            }
          : null;

        // Show configuration dialog
        setOwnerIntroConfig({
          show: true,
          dealTitle: deal.title,
          dealId: deal.deal_id,
          listingId: listingData.id,
          stageId: destStageId,
          currentDealOwner: dealOwner,
          currentPrimaryOwner: primaryOwner,
          fromStage: deal.stage_name || undefined,
          toStage: targetStage.name,
        });

        setActiveId(null);
        return;
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to verify owner information. Please try again.',
          variant: 'destructive',
        });
        setActiveId(null);
        return;
      }
    }

    // Check if this deal belongs to another owner BEFORE attempting the mutation
    if (currentUserId && deal.assigned_to && deal.assigned_to !== currentUserId) {
      const ownerName = deal.assigned_admin_name
        ? `${deal.assigned_admin_name}`.trim()
        : 'Another admin';

      // Show warning dialog and store the pending move
      setOwnerWarning({
        show: true,
        ownerName,
        dealTitle: deal.title,
        dealId,
        stageId: destStageId,
      });
      setActiveId(null);
      return;
    }

    // No ownership conflict, proceed with the move
    updateDealStage.mutate({
      dealId,
      stageId: destStageId,
      fromStage: deal.stage_name || undefined,
      toStage: targetStage.name,
      currentAdminId: currentUserId ?? undefined,
      skipOwnerCheck: true, // We already checked above
    });
    setActiveId(null);
  };

  const handleOwnerWarningConfirm = () => {
    if (!ownerWarning) return;

    const deal = pipeline.deals.find((d) => d.deal_id === ownerWarning.dealId);
    const targetStage = stagesWithMetrics.find((s) => s.id === ownerWarning.stageId);

    if (!deal || !targetStage) {
      console.error('[Owner Warning] Deal or stage not found', {
        dealId: ownerWarning.dealId,
        stageId: ownerWarning.stageId,
      });
      setOwnerWarning(null);
      return;
    }

    updateDealStage.mutate({
      dealId: ownerWarning.dealId,
      stageId: ownerWarning.stageId,
      fromStage: deal.stage_name || undefined,
      toStage: targetStage.name || undefined,
      currentAdminId: currentUserId ?? undefined,
      skipOwnerCheck: true,
    });

    setOwnerWarning(null);
  };

  const handleOwnerAssignmentConfirm = async (ownerId: string) => {
    if (!ownerAssignmentNeeded) return;

    try {
      await updateDeal.mutateAsync({
        dealId: ownerAssignmentNeeded.dealId,
        updates: {
          assigned_to: ownerId,
          owner_assigned_at: new Date().toISOString(),
          owner_assigned_by: currentUserId ?? undefined,
        },
      });

      updateDealStage.mutate({
        dealId: ownerAssignmentNeeded.dealId,
        stageId: ownerAssignmentNeeded.stageId,
        fromStage: ownerAssignmentNeeded.fromStage,
        toStage: ownerAssignmentNeeded.toStage,
        currentAdminId: currentUserId ?? undefined,
        skipOwnerCheck: true,
      });

      setOwnerAssignmentNeeded(null);
    } catch (error) {
      const { toast } = await import('@/hooks/use-toast');
      toast({
        title: 'Error',
        description: 'Failed to assign owner. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleOwnerIntroConfigConfirm = async (config: {
    primaryOwnerId: string | null;
    dealOwnerId: string | null;
  }) => {
    if (!ownerIntroConfig) return;

    try {
      // Update listing primary owner if changed
      if (
        config.primaryOwnerId &&
        config.primaryOwnerId !== ownerIntroConfig.currentPrimaryOwner?.id
      ) {
        await updateListing.mutateAsync({
          id: ownerIntroConfig.listingId,
          listing: { primary_owner_id: config.primaryOwnerId },
        });
      }

      // Update deal owner if changed
      if (config.dealOwnerId && config.dealOwnerId !== ownerIntroConfig.currentDealOwner?.id) {
        await updateDeal.mutateAsync({
          dealId: ownerIntroConfig.dealId,
          updates: {
            assigned_to: config.dealOwnerId,
            owner_assigned_at: new Date().toISOString(),
            owner_assigned_by: currentUserId ?? undefined,
          },
        });
      }

      // Proceed with stage move
      updateDealStage.mutate({
        dealId: ownerIntroConfig.dealId,
        stageId: ownerIntroConfig.stageId,
        fromStage: ownerIntroConfig.fromStage,
        toStage: ownerIntroConfig.toStage,
        currentAdminId: currentUserId ?? undefined,
        skipOwnerCheck: true,
      });

      setOwnerIntroConfig(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update owner information.',
        variant: 'destructive',
      });
    }
  };

  const scrollToStage = (direction: 'left' | 'right') => {
    const container = document.getElementById('kanban-scroll-container');
    if (container) {
      const newPosition = scrollPosition + (direction === 'left' ? -320 : 320);
      container.scrollTo({ left: newPosition, behavior: 'smooth' });
      setScrollPosition(newPosition);
    }
  };

  const activeDeal = activeId ? pipeline.deals.find((d) => `deal:${d.deal_id}` === activeId) : null;

  return (
    <>
      <div className="h-full flex flex-col">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 relative overflow-hidden">
            <div className="md:hidden absolute top-2 right-2 z-20 flex gap-1 bg-background/95 backdrop-blur-sm rounded-lg p-1 shadow-lg">
              <Button
                variant="outline"
                size="sm"
                onClick={() => scrollToStage('left')}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => scrollToStage('right')}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div
              id="kanban-scroll-container"
              className="absolute inset-0 overflow-x-auto overflow-y-hidden"
              style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
            >
              <div className="flex gap-4 p-4 h-full min-w-min" style={{ minHeight: '600px' }}>
                {stagesWithMetrics.map((stage) => (
                  <PipelineKanbanColumn
                    key={stage.id}
                    stage={stage}
                    deals={stage.deals}
                    onDealClick={pipeline.handleDealSelect}
                    onOpenCreateDeal={onOpenCreateDeal}
                    totalStages={pipeline.stages.length}
                  />
                ))}
              </div>
            </div>
          </div>
          <DragOverlay>
            {activeDeal ? <PipelineKanbanCardOverlay deal={activeDeal} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
      {ownerWarning && (
        <DealOwnerWarningDialog
          open={ownerWarning.show}
          onOpenChange={(open) => !open && setOwnerWarning(null)}
          ownerName={ownerWarning.ownerName}
          dealTitle={ownerWarning.dealTitle}
          onConfirm={handleOwnerWarningConfirm}
        />
      )}
      {ownerAssignmentNeeded && (
        <AssignOwnerDialog
          open={ownerAssignmentNeeded.show}
          onOpenChange={(open) => !open && setOwnerAssignmentNeeded(null)}
          dealTitle={ownerAssignmentNeeded.dealTitle}
          onConfirm={handleOwnerAssignmentConfirm}
        />
      )}
      {ownerIntroConfig && (
        <OwnerIntroConfigDialog
          open={ownerIntroConfig.show}
          onOpenChange={(open) => !open && setOwnerIntroConfig(null)}
          dealTitle={ownerIntroConfig.dealTitle}
          listingId={ownerIntroConfig.listingId}
          currentDealOwner={ownerIntroConfig.currentDealOwner}
          currentPrimaryOwner={ownerIntroConfig.currentPrimaryOwner}
          onConfirm={handleOwnerIntroConfigConfirm}
        />
      )}
    </>
  );
}
