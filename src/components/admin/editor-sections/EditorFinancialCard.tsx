import { useState } from 'react';
import { FormField, FormItem, FormControl } from '@/components/ui/form';
import { UseFormReturn } from 'react-hook-form';
import { EnhancedCurrencyInput } from '@/components/ui/enhanced-currency-input';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

interface EditorFinancialCardProps {
  form: UseFormReturn<any>;
  /** When true, financial fields are locked because they're inherited from the source deal. */
  isReadOnly?: boolean;
}

export function EditorFinancialCard({ form, isReadOnly = false }: EditorFinancialCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const revenue = form.watch('revenue') || 0;
  const ebitda = form.watch('ebitda') || 0;
  const calculatedMargin = revenue > 0 ? ((ebitda / revenue) * 100).toFixed(1) : '0.0';

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
        <span className={EDITOR_DESIGN.microHeader}>Financial</span>
        <ChevronDown className={cn("h-4 w-4 text-foreground/60 transition-transform", !isOpen && "-rotate-90")} />
      </button>

      {isOpen && (
        <div className="space-y-4">
          {isReadOnly && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              Financials inherited from source deal
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
              placeholder="Subtitle"
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
                placeholder="Subtitle"
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
        </div>
      )}
    </div>
  );
}
