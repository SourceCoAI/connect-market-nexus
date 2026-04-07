import { useState } from 'react';
import { ClickToDialPhone } from '@/components/shared/ClickToDialPhone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Pencil, Loader2, User, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface PrimaryContactCardProps {
  name: string | null;
  email: string | null;
  phone: string | null;
  dealId?: string;
  onSave: (data: { name: string; email: string; phone: string }) => Promise<void>;
}

export const PrimaryContactCard = ({
  name,
  email,
  phone,
  dealId,
  onSave,
}: PrimaryContactCardProps) => {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editedName, setEditedName] = useState(name || '');
  const [editedEmail, setEditedEmail] = useState(email || '');
  const [editedPhone, setEditedPhone] = useState(phone || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        name: editedName,
        email: editedEmail,
        phone: editedPhone,
      });
      setIsEditOpen(false);
      toast.success('Contact updated');
    } catch (error) {
      toast.error('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = () => {
    setEditedName(name || '');
    setEditedEmail(email || '');
    setEditedPhone(phone || '');
    setIsEditOpen(true);
  };

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const hasContact = name || email || phone;

  return (
    <>
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Primary Contact
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {hasContact ? (
            <div className="flex items-start gap-4">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <p className="font-medium">{name || 'Unknown'}</p>
                {email && (
                  <a
                    href={`mailto:${email}`}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {email}
                  </a>
                )}
                {phone && (
                  <ClickToDialPhone
                    phone={phone}
                    name={name || undefined}
                    email={email || undefined}
                    entityType="listings"
                    entityId={dealId}
                    size="sm"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  />
                )}
              </div>
              <div className="flex gap-2">
                {email && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`mailto:${email}`}>
                      <Mail className="h-4 w-4 mr-1" />
                      Email
                    </a>
                  </Button>
                )}
                {phone && (
                  <ClickToDialPhone
                    phone={phone}
                    name={name || undefined}
                    email={email || undefined}
                    entityType="listings"
                    entityId={dealId}
                    label="Call"
                    size="md"
                    className="border rounded-md px-3 py-1.5 text-sm text-foreground hover:text-foreground hover:bg-accent"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No primary contact specified</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={openEdit}>
                <Pencil className="h-3 w-3 mr-1" />
                Add Contact
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Primary Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="contactName">Name</Label>
              <Input
                id="contactName"
                placeholder="John Smith"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder="john@company.com"
                value={editedEmail}
                onChange={(e) => setEditedEmail(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="contactPhone">Phone</Label>
              <Input
                id="contactPhone"
                type="tel"
                placeholder="(555) 123-4567"
                value={editedPhone}
                onChange={(e) => setEditedPhone(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PrimaryContactCard;
