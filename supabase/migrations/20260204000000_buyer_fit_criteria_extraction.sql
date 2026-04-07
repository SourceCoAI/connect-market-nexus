-- =============================================
-- BUYER FIT CRITERIA EXTRACTION TABLES
-- =============================================
-- Supports extraction of buyer fit criteria from multiple sources:
-- 1. AI-generated industry guides (M&A playbooks)
-- 2. Uploaded documents (PDFs, research reports)
-- 3. Call transcripts (buyer conversations)
--
-- Enables tracking which sources contributed to criteria and version control

-- 1. Buyer Type Profiles (detailed profiles for different buyer categories)
CREATE TABLE IF NOT EXISTS public.buyer_type_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  universe_id UUID NOT NULL REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  buyer_type TEXT NOT NULL CHECK (buyer_type IN ('pe_firm', 'platform', 'strategic', 'family_office', 'other')),
  profile_name TEXT NOT NULL, -- e.g., "Regional Platform Aggregator", "National Roll-up Platform"
  description TEXT, -- Detailed profile description
  typical_size_range JSONB DEFAULT '{}', -- { "revenue_min": 5000000, "revenue_max": 20000000 }
  geographic_focus TEXT[], -- Typical geographic preferences for this buyer type
  service_preferences TEXT[], -- Services this buyer type typically targets
  strategic_rationale TEXT, -- Why this buyer type acquires in this industry
  typical_structure TEXT, -- Common deal structure (asset, stock, merger)
  growth_strategies TEXT[], -- How they grow portfolio companies
  priority_rank INTEGER DEFAULT 1, -- Ranking of buyer type importance (1 = highest priority)
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100), -- Extraction confidence
  source_documents TEXT[], -- Which documents contributed to this profile
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(universe_id, buyer_type, profile_name)
);

-- 2. Criteria Extraction Sources (track which documents/guides/transcripts contributed data)
CREATE TABLE IF NOT EXISTS public.criteria_extraction_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  universe_id UUID NOT NULL REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('ai_guide', 'uploaded_document', 'call_transcript', 'manual_entry', 'csv_import')),
  source_name TEXT NOT NULL, -- e.g., "HVAC Services M&A Guide", "Industry Research Report.pdf"
  source_url TEXT, -- Storage URL if uploaded document
  source_metadata JSONB DEFAULT '{}', -- { "file_size": 1024, "pages": 50, "upload_date": "2026-02-04" }
  extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,
  extraction_error TEXT, -- Error message if failed
  extracted_data JSONB DEFAULT '{}', -- Full extraction result
  confidence_scores JSONB DEFAULT '{}', -- { "size_criteria": 85, "geography_criteria": 90 }
  applied_to_criteria BOOLEAN DEFAULT false, -- Has this been merged into universe criteria?
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Criteria Extraction History (version control for criteria changes)
CREATE TABLE IF NOT EXISTS public.criteria_extraction_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  universe_id UUID NOT NULL REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.criteria_extraction_sources(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('initial_creation', 'extraction_applied', 'manual_edit', 'synthesis', 'rollback')),
  changed_sections TEXT[] NOT NULL, -- ['size_criteria', 'geography_criteria']
  before_snapshot JSONB DEFAULT '{}', -- Criteria state before change
  after_snapshot JSONB DEFAULT '{}', -- Criteria state after change
  change_summary TEXT, -- Human-readable description of changes
  conflicts_detected JSONB DEFAULT '[]', -- Array of conflicts found during synthesis
  conflict_resolution TEXT, -- How conflicts were resolved
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Buyer Transcripts (store call/meeting transcripts for extraction)
CREATE TABLE IF NOT EXISTS public.buyer_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID REFERENCES public.remarketing_buyers(id) ON DELETE CASCADE,
  universe_id UUID REFERENCES public.remarketing_buyer_universes(id) ON DELETE CASCADE,
  transcript_text TEXT NOT NULL,
  transcript_type TEXT NOT NULL DEFAULT 'call' CHECK (transcript_type IN ('call', 'meeting', 'email', 'notes')),
  call_date TIMESTAMPTZ,
  participants TEXT[], -- ['John Smith (Buyer)', 'Jane Doe (Broker)']
  duration_minutes INTEGER,
  recording_url TEXT, -- Link to audio/video if available
  transcript_source TEXT, -- 'automatic', 'manual', 'imported'
  extracted_insights JSONB DEFAULT '{}', -- Extracted buyer criteria
  extraction_status TEXT DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  extraction_error TEXT,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_buyer_type_profiles_universe ON public.buyer_type_profiles(universe_id);
