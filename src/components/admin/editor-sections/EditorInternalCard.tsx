import { useState } from "react";
import { FormField, FormItem, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UseFormReturn } from "react-hook-form";
import { useSourceCoAdmins } from "@/hooks/admin/use-source-co-admins";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { EDITOR_DESIGN } from "@/lib/editor-design-system";
import { cn } from "@/lib/utils";
import { STATUS_TAGS } from "@/constants/statusTags";
import { ChevronDown } from "lucide-react";
import { EnhancedMultiCategorySelect } from "@/components/ui/enhanced-category-select";
import { EnhancedMultiLocationSelect } from "@/components/ui/enhanced-location-select";

interface EditorInternalCardProps {
  form: UseFormReturn<any>;
  dealIdentifier?: string;
}

const BUYER_TYPES = [
  { value: 'privateEquity', label: 'PE' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'familyOffice', label: 'Family Office' },
  { value: 'searchFund', label: 'Search Fund' },
  { value: 'individual', label: 'Individual' },
  { value: 'independentSponsor', label: 'Ind. Sponsor' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'businessOwner', label: 'Bus. Owner' },
] as const;

export function EditorInternalCard({ form, dealIdentifier }: EditorInternalCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { data: sourceCoAdmins, isLoading: loadingAdmins } = useSourceCoAdmins();
  const visibleToBuyerTypes = form.watch('visible_to_buyer_types') || [];
  const acquisitionType = form.watch('acquisition_type');

  const handleBuyerTypeToggle = (value: string) => {
    const current = visibleToBuyerTypes || [];
    const updated = current.includes(value)
      ? current.filter((type: string) => type !== value)
      : [...current, value];
    form.setValue('visible_to_buyer_types', updated);
  };

  return (
    <div className={cn(EDITOR_DESIGN.cardBg, EDITOR_DESIGN.cardBorder, "rounded-lg", EDITOR_DESIGN.cardPadding)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between mb-4"
      >
        <span className={EDITOR_DESIGN.microHeader}>Company Overview</span>
        <ChevronDown className={cn("h-4 w-4 text-foreground/60 transition-transform", !isOpen && "-rotate-90")} />
      </button>

      {isOpen && (
        <div className="space-y-3">
          {/* Deal ID */}
          <div className="flex items-baseline justify-between">
            <span className={EDITOR_DESIGN.microLabel}>Deal</span>
            <code className="text-xs font-mono text-foreground">
              {dealIdentifier || "Auto-generated"}
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
                      className={cn(EDITOR_DESIGN.miniHeight, "text-sm", EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Owner */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Owner</div>
            <FormField
              control={form.control}
              name="primary_owner_id"
              render={({ field }) => (
                <FormItem>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger className={cn(EDITOR_DESIGN.miniHeight, "text-sm", EDITOR_DESIGN.inputBg)}>
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {loadingAdmins ? (
                        <SelectItem value="_loading" disabled>Loading...</SelectItem>
                      ) : sourceCoAdmins && sourceCoAdmins.length > 0 ? (
                        sourceCoAdmins.map((admin) => (
                          <SelectItem key={admin.id} value={admin.id}>
                            {admin.displayName}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="_none" disabled>No admins found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>

          {/* Company URL - right below Owner */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <Input
              placeholder="Company URL"
              {...form.register('internal_deal_memo_link')}
              className={cn(EDITOR_DESIGN.miniHeight, "text-xs font-mono", EDITOR_DESIGN.inputBg)}
            />
          </div>

          {/* CRM Links */}
          <div className={cn("pt-3", EDITOR_DESIGN.subtleDivider, "space-y-2")}>
            <Input
              placeholder="Salesforce URL"
              {...form.register('internal_salesforce_link')}
              className={cn(EDITOR_DESIGN.miniHeight, "text-xs font-mono", EDITOR_DESIGN.inputBg)}
            />
          </div>

          {/* Title */}
          <div className={cn("pt-3", EDITOR_DESIGN.subtleDivider, EDITOR_DESIGN.microFieldSpacing)}>
            <div className={EDITOR_DESIGN.microLabel}>Title</div>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="Business Title"
                      {...field}
                      value={field.value || ''}
                      className={cn(EDITOR_DESIGN.miniHeight, "text-sm font-medium", EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
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

          {/* Geography */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Geography</div>
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <EnhancedMultiLocationSelect
                      value={Array.isArray(field.value) ? field.value : (field.value ? [field.value] : [])}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Platform / Add-on */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Type</div>
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => form.setValue('acquisition_type', 'platform')}
                className={cn(
                  "px-3 py-1.5 rounded text-sm font-medium transition-all",
                  acquisitionType === 'platform'
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Platform
              </button>
              <button
                type="button"
                onClick={() => form.setValue('acquisition_type', 'add_on')}
                className={cn(
                  "px-3 py-1.5 rounded text-sm font-medium transition-all",
                  acquisitionType === 'add_on'
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Add-on
              </button>
            </div>
          </div>

          {/* Team Size */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Team Size</div>
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="full_time_employees"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Full-time"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                        className={cn(EDITOR_DESIGN.miniHeight, "text-sm", EDITOR_DESIGN.inputBg)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="part_time_employees"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Part-time"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
                        className={cn(EDITOR_DESIGN.miniHeight, "text-sm", EDITOR_DESIGN.inputBg)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Structured Contact Fields */}
          <div className={cn("pt-3", EDITOR_DESIGN.subtleDivider, EDITOR_DESIGN.microFieldSpacing)}>
            <div className={EDITOR_DESIGN.microLabel}>Deal Contact</div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="First name"
                {...form.register('main_contact_first_name')}
                className={cn(EDITOR_DESIGN.miniHeight, "text-sm", EDITOR_DESIGN.inputBg)}
              />
              <Input
                placeholder="Last name"
                {...form.register('main_contact_last_name')}
                className={cn(EDITOR_DESIGN.miniHeight, "text-sm", EDITOR_DESIGN.inputBg)}
              />
            </div>
            <Input
              placeholder="Email"
              type="email"
              {...form.register('main_contact_email')}
              className={cn(EDITOR_DESIGN.miniHeight, "text-sm", EDITOR_DESIGN.inputBg)}
            />
            <Input
              placeholder="Phone"
              type="tel"
              {...form.register('main_contact_phone')}
              className={cn(EDITOR_DESIGN.miniHeight, "text-sm", EDITOR_DESIGN.inputBg)}
            />
            <Input
              placeholder="LinkedIn URL"
              {...form.register('main_contact_linkedin')}
              className={cn(EDITOR_DESIGN.miniHeight, "text-xs font-mono", EDITOR_DESIGN.inputBg)}
            />
          </div>

          {/* Status */}
          <div className={cn("pt-3", EDITOR_DESIGN.subtleDivider, EDITOR_DESIGN.microFieldSpacing)}>
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
                  <Select onValueChange={field.onChange} value={field.value || 'none'} defaultValue="none">
                    <FormControl>
                      <SelectTrigger className={cn(EDITOR_DESIGN.miniHeight, "text-sm", EDITOR_DESIGN.inputBg)}>
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
          <div className={cn("pt-3", EDITOR_DESIGN.subtleDivider)}>
            <div className={cn(EDITOR_DESIGN.microLabel, "mb-1")}>Visible To</div>
            <p className="text-[11px] text-muted-foreground mb-2">Visible to all by default. Select specific buyer types to restrict visibility.</p>
            <div className="flex flex-wrap gap-1.5">
              {BUYER_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer transition-colors",
                    visibleToBuyerTypes.includes(type.value)
                      ? "border-primary/50 bg-primary/10 text-primary font-medium"
                      : "border-border bg-white text-foreground/70 hover:border-primary/30"
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
