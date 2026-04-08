-- Add FK: saved_listings.user_id → profiles.id (cascade delete)
ALTER TABLE saved_listings 
ADD CONSTRAINT saved_listings_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
