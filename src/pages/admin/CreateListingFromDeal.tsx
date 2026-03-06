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
          customer_geography, customer_types, end_market_description
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
        internal_deal_memo_link: (deal as Record<string, unknown>).website as string || deal.internal_deal_memo_link || '',
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
  const [descriptionSource, setDescriptionSource] = useState<
    'loading' | 'teaser' | 'anonymizer'
  >('loading');

  // Auto-trigger AI content generation when prefilled data is ready.
  // Priority: 1) Call generate-marketplace-listing (dedicated, buyer-grade)  2) Anonymizer fallback
  useEffect(() => {
    if (!prefilled || !dealId || contentGenerationTriggered.current) return;
    if (prefilled.custom_sections && (prefilled.custom_sections as unknown[]).length > 0) return;
    contentGenerationTriggered.current = true;
    setIsGeneratingContent(true);

    (async () => {
      try {
        // Step 1: Check that Final PDFs exist for both memo types
        // The Final PDF (uploaded to data_room_documents) is the authoritative,
        // reviewed document. Both must be present before generating a listing.
        const { data: finalPdfs } = await supabase
          .from('data_room_documents')
          .select('document_category')
          .eq('deal_id', dealId)
          .in('document_category', ['full_memo', 'anonymous_teaser'])
          .eq('status', 'active');

        const hasFinalLeadMemo = finalPdfs?.some((d) => d.document_category === 'full_memo');
        const hasFinalTeaser = finalPdfs?.some((d) => d.document_category === 'anonymous_teaser');

        if (!hasFinalLeadMemo || !hasFinalTeaser) {
          const missing = [];
          if (!hasFinalLeadMemo) missing.push('Full Lead Memo');
          if (!hasFinalTeaser) missing.push('Anonymous Teaser');
          setDescriptionSource('anonymizer');
          toast.warning(
            `Final PDF missing for: ${missing.join(' and ')}. Upload Final PDFs in the Data Room before creating a listing.`,
            { duration: 8000 },
          );
          return;
        }

        // Step 2: Call the dedicated marketplace listing generator
        console.log('[CreateListingFromDeal] Calling generate-marketplace-listing for deal_id:', dealId);
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
              } else if (typeof ctx === 'object' && ctx !== null && 'error' in (ctx as Record<string, unknown>)) {
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

          console.error('[CreateListingFromDeal] generate-marketplace-listing failed:', errorDetail);
          setDescriptionSource('anonymizer');
          toast.info('AI content generation could not complete. You can fill in content manually.');
          return;
        }

        // Step 3: Set the HTML description in the editor
        console.log('[CreateListingFromDeal] AI listing description generated successfully');
        setPrefilled((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            description_html: data.description_html,
            description: data.description_markdown,
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
      const listingData = {
        ...data,
        source_deal_id: dealId,
        // Ensure it's created as an internal draft
        is_internal_deal: true,
      };

      await createListing({ listing: listingData as never, image });

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
