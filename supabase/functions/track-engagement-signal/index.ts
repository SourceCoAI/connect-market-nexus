import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

interface TrackSignalRequest {
  listing_id: string;
  buyer_id: string;
  signal_type: SignalType;
  signal_value?: number; // Optional: override default value
  notes?: string;
  source?: 'manual' | 'email_tracking' | 'crm_integration' | 'system_detected';
}

type SignalType =
  | 'site_visit'
  | 'financial_request'
  | 'ceo_involvement'
  | 'nda_signed'
  | 'ioi_submitted'
  | 'loi_submitted'
  | 'call_scheduled'
  | 'management_presentation'
  | 'data_room_access'
  | 'email_engagement';

// Default point values for each signal type (per Whispers spec)
const SIGNAL_VALUES: Record<SignalType, number> = {
  site_visit: 20,
  financial_request: 30,
  ceo_involvement: 40,
  nda_signed: 25,
  ioi_submitted: 60,
  loi_submitted: 100,
  call_scheduled: 15,
  management_presentation: 35,
  data_room_access: 30,
  email_engagement: 10,
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    }

    const body: TrackSignalRequest = await req.json();
    const { listing_id, buyer_id, signal_type, signal_value, notes, source = 'manual' } = body;

    // Validate required fields
    if (!listing_id || !buyer_id || !signal_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: listing_id, buyer_id, signal_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate signal type
    if (!Object.prototype.hasOwnProperty.call(SIGNAL_VALUES, signal_type)) {
      return new Response(
        JSON.stringify({ error: `Invalid signal_type. Must be one of: ${Object.keys(SIGNAL_VALUES).join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use default value if not provided
    const finalValue = signal_value !== undefined ? signal_value : SIGNAL_VALUES[signal_type];

    // Insert engagement signal
    const { data: signal, error: insertError } = await supabase
      .from('engagement_signals')
      .insert({
        listing_id,
        buyer_id,
        signal_type,
        signal_value: finalValue,
        signal_date: new Date().toISOString(),
        source,
        notes: notes || null,
        created_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert engagement signal:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to record engagement signal", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate total engagement score for this buyer-listing pair
    const { data: totalScore, error: scoreError } = await supabase
      .rpc('calculate_engagement_score', {
        p_listing_id: listing_id,
        p_buyer_id: buyer_id,
      });

    if (scoreError) {
      console.warn("Failed to calculate total engagement score:", scoreError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        signal,
        total_engagement_score: totalScore || finalValue,
        message: `Recorded ${signal_type} signal (+${finalValue} points)`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Track engagement signal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
