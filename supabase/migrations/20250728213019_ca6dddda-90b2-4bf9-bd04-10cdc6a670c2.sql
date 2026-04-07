-- Fix admin user without buyer_type
UPDATE public.profiles 
SET buyer_type = 'admin', updated_at = NOW() 
WHERE is_admin = true AND (buyer_type IS NULL OR buyer_type = '');

-- Add default buyer_type for any other users missing it
UPDATE public.profiles 
SET buyer_type = 'corporate', updated_at = NOW() 
WHERE buyer_type IS NULL OR buyer_type = '';