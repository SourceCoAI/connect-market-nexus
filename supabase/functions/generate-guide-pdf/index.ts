import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { universeId, industryName, content } = await req.json();

    if (!universeId || !content) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing universeId or content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Convert markdown/HTML content to styled HTML document for PDF
    const sanitizedName = (industryName || 'MA-Research-Guide').replace(/[^a-zA-Z0-9-\s]/g, '').replace(/\s+/g, '-');
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `${universeId}/${sanitizedName}-${timestamp}.html`;

    // Create a styled HTML document
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${industryName || 'M&A Research Guide'}</title>
  <style>
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      line-height: 1.7;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #1a1a1a;
      background: #fff;
    }
    h1 {
      font-size: 2.2em;
      margin-bottom: 0.5em;
      color: #111;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 0.3em;
    }
    h2 {
      font-size: 1.6em;
      margin-top: 2em;
      margin-bottom: 0.5em;
      color: #1e40af;
    }
    h3 {
      font-size: 1.3em;
      margin-top: 1.5em;
      margin-bottom: 0.4em;
      color: #1e3a8a;
    }
    h4 {
      font-size: 1.1em;
      margin-top: 1.2em;
      color: #334155;
    }
    p {
      margin: 1em 0;
      text-align: justify;
    }
    ul, ol {
      margin: 1em 0;
      padding-left: 2em;
    }
    li {
      margin: 0.5em 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5em 0;
      font-size: 0.9em;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 10px 12px;
      text-align: left;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
      color: #1e40af;
    }
    tr:nth-child(even) {
      background: #f9fafb;
    }
    blockquote {
      margin: 1.5em 0;
      padding: 1em 1.5em;
      border-left: 4px solid #2563eb;
      background: #eff6ff;
      font-style: italic;
    }
    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    .metadata {
      font-size: 0.9em;
      color: #6b7280;
      margin-bottom: 2em;
      padding-bottom: 1em;
      border-bottom: 1px solid #e5e7eb;
    }
    @media print {
      body {
        padding: 0;
        font-size: 11pt;
      }
      h1, h2, h3 {
        page-break-after: avoid;
      }
      table, figure {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="metadata">
    <strong>Industry:</strong> ${industryName || 'M&A Research Guide'}<br>
    <strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}<br>
    <strong>Word Count:</strong> ${content.split(/\s+/).length.toLocaleString()}
  </div>
  ${content}
</body>
</html>`;

    // Ensure bucket exists (create if needed)
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'universe-documents');
    
    if (!bucketExists) {
      const { error: createBucketError } = await supabase.storage.createBucket('universe-documents', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['text/html', 'application/pdf', 'text/plain', 'text/markdown']
      });
      if (createBucketError && !createBucketError.message.includes('already exists')) {
        console.error('Failed to create bucket:', createBucketError);
      }
    }

    // Upload the HTML file to storage
    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
    const { error: uploadError } = await supabase.storage
      .from('universe-documents')
      .upload(fileName, htmlBlob, {
        contentType: 'text/html',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ success: false, error: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('universe-documents')
      .getPublicUrl(fileName);

    const documentRef = {
      id: crypto.randomUUID(),
      name: `${sanitizedName}-${timestamp}.html`,
      url: urlData.publicUrl,
      uploaded_at: new Date().toISOString(),
      type: 'ma_guide',
      auto_generated: true
    };

    console.log(`Generated guide document: ${fileName}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        document: documentRef,
        message: 'Guide saved to Supporting Documents'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-guide-pdf:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
