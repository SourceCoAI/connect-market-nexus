import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Send, ThumbsDown, Archive, X } from 'lucide-react';
import type { BuyerIntroduction } from '@/types/buyer-introductions';
import {
  useIntroductionPipeline,
  type KanbanColumn as KanbanColumnType,
} from '../hooks/use-introduction-pipeline';
import { KanbanColumn } from './KanbanColumn';
import { BuyerKanbanCard } from './BuyerKanbanCard';
import { IntroduceModal } from '../modals/IntroduceModal';
import { PassReasonModal } from '../modals/PassReasonModal';
import { ApproveForPipelineModal } from '../modals/ApproveForPipelineModal';
import { AddBuyerManuallyModal } from '../modals/AddBuyerManuallyModal';
import { FollowUpNoteModal } from '../modals/FollowUpNoteModal';

const COLUMN_ORDER: Record<KanbanColumnType, number> = {
  to_introduce: 0,
  introduced: 1,
  interested: 2,
  passed: 3,
};

const COLUMN_LABELS: Record<KanbanColumnType, string> = {
  to_introduce: 'To Introduce',
  introduced: 'Introduced',
  interested: 'Interested',
  passed: 'Passed',
};

interface KanbanBoardProps {
  listingId: string;
  listingTitle: string;
}

