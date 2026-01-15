/**
 * NARRATIVE PROFILES V2.0 - Hollywood Architecture
 * 
 * Maps genres and tones to narrative construction methods.
 * These profiles define HOW stories are written, not metrics.
 * 
 * QC/Density remains generic - this is the CREATIVE engine.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface NarrativeProfile {
  id: string;
  genre_family: string;
  narrative_method: NarrativeMethod;
  conflict_style: string;
  pacing: string;
  tone_tags: string[];
  notes: string;
  
  // Scene engine rules
  scene_engine: {
    enter_late_exit_early: boolean;
    pressure_escalation: string;
    decision_every_scene: boolean;
    consequence_visible: boolean;
  };
  
  // Signature devices for this genre/tone
  signature_devices: string[];
  
  // Writing rules
  writing_bans: string[];
  writing_musts: string[];
  
  // Dialogue style
  dialogue_style: string;
  
  // Setpiece style
  setpiece_style: string;
}

export type NarrativeMethod = 
  | 'CHARACTER_DRIVEN'      // Drama - internal conflicts drive plot
  | 'GAG_ENGINE'            // Comedy - setup/payoff rhythm
  | 'PLOT_DRIVEN'           // Thriller - external threats drive plot
  | 'SETPIECE_CHAIN'        // Action - connected action sequences
  | 'FEAR_ESCALATION'       // Horror - building dread
  | 'CONCEPT_DRIVEN'        // Sci-Fi - high concept exploration
  | 'INVESTIGATION_CHAIN'   // Crime/Mystery - clue-based progression
  | 'RELATIONSHIP_ARC'      // Romance - emotional proximity arc
  | 'PRESSURE_RELEASE'      // Home invasion - claustrophobic tension
  | 'CAUSAL_PUZZLE'         // Time travel - cause/effect chains
  | 'TRIAL_ENGINE';         // Court drama - evidence rounds

export interface TonePreset {
  tone_id: string;
  label: string;
  method: NarrativeMethod;
  conflict: string;
  pacing: string;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BASE GENRE PROFILES
// ═══════════════════════════════════════════════════════════════════════════

export const GENRE_TO_NARRATIVE_PROFILE: Record<string, NarrativeProfile> = {
  "Comedia": {
    id: "COMEDY_SETUP_PAYOFF",
    genre_family: "COMEDY",
    narrative_method: "GAG_ENGINE",
    conflict_style: "social_ridiculo",
    pacing: "rapido_con_payoffs",
    tone_tags: ["rapida", "observacional", "absurdo_controlado"],
    notes: "Setup/Payoff, reglas cómicas claras, consecuencias humillantes pero reversibles",
    scene_engine: {
      enter_late_exit_early: true,
      pressure_escalation: "pequeño_error→bola_de_nieve",
      decision_every_scene: true,
      consequence_visible: true
    },
    signature_devices: [
      "plantar_broma_y_cobrarla",
      "malentendidos_con_coste",
      "reglas_comicas_del_mundo",
      "callback_tardio"
    ],
    writing_bans: [
      "todo cambia", "se dan cuenta", "la tensión aumenta",
      "surge un conflicto", "nada volverá a ser igual"
    ],
    writing_musts: [
      "setup_visible_antes_de_payoff",
      "consecuencia_comica_inmediata",
      "timing_en_dialogos"
    ],
    dialogue_style: "timing_contraste",
    setpiece_style: "setups_payoffs_en_espiral"
  },

  "Drama": {
    id: "DRAMA_CHARACTER_DRIVEN",
    genre_family: "DRAMA",
    narrative_method: "CHARACTER_DRIVEN",
    conflict_style: "moral_relacional",
    pacing: "tension_sostenida",
    tone_tags: ["profundo", "humano", "consecuencias_emocionales"],
    notes: "Decisiones internas, relaciones, consecuencias emocionales",
    scene_engine: {
      enter_late_exit_early: true,
      pressure_escalation: "personal→institucional→colectivo",
      decision_every_scene: true,
      consequence_visible: true
    },
    signature_devices: [
      "dilema_sin_respuesta_facil",
      "silencio_cargado",
      "decision_irreversible",
      "coste_visible"
    ],
    writing_bans: [
      "todo cambia", "se dan cuenta", "la tensión aumenta",
      "surge un conflicto", "empiezan a"
    ],
    writing_musts: [
      "accion_observable",
      "decision_con_coste",
      "consecuencia_inmediata",
      "subtexto_en_dialogo"
    ],
    dialogue_style: "afilado_subtexto",
    setpiece_style: "confrontacion_emocional"
  },

  "Thriller": {
    id: "THRILLER_STAKES_REVEAL",
    genre_family: "THRILLER",
    narrative_method: "PLOT_DRIVEN",
    conflict_style: "amenaza_especifica",
    pacing: "escalada_constante",
    tone_tags: ["tenso", "paranoia", "realista"],
    notes: "Amenaza clara, revelaciones progresivas, punto de no retorno temprano",
    scene_engine: {
      enter_late_exit_early: true,
      pressure_escalation: "sospecha→prueba→caza",
      decision_every_scene: true,
      consequence_visible: true
    },
    signature_devices: [
      "revelacion_por_accion",
      "amenaza_especifica",
      "punto_sin_retorno_temprano",
      "reloj_interno"
    ],
    writing_bans: [
      "todo cambia", "se dan cuenta", "la tensión aumenta",
      "aparece una amenaza", "las cosas se complican"
    ],
    writing_musts: [
      "amenaza_con_rostro",
      "deadline_claro",
      "revelacion_que_empeora_todo"
    ],
    dialogue_style: "economico_con_subtexto",
    setpiece_style: "persecucion_revelacion_encierro"
  },

  "Acción": {
    id: "ACTION_SETPIECE_CHAIN",
    genre_family: "ACTION",
    narrative_method: "SETPIECE_CHAIN",
    conflict_style: "fisico_y_objetivo",
    pacing: "picos_frecuentes",
    tone_tags: ["adrenalina", "limpio", "heroico_o_crudo"],
    notes: "Objetivo claro por acto, obstáculos con escalada, climax multifase",
    scene_engine: {
      enter_late_exit_early: true,
      pressure_escalation: "obstaculo→perdida→contraataque",
      decision_every_scene: true,
      consequence_visible: true
    },
    signature_devices: [
      "objetivo_claro_por_acto",
      "obstaculos_con_escalada",
      "climax_multifase",
      "victoria_con_coste"
    ],
    writing_bans: [
      "todo cambia", "surge un conflicto",
      "empiezan a", "las cosas se complican"
    ],
    writing_musts: [
      "accion_coreografiada",
      "objetivo_visual",
      "obstaculo_fisico"
    ],
    dialogue_style: "minimo_funcional",
    setpiece_style: "cadena_de_setpieces_con_objetivo"
  },

  "Terror": {
    id: "HORROR_FEAR_ESCALATION",
    genre_family: "HORROR",
    narrative_method: "FEAR_ESCALATION",
    conflict_style: "amenaza_latente",
    pacing: "tension_lenta_con_explosiones",
    tone_tags: ["atmosferico", "dread", "regla_maldita"],
    notes: "Reglas del miedo, anticipación, castigo por error",
    scene_engine: {
      enter_late_exit_early: true,
      pressure_escalation: "inquietud→confirmacion→horror",
      decision_every_scene: true,
      consequence_visible: true
    },
    signature_devices: [
      "regla_de_la_amenaza",
      "anticipacion_antes_del_golpe",
      "castigo_por_transgredir",
      "falsa_seguridad"
    ],
    writing_bans: [
      "todo cambia", "surge un conflicto",
      "algo malo pasa", "siente miedo"
    ],
    writing_musts: [
      "amenaza_con_regla_clara",
      "consecuencia_del_error",
      "momento_de_dread"
    ],
    dialogue_style: "susurrado_o_grito",
    setpiece_style: "setpieces_de_acecho"
  },

  "Ciencia Ficción": {
    id: "SCIFI_CONCEPT_DRIVEN",
    genre_family: "SCIFI",
    narrative_method: "CONCEPT_DRIVEN",
    conflict_style: "idea_vs_humano",
    pacing: "exploracion→consecuencia",
    tone_tags: ["high_concept", "reglas_duras", "impacto_humano"],
    notes: "High concept + impacto humano, reglas del mundo estrictas",
    scene_engine: {
      enter_late_exit_early: true,
      pressure_escalation: "descubrimiento→implicacion→crisis",
      decision_every_scene: true,
      consequence_visible: true
    },
    signature_devices: [
      "regla_del_concepto",
      "implicacion_humana",
      "consecuencia_inesperada",
      "sacrificio_por_conocimiento"
    ],
    writing_bans: [
      "todo cambia", "la tecnologia falla misteriosamente",
      "surge un conflicto"
    ],
    writing_musts: [
      "concepto_con_regla",
      "coste_humano_del_concepto",
      "decision_moral_nueva"
    ],
    dialogue_style: "conceptual_pero_emocional",
    setpiece_style: "demostracion_del_concepto"
  },

  "Crimen": {
    id: "CRIME_INVESTIGATION_CHAIN",
    genre_family: "CRIME",
    narrative_method: "INVESTIGATION_CHAIN",
    conflict_style: "verdad_vs_encubrimiento",
    pacing: "descubrimiento_progresivo",
    tone_tags: ["procedural", "moral_gris", "pistas"],
    notes: "Pistas, revelaciones, consecuencias legales/morales",
    scene_engine: {
      enter_late_exit_early: true,
      pressure_escalation: "pista→sospecha→confirmacion",
      decision_every_scene: true,
      consequence_visible: true
    },
    signature_devices: [
      "pista_plantada",
      "revelacion_que_cambia_todo",
      "dilema_legal_vs_moral",
      "el_detective_se_equivoca"
    ],
    writing_bans: [
      "todo cambia", "descubre la verdad",
      "surge un conflicto", "investiga"
    ],
    writing_musts: [
      "pista_concreta_visible",
      "conexion_logica",
      "consecuencia_de_acusar"
    ],
    dialogue_style: "interrogatorio_y_mentira",
    setpiece_style: "confrontacion_con_prueba"
  },

  "Romance": {
    id: "ROMANCE_RELATIONSHIP_ARC",
    genre_family: "ROMANCE",
    narrative_method: "RELATIONSHIP_ARC",
    conflict_style: "deseo_vs_miedo",
    pacing: "proximidad→ruptura→eleccion",
    tone_tags: ["emocional", "barreras", "eleccion_final"],
    notes: "Arco emocional, decisiones sentimentales, costo afectivo",
    scene_engine: {
      enter_late_exit_early: true,
      pressure_escalation: "atraccion→obstaculo→prueba",
      decision_every_scene: true,
      consequence_visible: true
    },
    signature_devices: [
      "barrera_visible",
      "momento_de_vulnerabilidad",
      "eleccion_sobre_amor",
      "coste_de_amar"
    ],
    writing_bans: [
      "todo cambia", "surge un conflicto",
      "se enamoran", "siente amor"
    ],
    writing_musts: [
      "accion_que_demuestra_amor",
      "barrera_concreta",
      "decision_sentimental"
    ],
    dialogue_style: "subtexto_emocional",
    setpiece_style: "momento_publico_de_declaracion"
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GENRE TONE MATRIX - Secondary tone presets per genre
// ═══════════════════════════════════════════════════════════════════════════

export const GENRE_TONE_MATRIX: Record<string, TonePreset[]> = {
  "Comedia": [
    { 
      tone_id: "COMEDY_SOCIAL", 
      label: "Comedia social (satírica)", 
      method: "GAG_ENGINE", 
      conflict: "normas_sociales", 
      pacing: "rapido_setup_payoff",
      description: "Satiriza instituciones y normas sociales con humor observacional"
    },
    { 
      tone_id: "COMEDY_BLACK", 
      label: "Comedia negra", 
      method: "GAG_ENGINE", 
      conflict: "moral_cruel", 
      pacing: "tension_comica",
      description: "Humor desde la crueldad, muerte y tabúes"
    },
    { 
      tone_id: "COMEDY_ROM", 
      label: "Comedia romántica", 
      method: "RELATIONSHIP_ARC", 
      conflict: "deseo_vs_miedo", 
      pacing: "beats_relacionales",
      description: "Romance con obstáculos cómicos y malentendidos"
    },
    {
      tone_id: "COMEDY_ABSURD",
      label: "Comedia absurda",
      method: "GAG_ENGINE",
      conflict: "logica_invertida",
      pacing: "ritmo_impredecible",
      description: "Mundo con reglas cómicas internas que escalan"
    }
  ],

  "Drama": [
    { 
      tone_id: "DRAMA_FAMILY", 
      label: "Drama familiar", 
      method: "CHARACTER_DRIVEN", 
      conflict: "lealtad_vs_verdad", 
      pacing: "sostenido",
      description: "Conflictos entre miembros de familia, secretos y legados"
    },
    { 
      tone_id: "DRAMA_SOCIAL", 
      label: "Drama social", 
      method: "CHARACTER_DRIVEN", 
      conflict: "sistema_vs_individuo", 
      pacing: "escalada_realista",
      description: "Individuo contra instituciones o normas sociales"
    },
    { 
      tone_id: "DRAMA_POLITICAL", 
      label: "Drama político", 
      method: "PLOT_DRIVEN", 
      conflict: "poder_vs_etica", 
      pacing: "revelaciones",
      description: "Luchas de poder, corrupción y decisiones públicas"
    }
  ],

  "Thriller": [
    { 
      tone_id: "THRILLER_CONSPIRACY", 
      label: "Conspiración", 
      method: "PLOT_DRIVEN", 
      conflict: "verdad_vs_encubrimiento", 
      pacing: "reveal_chain",
      description: "Protagonista descubre conspiración que lo amenaza"
    },
    { 
      tone_id: "THRILLER_PSYCH", 
      label: "Psicológico", 
      method: "FEAR_ESCALATION", 
      conflict: "mente_vs_realidad", 
      pacing: "claustrofobico",
      description: "Realidad cuestionable, paranoia, ¿qué es real?"
    },
    { 
      tone_id: "THRILLER_CRIME", 
      label: "Crimen/Investigación", 
      method: "INVESTIGATION_CHAIN", 
      conflict: "pista_vs_tapadera", 
      pacing: "pista→reversal",
      description: "Seguir pistas, descubrir la verdad oculta"
    }
  ],

  "Acción": [
    { 
      tone_id: "ACTION_HEIST", 
      label: "Heist/Operación", 
      method: "SETPIECE_CHAIN", 
      conflict: "equipo_vs_sistema", 
      pacing: "picos_frecuentes",
      description: "Plan elaborado, complicaciones, ejecución del golpe"
    },
    { 
      tone_id: "ACTION_SURVIVAL", 
      label: "Supervivencia", 
      method: "SETPIECE_CHAIN", 
      conflict: "entorno_vs_prota", 
      pacing: "presion_continua",
      description: "Sobrevivir contra un entorno o amenaza hostil"
    },
    {
      tone_id: "ACTION_REVENGE",
      label: "Venganza",
      method: "SETPIECE_CHAIN",
      conflict: "justicia_personal",
      pacing: "escalada_violenta",
      description: "Protagonista busca justicia por mano propia"
    }
  ],

  "Terror": [
    { 
      tone_id: "HORROR_SUPERNATURAL", 
      label: "Sobrenatural", 
      method: "FEAR_ESCALATION", 
      conflict: "regla_maldita", 
      pacing: "lento→shock",
      description: "Entidad o fuerza sobrenatural con reglas propias"
    },
    { 
      tone_id: "HORROR_HOMEINV", 
      label: "Home invasion", 
      method: "FEAR_ESCALATION", 
      conflict: "intruso_vs_hogar", 
      pacing: "tension_sostenida",
      description: "Amenaza entra en espacio seguro del protagonista"
    },
    {
      tone_id: "HORROR_BODY",
      label: "Body horror",
      method: "FEAR_ESCALATION",
      conflict: "cuerpo_vs_voluntad",
      pacing: "degradacion_progresiva",
      description: "Transformación corporal no deseada, pérdida de control"
    }
  ],

  "Ciencia Ficción": [
    { 
      tone_id: "SCIFI_DYSTOPIA", 
      label: "Distopía", 
      method: "CONCEPT_DRIVEN", 
      conflict: "sistema_vs_humano", 
      pacing: "descubrimiento→crisis",
      description: "Sociedad opresiva, protagonista cuestiona el sistema"
    },
    { 
      tone_id: "SCIFI_TIME", 
      label: "Tiempo/Paradojas", 
      method: "CAUSAL_PUZZLE", 
      conflict: "causa_vs_efecto", 
      pacing: "puzzle_reveal",
      description: "Manipulación temporal con consecuencias lógicas"
    },
    {
      tone_id: "SCIFI_FIRSTCONTACT",
      label: "Primer contacto",
      method: "CONCEPT_DRIVEN",
      conflict: "conocido_vs_desconocido",
      pacing: "exploracion_cautelosa",
      description: "Encuentro con inteligencia no humana"
    }
  ],

  "Crimen": [
    { 
      tone_id: "CRIME_NOIR", 
      label: "Noir", 
      method: "INVESTIGATION_CHAIN", 
      conflict: "culpa_vs_verdad", 
      pacing: "lento→golpe",
      description: "Atmósfera oscura, protagonista moralmente ambiguo"
    },
    { 
      tone_id: "CRIME_COURT", 
      label: "Judicial", 
      method: "TRIAL_ENGINE", 
      conflict: "prueba_vs_retorica", 
      pacing: "rounds",
      description: "Drama de tribunal, argumentos como armas"
    },
    {
      tone_id: "CRIME_HEIST",
      label: "Atraco",
      method: "SETPIECE_CHAIN",
      conflict: "plan_vs_imprevisto",
      pacing: "preparacion→ejecucion",
      description: "Planificación y ejecución de un crimen elaborado"
    }
  ],

  "Romance": [
    { 
      tone_id: "ROMANCE_CLASSIC", 
      label: "Romance clásico", 
      method: "RELATIONSHIP_ARC", 
      conflict: "barreras_externas", 
      pacing: "proximidad→ruptura→eleccion",
      description: "Obstáculos externos separan a los amantes"
    },
    { 
      tone_id: "ROMANCE_BITTERSWEET", 
      label: "Agridulce", 
      method: "RELATIONSHIP_ARC", 
      conflict: "tiempo_vs_amor", 
      pacing: "melancolico",
      description: "Romance hermoso pero con final doloroso o abierto"
    },
    {
      tone_id: "ROMANCE_FORBIDDEN",
      label: "Prohibido",
      method: "RELATIONSHIP_ARC",
      conflict: "deseo_vs_consecuencia",
      pacing: "tension_constante",
      description: "Amor que transgrede normas sociales o morales"
    }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// RESOLVER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the narrative profile for a given genre and optional tone.
 * If tone is not provided, uses the default (first) tone for the genre.
 */
