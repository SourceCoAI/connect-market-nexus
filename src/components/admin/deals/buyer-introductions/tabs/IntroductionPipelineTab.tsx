import { KanbanBoard } from '../kanban/KanbanBoard';

interface IntroductionPipelineTabProps {
  listingId: string;
  listingTitle: string;
}

export function IntroductionPipelineTab({ listingId, listingTitle }: IntroductionPipelineTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Introduction Pipeline</h3>
          <p className="text-xs text-muted-foreground">
            Track buyer introductions from first outreach to deal pipeline
          </p>
        </div>
      </div>

      <KanbanBoard listingId={listingId} listingTitle={listingTitle} />
    </div>
  );
}
