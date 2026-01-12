/**
 * PRODUCTION PROMPTS - Centralized professional prompts
 * All prompts are exact specifications from Executive Producer
 * 
 * Usage: Import and use with placeholders {{...}}
 */

// =============================================================================
// 1. SERIES BIBLE (short, stable)
// Model: gpt-5.2 | Max output: 1800 tokens
// =============================================================================
export const SERIES_BIBLE_PROMPT = {
  model: 'openai/gpt-5.2',
  maxTokens: 1800,
  system: `Eres showrunner y guionista senior. Tu misión es crear documentación utilizable para producción. No inventes información fuera de lo que te doy: si falta algo, haz una suposición explícita y razonable y márcala como "SUPOSICIÓN".`,
  
  buildUserPrompt: (params: {
    title?: string;
    genre: string;
    tone: string;
    audience?: string;
    logline?: string;
    idea: string;
  }) => `TÍTULO (opcional): ${params.title || 'Por definir'}
GÉNERO: ${params.genre}
TONO: ${params.tone}
PÚBLICO: ${params.audience || 'General'}
LOGLINE (si existe): ${params.logline || 'Por crear'}
IDEA / PREMISA:
${params.idea}

CONSTRUIR UNA "SERIES BIBLE" EN JSON ESTRICTO.
REGLAS:
- Devuelve SOLO JSON válido. Sin markdown.
- Nada de texto fuera de JSON.
- Todo en español.

ESQUEMA JSON:
{
  "series": {
    "title": "",
    "genre": "",
    "tone": "",
    "format": {"season_episodes": 10, "episode_minutes": 60},
    "logline": "",
    "themes": [],
    "rules_of_world": [],
    "stakes": {"personal": "", "global": ""},
    "season_arc": {"start": "", "midpoint": "", "end": ""}
  },
  "characters": [
    {
      "id": "char_001",
      "name": "",
      "role": "protagonist|antagonist|supporting",
      "goal": "",
      "wound": "",
      "secret": "",
      "arc_season": "",
      "voice": {"style": "", "taboos": [], "catchphrases": []}
    }
  ],
  "episode_blueprints": [
    {
      "episode": 1,
      "one_sentence": "",
      "turning_points": ["", "", "", ""],
      "cliffhanger": ""
    }
  ],
  "constraints": {
    "locations_budget_hint": "low|mid|high",
    "vfx_hint": "low|mid|high",
    "avoid": []
  }
}`,
};

// =============================================================================
// 2. EPISODE OUTLINE (very controlled)
// Model: gpt-5-mini (fast) or gpt-5.2 (quality) | Max output: 1400 tokens
// =============================================================================
export const EPISODE_OUTLINE_PROMPT = {
  model: 'openai/gpt-5-mini',
  modelQuality: 'openai/gpt-5.2',
  maxTokens: 1400,
  system: `Eres guionista. Output operativo para producción. No escribas diálogos aún.`,
  
  buildUserPrompt: (params: {
    seriesBibleJson: string;
    episodeNumber: number;
    totalEpisodes: number;
    episodeGoal?: string;
  }) => `SERIES BIBLE (JSON):
${params.seriesBibleJson}

EPISODIO: ${params.episodeNumber} / ${params.totalEpisodes}
OBJETIVO DEL EPISODIO: ${params.episodeGoal || 'Avanzar arco principal'}

Devuelve SOLO JSON válido con:
{
  "episode": ${params.episodeNumber},
  "title": "",
  "logline": "",
  "a_story": {"setup":"","conflict":"","resolution":""},
  "b_story": {"setup":"","conflict":"","resolution":""},
  "c_story": {"setup":"","conflict":"","resolution":""},
  "beats": [
    {"beat": 1, "type":"teaser|act1|act2|act3|act4|tag", "summary":"", "turn":"", "characters":["char_001"], "locations_hint":["LOC_X"] }
  ],
  "cliffhanger": ""
}
REGLAS:
- 35 a 55 beats (1h).
- Cada beat debe tener un "turn" (qué cambia).
- No inventes personajes nuevos sin añadirlos con id temporal "char_tmp_*".`,
};

