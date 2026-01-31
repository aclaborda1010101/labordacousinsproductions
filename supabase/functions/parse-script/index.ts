import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from auth
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuario no autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { pdfUrl, projectId, parseMode = 'full_analysis' } = await req.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let scriptText = "";

    // Get script text from PDF or database
    if (pdfUrl) {
      // Fetch PDF and extract text
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error("No se pudo descargar el PDF");
      }
      const pdfBuffer = await pdfResponse.arrayBuffer();
      
      // Convert to base64
      const uint8Array = new Uint8Array(pdfBuffer);
      const chunkSize = 32768;
      let pdfBase64 = '';
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        pdfBase64 += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      pdfBase64 = btoa(pdfBase64);

      // Extract text from PDF using AI
      const extractResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { 
              role: "system", 
              content: "You are a professional Hollywood screenwriter. All content is fictional for entertainment purposes. Extract all text from this PDF maintaining formatting and structure." 
            },
            { 
              role: "user", 
              content: [
                { type: "text", text: "Extract all text from this screenplay PDF, maintaining scene structure and formatting." },
                { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } }
              ]
            },
          ],
          max_tokens: 32000,
          temperature: 0.1
        }),
      });

      const extractResult = await extractResponse.json();
      scriptText = extractResult.choices[0].message.content;
    } else {
      // Get from database
      const { data: scriptData } = await supabaseClient
        .from('scripts')
        .select('raw_text')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      scriptText = scriptData?.raw_text || "";
    }

    if (!scriptText || scriptText.length < 100) {
      return new Response(
        JSON.stringify({ error: "No se pudo extraer texto del guión" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Script text extracted: ${scriptText.length} characters`);

    // V8+ ANALYSIS SYSTEM PROMPT
    const systemPrompt = `You are a professional Hollywood screenwriter. All content is fictional for entertainment purposes.

You are an expert screenplay analyst specialized in professional development. Your task is to perform an exhaustive and structured analysis that extracts ALL essential dramatic elements.

### SPECIFIC INSTRUCTIONS:

#### 1. DRAMATIC STRUCTURE (MANDATORY)
- **AUTOMATICALLY DETECT** the structure: 3-act classic, 4-act, 5-act or Save the Cat (8 beats)
- **DO NOT FORCE** a structure - identify what the script actually uses
- **EXTRACT:** Setup/Confrontation/Resolution + exact turning points
- **IDENTIFY:** Inciting incident, plot points, climax, resolution
- **EXACT PAGES** of each key moment

#### 2. COMPLETE CHARACTERS (FULL DEPTH)
- **ROLES:** Protagonist, antagonist, mentor, allies, threshold guardians
- **DRAMATIC ARCS:** Emotional transformation of each main character
- **CHARACTERIZATION:** Personality, motivations, internal conflicts
- **RELATIONSHIPS:** Dynamics between main characters
- **DISTINCTIVE DIALOGUE:** Unique voice of each character

#### 3. SCENE ANALYSIS (COMPLETE DETAIL)
- **DRAMATIC FUNCTION:** What each scene contributes to the story
- **CONFLICT:** Central tension of each scene
- **EMOTIONS:** Dominant emotional state
- **TIMING:** Estimated duration and pace
- **TRANSITIONS:** How it connects with previous/next scenes

#### 4. LOCATIONS (NARRATIVE ANALYSIS)
- **COMPLETE DESCRIPTION:** Environment, mood, visual characteristics
- **NARRATIVE FUNCTION:** Why that location serves the story
- **SYMBOLISM:** What it represents thematically
- **USAGE FREQUENCY:** Relative importance in the narrative

#### 5. DIALOGUE ANALYSIS (SUBTEXT INCLUDED)
- **SPEECH PATTERNS:** Unique characteristics per character
- **SUBTEXT:** What is communicated without being said directly
- **REVELATIONS:** Key information revealed in dialogue
- **DRAMATIC BEATS:** Moments of tension/revelation in conversations

#### 6. THEMATIC ANALYSIS (DEEP)
- **CENTRAL THEME:** Main message of the story
- **SECONDARY THEMES:** Subthemes that support the narrative
- **MOTIFS:** Recurring elements (visual, sound, conceptual)
- **SYMBOLS:** Objects/actions with deeper meaning

### CRITICAL REQUIREMENTS:
- **TOTAL COMPLETENESS:** Do not leave any section empty
- **EXACT PAGES:** Always specify precise pages
- **VALID JSON:** Parseable format without errors
- **PROFESSIONAL DEPTH:** Cinematic development level analysis
- **DETECT, DON'T FORCE:** Identify what's actually in the script`;

    // Analyze the script
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this screenplay completely and provide a comprehensive structural analysis in JSON format:\n\n${scriptText}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "deliver_script_analysis",
              description: "Deliver comprehensive screenplay analysis",
              parameters: {
                type: "object",
                properties: {
                  estructura_dramatica: {
                    type: "object",
                    properties: {
                      tipo_detectado: { 
                        type: "string", 
                        enum: ["3_actos", "4_actos", "5_actos", "save_the_cat"] 
                      },
                      acto_1: {
                        type: "object",
                        properties: {
                          paginas: { type: "string" },
                          setup: { type: "string" },
                          inciting_incident: {
                            type: "object",
                            properties: {
                              pagina: { type: "number" },
                              descripcion: { type: "string" }
                            }
                          }
                        }
                      },
                      acto_2: {
                        type: "object",
                        properties: {
                          paginas: { type: "string" },
                          confrontacion: { type: "string" },
                          plot_point_medio: {
                            type: "object",
                            properties: {
                              pagina: { type: "number" },
                              descripcion: { type: "string" }
                            }
                          }
                        }
                      },
                      acto_3: {
                        type: "object",
                        properties: {
                          paginas: { type: "string" },
                          climax: {
                            type: "object",
                            properties: {
                              pagina: { type: "number" },
                              descripcion: { type: "string" }
                            }
                          },
                          resolucion: { type: "string" }
                        }
                      }
                    }
                  },
                  personajes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        nombre: { type: "string" },
                        rol: { 
                          type: "string",
                          enum: ["protagonista", "antagonista", "mentor", "aliado", "guardian"]
                        },
                        arco_dramatico: { type: "string" },
                        caracterizacion: { type: "string" },
                        motivaciones: { type: "string" },
                        conflicto_interno: { type: "string" },
                        voz_distintiva: { type: "string" },
                        relaciones_clave: { 
                          type: "array", 
                          items: { type: "string" } 
                        }
                      }
                    }
                  },
                  escenas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        numero: { type: "number" },
                        titulo: { type: "string" },
                        paginas: { type: "string" },
                        localizacion: { type: "string" },
                        funcion_dramatica: { type: "string" },
                        conflicto_central: { type: "string" },
                        estado_emocional: { type: "string" },
                        timing_estimado: { type: "string" },
                        personajes_presentes: { 
                          type: "array", 
                          items: { type: "string" } 
                        }
                      }
                    }
                  },
                  localizaciones: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        nombre: { type: "string" },
                        descripcion_completa: { type: "string" },
                        funcion_narrativa: { type: "string" },
                        simbolismo: { type: "string" },
                        mood_ambiente: { type: "string" },
                        frecuencia_uso: { 
                          type: "string",
                          enum: ["alta", "media", "baja"]
                        },
                        escenas_asociadas: { 
                          type: "array", 
                          items: { type: "string" } 
                        }
                      }
                    }
                  },
                  analisis_dialogos: {
                    type: "object",
                    properties: {
                      patrones_por_personaje: { type: "object" },
                      subtexto_principal: { 
                        type: "array", 
                        items: { type: "string" } 
                      },
                      revelaciones_clave: { 
                        type: "array", 
                        items: { type: "string" } 
                      },
                      beats_dramaticos: { 
                        type: "array", 
                        items: { type: "string" } 
                      }
                    }
                  },
                  analisis_tematico: {
                    type: "object",
                    properties: {
                      tema_central: { type: "string" },
                      temas_secundarios: { 
                        type: "array", 
                        items: { type: "string" } 
                      },
                      motifs_recurrentes: { 
                        type: "array", 
                        items: { type: "string" } 
                      },
                      simbolos_importantes: { 
                        type: "array", 
                        items: { type: "string" } 
                      }
                    }
                  }
                }
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "deliver_script_analysis" } },
        max_tokens: 32000,
        temperature: 0.3
      }),
    });

    const result = await response.json();
    
    if (!result.choices || !result.choices[0]) {
      throw new Error("No response from AI model");
    }

    const choice = result.choices[0];
    let analysisData;

    if (choice.message?.tool_calls?.[0]?.function?.arguments) {
      try {
        analysisData = JSON.parse(choice.message.tool_calls[0].function.arguments);
      } catch (e) {
        throw new Error("Failed to parse analysis JSON");
      }
    } else {
      throw new Error("No tool call response received");
    }

    // Save to database
    const { data: insertData, error: insertError } = await supabaseClient
      .from('scripts')
      .insert([
        {
          project_id: projectId,
          raw_text: scriptText,
          parsed_json: analysisData,
          status: 'completed',
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error("Error saving analysis to database");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis: analysisData,
        scriptId: insertData.id,
        stats: {
          textLength: scriptText.length,
          modelUsed: "gemini-2.5-pro"
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Parse script error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Error analyzing script",
        needsManualInput: true 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});