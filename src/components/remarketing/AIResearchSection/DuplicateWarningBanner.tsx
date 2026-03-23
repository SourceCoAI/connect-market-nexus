import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface DuplicateWarningBannerProps {
  existingWordCount: number;
  onRegenerate: () => void;
  onCancel: () => void;
}

export const DuplicateWarningBanner = ({
  existingWordCount,
  onRegenerate,
  onCancel,
}: DuplicateWarningBannerProps) => (
  <div className="flex items-center justify-between p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
    <div>
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        A guide already exists ({existingWordCount.toLocaleString()} words)
      </p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        Regenerating will replace the existing content.
      </p>
    </div>
    <div className="flex gap-2">
      <Button size="sm" variant="destructive" onClick={onRegenerate}>
        <RefreshCw className="h-4 w-4 mr-1" />
        Regenerate Anyway
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </div>
);
