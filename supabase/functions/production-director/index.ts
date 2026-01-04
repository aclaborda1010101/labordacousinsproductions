import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// ANÁLISIS DE INTENCIÓN Y ROUTING
// =============================================================================

interface QueryAnalysis {
  intent: 'create_project' | 'create_character' | 'create_location' | 'generate_script' | 'technical_question' | 'creative_guidance' | 'project_review' | 'general_chat';
  requiresAction: boolean;
  emotionalState: 'frustrated' | 'enthusiastic' | 'confused' | 'neutral' | 'excited';
  isFollowUp: boolean;
  needsMoreInfo: boolean;
  extractedData: {
    projectType?: string;
    style?: string;
    duration?: string;
    characters?: string[];
    theme?: string;
    audience?: string;
  };
}

function analyzeIntent(query: string, conversationHistory: any[], projectContext: string): QueryAnalysis {
  const q = query.toLowerCase();
  
  // Detectar intención principal
  let intent: QueryAnalysis['intent'] = 'general_chat';
  let requiresAction = false;
  let needsMoreInfo = false;
  
  // Crear proyecto nuevo
  const createProjectPatterns = [
    'quiero hacer', 'me gustaría hacer', 'crear', 'nuevo proyecto', 'vídeo', 'video', 'corto', 
    'película', 'pelicula', 'serie', 'episodio', 'anuncio', 'spot', 'comercial', 'trailer'
  ];
  
  // Personajes
  const characterPatterns = ['personaje', 'protagonista', 'antagonista', 'character'];
  
  // Locaciones
  const locationPatterns = ['locación', 'locacion', 'escenario', 'lugar', 'location'];
  
  // Guión
  const scriptPatterns = ['guión', 'guion', 'script', 'historia', 'escenas', 'diálogo', 'dialogo'];
  
  // Preguntas técnicas
  const technicalPatterns = ['lente', 'cámara', 'camara', 'iluminación', 'iluminacion', 'plano', 'encuadre', 'fps', 'resolución'];
  
  // Detectar estilo mencionado
  const stylePatterns = {
    'disney': 'Disney/Pixar 3D Animation',
    'pixar': 'Disney/Pixar 3D Animation',
    'anime': 'Anime',
    'ghibli': 'Studio Ghibli',
    'realista': 'Photorealistic',
    'cartoon': 'Cartoon 2D',
    'noir': 'Film Noir',
    'cyberpunk': 'Cyberpunk',
    'vintage': 'Vintage Film',
  };
  
  let detectedStyle = '';
  for (const [key, value] of Object.entries(stylePatterns)) {
    if (q.includes(key)) {
      detectedStyle = value;
      break;
    }
  }
  
  // Detectar tipo de proyecto
  let projectType = '';
  if (q.includes('corto') || q.includes('short')) projectType = 'short';
  else if (q.includes('película') || q.includes('pelicula') || q.includes('movie')) projectType = 'feature';
  else if (q.includes('serie') || q.includes('episodio')) projectType = 'series';
  else if (q.includes('anuncio') || q.includes('comercial') || q.includes('spot')) projectType = 'commercial';
  else if (q.includes('vídeo') || q.includes('video')) projectType = 'video';
  
  // Detectar audiencia
  let audience = '';
  if (q.includes('hijo') || q.includes('hija') || q.includes('niño') || q.includes('niña') || q.includes('cumpleaños') || q.includes('infantil')) {
    audience = 'children';
  }
  
  // Detectar tema si lo menciona
  let theme = '';
  if (q.includes('cumpleaños')) theme = 'birthday';
  else if (q.includes('aventura')) theme = 'adventure';
  else if (q.includes('amor')) theme = 'romance';
  
  // Asignar intención
  if (createProjectPatterns.some(p => q.includes(p)) && (projectType || detectedStyle)) {
    intent = 'create_project';
    requiresAction = true;
    // Necesita más info si no tiene suficientes datos
    needsMoreInfo = !projectType || !detectedStyle || !audience;
  } else if (characterPatterns.some(p => q.includes(p))) {
    intent = 'create_character';
    requiresAction = true;
  } else if (locationPatterns.some(p => q.includes(p))) {
    intent = 'create_location';
    requiresAction = true;
  } else if (scriptPatterns.some(p => q.includes(p))) {
    intent = 'generate_script';
    requiresAction = true;
  } else if (technicalPatterns.some(p => q.includes(p))) {
    intent = 'technical_question';
  } else if (q.includes('revisar') || q.includes('analiza') || q.includes('qué tal')) {
    intent = 'project_review';
  } else {
    intent = 'creative_guidance';
  }
  
  // Detectar estado emocional
  let emotionalState: QueryAnalysis['emotionalState'] = 'neutral';
  if (q.includes('frustrado') || q.includes('no funciona') || q.includes('???') || q.includes('!!')) {
    emotionalState = 'frustrated';
  } else if (q.includes('genial') || q.includes('perfecto') || q.includes('me encanta') || q.includes('!')) {
    emotionalState = 'enthusiastic';
  } else if (q.includes('gustaría') || q.includes('quiero') || detectedStyle) {
    emotionalState = 'excited';
  } else if (q.includes('no sé') || q.includes('cómo') || q.includes('?')) {
    emotionalState = 'confused';
  }
  
  // Es follow-up?
  const isFollowUp = conversationHistory.length > 2 || 
    q.startsWith('y ') || q.startsWith('pero ') || q.startsWith('también ') || 
    q.startsWith('vale') || q.startsWith('ok') || q.startsWith('sí');
  
  return {
    intent,
    requiresAction,
    emotionalState,
    isFollowUp,
    needsMoreInfo,
    extractedData: {
      projectType: projectType || undefined,
      style: detectedStyle || undefined,
      audience: audience || undefined,
      theme: theme || undefined,
    }
  };
}

