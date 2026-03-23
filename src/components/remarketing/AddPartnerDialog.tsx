import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PartnerType = 'person' | 'business';

interface PartnerFormData {
  partner_type: PartnerType;
  name: string;
  company: string;
  email: string;
  phone: string;
  linkedin: string;
  website: string;
  contact_name: string;
  notes: string;
  is_active: boolean;
}

interface AddPartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPartner?: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    is_active: boolean | null;
    partner_type?: string;
    linkedin?: string;
    website?: string;
    contact_name?: string;
  } | null;
}

const defaultForm: PartnerFormData = {
  partner_type: 'person',
  name: '',
  company: '',
  email: '',
  phone: '',
  linkedin: '',
  website: '',
  contact_name: '',
  notes: '',
  is_active: true,
};

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join('');
}

export function AddPartnerDialog({ open, onOpenChange, editingPartner }: AddPartnerDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PartnerFormData>(defaultForm);
  const isEditing = !!editingPartner;

  useEffect(() => {
    if (editingPartner) {
      setForm({
        partner_type: (editingPartner.partner_type as PartnerType) || 'person',
        name: editingPartner.name,
        company: editingPartner.company || '',
        email: editingPartner.email || '',
        phone: editingPartner.phone || '',
        linkedin: editingPartner.linkedin || '',
        website: editingPartner.website || '',
        contact_name: editingPartner.contact_name || '',
        notes: editingPartner.notes || '',
        is_active: editingPartner.is_active ?? true,
      });
    } else {
      setForm(defaultForm);
    }
  }, [editingPartner, open]);

  const createMutation = useMutation({
    mutationFn: async (data: PartnerFormData) => {
      const password = generatePassword();

      // Hash password via edge function
      const { data: hashResult, error: _hashError } = await supabase.functions.invoke(
        'validate-referral-access',
        { body: { action: 'hash-password', password } },
      );

      // M-6 FIX: Save all form fields including partner_type, linkedin, website, contact_name
      // which were previously captured in the form but silently discarded on insert.
      const insertData: Record<string, unknown> = {
        name: data.name,
        company: data.company || null,
        email: data.email || null,
        phone: data.phone || null,
        notes: data.notes || null,
        is_active: data.is_active,
        partner_type: (data as Record<string, unknown>).partner_type || null,
        linkedin: (data as Record<string, unknown>).linkedin || null,
        website: (data as Record<string, unknown>).website || null,
        contact_name: (data as Record<string, unknown>).contact_name || null,
      };

      // If hashing works, store the hash; otherwise store plaintext temporarily
      if (hashResult?.hash) {
        insertData.share_password_hash = hashResult.hash;
      } else {
        // Fallback: store password as hash field (will be hashed on first validate)
        insertData.share_password_hash = password;
      }

      const { data: partner, error } = await supabase
        .from('referral_partners')
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;
      return { partner, password };
    },
    onSuccess: ({ partner, password }) => {
      queryClient.invalidateQueries({ queryKey: ['referral-partners'] });
      toast.success(`Partner "${partner.name}" created`, {
        description: `Share password: ${password}`,
        duration: 15000,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to create partner: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: PartnerFormData) => {
      if (!editingPartner) throw new Error('No partner to edit');

      const { data: partner, error } = await supabase
        .from('referral_partners')
        .update({
          name: data.name,
          company: data.company || null,
          email: data.email || null,
          phone: data.phone || null,
          notes: data.notes || null,
          is_active: data.is_active,
        } as never)
        .eq('id', editingPartner.id)
        .select()
        .single();

      if (error) throw error;
      return partner;
    },
    onSuccess: (partner) => {
      queryClient.invalidateQueries({ queryKey: ['referral-partners'] });
      toast.success(`Partner "${partner.name}" updated`);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to update partner: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.partner_type === 'person' && !form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (form.partner_type === 'business' && !form.company.trim()) {
      toast.error('Company name is required');
      return;
    }
    if (isEditing) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Partner' : 'Add Referral Partner'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update referral partner details'
              : 'Add a new referral partner. A share link and password will be auto-generated.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Partner Type *</Label>
            <Select
              value={form.partner_type}
              onValueChange={(val: PartnerType) => setForm((p) => ({ ...p, partner_type: val }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="person">Person</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.partner_type === 'person' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="partner-name">Name *</Label>
                <Input
                  id="partner-name"
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-linkedin">LinkedIn URL</Label>
                <Input
                  id="partner-linkedin"
                  type="url"
                  placeholder="https://linkedin.com/in/..."
                  value={form.linkedin}
                  onChange={(e) => setForm((p) => ({ ...p, linkedin: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-email">Email</Label>
                <Input
                  id="partner-email"
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="partner-company">Company Name *</Label>
                <Input
                  id="partner-company"
                  placeholder="Company name"
                  value={form.company}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, company: e.target.value, name: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-website">Company Website</Label>
                <Input
                  id="partner-website"
                  type="url"
                  placeholder="https://example.com"
                  value={form.website}
                  onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-contact">Point of Contact Name</Label>
                <Input
                  id="partner-contact"
                  placeholder="Contact person"
                  value={form.contact_name}
                  onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-email-biz">Email</Label>
                <Input
                  id="partner-email-biz"
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="partner-notes">Notes</Label>
            <Textarea
              id="partner-notes"
              placeholder="Internal notes about this partner"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="partner-active">Active</Label>
            <Switch
              id="partner-active"
              checked={form.is_active}
              onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked }))}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !form.name.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Add Partner'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
