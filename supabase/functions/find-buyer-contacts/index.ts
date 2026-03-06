import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { buyerId, peFirmWebsite, platformWebsite } = await req.json();

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let websites: string[] = [];
    let buyer: {
      id: string;
      company_name: string;
      pe_firm_website: string | null;
      company_website: string | null;
    } | null = null;

    // Get buyer info if buyerId provided (use buyers — the active schema)
    if (buyerId) {
      const { data, error } = await supabase
        .from('buyers')
        .select('id, company_name, pe_firm_website, company_website')
        .eq('id', buyerId)
        .single();

      if (error) throw error;
      buyer = data;

      if (buyer.pe_firm_website) websites.push(buyer.pe_firm_website);
      if (buyer.company_website) websites.push(buyer.company_website);
    }

    // Add provided websites
    if (peFirmWebsite) websites.push(peFirmWebsite);
    if (platformWebsite) websites.push(platformWebsite);

    // Dedupe
    websites = [...new Set(websites)].filter(Boolean);

    if (websites.length === 0) {
      return new Response(JSON.stringify({ error: 'No websites provided for contact discovery' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    interface DiscoveredContact {
      name: string;
      title?: string;
      email?: string | null;
      linkedin_url?: string | null;
      role_category?: string;
      source_url?: string;
    }
    const allContacts: DiscoveredContact[] = [];

    for (const website of websites) {
      try {
        console.log(`[find-buyer-contacts] Processing: ${website}`);

        // Step 1: Use Firecrawl Map API to find team pages
        const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: website,
            search: 'team leadership about people contact',
            limit: 10,
          }),
          signal: AbortSignal.timeout(15000),
        });

        let teamPages: string[] = [];
        if (mapResponse.ok) {
          const mapResult = await mapResponse.json();
          teamPages = mapResult.links || [];
          console.log(`[find-buyer-contacts] Found ${teamPages.length} potential team pages`);
        }

        // Filter to likely team/about pages
        const relevantPages = teamPages
          .filter((url) =>
            /team|leadership|about|people|staff|management|executives|partners/i.test(url),
          )
          .slice(0, 3);

        // Add homepage if no team pages found
        if (relevantPages.length === 0) {
          relevantPages.push(website);
        }

        // Step 2: Scrape relevant pages
        for (const pageUrl of relevantPages) {
          try {
            const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: pageUrl,
                formats: ['markdown'],
                onlyMainContent: true,
              }),
              signal: AbortSignal.timeout(15000),
            });

            if (!scrapeResponse.ok) continue;

            const scrapeResult = await scrapeResponse.json();
            const pageContent = scrapeResult.data?.markdown || '';

            if (pageContent.length < 100) continue;

            // Step 3: Extract contacts using AI
            const contacts = await extractContactsWithAI(pageContent, pageUrl, GEMINI_API_KEY);
            allContacts.push(...contacts);
          } catch (pageError) {
            console.error(`[find-buyer-contacts] Error scraping ${pageUrl}:`, pageError);
          }
        }
      } catch (websiteError) {
        console.error(`[find-buyer-contacts] Error processing ${website}:`, websiteError);
      }
    }

    // Dedupe contacts by name
    const uniqueContacts = dedupeContacts(allContacts);

    // Enrich contacts missing linkedin_url with LinkedIn search via Serper
    const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');
    if (SERPER_API_KEY && uniqueContacts.length > 0) {
      const companyName = buyer?.company_name || '';
      const contactsNeedingLinkedIn = uniqueContacts.filter((c) => !c.linkedin_url && c.name);

      if (contactsNeedingLinkedIn.length > 0) {
        console.log(
          `[find-buyer-contacts] Looking up LinkedIn profiles for ${contactsNeedingLinkedIn.length} contacts`,
        );

        // Limit to 5 lookups to avoid excessive API usage
        const lookupBatch = contactsNeedingLinkedIn.slice(0, 5);
        await Promise.allSettled(
          lookupBatch.map(async (contact) => {
            try {
              const linkedinUrl = await searchLinkedInProfile(contact.name, companyName);
              if (linkedinUrl) {
                contact.linkedin_url = linkedinUrl;
                console.log(
                  `[find-buyer-contacts] Found LinkedIn for ${contact.name}: ${linkedinUrl}`,
                );
              }
            } catch (err) {
              console.warn(
                `[find-buyer-contacts] LinkedIn lookup failed for ${contact.name}:`,
                err,
              );
            }
          }),
        );
      }
    }

    // Save contacts if buyerId provided — write to unified contacts table
    // (Audit P1: migrate from legacy remarketing_buyer_contacts to contacts)
    if (buyerId && uniqueContacts.length > 0) {
      for (const contact of uniqueContacts) {
        // Split name into first/last for unified contacts schema
        const nameParts = (contact.name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const { error: upsertError } = await supabase.from('contacts').upsert(
          {
            remarketing_buyer_id: buyerId,
            first_name: firstName,
            last_name: lastName,
            title: contact.title,
            email: contact.email,
            linkedin_url: contact.linkedin_url,
            contact_type: 'buyer',
            source: 'ai_discovery',
          },
          {
            onConflict: 'remarketing_buyer_id,first_name,last_name',
            ignoreDuplicates: false,
          },
        );
        if (upsertError) {
          console.error(
            `[find-buyer-contacts] Failed to save contact ${contact.name}:`,
            upsertError.message,
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        contacts: uniqueContacts,
        totalFound: uniqueContacts.length,
        websitesProcessed: websites.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('[find-buyer-contacts] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

async function extractContactsWithAI(
  content: string,
  sourceUrl: string,
  apiKey: string,
): Promise<
  {
    name: string;
    title?: string;
    email?: string | null;
    linkedin_url?: string | null;
    role_category?: string;
    source_url?: string;
  }[]
> {
  const systemPrompt = `You are an expert at extracting contact information from web pages. Extract all people mentioned with their roles.

Return JSON array only:
[{
  "name": "Full Name",
  "title": "Job Title",
  "email": "email@example.com or null",
  "linkedin_url": "linkedin profile url or null",
  "role_category": "deal_team" | "executive" | "operations" | "other"
}]

Role categories:
- deal_team: Partners, Directors, VPs, Principals involved in M&A
- executive: C-suite executives (CEO, CFO, COO)
- operations: Operations, HR, Finance staff
- other: Other roles

Only include people with clear names and titles. Return empty array if no contacts found.`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemini-2.0-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Extract contacts from this page:\n\n${content.substring(0, 8000)}`,
            },
          ],
          temperature: 0,
        }),
        signal: AbortSignal.timeout(20000),
      },
    );

    if (!response.ok) {
      console.error('AI extraction failed:', response.status);
      return [];
    }

    const result = await response.json();
    const responseContent = result.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const contacts = JSON.parse(jsonMatch[0]) as {
        name: string;
        title?: string;
        email?: string | null;
        linkedin_url?: string | null;
        role_category?: string;
      }[];
      return contacts.map((c) => ({ ...c, source_url: sourceUrl }));
    }

    return [];
  } catch (error) {
    console.error('AI extraction error:', error);
    return [];
  }
}

/**
 * Search for a person's LinkedIn profile URL using Serper (Google Search API).
 * Returns the first matching linkedin.com/in/ URL or null.
 */
async function searchLinkedInProfile(
  personName: string,
  companyName: string,
): Promise<string | null> {
  const searchQuery = `site:linkedin.com/in "${personName}" "${companyName}"`;
  const apiKey = Deno.env.get('SERPER_API_KEY');
  if (!apiKey) return null;

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: searchQuery, num: 3, gl: 'us', hl: 'en' }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const results = data.organic || [];

    for (const result of results) {
      const url = result.link || '';
      if (
        url.includes('linkedin.com/in/') &&
        !url.includes('/posts') &&
        !url.includes('/activity')
      ) {
        // Normalize: https://www.linkedin.com/in/slug
        const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
        if (match) {
          return `https://www.linkedin.com/in/${match[1]}`;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

interface DedupeContact {
  name: string;
  title?: string;
  email?: string | null;
  linkedin_url?: string | null;
  role_category?: string;
  source_url?: string;
}

function dedupeContacts(contacts: DedupeContact[]): DedupeContact[] {
  const seen = new Map<string, DedupeContact>();

  for (const contact of contacts) {
    const key = contact.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, contact);
    } else {
      const existing = seen.get(key)!;
      if (!existing.email && contact.email) existing.email = contact.email;
      if (!existing.linkedin_url && contact.linkedin_url)
        existing.linkedin_url = contact.linkedin_url;
      if (!existing.title && contact.title) existing.title = contact.title;
    }
  }

  return Array.from(seen.values());
}
