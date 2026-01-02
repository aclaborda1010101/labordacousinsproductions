import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FreezeRequest {
  scriptId: string;
  projectId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scriptId, projectId }: FreezeRequest = await req.json();

    if (!scriptId) {
      return new Response(
        JSON.stringify({ error: 'Se requiere scriptId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current script
    const { data: script, error: fetchError } = await supabase
      .from('scripts')
      .select('*')
      .eq('id', scriptId)
      .single();

    if (fetchError || !script) {
      throw new Error('Script not found');
    }

    // Create version snapshot before locking
    const currentVersion = script.version || 1;
    
    // Update script status to locked
    const { error: updateError } = await supabase
      .from('scripts')
      .update({ 
        status: 'locked',
        version: currentVersion,
        updated_at: new Date().toISOString()
      })
      .eq('id', scriptId);

    if (updateError) {
      throw updateError;
    }

    // Log the freeze action
    if (projectId) {
      await supabase.from('decisions_log').insert({
        project_id: projectId,
        entity_type: 'script',
        entity_id: scriptId,
        action: 'freeze',
        data: { version: currentVersion, frozen_at: new Date().toISOString() }
      });
    }

    console.log('Script frozen:', scriptId, 'version:', currentVersion);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Guion congelado correctamente',
        version: currentVersion 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-freeze:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
