import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptDoctorRequest {
  scriptText: string;
  styleBible?: {
    genre?: string;
    tone?: string;
    realism_level?: string;
  };
  focusAreas?: string[];
  language?: string;
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_DOCTOR: un Script Doctor profesional de Hollywood con experiencia en más de 100 producciones.

TU MISIÓN: Analizar guiones y proporcionar feedback profesional, constructivo y accionable.

FORMATO DE SALIDA OBLIGATORIO (JSON):
{
  "overall_assessment": {
    "score": number (1-100),
    "summary": "string (resumen ejecutivo de 2-3 frases)",
    "strengths": ["array de puntos fuertes"],
    "critical_issues": ["array de problemas graves que deben resolverse"]
  },
  "suggestions": [
    {
      "id": "string (unique)",
      "category": "structure | character | dialogue | pacing | visual | continuity | tone | format",
      "severity": "low | medium | high | critical",
      "location": "string (número de escena o rango de páginas si aplica)",
      "issue": "string (descripción clara del problema)",
      "reason": "string (por qué es un problema)",
      "suggestion": "string (sugerencia de mejora)",
      "rewrite_snippet": "string (opcional: ejemplo de rewrite específico)",
      "impact": "string (qué mejorará si se aplica)"
    }
  ],
  "structure_analysis": {
    "act_1_setup": { "present": boolean, "notes": "string" },
    "inciting_incident": { "present": boolean, "page": "string", "notes": "string" },
    "act_2_confrontation": { "present": boolean, "notes": "string" },
    "midpoint": { "present": boolean, "page": "string", "notes": "string" },
    "act_3_resolution": { "present": boolean, "notes": "string" },
    "climax": { "present": boolean, "notes": "string" }
  },
  "character_analysis": [
    {
      "name": "string",
      "arc_present": boolean,
      "motivation_clear": boolean,
      "voice_distinct": boolean,
      "notes": "string"
    }
  ],
  "dialogue_quality": {
    "score": number (1-100),
    "natural_flow": boolean,
    "subtext_present": boolean,
    "exposition_issues": boolean,
    "notes": "string"
  },
  "visual_storytelling": {
    "score": number (1-100),
    "show_dont_tell": boolean,
    "action_descriptions": "string",
    "notes": "string"
  },
  "market_viability": {
    "target_audience": "string",
    "comparable_titles": ["array"],
    "commercial_potential": "low | medium | high",
    "notes": "string"
  },
  "ai_artifact_check": {
    "detected_issues": [
      {
        "type": "cliche | exposition_dump | flat_dialogue | generic_description",
        "location": "string",
        "example": "string",
        "fix": "string"
      }
    ]
  }
}

ÁREAS DE ANÁLISIS:
1. ESTRUCTURA: ¿Sigue una estructura narrativa sólida? Beats, timing, arcos.
2. PERSONAJES: ¿Son tridimensionales? ¿Tienen arcos claros? ¿Motivaciones?
3. DIÁLOGO: ¿Es natural? ¿Tiene subtexto? ¿Cada personaje tiene voz propia?
4. RITMO: ¿El pacing es adecuado? ¿Hay tensión? ¿Momentos de respiro?
5. VISUAL: ¿Es cinematográfico? ¿Show don't tell?
6. CONTINUIDAD: ¿Hay errores de continuidad?
7. TONO: ¿Es consistente con el género?
8. FORMATO: ¿Sigue el formato estándar de la industria?

REGLAS:
- Sé específico: cita líneas o escenas concretas
- Sé constructivo: siempre ofrece solución
- No impongas cambios: sugiere opciones
- Detecta artefactos de IA: exposición forzada, clichés, diálogos planos
- Prioriza: ordena por severidad (critical > high > medium > low)

IDIOMA: Responde en el idioma indicado.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ScriptDoctorRequest = await req.json();
    const { scriptText, styleBible, focusAreas, language } = request;

    if (!scriptText || scriptText.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un guion con al menos 100 caracteres para analizar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const userPrompt = `
ANÁLISIS DE GUION SOLICITADO:

${styleBible ? `STYLE BIBLE DEL PROYECTO:
- Género: ${styleBible.genre || 'No especificado'}
- Tono: ${styleBible.tone || 'No especificado'}
- Nivel de realismo: ${styleBible.realism_level || 'Cinematic_Real'}
` : ''}

${focusAreas?.length ? `ÁREAS DE ENFOQUE PRIORITARIO: ${focusAreas.join(', ')}` : ''}

IDIOMA DE RESPUESTA: ${language || 'es-ES'}

GUION A ANALIZAR:
---
${scriptText}
---

Analiza este guion de forma profesional y exhaustiva. Proporciona feedback específico, accionable y constructivo siguiendo el formato JSON especificado.

IMPORTANTE: 
- Detecta y señala cualquier "artefacto de IA" (clichés, exposición forzada, diálogos genéricos)
- Sé específico con las ubicaciones de los problemas
- Prioriza los issues por severidad
- Incluye rewrites de ejemplo para los problemas más importantes`;

    console.log('Analyzing script, length:', scriptText.length);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from AI');
    }

    // Parse JSON from response
    let analysisData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Return a structured fallback
      analysisData = {
        overall_assessment: {
          score: 70,
          summary: content.substring(0, 500),
          strengths: [],
          critical_issues: []
        },
        suggestions: [],
        raw_analysis: content
      };
    }

    console.log('Script analysis complete, suggestions:', analysisData.suggestions?.length || 0);

    return new Response(
      JSON.stringify({
        success: true,
        analysis: analysisData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-doctor:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
