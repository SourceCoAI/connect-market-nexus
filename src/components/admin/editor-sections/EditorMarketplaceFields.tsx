import { useState } from 'react';
import { FormField, FormItem, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { UseFormReturn } from 'react-hook-form';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { Sparkles, Loader2, Eye } from 'lucide-react';
import { EnhancedMultiCategorySelect } from '@/components/ui/enhanced-category-select';
import { EnhancedMultiLocationSelect } from '@/components/ui/enhanced-location-select';
import { stateToRegion } from '@/lib/deal-to-listing-anonymizer';

interface EditorMarketplaceFieldsProps {
  form: UseFormReturn<any>;
}

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

  const typeLabel = acquisitionType === 'platform' ? 'Platform' : 'Add-on';
  const marginDescriptor = margin >= 25 ? 'High-Margin' : margin >= 15 ? 'Profitable' : '';
  const revenueDescriptor =
    revenue >= 10_000_000 ? 'Scaled' : revenue >= 5_000_000 ? 'Growth-Stage' : '';

  const descriptors = [marginDescriptor, revenueDescriptor].filter(Boolean);
  const prefix = descriptors.length > 0 ? descriptors[0] + ' ' : '';

  if (region) {
    return `${prefix}${industry} ${typeLabel} | ${region}`.trim();
  }
  return `${prefix}${industry} ${typeLabel} Opportunity`.trim();
}

export function EditorMarketplaceFields({ form }: EditorMarketplaceFieldsProps) {
  const acquisitionType = form.watch('acquisition_type');
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);

  const handleGenerateTitle = () => {
    setIsGeneratingTitle(true);
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
      <div className="flex items-center gap-1.5 mb-4">
        <Eye className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Marketplace Listing (Visible to Buyers)
        </span>
      </div>

      <div className="space-y-3">
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
                    placeholder="e.g. Profitable HVAC Platform | South Central"
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

        {/* Geography, Industry, Type in a row */}
        <div className="grid grid-cols-3 gap-3">
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
      </div>
    </div>
  );
}
