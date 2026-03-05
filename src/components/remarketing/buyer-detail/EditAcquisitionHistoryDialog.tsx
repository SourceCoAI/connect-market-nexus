import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";

interface EditAcquisitionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    totalAcquisitions?: number | null;
    acquisitionFrequency?: string | null;
  };
  onSave: (data: {
    total_acquisitions?: number;
    acquisition_frequency?: string;
  }) => void;
  isSaving?: boolean;
}

export const EditAcquisitionHistoryDialog = ({
  open,
  onOpenChange,
  data,
  onSave,
  isSaving = false,
}: EditAcquisitionHistoryDialogProps) => {
  const [formData, setFormData] = useState({
    totalAcquisitions: data.totalAcquisitions?.toString() || "",
    acquisitionFrequency: data.acquisitionFrequency || "",
  });

  useEffect(() => {
    setFormData({
      totalAcquisitions: data.totalAcquisitions?.toString() || "",
      acquisitionFrequency: data.acquisitionFrequency || "",
    });
  }, [data]);

  const handleSave = () => {
    const num = parseInt(formData.totalAcquisitions);
    onSave({
      total_acquisitions: isNaN(num) ? undefined : num,
      acquisition_frequency: formData.acquisitionFrequency || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Acquisition History</DialogTitle>
          <DialogDescription>Update acquisition history information</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="totalAcquisitions">Total Platform Add-ons</Label>
            <NumericInput
              id="totalAcquisitions"
              placeholder="e.g., 5"
              value={formData.totalAcquisitions}
              onChange={(value) => setFormData({ ...formData, totalAcquisitions: value })}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="acquisitionFrequency">Acquisition Frequency</Label>
            <Input
              id="acquisitionFrequency"
              placeholder="e.g., 1-2 per year, As needed"
              value={formData.acquisitionFrequency}
              onChange={(e) => setFormData({ ...formData, acquisitionFrequency: e.target.value })}
            />
          </div>
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
