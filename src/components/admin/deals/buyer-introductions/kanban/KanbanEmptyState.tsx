import { UserPlus, Send, ThumbsUp, ThumbsDown } from 'lucide-react';
import type { KanbanColumn } from '../hooks/use-introduction-pipeline';

const EMPTY_CONFIG: Record<KanbanColumn, { icon: typeof UserPlus; message: string }> = {
  to_introduce: {
    icon: UserPlus,
    message: 'No buyers queued. Add from Recommended Buyers or manually.',
  },
  introduced: {
    icon: Send,
    message: 'No buyers introduced yet. Move buyers here after reaching out.',
  },
  interested: {
    icon: ThumbsUp,
    message: 'No interested buyers yet.',
  },
  passed: {
    icon: ThumbsDown,
    message: 'No passed buyers.',
  },
};

interface KanbanEmptyStateProps {
  column: KanbanColumn;
}

export function KanbanEmptyState({ column }: KanbanEmptyStateProps) {
  const config = EMPTY_CONFIG[column];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/30 mb-2" />
      <p className="text-xs text-muted-foreground">{config.message}</p>
    </div>
  );
}
