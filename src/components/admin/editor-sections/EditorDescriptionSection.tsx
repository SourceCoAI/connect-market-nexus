import { lazy, Suspense } from 'react';
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { UseFormReturn } from 'react-hook-form';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { Sparkles, Loader2 } from 'lucide-react';

const PremiumRichTextEditor = lazy(() =>
  import('@/components/ui/premium-rich-text-editor').then((m) => ({
    default: m.PremiumRichTextEditor,
  })),
);
import { cn } from '@/lib/utils';
import { stripHtml } from '@/lib/sanitize';

interface EditorDescriptionSectionProps {
  form: UseFormReturn<any>;
  onAiGenerate?: (field: string) => void;
  isGenerating?: boolean;
  generatingField?: string | null;
}

export function EditorDescriptionSection({
  form,
  onAiGenerate,
  isGenerating,
  generatingField,
}: EditorDescriptionSectionProps) {
  const isFieldGenerating = isGenerating && generatingField === 'description';

  return (
    <div
      className={cn(
        EDITOR_DESIGN.cardBg,
        EDITOR_DESIGN.cardBorder,
        'rounded-lg',
        EDITOR_DESIGN.cardPadding,
      )}
    >
      <div className={cn(EDITOR_DESIGN.microHeader, 'mb-2 flex items-center justify-between')}>
        <span>Body Description</span>
        {onAiGenerate && (
          <button
            type="button"
            onClick={() => onAiGenerate('description')}
            disabled={isGenerating}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
          >
            {isFieldGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {isFieldGenerating ? 'Generating...' : 'Generate with AI'}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        The full listing description shown to buyers. Use section headings, concise sentences, and
        bullet points for key data — present information in the cleanest, most digestible way
        possible.
      </p>

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Suspense fallback={<div className="h-[300px] animate-pulse bg-muted rounded-lg" />}>
                <PremiumRichTextEditor
                  content={form.getValues('description_html') || field.value || ''}
                  onChange={(html, json) => {
                    form.setValue('description_html', html);
                    form.setValue('description_json', json);
                    // Extract plain text safely using sanitize utility
                    const plainText = stripHtml(html);
                    field.onChange(plainText);
                  }}
                />
              </Suspense>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
