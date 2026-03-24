import { useState, useEffect, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { z } from 'zod/v3';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AdminListing } from '@/types/admin';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { parseCurrency } from '@/lib/currency-utils';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Save, Target, ExternalLink } from 'lucide-react';

// Import section components
import { EditorFinancialCard } from './editor-sections/EditorFinancialCard';
import { EditorDescriptionSection } from './editor-sections/EditorDescriptionSection';
import { EditorHeroDescriptionSection } from './editor-sections/EditorHeroDescriptionSection';
import { EditorVisualsSection } from './editor-sections/EditorVisualsSection';
import { EditorInternalCard } from './editor-sections/EditorInternalCard';
import { EditorLivePreview } from './editor-sections/EditorLivePreview';
import { EditorFeaturedDealsSection } from './editor-sections/EditorFeaturedDealsSection';

// Form schema - location accepts array from select component and transforms to string
const listingFormSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(100),
  categories: z.array(z.string()).min(1, 'Please select at least one category'),
  acquisition_type: z.enum(['add_on', 'platform']).nullable().optional(),
  location: z
    .array(z.string())
    .min(1, 'Location is required')
    .transform((val) => val[0] || ''),
  revenue: z
    .string()
    .transform((val) => parseCurrency(val))
    .refine((val) => val >= 0, 'Revenue cannot be negative'),
  ebitda: z
    .string()
    .transform((val) => parseCurrency(val))
    .refine((val) => val >= 0, 'EBITDA cannot be negative'),
  full_time_employees: z.number().int().min(0).optional(),
  part_time_employees: z.number().int().min(0).optional(),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  description_html: z.string().optional(),
  description_json: z.unknown().optional(),
  hero_description: z
    .string()
    .max(500, 'Hero description must be 500 characters or less')
    .nullable()
    .optional(),
  owner_notes: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  status_tag: z.string().nullable().optional(),

  // Admin-only internal fields
  internal_company_name: z.string().nullable().optional(),
  primary_owner_id: z.string().uuid().nullable().optional(),
  presented_by_admin_id: z.string().uuid().nullable().optional(),
  internal_salesforce_link: z.string().nullable().optional(),
  internal_deal_memo_link: z.string().nullable().optional(),
  internal_contact_info: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),

  // Structured contact fields (tied to deal contact)
  main_contact_first_name: z.string().nullable().optional(),
  main_contact_last_name: z.string().nullable().optional(),
  main_contact_email: z.string().nullable().optional(),
  main_contact_phone: z.string().nullable().optional(),
  main_contact_linkedin: z.string().nullable().optional(),

  // Metrics fields
  custom_metric_label: z.string().nullable().optional(),
  custom_metric_value: z.string().nullable().optional(),
  custom_metric_subtitle: z.string().nullable().optional(),
  metric_3_type: z.enum(['employees', 'custom']).default('employees'),
  metric_3_custom_label: z.string().nullable().optional(),
  metric_3_custom_value: z.string().nullable().optional(),
  metric_3_custom_subtitle: z.string().nullable().optional(),
  metric_4_type: z.enum(['ebitda_margin', 'custom']).default('ebitda_margin'),
  metric_4_custom_label: z.string().nullable().optional(),
  metric_4_custom_value: z.string().nullable().optional(),
  metric_4_custom_subtitle: z.string().nullable().optional(),
  revenue_metric_subtitle: z.string().nullable().optional(),
  ebitda_metric_subtitle: z.string().nullable().optional(),

  // Buyer visibility control
  visible_to_buyer_types: z
    .array(
      z.enum([
        'private_equity',
        'corporate',
        'family_office',
        'search_fund',
        'individual_buyer',
        'independent_sponsor',
      ]),
    )
    .nullable()
    .optional(),

  // Content sections (populated by lead memo generator)
  custom_sections: z.unknown().nullable().optional(),
});

type ListingFormInput = {
  title: string;
  categories: string[];
  acquisition_type?: 'add_on' | 'platform' | string | null;
  location: string[]; // Array for form input, transformed to string by Zod
  revenue: string;
  ebitda: string;
  full_time_employees?: number;
  part_time_employees?: number;
  description: string;
  description_html?: string;
  description_json?: unknown;
  hero_description?: string | null;
  owner_notes?: string;
  status: 'active' | 'inactive';
  status_tag?: string | null;
  visible_to_buyer_types?: string[] | null;
  custom_metric_label?: string;
  custom_metric_value?: string;
  custom_metric_subtitle?: string;
  metric_3_type?: 'employees' | 'custom';
  metric_3_custom_label?: string;
  metric_3_custom_value?: string;
  metric_3_custom_subtitle?: string;
  metric_4_type?: 'ebitda_margin' | 'custom';
  metric_4_custom_label?: string;
  metric_4_custom_value?: string;
  metric_4_custom_subtitle?: string;
  revenue_metric_subtitle?: string;
  ebitda_metric_subtitle?: string;
  presented_by_admin_id?: string | null;
  internal_company_name?: string;
  primary_owner_id?: string | null;
  internal_salesforce_link?: string;
  internal_deal_memo_link?: string;
  internal_contact_info?: string;
  internal_notes?: string;
  // Structured contact fields (tied to deal contact)
  main_contact_first_name?: string;
  main_contact_last_name?: string;
  main_contact_email?: string;
  main_contact_phone?: string;
  main_contact_linkedin?: string;
  // Content sections (populated by lead memo generator)
  custom_sections?: unknown;
};

