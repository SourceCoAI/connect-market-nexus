
-- Security validation and hardening queries
-- Check current function security status
SELECT 
  routine_name,
  routine_type,
  security_type,
  routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_type = 'FUNCTION'
  AND (routine_definition NOT LIKE '%SET search_path TO%' OR security_type != 'DEFINER');

-- Verify all critical functions have proper search path security
DO $$
DECLARE
  func_record RECORD;
  unsafe_functions TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR func_record IN 
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
      AND routine_type = 'FUNCTION'
      AND routine_definition NOT LIKE '%SET search_path TO%'
  LOOP
    unsafe_functions := array_append(unsafe_functions, func_record.routine_name);
  END LOOP;
  
  IF array_length(unsafe_functions, 1) > 0 THEN
    RAISE WARNING 'Unsafe functions found: %', array_to_string(unsafe_functions, ', ');
  ELSE
    RAISE NOTICE 'All functions have proper search path security';
  END IF;
END $$;

-- Add additional security validation for RLS policies
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verify auth trigger security
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
  AND action_statement LIKE '%auth.%';
