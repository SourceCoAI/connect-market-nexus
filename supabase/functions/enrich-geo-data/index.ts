import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

// ip-api.com allows 45 requests per minute on free tier
const RATE_LIMIT_DELAY_MS = 1400; // ~43 requests per minute to stay safe

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 45; // Process 45 at a time (one minute worth)
    const maxBatches = body.maxBatches || 10; // Safety limit

    console.log(`Starting geo enrichment with batch size ${batchSize}`);

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let batchCount = 0;

    while (batchCount < maxBatches) {
      // Get sessions with valid IP but missing country data
      // CRITICAL: Filter out empty strings AND private IPs at query time
      const { data: sessions, error: fetchError } = await supabase
        .from('user_sessions')
        .select('id, ip_address')
        .is('country', null)
        .not('ip_address', 'is', null)
        .neq('ip_address', '')
        .not('ip_address', 'like', '10.%')
        .not('ip_address', 'like', '192.168.%')
        .not('ip_address', 'like', '127.%')
        .limit(batchSize);

      if (fetchError) {
        console.error('Error fetching sessions:', fetchError);
        throw fetchError;
      }

      if (!sessions || sessions.length === 0) {
        console.log('No more sessions to process');
        break;
      }

      console.log(`Processing batch ${batchCount + 1}: ${sessions.length} sessions`);

      // Process each session with rate limiting
      for (const session of sessions) {
        try {
          const geoData = await fetchGeoData(session.ip_address);
          
          if (geoData && geoData.status === 'success') {
            const { error: updateError } = await supabase
              .from('user_sessions')
              .update({
                country: geoData.country,
                country_code: geoData.countryCode,
                city: geoData.city,
                region: geoData.regionName,
                timezone: geoData.timezone,
              })
              .eq('id', session.id);

            if (!updateError) {
              totalUpdated++;
            } else {
              console.error(`Update failed for session ${session.id}:`, updateError);
              totalFailed++;
            }
          } else {
            console.log(`Geo lookup failed for IP ${session.ip_address}: ${geoData?.message || 'Unknown error'}`);
            totalFailed++;
          }

          totalProcessed++;

          // Rate limiting delay
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));

        } catch (err) {
          console.error(`Error processing session ${session.id}:`, err);
          totalFailed++;
          totalProcessed++;
        }
      }

      batchCount++;
      console.log(`Batch ${batchCount} complete. Updated: ${totalUpdated}, Failed: ${totalFailed}`);
    }

    console.log(`Geo enrichment complete: ${totalUpdated} updated, ${totalFailed} failed out of ${totalProcessed} processed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Enriched ${totalUpdated} sessions with geo data`,
        totalProcessed,
        totalUpdated,
        totalFailed,
        batchesProcessed: batchCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Geo enrichment error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchGeoData(ip: string): Promise<Record<string, any>> {
  try {
    // Skip private/local IPs
    if (isPrivateIP(ip)) {
      return { status: 'fail', message: 'Private IP address' };
    }

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,timezone`);
    
    if (!response.ok) {
      return { status: 'fail', message: `HTTP ${response.status}` };
    }

    return await response.json();
  } catch (err) {
    return { status: 'fail', message: String(err) };
  }
}

function isPrivateIP(ip: string): boolean {
  // Check for private IP ranges
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true; // Invalid IP
  
  // 10.0.0.0 - 10.255.255.255
  if (parts[0] === 10) return true;
  
  // 172.16.0.0 - 172.31.255.255
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0 - 192.168.255.255
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  // 127.0.0.0 - 127.255.255.255 (localhost)
  if (parts[0] === 127) return true;
  
  // 0.0.0.0
  if (parts.every(p => p === 0)) return true;
  
  return false;
}
