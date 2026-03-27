import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ImprovedListingEditor } from '@/components/admin/ImprovedListingEditor';
import { useRobustListingCreation } from '@/hooks/admin/listings/use-robust-listing-creation';
import {
  anonymizeDealToListing,
  descriptionToHtml,
  type DealData as DealForAnonymizer,
} from '@/lib/deal-to-listing-anonymizer';
import { AdminListing } from '@/types/admin';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Page for creating a marketplace listing from a deal in the marketplace queue.
 * Fetches deal data, anonymizes it, and pre-fills the listing editor.
 *
 * Content sections (custom_sections) are populated later when the lead memo
 * is generated — not during listing creation.
 */
export default function CreateListingFromDeal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dealId = searchParams.get('fromDeal');

  const { mutateAsync: createListing, isPending: isCreating } = useRobustListingCreation();
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const contentGenerationTriggered = useRef(false);

  // Fetch the deal data
  const {
    data: deal,
    isLoading: dealLoading,
    error: dealError,
  } = useQuery({
    queryKey: ['marketplace-queue-deal', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(
          `
          id, title, internal_company_name, description, executive_summary,
          revenue, ebitda, ebitda_margin, location, address_state, address_city,
          category, industry, service_mix, services, website,
          full_time_employees, linkedin_employee_count,
          main_contact_name, main_contact_email, main_contact_phone, main_contact_title,
          geographic_states, internal_deal_memo_link,
          founded_year, number_of_locations,
          customer_geography, customer_types, end_market_description,
          investment_thesis, competitive_position, ownership_structure,
          seller_motivation, business_model, revenue_model, growth_drivers
        `,
        )
        .eq('id', dealId!)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Check if a listing already exists for this deal
  const { data: existingListing } = useQuery({
    queryKey: ['existing-listing-for-deal', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title')
        .eq('source_deal_id', dealId!)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  // Phase 61: Redirect to edit if a listing already exists for this deal
  useEffect(() => {
    if (existingListing?.id) {
      toast.info('A listing already exists for this deal. Redirecting to edit.');
      navigate(`/admin/marketplace/listings`, { replace: true });
    }
  }, [existingListing, navigate]);

  // Build the pre-filled listing from anonymized deal data
  const [prefilled, setPrefilled] = useState<AdminListing | null>(null);

  useEffect(() => {
    if (deal && !prefilled) {
      const anonymized = anonymizeDealToListing(deal as DealForAnonymizer);
      setPrefilled({
        id: '', // New listing, no ID yet
        title: anonymized.title,
        description: anonymized.description,
        description_html: descriptionToHtml(anonymized.description),
        hero_description: anonymized.hero_description,
        categories: anonymized.categories,
        location: anonymized.location,
        revenue: anonymized.revenue,
        ebitda: anonymized.ebitda,
        full_time_employees: anonymized.full_time_employees,
        internal_company_name: anonymized.internal_company_name,
        internal_notes: anonymized.internal_notes,
        // Use deal website as Company URL, falling back to deal memo link
        internal_deal_memo_link:
          ((deal as Record<string, unknown>).website as string) ||
          deal.internal_deal_memo_link ||
          '',
        company_website: anonymized.company_website || null,
        // Custom metrics
        metric_3_type: anonymized.metric_3_type,
        metric_3_custom_label: anonymized.metric_3_custom_label,
        metric_3_custom_value: anonymized.metric_3_custom_value,
        metric_3_custom_subtitle: anonymized.metric_3_custom_subtitle,
        metric_4_type: anonymized.metric_4_type,
        metric_4_custom_label: anonymized.metric_4_custom_label,
        metric_4_custom_value: anonymized.metric_4_custom_value,
        metric_4_custom_subtitle: anonymized.metric_4_custom_subtitle,
        // Structured contact fields from deal
        main_contact_first_name: anonymized.main_contact_first_name || null,
        main_contact_last_name: anonymized.main_contact_last_name || null,
        main_contact_email: anonymized.main_contact_email || null,
        main_contact_phone: anonymized.main_contact_phone || null,
        // Deal enrichment fields (passed through to listing for structured data)
        customer_geography:
          ((deal as Record<string, unknown>).customer_geography as string) || null,
        customer_types: ((deal as Record<string, unknown>).customer_types as string) || null,
        end_market_description:
          ((deal as Record<string, unknown>).end_market_description as string) || null,
        investment_thesis:
          ((deal as Record<string, unknown>).investment_thesis as string) ?? undefined,
        competitive_position:
          ((deal as Record<string, unknown>).competitive_position as string) ?? undefined,
        ownership_structure:
          ((deal as Record<string, unknown>).ownership_structure as string) ?? undefined,
        seller_motivation:
          ((deal as Record<string, unknown>).seller_motivation as string) ?? undefined,
        business_model: ((deal as Record<string, unknown>).business_model as string) ?? undefined,
        revenue_model: ((deal as Record<string, unknown>).revenue_model as string) ?? undefined,
        growth_drivers: ((deal as Record<string, unknown>).growth_drivers as string[]) || null,
        services:
          anonymized.services.length > 0
            ? anonymized.services
            : ((deal as Record<string, unknown>).services as string[]) || null,
        service_mix: (() => {
          const mix =
            anonymized.service_mix || ((deal as Record<string, unknown>).service_mix as string);
          return mix ? [mix] : null;
        })(),
        geographic_states:
          anonymized.geographic_states.length > 0
            ? anonymized.geographic_states
            : ((deal as Record<string, unknown>).geographic_states as string[]) || null,
        custom_sections: [],
        tags: [],
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }, [deal, prefilled]);

  // Tracks whether the description is the mechanical anonymizer fallback
  // (low quality) vs. an AI-generated teaser (buyer-grade).
  const [descriptionSource, setDescriptionSource] = useState<'loading' | 'teaser' | 'anonymizer'>(
    'loading',
  );

  // Auto-trigger AI content generation when prefilled data is ready.
  // Priority: 1) Call generate-marketplace-listing (dedicated, buyer-grade)  2) Anonymizer fallback
  useEffect(() => {
    if (!prefilled || !dealId || contentGenerationTriggered.current) return;
    if (prefilled.custom_sections && (prefilled.custom_sections as unknown[]).length > 0) return;
    contentGenerationTriggered.current = true;
    setIsGeneratingContent(true);

    (async () => {
      try {
        // Step 1: Check that content sources exist to generate a listing.
        // Priority: Final PDFs in data_room_documents (reviewed) > completed
        // lead memos in lead_memos table > anonymizer fallback.
        const { data: finalPdfs } = await supabase
          .from('data_room_documents')
          .select('document_category')
          .eq('deal_id', dealId)
          .in('document_category', ['full_memo', 'anonymous_teaser'])
          .eq('status', 'active');

        const hasFinalLeadMemo = finalPdfs?.some((d) => d.document_category === 'full_memo');
        const hasFinalTeaser = finalPdfs?.some((d) => d.document_category === 'anonymous_teaser');

        // If Final PDFs are missing, check if completed lead memos exist
        // (the lead memo content is sufficient for AI listing generation)
        let hasLeadMemoContent = false;
        if (!hasFinalLeadMemo || !hasFinalTeaser) {
          const { data: leadMemos } = await supabase
            .from('lead_memos')
            .select('memo_type')
            .eq('deal_id', dealId)
            .in('memo_type', ['full_memo', 'anonymous_teaser'])
            .in('status', ['completed', 'published']);

          const hasFullMemoContent = leadMemos?.some((m) => m.memo_type === 'full_memo');
          const hasTeaserContent = leadMemos?.some((m) => m.memo_type === 'anonymous_teaser');
          hasLeadMemoContent = !!(hasFullMemoContent || hasTeaserContent);
        }

        if (!hasFinalLeadMemo && !hasFinalTeaser && !hasLeadMemoContent) {
          setDescriptionSource('anonymizer');
          toast.warning(
            `No lead memos found. Generate a Full Lead Memo from the Data Room before creating a listing.`,
            { duration: 8000 },
          );
          return;
        }

        // Step 2: Call the dedicated marketplace listing generator
        const { data, error } = await supabase.functions.invoke('generate-marketplace-listing', {
          body: { deal_id: dealId },
        });

        if (error || !data?.success) {
          let errorDetail = '';
          try {
            if (error && typeof error === 'object' && 'context' in error) {
              const ctx = (error as { context: unknown }).context;
              if (ctx instanceof Response) {
                const body = await ctx.json();
                errorDetail = body?.error || '';
              } else if (
                typeof ctx === 'object' &&
                ctx !== null &&
                'error' in (ctx as Record<string, unknown>)
              ) {
                errorDetail = (ctx as { error: string }).error;
              }
            }
            if (!errorDetail) {
              errorDetail =
                typeof error === 'object' && error !== null && 'message' in error
                  ? (error as { message: string }).message
                  : String(error);
            }
          } catch {
            errorDetail = String(error);
          }

          console.error(
            '[CreateListingFromDeal] generate-marketplace-listing failed:',
            errorDetail,
          );
          setDescriptionSource('anonymizer');
          toast.info('AI content generation could not complete. You can fill in content manually.');
          return;
        }

        // Step 3: Set the HTML description in the editor
        setPrefilled((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            title: data.title || prev.title,
            description_html: data.description_html,
            description: data.description_markdown,
            hero_description: data.hero_description || prev.hero_description,
            location: data.location || prev.location,
            custom_sections: [],
          };
        });
        setDescriptionSource('teaser');

        const validation = data?.validation;
        if (validation && !validation.pass) {
          toast.warning(
            'AI listing generated with validation warnings — review carefully before saving.',
          );
        } else {
          toast.success('AI content generated — review and edit before saving.');
        }
      } catch (err) {
        console.error('[CreateListingFromDeal] AI content generation error:', err);
        setDescriptionSource('anonymizer');
        toast.warning('AI listing generation failed — using placeholder description.');
      } finally {
        setIsGeneratingContent(false);
      }
    })();
  }, [prefilled, dealId]);

  const handleSubmit = async (data: Record<string, unknown>, image?: File | null) => {
    try {
      // Merge form data with enrichment fields from prefilled that don't
      // survive the form (they're not in the Zod schema / ListingFormInput).
      // These fields are on the prefilled AdminListing but get stripped by
      // the form's getValues() since they're not registered form fields.
      const enrichmentFields = prefilled
        ? {
            customer_geography: prefilled.customer_geography || null,
            customer_types: prefilled.customer_types || null,
            end_market_description: prefilled.end_market_description || null,
            investment_thesis: prefilled.investment_thesis || null,
            competitive_position: prefilled.competitive_position || null,
            ownership_structure: prefilled.ownership_structure || null,
            seller_motivation: prefilled.seller_motivation || null,
            business_model: prefilled.business_model || null,
            revenue_model: prefilled.revenue_model || null,
            growth_drivers: prefilled.growth_drivers || null,
            services: prefilled.services || null,
            service_mix: (prefilled as unknown as Record<string, unknown>).service_mix || null,
            geographic_states:
              (prefilled as unknown as Record<string, unknown>).geographic_states || null,
          }
        : {};

      const listingData = {
        ...data,
        ...enrichmentFields,
        source_deal_id: dealId,
        // Ensure it's created as an internal draft
        is_internal_deal: true,
        // website is NOT NULL in DB — empty for anonymous marketplace listings
        website: '',
      };

      const newListing = await createListing({ listing: listingData as never, image });

      // Auto-sync teaser content if a teaser memo draft already exists for the source deal.
      // This handles the case where the admin generated the teaser before creating the listing.
      if (newListing?.id && dealId) {
        try {
          const { data: existingTeaser } = await supabase
            .from('lead_memos')
            .select('id, content')
            .eq('deal_id', dealId)
            .eq('memo_type', 'anonymous_teaser')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingTeaser?.content) {
            const teaserContent = existingTeaser.content as { sections?: unknown[] };
            const sections = Array.isArray(teaserContent.sections) ? teaserContent.sections : [];
            // Validate each section has the expected shape before using it
            const validSections = sections.filter(
              (s): s is { key: string; title: string; content: string } =>
                typeof s === 'object' &&
                s !== null &&
                typeof (s as Record<string, unknown>).key === 'string' &&
                typeof (s as Record<string, unknown>).title === 'string' &&
                typeof (s as Record<string, unknown>).content === 'string',
            );
            if (validSections.length > 0) {
              const contentSections = validSections.filter(
                (s) => s.key !== 'header_block' && s.key !== 'contact_information',
              );
              const customSections = contentSections.map((s) => ({
                title: s.title,
                description: s.content,
              }));
              const unifiedDescription = contentSections
                .map((s) => `**${s.title}**\n\n${s.content}`)
                .join('\n\n---\n\n');

              const { error: syncUpdateError } = await supabase
                .from('listings')
                .update({
                  custom_sections: customSections,
                  description: unifiedDescription,
                })
                .eq('id', newListing.id);

              if (syncUpdateError) {
                console.warn(
                  '[CreateListingFromDeal] Teaser sync update failed:',
                  syncUpdateError.message,
                );
              } else {
                // teaser content synced successfully
              }
            }
          }
        } catch (syncErr) {
          console.warn('[CreateListingFromDeal] Failed to auto-sync teaser content:', syncErr);
        }
      }

      // Invalidate relevant queries — the deal stays in the queue so the
      // "Listing Created" badge appears. The source_deal_id link is the
      // canonical record that a listing exists for this deal.
      if (dealId) {
        queryClient.invalidateQueries({ queryKey: ['marketplace-queue'] });
        queryClient.invalidateQueries({ queryKey: ['marketplace-queue-existing-listings'] });
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
        queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
      }

      toast.success('Marketplace listing created — review and publish from the Listings tab.');
      navigate('/admin/marketplace/queue');
    } catch (error: unknown) {
      toast.error((error as Error).message || 'Failed to create listing');
    }
  };

  if (!dealId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">
          No deal specified. Go back to the marketplace queue.
        </p>
        <Button variant="outline" onClick={() => navigate('/admin/marketplace/queue')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Queue
        </Button>
      </div>
    );
  }

  if (dealLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (dealError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <p className="text-muted-foreground">Failed to load deal data.</p>
        <Button variant="outline" onClick={() => navigate('/admin/marketplace/queue')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Queue
        </Button>
      </div>
    );
  }

  if (existingListing) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="h-12 w-12 text-amber-400" />
        <p className="text-muted-foreground">
          A listing already exists for this deal: <strong>{existingListing.title}</strong>
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/admin/marketplace/queue')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Queue
          </Button>
          <Button onClick={() => navigate(`/admin/deals?tab=marketplace`)}>
            View Existing Listing
          </Button>
        </div>
      </div>
    );
  }

  if (!prefilled) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading deal data…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-[1920px] mx-auto px-12 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/marketplace/queue')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Queue
          </Button>
          <div className="text-sm font-medium text-foreground/70">
            Creating anonymous listing from:{' '}
            <strong>
              {((deal as Record<string, unknown> | null)?.internal_company_name as string) ||
                'Unknown Deal'}
            </strong>
          </div>
        </div>
      </div>
      {isGeneratingContent && (
        <div className="max-w-[1920px] mx-auto px-12">
          <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI is generating listing content (title, description, teaser)...
          </div>
        </div>
      )}
      {descriptionSource === 'anonymizer' && !isGeneratingContent && (
        <div className="max-w-[1920px] mx-auto px-12">
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 mb-4">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Placeholder description — not buyer-grade.</strong> The body below was
              auto-generated from deal fields and is not suitable for publication. To get a
              professional AI teaser: generate a <strong>Full Lead Memo</strong> from the Data Room
              first, then re-create this listing. The teaser will be written from the memo
              automatically.
            </div>
          </div>
        </div>
      )}
      <ImprovedListingEditor
        listing={prefilled}
        onSubmit={handleSubmit}
        isLoading={isCreating}
        sourceDealId={dealId}
      />
    </div>
  );
}
