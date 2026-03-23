-- Onboarding Day 2 email — runs daily at 9am UTC
SELECT cron.schedule(
  'send-onboarding-day2',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/send-onboarding-day2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Onboarding Day 7 re-engagement — runs daily at 9am UTC
SELECT cron.schedule(
  'send-onboarding-day7',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/send-onboarding-day7',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- First request follow-up — runs every hour (checks 20-28hr window)
SELECT cron.schedule(
  'send-first-request-followup',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/send-first-request-followup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemlwcWFya21tZnVxYWRlZmVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjYxNzExMywiZXhwIjoyMDYyMTkzMTEzfQ.VkHWUIHpILCuNZWDwXfB_j2LN2Ki5NT_RN4n-OuFVxM'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