function selectModel(analysis: QueryAnalysis, contextLength: number): { model: string; reason: string } {
  // Siempre Pro para acciones y creatividad
  if (analysis.requiresAction || analysis.intent === 'creative_guidance' || analysis.intent === 'create_project') {
    return { model: 'google/gemini-2.5-pro', reason: 'Guía creativa y acciones' };
  }
  
  // Técnico simple → Flash
  if (analysis.intent === 'technical_question' && !analysis.needsMoreInfo) {
    return { model: 'google/gemini-2.5-flash', reason: 'Consulta técnica' };
  }
  
  // Contexto largo → Pro
  if (contextLength > 4000) {
    return { model: 'google/gemini-2.5-pro', reason: 'Contexto extenso' };
  }
  
  // Default para chat general
  return { model: 'google/gemini-2.5-flash', reason: 'Respuesta rápida' };
}

// =============================================================================
// FORGE - SYSTEM PROMPT COMPLETO Y CONTEXTUAL
// =============================================================================

function buildForgePrompt(analysis: QueryAnalysis, projectContext: string): string {
  const basePersona = `## QUIÉN ERES

Eres **Forge**, el Director de Producción AI de CINEFORGE Studio. No eres un consultor externo—eres PARTE de esta plataforma de producción cinematográfica AI.

### Tu rol exacto:
- **Guías** a los usuarios paso a paso en la creación de sus proyectos
- **Ejecutas** acciones cuando el usuario quiere crear algo (proyectos, personajes, locaciones, scripts)
- **Preguntas** lo necesario para personalizar la producción—pero solo lo esencial
- **Produces** resultados: CINEFORGE puede generar video, imágenes, scripts, audio—TODO con AI

### LO QUE CINEFORGE PUEDE HACER (explícalo cuando sea relevante):
1. **Generación de Video AI**: Cortos animados, videos estilo Pixar/Disney, anime, realista, cualquier estilo visual
2. **Personajes AI**: Diseño visual completo con consistencia, expresiones, turnarounds
3. **Locaciones AI**: Escenarios y ambientes generados para cada escena
4. **Guiones AI**: Desde idea hasta screenplay completo con estructura profesional
5. **Audio AI**: Música, efectos, voces (en desarrollo)

### IMPORTANTE - NO DESANIMES NUNCA:
- Si alguien dice "quiero hacer un corto estilo Pixar" → ¡PERFECTO! Podemos hacerlo con AI
- Si alguien quiere algo para su hijo → ¡Genial! Personalizamos todo
- NUNCA digas "necesitas un equipo de animación 3D" o "es muy caro/complejo"
- SIEMPRE ofrece la solución dentro de CINEFORGE

### Tu personalidad:
- Entusiasta pero profesional
- Proactivo: ofreces hacer cosas, no solo explicar
- Directo: pocas preguntas, las justas
- Cálido: especialmente con proyectos personales (cumpleaños, familia, etc.)`;

  const actionGuidance = `
## CÓMO GUÍAS LA CREACIÓN

Cuando alguien quiere crear algo, sigue este flujo natural:

### 1. Captura la emoción y valida la idea
"¡Me encanta! Un corto estilo Pixar para el cumple de tu hijo va a quedar espectacular."

### 2. Haz 2-3 preguntas clave (máximo)
Solo pregunta lo ESENCIAL:
- ¿Cómo se llama? (para personalizar)
- ¿Qué le gusta? (dinosaurios, princesas, superhéroes, etc.)
- ¿Algún mensaje especial? (opcional)

### 3. Propón y confirma
"Te propongo: [descripción breve del corto]. ¿Te mola? Si sí, lo montamos."

### 4. Ejecuta
Cuando confirmen, responde con una ACCIÓN estructurada que el sistema puede ejecutar.

## FORMATO DE ACCIÓN (cuando vayas a crear algo)

Cuando el usuario confirme que quiere crear algo, incluye un bloque de acción así:

\`\`\`action
{
  "type": "create_project",
  "data": {
    "title": "El Cumpleaños Mágico de Lucas",
    "format": "short",
    "style": "disney_pixar",
    "duration_target": 3,
    "audience": "children",
    "synopsis": "Lucas descubre que su pastel de cumpleaños tiene poderes mágicos..."
  }
}
\`\`\`

O para personajes:
\`\`\`action
{
  "type": "create_character",
  "data": {
    "name": "Lucas",
    "role": "protagonist",
    "age": "7 años",
    "style": "disney_pixar",
    "traits": "curioso, aventurero, con una sonrisa contagiosa"
  }
}
\`\`\``;

  const emotionalAdaptation = analysis.emotionalState === 'excited' 
    ? `\n\n### NOTA: El usuario está emocionado con su idea. ¡Comparte ese entusiasmo! Valida primero, pregunta después.`
    : analysis.emotionalState === 'frustrated'
    ? `\n\n### NOTA: El usuario parece frustrado. Sé especialmente empático y ofrece soluciones inmediatas.`
    : analysis.emotionalState === 'confused'
    ? `\n\n### NOTA: El usuario parece confundido. Guíale paso a paso, sin abrumar.`
    : '';

  const contextSection = projectContext 
    ? `\n\n---\n\n## CONTEXTO DEL PROYECTO ACTUAL\n${projectContext}`
    : '\n\n---\n\n## CONTEXTO: El usuario está en un proyecto pero aún no tiene contenido. Puedes ofrecerle empezar a crear.';

  const extractedDataNote = analysis.extractedData.style || analysis.extractedData.projectType
    ? `\n\n### DATOS DETECTADOS EN SU MENSAJE:
${analysis.extractedData.style ? `- Estilo visual: ${analysis.extractedData.style}` : ''}
${analysis.extractedData.projectType ? `- Tipo de proyecto: ${analysis.extractedData.projectType}` : ''}
${analysis.extractedData.audience ? `- Audiencia: ${analysis.extractedData.audience}` : ''}
${analysis.extractedData.theme ? `- Tema: ${analysis.extractedData.theme}` : ''}

Usa estos datos para personalizar tu respuesta. No repitas preguntando lo que ya dijo.`
    : '';

  return basePersona + actionGuidance + emotionalAdaptation + contextSection + extractedDataNote + `

## EJEMPLOS DE RESPUESTAS CORRECTAS

**Usuario**: "Me gustaría hacer un vídeo corto para mi hijo para su cumpleaños de dibujo estilo Disney Pixar"

**TÚ**: "¡Qué regalazo! 🎬 Un corto estilo Pixar personalizado para su cumple va a flipar.

Para hacerlo especial, cuéntame:
1. ¿Cómo se llama tu hijo y cuántos cumple?
2. ¿Qué le mola? (dinosaurios, coches, superhéroes, magia...)

Con eso te propongo una mini-historia de 2-3 minutos que podemos generar completa: personaje con su cara estilizada, escenarios mágicos, y hasta música. 

¿Vamos?"

---

**Usuario**: "Se llama Lucas, cumple 7, y le flipan los dinosaurios"

**TÚ**: "¡Lucas y los dinosaurios, combo perfecto! 🦕

Te propongo: **'El Guardián de los Dinosaurios'** — Lucas descubre que tiene el poder de hablar con dinosaurios el día de su cumpleaños. Un T-Rex amigable llamado Rex le ayuda a encontrar el pastel mágico que concede deseos.

2-3 minutos, estilo Pixar, súper colorido y con mensaje positivo sobre la amistad.

¿Te mola? Si sí, empezamos a crear el personaje de Lucas ahora mismo."

[Si confirma, incluir bloque action para crear el proyecto]`;
}

