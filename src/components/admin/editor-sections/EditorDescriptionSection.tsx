import { lazy, Suspense, useState, useCallback } from 'react';
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { UseFormReturn } from 'react-hook-form';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PremiumRichTextEditor = lazy(() =>
  import('@/components/ui/premium-rich-text-editor').then((m) => ({
    default: m.PremiumRichTextEditor,
  })),
);
import { cn } from '@/lib/utils';
import { stripHtml } from '@/lib/sanitize';

/**
 * Default section template injected when the editor is empty.
 * Gives authors a structured starting point they can fill in,
 * while keeping everything in a single copy-pasteable editor.
 */
const SECTION_TEMPLATE = [
  '<h2>Business Overview</h2><p></p>',
  '<h2>Deal Snapshot</h2><ul><li></li></ul>',
  '<h2>Key Facts</h2><ul><li></li></ul>',
  '<h2>Growth Context</h2><ul><li></li></ul>',
  '<h2>Owner Objectives</h2><ul><li></li></ul>',
].join('');

interface EditorDescriptionSectionProps {
  form: UseFormReturn<any>;
  onAiGenerate?: (field: string) => void;
  isGenerating?: boolean;
  generatingField?: string | null;
  /** Source deal ID — enables the "Regenerate with AI" button */
  dealId?: string | null;
  /** Listing ID — if provided, the regeneration also updates the listing row */
  listingId?: string | null;
}

export function EditorDescriptionSection({
  form,
  onAiGenerate,
  isGenerating,
  generatingField,
  dealId,
  listingId,
}: EditorDescriptionSectionProps) {
  const isFieldGenerating = isGenerating && generatingField === 'description';
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Use existing content, or fall back to the section template for new listings
  const existingHtml = form.getValues('description_html');
  const existingPlain = form.getValues('description');
  const initialContent = existingHtml || existingPlain || SECTION_TEMPLATE;

  const handleRegenerate = useCallback(async () => {
    if (!dealId) return;
    setIsRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-marketplace-listing', {
        body: { deal_id: dealId, listing_id: listingId || undefined },
      });

      if (error || !data?.success) {
        toast.error('Failed to regenerate listing description. Ensure a completed lead memo exists.');
        return;
      }

      // Update form values with new content
      form.setValue('description_html', data.description_html);
      form.setValue('description', data.description_markdown);

      const validation = data?.validation;
      if (validation && !validation.pass) {
        toast.warning('AI listing regenerated with validation warnings — review carefully.');
      } else {
        toast.success('Listing description regenerated — review and edit before saving.');
      }
    } catch (err) {
      console.error('[EditorDescriptionSection] Regeneration error:', err);
      toast.error('Failed to regenerate listing description.');
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
        <span>Body Description</span>
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
                  content={initialContent}
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