export function resolveNarrativeProfile(
  genre: string, 
  tone?: string
): NarrativeProfile {
  // Get base profile
  const baseProfile = GENRE_TO_NARRATIVE_PROFILE[genre] || GENRE_TO_NARRATIVE_PROFILE["Drama"];
  
  // If no tone specified, return base profile
  if (!tone) return baseProfile;
  
  // Find tone preset
  const tonePresets = GENRE_TONE_MATRIX[genre];
  if (!tonePresets) return baseProfile;
  
  const matchedTone = tonePresets.find(t => 
    t.tone_id === tone || 
    t.label.toLowerCase().includes(tone.toLowerCase())
  );
  
  if (!matchedTone) return baseProfile;
  
  // Merge tone into base profile
  return {
    ...baseProfile,
    id: matchedTone.tone_id,
    narrative_method: matchedTone.method,
    conflict_style: matchedTone.conflict,
    pacing: matchedTone.pacing,
    notes: matchedTone.description
  };
}

/**
 * Get available tones for a genre (for UI selector)
 */
export function getTonesForGenre(genre: string): TonePreset[] {
  return GENRE_TONE_MATRIX[genre] || [];
}

/**
 * Build a prompt block that injects the narrative profile rules
 */
export function buildNarrativeProfilePromptBlock(profile: NarrativeProfile): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIL NARRATIVO: ${profile.id}
━━━━━━━━━━━━━━━━━━━━━━━━━━
GÉNERO: ${profile.genre_family}
MÉTODO: ${profile.narrative_method}
CONFLICTO: ${profile.conflict_style}
RITMO: ${profile.pacing}

MOTOR DE ESCENAS (OBLIGATORIO):
- Enter late, exit early: ${profile.scene_engine.enter_late_exit_early ? 'SÍ' : 'NO'}
- Escalada de presión: ${profile.scene_engine.pressure_escalation}
- Decisión cada escena: ${profile.scene_engine.decision_every_scene ? 'OBLIGATORIO' : 'opcional'}
- Consecuencia visible: ${profile.scene_engine.consequence_visible ? 'OBLIGATORIO' : 'opcional'}

DISPOSITIVOS FIRMA DEL GÉNERO:
${profile.signature_devices.map(d => `• ${d}`).join('\n')}

ESTILO DE DIÁLOGO: ${profile.dialogue_style}
ESTILO DE SETPIECE: ${profile.setpiece_style}

PROHIBIDO EN ESCRITURA:
${profile.writing_bans.map(b => `✗ "${b}"`).join('\n')}

OBLIGATORIO EN ESCRITURA:
${profile.writing_musts.map(m => `✓ ${m}`).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
