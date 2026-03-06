import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ImprovedListingEditor } from '@/components/admin/ImprovedListingEditor';
import { useRobustListingCreation } from '@/hooks/admin/listings/use-robust-listing-creation';
import {
  anonymizeDealToListing,
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

  // Auto-trigger AI content generation when prefilled data is ready.
  // Uses generate-teaser (reads a completed lead memo) for higher-quality
  // output without raw transcript leakage. Falls back to generate-lead-memo
  // if no lead memo exists yet.
  useEffect(() => {
    if (!prefilled || !dealId || contentGenerationTriggered.current) return;
    if (prefilled.custom_sections && (prefilled.custom_sections as unknown[]).length > 0) return;
    contentGenerationTriggered.current = true;
    setIsGeneratingContent(true);

    (async () => {
      try {
        // Try generate-teaser first — it reads a completed lead memo (no raw
        // transcript fragments) and produces a properly structured teaser.
        const { data, error } = await supabase.functions.invoke('generate-teaser', {
          body: { deal_id: dealId },
        });

        if (error) {
          const errorMsg =
            typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : '';
          // If a lead memo doesn't exist yet, tell the user
          if (
            errorMsg.includes('Lead memo must be generated') ||
            errorMsg.includes('lead memo')
          ) {
            toast.info(
              'A Full Lead Memo must be generated before creating the listing teaser. Generate it from the Data Room, then retry.',
            );
          } else {
            toast.info(
              'AI content generation could not complete. You can fill in content manually.',
            );
            console.error('generate-teaser failed:', error);
          }
          return;
        }

        // Response shape: { success: true, teaser: { content: { sections: [...] } }, validation }
        const sections = data?.teaser?.content?.sections;

        if (sections && Array.isArray(sections) && sections.length > 0) {
          const contentSections = sections.filter(
            (s: { key: string }) => s.key !== 'header_block' && s.key !== 'contact_information',
          );

          applyTeaserSections(contentSections);

          const validation = data?.validation;
          if (validation && !validation.pass) {
            toast.warning(
              'AI content generated with validation warnings — review carefully before saving.',
            );
          } else {
            toast.success('AI content generated — review and edit before saving.');
          }
        } else {
          toast.info(
            'AI generation returned no content sections. You can fill in content manually.',
          );
        }
      } catch (err) {
        console.error('AI content generation error:', err);
        toast.info('AI content generation could not complete. You can fill in content manually.');
      } finally {
        setIsGeneratingContent(false);
      }
    })();
  }, [prefilled, dealId]);

  /** Convert teaser sections into HTML description and update prefilled state */
  function applyTeaserSections(
    contentSections: { key: string; title: string; content: string }[],
  ) {
    // Build HTML so the rich text editor renders properly (not raw markdown)
    const descriptionHtml = contentSections
      .map((s) => {
        const htmlContent = markdownSectionToHtml(s.content);
        return `<h2>${s.title}</h2>${htmlContent}`;
      })
      .join('');

    // Plain text fallback for the description field
    const plainText = contentSections
      .map((s) => `${s.title}\n\n${s.content}`)
      .join('\n\n');

    setPrefilled((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        custom_sections: [],
        description: plainText || prev.description,
        description_html: descriptionHtml,
      };
    });
  }

  /** Lightweight markdown → HTML for teaser section content */
  function markdownSectionToHtml(md: string): string {
    return md
      // Convert bullet lists (groups of lines starting with "- ")
      .replace(/(?:^|\n)((?:- .+(?:\n|$))+)/g, (_match, list: string) => {
        const items = list
          .split('\n')
          .filter((l: string) => l.trim().startsWith('- '))
          .map((l: string) => `<li>${l.trim().replace(/^- /, '')}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      })
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Remaining double-newline blocks → paragraphs
      .split(/\n\n+/)
      .map((block: string) => {
        const trimmed = block.trim();
        if (!trimmed || trimmed.startsWith('<ul>') || trimmed.startsWith('<li>')) return trimmed;
        return `<p>${trimmed}</p>`;
      })
      .join('');
  }

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
      <ImprovedListingEditor
        listing={prefilled}
        onSubmit={handleSubmit}
        isLoading={isCreating}
        sourceDealId={dealId}
      />
    </div>
  );
}
