import { useState, useEffect } from 'react';
import { FormField, FormItem, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UseFormReturn } from 'react-hook-form';
import { useSourceCoAdmins } from '@/hooks/admin/use-source-co-admins';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { STATUS_TAGS } from '@/constants/statusTags';
import { ChevronDown, Lock } from 'lucide-react';

interface EditorInternalCardProps {
  form: UseFormReturn<any>;
  dealIdentifier?: string;
}

const BUYER_TYPES = [
  { value: 'private_equity', label: 'PE' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'search_fund', label: 'Search Fund' },
  { value: 'individual_buyer', label: 'Individual' },
  { value: 'independent_sponsor', label: 'Ind. Sponsor' },
] as const;

export function EditorInternalCard({ form, dealIdentifier }: EditorInternalCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: sourceCoAdmins, isLoading: loadingAdmins } = useSourceCoAdmins();
  const { user } = useAuth();
  const visibleToBuyerTypes = form.watch('visible_to_buyer_types') || [];
  

  // Auto-assign Deal Owner to current admin user if not already set
  useEffect(() => {
    if (!user?.id || !sourceCoAdmins || sourceCoAdmins.length === 0) return;
    const currentOwnerId = form.getValues('primary_owner_id');
    if (currentOwnerId) return;

    const currentAdmin = sourceCoAdmins.find((a) => a.id === user.id);
    if (currentAdmin) {
      form.setValue('primary_owner_id', currentAdmin.id);
    }
  }, [user, sourceCoAdmins, form]);

  const handleBuyerTypeToggle = (value: string) => {
    const current = visibleToBuyerTypes || [];
    const updated = current.includes(value)
      ? current.filter((type: string) => type !== value)
      : [...current, value];
    form.setValue('visible_to_buyer_types', updated);
  };

  return (
    <div
      className={cn(
        EDITOR_DESIGN.cardBg,
        EDITOR_DESIGN.cardBorder,
        'rounded-lg',
        EDITOR_DESIGN.cardPadding,
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Lock className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Internal (Admin Only)
          </span>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-foreground/60 transition-transform', !isOpen && '-rotate-90')}
        />
      </button>

      {isOpen && (
        <div className="space-y-3 mt-4">
          {/* Deal ID */}
          <div className="flex items-baseline justify-between">
            <span className={EDITOR_DESIGN.microLabel}>Deal</span>
            <code className="text-xs font-mono text-foreground">
              {dealIdentifier || 'Auto-generated'}
            </code>
          </div>

          {/* Company */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Company</div>
            <FormField
              control={form.control}
              name="internal_company_name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="Confidential name"
                      {...field}
                      value={field.value || ''}
                      className={cn(EDITOR_DESIGN.miniHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Deal Owner */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className="flex items-center gap-1.5">
              <div className={EDITOR_DESIGN.microLabel}>Deal Owner</div>
              <span className="text-[10px] text-muted-foreground/60 font-normal">
                (auto-assigned)
              </span>
            </div>
            <FormField
              control={form.control}
              name="primary_owner_id"
              render={({ field }) => (
                <FormItem>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger
                        className={cn(EDITOR_DESIGN.miniHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
                      >
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {loadingAdmins ? (
                        <SelectItem value="_loading" disabled>
                          Loading...
                        </SelectItem>
                      ) : sourceCoAdmins && sourceCoAdmins.length > 0 ? (
                        sourceCoAdmins.map((admin) => (
                          <SelectItem key={admin.id} value={admin.id}>
                            {admin.displayName}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="_none" disabled>
                          No admins found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>

          {/* Company URL */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <Input
              placeholder="Company URL"
              {...form.register('internal_deal_memo_link')}
              className={cn(EDITOR_DESIGN.miniHeight, 'text-xs font-mono', EDITOR_DESIGN.inputBg)}
            />
          </div>

          {/* CRM Links */}
          <div className={cn('pt-3', EDITOR_DESIGN.subtleDivider, 'space-y-2')}>
            <Input
              placeholder="Salesforce URL"
              {...form.register('internal_salesforce_link')}
              className={cn(EDITOR_DESIGN.miniHeight, 'text-xs font-mono', EDITOR_DESIGN.inputBg)}
            />
          </div>

          {/* Status */}
          <div className={cn('pt-3', EDITOR_DESIGN.subtleDivider, EDITOR_DESIGN.microFieldSpacing)}>
            <div className={EDITOR_DESIGN.microLabel}>Status</div>
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="active" className="h-4 w-4" />
                        <Label className="text-sm font-normal cursor-pointer">Active</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="inactive" className="h-4 w-4" />
                        <Label className="text-sm font-normal cursor-pointer">Inactive</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Status Tag */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Tag</div>
            <FormField
              control={form.control}
              name="status_tag"
              render={({ field }) => (
                <FormItem>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || 'none'}
                    defaultValue="none"
                  >
                    <FormControl>
                      <SelectTrigger
                        className={cn(EDITOR_DESIGN.miniHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No tag</SelectItem>
                      {STATUS_TAGS.map((tag) => (
                        <SelectItem key={tag.value} value={tag.value}>
                          {tag.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>

          {/* Visible To */}
          <div className={cn('pt-3', EDITOR_DESIGN.subtleDivider)}>
            <div className={cn(EDITOR_DESIGN.microLabel, 'mb-1')}>Visible To</div>
            <p className="text-[11px] text-muted-foreground mb-2">
              Visible to all by default. Select specific buyer types to restrict visibility.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {BUYER_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer transition-colors',
                    visibleToBuyerTypes.includes(type.value)
                      ? 'border-primary/50 bg-primary/10 text-primary font-medium'
                      : 'border-border bg-white text-foreground/70 hover:border-primary/30',
                  )}
                >
                  <Checkbox
                    checked={visibleToBuyerTypes.includes(type.value)}
                    onCheckedChange={() => handleBuyerTypeToggle(type.value)}
                    className="h-3 w-3"
                  />
                  {type.label}
                </label>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div className={cn('pt-3', EDITOR_DESIGN.subtleDivider)}>
            <div className={cn(EDITOR_DESIGN.microLabel, 'mb-2')}>Main Contact</div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="First name"
                {...form.register('main_contact_first_name')}
                className={cn(EDITOR_DESIGN.miniHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
              />
              <Input
                placeholder="Last name"
                {...form.register('main_contact_last_name')}
                className={cn(EDITOR_DESIGN.miniHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Input
                placeholder="Email"
                {...form.register('main_contact_email')}
                className={cn(EDITOR_DESIGN.miniHeight, 'text-xs', EDITOR_DESIGN.inputBg)}
              />
              <Input
                placeholder="Phone"
                {...form.register('main_contact_phone')}
                className={cn(EDITOR_DESIGN.miniHeight, 'text-xs', EDITOR_DESIGN.inputBg)}
              />
            </div>
            <Input
              placeholder="LinkedIn URL"
              {...form.register('main_contact_linkedin')}
              className={cn(EDITOR_DESIGN.miniHeight, 'text-xs font-mono mt-2', EDITOR_DESIGN.inputBg)}
            />
          </div>

          {/* Internal Notes */}
          <div className={cn('pt-3', EDITOR_DESIGN.subtleDivider, EDITOR_DESIGN.microFieldSpacing)}>
            <div className={EDITOR_DESIGN.microLabel}>Internal Notes</div>
            <FormField
              control={form.control}
              name="owner_notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <textarea
                      placeholder="Admin-only notes about this deal"
                      {...field}
                      value={field.value || ''}
                      rows={3}
                      className={cn(
                        'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                        EDITOR_DESIGN.inputBg,
                      )}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
