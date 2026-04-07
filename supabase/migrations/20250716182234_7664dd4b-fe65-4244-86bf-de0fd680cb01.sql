-- Create categories table for dynamic listing category management (with RLS)
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on categories table
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for categories
CREATE POLICY "Anyone can view active categories" 
  ON public.categories 
  FOR SELECT 
  USING (is_active = true);

CREATE POLICY "Admins can manage all categories" 
  ON public.categories 
  FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  ));

-- Insert consolidated categories (including existing ones)
INSERT INTO public.categories (name, description) VALUES
  ('Technology', 'Technology and software businesses'),
  ('E-commerce', 'Online retail and e-commerce platforms'),
  ('SaaS', 'Software as a Service businesses'),
  ('Manufacturing', 'Manufacturing and production companies'),
  ('Retail', 'Physical retail and commerce'),
  ('Healthcare', 'Healthcare and medical services'),
  ('Food & Beverage', 'Food and beverage businesses'),
  ('Service', 'Service-based businesses'),
  ('Consumer Services', 'Consumer-focused service businesses'),
  ('Consumer & Retail', 'Consumer products and retail'),
  ('Consumer Multi-Site', 'Multi-location consumer businesses'),
  ('Industrials', 'Industrial and manufacturing businesses'),
  ('Vehicle Aftermarket Products & Services', 'Automotive aftermarket businesses'),
  ('Digital Media', 'Digital media and content businesses'),
  ('Business Services', 'B2B service providers'),
  ('Marketing & Info Services', 'Marketing and information services'),
  ('HR services', 'Human resources and staffing services'),
  ('Financial Services', 'Financial and fintech services'),
  ('Asset & Wealth Management', 'Investment and wealth management'),
  ('Other', 'Miscellaneous business categories');

-- Update listings table to support multiple categories
ALTER TABLE public.listings 
ADD COLUMN categories TEXT[] DEFAULT '{}';

-- Migrate existing single category data to categories array
UPDATE public.listings 
SET categories = ARRAY[category] 
WHERE category IS NOT NULL AND category != '';

-- Create index for better performance on categories array
CREATE INDEX idx_listings_categories ON public.listings USING GIN(categories);

-- Add trigger to update updated_at timestamp on categories
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_categories_updated_at 
    BEFORE UPDATE ON public.categories 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
