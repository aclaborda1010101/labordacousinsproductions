import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// TIPOS Y HERRAMIENTAS DISPONIBLES
// =============================================================================

const FORGE_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_project",
      description: "Crea un nuevo proyecto de producción audiovisual en CINEFORGE",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título del proyecto" },
          format: { type: "string", enum: ["short", "feature", "series", "commercial", "music_video"], description: "Formato del proyecto" },
          style_preset: { type: "string", description: "Estilo visual (disney_pixar, anime, realistic, noir, etc.)" },
          target_duration_min: { type: "number", description: "Duración objetivo en minutos" },
          synopsis: { type: "string", description: "Sinopsis breve del proyecto" },
          audience: { type: "string", description: "Audiencia objetivo (children, teens, adults, all)" }
        },
        required: ["title", "format", "style_preset"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_character",
      description: "Crea un nuevo personaje para el proyecto actual",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre del personaje" },
          character_role: { type: "string", enum: ["lead", "supporting", "featured", "background"], description: "Rol del personaje" },
          bio: { type: "string", description: "Biografía breve del personaje" },
          visual_traits: { type: "string", description: "Descripción visual (edad, apariencia, vestimenta)" },
          personality: { type: "string", description: "Rasgos de personalidad" }
        },
        required: ["name", "character_role"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_location",
      description: "Crea una nueva locación/escenario para el proyecto",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre de la locación" },
          setting_type: { type: "string", enum: ["INT", "EXT", "INT/EXT"], description: "Tipo de escenario" },
          description: { type: "string", description: "Descripción del lugar" },
          mood: { type: "string", description: "Atmósfera/mood del lugar" },
          time_of_day: { type: "string", description: "Momento del día típico" }
        },
        required: ["name", "setting_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_script_outline",
      description: "Genera un outline/esquema de guión basado en la idea",
      parameters: {
        type: "object",
        properties: {
          premise: { type: "string", description: "Premisa o idea central" },
          num_scenes: { type: "number", description: "Número aproximado de escenas" },
          tone: { type: "string", description: "Tono de la historia (comedy, drama, adventure, etc.)" },
          include_characters: { type: "array", items: { type: "string" }, description: "Nombres de personajes a incluir" }
        },
        required: ["premise"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "navigate_to",
      description: "Navega al usuario a una sección específica del proyecto",
      parameters: {
        type: "object",
        properties: {
          section: { type: "string", enum: ["characters", "locations", "script", "scenes", "shots", "settings", "bible"], description: "Sección a la que navegar" }
        },
        required: ["section"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "suggest_next_step",
      description: "Sugiere el siguiente paso lógico basado en el estado del proyecto",
      parameters: {
        type: "object",
        properties: {
          context: { type: "string", description: "Contexto adicional para la sugerencia" }
        }
      }
    }
  }
];

// =============================================================================
// ANÁLISIS DE INTENCIÓN
// =============================================================================

interface UserProfile {
  level: 'explorer' | 'creator' | 'professional';
  creativeModeMode: 'assisted' | 'director' | 'pro';
  interactionCount: number;
}

function getUserProfileFromContext(projectContext: any, preferences: any): UserProfile {
  // Default basado en preferencias guardadas o contexto del proyecto
  const creativeMode = projectContext?.creative_mode || 'assisted';
  const interactionCount = preferences?.interaction_count || 0;
  
  // Mapear creative mode a user level
  let level: UserProfile['level'] = 'explorer';
  if (creativeMode === 'pro') level = 'professional';
  else if (creativeMode === 'director') level = 'creator';
  
  return {
    level,
    creativeModeMode: creativeMode,
    interactionCount
  };
}

function buildAdaptivePrompt(profile: UserProfile, projectContext: string, conversationHistory: any[]): string {
  const isFirstInteraction = conversationHistory.length <= 2;
  
  // Vocabulario adaptado por nivel
  const vocabularyGuide = {
    explorer: `
### ADAPTACIÓN: Usuario EXPLORER (principiante)
- Usa lenguaje simple y accesible, evita jerga técnica
- Explica brevemente cuando uses términos de producción
- Sé más guiado: ofrece opciones en lugar de preguntas abiertas
- Celebra pequeños logros para mantener motivación
- Ejemplo: "¿Qué te parece si empezamos creando el personaje principal? Solo necesito saber cómo se llama y cómo es."`,
    
    creator: `
### ADAPTACIÓN: Usuario CREATOR (intermedio)
- Puedes usar terminología de producción básica sin explicar cada término
- Ofrece opciones pero deja espacio para ideas propias
- Sé eficiente pero mantén calidez
- Ejemplo: "Para el look Pixar, ¿prefieres un estilo más estilizado tipo 'Coco' o más realista tipo 'Soul'?"`,
    
    professional: `
### ADAPTACIÓN: Usuario PROFESSIONAL (experto)
- Habla de igual a igual, usa terminología técnica libremente
- Sé directo y conciso, sin explicaciones innecesarias
- Ofrece control granular y opciones avanzadas
- Ejemplo: "¿Qué aspect ratio prefieres? El 2.39:1 funcionaría bien para el estilo épico, pero 1.85:1 daría más versatilidad."`
  };

  const basePrompt = `## FORGE - Director de Producción AI de CINEFORGE

Eres **Forge**, el Director de Producción AI integrado en CINEFORGE Studio. No eres un consultor externo—eres PARTE de esta plataforma de producción cinematográfica AI.

${vocabularyGuide[profile.level]}

### TU ROL EXACTO:
1. **GUÍAS** paso a paso en la creación de proyectos audiovisuales
2. **EJECUTAS** acciones reales cuando el usuario confirma (crear proyectos, personajes, locaciones, guiones)
3. **PREGUNTAS** solo lo esencial para personalizar
4. **PRODUCES** resultados: CINEFORGE genera video, imágenes, scripts, audio—TODO con AI

### LO QUE CINEFORGE PUEDE HACER:
- 🎬 **Video AI**: Cortos animados en cualquier estilo (Pixar, Anime, Realista, etc.)
- 👤 **Personajes AI**: Diseño visual completo con consistencia
- 🏔️ **Locaciones AI**: Escenarios generados para cada escena
- 📝 **Guiones AI**: Desde idea hasta screenplay profesional
- 🎵 **Audio AI**: Música y efectos (en desarrollo)

### REGLA FUNDAMENTAL - NUNCA DESANIMES:
- "Quiero un corto estilo Pixar" → ¡PERFECTO! Lo hacemos con AI
- "Es para mi hijo" → ¡Genial! Personalizamos todo
- NUNCA digas "necesitas un equipo" o "es muy caro/complejo"
- SIEMPRE ofrece la solución dentro de CINEFORGE

### CÓMO USAS LAS HERRAMIENTAS:
Cuando el usuario confirme que quiere crear algo, USA LA HERRAMIENTA CORRESPONDIENTE:
- Quiere crear proyecto → usa create_project
- Quiere crear personaje → usa create_character  
- Quiere crear locación → usa create_location
- Quiere empezar el guión → usa generate_script_outline
- Necesita ir a algún sitio → usa navigate_to
- No sabe qué hacer → usa suggest_next_step

### FLUJO DE CONVERSACIÓN:
1. **Captura la emoción**: "¡Me encanta la idea!" 
2. **Pregunta lo esencial** (máx 2-3 preguntas)
3. **Propón algo concreto**: "Te propongo X... ¿te mola?"
4. **Si confirma → EJECUTA** con la herramienta apropiada

${isFirstInteraction ? `
### NOTA: Es la primera interacción. Sé especialmente acogedor.` : ''}

---

## CONTEXTO DEL PROYECTO ACTUAL
${projectContext || 'El proyecto está vacío. Puedes ofrecerle empezar a crear.'}

---

## PERSONALIDAD
- Entusiasta pero profesional
- Proactivo: ofreces hacer, no solo explicar
- Directo: pocas preguntas, las justas
- Cálido: especialmente con proyectos personales`;

  return basePrompt;
}

// =============================================================================
// CONTEXTO DEL PROYECTO
// =============================================================================

async function fetchFullContext(supabase: any, projectId: string, userId: string) {
  // Proyecto
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  // Personajes
  const { data: characters } = await supabase
    .from('characters')
    .select('id, name, character_role, bio, arc')
    .eq('project_id', projectId)
    .limit(10);

  // Locaciones
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, setting_type, mood')
    .eq('project_id', projectId)
    .limit(10);

  // Script
  const { data: scripts } = await supabase
    .from('scripts')
    .select('title, parsed_json')
    .eq('project_id', projectId)
    .limit(1);

  // Preferencias del usuario
  const { data: preferences } = await supabase
    .from('forge_user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Conversación activa
  const { data: activeConversation } = await supabase
    .from('forge_conversations')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Mensajes previos si hay conversación
  let previousMessages: any[] = [];
  if (activeConversation) {
    const { data: messages } = await supabase
      .from('forge_messages')
      .select('role, content')
      .eq('conversation_id', activeConversation.id)
      .order('created_at', { ascending: true })
      .limit(20);
    previousMessages = messages || [];
  }

  // Construir contexto legible
  let contextString = '';
  
  if (project) {
    contextString += `**Proyecto**: "${project.title}"
- Formato: ${project.format || 'Por definir'}
- Estilo: ${project.style_preset || 'Por definir'}
- Duración: ${project.target_duration_min || '?'} min
- Completitud Bible: ${project.bible_completeness_score || 0}%
- Modo creativo: ${project.creative_mode || 'assisted'}
`;
  }

  if (characters?.length) {
    contextString += `\n**Personajes (${characters.length})**: ${characters.map((c: any) => `${c.name} (${c.character_role})`).join(', ')}`;
  } else {
    contextString += '\n**Personajes**: Ninguno creado aún';
  }

  if (locations?.length) {
    contextString += `\n**Locaciones (${locations.length})**: ${locations.map((l: any) => l.name).join(', ')}`;
  } else {
    contextString += '\n**Locaciones**: Ninguna creada aún';
  }

  if (scripts?.[0]?.parsed_json) {
    const parsed = scripts[0].parsed_json as any;
    contextString += `\n**Guión**: ${scripts[0].title || 'Sin título'}`;
    if (parsed.scenes?.length) {
      contextString += ` (${parsed.scenes.length} escenas)`;
    }
  } else {
    contextString += '\n**Guión**: No iniciado';
  }

  return {
    project,
    characters,
    locations,
    scripts,
    preferences,
    activeConversation,
    previousMessages,
    contextString
  };
}

// =============================================================================
// EJECUTAR ACCIONES
// =============================================================================

async function executeToolCall(supabase: any, toolCall: any, projectId: string, userId: string, conversationId: string) {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = JSON.parse(args);
  
  console.log(`[forge] Executing tool: ${name}`, parsedArgs);
  
  // Registrar la acción
  const { data: action } = await supabase
    .from('forge_actions')
    .insert({
      conversation_id: conversationId,
      action_type: name,
      action_data: parsedArgs,
      status: 'executing'
    })
    .select()
    .single();

  let result: any = { success: false };

  try {
    switch (name) {
      case 'create_project':
        // Actualizar el proyecto actual con los nuevos datos
        const { error: projectError } = await supabase
          .from('projects')
          .update({
            title: parsedArgs.title,
            format: parsedArgs.format,
            style_preset: parsedArgs.style_preset,
            target_duration_min: parsedArgs.target_duration_min || 3,
            synopsis: parsedArgs.synopsis
          })
          .eq('id', projectId);
        
        if (projectError) throw projectError;
        result = { success: true, message: `Proyecto "${parsedArgs.title}" configurado`, projectId };
        break;

      case 'create_character':
        const { data: newChar, error: charError } = await supabase
          .from('characters')
          .insert({
            project_id: projectId,
            name: parsedArgs.name,
            character_role: parsedArgs.character_role,
            bio: parsedArgs.bio || '',
            role: parsedArgs.personality || ''
          })
          .select()
          .single();
        
        if (charError) throw charError;
        result = { success: true, message: `Personaje "${parsedArgs.name}" creado`, characterId: newChar.id };
        break;

      case 'create_location':
        const { data: newLoc, error: locError } = await supabase
          .from('locations')
          .insert({
            project_id: projectId,
            name: parsedArgs.name,
            setting_type: parsedArgs.setting_type,
            description: parsedArgs.description || '',
            mood: parsedArgs.mood || ''
          })
          .select()
          .single();
        
        if (locError) throw locError;
        result = { success: true, message: `Locación "${parsedArgs.name}" creada`, locationId: newLoc.id };
        break;

      case 'generate_script_outline':
        // Esto debería llamar a otra edge function, por ahora retornamos la instrucción
        result = { 
          success: true, 
          message: 'Outline listo para generar',
          action: 'generate_outline',
          params: parsedArgs
        };
        break;

      case 'navigate_to':
        result = { success: true, action: 'navigate', section: parsedArgs.section };
        break;

      case 'suggest_next_step':
        result = { success: true, action: 'suggestion', context: parsedArgs.context };
        break;

      default:
        result = { success: false, error: `Herramienta desconocida: ${name}` };
    }

    // Actualizar acción como completada
    await supabase
      .from('forge_actions')
      .update({ status: 'completed', result, completed_at: new Date().toISOString() })
      .eq('id', action.id);

  } catch (error: any) {
    result = { success: false, error: error.message };
    await supabase
      .from('forge_actions')
      .update({ status: 'failed', error: error.message })
      .eq('id', action.id);
  }

  return result;
}

// =============================================================================
// SERVIDOR PRINCIPAL
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, messages, userId, conversationId: existingConvId } = await req.json();

    if (!projectId || !messages?.length) {
      return new Response(
        JSON.stringify({ error: 'projectId y messages son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Obtener contexto completo
    const context = await fetchFullContext(supabase, projectId, userId || 'anonymous');
    
    // Obtener o crear conversación
    let conversationId = existingConvId;
    if (!conversationId && userId) {
      if (context.activeConversation) {
        conversationId = context.activeConversation.id;
      } else {
        const { data: newConv } = await supabase
          .from('forge_conversations')
          .insert({ project_id: projectId, user_id: userId })
          .select()
          .single();
        conversationId = newConv?.id;
      }
    }

    // Guardar mensaje del usuario
    if (conversationId) {
      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg.role === 'user') {
        await supabase.from('forge_messages').insert({
          conversation_id: conversationId,
          role: 'user',
          content: lastUserMsg.content
        });
      }
    }

    // Determinar perfil del usuario
    const profile = getUserProfileFromContext(context.project, context.preferences);
    
    // Construir prompt adaptativo
    const systemPrompt = buildAdaptivePrompt(profile, context.contextString, messages);
    
    // Combinar con mensajes previos de la conversación si existen
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...context.previousMessages.slice(-10), // Últimos 10 mensajes de contexto
      ...messages
    ];

    console.log(`[forge] Profile: ${profile.level} | Project: ${context.project?.title || 'Unnamed'} | Messages: ${fullMessages.length}`);

    // Llamar a AI con herramientas
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: fullMessages,
        tools: FORGE_TOOLS,
        tool_choice: 'auto',
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: 'Dame un segundo, hay mucho tráfico.' }), 
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos agotados. Toca recargar.' }), 
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiResponse = await response.json();
    const choice = aiResponse.choices?.[0];
    
    // Procesar tool calls si existen
    let executedActions: any[] = [];
    if (choice?.message?.tool_calls?.length) {
      for (const toolCall of choice.message.tool_calls) {
        const result = await executeToolCall(supabase, toolCall, projectId, userId, conversationId);
        executedActions.push({ tool: toolCall.function.name, result });
      }
    }

    // Obtener contenido de respuesta
    const assistantContent = choice?.message?.content || '';
    
    // Guardar respuesta del asistente
    if (conversationId && assistantContent) {
      await supabase.from('forge_messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantContent,
        model_used: 'gemini-2.5-pro',
        action_executed: executedActions.length > 0 ? executedActions : null
      });
    }

    // Actualizar contador de interacciones
    if (userId) {
      await supabase.from('forge_user_preferences')
        .upsert({
          user_id: userId,
          interaction_count: (context.preferences?.interaction_count || 0) + 1,
          last_interaction_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    }

    return new Response(
      JSON.stringify({
        content: assistantContent,
        actions: executedActions,
        conversationId,
        profile: profile.level
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('forge error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
