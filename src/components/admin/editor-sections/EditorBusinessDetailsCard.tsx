import { useState } from 'react';
import { FormField, FormItem, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UseFormReturn } from 'react-hook-form';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { ChevronDown, Eye } from 'lucide-react';

interface EditorBusinessDetailsCardProps {
  form: UseFormReturn<any>;
}

/**
 * Buyer-facing business details that appear on the marketplace listing.
 * These fields are included in MARKETPLACE_SAFE_COLUMNS and visible
 * to approved buyers after connection.
 */
export function EditorBusinessDetailsCard({ form }: EditorBusinessDetailsCardProps) {
  const [isOpen, setIsOpen] = useState(true);

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
        <div className="flex items-center gap-2">
          <span className={EDITOR_DESIGN.microHeader}>Business Details</span>
          <span className="text-[10px] text-muted-foreground/60 font-normal normal-case tracking-normal">
            Visible to buyers
          </span>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-foreground/60 transition-transform', !isOpen && '-rotate-90')}
        />
      </button>

      {isOpen && (
        <div className="space-y-3">
          {/* Services */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Services</div>
            <FormField
              control={form.control}
              name="services"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. HVAC, Plumbing, Electrical (comma-separated)"
                      rows={3}
                      value={Array.isArray(field.value) ? field.value.join(', ') : field.value || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.includes(',')) {
                          field.onChange(val.split(',').map((s: string) => s.trim()).filter(Boolean));
                        } else {
                          field.onChange(val ? [val] : []);
                        }
                      }}
                      className={cn('text-sm min-h-[60px]', EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Geographic States */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>States Served</div>
            <FormField
              control={form.control}
              name="geographic_states"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="e.g. TX, OK, LA (comma-separated)"
                      value={Array.isArray(field.value) ? field.value.join(', ') : field.value || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.includes(',')) {
                          field.onChange(val.split(',').map((s: string) => s.trim()).filter(Boolean));
                        } else {
                          field.onChange(val ? [val] : []);
                        }
                      }}
                      className={cn(EDITOR_DESIGN.miniHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Number of Locations */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Number of Locations</div>
            <FormField
              control={form.control}
              name="number_of_locations"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g. 3"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                      className={cn(EDITOR_DESIGN.miniHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className={cn('pt-2', EDITOR_DESIGN.subtleDivider)} />

          {/* Customer Types */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Customer Types</div>
            <FormField
              control={form.control}
              name="customer_types"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Residential, Commercial, Government"
                      rows={2}
                      {...field}
                      value={field.value || ''}
                      className={cn('text-sm min-h-[48px]', EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Revenue Model */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Revenue Model</div>
            <FormField
              control={form.control}
              name="revenue_model"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="e.g. Recurring contracts, Project-based"
                      {...field}
                      value={field.value || ''}
                      className={cn(EDITOR_DESIGN.miniHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Business Model */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Business Model</div>
            <FormField
              control={form.control}
              name="business_model"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Owner-operated, Management in place"
                      rows={2}
                      {...field}
                      value={field.value || ''}
                      className={cn('text-sm min-h-[48px]', EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Growth Trajectory */}
          <div className={EDITOR_DESIGN.microFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Growth Trajectory</div>
            <FormField
              control={form.control}
              name="growth_trajectory"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="e.g. Stable, Growing 10-15% YoY"
                      {...field}
                      value={field.value || ''}
                      className={cn(EDITOR_DESIGN.miniHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Guidance + visibility note */}
          <div className="pt-3 border-t border-border/40 space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              Keep entries concise. Long descriptions belong in the listing body above.
            </p>
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Eye className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                These fields are visible to all marketplace users browsing this listing.
                Financials are only visible after connection approval.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