// =============================================================================
// 3. SCENE LIST from beats (sluglines + intention)
// Model: gpt-5-mini | Max output: 2000 tokens
// =============================================================================
export const SCENE_LIST_PROMPT = {
  model: 'openai/gpt-5-mini',
  maxTokens: 2000,
  system: `Eres script coordinator. Estructuras escenas para guion.`,
  
  buildUserPrompt: (params: {
    episodeOutlineJson: string;
    episodeNumber: number;
  }) => `EPISODE OUTLINE (JSON):
${params.episodeOutlineJson}

Genera una LISTA DE ESCENAS en JSON:
{
  "episode": ${params.episodeNumber},
  "scenes": [
    {
      "scene_id": "E${params.episodeNumber}_S001",
      "beat_ref": 1,
      "slugline": "INT./EXT. LUGAR - DÍA/NOCHE",
      "location_id": "loc_001",
      "time": "DAY|NIGHT|DAWN|DUSK|CONTINUOUS",
      "characters_in_scene": ["char_001"],
      "objective": "",
      "conflict": "",
      "turn": "",
      "props": ["prop_001"],
      "vfx_notes": "",
      "estimated_duration_sec": 60
    }
  ]
}

REGLAS:
- 45 a 70 escenas para 60 min (single-cam drama promedio).
- estimated_duration_sec realista (20–180).
- slugline estilo guion profesional.
- Devuelve SOLO JSON válido.`,
};

// =============================================================================
// 4. SINGLE SCENE (zero chaos - 1 scene = 1 request)
// Model: gpt-5.2 (quality) or gpt-5 | Max output: 1500 tokens
// =============================================================================
export const SINGLE_SCENE_PROMPT = {
  model: 'openai/gpt-5.2',
  maxTokens: 1500,
  system: `Eres guionista profesional. Escribes SOLO la escena pedida. No avances a escenas siguientes.`,
  
  buildUserPrompt: (params: {
    seriesBibleJson: string;
    episodeNumber: number;
    sceneSpecJson: string;
    targetLines: number;
    language?: string;
  }) => `SERIES BIBLE (JSON):
${params.seriesBibleJson}

EPISODE: ${params.episodeNumber}
SCENE SPEC (JSON):
${params.sceneSpecJson}

INSTRUCCIONES:
- Escribe la escena en formato guion (slugline, acción, diálogos).
- Mantén continuidad con objective/conflict/turn.
- No inventes nuevos personajes. Si imprescindible, crea "NEW CHARACTER (TEMP)" y marca con [TEMP].
- Longitud objetivo: ${params.targetLines} líneas aprox.
- No añadas notas ni explicación.
- Idioma: ${params.language || 'es-ES'}

OUTPUT:
Devuelve SOLO texto del guion de esa escena (no JSON).`,
};

// =============================================================================
// 5. EPISODE CONSOLIDATION (joins scenes and normalizes)
// Model: gpt-5-mini (fast) or gpt-5.2 | Max output: 6000 tokens (patches, not full rewrite)
// =============================================================================
export const EPISODE_CONSOLIDATION_PROMPT = {
  model: 'openai/gpt-5-mini',
  maxTokens: 6000,
  system: `Eres editor de guion. Tu salida son correcciones operativas.`,
  
  buildUserPrompt: (params: {
    episodeNumber: number;
    episodeScriptText: string;
  }) => `Aquí están todas las escenas del episodio concatenadas en orden:
${params.episodeScriptText}

Devuelve SOLO JSON con:
{
  "episode": ${params.episodeNumber},
  "issues": [
    {"type":"continuity|character_voice|logic|pacing|format", "severity":"low|med|high", "scene_id":"E${params.episodeNumber}_S0XX", "note":"", "fix_suggestion":""}
  ],
  "global_patches": [
    {"patch_id":"P001", "apply_to":"scene_range|all", "instruction":"cambio textual concreto o regla"}
  ]
}
REGLAS:
- No reescribas el guion entero.
- Señala cambios mínimos con máximo impacto.
- SOLO JSON válido.`,
};

