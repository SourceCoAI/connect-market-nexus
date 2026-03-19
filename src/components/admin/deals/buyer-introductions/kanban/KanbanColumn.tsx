import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BuyerIntroduction } from '@/types/buyer-introductions';
import { BuyerKanbanCard } from './BuyerKanbanCard';
import { KanbanEmptyState } from './KanbanEmptyState';
import type { KanbanColumn as KanbanColumnType } from '../hooks/use-introduction-pipeline';
import { useState } from 'react';

const COLUMN_CONFIG: Record<
  KanbanColumnType,
  { title: string; bg: string; headerColor: string }
> = {
  to_introduce: {
    title: 'Buyers to Introduce',
    bg: 'bg-slate-50',
    headerColor: 'text-slate-700',
  },
  introduced: {
    title: 'Introduced — Awaiting Response',
    bg: 'bg-blue-50/30',
    headerColor: 'text-blue-700',
  },
  interested: {
    title: 'Interested in Meeting',
    bg: 'bg-green-50/30',
    headerColor: 'text-green-700',
  },
  passed: {
    title: 'Passed / Not Interested',
    bg: 'bg-gray-100/50',
    headerColor: 'text-gray-600',
  },
};

interface KanbanColumnProps {
  column: KanbanColumnType;
  buyers: BuyerIntroduction[];
  resolvedBuyerIds?: Record<string, string | null>;
  resolvedPeFirmNames?: Record<string, string | null>;
  onAddBuyer?: () => void;
  onIntroduce?: (buyer: BuyerIntroduction) => void;
  onMarkInterested?: (buyer: BuyerIntroduction) => void;
  onMarkPassed?: (buyer: BuyerIntroduction) => void;
  onApproveForPipeline?: (buyer: BuyerIntroduction) => void;
  onReactivate?: (buyer: BuyerIntroduction) => void;
  onRemove?: (buyer: BuyerIntroduction) => void;
  onLogFollowUp?: (buyer: BuyerIntroduction) => void;
}

export function KanbanColumn({
  column,
  buyers,
  resolvedBuyerIds,
  resolvedPeFirmNames,
  onAddBuyer,
  onIntroduce,
  onMarkInterested,
  onMarkPassed,
  onApproveForPipeline,
  onReactivate,
  onRemove,
  onLogFollowUp,
}: KanbanColumnProps) {
  const config = COLUMN_CONFIG[column];
  const [collapsed, setCollapsed] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: column,
    data: { column },
  });

  if (column === 'passed' && collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'w-12 shrink-0 flex flex-col items-center',
          isOver && 'ring-2 ring-blue-400 ring-inset rounded-lg',
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 mb-2"
          onClick={() => setCollapsed(false)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="writing-mode-vertical text-xs font-medium text-muted-foreground whitespace-nowrap rotate-180"
             style={{ writingMode: 'vertical-rl' }}>
          Passed ({buyers.length})
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-lg border min-w-[280px] max-w-[320px] flex-1',
        config.bg,
        isOver && 'ring-2 ring-blue-400 ring-inset',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-white/60 rounded-t-lg">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={cn('text-sm font-semibold truncate', config.headerColor)}>
            {config.title}
          </h3>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
            {buyers.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {column === 'to_introduce' && onAddBuyer && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={onAddBuyer}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          )}
          {column === 'passed' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setCollapsed(true)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
        <SortableContext
          items={buyers.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {buyers.length === 0 ? (
            <KanbanEmptyState column={column} />
          ) : (
            buyers.map((buyer) => (
              <BuyerKanbanCard
                key={buyer.id}
                buyer={buyer}
                column={column}
                resolvedBuyerId={resolvedBuyerIds?.[buyer.id] ?? null}
                onIntroduce={onIntroduce}
                onMarkInterested={onMarkInterested}
                onMarkPassed={onMarkPassed}
                onApproveForPipeline={onApproveForPipeline}
                onReactivate={onReactivate}
                onRemove={onRemove}
                onLogFollowUp={onLogFollowUp}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
