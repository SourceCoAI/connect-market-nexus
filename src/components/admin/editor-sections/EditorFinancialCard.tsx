import { useState } from 'react';
import { FormField, FormItem, FormControl } from '@/components/ui/form';
import { UseFormReturn } from 'react-hook-form';
import { EnhancedCurrencyInput } from '@/components/ui/enhanced-currency-input';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NumericInput } from '@/components/ui/numeric-input';

interface EditorFinancialCardProps {
  form: UseFormReturn<any>;
  isReadOnly?: boolean;
  sourceDealId?: string | null;
}

export function EditorFinancialCard({ form, isReadOnly = false, sourceDealId }: EditorFinancialCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const revenue = form.watch('revenue') || 0;
  const ebitda = form.watch('ebitda') || 0;
  const calculatedMargin = revenue > 0 ? ((ebitda / revenue) * 100).toFixed(1) : '0.0';

  const metric3Type = form.watch('metric_3_type') || 'employees';
  const metric4Type = form.watch('metric_4_type') || 'ebitda_margin';

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
        <span className={EDITOR_DESIGN.microHeader}>Financial & Metrics</span>
        <ChevronDown className={cn("h-4 w-4 text-foreground/60 transition-transform", !isOpen && "-rotate-90")} />
      </button>

      {isOpen && (
        <div className="space-y-5">
          {isReadOnly && (
            <div className="flex items-center justify-between gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
              <div className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Financials inherited from source deal
              </div>
              {sourceDealId && (
                <Link
                  to={`/admin/deals/${sourceDealId}`}
                  className="inline-flex items-center gap-1 font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
                >
                  Edit in Deal
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          )}

          {/* Revenue */}
          <div className={EDITOR_DESIGN.compactFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>Revenue</div>
            <FormField
              control={form.control}
              name="revenue"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <EnhancedCurrencyInput
                      value={field.value?.toString() || ''}
                      onChange={(value) => {
                        if (isReadOnly) return;
                        const digits = value.replace(/\D/g, '');
                        field.onChange(digits || '');
                      }}
                      currencyMode="auto"
                      fieldType="revenue"
                      showSuffix={true}
                      disabled={isReadOnly}
                      className={cn(
                        EDITOR_DESIGN.compactHeight,
                        'text-sm font-medium',
                        EDITOR_DESIGN.inputBg,
                        isReadOnly && 'opacity-60 cursor-not-allowed',
                      )}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <input
              placeholder="Subtitle (e.g. category name)"
              {...form.register('revenue_metric_subtitle')}
              className={cn(
                EDITOR_DESIGN.microHeight,
                "w-full text-xs bg-transparent border-0 border-b border-dashed border-border/70 px-0 placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
              )}
            />
          </div>

          {/* EBITDA */}
          <div className={EDITOR_DESIGN.compactFieldSpacing}>
            <div className={EDITOR_DESIGN.microLabel}>EBITDA</div>
            <FormField
              control={form.control}
              name="ebitda"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <EnhancedCurrencyInput
                      value={field.value?.toString() || ''}
                      onChange={(value) => {
                        if (isReadOnly) return;
                        const digits = value.replace(/\D/g, '');
                        field.onChange(digits || '');
                      }}
                      currencyMode="auto"
                      fieldType="revenue"
                      showSuffix={true}
                      disabled={isReadOnly}
                      className={cn(
                        EDITOR_DESIGN.compactHeight,
                        'text-sm font-medium',
                        EDITOR_DESIGN.inputBg,
                        isReadOnly && 'opacity-60 cursor-not-allowed',
                      )}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex items-center gap-2">
              <input
                placeholder="Subtitle (e.g. margin info)"
                {...form.register('ebitda_metric_subtitle')}
                className={cn(
                  EDITOR_DESIGN.microHeight,
                  "flex-1 text-xs bg-transparent border-0 border-b border-dashed border-border/70 px-0 placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
                )}
              />
              <span className="text-xs font-medium text-primary tabular-nums">
                {calculatedMargin}%
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border/40 pt-3">
            <div className={cn(EDITOR_DESIGN.microLabel, 'mb-2')}>Display Metrics (3 &amp; 4)</div>
          </div>

          {/* Metric 3 */}
          <div className={EDITOR_DESIGN.compactFieldSpacing}>
            <div className="flex items-center gap-2 mb-1">
              <div className={cn(EDITOR_DESIGN.microLabel, 'mb-0')}>Metric 3</div>
              <div className="flex rounded border border-border/60 overflow-hidden text-[10px]">
                <button
                  type="button"
                  onClick={() => form.setValue('metric_3_type', 'employees')}
                  className={cn(
                    'px-2 py-0.5 transition-colors',
                    metric3Type !== 'custom' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Team Size
                </button>
                <button
                  type="button"
                  onClick={() => form.setValue('metric_3_type', 'custom')}
                  className={cn(
                    'px-2 py-0.5 transition-colors',
                    metric3Type === 'custom' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Custom
                </button>
              </div>
            </div>

            {metric3Type !== 'custom' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">Full-time</div>
                  <NumericInput
                    value={form.watch('full_time_employees') || ''}
                    onChange={(v) => form.setValue('full_time_employees', v ? parseInt(v) : null)}
                    placeholder="0"
                    className={cn(EDITOR_DESIGN.compactHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
                  />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">Part-time</div>
                  <NumericInput
                    value={form.watch('part_time_employees') || ''}
                    onChange={(v) => form.setValue('part_time_employees', v ? parseInt(v) : null)}
                    placeholder="0"
                    className={cn(EDITOR_DESIGN.compactHeight, 'text-sm', EDITOR_DESIGN.inputBg)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  placeholder="Label (e.g. Locations)"
                  {...form.register('metric_3_custom_label')}
                  className={cn(
                    EDITOR_DESIGN.compactHeight,
                    "w-full text-sm bg-background border border-border/60 rounded px-2 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  )}
                />
                <input
                  placeholder="Value (e.g. 12)"
                  {...form.register('metric_3_custom_value')}
                  className={cn(
                    EDITOR_DESIGN.compactHeight,
                    "w-full text-sm bg-background border border-border/60 rounded px-2 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  )}
                />
                <input
                  placeholder="Subtitle (optional)"
                  {...form.register('metric_3_custom_subtitle')}
                  className={cn(
                    EDITOR_DESIGN.microHeight,
                    "w-full text-xs bg-transparent border-0 border-b border-dashed border-border/70 px-0 placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
                  )}
                />
              </div>
            )}
          </div>

          {/* Metric 4 */}
          <div className={EDITOR_DESIGN.compactFieldSpacing}>
            <div className="flex items-center gap-2 mb-1">
              <div className={cn(EDITOR_DESIGN.microLabel, 'mb-0')}>Metric 4</div>
              <div className="flex rounded border border-border/60 overflow-hidden text-[10px]">
                <button
                  type="button"
                  onClick={() => form.setValue('metric_4_type', 'ebitda_margin')}
                  className={cn(
                    'px-2 py-0.5 transition-colors',
                    metric4Type !== 'custom' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  EBITDA Margin
                </button>
                <button
                  type="button"
                  onClick={() => form.setValue('metric_4_type', 'custom')}
                  className={cn(
                    'px-2 py-0.5 transition-colors',
                    metric4Type === 'custom' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Custom
                </button>
              </div>
            </div>

            {metric4Type !== 'custom' ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums">{calculatedMargin}%</span>
                  <span className="text-xs text-muted-foreground">(auto-calculated)</span>
                </div>
                <input
                  placeholder="Subtitle (optional)"
                  {...form.register('metric_4_custom_subtitle')}
                  className={cn(
                    EDITOR_DESIGN.microHeight,
                    "w-full text-xs bg-transparent border-0 border-b border-dashed border-border/70 px-0 placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
                  )}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  placeholder="Label (e.g. Growth Rate)"
                  {...form.register('metric_4_custom_label')}
                  className={cn(
                    EDITOR_DESIGN.compactHeight,
                    "w-full text-sm bg-background border border-border/60 rounded px-2 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  )}
                />
                <input
                  placeholder="Value (e.g. 15%)"
                  {...form.register('metric_4_custom_value')}
                  className={cn(
                    EDITOR_DESIGN.compactHeight,
                    "w-full text-sm bg-background border border-border/60 rounded px-2 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  )}
                />
                <input
                  placeholder="Subtitle (optional)"
                  {...form.register('metric_4_custom_subtitle')}
                  className={cn(
                    EDITOR_DESIGN.microHeight,
                    "w-full text-xs bg-transparent border-0 border-b border-dashed border-border/70 px-0 placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
                  )}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
