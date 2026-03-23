-- ========================================
-- Contact Lists: Saved lists for PhoneBurner export
-- ========================================

-- 1. Contact Lists table - stores saved lists
CREATE TABLE public.contact_lists (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    list_type TEXT NOT NULL DEFAULT 'buyer',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    contact_count INTEGER NOT NULL DEFAULT 0,
    last_pushed_at TIMESTAMPTZ,
    last_pushed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT '{}',
    filter_snapshot JSONB,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contact lists"
ON public.contact_lists FOR ALL
USING (public.is_admin(auth.uid()));

CREATE INDEX idx_cl_list_type ON public.contact_lists(list_type);
CREATE INDEX idx_cl_created_by ON public.contact_lists(created_by);
CREATE INDEX idx_cl_created_at ON public.contact_lists(created_at DESC);
CREATE INDEX idx_cl_archived ON public.contact_lists(is_archived) WHERE is_archived = FALSE;
CREATE INDEX idx_cl_tags ON public.contact_lists USING GIN(tags);

-- 2. Contact List Members table - stores list membership
CREATE TABLE public.contact_list_members (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    list_id UUID NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
    contact_email TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    contact_company TEXT,
    contact_role TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at TIMESTAMPTZ,
    UNIQUE(list_id, contact_email)
);

ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contact list members"
ON public.contact_list_members FOR ALL
USING (public.is_admin(auth.uid()));

CREATE INDEX idx_clm_list_id ON public.contact_list_members(list_id);
CREATE INDEX idx_clm_email ON public.contact_list_members(contact_email);
CREATE INDEX idx_clm_entity ON public.contact_list_members(entity_type, entity_id);
CREATE INDEX idx_clm_active ON public.contact_list_members(list_id) WHERE removed_at IS NULL;

-- 3. Add contact_email to contact_activities for cross-entity joining
ALTER TABLE public.contact_activities
    ADD COLUMN IF NOT EXISTS contact_email TEXT;

CREATE INDEX IF NOT EXISTS idx_ca_contact_email ON public.contact_activities(contact_email) WHERE contact_email IS NOT NULL;

-- 4. Add list_id to phoneburner_sessions for linking sessions to lists
ALTER TABLE public.phoneburner_sessions
    ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES public.contact_lists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pb_sessions_list_id ON public.phoneburner_sessions(list_id) WHERE list_id IS NOT NULL;

-- 5. Updated_at triggers
CREATE TRIGGER update_contact_lists_updated_at
    BEFORE UPDATE ON public.contact_lists
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- NOTE: contact_list_members has no updated_at column, so no updated_at trigger here.

-- 6. Function to auto-update contact_count on list membership changes
CREATE OR REPLACE FUNCTION public.update_contact_list_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE public.contact_lists
        SET contact_count = (
            SELECT COUNT(*) FROM public.contact_list_members
            WHERE list_id = NEW.list_id AND removed_at IS NULL
        )
        WHERE id = NEW.list_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.contact_lists
        SET contact_count = (
            SELECT COUNT(*) FROM public.contact_list_members
            WHERE list_id = OLD.list_id AND removed_at IS NULL
        )
        WHERE id = OLD.list_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_contact_list_count
    AFTER INSERT OR UPDATE OR DELETE ON public.contact_list_members
    FOR EACH ROW EXECUTE FUNCTION public.update_contact_list_count();
