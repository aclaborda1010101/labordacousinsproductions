/**
 * FILM OUTLINE SCHEMAS (V2 - Phased Architecture)
 * 
 * Schemas estructurados para la generación de outlines de PELÍCULA.
 * Estructura de 3 ACTOS con causalidad dramática obligatoria.
 * 
 * Diferencias clave vs SERIES:
 * - Sin episodios, threads ni cliffhangers
 * - Estructura ACT_I / ACT_II / ACT_III
 * - Midpoint como punto de inflexión central
 * - Personajes con WANT/NEED/FLAW/DECISION_KEY
 * 
 * ARCHITECTURE V2 (Phased):
 * - PHASE 1: FILM_SCAFFOLD (estructura ligera, rápida)
 * - PHASE 2: EXPAND_ACT_I, EXPAND_ACT_II, EXPAND_ACT_III (detalle por acto)
 * - PHASE 3: MERGE + Validación (local, sin AI)
 */

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: FILM SCAFFOLD SCHEMA (Ligero - ~60 propiedades vs 240 del full)
// ═══════════════════════════════════════════════════════════════════════════

export const FILM_SCAFFOLD_SCHEMA = {
  name: "generate_film_scaffold",
  description: "Genera estructura cinematográfica base sin detalle de beats - decisiones arquitectónicas",
  parameters: {
    type: "object" as const,
    properties: {
      title: { 
        type: "string" as const,
        description: "Título de la película"
      },
      logline: { 
        type: "string" as const, 
        maxLength: 200,
        description: "Resumen en 1-2 frases (máx 200 caracteres)"
      },
      thematic_premise: { 
        type: "string" as const,
        description: "Qué dice la película sobre el mundo/la condición humana"
      },
      genre: {
        type: "string" as const,
        description: "Género principal"
      },
      tone: {
        type: "string" as const,
        description: "Tono narrativo"
      },
      cast: { 
        type: "array" as const, 
        items: { 
          type: "object" as const, 
          properties: {
            name: { type: "string" as const },
            role: { 
              type: "string" as const, 
              enum: ["protagonist", "antagonist", "mentor", "ally", "love_interest", "shapeshifter", "trickster"]
            },
            want: { type: "string" as const, description: "Objetivo consciente" },
            need: { type: "string" as const, description: "Necesidad interna" },
            flaw: { type: "string" as const, description: "Defecto dramático" },
            decision_key: { type: "string" as const, description: "Decisión clave en la película" }
          },
          required: ["name", "role", "want", "need", "flaw", "decision_key"]
        },
        description: "Cast mínimo 4 personajes"
      },
      locations: { 
        type: "array" as const, 
        items: { 
          type: "object" as const, 
          properties: {
            name: { type: "string" as const },
            function: { type: "string" as const, description: "Función dramática" },
            visual_identity: { type: "string" as const, description: "Identidad visual" }
          },
          required: ["name", "function"]
        },
        description: "Localizaciones mínimo 5"
      },
      setpieces: { 
        type: "array" as const, 
        items: { 
          type: "object" as const, 
          properties: {
            name: { type: "string" as const },
            act: { type: "string" as const, enum: ["I", "II_A", "II_B", "III"] },
            stakes: { type: "string" as const, description: "Qué está en juego" }
          },
          required: ["name", "act", "stakes"]
        },
        description: "Momentos visuales memorables (mínimo 3)"
      },
      sequences: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const, description: "Nombre de la secuencia" },
            act: { type: "string" as const, enum: ["I", "II", "III"], description: "Acto al que pertenece" },
            scenes_range: { type: "string" as const, description: "Rango de escenas (ej: 1-4)" },
            dramatic_goal: { type: "string" as const, description: "Objetivo emocional de la secuencia" },
            tone_shift: { type: "string" as const, description: "Cómo cambia el tono al final" }
          },
          required: ["name", "act", "dramatic_goal"]
        },
        description: "Secuencias dramáticas que agrupan 2-5 escenas bajo un objetivo común (mínimo 4)"
      },
      world_rules: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            rule: { type: "string" as const },
            dramatic_effect: { type: "string" as const }
          }
        },
        description: "Reglas del mundo (mínimo 2)"
      },
      acts_summary: {
        type: "object" as const,
        description: "Resumen de arquitectura de 3 actos - SIN beats detallados aún",
        properties: {
          act_i_goal: { type: "string" as const, description: "Objetivo dramático del Acto I" },
          inciting_incident_summary: { type: "string" as const, description: "Evento detonante (resumen)" },
          act_i_break: { type: "string" as const, description: "Cómo cierra el Acto I" },
          act_ii_goal: { type: "string" as const, description: "Objetivo dramático del Acto II" },
          midpoint_summary: { type: "string" as const, description: "Punto de inflexión central (resumen)" },
          all_is_lost_summary: { type: "string" as const, description: "Momento más oscuro (resumen)" },
          act_iii_goal: { type: "string" as const, description: "Objetivo dramático del Acto III" },
          climax_summary: { type: "string" as const, description: "Clímax y resolución (resumen)" }
        },
        required: ["act_i_goal", "inciting_incident_summary", "act_ii_goal", "midpoint_summary", "act_iii_goal", "climax_summary"]
      }
    },
    required: ["title", "logline", "thematic_premise", "cast", "locations", "sequences", "acts_summary"]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: EXPAND ACT SCHEMA (Reutilizable para cada acto)
