import { AddBuyerIntroductionDialog } from '@/components/remarketing/deal-detail/AddBuyerIntroductionDialog';

interface AddBuyerManuallyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle: string;
}

export function AddBuyerManuallyModal({
  open,
  onOpenChange,
  listingId,
  listingTitle,
}: AddBuyerManuallyModalProps) {
  return (
    <AddBuyerIntroductionDialog
      open={open}
      onOpenChange={onOpenChange}
      listingId={listingId}
      listingTitle={listingTitle}
    />
  );
}