type ListingFormValues = z.infer<typeof listingFormSchema>;

interface ImprovedListingEditorProps {
  onSubmit: (
    data: ListingFormValues & { description_html?: string; description_json?: unknown },
    image?: File | null,
  ) => Promise<void>;
  listing?: AdminListing;
  isLoading?: boolean;
  targetType?: 'marketplace' | 'research';
  /** When set, financial fields are locked — they're inherited from the source deal. */
  sourceDealId?: string | null;
}

const convertListingToFormInput = (listing?: AdminListing): ListingFormInput => {
  return {
    title: listing?.title || '',
    categories: listing?.categories || (listing?.category ? [listing.category] : []),
    acquisition_type: listing?.acquisition_type || 'add_on',
    location: listing?.location ? [listing.location] : [], // Convert string to array for select component
    revenue: listing?.revenue ? listing.revenue.toString() : '',
    ebitda: listing?.ebitda ? listing.ebitda.toString() : '',
    full_time_employees: listing?.full_time_employees || 0,
    part_time_employees: listing?.part_time_employees || 0,
    description: listing?.description || '',
    description_html: listing?.description_html,
    description_json: listing?.description_json,
    hero_description: listing?.hero_description || null,
    owner_notes: listing?.owner_notes,
    status: listing?.status || 'active',
    status_tag: listing?.status_tag || null,
    visible_to_buyer_types: listing?.visible_to_buyer_types || null,
    custom_metric_label: listing?.custom_metric_label || '',
    custom_metric_value: listing?.custom_metric_value || '',
    custom_metric_subtitle: listing?.custom_metric_subtitle || '',
    metric_3_type: listing?.metric_3_type || 'employees',
    metric_3_custom_label: listing?.metric_3_custom_label || '',
    metric_3_custom_value: listing?.metric_3_custom_value || '',
    metric_3_custom_subtitle: listing?.metric_3_custom_subtitle || '',
    metric_4_type: listing?.metric_4_type || 'ebitda_margin',
    metric_4_custom_label: listing?.metric_4_custom_label || '',
    metric_4_custom_value: listing?.metric_4_custom_value || '',
    metric_4_custom_subtitle: listing?.metric_4_custom_subtitle || '',
    revenue_metric_subtitle: listing?.revenue_metric_subtitle || '',
    ebitda_metric_subtitle: listing?.ebitda_metric_subtitle || '',
    presented_by_admin_id: listing?.presented_by_admin_id || null,
    internal_company_name: listing?.internal_company_name || '',
    primary_owner_id: listing?.primary_owner_id || null,
    internal_salesforce_link: listing?.internal_salesforce_link || '',
    internal_deal_memo_link: listing?.internal_deal_memo_link || '',
    internal_contact_info: listing?.internal_contact_info || '',
    internal_notes: listing?.internal_notes || '',
    // Structured contact fields (tied to deal contact)
    main_contact_first_name: listing?.main_contact_first_name || '',
    main_contact_last_name: listing?.main_contact_last_name || '',
    main_contact_email: listing?.main_contact_email || '',
    main_contact_phone: listing?.main_contact_phone || '',
    main_contact_linkedin: listing?.main_contact_linkedin || '',
    // Content sections (populated by lead memo generator)
    custom_sections: listing?.custom_sections || null,
  };
};

