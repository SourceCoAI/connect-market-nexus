
import { STANDARDIZED_CATEGORIES, STANDARDIZED_LOCATIONS } from '@/lib/financial-parser';

// Create canonical keys for robust matching (case, punctuation, & vs and)
const canonicalize = (s: string = ''): string => {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

const buildMap = (values: string[]) => {
  const map = new Map<string, string>();
  values.forEach((v) => {
    map.set(canonicalize(v), v);
  });
  return map;
};

const CATEGORY_MAP = buildMap([...STANDARDIZED_CATEGORIES]);
const LOCATION_MAP = buildMap([...STANDARDIZED_LOCATIONS]);

// Dedupe while preserving order
const dedupePreserveOrder = (arr: string[] = []) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arr) {
    const key = item ?? '';
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
};

export const toStandardCategory = (value?: string) => {
  if (!value) return '';
  const v = value.trim();
  
  // Handle special "all" values without standardization
  if (v.toLowerCase() === 'all' || v.toLowerCase() === 'all categories') {
    return 'all';
  }
  
  return CATEGORY_MAP.get(canonicalize(v)) ?? v;
};

export const toStandardLocation = (value?: string) => {
  if (!value) return '';
  const v = value.trim();
  
  // Handle special "all" values without standardization
  if (v.toLowerCase() === 'all' || v.toLowerCase() === 'all locations') {
    return 'all';
  }
  
  // Handle common location synonyms and mappings
  const synonyms: Record<string, string> = {
    'northwest': 'Western US',
    'pacific northwest': 'Western US',
    'northeast': 'Northeast US', 
    'new england': 'Northeast US',
    'southeast': 'Southeast US',
    'southern us': 'Southeast US',
    'midwest': 'Midwest US',
    'midwestern us': 'Midwest US',
    'southwest': 'Southwest US',
    'southwestern us': 'Southwest US',
    'western': 'Western US',
    'west coast': 'Western US',
    'east coast': 'Northeast US',
    'north america': 'North America',
    'usa': 'United States',
    'us': 'United States',
    'uk': 'United Kingdom',
    'britain': 'United Kingdom',
    'great britain': 'United Kingdom'
  };
  
  // Check synonyms first
  const lowerValue = v.toLowerCase();
  if (synonyms[lowerValue]) {
    return synonyms[lowerValue];
  }
  
  return LOCATION_MAP.get(canonicalize(v)) ?? v;
};

export const standardizeCategories = (values: string[] = []) => {
  const mapped = values.map(toStandardCategory).filter(Boolean) as string[];
  return dedupePreserveOrder(mapped);
};

export const standardizeLocations = (values: string[] = []) => {
  const mapped = values.map(toStandardLocation).filter(Boolean) as string[];
  return dedupePreserveOrder(mapped);
};

export const toCanonical = canonicalize;
