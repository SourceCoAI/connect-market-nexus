import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PEFirmContactFormData {
  name: string;
  email: string;
  phone: string;
  role: string;
  linkedin_url: string;
  is_primary: boolean;
  mobile_phone_1: string;
  mobile_phone_2: string;
  mobile_phone_3: string;
  office_phone: string;
}

interface AddContactDialogProps {
  firmName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newContact: PEFirmContactFormData;
  setNewContact: (contact: PEFirmContactFormData) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export const AddContactDialog = ({
  firmName,
  open,
  onOpenChange,
  newContact,
  setNewContact,
  onSubmit,
  isPending,
}: AddContactDialogProps) => {
  const [showExtraPhones, setShowExtraPhones] = useState(
    !!(newContact.mobile_phone_2 || newContact.mobile_phone_3),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>
            Add a contact at {firmName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="contact_name">Name *</Label>
            <Input
              id="contact_name"
              value={newContact.name}
              onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_email">Email</Label>
            <Input
              id="contact_email"
              type="email"
              value={newContact.email}
              onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_mobile_1">Primary Mobile</Label>
            <Input
              id="contact_mobile_1"
              placeholder="(555) 123-4567"
              value={newContact.mobile_phone_1}
              onChange={(e) => setNewContact({ ...newContact, mobile_phone_1: e.target.value })}
            />
          </div>
          {showExtraPhones ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="contact_mobile_2">Mobile Phone 2</Label>
                <Input
                  id="contact_mobile_2"
                  value={newContact.mobile_phone_2}
                  onChange={(e) => setNewContact({ ...newContact, mobile_phone_2: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_mobile_3">Mobile Phone 3</Label>
                <Input
                  id="contact_mobile_3"
                  value={newContact.mobile_phone_3}
                  onChange={(e) => setNewContact({ ...newContact, mobile_phone_3: e.target.value })}
                />
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0 text-xs"
              onClick={() => setShowExtraPhones(true)}
            >
              + Add another mobile number
            </Button>
          )}
          <div className="space-y-2">
            <Label htmlFor="contact_office_phone">Office Phone</Label>
            <Input
              id="contact_office_phone"
              value={newContact.office_phone}
              onChange={(e) => setNewContact({ ...newContact, office_phone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_role">Role</Label>
            <Input
              id="contact_role"
              placeholder="e.g., Managing Partner, VP Business Development"
              value={newContact.role}
              onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_linkedin">LinkedIn URL</Label>
            <Input
              id="contact_linkedin"
              placeholder="https://linkedin.com/in/..."
              value={newContact.linkedin_url}
              onChange={(e) =>
                setNewContact({ ...newContact, linkedin_url: e.target.value })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!newContact.name || isPending}
          >
            Add Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
