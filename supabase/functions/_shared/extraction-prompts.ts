/**
 * EXTRACTION PROMPTS V1 - Pipeline industrial de extracción de guiones
 * Chunk Extractor + Global Consolidator
 */

// =============================================================================
// CHUNK EXTRACTOR (LLM barato, preciso, cero creatividad)
// =============================================================================

export const CHUNK_EXTRACTOR_PROMPT = {
  name: "CHUNK_EXTRACTOR_V1",
  model: "openai/gpt-5-mini", // Barato y preciso
  maxTokens: 4000,
  
  system: `Eres un extractor forense de guiones. NO escribes historias. NO rellenas huecos.

OBJETIVO: Devolver SOLO JSON válido con información EXPLÍCITA del texto.

REGLAS DURAS:
- PROHIBIDO inventar o "deducir" si no hay evidencia en el chunk
- Mantén nombres EXACTOS como aparecen (incluye mayúsculas)
- Si algo es incierto, usa { "unknown": true, "reason": "..." }
- Devuelve solo el JSON, sin comentarios ni markdown
- Mantén el idioma original del guion`,

  buildUserPrompt: (chunkId: string, chunkText: string, contextHint: string = '') => `CHUNK_ID: ${chunkId}
CONTEXTO:
- Este texto es un fragmento de guion en formato screenplay
- El chunk puede empezar o terminar a mitad de escena
${contextHint ? `- ${contextHint}` : ''}

TEXTO:
${chunkText}

TAREA:
1) Detecta escenas usando sluglines (INT./EXT.)
2) Para cada escena extrae:
   - slugline_raw, int_ext, place_raw, time_of_day
   - characters_present (de cues y acción)
   - dialogue_speakers (solo los que hablan)
   - props explícitos mencionados
   - beats (3-8 elementos: action/reveal/decision/conflict/transition)
   - turning_point si hay cambio claro (agent/event/consequence), si no: null
3) Extrae "new_entities" (personajes/localizaciones/props) solo si aparecen por PRIMERA VEZ en este chunk

SALIDA (JSON ESTRICTO):
{
  "chunk_id": "${chunkId}",
  "scenes": [
    {
      "scene_id": "S001",
      "slugline_raw": "",
      "int_ext": "INT|EXT|INT/EXT",
      "place_raw": "",
      "time_of_day": "",
      "location_norm": "",
      "characters_present": [],
      "dialogue_speakers": [],
      "dialogue_lines_count": 0,
      "beats": [{"b": 1, "type": "action|reveal|decision|conflict|transition", "text": ""}],
      "props": [],
      "conflict": "",
      "turning_point": null
    }
  ],
  "new_entities": {
    "characters": [{"name": "", "aliases": [], "first_seen_scene": ""}],
    "locations": [{"name": "", "first_seen_scene": ""}],
    "props": [{"name": "", "category": "hand|set|action|costume", "first_seen_scene": ""}]
  }
}`
};

// =============================================================================
// GLOBAL CONSOLIDATOR (LLM bueno para unificación y threads)
// =============================================================================

export const GLOBAL_CONSOLIDATOR_PROMPT = {
  name: "GLOBAL_CONSOLIDATOR_V1",
  model: "openai/gpt-5.2", // Modelo bueno para razonamiento
  maxTokens: 8000,
  
  system: `Eres un consolidador editorial de extracción. NO inventas escenas ni eventos.

TU TRABAJO: Unificar JSON parciales, normalizar entidades, y producir un "ScreenplayExtraction" canónico.

REGLAS:
- Deduplica personajes y localizaciones (aliases/variants)
- Si detectas inconsistencias, repórtalas en qc.warnings, NO las "corrijas" inventando
- Genera threads SOLO basados en patrones repetidos y conflictos explícitos. Máx 8 threads.
- Cada thread DEBE citar evidence_scenes (IDs de escenas donde aparece evidencia)
- Devuelve SOLO JSON válido
- Mantén el idioma original del guion`,

  buildUserPrompt: (partialsJsonArray: string, totalSceneCount: number, language: string = 'es') => `INPUT_PARTIALS_JSON:
${partialsJsonArray}

METADATA:
- Total scenes expected: ${totalSceneCount}
- Language: ${language}

TAREA: Consolida los chunks en un único ScreenplayExtraction.

DEVUELVE:
{
  "meta": {
    "title": "",
    "authors": [],
    "draft_date": ""
  },
  "stats": {
    "scene_count": 0,
    "dialogue_lines_count": 0
  },
  "characters": [
    {
      "id": "char_name_slug",
      "name": "",
      "aliases": [],
      "type": "main|supporting|featured_extra|voice",
      "first_seen": "",
      "scenes_count": 0,
      "dialogue_lines": 0,
      "notes": ""
    }
  ],
  "locations": [
    {
      "name": "",
      "variants": [],
      "type": "interior|exterior|both",
      "scenes_count": 0,
      "notes": ""
    }
  ],
  "props": [
    {
      "name": "",
      "category": "hand|set|action|costume",
      "recurs": true,
      "notes": ""
    }
  ],
  "scenes": [
    {
      "scene_id": "",
      "slugline_raw": "",
      "location": "",
      "int_ext": "",
      "time_of_day": "",
      "characters_present": [],
      "summary": "",
      "beats": [],
      "turning_points": []
    }
  ],
  "threads": [
    {
      "id": "T_MAIN",
      "type": "main|subplot|relationship|ethical|mystery|procedural",
      "question": "Pregunta dramática que impulsa esta trama",
      "engine": "Mecanismo narrativo (investigar, escapar, conquistar...)",
      "stake": "Qué se pierde si falla",
      "milestones": ["Evento 1", "Evento 2", "Evento 3"],
      "end_state": "Estado final de la trama",
      "evidence_scenes": ["S001", "S015", "S032"]
    }
  ],
  "thread_map": [
    {
      "scene_id": "S012",
      "A": "T_MAIN",
      "B": "",
      "crossover_event": "Descripción del cruce de tramas en esta escena"
    }
  ],
  "qc": {
    "blockers": [],
    "warnings": [],
    "score": 0
  }
}

REGLAS DE QC:
- blockers: escenas sin slugline, chunks vacíos, personajes sin nombre
- warnings: nombres ambiguos, alias dudosos, personajes sin diálogo
- score: 0-100 (100 = perfecto)

REGLAS DE THREADS:
- Genera 5-8 threads máximo
- Cada thread DEBE tener evidence_scenes con al menos 2 scene_ids
- NO inventes threads sin evidencia explícita en el texto`
};