// =============================================================================
// 6. CHUNK EXTRACTION (PDF or long text)
// Model: gpt-5-mini | Max output: 1800 tokens
// =============================================================================
export const CHUNK_EXTRACTION_PROMPT = {
  model: 'openai/gpt-5-mini',
  maxTokens: 1800,
  system: `Eres un parser determinista de guiones. No inventes nada. Extrae solo lo que está presente en el chunk.`,
  
  buildUserPrompt: (params: {
    jobId: string;
    chunkId: string;
    chunkText: string;
  }) => `JOB_ID: ${params.jobId}
CHUNK_ID: ${params.chunkId}
CHUNK_TEXT:
${params.chunkText}

Devuelve SOLO JSON válido:
{
  "job_id": "${params.jobId}",
  "chunk_id": "${params.chunkId}",
  "characters": [
    {"name":"", "aliases":[""], "type":"speaking|mentioned", "first_seen_in_chunk": true}
  ],
  "locations": [
    {"slug":"", "normalized":"", "int_ext":"INT|EXT|INT/EXT|UNK", "time":"DAY|NIGHT|DAWN|DUSK|CONTINUOUS|UNK"}
  ],
  "scenes": [
    {
      "order_in_chunk": 1,
      "slugline": "",
      "location_normalized": "",
      "characters_present": [""],
      "dialogue_blocks": [
        {"speaker":"", "lines_count": 0, "has_vo": false, "has_os": false}
      ],
      "props_mentioned": [""]
    }
  ],
  "notes": {"parse_warnings": []}
}

REGLAS:
- Si no hay sluglines, crea scenes vacías con parse_warnings.
- No deduzcas props, solo si se mencionan.
- SOLO JSON.`,
};

// =============================================================================
// 7. GLOBAL CONSOLIDATION (dedupe final)
// Model: gpt-5.2 | Max output: 2500 tokens
// =============================================================================
export const GLOBAL_CONSOLIDATION_PROMPT = {
  model: 'openai/gpt-5.2',
  maxTokens: 2500,
  system: `Eres coordinador de guion. Consolidas resultados de muchos chunks sin inventar.`,
  
  buildUserPrompt: (params: {
    jobId: string;
    allChunksResultsJsonArray: string;
  }) => `JOB_ID: ${params.jobId}
Aquí tienes una lista JSON de resultados de chunks (array):
${params.allChunksResultsJsonArray}

Devuelve SOLO JSON:
{
  "job_id":"${params.jobId}",
  "characters_master":[{"id":"char_001","name":"","aliases":[""],"speaking":true}],
  "locations_master":[{"id":"loc_001","normalized":"","variants":[""]}],
  "props_master":[{"id":"prop_001","name":"","variants":[""]}],
  "scene_index":[
    {"scene_id":"S0001","slugline":"","loc_id":"loc_001","characters":["char_001"],"chunk_refs":["C01","C02"]}
  ],
  "dedupe_report":{
    "merged_characters":[{"from":["name1","name2"],"to":"canonical"}],
    "merged_locations":[{"from":[""],"to":""}]
  }
}
REGLAS:
- Solo consolidar/normalizar/deduplicar.
- No crear items nuevos si no existen en chunks.`,
};

// =============================================================================
// 8. PRODUCER/DIRECTOR (camera, light, photo, movement) per scene
// Model: gpt-5.2 | Max output: 1400 tokens
// =============================================================================
export const PRODUCER_DIRECTOR_PROMPT = {
  model: 'openai/gpt-5.2',
  maxTokens: 1400,
  system: `Eres director y director de fotografía. Tu salida debe ser técnica y accionable.`,
  
  buildUserPrompt: (params: {
    references?: string;
    look?: string;
    camera?: string;
    sceneSpecJson: string;
  }) => `SERIES STYLE:
- Referencias: ${params.references || 'No especificadas'}
- Look: ${params.look || 'Cinematográfico natural'}
- Cámara base: ${params.camera || 'Digital cinema, lentes esféricas'}

SCENE SPEC (JSON):
${params.sceneSpecJson}

Devuelve SOLO JSON:
{
  "scene_id":"",
  "mood":"",
  "lighting":{
    "key_style":"",
    "contrast":"low|mid|high",
    "color_temp":"warm|neutral|cool",
    "motivations":["window","practical_lamp","neon","moonlight"]
  },
  "camera":{
    "framing_bias":"close|mid|wide",
    "lens_suggestions_mm":[35,50],
    "movement_style":"static|handheld|dolly|steadicam|crane",
    "blocking_notes":""
  },
  "coverage_plan":[
    {"shot_id":"SH01","type":"WS|MS|CU|ECU|OTS|POV|INSERT","purpose":"","subject":"","movement":"","duration_sec":6}
  ],
  "continuity_risks":[]
}
REGLAS:
- coverage_plan 10–25 shots si escena larga, 6–12 si corta.
- Duración por shot 1–8s (para luego microplanos).
- SOLO JSON.`,
};

