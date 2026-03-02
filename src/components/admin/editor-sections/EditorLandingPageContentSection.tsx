import { FieldValues, UseFormReturn } from 'react-hook-form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EDITOR_DESIGN } from '@/lib/editor-design-system';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useState } from 'react';

interface EditorLandingPageContentSectionProps {
  form: UseFormReturn<FieldValues>;
}

/**
 * Editor for the listing's content sections (custom_sections).
 *
 * These sections are auto-populated by the lead memo generator when the
 * anonymous teaser is created. Admins can manually add, edit, reorder,
 * or remove sections here after generation.
 */
export function EditorLandingPageContentSection({ form }: EditorLandingPageContentSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const customSections: Array<{ title: string; description: string }> =
    form.watch('custom_sections') || [];

  const addCustomSection = () => {
    const current = form.getValues('custom_sections') || [];
    form.setValue('custom_sections', [...current, { title: '', description: '' }]);
  };

  const removeCustomSection = (index: number) => {
    const current = form.getValues('custom_sections') || [];
    form.setValue(
      'custom_sections',
      current.filter((_: unknown, i: number) => i !== index),
    );
  };

  const updateCustomSection = (index: number, field: 'title' | 'description', value: string) => {
    const current = [...(form.getValues('custom_sections') || [])];
    current[index] = { ...current[index], [field]: value };
    form.setValue('custom_sections', current);
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
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className={cn(EDITOR_DESIGN.microHeader)}>Content Sections</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {customSections.length > 0
            ? `${customSections.length} section${customSections.length === 1 ? '' : 's'}`
            : 'Empty — generate the anonymous teaser memo to populate'}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Custom Sections */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className={EDITOR_DESIGN.microLabel}>
                Sections are populated from the anonymous teaser memo
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addCustomSection}
                className="h-6 gap-1 text-xs"
              >
                <Plus className="h-3 w-3" /> Add Section
              </Button>
            </div>
            {customSections.map((section, i) => (
              <div key={i} className="mb-3 p-3 border border-border rounded-md relative">
                <button
                  type="button"
                  onClick={() => removeCustomSection(i)}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <Input
                  placeholder="Section title"
                  value={section.title}
                  onChange={(e) => updateCustomSection(i, 'title', e.target.value)}
                  className={cn('mb-2 text-sm', EDITOR_DESIGN.miniHeight, EDITOR_DESIGN.inputBg)}
                />
                <Textarea
                  rows={3}
                  placeholder="Section content..."
                  value={section.description}
                  onChange={(e) => updateCustomSection(i, 'description', e.target.value)}
                  className={cn(
                    'text-sm resize-y',
                    EDITOR_DESIGN.inputBg,
                    EDITOR_DESIGN.inputBorder,
                    'rounded p-2',
                  )}
                />
              </div>
            ))}
            {customSections.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No content sections yet. Generate the anonymous teaser memo in the Data Room to auto-populate these sections.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
