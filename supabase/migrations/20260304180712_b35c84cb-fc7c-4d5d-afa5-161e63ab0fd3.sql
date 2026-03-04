CREATE OR REPLACE FUNCTION public.generate_valuation_display_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  type_label TEXT;
  seq_num INTEGER;
BEGIN
  type_label := CASE NEW.calculator_type
    WHEN 'general' THEN 'General Calculator'
    WHEN 'auto_shop' THEN 'Auto Shop Calculator'
    WHEN 'hvac' THEN 'HVAC Calculator'
    WHEN 'collision' THEN 'Collision Calculator'
    ELSE initcap(replace(NEW.calculator_type, '_', ' ')) || ' Calculator'
  END;

  SELECT COALESCE(MAX(
    CASE
      WHEN display_name ~ '#[0-9]+$'
      THEN CAST(regexp_replace(display_name, '.*#', '') AS INTEGER)
      ELSE 0
    END
  ), 0) + 1 INTO seq_num
  FROM valuation_leads
  WHERE calculator_type = NEW.calculator_type
    AND display_name IS NOT NULL;

  NEW.display_name := type_label || ' #' || seq_num;
  RETURN NEW;
END;
$$;