/**
 * Contact Intelligence Types
 *
 * Types for the Apify LinkedIn scraping + Prospeo email enrichment pipeline.
 */

// ---------- Prospeo Enrichment ----------

export interface ProspeoResult {
  email: string | null;
  phone: string | null;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  linkedin_url: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'linkedin_lookup' | 'name_domain' | 'domain_search';
}

// ---------- Enriched Contact (DB model) ----------

export interface EnrichedContact {
  id?: string;
  workspace_id: string;
  company_name: string;
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  enriched_at: string;
  search_query?: string;
  buyer_id?: string;
  created_at?: string;
  updated_at?: string;
}

// ---------- Search Response ----------

export interface ContactSearchResult {
  contacts: EnrichedContact[];
  total_found: number;
  total_enriched: number;
  from_cache: boolean;
  search_duration_ms: number;
  errors?: string[];
}

// ---------- Title Matching Utilities ----------

export const TITLE_ALIASES: Record<string, string[]> = {
  associate: ['associate', 'sr associate', 'senior associate', 'investment associate'],
  principal: ['principal', 'sr principal', 'senior principal', 'investment principal'],
  vp: [
    'vp',
    'vice president',
    'vice-president',
    'svp',
    'senior vice president',
    'evp',
    'executive vice president',
  ],
  director: [
    'director',
    'managing director',
    'sr director',
    'senior director',
    'associate director',
  ],
  partner: ['partner', 'managing partner', 'general partner', 'senior partner'],
  analyst: ['analyst', 'sr analyst', 'senior analyst', 'investment analyst'],
  ceo: ['ceo', 'chief executive officer', 'president', 'owner', 'founder', 'co-founder'],
  cfo: ['cfo', 'chief financial officer', 'finance director', 'vp finance'],
  coo: ['coo', 'chief operating officer', 'operations director', 'vp operations'],
  bd: [
    'business development',
    'corp dev',
    'corporate development',
    'head of acquisitions',
    'vp acquisitions',
    'vp m&a',
    'head of m&a',
    'director of acquisitions',
  ],
};
