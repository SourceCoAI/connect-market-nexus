import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { files } = await req.json();
  const results = [];
  for (const f of files) {
    const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    const { error } = await supabase.storage
      .from("agreement-templates")
      .upload(f.name, bytes, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    results.push({ name: f.name, error: error?.message || null });
  }
  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