const FLASH_PROMPT = `Eres Forge, Director de Producción de CINEFORGE Studio. Responde CONCISO y ÚTIL.

Reglas:
- CINEFORGE genera video, personajes, locaciones, scripts con AI
- NUNCA desanimes—siempre hay solución
- Si preguntan algo técnico, responde directo
- Si quieren crear algo, entusiásmate y guía`;

// =============================================================================
// CONTEXTO DEL PROYECTO
// =============================================================================

async function fetchProjectContext(supabase: any, projectId: string): Promise<string> {
  const contextParts: string[] = [];
  
  const { data: project } = await supabase
    .from('projects')
    .select('title, format, episodes_count, target_duration_min, bible_completeness_score, style_preset')
    .eq('id', projectId)
    .single();
  
  if (project) {
    contextParts.push(`**Proyecto**: "${project.title}"
- Formato: ${project.format || 'Por definir'}
- Duración objetivo: ${project.target_duration_min || '?'} min
- Estilo: ${project.style_preset || 'Por definir'}
- Completitud: ${project.bible_completeness_score || 0}%`);
  }
  
  const { data: characters } = await supabase
    .from('characters')
    .select('name, role, character_role')
    .eq('project_id', projectId)
    .limit(5);
  
  if (characters?.length) {
    contextParts.push(`**Personajes**: ${characters.map((c: any) => c.name).join(', ')}`);
  }
  
  const { data: locations } = await supabase
    .from('locations')
    .select('name')
    .eq('project_id', projectId)
    .limit(5);
  
  if (locations?.length) {
    contextParts.push(`**Locaciones**: ${locations.map((l: any) => l.name).join(', ')}`);
  }
  
  const { data: scripts } = await supabase
    .from('scripts')
    .select('title, parsed_json')
    .eq('project_id', projectId)
    .limit(1);
  
  if (scripts?.[0]?.parsed_json) {
    const parsed = scripts[0].parsed_json as any;
    if (parsed.synopsis) {
      contextParts.push(`**Sinopsis**: ${parsed.synopsis.slice(0, 300)}...`);
    }
  }
  
  return contextParts.length > 0 ? contextParts.join('\n') : '';
}

