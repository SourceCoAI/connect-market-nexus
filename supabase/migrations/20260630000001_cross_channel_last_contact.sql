-- Phase 9: Cross-channel last-contact tracking
-- Adds last_contacted_at + last_contact_channel to contacts and remarketing_buyers,
-- with triggers on all activity tables to keep them in sync.

-- 1. Add columns to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contact_channel text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contact_by text;

-- 2. Add columns to remarketing_buyers
ALTER TABLE remarketing_buyers ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;
ALTER TABLE remarketing_buyers ADD COLUMN IF NOT EXISTS last_contact_channel text;

-- 3. Trigger: contact_activities → update contacts + buyers + deal_pipeline
CREATE OR REPLACE FUNCTION update_last_contact_from_call() RETURNS trigger AS $$
DECLARE v_ts timestamptz := COALESCE(NEW.call_started_at, NEW.created_at);
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE contacts SET last_contacted_at = v_ts, last_contact_channel = 'call', last_contact_by = NEW.user_name
    WHERE id = NEW.contact_id AND (last_contacted_at IS NULL OR last_contacted_at < v_ts);
  END IF;
  IF NEW.remarketing_buyer_id IS NOT NULL THEN
    UPDATE remarketing_buyers SET last_contacted_at = v_ts, last_contact_channel = 'call'
    WHERE id = NEW.remarketing_buyer_id AND (last_contacted_at IS NULL OR last_contacted_at < v_ts);
  END IF;
  IF NEW.listing_id IS NOT NULL THEN
    UPDATE deal_pipeline SET last_activity_at = v_ts
    WHERE listing_id = NEW.listing_id AND (last_activity_at IS NULL OR last_activity_at < v_ts);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_last_contact_call ON contact_activities;
CREATE TRIGGER trg_last_contact_call
  AFTER INSERT ON contact_activities
  FOR EACH ROW EXECUTE FUNCTION update_last_contact_from_call();

-- 4. Trigger: email_messages → update contacts + deal_pipeline
CREATE OR REPLACE FUNCTION update_last_contact_from_email() RETURNS trigger AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE contacts SET last_contacted_at = NEW.sent_at, last_contact_channel = 'email'
    WHERE id = NEW.contact_id AND (last_contacted_at IS NULL OR last_contacted_at < NEW.sent_at);
  END IF;
  -- Update deal_pipeline via contacts → listing
  UPDATE deal_pipeline dp SET last_activity_at = NEW.sent_at
  FROM contacts c
  WHERE c.id = NEW.contact_id AND c.listing_id IS NOT NULL
    AND dp.listing_id = c.listing_id
    AND (dp.last_activity_at IS NULL OR dp.last_activity_at < NEW.sent_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_last_contact_email ON email_messages;
CREATE TRIGGER trg_last_contact_email
  AFTER INSERT ON email_messages
  FOR EACH ROW EXECUTE FUNCTION update_last_contact_from_email();

-- 5. Trigger: deal_transcripts → update deal_pipeline + contacts
CREATE OR REPLACE FUNCTION update_last_contact_from_meeting() RETURNS trigger AS $$
DECLARE v_ts timestamptz := COALESCE(NEW.call_date::timestamptz, NEW.created_at);
BEGIN
  IF NEW.listing_id IS NOT NULL THEN
    UPDATE deal_pipeline SET last_activity_at = v_ts
    WHERE listing_id = NEW.listing_id AND (last_activity_at IS NULL OR last_activity_at < v_ts);
    UPDATE contacts SET last_contacted_at = v_ts, last_contact_channel = 'meeting'
    WHERE listing_id = NEW.listing_id AND (last_contacted_at IS NULL OR last_contacted_at < v_ts);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_last_contact_meeting ON deal_transcripts;
CREATE TRIGGER trg_last_contact_meeting
  AFTER INSERT ON deal_transcripts
  FOR EACH ROW EXECUTE FUNCTION update_last_contact_from_meeting();
