import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// ROUTER HÍBRIDO INTELIGENTE
// Determina qué modelo usar según la complejidad de la consulta
// =============================================================================

interface QuerySignals {
  requiresAnalysis: boolean;
  requiresSynthesis: boolean;
  longContextNeeded: boolean;
  creativeTask: boolean;
  multiStepReasoning: boolean;
  technicalLookup: boolean;
}

function analyzeQuery(query: string, contextLength: number): QuerySignals {
  const q = query.toLowerCase();
  
  // Palabras que indican análisis profundo
  const analysisKeywords = ['analiza', 'evalúa', 'compara', 'revisa', 'examina', 'diagnostica', 'identifica problemas', 'qué falla'];
  const synthesisKeywords = ['sugiere', 'propone', 'reescribe', 'mejora', 'alternativas', 'cómo debería', 'qué harías'];
  const creativeKeywords = ['arco', 'narrativa', 'personaje', 'desarrollo', 'conflicto', 'motivación', 'evolución', 'historia'];
  const multiStepKeywords = ['plan', 'estrategia', 'paso a paso', 'workflow', 'proceso', 'secuencia'];
  const technicalKeywords = ['qué lente', 'qué focal', 'iluminación', 'encuadre', 'plano', 'ángulo', 'apertura', 'iso', 'fps'];
  
  return {
    requiresAnalysis: analysisKeywords.some(k => q.includes(k)),
    requiresSynthesis: synthesisKeywords.some(k => q.includes(k)),
    longContextNeeded: contextLength > 4000,
    creativeTask: creativeKeywords.some(k => q.includes(k)),
    multiStepReasoning: multiStepKeywords.some(k => q.includes(k)),
    technicalLookup: technicalKeywords.some(k => q.includes(k)) && !synthesisKeywords.some(k => q.includes(k)),
  };
}

function selectModel(signals: QuerySignals): { model: string; reason: string } {
  // Si es lookup técnico simple → Flash
  if (signals.technicalLookup && !signals.requiresAnalysis && !signals.requiresSynthesis) {
    return { 
      model: 'google/gemini-2.5-flash', 
      reason: 'Consulta técnica directa' 
    };
  }
  
  // Si requiere razonamiento profundo → Pro
  if (
    signals.requiresAnalysis || 
    signals.requiresSynthesis || 
    signals.longContextNeeded || 
    signals.creativeTask || 
    signals.multiStepReasoning
  ) {
    return { 
      model: 'google/gemini-2.5-pro', 
      reason: signals.creativeTask ? 'Análisis narrativo/creativo' :
              signals.longContextNeeded ? 'Contexto extenso' :
              signals.requiresAnalysis ? 'Análisis profundo' :
              signals.requiresSynthesis ? 'Síntesis creativa' : 'Razonamiento multi-paso'
    };
  }
  
  // Default → Flash
  return { 
    model: 'google/gemini-2.5-flash', 
    reason: 'Respuesta rápida' 
  };
}

// =============================================================================
// SYSTEM PROMPTS EXPERTOS
// =============================================================================

const DIRECTOR_SYSTEM_PROMPT = `Eres el DIRECTOR DE PRODUCCIÓN de un estudio de cine/TV profesional. Tu nombre es "Forge" y eres el asesor principal de este proyecto.

## TU PERSONALIDAD
- Hablas como un showrunner veterano: directo, experimentado, con opiniones formadas
- Usas terminología profesional de producción pero la explicas cuando es necesario
- Eres exigente con la calidad pero constructivo en tus críticas
- Tienes sentido del humor seco y referencias cinéfilas cuando es apropiado
- NUNCA dices "como asistente de IA" ni rompes el personaje

## TU EXPERTISE TÉCNICO
Dominas profundamente:
- **Cinematografía**: Lentes (distancia focal, T-stops), composición, movimientos de cámara
- **Iluminación**: Ratios de contraste, temperatura de color, esquemas (3-point, Rembrandt, etc.)
- **Narrativa**: Estructura de 3/5 actos, arcos de personaje, setup/payoff, tensión dramática
- **Producción**: Scheduling, continuidad, raccord, blocking
- **Post-producción**: Ritmo de edición, color grading, sound design

## FORMATO DE RESPUESTA
- Sé CONCISO. Respuestas de 2-4 párrafos máximo salvo que pidan análisis extenso
- Usa **negritas** para términos técnicos clave
- Usa listas con viñetas para opciones o recomendaciones
- Si recomiendas algo, da UNA opción principal y menciona alternativas brevemente
- Termina con una pregunta de seguimiento o próximo paso cuando sea apropiado

## CONTEXTO DEL PROYECTO
Tienes acceso al contexto completo del proyecto que se te proporcionará. Úsalo para dar respuestas específicas y relevantes, no genéricas.

## EJEMPLOS DE TU ESTILO

Usuario: "¿Qué lente uso para un close-up emotivo?"
Tú: "Para un close-up emotivo, un **85mm** es el clásico—compresión favorecedora, poca distorsión facial. Si quieres más intimidad claustrofóbica, baja a **50mm** y acércate. ¿Es una revelación emocional o un momento de vulnerabilidad?"

Usuario: "El arco de María no funciona"
Tú: "Déjame revisar... [analiza contexto]. El problema es que su **punto de quiebre** en la escena 12 no tiene suficiente setup. Necesitas plantar al menos 2-3 momentos previos donde vemos su conflicto interno. ¿Quieres que te sugiera dónde insertarlos?"`;

