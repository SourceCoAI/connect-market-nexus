-- Add hired_broker boolean flag to listings table
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hired_broker boolean DEFAULT false;
