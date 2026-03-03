import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";


interface EditInvestmentCriteriaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Record<string, never>) => void;
  isSaving?: boolean;
}

export const EditInvestmentCriteriaDialog = ({
  open,
  onOpenChange,
  onSave,
  isSaving = false,
}: EditInvestmentCriteriaDialogProps) => {
  const handleSave = () => {
    onSave({});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Investment Criteria</DialogTitle>
          <DialogDescription>Update investment criteria</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">No editable criteria fields available.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
