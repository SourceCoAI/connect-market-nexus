/**
 * Website Scraping Module for enrich-deal
 *
 * Handles Step 1: Website URL resolution and content scraping via Firecrawl.
 * - URL resolution from deal fields
 * - SSRF validation
 * - Homepage scraping via Firecrawl API
 * - Content validation
 *
 * Extracted from enrich-deal/index.ts to reduce monolith size.
 * All functionality is preserved — this is a pure extraction.
 */

import { validateUrl } from '../_shared/security.ts';
import { DEAL_SCRAPE_TIMEOUT_MS, WEBSITE_PLACEHOLDERS } from '../_shared/deal-extraction.ts';

function isLoginWallContent(content: string): boolean {
  const loginIndicators = [
    /\bsign\s*in\b/i,
    /\blog\s*in\b/i,
    /\bpassword\b/i,
    /\bauthentication\s*required\b/i,
    /\baccess\s*denied\b/i,
    /\b403\s*forbidden\b/i,
    /\bcaptcha\b/i,
    /\bverify\s*you\s*are\s*human\b/i,
  ];
  const matches = loginIndicators.filter(re => re.test(content));
  // If 2+ indicators match and content is relatively short, likely a login wall
  return matches.length >= 2 && content.length < 2000;
}

export interface ScrapeResult {
  url: string;
  content: string;
  success: boolean;
}

export interface WebsiteScrapingResult {
  websiteUrl: string | null;
  websiteContent: string;
  scrapedPages: ScrapeResult[];
  successfulScrapes: ScrapeResult[];
  error?: string;
  errorStatus?: number;
}

/**
 * Resolve the best website URL from deal fields.
 * Returns null if no valid URL is found.
 */
export function resolveWebsiteUrl(deal: Record<string, unknown>): string | null {
  let websiteUrl = deal.website as string | null;

  // Reject email addresses stored in website field
  if (websiteUrl && websiteUrl.includes('@')) {
    console.log(`[Website] Rejecting email address in website field: "${websiteUrl}"`);
    websiteUrl = null;
  }

  // Reject placeholder values
  if (websiteUrl && WEBSITE_PLACEHOLDERS.includes(websiteUrl.trim().toLowerCase())) {
    console.log(`[Website] Rejecting placeholder website value: "${websiteUrl}"`);
    websiteUrl = null;
  }

  // Try to extract from internal_deal_memo_link
  if (!websiteUrl && deal.internal_deal_memo_link) {
    const memoLink = String(deal.internal_deal_memo_link);
    if (!memoLink.includes('sharepoint.com') && !memoLink.includes('onedrive')) {
      const websiteMatch = memoLink.match(/Website:\s*(https?:\/\/[^\s]+)/i);
      if (websiteMatch) {
        websiteUrl = websiteMatch[1];
      } else if (memoLink.match(/^https?:\/\/[a-zA-Z0-9]/)) {
        websiteUrl = memoLink;
      } else if (memoLink.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/)) {
        websiteUrl = `https://${memoLink}`;
      }
    }
  }

  if (!websiteUrl) return null;

  // Handle multiple comma-separated URLs
  if (websiteUrl.includes(',')) {
    const urls = websiteUrl
      .split(',')
      .map((u: string) => u.trim())
      .filter(Boolean);
    websiteUrl = urls[0];
    console.log(`Multiple URLs detected, using first: "${websiteUrl}" (from ${urls.length} URLs)`);
  }

  // Normalize malformed protocols (e.g. "htpps://", "htp://") before the prefix check
  websiteUrl = websiteUrl.replace(/^[a-z]{3,6}:\/\//i, (match: string) => {
    if (match === 'http://' || match === 'https://') return match;
    console.log(`[Website] Normalizing malformed protocol "${match}" → "https://"`);
    return 'https://';
  });

  // Ensure https prefix
  if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
    websiteUrl = `https://${websiteUrl}`;
  }

  return websiteUrl;
}

/**
 * Validate URL against SSRF attacks.
 * Returns the normalized URL or an error.
 */
export function validateWebsiteUrl(websiteUrl: string): {
  valid: boolean;
  normalizedUrl?: string;
  reason?: string;
} {
  const urlValidation = validateUrl(websiteUrl);
  if (!urlValidation.valid) {
    console.error(`SSRF blocked for deal website: ${websiteUrl} - ${urlValidation.reason}`);
    return { valid: false, reason: urlValidation.reason || 'blocked by security policy' };
  }
  return { valid: true, normalizedUrl: urlValidation.normalizedUrl || websiteUrl };
}

/**
 * Scrape a single page via Firecrawl API.
 */
