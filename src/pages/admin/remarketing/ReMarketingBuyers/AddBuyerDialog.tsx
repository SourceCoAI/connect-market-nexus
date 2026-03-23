import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { BuyerType } from "@/types/remarketing";
import { BUYER_TYPES } from "./constants";

interface AddBuyerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  newBuyer: {
    company_name: string;
    company_website: string;
    buyer_type: BuyerType | "";
    universe_id: string;
    thesis_summary: string;
    notes: string;
  };
  setNewBuyer: (buyer: AddBuyerDialogProps["newBuyer"]) => void;
  universes: { id: string; name: string }[] | undefined;
  createMutation: {
    mutate: () => void;
    isPending: boolean;
  };
}

const AddBuyerDialog = ({
  isOpen,
  onOpenChange,
  newBuyer,
  setNewBuyer,
  universes,
  createMutation,
}: AddBuyerDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Buyer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Buyer</DialogTitle>
          <DialogDescription>
            Add a new buyer to your database. You can enrich their data later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name *</Label>
            <Input
              id="company_name"
              placeholder="e.g., Apex Capital Partners"
              value={newBuyer.company_name}
              onChange={(e) => setNewBuyer({ ...newBuyer, company_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company_website">Company Website *</Label>
            <Input
              id="company_website"
              placeholder="https://example.com"
              value={newBuyer.company_website}
              onChange={(e) => setNewBuyer({ ...newBuyer, company_website: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="buyer_type">Buyer Type</Label>
              <Select
                value={newBuyer.buyer_type}
                onValueChange={(value) => setNewBuyer({ ...newBuyer, buyer_type: value as BuyerType })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {BUYER_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="universe_id">Buyer Universe</Label>
              <Select
                value={newBuyer.universe_id}
                onValueChange={(value) => setNewBuyer({ ...newBuyer, universe_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select universe" />
                </SelectTrigger>
                <SelectContent>
                  {universes?.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="thesis_summary">Investment Thesis</Label>
            <Textarea
              id="thesis_summary"
              placeholder="Brief description of their investment focus..."
              value={newBuyer.thesis_summary}
              onChange={(e) => setNewBuyer({ ...newBuyer, thesis_summary: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes..."
              value={newBuyer.notes}
              onChange={(e) => setNewBuyer({ ...newBuyer, notes: e.target.value })}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!newBuyer.company_name.trim() || !newBuyer.company_website.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Adding..." : "Add Buyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddBuyerDialog;
