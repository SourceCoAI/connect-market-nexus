import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Deal } from '@/hooks/admin/use-deals';
import { PipelineKanbanCard } from './PipelineKanbanCard';

interface StageWithMetrics {
  id: string;
  name: string;
  color: string;
  position: number;
  dealCount: number;
  totalValue: number;
  avgProbability: number;
  deals: Deal[];
}

interface PipelineKanbanColumnProps {
  stage: StageWithMetrics;
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
  onOpenCreateDeal?: (stageId: string) => void;
  totalStages?: number;
}

export function PipelineKanbanColumn({ stage, deals, onDealClick, onOpenCreateDeal, totalStages = 12 }: PipelineKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  const sortableItems = deals.map(d => `deal:${d.deal_id}`);

  const isClosedLost = stage.name.toLowerCase().includes('closed') && stage.name.toLowerCase().includes('lost');
  const isClosedWon = stage.name.toLowerCase().includes('closed') && stage.name.toLowerCase().includes('won');
  const activeProgressStages = totalStages - 1;
  const stageNumber = stage.position + 1;
  const progressPercentage = isClosedWon ? 100 : Math.min((stageNumber / activeProgressStages) * 100, 100);

  return (
    <div className="flex-shrink-0 w-[340px]">
      <div
        ref={setNodeRef}
        className={`h-full flex flex-col rounded-xl transition-colors duration-200 ${
          isOver ? 'ring-2 ring-primary/50' : ''
        }`}
        style={{ padding: '18px', backgroundColor: isOver ? 'hsl(46 33% 95%)' : 'hsl(50 38% 93%)', fontFamily: 'Montserrat, Inter, sans-serif' }}
      >
        {/* Column Header */}
        <div className="mb-4 pb-3.5 border-b-2 border-border/40">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            <h3 className="font-bold text-[15px] text-foreground truncate">{stage.name}</h3>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">
              {!isClosedLost ? `Stage ${isClosedWon ? activeProgressStages : stageNumber} of ${activeProgressStages}` : 'Terminal'}
            </span>
            <Badge variant="secondary" className="bg-card text-foreground/70 border border-border/50 h-6 px-3 text-xs font-bold rounded-full">
              {stage.dealCount}
            </Badge>
          </div>

          {/* Progress Bar */}
          {!isClosedLost && (
            <div className="mt-2 w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          )}
        </div>

        {/* Deals List */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
            <div className="min-h-full">
              {deals.map((deal) => (
                <PipelineKanbanCard key={deal.deal_id} deal={deal} onDealClick={onDealClick} />
              ))}

              {/* Add Pairing Button */}
              <Button
                variant="ghost"
                className="w-full h-12 border-2 border-dashed border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors rounded-lg mt-2"
                onClick={() => onOpenCreateDeal?.(stage.id)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Pairing
              </Button>

              {/* Empty State */}
              {deals.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <div className="text-4xl opacity-30 mb-3">📭</div>
                  <div className="text-sm">No deals in this stage</div>
                </div>
              )}
            </div>
          </SortableContext>
        </div>
      </div>
    </div>
  );
}
