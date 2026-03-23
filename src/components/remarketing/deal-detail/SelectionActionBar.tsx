import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Trash2 } from 'lucide-react';

interface SelectionActionBarProps {
  selectedCount: number;
  selectedBuyerNames: string[];
  onClear: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}

export function SelectionActionBar({
  selectedCount,
  selectedBuyerNames,
  onClear,
  onRemove,
  isRemoving,
}: SelectionActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-20 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="text-xs font-semibold">
          {selectedCount} selected
        </Badge>
        <span className="text-sm text-blue-700">
          {selectedBuyerNames.slice(0, 3).join(', ')}
          {selectedBuyerNames.length > 3 && ` +${selectedBuyerNames.length - 3} more`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={onRemove}
          disabled={isRemoving}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove from Deal
        </Button>
      </div>
    </div>
  );
}