// =============================================================================
// QC REPAIR (solo cuando falla schema)
// =============================================================================

export const QC_REPAIR_PROMPT = {
  name: "QC_REPAIR_V1",
  model: "openai/gpt-5-mini",
  maxTokens: 4000,
  
  system: `Eres un reparador de JSON. No cambias contenido, solo arreglas estructura para cumplir el schema.
No inventes. Si un campo no existe, pon null y añade un warning.
Devuelve SOLO JSON válido.`,

  buildUserPrompt: (badJson: string, schemaHint: string) => `SCHEMA_REQUIREMENTS:
${schemaHint}

JSON_DEFECTUOSO:
${badJson}

ARREGLA Y DEVUELVE JSON válido. Si faltan campos requeridos, usa valores por defecto y registra en warnings.`
};

// =============================================================================
// SINGLE-PASS EXTRACTION (para guiones pequeños <20 escenas)
// =============================================================================

export const SINGLE_PASS_EXTRACTION_PROMPT = {
  name: "SINGLE_PASS_EXTRACTION_V1",
  model: "openai/gpt-5.2",
  maxTokens: 8000,
  
  system: `Eres un analista profesional de guiones. Tu trabajo es extraer información estructurada.

REGLAS:
- NO inventes nada que no esté en el texto
- Mantén nombres EXACTOS como aparecen
- Deduplica personajes (SOLO = NAPOLEON SOLO = misma persona)
- Genera threads SOLO basados en patrones repetidos
- Cada thread debe citar evidence_scenes
- Mantén el idioma original del guion`,

  buildUserPrompt: (scriptText: string, language: string = 'es') => `SCREENPLAY TEXT:
${scriptText}

LANGUAGE: ${language}

EXTRAE la siguiente información en JSON:

{
  "meta": { "title": "", "authors": [], "draft_date": "" },
  "characters": [
    { "id": "", "name": "", "aliases": [], "type": "main|supporting|featured_extra|voice", "scenes_count": 0, "dialogue_lines": 0 }
  ],
  "locations": [
    { "name": "", "variants": [], "type": "interior|exterior|both", "scenes_count": 0 }
  ],
  "props": [
    { "name": "", "category": "hand|set|action|costume", "recurs": true }
  ],
  "scenes": [
    { "scene_id": "", "slugline_raw": "", "location": "", "int_ext": "", "time_of_day": "", "characters_present": [], "summary": "" }
  ],
  "threads": [
    { "id": "", "type": "main|subplot|relationship", "question": "", "engine": "", "stake": "", "milestones": [], "end_state": "", "evidence_scenes": [] }
  ],
  "qc": { "blockers": [], "warnings": [], "score": 0 }
}

DEVUELVE SOLO JSON válido.`
};

// =============================================================================
// THREAD INFERENCE (post-extraction, opcional)
// =============================================================================

export const THREAD_INFERENCE_PROMPT = {
  name: "THREAD_INFERENCE_V1",
  model: "openai/gpt-5.2",
  maxTokens: 4000,
  
  system: `Eres un arquitecto de tramas. Analizas estructuras narrativas en guiones ya extraídos.

REGLAS:
- Genera 5-8 threads máximo
- Cada thread debe basarse en EVIDENCIA EXPLÍCITA
- NO inventes conflictos o arcos que no existan
- Cita evidence_scenes para cada thread
- Un thread sin al menos 3 evidencias no es thread, es ruido`,

  buildUserPrompt: (extractionJson: any) => `EXTRACTION_JSON:
${JSON.stringify(extractionJson, null, 2)}

Analiza la extracción y genera threads basados en patrones de:
- Conflictos recurrentes entre personajes
- Objetivos de personajes que se desarrollan en múltiples escenas
- Misterios que se plantean y desarrollan
- Relaciones que evolucionan

DEVUELVE:
{
  "threads": [
    {
      "id": "T_MAIN",
      "type": "main|subplot|relationship|ethical|mystery|procedural",
      "question": "",
      "engine": "",
      "stake": "",
      "milestones": [],
      "end_state": "",
      "evidence_scenes": []
    }
  ],
  "thread_map": [
    { "scene_id": "", "A": "T_MAIN", "B": "", "crossover_event": "" }
  ]
}

Solo devuelve JSON válido.`
};
