import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { NewDealForm } from "./types";

interface AddDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newDeal: NewDealForm;
  setNewDeal: (updater: (prev: NewDealForm) => NewDealForm) => void;
  isAddingDeal: boolean;
  handleAddDeal: () => void;
}

export function AddDealDialog({
  open, onOpenChange, newDeal, setNewDeal, isAddingDeal, handleAddDeal,
}: AddDealDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add SourceCo Deal</DialogTitle>
          <DialogDescription>
            Add a single deal manually. It will be queued for enrichment if a website is provided.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label>Company Name *</Label>
            <Input
              value={newDeal.company_name}
              onChange={(e) => setNewDeal(d => ({ ...d, company_name: e.target.value }))}
              placeholder="Acme Services Inc."
            />
          </div>
          <div className="space-y-2">
            <Label>Website *</Label>
            <Input
              value={newDeal.website}
              onChange={(e) => setNewDeal(d => ({ ...d, website: e.target.value }))}
              placeholder="www.example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input
                value={newDeal.contact_name}
                onChange={(e) => setNewDeal(d => ({ ...d, contact_name: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Title</Label>
              <Input
                value={newDeal.contact_title}
                onChange={(e) => setNewDeal(d => ({ ...d, contact_title: e.target.value }))}
                placeholder="CEO"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input
                type="email"
                value={newDeal.contact_email}
                onChange={(e) => setNewDeal(d => ({ ...d, contact_email: e.target.value }))}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input
                value={newDeal.contact_phone}
                onChange={(e) => setNewDeal(d => ({ ...d, contact_phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input
                value={newDeal.industry}
                onChange={(e) => setNewDeal(d => ({ ...d, industry: e.target.value }))}
                placeholder="HVAC, Plumbing, etc."
              />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={newDeal.location}
                onChange={(e) => setNewDeal(d => ({ ...d, location: e.target.value }))}
                placeholder="Dallas, TX"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Revenue ($)</Label>
              <NumericInput
                value={newDeal.revenue}
                onChange={(value) => setNewDeal(d => ({ ...d, revenue: value }))}
                placeholder="5,000,000"
              />
            </div>
            <div className="space-y-2">
              <Label>EBITDA ($)</Label>
              <NumericInput
                value={newDeal.ebitda}
                onChange={(value) => setNewDeal(d => ({ ...d, ebitda: value }))}
                placeholder="1,000,000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={newDeal.description}
              onChange={(e) => setNewDeal(d => ({ ...d, description: e.target.value }))}
              placeholder="Brief description of the company..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAddDeal} disabled={isAddingDeal || !newDeal.company_name.trim() || !newDeal.website.trim()}>
            {isAddingDeal && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Add Deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
