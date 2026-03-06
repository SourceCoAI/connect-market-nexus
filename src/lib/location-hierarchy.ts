import { STANDARDIZED_LOCATIONS } from '@/lib/financial-parser';

// Location hierarchy mapping - when a user selects a broader location, include all sub-locations
const LOCATION_HIERARCHY: Record<string, string[]> = {
  'North America': ['United States', 'Canada', 'Northeast US', 'Southeast US', 'Midwest US', 'Southwest US', 'Western US'],
  'United States': ['Northeast US', 'Southeast US', 'Midwest US', 'Southwest US', 'Western US'],
  'Europe': ['United Kingdom'],
  'Asia Pacific': [], // Add specific countries as needed
  'Global/International': [...STANDARDIZED_LOCATIONS.filter(loc => loc !== 'Global/International')]
};

/**
 * Expands a single location into all hierarchically included locations
 * Example: "North America" -> ["North America", "United States", "Canada", "Northeast US", ...]
 */
export function expandLocation(location: string): string[] {
  const expanded = [location];
  const children = LOCATION_HIERARCHY[location];
  
  if (children && children.length > 0) {
    expanded.push(...children);
    
    // Recursively expand children
    for (const child of children) {
      const grandChildren = LOCATION_HIERARCHY[child];
      if (grandChildren && grandChildren.length > 0) {
        expanded.push(...grandChildren);
      }
    }
  }
  
  return [...new Set(expanded)]; // Remove duplicates
}

/**
 * Expands multiple locations into all hierarchically included locations
 * Example: ["North America", "Europe"] -> ["North America", "United States", "Canada", ..., "Europe", "United Kingdom"]
 */
export function expandLocations(locations: string[]): string[] {
  const allExpanded = locations.flatMap(expandLocation);
  return [...new Set(allExpanded)]; // Remove duplicates
}

/**
 * Get the parent location for a given location
 * Example: "Northeast US" -> "United States"
 */
export function getParentLocation(location: string): string | null {
  for (const [parent, children] of Object.entries(LOCATION_HIERARCHY)) {
    if (children.includes(location)) {
      return parent;
    }
  }
  return null;
}

/**
 * Check if a location is included within another location's hierarchy
 * Example: isLocationWithin("Northeast US", "North America") -> true
 */
export function isLocationWithin(targetLocation: string, containerLocation: string): boolean {
  const expandedContainer = expandLocation(containerLocation);
  return expandedContainer.includes(targetLocation);
}