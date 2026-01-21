/**
 * POLISH-EPISODE V1.0
 * 
 * Part of the Writer's Room Hollywood Pipeline (Level 5 - Polish Pass)
 * Unifies voice, rhythm, and continuity across an entire episode/act
 * 
 * Input: Concatenated script blocks + Bible style guide
 * Output: Polished script with unified voice
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthOrDemo, requireProjectAccess } from "../_shared/auth.ts";
import { buildTokenLimit, MODEL_CONFIG } from "../_shared/model-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// POLISH REQUEST/RESPONSE
// =============================================================================

interface PolishRequest {
  projectId: string;
  episodeNumber?: number;
  actNumber?: number;
  scriptContent: string;  // Concatenated script blocks
  bibleStyleGuide: string;  // Tone, voice, dialogue patterns
  targetWordCount?: number;
}

interface PolishResult {
  polishedContent: string;
  changes: {
    voiceCorrections: number;
    continuityFixes: number;
    formatFixes: number;
    dialoguePolish: number;
  };
  notes: string[];
}

// =============================================================================
// POLISH PROMPT
// =============================================================================

function buildPolishPrompt(
  scriptContent: string,
  bibleStyleGuide: string,
  targetWordCount?: number
): string {
  const wordCountNote = targetWordCount 
    ? `\nMantén aproximadamente ${targetWordCount} palabras (±10%).`
    : '';
  
  return `
# TAREA: Polish Pass - Unificar voz y pulir guion

## STYLE GUIDE (BIBLE)
${bibleStyleGuide}

## GUION A PULIR
${scriptContent}

## INSTRUCCIONES DE POLISH

Tu trabajo es PULIR, no reescribir. Mantén la estructura y contenido, mejora:

### 1. VOZ NARRATIVA
- Unifica el tono a lo largo de todo el episodio
- Elimina inconsistencias de estilo entre escenas
- Asegura que las descripciones sigan el mismo ritmo

### 2. CONTINUIDAD
- Verifica que los nombres de personajes sean consistentes
- Corrige referencias temporales inconsistentes
- Asegura que los estados emocionales fluyan lógicamente

### 3. FORMATO
- Sluglines correctos: INT./EXT. LOCACIÓN - MOMENTO
- CONT'D donde corresponda
- (V.O.), (O.S.) usados correctamente
- Párrafos de acción de máximo 4 líneas

### 4. DIÁLOGO
- Elimina diálogo explicativo
- Asegura que cada personaje tenga voz distintiva
- Añade subtexto donde falte
- Corrige ritmo de intercambios
${wordCountNote}

## PROHIBIDO
- Cambiar la trama o eventos
- Añadir nuevos personajes
- Eliminar escenas completas
- Cambiar el tono general

## FORMATO DE RESPUESTA JSON

{
  "polished_content": "[El guion completo pulido]",
  "changes": {
    "voice_corrections": 12,
    "continuity_fixes": 5,
    "format_fixes": 8,
    "dialogue_polish": 15
  },
  "notes": [
    "Unificado uso de tiempo presente en descripciones",
    "Corregido nombre inconsistente: 'María/Maria' → 'María'",
    "Añadido CONT'D en escenas 5, 12, 18"
  ]
}

Responde SOLO con el JSON.
`.trim();
}

// =============================================================================
// AI CALL (8k output limit for polish)
// =============================================================================

async function callAI(prompt: string, timeout = 80000): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const model = 'openai/gpt-5.2';  // Best model for polish quality

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt }
        ],
        ...buildTokenLimit(model, MODEL_CONFIG.LIMITS.OUTPUT_LIMITS.POLISH_EPISODE || 8000),
        temperature: 0.6,  // Lower temp for consistency
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    let content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: Request exceeded timeout');
    }
    throw error;
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let authContext;
    try {
      authContext = await requireAuthOrDemo(req);
    } catch (authError: any) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: authError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: PolishRequest = await req.json();
    const { 
      projectId, 
      episodeNumber,
      actNumber,
      scriptContent, 
      bibleStyleGuide,
      targetWordCount 
    } = body;

    if (!projectId || !scriptContent || !bibleStyleGuide) {
      return new Response(
        JSON.stringify({ error: 'MISSING_PARAMS', message: 'projectId, scriptContent, and bibleStyleGuide are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate project access
    try {
      await requireProjectAccess(authContext.supabase, authContext.userId, projectId);
    } catch (accessError: any) {
      return new Response(
        JSON.stringify({ error: 'FORBIDDEN', message: accessError.message }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const identifier = episodeNumber ? `ep${episodeNumber}` : actNumber ? `act${actNumber}` : 'full';
    console.log(`[polish-episode] Polishing ${identifier} for project ${projectId}`);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create generation block record
    const blockId = crypto.randomUUID();
    await supabase
      .from('generation_blocks')
      .insert({
        id: blockId,
        project_id: projectId,
        block_type: 'polish',
        block_index: episodeNumber || actNumber || 1,
        episode_number: episodeNumber,
        status: 'generating',
        started_at: new Date().toISOString(),
        input_context: { 
          contentLength: scriptContent.length,
          targetWordCount
        }
      });

    // Build prompt and call AI
    const prompt = buildPolishPrompt(
      scriptContent,
      bibleStyleGuide,
      targetWordCount
    );

    let result: any;
    try {
      result = await callAI(prompt);
    } catch (aiError: any) {
      console.error('[polish-episode] AI error:', aiError);
      
      await supabase
        .from('generation_blocks')
        .update({ 
          status: 'failed',
          error_message: aiError.message,
          error_code: aiError.message?.includes('TIMEOUT') ? 'AI_TIMEOUT' : 'AI_ERROR',
          completed_at: new Date().toISOString()
        })
        .eq('id', blockId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'AI_GENERATION_FAILED', 
          message: aiError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract polished content
    const polishedContent = result.polished_content || result.polishedContent || '';
    const changes = result.changes || {
      voice_corrections: 0,
      continuity_fixes: 0,
      format_fixes: 0,
      dialogue_polish: 0
    };
    const notes = result.notes || [];

    if (!polishedContent) {
      await supabase
        .from('generation_blocks')
        .update({ 
          status: 'failed',
          error_message: 'No polished content returned',
          error_code: 'EMPTY_RESULT',
          completed_at: new Date().toISOString()
        })
        .eq('id', blockId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'EMPTY_RESULT', 
          message: 'AI returned no polished content' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate stats
    const originalWordCount = scriptContent.split(/\s+/).length;
    const polishedWordCount = polishedContent.split(/\s+/).length;
    const totalChanges = 
      (changes.voice_corrections || 0) + 
      (changes.continuity_fixes || 0) + 
      (changes.format_fixes || 0) + 
      (changes.dialogue_polish || 0);

    // Update block with success
    await supabase
      .from('generation_blocks')
      .update({ 
        status: 'done',
        output_data: { 
          polishedContent,
          changes,
          notes
        },
        continuity_summary: {
          originalWordCount,
          polishedWordCount,
          totalChanges,
          changeBreakdown: changes
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', blockId);

    console.log(`[polish-episode] Polish complete: ${totalChanges} changes, ${polishedWordCount} words`);

    return new Response(
      JSON.stringify({
        success: true,
        blockId,
        polishedContent,
        stats: {
          originalWordCount,
          polishedWordCount,
          wordCountDelta: polishedWordCount - originalWordCount,
          totalChanges,
          changes
        },
        notes
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[polish-episode] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'INTERNAL_ERROR', 
        message: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
