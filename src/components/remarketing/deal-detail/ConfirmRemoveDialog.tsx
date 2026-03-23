import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmRemoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  selectedBuyerNames: string[];
  onConfirm: () => void;
  isRemoving: boolean;
}

export function ConfirmRemoveDialog({
  open,
  onOpenChange,
  selectedCount,
  selectedBuyerNames,
  onConfirm,
  isRemoving,
}: ConfirmRemoveDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {selectedCount} buyer{selectedCount === 1 ? '' : 's'} from deal?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the selected buyers from this deal's introduction pipeline. They will
            still exist in your buyer pool and can be re-added later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-32 overflow-y-auto text-sm text-muted-foreground px-1">
          {selectedBuyerNames.map((name, i) => (
            <div key={i} className="py-0.5">
              &bull; {name}
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isRemoving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isRemoving ? 'Removing...' : 'Remove from Deal'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
