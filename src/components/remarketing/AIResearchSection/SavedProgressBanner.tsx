import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface SavedProgressBannerProps {
  batchIndex: number;
  savedWordCount: number;
  onResume: () => void;
  onStartOver: () => void;
}

export const SavedProgressBanner = ({
  batchIndex,
  savedWordCount,
  onResume,
  onStartOver,
}: SavedProgressBannerProps) => (
  <div className="flex items-center justify-between p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
    <div>
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        Previous generation was interrupted at phase {batchIndex + 1} of 13
      </p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        {savedWordCount.toLocaleString()} words generated
      </p>
    </div>
    <div className="flex gap-2">
      <Button size="sm" onClick={onResume}>
        <RefreshCw className="h-4 w-4 mr-1" />
        Resume
      </Button>
      <Button size="sm" variant="ghost" onClick={onStartOver}>
        Start Over
      </Button>
    </div>
  </div>
);
