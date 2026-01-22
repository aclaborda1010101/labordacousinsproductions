import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ⚠️ TEMPORAL - ELIMINAR INMEDIATAMENTE DESPUÉS DE USAR ⚠️
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  
  return new Response(JSON.stringify({ 
    dbUrl: dbUrl || "No configurada",
    warning: "⚠️ ELIMINA ESTA FUNCIÓN INMEDIATAMENTE DESPUÉS DE COPIAR LA URL - Es un riesgo de seguridad"
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
