-- Re-add FK: saved_listings.user_id → profiles.id (idempotent)
ALTER TABLE saved_listings 
DROP CONSTRAINT IF EXISTS saved_listings_user_id_fkey;

-- Now add the correct foreign key relationship
ALTER TABLE saved_listings 
ADD CONSTRAINT saved_listings_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
