-- Allow system-generated deal comments (e.g., AI summaries) without an admin_id
-- The auto-summarize-transcript and auto-summarize-email-thread edge functions
-- create comments from webhook context where there is no authenticated user.

ALTER TABLE deal_comments ALTER COLUMN admin_id DROP NOT NULL;