const FLASH_SYSTEM_PROMPT = `Eres "Forge", el Director de Producción del estudio. Responde de forma CONCISA y DIRECTA.

Reglas:
- Respuestas de 1-2 párrafos máximo
- Terminología profesional pero accesible
- Si es técnico, da LA respuesta, no opciones
- Personalidad: showrunner veterano, directo, sin rodeos`;

// =============================================================================
// CONTEXTO DEL PROYECTO
// =============================================================================

async function fetchProjectContext(supabase: any, projectId: string): Promise<string> {
  const contextParts: string[] = [];
  
  // Fetch project basic info
  const { data: project } = await supabase
    .from('projects')
    .select('title, format, episodes_count, target_duration_min, bible_completeness_score')
    .eq('id', projectId)
    .single();
  
  if (project) {
    contextParts.push(`## PROYECTO: ${project.title}
- Formato: ${project.format} (${project.episodes_count} episodios)
- Duración objetivo: ${project.target_duration_min} min/episodio
- Bible completeness: ${project.bible_completeness_score}%`);
  }
  
  // Fetch characters
  const { data: characters } = await supabase
    .from('characters')
    .select('name, role, bio, character_role')
    .eq('project_id', projectId)
    .limit(10);
  
  if (characters?.length) {
    const charList = characters.map((c: any) => 
      `- **${c.name}** (${c.character_role || c.role || 'Personaje'}): ${c.bio?.slice(0, 100) || 'Sin bio'}...`
    ).join('\n');
    contextParts.push(`## PERSONAJES\n${charList}`);
  }
  
  // Fetch locations
  const { data: locations } = await supabase
    .from('locations')
    .select('name, setting_type, mood')
    .eq('project_id', projectId)
    .limit(10);
  
  if (locations?.length) {
    const locList = locations.map((l: any) => 
      `- **${l.name}** (${l.setting_type || 'Locación'}): ${l.mood || 'Ambiente por definir'}`
    ).join('\n');
    contextParts.push(`## LOCACIONES\n${locList}`);
  }
  
  // Fetch current script summary if exists
  const { data: scripts } = await supabase
    .from('scripts')
    .select('title, parsed_json')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (scripts?.[0]?.parsed_json) {
    const parsed = scripts[0].parsed_json as any;
    if (parsed.synopsis) {
      contextParts.push(`## SINOPSIS\n${parsed.synopsis.slice(0, 500)}...`);
    }
    if (parsed.scenes?.length) {
      contextParts.push(`- Total escenas: ${parsed.scenes.length}`);
    }
  }
  
  return contextParts.join('\n\n');
}

// =============================================================================
// SERVIDOR
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, messages, conversationId } = await req.json();

    if (!projectId || !messages?.length) {
      return new Response(
        JSON.stringify({ error: 'projectId y messages son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Initialize Supabase for context fetching
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch project context
    const projectContext = await fetchProjectContext(supabase, projectId);
    
    // Get the last user message for routing analysis
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    
    // Calculate total context length
    const totalContextLength = projectContext.length + messages.reduce((acc: number, m: any) => acc + (m.content?.length || 0), 0);
    
    // Router: Select model based on query analysis
    const signals = analyzeQuery(lastUserMessage, totalContextLength);
    const { model, reason } = selectModel(signals);
    
    console.log(`[production-director] Model: ${model} | Reason: ${reason} | Context: ${totalContextLength} chars`);

    // Build system prompt with context
    const systemPrompt = model === 'google/gemini-2.5-pro' 
      ? `${DIRECTOR_SYSTEM_PROMPT}\n\n---\n\n${projectContext}`
      : `${FLASH_SYSTEM_PROMPT}\n\nContexto:\n${projectContext.slice(0, 2000)}`;

    // Call AI Gateway with streaming
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
        temperature: model === 'google/gemini-2.5-pro' ? 0.7 : 0.5,
        max_tokens: model === 'google/gemini-2.5-pro' ? 2000 : 800,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Intenta de nuevo en unos segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos agotados. Añade más créditos para continuar.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    // Return streaming response with model info in header
    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'X-Model-Used': model,
        'X-Model-Reason': encodeURIComponent(reason)
      },
    });

  } catch (error) {
    console.error('production-director error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