// ═══════════════════════════════════════════════════════════════════════════

export const EXPAND_ACT_SCHEMA = {
  name: "expand_film_act",
  description: "Expande un acto con beats detallados y situation_detail filmable",
  parameters: {
    type: "object" as const,
    properties: {
      act: { 
        type: "string" as const, 
        enum: ["I", "II", "III"],
        description: "Qué acto se está expandiendo"
      },
      dramatic_goal: { 
        type: "string" as const,
        description: "Objetivo dramático del acto"
      },
      beats: {
        type: "array" as const,
        description: "Beats expandidos con detalle filmable (6-12 por acto según duración)",
        items: {
          type: "object" as const,
          properties: {
            beat_number: { type: "number" as const },
            event: { type: "string" as const, description: "EVENTO OBSERVABLE" },
            agent: { type: "string" as const, description: "QUIÉN lo hace" },
            consequence: { type: "string" as const, description: "QUÉ provoca" },
            situation_detail: {
              type: "object" as const,
              description: "Detalle filmable de la situación",
              properties: {
                physical_context: { type: "string" as const, description: "Luz, espacio, disposición (1-2 frases)" },
                action: { type: "string" as const, description: "Acción visible (1-2 frases)" },
                goal: { type: "string" as const, description: "Objetivo inmediato del personaje" },
                obstacle: { type: "string" as const, description: "Obstáculo tangible" },
                state_change: { type: "string" as const, description: "Cambio de estado al final del beat" }
              },
              required: ["physical_context", "action", "goal", "obstacle", "state_change"]
            }
          },
          required: ["beat_number", "event", "agent", "consequence", "situation_detail"]
        }
      },
      key_moments: {
        type: "object" as const,
        description: "Momentos clave del acto (estructura varía por acto)",
        properties: {
          opening_image: { type: "string" as const },
          world_setup: { type: "string" as const },
          inciting_incident: {
            type: "object" as const,
            properties: {
              event: { type: "string" as const },
              agent: { type: "string" as const },
              consequence: { type: "string" as const }
            }
          },
          protagonist_decision: { type: "string" as const },
          stakes_established: { type: "string" as const },
          act_break: { type: "string" as const },
          midpoint_reversal: {
            type: "object" as const,
            properties: {
              event: { type: "string" as const },
              agent: { type: "string" as const },
              consequence: { type: "string" as const },
              protagonist_new_goal: { type: "string" as const }
            }
          },
          all_is_lost_moment: {
            type: "object" as const,
            properties: {
              event: { type: "string" as const },
              what_dies: { type: "string" as const }
            }
          },
          dark_night_of_soul: { type: "string" as const },
          catalyst_to_action: { type: "string" as const },
          climax_decision: {
            type: "object" as const,
            properties: {
              decision: { type: "string" as const },
              cost: { type: "string" as const },
              antagonist_confrontation: { type: "string" as const }
            }
          },
          resolution: { type: "string" as const },
          final_image: { type: "string" as const },
          theme_statement: { type: "string" as const }
        }
      }
    },
    required: ["act", "dramatic_goal", "beats", "key_moments"]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY: FULL SCHEMA (Mantenido para compatibilidad, pero ya no usado en V2)
// ═══════════════════════════════════════════════════════════════════════════

export const FILM_OUTLINE_SCHEMA = {
  name: "generate_film_outline",
  description: "Genera un outline completo de película con estructura de 3 actos",
  parameters: {
    type: "object" as const,
    properties: {
      title: { 
        type: "string" as const,
        description: "Título de la película"
      },
      logline: { 
        type: "string" as const, 
        maxLength: 200,
        description: "Resumen en 1-2 frases (máx 200 caracteres)"
      },
      thematic_premise: { 
        type: "string" as const,
        description: "Qué dice la película sobre el mundo/la condición humana"
      },
      genre: {
        type: "string" as const,
        description: "Género principal"
      },
      tone: {
        type: "string" as const,
        description: "Tono narrativo"
      },
      ACT_I: {
        type: "object" as const,
        description: "Acto I - Planteamiento (~25% de la duración)",
        properties: {
          dramatic_goal: { 
            type: "string" as const,
            description: "Objetivo dramático del acto"
          },
          opening_image: {
            type: "string" as const,
            description: "Primera imagen que establece el mundo y tono"
          },
          world_setup: {
            type: "string" as const,
            description: "Descripción del mundo ordinario del protagonista"
          },
          inciting_incident: { 
            type: "object" as const, 
            properties: {
              event: { type: "string" as const, description: "EVENTO CONCRETO que rompe la normalidad" },
              agent: { type: "string" as const, description: "QUIÉN o QUÉ provoca el evento" },
              consequence: { type: "string" as const, description: "Qué provoca inmediatamente" }
            },
            required: ["event", "agent", "consequence"]
          },
          protagonist_decision: { 
            type: "string" as const,
            description: "Decisión activa del protagonista (no accidental)"
          },
          stakes_established: {
            type: "string" as const,
            description: "Qué está en juego si el protagonista falla"
          },
          act_break: {
            type: "string" as const,
            description: "Evento que cierra el Acto I y lanza al protagonista al conflicto"
          }
        },
        required: ["dramatic_goal", "inciting_incident", "protagonist_decision", "act_break"]
      },
      ACT_II: {
        type: "object" as const,
        description: "Acto II - Confrontación (~50% de la duración)",
        properties: {
          dramatic_goal: { 
            type: "string" as const,
            description: "Objetivo dramático del acto"
          },
          first_half_complications: { 
            type: "array" as const, 
            items: { 
              type: "object" as const, 
              properties: {
                event: { type: "string" as const },
                consequence: { type: "string" as const }
              }
            },
            description: "Complicaciones antes del midpoint (2-3)"
          },
          midpoint_reversal: { 
            type: "object" as const, 
            properties: {
              event: { type: "string" as const, description: "EVENTO VISIBLE que cambia todo" },
              agent: { type: "string" as const, description: "QUIÉN provoca el cambio" },
              consequence: { type: "string" as const, description: "Impacto inmediato" },
              protagonist_new_goal: { type: "string" as const, description: "Nuevo objetivo del protagonista" },
              stakes_raised: { type: "string" as const, description: "Cómo suben las apuestas" }
            },
            required: ["event", "agent", "consequence", "protagonist_new_goal"]
          },
          second_half_escalation: { 
            type: "array" as const, 
            items: { type: "string" as const },
            description: "Escalada post-midpoint (2-3 eventos)"
          },
          all_is_lost_moment: {
            type: "object" as const,
            properties: {
              event: { type: "string" as const, description: "El momento más oscuro" },
              what_dies: { type: "string" as const, description: "Qué pierde el protagonista (literal o simbólico)" }
            },
            required: ["event", "what_dies"]
          },
          dark_night_of_soul: {
            type: "string" as const,
            description: "Reflexión del protagonista antes de la decisión final"
          }
        },
        required: ["dramatic_goal", "midpoint_reversal", "all_is_lost_moment"]
      },
      ACT_III: {
        type: "object" as const,
        description: "Acto III - Resolución (~25% de la duración)",
        properties: {
          dramatic_goal: { 
            type: "string" as const,
            description: "Objetivo dramático del acto"
          },
          catalyst_to_action: {
            type: "string" as const,
            description: "Qué impulsa al protagonista a actuar tras la noche oscura"
          },
          climax_setup: {
            type: "string" as const,
            description: "Preparación para la confrontación final"
          },
          climax_decision: { 
            type: "object" as const, 
            properties: {
              decision: { type: "string" as const, description: "Elección final del protagonista" },
              cost: { type: "string" as const, description: "Qué sacrifica para lograr su objetivo" },
              antagonist_confrontation: { type: "string" as const, description: "Cómo se resuelve el conflicto con el antagonista" }
            },
            required: ["decision", "cost"]
          },
          resolution: { 
            type: "string" as const,
            description: "Nuevo equilibrio del mundo tras el clímax"
          },
          final_image: {
            type: "string" as const,
            description: "Imagen final que contrasta con la apertura"
          },
          theme_statement: {
            type: "string" as const,
            description: "Cómo la resolución ilustra la premisa temática"
          }
        },
        required: ["dramatic_goal", "climax_decision", "resolution"]
      },
      cast: { 
        type: "array" as const, 
        items: { 
          type: "object" as const, 
          properties: {
            name: { type: "string" as const },
            role: { 
              type: "string" as const, 
              enum: ["protagonist", "antagonist", "mentor", "ally", "love_interest", "shapeshifter", "trickster", "herald", "threshold_guardian"]
            },
            archetype: { type: "string" as const },
            want: { type: "string" as const, description: "Objetivo consciente" },
            need: { type: "string" as const, description: "Necesidad interna (lo que realmente necesita)" },
            flaw: { type: "string" as const, description: "Defecto que complica sus decisiones" },
            decision_key: { type: "string" as const, description: "Decisión clave que toma en la película" },
            arc: { type: "string" as const, description: "Transformación de principio a fin" }
          },
          required: ["name", "role", "want", "need", "flaw", "decision_key"]
        },
        description: "Personajes principales con profundidad dramática"
      },
      locations: { 
        type: "array" as const, 
        items: { 
          type: "object" as const, 
          properties: {
            name: { type: "string" as const },
            function: { type: "string" as const, description: "Función dramática en la historia" },
            visual_identity: { type: "string" as const, description: "Identidad visual distintiva" },
            emotional_value: { type: "string" as const, description: "Qué representa emocionalmente" },
            key_scenes: { type: "array" as const, items: { type: "string" as const }, description: "Escenas clave que ocurren aquí" }
          },
          required: ["name", "function", "visual_identity"]
        },
        description: "Localizaciones con función dramática"
      },
      setpieces: { 
        type: "array" as const, 
        items: { 
          type: "object" as const, 
          properties: {
            name: { type: "string" as const },
            act: { type: "string" as const, enum: ["I", "II_A", "II_B", "III"] },
            visual_description: { type: "string" as const, description: "Descripción visual cinematográfica" },
            dramatic_stakes: { type: "string" as const, description: "Qué está en juego" },
            outcome: { type: "string" as const, description: "Resultado que impacta la trama" }
          },
          required: ["name", "act", "visual_description", "dramatic_stakes"]
        },
        description: "Momentos visuales memorables (mínimo 3)"
      },
      world_rules: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            rule: { type: "string" as const },
            dramatic_effect: { type: "string" as const }
          }
        },
        description: "Reglas del mundo que afectan la narrativa"
      }
    },
    required: ["title", "logline", "thematic_premise", "ACT_I", "ACT_II", "ACT_III", "cast", "locations"]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS TYPESCRIPT
// ═══════════════════════════════════════════════════════════════════════════

export interface FilmIncitingIncident {
  event: string;
  agent: string;
  consequence: string;
}

export interface FilmMidpointReversal {
  event: string;
  agent: string;
  consequence: string;
  protagonist_new_goal: string;
  stakes_raised?: string;
}

export interface FilmClimaxDecision {
  decision: string;
  cost: string;
  antagonist_confrontation?: string;
}

// V13: Beat expandido con situation_detail filmable
export interface FilmBeat {
  beat_number: number;
  event: string;
  agent: string;
  consequence: string;
  situation_detail?: {
    physical_context: string;
    action: string;
    goal: string;
    obstacle: string;
    state_change: string;
  };
}

export interface FilmActI {
  dramatic_goal: string;
  opening_image?: string;
  world_setup?: string;
  inciting_incident: FilmIncitingIncident;
  protagonist_decision: string;
  stakes_established?: string;
  act_break: string;
  // V13: Beats expandidos (opcional, añadido en fase de expansión)
  beats?: FilmBeat[];
}

export interface FilmActII {
  dramatic_goal: string;
  first_half_complications?: Array<{ event: string; consequence: string }>;
  midpoint_reversal: FilmMidpointReversal;
  second_half_escalation?: string[];
  all_is_lost_moment: {
    event: string;
    what_dies: string;
  };
  dark_night_of_soul?: string;
  // V13: Beats expandidos (opcional, añadido en fase de expansión)
  beats?: FilmBeat[];
}

export interface FilmActIII {
  dramatic_goal: string;
  catalyst_to_action?: string;
  climax_setup?: string;
  climax_decision: FilmClimaxDecision;
  resolution: string;
  final_image?: string;
  theme_statement?: string;
  // V13: Beats expandidos (opcional, añadido en fase de expansión)
  beats?: FilmBeat[];
}

export interface FilmCharacter {
  name: string;
  role: 'protagonist' | 'antagonist' | 'mentor' | 'ally' | 'love_interest' | 'shapeshifter' | 'trickster' | 'herald' | 'threshold_guardian';
  archetype?: string;
  want: string;
  need: string;
  flaw: string;
  decision_key: string;
  arc?: string;
}

export interface FilmLocation {
  name: string;
  function: string;
  visual_identity: string;
  emotional_value?: string;
  key_scenes?: string[];
}

export interface FilmSetpiece {
  name: string;
  act: 'I' | 'II_A' | 'II_B' | 'III';
  visual_description: string;
  dramatic_stakes: string;
  outcome?: string;
}

export interface FilmWorldRule {
  rule: string;
  dramatic_effect: string;
}

export interface FilmOutline {
  title: string;
  logline: string;
  thematic_premise: string;
  genre?: string;
  tone?: string;
  ACT_I: FilmActI;
  ACT_II: FilmActII;
  ACT_III: FilmActIII;
  cast: FilmCharacter[];
  locations: FilmLocation[];
  setpieces?: FilmSetpiece[];
  world_rules?: FilmWorldRule[];
}

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normaliza un outline de película para consistencia.
 */
export function normalizeFilmOutline(raw: unknown): FilmOutline | null {
  if (!raw || typeof raw !== 'object') return null;
  
  const data = raw as Record<string, unknown>;
  
  // Validar campos requeridos
  if (!data.title || !data.ACT_I || !data.ACT_II || !data.ACT_III) {
    console.error('[FILM_OUTLINE] Missing required fields:', {
      hasTitle: !!data.title,
      hasActI: !!data.ACT_I,
      hasActII: !!data.ACT_II,
      hasActIII: !!data.ACT_III
    });
    return null;
  }
  
  return {
    title: String(data.title),
    logline: String(data.logline || ''),
    thematic_premise: String(data.thematic_premise || ''),
    genre: data.genre ? String(data.genre) : undefined,
    tone: data.tone ? String(data.tone) : undefined,
    ACT_I: data.ACT_I as FilmActI,
    ACT_II: data.ACT_II as FilmActII,
    ACT_III: data.ACT_III as FilmActIII,
    cast: Array.isArray(data.cast) ? data.cast as FilmCharacter[] : [],
    locations: Array.isArray(data.locations) ? data.locations as FilmLocation[] : [],
    setpieces: Array.isArray(data.setpieces) ? data.setpieces as FilmSetpiece[] : [],
    world_rules: Array.isArray(data.world_rules) ? data.world_rules as FilmWorldRule[] : []
  };
}

/**
 * Convierte un FilmOutline al formato esperado por el sistema (compatible con series).
 * Esto permite reutilizar la infraestructura existente.
 */
export function filmOutlineToUniversalFormat(film: FilmOutline): Record<string, unknown> {
  // Convertir actos a "episodios virtuales" para compatibilidad
  const virtualEpisodes = [
    {
      episode: 1,
      title: `Acto I: ${film.ACT_I.dramatic_goal}`,
      act: 'I',
      beats: [
        film.ACT_I.opening_image,
        film.ACT_I.world_setup,
        `INCITING INCIDENT: ${film.ACT_I.inciting_incident.event}`,
        film.ACT_I.protagonist_decision,
        film.ACT_I.act_break
      ].filter(Boolean),
      turning_points: [
        { tp: 1, event: film.ACT_I.inciting_incident.event, consequence: film.ACT_I.inciting_incident.consequence }
      ]
    },
    {
      episode: 2,
      title: `Acto II-A: ${film.ACT_II.dramatic_goal}`,
      act: 'II_A',
      beats: [
        ...(film.ACT_II.first_half_complications?.map(c => c.event) || []),
        `MIDPOINT: ${film.ACT_II.midpoint_reversal.event}`
      ],
      turning_points: [
        { tp: 2, event: film.ACT_II.midpoint_reversal.event, consequence: film.ACT_II.midpoint_reversal.consequence }
      ]
    },
    {
      episode: 3,
      title: `Acto II-B: Escalada`,
      act: 'II_B',
      beats: [
        ...(film.ACT_II.second_half_escalation || []),
        `ALL IS LOST: ${film.ACT_II.all_is_lost_moment.event}`,
        film.ACT_II.dark_night_of_soul
      ].filter(Boolean),
      turning_points: [
        { tp: 3, event: film.ACT_II.all_is_lost_moment.event, consequence: film.ACT_II.all_is_lost_moment.what_dies }
      ]
    },
    {
      episode: 4,
      title: `Acto III: ${film.ACT_III.dramatic_goal}`,
      act: 'III',
      beats: [
        film.ACT_III.catalyst_to_action,
        film.ACT_III.climax_setup,
        `CLIMAX: ${film.ACT_III.climax_decision.decision}`,
        film.ACT_III.resolution,
        film.ACT_III.final_image
      ].filter(Boolean),
      turning_points: [
        { tp: 4, event: film.ACT_III.climax_decision.decision, consequence: film.ACT_III.resolution }
      ]
    }
  ];
  
  return {
    title: film.title,
    logline: film.logline,
    thematic_premise: film.thematic_premise,
    genre: film.genre,
    tone: film.tone,
    format: 'film',
    
    // Season arc como estructura de película
    season_arc: {
      premise: film.thematic_premise,
      midpoint_reversal: film.ACT_II.midpoint_reversal,
      season_climax: film.ACT_III.climax_decision.decision
    },
    
    // Cast con formato unificado
    cast: film.cast.map(c => ({
      name: c.name,
      role: c.role,
      archetype: c.archetype,
      want: c.want,
      need: c.need,
      flaw: c.flaw,
      function: c.decision_key,
      arc: c.arc
    })),
    
    locations: film.locations,
    setpieces: film.setpieces,
    world_rules: film.world_rules,
    
    // Episodios virtuales para compatibilidad
    episodes: virtualEpisodes,
    
    // Metadata
    _film_structure: {
      ACT_I: film.ACT_I,
      ACT_II: film.ACT_II,
      ACT_III: film.ACT_III
    }
  };
}
