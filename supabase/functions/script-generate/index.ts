/**
 * script-generate - THIN ALIAS to generate-script (V3.0)
 * 
 * This function exists ONLY for backwards compatibility with old frontend calls.
 * It forwards all requests to the canonical generate-script router.
 * 
 * DO NOT add any logic here - this is purely a routing alias.
 * All generation logic lives in generate-script/index.ts
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    const body = await req.text();
    const authHeader = req.headers.get('Authorization') || '';
    
    console.log('[script-generate] Forwarding to generate-script canonical router');
    
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': authHeader,
      },
      body
    });
    
    const responseBody = await response.text();
    
    return new Response(responseBody, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('Content-Type') || 'application/json'
      }
    });
    
  } catch (error: any) {
    console.error('[script-generate] Forwarding error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Forwarding failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
