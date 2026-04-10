// React is auto-imported via JSX transform
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { CreatePairingModalProps } from './schema';
import { useCreateDealForm } from './useCreateDealForm';
import { BuyerSellerSection } from './BuyerSellerSection';
import { AdditionalDetailsSection } from './AdditionalDetailsSection';
import { DuplicateWarningDialog } from './DuplicateWarningDialog';

export function CreateDealModal({
  open,
  onOpenChange,
  prefilledStageId,
  onDealCreated,
}: CreatePairingModalProps) {
  const {
    form,
    stages,
    listings,
    adminUsers,
    buyerOptions,
    createDealMutation,
    duplicates,
    showDuplicateWarning,
    setShowDuplicateWarning,
    isCheckingDuplicates,
    handleFormSubmit,
    handleCreateAnyway,
    handleCancelDuplicate,
  } = useCreateDealForm(open, onOpenChange, prefilledStageId, onDealCreated);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Pairing</DialogTitle>
            <DialogDescription>
              Pair a buyer and seller from your system. Both must already exist as records.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
              {/* Buyer & Seller Selection + Deal Info */}
              <BuyerSellerSection
                form={form}
                listings={listings}
                stages={stages}
                buyerOptions={buyerOptions}
              />

              {/* Additional Details */}
              <AdditionalDetailsSection form={form} adminUsers={adminUsers} />

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={createDealMutation.isPending || isCheckingDuplicates}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createDealMutation.isPending || isCheckingDuplicates}
                >
                  {(createDealMutation.isPending || isCheckingDuplicates) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isCheckingDuplicates ? 'Checking...' : 'Create Pairing'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <DuplicateWarningDialog
        open={showDuplicateWarning}
        onOpenChange={setShowDuplicateWarning}
        duplicates={duplicates}
        onCreateAnyway={handleCreateAnyway}
        onCancel={handleCancelDuplicate}
      />
    </>
  );
}