export function KanbanBoard({ listingId, listingTitle }: KanbanBoardProps) {
  const {
    columns,
    introductions,
    isLoading,
    moveToColumn,
    updateIntroductionNotes,
    archiveIntroduction,
  } = useIntroductionPipeline(listingId);

  const [activeBuyer, setActiveBuyer] = useState<BuyerIntroduction | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumnType | null>(null);

  // Modal states
  const [introduceTarget, setIntroduceTarget] = useState<BuyerIntroduction | null>(null);
  const [passTarget, setPassTarget] = useState<BuyerIntroduction | null>(null);
  const [approveTarget, setApproveTarget] = useState<BuyerIntroduction | null>(null);
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<BuyerIntroduction | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const GUARDED_STATUSES = new Set(['fit_and_interested', 'deal_created']);

  const getSelectedBuyers = useCallback(() => {
    return introductions.filter((intro) => selectedIds.has(intro.id));
  }, [introductions, selectedIds]);

  const handleBulkMoveToIntroduced = useCallback(() => {
    const buyers = getSelectedBuyers();
    for (const buyer of buyers) {
      if (GUARDED_STATUSES.has(buyer.introduction_status)) continue;
      moveToColumn(buyer.id, 'introduced');
    }
    clearSelection();
  }, [getSelectedBuyers, moveToColumn, clearSelection]);

  const handleBulkMoveToPassed = useCallback(() => {
    const buyers = getSelectedBuyers();
    for (const buyer of buyers) {
      if (GUARDED_STATUSES.has(buyer.introduction_status)) continue;
      moveToColumn(buyer.id, 'passed');
    }
    clearSelection();
  }, [getSelectedBuyers, moveToColumn, clearSelection]);

  const handleBulkArchive = useCallback(() => {
    const buyers = getSelectedBuyers();
    for (const buyer of buyers) {
      if (GUARDED_STATUSES.has(buyer.introduction_status)) continue;
      archiveIntroduction(buyer.id);
    }
    clearSelection();
  }, [getSelectedBuyers, archiveIntroduction, clearSelection]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const resetDragState = useCallback(() => {
    setActiveBuyer(null);
    setActiveColumn(null);
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const data = active.data.current as { buyer: BuyerIntroduction; column: KanbanColumnType } | undefined;
      if (data) {
        setActiveBuyer(data.buyer);
        setActiveColumn(data.column);
      }
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      resetDragState();
      const { active, over } = event;

      if (!over) return;

      const data = active.data.current as { buyer: BuyerIntroduction; column: KanbanColumnType } | undefined;
      if (!data) return;

      const targetColumn = (over.data.current as { column?: KanbanColumnType })?.column;
      const sourceColumn = data.column;

      // If dropped in the same column or no target, no-op
      if (!targetColumn || targetColumn === sourceColumn) return;

      const buyer = data.buyer;

      // Prevent moving fit_and_interested (in pipeline) cards
      if (buyer.introduction_status === 'fit_and_interested') return;

      // Backward move confirmation (moving to a lower-index column, excluding "passed" which is always forward)
      if (
        targetColumn !== 'passed' &&
        COLUMN_ORDER[targetColumn] < COLUMN_ORDER[sourceColumn]
      ) {
        const confirmed = window.confirm(
          `Move this buyer back to "${COLUMN_LABELS[targetColumn]}"? Their progress status will change.`,
        );
        if (!confirmed) return;
      }

      // Moving to "introduced" requires channel selection
      if (targetColumn === 'introduced') {
        setIntroduceTarget(buyer);
        return;
      }

      // Moving to "passed" requires reason
      if (targetColumn === 'passed') {
        setPassTarget(buyer);
        return;
      }

      // Moving to "interested" or "to_introduce" — move directly
      moveToColumn(buyer.id, targetColumn);
    },
    [moveToColumn, resetDragState],
  );

  const handleIntroduceConfirm = useCallback(
    (channel: string, notes: string) => {
      if (introduceTarget) {
        moveToColumn(introduceTarget.id, 'introduced', {
          introduction_method: channel,
          introduction_notes: notes || undefined,
        });
      }
      setIntroduceTarget(null);
    },
    [introduceTarget, moveToColumn],
  );

  const handlePassConfirm = useCallback(
    (reason: string, notes: string) => {
      if (passTarget) {
        moveToColumn(passTarget.id, 'passed', {
          passed_reason: reason,
          passed_notes: notes || undefined,
        });
      }
      setPassTarget(null);
    },
    [passTarget, moveToColumn],
  );

  const handleIntroduceFromButton = useCallback((buyer: BuyerIntroduction) => {
    setIntroduceTarget(buyer);
  }, []);

  const handleMarkInterested = useCallback(
    (buyer: BuyerIntroduction) => {
      moveToColumn(buyer.id, 'interested');
    },
    [moveToColumn],
  );

  const handleMarkPassed = useCallback((buyer: BuyerIntroduction) => {
    setPassTarget(buyer);
  }, []);

  const handleReactivate = useCallback(
    (buyer: BuyerIntroduction) => {
      moveToColumn(buyer.id, 'to_introduce');
    },
    [moveToColumn],
  );

  const handleRemove = useCallback(
    (buyer: BuyerIntroduction) => {
      archiveIntroduction(buyer.id);
    },
    [archiveIntroduction],
  );

  // Follow-up: only update notes, do NOT change status
  const handleFollowUpConfirm = useCallback(
    (notes: string) => {
      if (followUpTarget) {
        updateIntroductionNotes(followUpTarget.id, notes);
      }
      setFollowUpTarget(null);
    },
    [followUpTarget, updateIntroductionNotes],
  );

  const resolvedBuyerIds = Object.fromEntries(
    introductions.map((intro) => [
      intro.id,
      ((intro as BuyerIntroduction & { resolved_buyer_id?: string | null }).resolved_buyer_id ?? null),
    ]),
  );

  const resolvedPeFirmNames = Object.fromEntries(
    introductions.map((intro) => [
      intro.id,
      ((intro as BuyerIntroduction & { resolved_pe_firm_name?: string | null }).resolved_pe_firm_name ?? null),
    ]),
  );

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="min-w-[280px] flex-1">
            <Skeleton className="h-10 w-full mb-2" />
            <Skeleton className="h-32 w-full mb-2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={resetDragState}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[400px]">
          <KanbanColumn
            column="to_introduce"
            buyers={columns.to_introduce}
            resolvedBuyerIds={resolvedBuyerIds}
            resolvedPeFirmNames={resolvedPeFirmNames}
            onAddBuyer={() => setAddBuyerOpen(true)}
            onIntroduce={handleIntroduceFromButton}
            onRemove={handleRemove}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
          <KanbanColumn
            column="introduced"
            buyers={columns.introduced}
            resolvedBuyerIds={resolvedBuyerIds}
            resolvedPeFirmNames={resolvedPeFirmNames}
            onMarkInterested={handleMarkInterested}
            onMarkPassed={handleMarkPassed}
            onLogFollowUp={(buyer) => setFollowUpTarget(buyer)}
            onRemove={handleRemove}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
          <KanbanColumn
            column="interested"
            buyers={columns.interested}
            resolvedBuyerIds={resolvedBuyerIds}
            resolvedPeFirmNames={resolvedPeFirmNames}
            onApproveForPipeline={(buyer) => setApproveTarget(buyer)}
            onMarkPassed={handleMarkPassed}
            onLogFollowUp={(buyer) => setFollowUpTarget(buyer)}
            onRemove={handleRemove}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
          <KanbanColumn
            column="passed"
            buyers={columns.passed}
            resolvedBuyerIds={resolvedBuyerIds}
            resolvedPeFirmNames={resolvedPeFirmNames}
            onReactivate={handleReactivate}
            onRemove={handleRemove}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        </div>

        <DragOverlay dropAnimation={null} zIndex={50}>
          {activeBuyer && activeColumn && (
            <div className="opacity-80 rotate-2 w-[280px]">
              <BuyerKanbanCard buyer={activeBuyer} column={activeColumn} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border rounded-lg shadow-lg px-4 py-2.5">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {selectedIds.size} selected
          </span>
          <div className="h-5 w-px bg-border" />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={handleBulkMoveToIntroduced}
          >
            <Send className="h-3.5 w-3.5" />
            Move to Introduced
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={handleBulkMoveToPassed}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            Move to Passed
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={handleBulkArchive}
          >
            <Archive className="h-3.5 w-3.5" />
            Archive Selected
          </Button>
          <div className="h-5 w-px bg-border" />
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1"
            onClick={clearSelection}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      )}

      {/* Modals */}
      <IntroduceModal
        open={!!introduceTarget}
        onOpenChange={(open) => {
          if (!open) setIntroduceTarget(null);
        }}
        buyerName={introduceTarget?.buyer_firm_name || introduceTarget?.buyer_name || ''}
        onConfirm={handleIntroduceConfirm}
      />

      <PassReasonModal
        open={!!passTarget}
        onOpenChange={(open) => {
          if (!open) setPassTarget(null);
        }}
        buyerName={passTarget?.buyer_firm_name || passTarget?.buyer_name || ''}
        onConfirm={handlePassConfirm}
      />

      <ApproveForPipelineModal
        open={!!approveTarget}
        onOpenChange={(open) => {
          if (!open) setApproveTarget(null);
        }}
        buyer={approveTarget}
        listingId={listingId}
        listingTitle={listingTitle}
      />

      <AddBuyerManuallyModal
        open={addBuyerOpen}
        onOpenChange={setAddBuyerOpen}
        listingId={listingId}
        listingTitle={listingTitle}
      />

      <FollowUpNoteModal
        open={!!followUpTarget}
        onOpenChange={(open) => {
          if (!open) setFollowUpTarget(null);
        }}
        buyerName={followUpTarget?.buyer_firm_name || followUpTarget?.buyer_name || ''}
        onConfirm={handleFollowUpConfirm}
      />
    </>
  );
}