// =============================================================================
// SERVIDOR PRINCIPAL
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, messages } = await req.json();

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Obtener contexto del proyecto
    const projectContext = await fetchProjectContext(supabase, projectId);
    
    // Obtener el último mensaje del usuario
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    
    // Analizar intención y contexto
    const analysis = analyzeIntent(lastUserMessage, messages, projectContext);
    
    // Calcular longitud total del contexto
    const totalContextLength = projectContext.length + messages.reduce((acc: number, m: any) => acc + (m.content?.length || 0), 0);
    
    // Seleccionar modelo
    const { model, reason } = selectModel(analysis, totalContextLength);
    
    console.log(`[forge] Intent: ${analysis.intent} | Model: ${model} | Emotion: ${analysis.emotionalState} | Action: ${analysis.requiresAction}`);

    // Construir system prompt
    const systemPrompt = model === 'google/gemini-2.5-pro' 
      ? buildForgePrompt(analysis, projectContext)
      : FLASH_PROMPT + (projectContext ? `\n\nProyecto actual: ${projectContext.slice(0, 1000)}` : '');

    // Llamar a AI Gateway
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
        temperature: 0.8,
        max_tokens: 2000,
        top_p: 0.95,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Demasiadas peticiones. Dame un segundo y reintenta.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos agotados. Toca recargar para seguir creando.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'X-Model-Used': model,
        'X-Model-Reason': encodeURIComponent(reason),
        'X-Intent': analysis.intent,
        'X-Requires-Action': String(analysis.requiresAction)
      },
    });

  } catch (error) {
    console.error('forge error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
