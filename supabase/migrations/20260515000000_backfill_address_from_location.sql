-- Backfill address_city and address_state from the free-text 'location' field
-- for listings that have location data but no structured address fields.
--
-- The location field typically contains "City, ST" format (e.g., "San Antonio, TX").
-- This migration parses those values into the structured address_city/address_state columns
-- so the unified getDisplayLocation() helper always has data to work with.

-- Step 1: Parse "City, ST" pattern from location into address_city/address_state
UPDATE public.listings
SET
  address_city = TRIM(SPLIT_PART(location, ',', 1)),
  address_state = UPPER(TRIM(SPLIT_PART(location, ',', 2)))
WHERE
  address_city IS NULL
  AND address_state IS NULL
  AND location IS NOT NULL
  AND location != 'Unknown'
  AND location != ''
  -- Only match "City, ST" pattern (2-letter state code after comma)
  AND TRIM(SPLIT_PART(location, ',', 2)) ~ '^[A-Za-z]{2}$'
  -- Must have exactly one comma (simple city, state format)
  AND (LENGTH(location) - LENGTH(REPLACE(location, ',', ''))) = 1;

-- Step 2: For listings with geographic_states but no address_state,
-- set address_state from the first geographic state (if it's a single-state listing)
UPDATE public.listings
SET
  address_state = geographic_states[1]
WHERE
  address_state IS NULL
  AND geographic_states IS NOT NULL
  AND array_length(geographic_states, 1) = 1
  AND geographic_states[1] ~ '^[A-Z]{2}$';
