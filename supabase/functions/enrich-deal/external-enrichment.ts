/**
 * External Enrichment Module for enrich-deal
 *
 * Handles Step 4: External data enrichment from third-party sources.
 * - LinkedIn company data via Apify
 * - Google Reviews via Apify
 *
 * Extracted from enrich-deal/index.ts to reduce monolith size.
 * All functionality is preserved — this is a pure extraction.
 */

/**
 * Enrich deal with LinkedIn company data.
 * Non-blocking: failures are logged but don't stop enrichment.
 */
export async function enrichLinkedIn(
  supabaseUrl: string,
  supabaseAnonKey: string,
  supabaseServiceKey: string,
  dealId: string,
  extracted: Record<string, unknown>,
  deal: Record<string, unknown>,
  websiteUrl: string | null,
): Promise<void> {
  const linkedinUrl = extracted.linkedin_url as string | undefined;
  const companyName = (extracted.internal_company_name ||
    deal.internal_company_name ||
    deal.title) as string | undefined;

  if (!linkedinUrl && !companyName) return;

  // Skip if LinkedIn was already successfully scraped within the last 6 months
  const LINKEDIN_COOLDOWN_DAYS = 180;
  if (deal.linkedin_verified_at && deal.linkedin_match_confidence !== 'failed') {
    const lastScraped = new Date(deal.linkedin_verified_at as string);
    const daysSinceLastScrape = (Date.now() - lastScraped.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastScrape < LINKEDIN_COOLDOWN_DAYS) {
      console.log(
        `Skipping LinkedIn enrichment for deal ${dealId}: ` +
          `last scraped ${Math.round(daysSinceLastScrape)} days ago ` +
          `(cooldown: ${LINKEDIN_COOLDOWN_DAYS} days, confidence: ${deal.linkedin_match_confidence})`,
      );
      return;
    }
    console.log(
      `LinkedIn data is stale for deal ${dealId}: ` +
        `last scraped ${Math.round(daysSinceLastScrape)} days ago — re-scraping`,
    );
  }

  try {
    console.log(`Attempting LinkedIn enrichment for: ${linkedinUrl || companyName}`);

    const linkedinResponse = await fetch(`${supabaseUrl}/functions/v1/apify-linkedin-scrape`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'x-internal-secret': supabaseServiceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        linkedinUrl,
        companyName,
        city: extracted.address_city || deal.address_city,
        state: extracted.address_state || deal.address_state,
        dealId: dealId,
        companyWebsite: websiteUrl || deal.website,
      }),
      signal: AbortSignal.timeout(30000), // 30s — must fit within 90s per-item budget
    });

    if (linkedinResponse.ok) {
      const linkedinData = await linkedinResponse.json();
      if (linkedinData.success && linkedinData.scraped) {
        console.log('LinkedIn data retrieved:', linkedinData);
        if (linkedinData.linkedin_employee_count) {
          extracted.linkedin_employee_count = linkedinData.linkedin_employee_count;
        }
        if (linkedinData.linkedin_employee_range) {
          extracted.linkedin_employee_range = linkedinData.linkedin_employee_range;
        }
        if (linkedinData.linkedin_url) {
          extracted.linkedin_url = linkedinData.linkedin_url;
        }
      } else {
        console.log('LinkedIn scrape returned no data:', linkedinData.error || 'No company found');
      }
    } else {
      console.warn('LinkedIn scrape failed:', linkedinResponse.status);
    }
  } catch (linkedinError) {
    console.warn('LinkedIn enrichment failed (non-blocking):', linkedinError);
  }
}

/**
 * Enrich deal with Google Reviews data.
 * Non-blocking: failures are logged but don't stop enrichment.
 */
export async function enrichGoogleReviews(
  supabaseUrl: string,
  supabaseAnonKey: string,
  supabaseServiceKey: string,
  dealId: string,
  extracted: Record<string, unknown>,
  deal: Record<string, unknown>,
): Promise<void> {
  const companyName = (extracted.internal_company_name ||
    deal.internal_company_name ||
    deal.title) as string | undefined;

  const googleSearchName = companyName || deal.title;
  const _googleLocation =
    extracted.address_city && extracted.address_state
      ? `${extracted.address_city}, ${extracted.address_state}`
      : deal.address_city && deal.address_state
        ? `${deal.address_city}, ${deal.address_state}`
        : deal.location;

  if (!googleSearchName || deal.google_review_count) return;

  try {
    console.log(`Attempting Google reviews enrichment for: ${googleSearchName}`);

    const googleResponse = await fetch(`${supabaseUrl}/functions/v1/apify-google-reviews`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'x-internal-secret': supabaseServiceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        businessName: googleSearchName,
        city: extracted.address_city || deal.address_city,
        state: extracted.address_state || deal.address_state,
        dealId: dealId,
      }),
      signal: AbortSignal.timeout(30000), // 30s — must fit within 90s per-item budget
    });

    if (googleResponse.ok) {
      const googleData = await googleResponse.json();
      if (googleData.success && googleData.scraped) {
        console.log('Google reviews data retrieved:', googleData);
      } else {
        console.log(
          'Google reviews scrape returned no data:',
          googleData.error || 'No business found',
        );
      }
    } else {
      console.warn('Google reviews scrape failed:', googleResponse.status);
    }
  } catch (googleError) {
    console.warn('Google reviews enrichment failed (non-blocking):', googleError);
  }
}