// =============================================================================
// 9. MICROSHOTS (1-2s) for keyframes
// Model: gpt-5-mini | Max output: 2000 tokens
// =============================================================================
export const MICROSHOTS_PROMPT = {
  model: 'openai/gpt-5-mini',
  maxTokens: 2000,
  system: `Eres AD técnico. Divides shots en micro-shots para keyframes.`,
  
  buildUserPrompt: (params: {
    sceneId: string;
    coveragePlanJson: string;
  }) => `SCENE_ID: ${params.sceneId}
COVERAGE_PLAN (JSON):
${params.coveragePlanJson}

Devuelve SOLO JSON:
{
  "scene_id":"${params.sceneId}",
  "microshots":[
    {
      "micro_id":"MS001",
      "parent_shot_id":"SH01",
      "duration_sec":2,
      "frame":{
        "composition":"exacta (regla de tercios, headroom, posición sujeto)",
        "camera_height":"eye|low|high",
        "lens_mm":50,
        "focus":"subject|rack_focus_to_X",
        "movement":"none|push_in|pan_LR|tilt|handheld_subtle"
      },
      "action_start":"estado inicial visible",
      "action_end":"estado final visible",
      "must_include":["prop_x","character_y"],
      "must_not_include":[]
    }
  ]
}
REGLAS:
- microshots 1–2s.
- action_start y action_end obligatorios y concretos.
- SOLO JSON.`,
};

// =============================================================================
// 10. KEYFRAME PROMPT (for Nano Banana image generation)
// Engine: google/gemini-2.5-flash-image
// =============================================================================
export const KEYFRAME_PROMPT = {
  engine: 'google/gemini-2.5-flash-image',
  
  buildPrompt: (params: {
    sceneId: string;
    microId: string;
    locationDescription: string;
    charactersDescription: string;
    wardrobe: string;
    props: string;
    compositionExact: string;
    lensMm: number;
    aperture: number;
    lighting: string;
    cameraHeight: string;
    angle: string;
    actionStart: string;
  }) => `CINEMATIC KEYFRAME (photorealistic)
SCENE: ${params.sceneId}
MICROSHOT: ${params.microId}

WHAT YOU MUST SHOW (exact):
- Location: ${params.locationDescription}
- Characters: ${params.charactersDescription}
- Wardrobe: ${params.wardrobe}
- Props: ${params.props}
- Composition: ${params.compositionExact}
- Lens: ${params.lensMm}mm, aperture f/${params.aperture}, shallow depth of field
- Lighting: ${params.lighting}
- Camera position: ${params.cameraHeight}, angle ${params.angle}
- Action start state: ${params.actionStart}
- No extra objects, no extra characters, no text

QUALITY:
Ultra realistic film still, natural skin texture, no AI artifacts, true-to-life colors, cinematic contrast, sharp subject, realistic grain.`,

  negativePrompt: `No illustration, no cartoon, no extra limbs, no extra faces, no subtitles, no logos, no watermarks, no artificial lighting, no oversaturated colors, no plastic skin, no uncanny valley, no morphed features, no floating objects.`,
};

// =============================================================================
// 11. I2V PROMPT (for Kling/Veo/Runway with keyframes)
// =============================================================================
export const I2V_PROMPT = {
  buildPrompt: (params: {
    sceneId: string;
    microId: string;
    durationSec: number;
    keyframeStartUrl: string;
    keyframeEndUrl?: string;
    allowedMotion: string;
    cameraMovement: string;
  }) => `You are generating video from keyframes. 
Rules:
- Follow the keyframes exactly.
- Do NOT add new objects, characters, text, logos, or props.
- Keep wardrobe, faces, and location consistent.
- Motion is subtle and physically plausible.

SCENE: ${params.sceneId}
MICROSHOT: ${params.microId}
Duration: ${params.durationSec} seconds

Start keyframe: ${params.keyframeStartUrl}
${params.keyframeEndUrl ? `End keyframe: ${params.keyframeEndUrl}` : ''}

Motion description (allowed only):
${params.allowedMotion}

Camera:
${params.cameraMovement}

Lighting continuity:
Keep identical to keyframes.`,
};

