import { useState, useCallback } from 'react';
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { UseFormReturn } from 'react-hook-form';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EditorHeroDescriptionSectionProps {
  form: UseFormReturn<any>;
  onAiGenerate?: (field: string) => void;
  isGenerating?: boolean;
  generatingField?: string | null;
  /** Source deal ID — enables the "Regenerate with AI" button */
  dealId?: string | null;
  /** Listing ID — if provided, the regeneration also updates the listing row */
  listingId?: string | null;
}

export function EditorHeroDescriptionSection({
  form,
  onAiGenerate,
  isGenerating,
  generatingField,
  dealId,
  listingId,
}: EditorHeroDescriptionSectionProps) {
  const heroDescriptionValue = form.watch('hero_description') || '';
  const charCount = heroDescriptionValue.length;
  const maxChars = 280;
  const isFieldGenerating = isGenerating && generatingField === 'hero_description';
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = useCallback(async () => {
    if (!dealId) return;
    setIsRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-listing-content', {
        body: { deal_id: dealId, listing_id: listingId || undefined },
      });

      if (error || !data?.success) {
        toast.error('Failed to regenerate hero description. Ensure a completed lead memo exists.');
        return;
      }

      if (data.hero_description) {
        form.setValue('hero_description', data.hero_description);
        toast.success('Hero description regenerated. Review and edit before saving.');
      } else {
        toast.warning('AI did not return a hero description. Try regenerating again.');
      }
    } catch (err) {
      console.error('[EditorHeroDescriptionSection] Regeneration error:', err);
      toast.error('Failed to regenerate hero description.');
    } finally {
      setIsRegenerating(false);
    }
  }, [dealId, listingId, form]);

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
        <div className="flex items-center gap-2">
          {dealId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={isRegenerating || isGenerating}
              className="gap-1.5 h-6 text-xs px-2"
            >
              {isRegenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {isRegenerating ? 'Regenerating...' : 'Regenerate with AI'}
            </Button>
          )}
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