CREATE INDEX IF NOT EXISTS idx_buyer_type_profiles_type ON public.buyer_type_profiles(buyer_type);
CREATE INDEX IF NOT EXISTS idx_buyer_type_profiles_priority ON public.buyer_type_profiles(priority_rank);

CREATE INDEX IF NOT EXISTS idx_extraction_sources_universe ON public.criteria_extraction_sources(universe_id);
CREATE INDEX IF NOT EXISTS idx_extraction_sources_type ON public.criteria_extraction_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_extraction_sources_status ON public.criteria_extraction_sources(extraction_status);
CREATE INDEX IF NOT EXISTS idx_extraction_sources_applied ON public.criteria_extraction_sources(applied_to_criteria);

CREATE INDEX IF NOT EXISTS idx_extraction_history_universe ON public.criteria_extraction_history(universe_id);
CREATE INDEX IF NOT EXISTS idx_extraction_history_source ON public.criteria_extraction_history(source_id);
CREATE INDEX IF NOT EXISTS idx_extraction_history_changed_at ON public.criteria_extraction_history(changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_buyer_transcripts_buyer ON public.buyer_transcripts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_buyer_transcripts_universe ON public.buyer_transcripts(universe_id);
CREATE INDEX IF NOT EXISTS idx_buyer_transcripts_status ON public.buyer_transcripts(extraction_status);
CREATE INDEX IF NOT EXISTS idx_buyer_transcripts_call_date ON public.buyer_transcripts(call_date DESC);

-- =============================================
-- ENABLE RLS
-- =============================================

ALTER TABLE public.buyer_type_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.criteria_extraction_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.criteria_extraction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_transcripts ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES (Admin-only access)
-- =============================================

CREATE POLICY "Admins can manage buyer type profiles" ON public.buyer_type_profiles
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can manage extraction sources" ON public.criteria_extraction_sources
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can view extraction history" ON public.criteria_extraction_history
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage buyer transcripts" ON public.buyer_transcripts
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- =============================================
-- UPDATED_AT TRIGGERS
-- =============================================

CREATE TRIGGER update_buyer_type_profiles_updated_at
  BEFORE UPDATE ON public.buyer_type_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_extraction_sources_updated_at
  BEFORE UPDATE ON public.criteria_extraction_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_buyer_transcripts_updated_at
  BEFORE UPDATE ON public.buyer_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- HELPFUL COMMENTS
-- =============================================

COMMENT ON TABLE public.buyer_type_profiles IS 'Detailed profiles for different buyer types in a universe (e.g., Regional Platform, National Roll-up). Extracted from AI guides, documents, and transcripts.';
COMMENT ON TABLE public.criteria_extraction_sources IS 'Tracks which documents/guides/transcripts have been processed for criteria extraction. Enables version control and conflict detection.';
COMMENT ON TABLE public.criteria_extraction_history IS 'Audit log of all changes to universe criteria. Supports rollback and understanding how criteria evolved over time.';
COMMENT ON TABLE public.buyer_transcripts IS 'Stores call/meeting transcripts for extracting buyer-specific criteria and insights. Highest priority source (priority: 100).';

COMMENT ON COLUMN public.buyer_type_profiles.priority_rank IS 'Ranking of buyer type importance (1 = highest priority, shown first in UI)';
COMMENT ON COLUMN public.criteria_extraction_sources.applied_to_criteria IS 'True if this source has been merged into the universe criteria';
COMMENT ON COLUMN public.criteria_extraction_history.conflicts_detected IS 'JSON array of conflicts found during synthesis (e.g., [{"field": "revenue_min", "old_value": 5000000, "new_value": 10000000}])';