// =============================================================================
// TOOL SCHEMAS for structured output
// =============================================================================

export const SERIES_BIBLE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    series: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        genre: { type: 'string' },
        tone: { type: 'string' },
        format: {
          type: 'object',
          properties: {
            season_episodes: { type: 'number' },
            episode_minutes: { type: 'number' }
          }
        },
        logline: { type: 'string' },
        themes: { type: 'array', items: { type: 'string' } },
        rules_of_world: { type: 'array', items: { type: 'string' } },
        stakes: {
          type: 'object',
          properties: {
            personal: { type: 'string' },
            global: { type: 'string' }
          }
        },
        season_arc: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            midpoint: { type: 'string' },
            end: { type: 'string' }
          }
        }
      },
      required: ['title', 'genre', 'logline', 'themes']
    },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string' },
          goal: { type: 'string' },
          wound: { type: 'string' },
          secret: { type: 'string' },
          arc_season: { type: 'string' },
          voice: {
            type: 'object',
            properties: {
              style: { type: 'string' },
              taboos: { type: 'array', items: { type: 'string' } },
              catchphrases: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        required: ['id', 'name', 'role']
      }
    },
    episode_blueprints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          episode: { type: 'number' },
          one_sentence: { type: 'string' },
          turning_points: { type: 'array', items: { type: 'string' } },
          cliffhanger: { type: 'string' }
        },
        required: ['episode', 'one_sentence']
      }
    },
    constraints: {
      type: 'object',
      properties: {
        locations_budget_hint: { type: 'string' },
        vfx_hint: { type: 'string' },
        avoid: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  required: ['series', 'characters', 'episode_blueprints']
};

export const EPISODE_OUTLINE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    episode: { type: 'number' },
    title: { type: 'string' },
    logline: { type: 'string' },
    a_story: {
      type: 'object',
      properties: {
        setup: { type: 'string' },
        conflict: { type: 'string' },
        resolution: { type: 'string' }
      }
    },
    b_story: {
      type: 'object',
      properties: {
        setup: { type: 'string' },
        conflict: { type: 'string' },
        resolution: { type: 'string' }
      }
    },
    c_story: {
      type: 'object',
      properties: {
        setup: { type: 'string' },
        conflict: { type: 'string' },
        resolution: { type: 'string' }
      }
    },
    beats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          beat: { type: 'number' },
          type: { type: 'string' },
          summary: { type: 'string' },
          turn: { type: 'string' },
          characters: { type: 'array', items: { type: 'string' } },
          locations_hint: { type: 'array', items: { type: 'string' } }
        },
        required: ['beat', 'summary', 'turn']
      }
    },
    cliffhanger: { type: 'string' }
  },
  required: ['episode', 'title', 'beats', 'cliffhanger']
};

export const CHUNK_EXTRACTION_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    job_id: { type: 'string' },
    chunk_id: { type: 'string' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          type: { type: 'string' },
          first_seen_in_chunk: { type: 'boolean' }
        },
        required: ['name', 'type']
      }
    },
    locations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          normalized: { type: 'string' },
          int_ext: { type: 'string' },
          time: { type: 'string' }
        },
        required: ['slug', 'normalized']
      }
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order_in_chunk: { type: 'number' },
          slugline: { type: 'string' },
          location_normalized: { type: 'string' },
          characters_present: { type: 'array', items: { type: 'string' } },
          dialogue_blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                speaker: { type: 'string' },
                lines_count: { type: 'number' },
                has_vo: { type: 'boolean' },
                has_os: { type: 'boolean' }
              }
            }
          },
          props_mentioned: { type: 'array', items: { type: 'string' } }
        },
        required: ['order_in_chunk', 'slugline']
      }
    },
    notes: {
      type: 'object',
      properties: {
        parse_warnings: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  required: ['job_id', 'chunk_id', 'characters', 'locations', 'scenes']
};
