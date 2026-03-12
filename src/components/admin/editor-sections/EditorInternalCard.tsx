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
import { useAuthState } from '@/hooks/auth/use-auth-state';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { STATUS_TAGS } from '@/constants/statusTags';
import { ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { EnhancedMultiCategorySelect } from '@/components/ui/enhanced-category-select';
import { EnhancedMultiLocationSelect } from '@/components/ui/enhanced-location-select';
import { stateToRegion } from '@/lib/deal-to-listing-anonymizer';

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

/**
 * Build an AI-generated listing title from the form's current field values.
 * Uses industry, geography, acquisition type, and financials to create a
 * compelling, anonymized title that avoids generic patterns like
 * "$5M Automotive Repair Platform".
 */
function generateSmartTitle(form: UseFormReturn<any>): string {
  const categories: string[] = form.getValues('categories') || [];
  const location: string | string[] = form.getValues('location') || '';
  const acquisitionType: string = form.getValues('acquisition_type') || '';
  const revenue: number = parseFloat(form.getValues('revenue') || '0') || 0;
  const ebitda: number = parseFloat(form.getValues('ebitda') || '0') || 0;

  const industry = categories[0] || 'Services';
  const rawState = Array.isArray(location) ? location[0] || '' : location;
  const region = stateToRegion(rawState);
  const margin = revenue > 0 && ebitda > 0 ? Math.round((ebitda / revenue) * 100) : 0;

  // Build a descriptive, buyer-appealing title
  // Avoid leading with dollar amounts — lead with the business narrative
  const typeLabel = acquisitionType === 'platform' ? 'Platform' : 'Add-on';
  const marginDescriptor = margin >= 25 ? 'High-Margin' : margin >= 15 ? 'Profitable' : '';
  const revenueDescriptor =
    revenue >= 10_000_000 ? 'Scaled' : revenue >= 5_000_000 ? 'Growth-Stage' : '';

  // Pattern: [Margin/Scale Descriptor] [Industry] [Type] — [Region]
  const descriptors = [marginDescriptor, revenueDescriptor].filter(Boolean);
  const prefix = descriptors.length > 0 ? descriptors[0] + ' ' : '';

  if (region) {
    return `${prefix}${industry} ${typeLabel} — ${region}`.trim();
  }
  return `${prefix}${industry} ${typeLabel} Opportunity`.trim();
}

export function EditorInternalCard({ form, dealIdentifier }: EditorInternalCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { data: sourceCoAdmins, isLoading: loadingAdmins } = useSourceCoAdmins();
  const { user } = useAuthState();
  const visibleToBuyerTypes = form.watch('visible_to_buyer_types') || [];
  const acquisitionType = form.watch('acquisition_type');
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);

  // Auto-assign Deal Owner to current admin user if not already set
  useEffect(() => {
    if (!user?.id || !sourceCoAdmins || sourceCoAdmins.length === 0) return;
    const currentOwnerId = form.getValues('primary_owner_id');
    if (currentOwnerId) return; // Already assigned

    // Check if current user is in the admins list
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

  const handleGenerateTitle = () => {
    setIsGeneratingTitle(true);
    // Small delay so the user sees the loading state
    setTimeout(() => {
      const title = generateSmartTitle(form);
      form.setValue('title', title);
      setIsGeneratingTitle(false);
    }, 400);
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
        className="w-full flex items-center justify-between mb-4"
      >
        <span className={EDITOR_DESIGN.microHeader}>Company Overview</span>
        <ChevronDown
          className={cn('h-4 w-4 text-foreground/60 transition-transform', !isOpen && '-rotate-90')}
        />
      </button>

      {isOpen && (
        <div className="space-y-3">
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

          {/* Deal Owner (auto-assigned) */}
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

          {/* ── Marketplace Listing Section ── */}
          <div className={cn('pt-4', EDITOR_DESIGN.subtleDivider)}>
            <div className={cn(EDITOR_DESIGN.microLabel, 'mb-2 text-primary/80')}>
              Marketplace Listing
            </div>
          </div>

          {/* Title with AI Generate */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className="flex items-center justify-between">
              <div className={EDITOR_DESIGN.microLabel}>Title</div>
              <button
                type="button"
                onClick={handleGenerateTitle}
                disabled={isGeneratingTitle}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
              >
                {isGeneratingTitle ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {isGeneratingTitle ? 'Generating...' : 'AI Generate'}
              </button>
            </div>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="e.g. Profitable HVAC Platform — South Central"
                      {...field}
                      value={field.value || ''}
                      className={cn(
                        EDITOR_DESIGN.miniHeight,
                        'text-sm font-medium',
                        EDITOR_DESIGN.inputBg,
                      )}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Geography & Type (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div className={EDITOR_DESIGN.microFieldSpacing}>
              <div className={EDITOR_DESIGN.microLabel}>Geography</div>
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <EnhancedMultiLocationSelect
                        value={
                          Array.isArray(field.value)
                            ? field.value
                            : field.value
                              ? [field.value]
                              : []
                        }
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className={EDITOR_DESIGN.microFieldSpacing}>
              <div className={EDITOR_DESIGN.microLabel}>Type</div>
              <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => form.setValue('acquisition_type', 'platform')}
                  className={cn(
                    'px-3 py-1.5 rounded text-sm font-medium transition-all',
                    acquisitionType === 'platform'
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Platform
                </button>
                <button
                  type="button"
                  onClick={() => form.setValue('acquisition_type', 'add_on')}
                  className={cn(
                    'px-3 py-1.5 rounded text-sm font-medium transition-all',
                    acquisitionType === 'add_on'
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Add-on
                </button>
              </div>
            </div>
          </div>

          {/* Industry */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Industry</div>
            <FormField
              control={form.control}
              name="categories"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <EnhancedMultiCategorySelect
                      value={field.value || []}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
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
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
