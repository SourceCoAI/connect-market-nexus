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

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newContact: {
    name: string;
    email: string;
    phone: string;
    role: string;
    linkedin_url: string;
    is_primary: boolean;
  };
  onContactChange: (contact: {
    name: string;
    email: string;
    phone: string;
    role: string;
    linkedin_url: string;
    is_primary: boolean;
  }) => void;
  onSubmit: () => void;
  isPending: boolean;
  editMode?: boolean;
}

export const AddContactDialog = ({
  open,
  onOpenChange,
  newContact,
  onContactChange,
  onSubmit,
  isPending,
  editMode = false,
}: AddContactDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editMode ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          <DialogDescription>
            {editMode ? 'Update contact details' : 'Add a new contact for this buyer'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="contact_name">Name *</Label>
            <Input
              id="contact_name"
              value={newContact.name}
              onChange={(e) => onContactChange({ ...newContact, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_email">Email</Label>
            <Input
              id="contact_email"
              type="email"
              value={newContact.email}
              onChange={(e) => onContactChange({ ...newContact, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_phone">Phone</Label>
            <Input
              id="contact_phone"
              value={newContact.phone}
              onChange={(e) => onContactChange({ ...newContact, phone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_role">Role</Label>
            <Input
              id="contact_role"
              placeholder="e.g., Managing Partner"
              value={newContact.role}
              onChange={(e) => onContactChange({ ...newContact, role: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_linkedin">LinkedIn URL</Label>
            <Input
              id="contact_linkedin"
              placeholder="https://linkedin.com/in/..."
              value={newContact.linkedin_url}
              onChange={(e) => onContactChange({ ...newContact, linkedin_url: e.target.value })}
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
            {editMode ? 'Save Changes' : 'Add Contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
