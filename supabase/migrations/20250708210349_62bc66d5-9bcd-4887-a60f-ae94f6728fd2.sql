-- Add user_message column to connection_requests for custom messages
ALTER TABLE public.connection_requests 
ADD COLUMN user_message TEXT;
