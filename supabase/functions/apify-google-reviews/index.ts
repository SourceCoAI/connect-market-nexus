import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { searchGoogleMaps, parseAddress } from '../_shared/serper-client.ts';
import type { GoogleMapsPlace } from '../_shared/serper-client.ts';

interface GooglePlaceData {
  title?: string;
  totalScore?: number; // Google rating (e.g., 4.5)
  reviewsCount?: number; // Number of reviews
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  website?: string;
  categoryName?: string;
  placeId?: string;
  url?: string; // Google Maps URL
  temporarilyClosed?: boolean;
  permanentlyClosed?: boolean;
}

/** Convert Serper GoogleMapsPlace to the internal GooglePlaceData shape. */
function toPlaceData(place: GoogleMapsPlace): GooglePlaceData {
  const parsed = parseAddress(place.address || '');
  const mapsUrl = place.cid
    ? `https://www.google.com/maps?cid=${place.cid}`
    : place.placeId
      ? `https://www.google.com/maps/place/?q=place_id:${place.placeId}`
      : null;

  return {
    title: place.title,
    totalScore: place.rating,
    reviewsCount: place.ratingCount,
    address: place.address,
    city: parsed.city,
    state: parsed.state,
    postalCode: parsed.postalCode,
    phone: place.phoneNumber,
    website: place.website,
    categoryName: place.category,
    placeId: place.placeId,
    url: mapsUrl || undefined,
    temporarilyClosed: false,
    permanentlyClosed: false,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');

    if (!SERPER_API_KEY) {
      console.error('SERPER_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Serper API key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const {
      businessName,
      address,
      city,
      state,
      googleMapsUrl,
      dealId,
      scrapeAll, // If true, scrape all deals needing Google data
    } = await req.json();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // If scrapeAll is true, fetch all deals that need Google review data
    if (scrapeAll) {
      const { data: deals, error: fetchError } = await supabase
        .from('listings')
        .select('id, title, internal_company_name, location, address, address_city, address_state')
        .is('google_review_count', null)
        .eq('status', 'active')
        .limit(50); // Process in batches of 50

      if (fetchError) {
        throw new Error(`Failed to fetch deals: ${fetchError.message}`);
      }

      if (!deals || deals.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'All deals already have Google review data',
            scraped: 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      console.log(`Scraping Google reviews for ${deals.length} deals...`);

      let scraped = 0;
      let errors = 0;

      for (const deal of deals) {
        try {
          const companyName = deal.internal_company_name || deal.title;
          // Prefer structured city/state over legacy address
          const location =
            deal.address_city && deal.address_state
              ? `${deal.address_city}, ${deal.address_state}`
              : deal.address || deal.location;

          if (!companyName) {
            console.log(`Skipping deal ${deal.id} - no company name`);
            continue;
          }

          // Build search query - company name + location is best for Google search
          const searchQuery = location ? `${companyName} ${location}` : companyName;

          const result = await scrapeGooglePlace(searchQuery);

          if (result.success && result.data) {
            const updateData: Record<string, unknown> = {
              google_review_count: result.data.reviewsCount || 0,
              google_rating: result.data.totalScore || null,
              google_maps_url: result.data.url || null,
              google_place_id: result.data.placeId || null,
            };

            // Update address if we don't have one
            if (!deal.address && result.data.address) {
              updateData.address = result.data.address;
            }

            // Update structured address fields if we have them from Google (only if not already set)
            if (result.data.city && !deal.address_city) {
              updateData.address_city = result.data.city;
            }
            if (result.data.state && !deal.address_state) {
              updateData.address_state = result.data.state;
            }
            if (result.data.postalCode) {
              updateData.address_zip = result.data.postalCode;
            }

            const { error: updateError } = await supabase
              .from('listings')
              .update(updateData)
              .eq('id', deal.id);

            if (updateError) {
              console.error(`Error updating deal ${deal.id}:`, updateError);
              errors++;
            } else {
              console.log(
                `Updated deal ${deal.id}: ${result.data.reviewsCount} reviews, ${result.data.totalScore} rating`,
              );
              scraped++;
            }
          } else {
            // Mark as scraped but with 0 reviews (so we don't retry)
            const { error: zeroError } = await supabase
              .from('listings')
              .update({ google_review_count: 0 })
              .eq('id', deal.id);
            if (zeroError) {
              console.error(`Error marking deal ${deal.id} with 0 reviews:`, zeroError);
              errors++;
            }
          }

          // Rate limit - wait 1 second between scrapes (Serper is faster than Apify)
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (dealError) {
          console.error(`Error scraping deal ${deal.id}:`, dealError);
          errors++;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Scraped ${scraped} deals, ${errors} errors`,
          scraped,
          errors,
          total: deals.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Single deal scrape
    if (!businessName && !googleMapsUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Either businessName or googleMapsUrl is required',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Build search query
    let searchQuery: string;
    if (googleMapsUrl) {
      // Try to extract business name from Google Maps URL path
      // URLs look like: https://www.google.com/maps/place/Business+Name/...
      const placeMatch = googleMapsUrl.match(/\/maps\/place\/([^/]+)/);
      if (placeMatch) {
        searchQuery = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      } else if (businessName) {
        searchQuery = [businessName, city, state].filter(Boolean).join(', ');
      } else {
        // Fall back to using the URL as a search query (may not work well but best effort)
        searchQuery = googleMapsUrl;
      }
    } else {
      searchQuery = [businessName, city, state].filter(Boolean).join(', ');
      if (address) {
        searchQuery = `${businessName} ${address}`;
      }
    }

    console.log(`Scraping Google reviews for: ${searchQuery}`);

    const result = await scrapeGooglePlace(searchQuery);

    if (!result.success) {
      return new Response(JSON.stringify(result), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const placeData = result.data!;

    const response = {
      success: true,
      scraped: true,
      google_review_count: placeData.reviewsCount || 0,
      google_rating: placeData.totalScore || null,
      google_maps_url: placeData.url || null,
      google_address: placeData.address || null,
      google_city: placeData.city || null,
      google_state: placeData.state || null,
      google_phone: placeData.phone || null,
      google_website: placeData.website || null,
      google_category: placeData.categoryName || null,
      google_place_id: placeData.placeId || null,
      is_closed: placeData.permanentlyClosed || placeData.temporarilyClosed || false,
    };

    // If dealId is provided, update the listing directly
    if (dealId) {
      const updateData: Record<string, unknown> = {
        google_review_count: response.google_review_count,
        google_rating: response.google_rating,
        google_maps_url: response.google_maps_url,
        google_place_id: response.google_place_id,
      };

      // Optionally update address fields if they're empty (phone column doesn't exist)
      if (response.google_address) {
        updateData.address = response.google_address;
      }
      // Update structured address fields from Google
      if (response.google_city) {
        updateData.address_city = response.google_city;
      }
      if (response.google_state) {
        updateData.address_state = response.google_state;
      }

      const { error: updateError } = await supabase
        .from('listings')
        .update(updateData)
        .eq('id', dealId);

      if (updateError) {
        console.error('Error updating listing with Google data:', updateError);
      } else {
        console.log(`Updated deal ${dealId} with Google review data`);
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in apify-google-reviews:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function scrapeGooglePlace(
  searchQuery: string,
): Promise<{ success: boolean; data?: GooglePlaceData; error?: string }> {
  try {
    const place = await searchGoogleMaps(searchQuery);

    if (!place) {
      console.log('No Google Place data found');
      return {
        success: false,
        error: 'No business found on Google Maps',
      };
    }

    const placeData = toPlaceData(place);
    console.log(
      'Google Place data:',
      JSON.stringify({
        title: placeData.title,
        rating: placeData.totalScore,
        reviews: placeData.reviewsCount,
        address: placeData.address,
      }),
    );

    return {
      success: true,
      data: placeData,
    };
  } catch (fetchError) {
    console.error('Error calling Serper:', fetchError);
    return {
      success: false,
      error: fetchError instanceof Error ? fetchError.message : 'Network error',
    };
  }
}
