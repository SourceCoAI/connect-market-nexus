-- Fix normalize_domain to handle email addresses
-- Previously, 'user@example.com' was kept as-is, causing false unique index matches.
-- Now we strip the local part before '@' to extract just the domain.
CREATE OR REPLACE FUNCTION normalize_domain(url text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN url IS NULL OR trim(url) = '' OR trim(url) = '<UNKNOWN>' THEN NULL
    ELSE
      rtrim(
        split_part(
          split_part(
            regexp_replace(
              regexp_replace(
                -- If the input contains '@', extract only the domain part after '@'
                CASE
                  WHEN position('@' in lower(trim(url))) > 0
                  THEN split_part(lower(trim(url)), '@', 2)
                  ELSE lower(trim(url))
                END,
                '^[a-z]+://', ''
              ),
              '^www\.', ''
            ),
            '/', 1
          ),
          ':', 1
        ),
        '.'
      )
  END
$$;
