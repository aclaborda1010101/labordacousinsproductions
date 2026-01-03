import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  characterId: string;
  projectId: string;
  faceImageUrl: string;       // face_front
  faceSideImageUrl?: string;  // face_side
  bodyImageUrl: string;       // body_front
  bodySideImageUrl?: string;  // body_side
  celebrityMix?: string;
  characterName?: string;
}

const ANALYSIS_PROMPT = `Analiza estas imágenes de referencia del Identity Pack y extrae el Visual DNA completo para un personaje.

IMAGEN 1: Rostro Frontal (Face Front) - Closeup frontal, expresión neutra
IMAGEN 2: Rostro Perfil (Face Side) - Perfil lateral 90º
IMAGEN 3: Cuerpo Frontal (Body Front) - Full body de frente
IMAGEN 4: Cuerpo Lateral (Body Side) - Full body de perfil

Analiza DETALLADAMENTE cada imagen y responde usando la herramienta extract_visual_dna.

IMPORTANTE:
- Sé MUY ESPECÍFICO con colores (usa HEX codes)
- Estima edad con precisión
- Describe características faciales con detalle técnico
- Analiza proporciones corporales y postura
- Incluye cualquier marca distintiva visible`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      characterId, 
      projectId, 
      faceImageUrl, 
      faceSideImageUrl,
      bodyImageUrl, 
      bodySideImageUrl,
      celebrityMix,
      characterName 
    }: AnalyzeRequest = await req.json();

    if (!characterId || !faceImageUrl || !bodyImageUrl) {
      return new Response(
        JSON.stringify({ error: 'Se requiere characterId, faceImageUrl y bodyImageUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Analyzing references for character ${characterId}`);

    // Build content array with all 4 images
    const content: any[] = [
      { type: 'text', text: ANALYSIS_PROMPT },
      { 
        type: 'image_url', 
        image_url: { url: faceImageUrl }
      }
    ];

    // Add optional face side
    if (faceSideImageUrl) {
      content.push({ 
        type: 'image_url', 
        image_url: { url: faceSideImageUrl }
      });
    }

    // Add body front
    content.push({ 
      type: 'image_url', 
      image_url: { url: bodyImageUrl }
    });

    // Add optional body side
    if (bodySideImageUrl) {
      content.push({ 
        type: 'image_url', 
        image_url: { url: bodySideImageUrl }
      });
    }

    if (celebrityMix) {
      content.push({
        type: 'text',
        text: `\n\nCELEBRITY MIX SOLICITADO: ${celebrityMix}\nIncorpora estas características en la descripción de celebrity_likeness.`
      });
    }

    // Call Gemini with vision
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content }],
        temperature: 0.3,
        max_tokens: 6000,
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_visual_dna',
              description: 'Extrae el Visual DNA completo del personaje analizado',
              parameters: {
                type: 'object',
                properties: {
                  physical_identity: {
                    type: 'object',
                    properties: {
                      age_exact_for_prompt: { type: 'number', description: 'Edad estimada' },
                      biological_sex: { type: 'string', enum: ['male', 'female'] },
                      gender_presentation: { type: 'string', enum: ['masculine', 'feminine', 'androgynous'] },
                      ethnicity: {
                        type: 'object',
                        properties: {
                          primary: { type: 'string' },
                          skin_tone_description: { type: 'string' },
                          skin_tone_hex_approx: { type: 'string' }
                        }
                      },
                      height: {
                        type: 'object',
                        properties: { cm: { type: 'number' } }
                      },
                      body_type: {
                        type: 'object',
                        properties: {
                          somatotype: { type: 'string', enum: ['ectomorph', 'mesomorph', 'endomorph'] },
                          posture: { type: 'string' }
                        }
                      }
                    }
                  },
                  face: {
                    type: 'object',
                    properties: {
                      shape: { type: 'string', enum: ['oval', 'round', 'square', 'heart', 'oblong', 'diamond'] },
                      eyes: {
                        type: 'object',
                        properties: {
                          color_base: { type: 'string' },
                          color_hex_approx: { type: 'string' },
                          color_description: { type: 'string' },
                          shape: { type: 'string', enum: ['almond', 'round', 'hooded', 'upturned', 'downturned', 'monolid'] },
                          size: { type: 'string', enum: ['small', 'medium', 'large'] },
                          eyebrows: {
                            type: 'object',
                            properties: {
                              thickness: { type: 'string' },
                              shape: { type: 'string' },
                              color: { type: 'string' }
                            }
                          }
                        }
                      },
                      nose: {
                        type: 'object',
                        properties: {
                          bridge: {
                            type: 'object',
                            properties: {
                              height: { type: 'string' },
                              width: { type: 'string' },
                              shape: { type: 'string' }
                            }
                          },
                          tip: {
                            type: 'object',
                            properties: { shape: { type: 'string' } }
                          }
                        }
                      },
                      mouth: {
                        type: 'object',
                        properties: {
                          lips: {
                            type: 'object',
                            properties: {
                              fullness_upper: { type: 'string' },
                              fullness_lower: { type: 'string' },
                              shape: {
                                type: 'object',
                                properties: {
                                  cupids_bow: { type: 'string' },
                                  corners: { type: 'string' }
                                }
                              }
                            }
                          }
                        }
                      },
                      jaw_chin: {
                        type: 'object',
                        properties: {
                          jawline: {
                            type: 'object',
                            properties: {
                              shape: { type: 'string' },
                              definition: { type: 'string' }
                            }
                          },
                          chin: {
                            type: 'object',
                            properties: {
                              shape: { type: 'string' },
                              projection: { type: 'string' }
                            }
                          }
                        }
                      },
                      cheekbones: {
                        type: 'object',
                        properties: {
                          prominence: { type: 'string' },
                          position: { type: 'string' }
                        }
                      },
                      facial_hair: {
                        type: 'object',
                        properties: {
                          type: { type: 'string' },
                          length_mm: { type: 'number' },
                          density: { type: 'string' },
                          color: {
                            type: 'object',
                            properties: {
                              base: { type: 'string' },
                              grey_percentage: { type: 'number' }
                            }
                          }
                        }
                      },
                      distinctive_marks: {
                        type: 'object',
                        properties: {
                          scars: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                location: { type: 'string' },
                                description: { type: 'string' },
                                size_cm: { type: 'number' }
                              }
                            }
                          },
                          moles_birthmarks: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                location: { type: 'string' },
                                type: { type: 'string' },
                                size_mm: { type: 'number' }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  hair: {
                    type: 'object',
                    properties: {
                      head_hair: {
                        type: 'object',
                        properties: {
                          length: {
                            type: 'object',
                            properties: {
                              type: { type: 'string' },
                              measurement_cm: { type: 'number' }
                            }
                          },
                          texture: {
                            type: 'object',
                            properties: { type: { type: 'string' } }
                          },
                          thickness: {
                            type: 'object',
                            properties: { density: { type: 'string' } }
                          },
                          color: {
                            type: 'object',
                            properties: {
                              natural_base: { type: 'string' },
                              hex_approx_base: { type: 'string' },
                              grey_white: {
                                type: 'object',
                                properties: {
                                  percentage: { type: 'number' },
                                  pattern: { type: 'string' }
                                }
                              }
                            }
                          },
                          style: {
                            type: 'object',
                            properties: {
                              overall_shape: { type: 'string' },
                              grooming_level: { type: 'string' },
                              fringe_bangs: { type: 'string' }
                            }
                          },
                          hairline: {
                            type: 'object',
                            properties: { front: { type: 'string' } }
                          }
                        }
                      }
                    }
                  },
                  skin: {
                    type: 'object',
                    properties: {
                      texture: {
                        type: 'object',
                        properties: { overall: { type: 'string' } }
                      },
                      undertone: {
                        type: 'object',
                        properties: { type: { type: 'string' } }
                      },
                      condition: {
                        type: 'object',
                        properties: {
                          clarity: { type: 'string' },
                          hyperpigmentation: {
                            type: 'object',
                            properties: { freckles: { type: 'string' } }
                          }
                        }
                      }
                    }
                  },
                  visual_references: {
                    type: 'object',
                    properties: {
                      celebrity_likeness: {
                        type: 'object',
                        properties: {
                          primary: {
                            type: 'object',
                            properties: {
                              name: { type: 'string' },
                              percentage: { type: 'number' },
                              features_borrowed: { type: 'array', items: { type: 'string' } }
                            }
                          },
                          secondary: {
                            type: 'object',
                            properties: {
                              name: { type: 'string' },
                              percentage: { type: 'number' }
                            }
                          },
                          combination_description: { type: 'string' }
                        }
                      }
                    }
                  },
                  outfit_visible: {
                    type: 'object',
                    properties: {
                      style: { type: 'string' },
                      colors: { type: 'array', items: { type: 'string' } },
                      description: { type: 'string' }
                    }
                  },
                  technical_description: { type: 'string', description: 'Descripción técnica completa para generación' }
                },
                required: ['physical_identity', 'face', 'hair', 'skin', 'technical_description']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_visual_dna' } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Límite de tasa alcanzado. Intenta en 1 minuto.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes en Lovable AI.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    
    // Extract tool call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let visualDNA: any;
    
    if (toolCall?.function?.arguments) {
      visualDNA = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try to parse from content
      const content = aiData.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        visualDNA = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No se pudo extraer Visual DNA');
      }
    }

    console.log('Visual DNA extracted:', JSON.stringify(visualDNA).substring(0, 500));

    // Save Visual DNA to database - first check if exists and deactivate old versions
    const { data: existingDNA } = await supabase
      .from('character_visual_dna')
      .select('id, version')
      .eq('character_id', characterId)
      .eq('is_active', true);

    // Deactivate existing active versions
    if (existingDNA && existingDNA.length > 0) {
      await supabase
        .from('character_visual_dna')
        .update({ is_active: false })
        .eq('character_id', characterId);
    }

    // Determine next version number
    const { data: maxVersion } = await supabase
      .from('character_visual_dna')
      .select('version')
      .eq('character_id', characterId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (maxVersion?.[0]?.version || 0) + 1;

    // Insert new Visual DNA version
    const { error: dnaError } = await supabase.from('character_visual_dna').insert({
      character_id: characterId,
      visual_dna: visualDNA,
      continuity_lock: {
        never_change: [
          'eye_color',
          'skin_tone',
          'face_shape',
          'nose_shape',
          'ethnicity'
        ],
        must_avoid: [
          'different eye color',
          'different skin tone',
          'different face structure'
        ],
        extracted_from_references: true
      },
      version: nextVersion,
      version_name: 'Reference Extraction',
      is_active: true,
      approved: false
    });

    if (dnaError) {
      console.error('Error saving Visual DNA:', dnaError);
    } else {
      console.log(`Visual DNA saved as version ${nextVersion}`);
    }

    // Create reference anchors for all 4 identity pack images
    const anchorsToInsert = [
      {
        character_id: characterId,
        anchor_type: 'face_front',
        image_url: faceImageUrl,
        priority: 1,
        is_active: true,
        approved: true,
        metadata: { source: 'quick_start', type: 'identity_pack' }
      },
      {
        character_id: characterId,
        anchor_type: 'body_front',
        image_url: bodyImageUrl,
        priority: 3,
        is_active: true,
        approved: true,
        metadata: { source: 'quick_start', type: 'identity_pack' }
      }
    ];

    if (faceSideImageUrl) {
      anchorsToInsert.push({
        character_id: characterId,
        anchor_type: 'face_side',
        image_url: faceSideImageUrl,
        priority: 2,
        is_active: true,
        approved: true,
        metadata: { source: 'quick_start', type: 'identity_pack' }
      });
    }

    if (bodySideImageUrl) {
      anchorsToInsert.push({
        character_id: characterId,
        anchor_type: 'body_side',
        image_url: bodySideImageUrl,
        priority: 4,
        is_active: true,
        approved: true,
        metadata: { source: 'quick_start', type: 'identity_pack' }
      });
    }

    const { error: anchorError } = await supabase
      .from('reference_anchors')
      .insert(anchorsToInsert);

    if (anchorError) {
      console.error('Error creating anchors:', anchorError);
    }

    // Update character with extracted info
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    if (visualDNA.technical_description) {
      updateData.bio = visualDNA.technical_description;
    }

    await supabase
      .from('characters')
      .update(updateData)
      .eq('id', characterId);

    console.log(`Analysis complete for character ${characterId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        visualDNA,
        anchorsCreated: anchorsToInsert.length,
        message: `Visual DNA extraído y ${anchorsToInsert.length} anchors creados`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-character-references:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
