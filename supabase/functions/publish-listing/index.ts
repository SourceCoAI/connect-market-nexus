import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

interface PublishRequest {
  listingId: string;
  action: 'publish' | 'unpublish';
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Minimum quality requirements for marketplace publishing.
// PDF memos are stored in data_room_documents, not on the listing itself,
// so they must be checked separately via checkMemoPdfs().
function validateListingQuality(listing: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const title = listing.title as string | undefined;
  const description = listing.description as string | undefined;
  const executiveSummary = listing.executive_summary as string | undefined;
  const category = listing.category as string | undefined;
  const categories = listing.categories as string[] | undefined;
  const location = listing.location as string | undefined;

  // Fall back to executive_summary when description is missing
  const effectiveDescription = (description && description.trim().length >= 50)
    ? description
    : executiveSummary;

  if (!effectiveDescription || effectiveDescription.trim().length < 50) {
    errors.push('Description (or executive summary) must be at least 50 characters');
  }

  if (!category && (!categories || categories.length === 0)) {
    errors.push('At least one category is required');
  }

  if (!location) {
    errors.push('Location is required');
  }

  if (typeof listing.revenue !== 'number' || (listing.revenue as number) <= 0) {
    errors.push('Revenue must be a positive number');
  }

  if (typeof listing.ebitda !== 'number') {
    errors.push('EBITDA is required');
  }

  // Image is optional — marketplace cards handle missing images with placeholders

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Check that the source deal (or the listing itself) has both memo PDFs
// uploaded in data_room_documents.
async function checkMemoPdfs(
  supabaseAdmin: SupabaseClient,
  listingId: string,
  sourceDealId: string | null,
): Promise<string[]> {
  const errors: string[] = [];
  // PDFs may be attached to the source deal or to the listing itself
  const dealId = sourceDealId || listingId;

  const { data: docs } = await supabaseAdmin
    .from('data_room_documents')
    .select('document_category, storage_path')
    .eq('deal_id', dealId)
    .in('document_category', ['full_memo', 'anonymous_teaser']);

  const hasLeadMemo = docs?.some(
    (d: { document_category: string; storage_path: string | null }) => d.document_category === 'full_memo' && d.storage_path,
  );
  const hasTeaser = docs?.some(
    (d: { document_category: string; storage_path: string | null }) => d.document_category === 'anonymous_teaser' && d.storage_path,
  );

  if (!hasLeadMemo) {
    errors.push('A Lead Memo PDF is required for marketplace listings');
  }
  if (!hasTeaser) {
    errors.push('A Teaser PDF is required for marketplace listings');
  }

  return errors;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user client to verify auth
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin status via user_roles table (authoritative RBAC source)
    const { data: isAdmin, error: adminCheckError } = await supabaseAdmin.rpc('is_admin', { user_id: user.id });
    if (adminCheckError || !isAdmin) {
      console.error('Admin check failed:', adminCheckError);
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: PublishRequest = await req.json();
    const { listingId, action } = body;

    if (!listingId) {
      return new Response(
        JSON.stringify({ error: 'listingId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the listing
    const { data: listing, error: fetchError } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (fetchError || !listing) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Listing not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'publish') {
      // Check if already published
      if (listing.is_internal_deal === false && listing.published_at) {
        return new Response(
          JSON.stringify({ success: false, error: 'Listing is already published' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate quality requirements (listing fields + memo PDFs)
      const validation = validateListingQuality(listing);
      const pdfErrors = await checkMemoPdfs(supabaseAdmin, listingId, listing.source_deal_id);
      const allErrors = [...validation.errors, ...pdfErrors];

      if (allErrors.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Listing does not meet quality requirements',
            validationErrors: allErrors
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Publish the listing
      const { data: updatedListing, error: updateError } = await supabaseAdmin
        .from('listings')
        .update({
          is_internal_deal: false,
          published_at: new Date().toISOString(),
          published_by_admin_id: user.id,
          status: 'active',
        })
        .eq('id', listingId)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to publish listing' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Listing ${listingId} published by admin ${user.id}`);

      // Phase 64: Auto-cleanup — if this listing was created from a deal in the
      // marketplace queue, clear the source deal's pushed_to_marketplace flag so
      // it no longer appears in the queue.
      if (listing.source_deal_id) {
        const { error: cleanupError } = await supabaseAdmin
          .from('listings')
          .update({ pushed_to_marketplace: false })
          .eq('id', listing.source_deal_id);

        if (cleanupError) {
          console.warn(`Queue cleanup failed for source deal ${listing.source_deal_id}:`, cleanupError.message);
          // Non-blocking — publish still succeeds
        } else {
          console.log(`Queue cleanup: source deal ${listing.source_deal_id} removed from queue`);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Listing published to marketplace',
          listing: updatedListing 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'unpublish') {
      // Unpublish - revert to internal
      const { data: updatedListing, error: updateError } = await supabaseAdmin
        .from('listings')
        .update({
          is_internal_deal: true,
          status: 'inactive',
          // Keep published_at and published_by for audit trail
        })
        .eq('id', listingId)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to unpublish listing' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Listing ${listingId} unpublished by admin ${user.id}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Listing removed from marketplace',
          listing: updatedListing 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use "publish" or "unpublish"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
