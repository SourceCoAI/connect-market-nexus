-- ═══════════════════════════════════════════════════════════════
-- Migration: add_not_a_fit_to_listings
-- Date: 2026-03-06
-- Purpose: Adds not_a_fit boolean flag and not_a_fit_reason text column
--          to the listings table so deals can be flagged without deletion.
-- Tables affected: listings
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS not_a_fit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS not_a_fit_reason text;
