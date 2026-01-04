import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuthOrDemo } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireAuthOrDemo(req);
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

    if (!ELEVENLABS_API_KEY) {
      console.error('[Forge STT] ELEVENLABS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Servicio de voz no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: 'No se recibió archivo de audio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Forge STT] Transcribing audio: ${audioFile.name}, size: ${audioFile.size} bytes, type: ${audioFile.type}`);

    // Validar tamaño mínimo
    if (audioFile.size < 1000) {
      return new Response(
        JSON.stringify({ error: 'Audio demasiado corto', text: '' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiFormData = new FormData();
    apiFormData.append('file', audioFile);
    apiFormData.append('model_id', 'scribe_v1');
    apiFormData.append('language_code', 'spa'); // Spanish

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: apiFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Forge STT] ElevenLabs error:', response.status, errorText);
      
      // Errores específicos
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: 'API key inválida' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Demasiadas solicitudes. Espera un momento.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `Error del servicio de voz: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transcription = await response.json();
    console.log(`[Forge STT] Transcription complete: "${transcription.text?.substring(0, 50)}..." (${transcription.text?.length || 0} chars)`);

    return new Response(JSON.stringify(transcription), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    const status =
      err.message.includes('Authorization') ||
      err.message.includes('Access denied') ||
      err.message.includes('token')
        ? 401
        : 500;

    console.error('[Forge STT] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
