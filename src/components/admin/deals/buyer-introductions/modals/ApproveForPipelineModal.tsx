import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { BuyerIntroduction } from '@/types/buyer-introductions';
import { useApproveForPipeline } from '../hooks/use-approve-for-pipeline';

interface ApproveForPipelineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyer: BuyerIntroduction | null;
  listingId: string;
  listingTitle: string;
}

export function ApproveForPipelineModal({
  open,
  onOpenChange,
  buyer,
  listingId,
  listingTitle,
}: ApproveForPipelineModalProps) {
  const { approve, isPending } = useApproveForPipeline(listingId);

  if (!buyer) return null;

  const handleConfirm = () => {
    approve(buyer, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to Deal Pipeline?</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This will create a deal pipeline entry for{' '}
            <strong className="text-foreground">{buyer.buyer_firm_name}</strong> on{' '}
            <strong className="text-foreground">{listingTitle}</strong> starting at Stage 1.
          </p>
          <p className="text-sm text-muted-foreground">
            You'll manage the rest of the process (NDA, Fee Agreement, Info Sent, etc.) from the
            main deal pipeline.
          </p>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-xs text-emerald-700">
              The buyer will be marked as "Fit & Interested" and a new opportunity will appear in
              your deal pipeline.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            Confirm — Move to Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