export function ImprovedListingEditor({
  onSubmit,
  listing,
  isLoading = false,
  sourceDealId,
}: ImprovedListingEditorProps) {
  const effectiveDealId = sourceDealId || listing?.source_deal_id || null;
  const isDealSourced = !!effectiveDealId;
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(listing?.image_url || null);
  const [isImageChanged, setIsImageChanged] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [featuredDealIds, setFeaturedDealIds] = useState<string[] | null>(
    listing?.featured_deal_ids ?? null,
  );

  // H-2 FIX: Wire up AI generation for hero description and body content.
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingField, setGeneratingField] = useState<string | null>(null);

  const handleAiGenerate = async (field: string) => {
    if (!effectiveDealId) {
      toast({
        title: 'No source deal',
        description: 'AI generation requires a linked deal.',
        variant: 'destructive',
      });
      return;
    }
    setIsGenerating(true);
    setGeneratingField(field);
    try {
      const { data, error } = await supabase.functions.invoke('generate-lead-memo', {
        body: { listingId: effectiveDealId, memo_type: 'anonymous_teaser', targetField: field },
      });
      if (error) throw error;
      if (field === 'hero_description' && data?.hero_description) {
        form.setValue('hero_description', data.hero_description, { shouldDirty: true });
        toast({ title: 'AI Content Generated', description: 'Hero description updated.' });
      } else if (field === 'description' && data?.description) {
        form.setValue('description', data.description, { shouldDirty: true });
        if (data.description_html) {
          (form.setValue as Function)('description_html', data.description_html, { shouldDirty: true });
        }
        toast({ title: 'AI Content Generated', description: 'Description updated.' });
      } else if (data?.custom_sections) {
        (form.setValue as Function)('custom_sections', data.custom_sections, { shouldDirty: true });
        toast({ title: 'AI Content Generated', description: 'Content sections updated.' });
      }
    } catch (err) {
      toast({
        title: 'Generation Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGeneratingField(null);
    }
  };

  const form = useForm<ListingFormInput, unknown, ListingFormValues>({
    resolver: zodResolver(listingFormSchema as unknown as Parameters<typeof zodResolver>[0]),
    defaultValues: convertListingToFormInput(listing),
  });

  // Reset form when the listing prop changes (e.g., after AI content generation
  // updates prefilled data in CreateListingFromDeal). React Hook Form's
  // defaultValues are only read on first render, so we must call reset() to
  // pick up new values like custom_sections and description.
  const prevListingRef = useRef(listing);
  useEffect(() => {
    if (listing && listing !== prevListingRef.current) {
      prevListingRef.current = listing;
      form.reset(convertListingToFormInput(listing));
    }
  }, [listing, form]);

  // Cast for child components that accept UseFormReturn<any>
  const formForSections = form as unknown as import('react-hook-form').UseFormReturn<
    Record<string, unknown>
  >;

  const handleImageSelect = (file: File | null) => {
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setImageError('Image file size must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setImageError('Please select a valid image file');
        return;
      }

      setImageError(null);
      setSelectedImage(file);
      setIsImageChanged(true);

      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setIsImageChanged(true);
    setImageError(null);
  };

  // Manual submit handler that validates first and shows errors
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const isValid = await form.trigger();

      if (!isValid) {
        const errors = form.formState.errors;
        const errorFields = Object.keys(errors)
          .map((key) => {
            const error = errors[key as keyof typeof errors];
            return `${key}: ${(error as { message?: string })?.message || 'Invalid'}`;
          })
          .join(', ');

        toast({
          variant: 'destructive',
          title: 'Please fix the following errors',
          description: errorFields || 'Form validation failed',
        });
        return;
      }

      // Get form values and call the submit handler
      const formData = form.getValues();

      // Manual transformation since we're bypassing zodResolver's transform
      const transformedLocation = Array.isArray(formData.location)
        ? formData.location[0] || ''
        : formData.location || '';

      await handleSubmit({
        ...formData,
        location: transformedLocation,
      } as unknown as ListingFormValues);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please check all required fields are filled correctly.',
      });
    }
  };

  const handleSubmit = async (formData: ListingFormValues) => {
    try {
      if (imageError) {
        toast({
          variant: 'destructive',
          title: 'Image Error',
          description: imageError,
        });
        return;
      }

      const transformedData: ListingFormValues & {
        description_html?: string;
        description_json?: unknown;
      } = {
        ...formData,
        acquisition_type:
          formData.acquisition_type === 'add_on' || formData.acquisition_type === 'platform'
            ? formData.acquisition_type
            : null,
        part_time_employees: formData.part_time_employees,
        description: formData.description,
        description_html: formData.description_html,
        description_json: formData.description_json,
        hero_description: formData.hero_description?.trim() || null,
        owner_notes: formData.owner_notes,
        status: formData.status,
        status_tag:
          formData.status_tag && formData.status_tag !== 'none' ? formData.status_tag : null,
        visible_to_buyer_types: (formData.visible_to_buyer_types || null) as
          | (
              | 'private_equity'
              | 'corporate'
              | 'family_office'
              | 'search_fund'
              | 'individual_buyer'
              | 'independent_sponsor'
            )[]
          | null,
        custom_metric_label: formData.custom_metric_label || null,
        custom_metric_value: formData.custom_metric_value || null,
        custom_metric_subtitle: formData.custom_metric_subtitle || null,
        metric_3_type: formData.metric_3_type || 'employees',
        metric_3_custom_label: formData.metric_3_custom_label || null,
        metric_3_custom_value: formData.metric_3_custom_value || null,
        metric_3_custom_subtitle: formData.metric_3_custom_subtitle || null,
        metric_4_type: formData.metric_4_type || 'ebitda_margin',
        metric_4_custom_label: formData.metric_4_custom_label || null,
        metric_4_custom_value: formData.metric_4_custom_value || null,
        metric_4_custom_subtitle: formData.metric_4_custom_subtitle || null,
        revenue_metric_subtitle: formData.revenue_metric_subtitle || null,
        ebitda_metric_subtitle: formData.ebitda_metric_subtitle || null,
        presented_by_admin_id: formData.presented_by_admin_id || null,
        internal_company_name: formData.internal_company_name || null,
        primary_owner_id: formData.primary_owner_id || null,
        internal_salesforce_link: formData.internal_salesforce_link || null,
        internal_deal_memo_link: formData.internal_deal_memo_link || null,
        internal_contact_info: formData.internal_contact_info || null,
        internal_notes: formData.internal_notes || null,
        // Structured contact fields (tied to deal contact)
        main_contact_first_name: formData.main_contact_first_name || null,
        main_contact_last_name: formData.main_contact_last_name || null,
        main_contact_email: formData.main_contact_email || null,
        main_contact_phone: formData.main_contact_phone || null,
        main_contact_linkedin: formData.main_contact_linkedin || null,
        // Content sections (populated by lead memo generator)
        custom_sections: formData.custom_sections || null,
        // Featured deals for landing page
        ...(featuredDealIds ? { featured_deal_ids: featuredDealIds } : {}),
      };

      await onSubmit(transformedData, isImageChanged ? selectedImage : undefined);

      if (!listing) {
        form.reset();
        setSelectedImage(null);
        setImagePreview(null);
        setIsImageChanged(false);
      }
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save listing',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50">
      <div className="max-w-[1920px] mx-auto px-12 py-8">
        <Form {...form}>
          <form onSubmit={handleFormSubmit}>
            {/* Target type banner */}
            {!listing && (
              <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm font-medium text-foreground/70">
                <Target className="h-4 w-4 shrink-0" />
                This listing will be created as a draft. Use the Publish button on the card to make
                it live on the marketplace.
              </div>
            )}

            {/* Landing Page Preview button */}
            {listing?.id && (
              <div className="mb-6 flex items-center gap-3">
                <a
                  href={`/deals/${listing.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-muted/50 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Preview Landing Page
                </a>
              </div>
            )}

            {/* MAIN CONTENT - Card grid */}
            <div className="grid grid-cols-[540px_1fr] gap-8 mb-6">
              {/* Left: Company Overview (includes marketplace title, geography, type, industry) */}
              <EditorInternalCard
                form={formForSections}
                dealIdentifier={listing?.deal_identifier}
              />

              {/* Right: Financial + Image stacked */}
              <div className="space-y-6">
                <EditorFinancialCard form={formForSections} isReadOnly={isDealSourced} />
                <EditorVisualsSection
                  imagePreview={imagePreview}
                  imageError={imageError}
                  onImageSelect={handleImageSelect}
                  onRemoveImage={handleRemoveImage}
                />
              </div>
            </div>

            {/* FULL WIDTH - Hero Description (above Body Description) */}
            <div className="mb-6">
              <EditorHeroDescriptionSection
                form={formForSections}
                isGenerating={isGenerating}
                generatingField={generatingField}
                onAiGenerate={effectiveDealId ? handleAiGenerate : undefined}
                dealId={effectiveDealId}
                listingId={listing?.id || null}
              />
            </div>

            {/* FULL WIDTH - Body Description (rich text editor) */}
            <div className="mb-6">
              <EditorDescriptionSection
                form={formForSections}
                isGenerating={isGenerating}
                generatingField={generatingField}
                onAiGenerate={effectiveDealId ? handleAiGenerate : undefined}
                dealId={effectiveDealId}
                listingId={listing?.id || null}
              />
            </div>

            {/* Featured Deals (for landing page related-deals section) */}
            <div className="mb-6">
              <EditorFeaturedDealsSection
                featuredDealIds={featuredDealIds}
                onChange={setFeaturedDealIds}
                currentListingId={listing?.id}
              />
            </div>

            {/* Live Preview */}
            <div className="mb-6">
              <EditorLivePreview
                formValues={
                  form.watch() as unknown as React.ComponentProps<
                    typeof EditorLivePreview
                  >['formValues']
                }
                imagePreview={imagePreview}
                listingId={listing?.id}
              />
            </div>

            {/* FOOTER - Actions */}
            <div className="flex items-center justify-between pt-6 border-t border-border">
              <div className="text-sm text-muted-foreground">
                {listing
                  ? `Last updated: ${new Date(listing.updated_at).toLocaleDateString()}`
                  : 'Draft'}
              </div>
              <Button type="submit" disabled={isLoading || !!imageError} className="gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {listing ? 'Update Listing' : 'Create Listing'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
