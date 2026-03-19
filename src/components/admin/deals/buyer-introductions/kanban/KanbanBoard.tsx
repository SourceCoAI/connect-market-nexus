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
            onAddBuyer={() => setAddBuyerOpen(true)}
            onIntroduce={handleIntroduceFromButton}
            onRemove={handleRemove}
          />
          <KanbanColumn
            column="introduced"
            buyers={columns.introduced}
            onMarkInterested={handleMarkInterested}
            onMarkPassed={handleMarkPassed}
            onLogFollowUp={(buyer) => setFollowUpTarget(buyer)}
          />
          <KanbanColumn
            column="interested"
            buyers={columns.interested}
            onApproveForPipeline={(buyer) => setApproveTarget(buyer)}
          />
          <KanbanColumn
            column="passed"
            buyers={columns.passed}
            onReactivate={handleReactivate}
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
