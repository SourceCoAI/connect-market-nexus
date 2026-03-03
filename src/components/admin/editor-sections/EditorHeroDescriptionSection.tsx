import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { UseFormReturn } from 'react-hook-form';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { Sparkles, Loader2 } from 'lucide-react';

interface EditorHeroDescriptionSectionProps {
  form: UseFormReturn<any>;
  onAiGenerate?: (field: string) => void;
  isGenerating?: boolean;
  generatingField?: string | null;
}

export function EditorHeroDescriptionSection({
  form,
  onAiGenerate,
  isGenerating,
  generatingField,
}: EditorHeroDescriptionSectionProps) {
  const heroDescriptionValue = form.watch('hero_description') || '';
  const charCount = heroDescriptionValue.length;
  const maxChars = 500;
  const isFieldGenerating = isGenerating && generatingField === 'hero_description';

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
        <span>Hero Description</span>
        {onAiGenerate && (
          <button
            type="button"
            onClick={() => onAiGenerate('hero_description')}
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
      <p className="text-xs text-muted-foreground mb-3">
        Short elevator pitch shown at the top of the listing page and in card previews. Keep it
        concise and compelling.
        <span className="ml-1 text-foreground/50">
          ({charCount}/{maxChars})
        </span>
      </p>

      <FormField
        control={form.control}
        name="hero_description"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Textarea
                {...field}
                value={field.value || ''}
                placeholder="e.g. Established HVAC services platform with $12M revenue, 25%+ EBITDA margins, and a 45-person team across 3 locations in the Dallas-Fort Worth metro area."
                className="min-h-[100px] resize-y text-sm"
                maxLength={maxChars}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
