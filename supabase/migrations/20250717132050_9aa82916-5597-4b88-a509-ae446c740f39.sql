-- Fix the audit_profile_changes function to resolve ambiguous column reference
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Log profile updates to audit table
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      table_name, 
      operation, 
      old_data, 
      new_data, 
      user_id, 
      admin_id,
      metadata
    ) VALUES (
      TG_TABLE_NAME,
      TG_OP,
      to_jsonb(OLD),
      to_jsonb(NEW),
      NEW.id,
      auth.uid(),
      jsonb_build_object(
        'changed_fields', (
          SELECT jsonb_object_agg(old_row.key, jsonb_build_object('old', old_row.value, 'new', new_row.value))
          FROM jsonb_each(to_jsonb(OLD)) AS old_row(key, value)
          JOIN jsonb_each(to_jsonb(NEW)) AS new_row(key, value) ON old_row.key = new_row.key
          WHERE old_row.value IS DISTINCT FROM new_row.value
        )
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;