async function scrapePage(url: string, firecrawlApiKey: string): Promise<ScrapeResult> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 1000,
      }),
      signal: AbortSignal.timeout(DEAL_SCRAPE_TIMEOUT_MS),
    });

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        /* ignored */
      }
      console.error(
        `Firecrawl scrape failed for ${url}: HTTP ${response.status} — ${errorBody.slice(0, 300)}`,
      );
      return { url, content: '', success: false };
    }

    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';

    if (isLoginWallContent(content)) {
      console.warn(`Login wall detected for ${url}, skipping`);
      return { url, content: '', success: false };
    }

    return { url, content, success: content.length > 200 };
  } catch (err) {
    console.error(
      `Firecrawl scrape exception for ${url}:`,
      err instanceof Error ? err.message : err,
    );
    return { url, content: '', success: false };
  }
}

// Subpage path patterns worth scraping for deal intelligence
const SUBPAGE_PATTERNS = [
  /^\/(about|about-us|who-we-are|our-story|company)/i,
  /^\/(services|our-services|what-we-do|solutions|capabilities)/i,
  /^\/(team|our-team|leadership|management|staff|people)/i,
  /^\/(contact|contact-us|locations|our-locations|branches|offices)/i,
  /^\/(industries|markets|sectors|industries-served)/i,
  /^\/(projects|portfolio|case-studies|work|our-work)/i,
];

const MAX_SUBPAGES = 3;
const SUBPAGE_TIMEOUT_MS = 10000; // 10s per subpage

/**
 * Extract internal links from scraped markdown content and return
 * up to MAX_SUBPAGES high-value subpage URLs.
 */
function extractSubpageUrls(homepageContent: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const found = new Set<string>();

  // Match markdown links: [text](url)
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(homepageContent)) !== null) {
    const href = match[2];
    try {
      const resolved = new URL(href, baseUrl);
      // Only same-host links
      if (resolved.hostname !== base.hostname) continue;
      const path = resolved.pathname;
      // Skip homepage, anchors, files
      if (path === '/' || path === '') continue;
      if (/\.(pdf|jpg|jpeg|png|gif|svg|css|js|xml|zip)$/i.test(path)) continue;

      if (SUBPAGE_PATTERNS.some((pattern) => pattern.test(path))) {
        found.add(resolved.origin + resolved.pathname);
      }
    } catch {
      /* skip malformed URLs */
    }
  }

  // Also try matching bare href="..." patterns (in case markdown has raw HTML)
  const hrefRegex = /href=["']([^"']+)["']/g;
  while ((match = hrefRegex.exec(homepageContent)) !== null) {
    const href = match[1];
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname !== base.hostname) continue;
      const path = resolved.pathname;
      if (path === '/' || path === '') continue;
      if (/\.(pdf|jpg|jpeg|png|gif|svg|css|js|xml|zip)$/i.test(path)) continue;

      if (SUBPAGE_PATTERNS.some((pattern) => pattern.test(path))) {
        found.add(resolved.origin + resolved.pathname);
      }
    } catch {
      /* skip malformed URLs */
    }
  }

  return Array.from(found).slice(0, MAX_SUBPAGES);
}

/**
 * Scrape the homepage plus up to 3 high-value subpages and assemble website content.
 */
export async function scrapeWebsite(
  websiteUrl: string,
  firecrawlApiKey: string,
): Promise<{
  scrapedPages: ScrapeResult[];
  successfulScrapes: ScrapeResult[];
  websiteContent: string;
}> {
  const scrapedPages: ScrapeResult[] = [];

  console.log(`Scraping homepage: ${websiteUrl}`);
  const homepageResult = await scrapePage(websiteUrl, firecrawlApiKey);
  scrapedPages.push(homepageResult);

  // Extract and scrape high-value subpages from homepage links
  if (homepageResult.success && homepageResult.content.length > 200) {
    const subpageUrls = extractSubpageUrls(homepageResult.content, websiteUrl);
    if (subpageUrls.length > 0) {
      console.log(
        `Found ${subpageUrls.length} high-value subpages to scrape: ${subpageUrls.join(', ')}`,
      );
      const subpageResults = await Promise.allSettled(
        subpageUrls.map((url) => {
          // Use a shorter timeout for subpages
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), SUBPAGE_TIMEOUT_MS);
          return scrapePage(url, firecrawlApiKey).finally(() => clearTimeout(timer));
        }),
      );
      for (const result of subpageResults) {
        if (result.status === 'fulfilled') {
          scrapedPages.push(result.value);
        }
      }
    } else {
      console.log('No high-value subpage links found on homepage');
    }
  }

  const successfulScrapes = scrapedPages.filter((p) => p.success);
  console.log(`Successfully scraped ${successfulScrapes.length} of ${scrapedPages.length} pages`);

  let websiteContent = '';
  for (const page of scrapedPages) {
    if (page.success && page.content.length > 200) {
      const pageName = new URL(page.url).pathname || 'homepage';
      websiteContent += `\n\n=== PAGE: ${pageName} ===\n\n${page.content}`;
    }
  }

  const scrapedPagesSummary = scrapedPages.map((p) => ({
    url: p.url,
    success: p.success,
    chars: p.content.length,
  }));
  console.log('Scrape summary:', JSON.stringify(scrapedPagesSummary));

  return { scrapedPages, successfulScrapes, websiteContent };
}
