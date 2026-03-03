import { normalizeStateCode } from '@/lib/deal-csv-import/parsers';

export interface LocationFields {
  address_city?: string | null;
  address_state?: string | null;
  location?: string | null;
  geographic_states?: string[] | null;
}

/**
 * Unified location display string for a listing/deal.
 *
 * Fallback chain (most accurate first):
 *   1. address_city + address_state  (structured HQ, e.g. "Dallas, TX")
 *   2. location                       (free-text / marketplace field)
 *   3. geographic_states[0]           (service-area state code, last resort)
 *
 * Returns null when no location data is available.
 */
export function getDisplayLocation(fields: LocationFields): string | null {
  // 1. Structured city + state (most accurate)
  if (fields.address_city && fields.address_state) {
    const city = fields.address_city.trim();
    const state = normalizeStateCode(fields.address_state);
    if (city && state) {
      return `${city}, ${state}`;
    }
  }

  // 2. Free-text location field
  if (fields.location) {
    const trimmed = fields.location.trim();
    if (trimmed && trimmed !== 'Unknown') {
      return trimmed;
    }
  }

  // 3. First geographic state (last resort - shows just the state code)
  if (fields.geographic_states && fields.geographic_states.length > 0) {
    const state = fields.geographic_states[0];
    if (state && state.length === 2) {
      return state;
    }
  }

  return null;
}
