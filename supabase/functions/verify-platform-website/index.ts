import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

interface WebsiteClassification {
  url: string;
  classification: 'operating_company' | 'pe_firm' | 'unknown';
  confidence: number;
  indicators: string[];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { urls } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'urls array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'FIRECRAWL_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: WebsiteClassification[] = [];

    for (const url of urls.slice(0, 10)) { // Limit to 10 URLs
      try {
        console.log(`[verify-platform-website] Checking: ${url}`);

        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
            timeout: 15000,
          }),
        });

        if (!scrapeResponse.ok) {
          results.push({
            url,
            classification: 'unknown',
            confidence: 0,
            indicators: ['Failed to scrape website']
          });
          continue;
        }

        const scrapeResult = await scrapeResponse.json();
        const content = (scrapeResult.data?.markdown || '').toLowerCase();
        const title = (scrapeResult.data?.metadata?.title || '').toLowerCase();

        const classification = classifyWebsite(content, title, url);
        results.push({ url, ...classification });

      } catch (urlError) {
        console.error(`[verify-platform-website] Error processing ${url}:`, urlError);
        results.push({
          url,
          classification: 'unknown',
          confidence: 0,
          indicators: ['Error processing website']
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[verify-platform-website] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function classifyWebsite(content: string, title: string, url: string): {
  classification: 'operating_company' | 'pe_firm' | 'unknown';
  confidence: number;
  indicators: string[];
} {
  const indicators: string[] = [];
  let peScore = 0;
  let platformScore = 0;

  // PE Firm indicators
  const peKeywords = [
    'private equity', 'investment firm', 'portfolio companies', 'fund',
    'capital partners', 'equity partners', 'management buyout', 'lbo',
    'leveraged buyout', 'acquisition strategy', 'growth equity',
    'institutional investors', 'committed capital', 'aum', 'assets under management'
  ];

  for (const keyword of peKeywords) {
    if (content.includes(keyword) || title.includes(keyword)) {
      peScore += 10;
      indicators.push(`PE keyword: "${keyword}"`);
    }
  }

  // Platform/Operating company indicators
  const platformKeywords = [
    'our services', 'contact us', 'get a quote', 'schedule service',
    'locations', 'service area', 'our team', 'careers', 'job openings',
    'customer reviews', 'testimonials', 'pricing', 'request estimate',
    'book now', 'free consultation', 'about our company', 'our history'
  ];

  for (const keyword of platformKeywords) {
    if (content.includes(keyword) || title.includes(keyword)) {
      platformScore += 8;
      indicators.push(`Platform keyword: "${keyword}"`);
    }
  }

  // URL patterns
  if (/capital|partners|equity|ventures|fund|invest/i.test(url)) {
    peScore += 15;
    indicators.push('PE-style URL pattern');
  }

  // Service industry patterns (platform indicators)
  const servicePatterns = [
    'hvac', 'plumbing', 'roofing', 'landscaping', 'electrical',
    'pest control', 'cleaning', 'restoration', 'remodeling',
    'construction', 'home services', 'commercial services'
  ];

  for (const pattern of servicePatterns) {
    if (content.includes(pattern) || url.includes(pattern)) {
      platformScore += 12;
      indicators.push(`Service industry: "${pattern}"`);
    }
  }

  // Determine classification
  const totalScore = peScore + platformScore;
  let classification: 'operating_company' | 'pe_firm' | 'unknown';
  let confidence: number;

  if (totalScore < 20) {
    classification = 'unknown';
    confidence = 0.3;
  } else if (peScore > platformScore * 1.5) {
    classification = 'pe_firm';
    confidence = Math.min(0.95, 0.5 + (peScore / 100));
  } else if (platformScore > peScore * 1.5) {
    classification = 'operating_company';
    confidence = Math.min(0.95, 0.5 + (platformScore / 100));
  } else {
    classification = 'unknown';
    confidence = 0.4;
    indicators.push('Mixed signals - needs manual review');
  }

  return {
    classification,
    confidence: Math.round(confidence * 100) / 100,
    indicators: indicators.slice(0, 5) // Limit to top 5 indicators
  };
}
