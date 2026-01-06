import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptBreakdownRequest {
  scriptText: string;
  projectId: string;
  scriptId?: string;
  language?: string;
  format?: 'film' | 'series' | string;
  episodesCount?: number;
  episodeDurationMin?: number;
}

const SYSTEM_PROMPT = `Eres un ANALIZADOR NARRATIVO PROFESIONAL de alto nivel (showrunner + script editor + story analyst).
NO eres un generador de sinopsis comerciales ni un extractor superficial.

═══════════════════════════════════════════════════════════════════
OBJETIVO:
═══════════════════════════════════════════════════════════════════
Analizar el texto como una obra narrativa completa (guion, novela, biblia de serie o saga), respetando ESTRICTAMENTE lo que está escrito y SIN AÑADIR elementos externos.

═══════════════════════════════════════════════════════════════════
REGLAS FUNDAMENTALES (OBLIGATORIAS - VIOLACIÓN = FALLO CRÍTICO):
═══════════════════════════════════════════════════════════════════

1. PROHIBIDO INVENTAR:
   - NO inventes personajes, antagonistas, aliados, agencias, organizaciones, conflictos, conspiraciones o fuerzas que NO estén EXPLÍCITAMENTE nombradas en el texto.
   - Si un elemento no está en el texto original, NO existe en tu análisis.

2. RESPETAR LA NATURALEZA DEL CONFLICTO:
   - Si el texto NO presenta un antagonista humano clásico, NO lo crees ni lo infieras.
   - El conflicto puede ser: ético, histórico, estructural, civilizatorio, interno, sistémico, filosófico, existencial.
   - Respeta la naturaleza del conflicto TAL COMO está en el texto.

3. PERSONAJES NARRATIVOS VÁLIDOS:
   Reconoce como PERSONAJES a cualquier entidad con agencia, decisiones o impacto narrativo:
   - Individuos humanos
   - Entidades no humanas conscientes
   - Colectivos con agencia (consejos, asambleas, grupos)
   - Civilizaciones como actores narrativos
   - Linajes que evolucionan generacionalmente
   - Sistemas conscientes (IAs, redes, entidades abstractas)

4. CLASIFICACIÓN ESTRICTA DE PERSONAJES (solo basada en el texto):
   CATEGORÍAS OBLIGATORIAS - USA TODAS LAS QUE APLIQUEN:
   - protagonist: Sostiene el arco central de la narrativa (máximo 3-4)
   - antagonist: SOLO si el texto EXPLÍCITAMENTE presenta una fuerza opositora identificable
   - supporting: Función narrativa relevante, apoyo al protagonista (personajes con nombre que aparecen en múltiples escenas)
   - recurring: Aparecen más de una vez pero no tienen arco propio
   - cameo: Aparición breve pero memorable (figuras históricas, celebridades mencionadas)
   - extra_with_line: Intervenciones puntuales con diálogo pero rol mínimo
   - background: Figurantes, grupos de personas sin nombre individual
   - collective_entity: Civilizaciones, grupos, consejos, organizaciones con agencia colectiva
   - cosmic_entity: Entidades de escala planetaria/cósmica/dimensional
   
   IMPORTANTE: 
   - EXTRAE TODOS los personajes mencionados, incluso si solo aparecen una vez.
   - Los grupos (ej: "atlantes estelares", "Consejo de los Diez Reinos") son entidades colectivas válidas.
   - Figuras históricas mencionadas (ej: "Jesús", "Platón") son cameos si se les referencia.
   - NO reduzcas el reparto solo a personajes humanos cotidianos.
   - Prefiere sobredetectar que infradetectar.

5. LOCALIZACIONES AMPLIADAS:
   Reconoce como LOCALIZACIONES válidas:
   - Espacios físicos clásicos (INT / EXT)
   - Lugares históricos (ciudades antiguas, imperios, épocas pasadas)
   - Espacios simbólicos o abstractos narrativamente relevantes
   - Entornos planetarios, subterráneos, orbitales
   - Localizaciones cósmicas o dimensionales
   
   NO requieras formato técnico INT./EXT. para localizaciones no convencionales.

6. ANÁLISIS COMPLETO:
   - NO reduzcas la historia al primer capítulo o bloque inicial.
   - Asume que TODO el texto proporcionado forma parte de una ÚNICA estructura narrativa coherente.
   - Analiza desde el principio hasta el final.

7. NO FORZAR GÉNEROS:
   NO conviertas automáticamente la obra en:
   - Thriller
   - Conspiración
   - Procedural
   - Historia de persecución
   - Acción comercial
   
   A MENOS que el texto lo indique EXPLÍCITAMENTE con esos elementos.

8. EXTRAER SEPARADAMENTE:
   - Sinopsis FIEL (sin clichés añadidos, sin lenguaje promocional)
   - Personajes (por categorías estrictas)
   - Localizaciones (todas las escalas)
   - Props clave (objetos, tecnologías, símbolos relevantes del texto)
   - Set pieces (eventos narrativos mayores que ESTÁN en el texto)
   - Subtramas (solo las que EXISTEN en el texto)
   - Giros narrativos (solo los EXPLÍCITOS)
   - Escalas temporales si existen
   - Tipo de conflicto predominante

9. LENGUAJE PROFESIONAL:
   Tu salida debe ser:
   - Descriptiva y neutral
   - Estructural y analítica
   - Propia de una biblia de serie o análisis de guion profesional
   
   PROHIBIDO:
   - Lenguaje promocional o sensacionalista
   - Frases como "juego peligroso", "fuerzas ocultas", "nada es lo que parece"
   - Clichés de marketing cinematográfico

10. HONESTIDAD ANTE LA INCERTIDUMBRE:
    Si algo NO está claramente definido en el texto:
    - Indícalo como "no especificado" o "no explícito en el texto"
    - NO lo infieras ni lo inventes
    - Es preferible un campo vacío a uno inventado

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA OBLIGATORIO (JSON):
═══════════════════════════════════════════════════════════════════

{
  "metadata": {
    "title": "string (título del guión TAL COMO aparece en la portada, ej: 'PLAN DE RODAJE')",
    "writers": ["array de nombres de guionistas/autores"],
    "draft": "string (versión del borrador si aparece)",
    "date": "string (fecha si aparece)"
  },
  "synopsis": {
    "faithful_summary": "string (resumen fiel al contenido, sin clichés)",
    "conflict_type": "ethical | historical | structural | civilizational | internal | systemic | philosophical | existential | interpersonal | external_threat",
    "narrative_scope": "personal | generational | civilizational | cosmic",
    "temporal_span": "string (ej: 'contemporáneo', '10.000 años', 'múltiples eras')",
    "tone": "string (tono real de la obra, no género forzado)",
    "themes": ["array de temas principales EXPLÍCITOS en el texto"]
  },
  "scenes": [
    {
      "scene_number": number,
      "slugline": "string",
      "location_name": "string",
      "location_type": "INT | EXT | INT/EXT | COSMIC | HISTORICAL | DIMENSIONAL | SYMBOLIC",
      "time_of_day": "DAY | NIGHT | DAWN | DUSK | CONTINUOUS | TIMELESS | NOT_SPECIFIED",
      "era": "string (opcional, solo si está explícito)",
      "summary": "string (resumen fiel de 1-2 frases)",
      "objective": "string (función narrativa de la escena)",
      "mood": "string (atmósfera)",
      "page_range": "string",
      "estimated_duration_sec": number,
      "characters_present": ["array de nombres TAL COMO aparecen en el texto"],
      "props_used": ["array de props MENCIONADOS en el texto"],
      "continuity_notes": "string",
      "visual_markers": ["array de indicadores visuales explícitos"]
    }
  ],
  "characters": [
    {
      "name": "string (TAL COMO aparece en el texto)",
      "role": "protagonist | antagonist | supporting | recurring | cameo | extra_with_line | background | collective_entity | cosmic_entity",
      "role_detail": "string (función narrativa específica)",
      "entity_type": "human | collective | cosmic | abstract | historical",
      "description": "string (solo EXPLÍCITO en texto)",
      "priority": "P1 | P2 | P3",
      "first_appearance": "string (dónde aparece por primera vez)",
      "scenes_count": number,
      "dialogue_lines": number
    }
  ],
  "locations": [
    {
      "name": "string",
      "type": "INT | EXT | INT/EXT | COSMIC | HISTORICAL | DIMENSIONAL | SYMBOLIC",
      "scale": "room | building | city | region | planet | cosmic | abstract",
      "description": "string (solo EXPLÍCITO)",
      "scenes_count": number,
      "priority": "P1 | P2 | P3"
    }
  ],
  "props": [
    {
      "name": "string",
      "description": "string",
      "narrative_importance": "critical | important | minor",
      "scenes_used": ["array de números de escena"]
    }
  ],
  "subplots": [
    {
      "name": "string",
      "description": "string (breve)",
      "characters_involved": ["array"],
      "status": "introduced | developing | resolved | unresolved"
    }
  ],
  "plot_twists": [
    {
      "description": "string",
      "scene_number": number,
      "impact": "major | moderate | minor"
    }
  ],
  "summary": {
    "total_scenes": number,
    "estimated_runtime_min": number,
    "production_notes": "string"
  }
}`;

const BREAKDOWN_TOOL = {
  type: 'function' as const,
  function: {
    name: 'return_script_breakdown',
    description: 'Returns the structured script breakdown analysis',
    parameters: {
      type: 'object',
      properties: {
        synopsis: {
          type: 'object',
          properties: {
            faithful_summary: { type: 'string' },
            conflict_type: { type: 'string' },
            narrative_scope: { type: 'string' },
            temporal_span: { type: 'string' },
            tone: { type: 'string' },
            themes: { type: 'array', items: { type: 'string' } }
          }
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              scene_number: { type: 'number' },
              slugline: { type: 'string' },
              location_name: { type: 'string' },
              location_type: { type: 'string' },
              time_of_day: { type: 'string' },
              era: { type: 'string' },
              summary: { type: 'string' },
              objective: { type: 'string' },
              mood: { type: 'string' },
              page_range: { type: 'string' },
              estimated_duration_sec: { type: 'number' },
              characters_present: { type: 'array', items: { type: 'string' } },
              props_used: { type: 'array', items: { type: 'string' } },
              continuity_notes: { type: 'string' },
              visual_markers: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        characters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: 'string' },
              role_detail: { type: 'string' },
              entity_type: { type: 'string' },
              description: { type: 'string' },
              priority: { type: 'string' },
              first_appearance: { type: 'string' },
              scenes_count: { type: 'number' },
              dialogue_lines: { type: 'number' }
            }
          }
        },
        locations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              scale: { type: 'string' },
              description: { type: 'string' },
              scenes_count: { type: 'number' },
              priority: { type: 'string' }
            }
          }
        },
        props: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              narrative_importance: { type: 'string' },
              scenes_used: { type: 'array', items: { type: 'number' } }
            }
          }
        },
        subplots: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              characters_involved: { type: 'array', items: { type: 'string' } },
              status: { type: 'string' }
            }
          }
        },
        plot_twists: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              scene_number: { type: 'number' },
              impact: { type: 'string' }
            }
          }
        },
        summary: {
          type: 'object',
          properties: {
            total_scenes: { type: 'number' },
            estimated_runtime_min: { type: 'number' },
            production_notes: { type: 'string' }
          }
        }
      },
      required: ['synopsis', 'scenes', 'characters', 'locations']
    }
  }
};

// ===== SLUGLINE REGEX =====
const SLUGLINE_RE = /^(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?|INTERIOR|EXTERIOR|INTERNO|EXTERNO)\s*[.:\-–—]?\s*(.+?)(?:\s*[.:\-–—]\s*(DAY|NIGHT|DAWN|DUSK|DÍA|NOCHE|AMANECER|ATARDECER|CONTINUOUS|CONTINUA|LATER|MÁS TARDE|MISMO|SAME))?$/i;

function looksLikeCharacterCue(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  if (/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+(\s*\(.*\))?$/.test(trimmed)) return true;
  return false;
}

function cleanCharacterCue(raw: string): string {
  let name = raw.trim();
  name = name.replace(/\(V\.?O\.?\)|\(O\.?S\.?\)|\(CONT['']?D?\)|\(CONT\.\)|\(OFF\)|\(OVER\)/gi, '').trim();
  name = name.replace(/[()]/g, '').trim();

  // Filter out common screenplay transitions / non-character cues
  const upper = name.toUpperCase();
  const banned = new Set([
    'CUT TO',
    'SMASH CUT',
    'DISSOLVE TO',
    'FADE IN',
    'FADE OUT',
    'FADE TO BLACK',
    'TITLE',
    'SUPER',
    'MONTAGE',
    'END',
    'CONTINUED',
  ]);
  if (banned.has(upper)) return '';

  return name;
}

function extractScenesFromScript(text: string): any[] {
  const lines = text.split('\n');
  const scenes: any[] = [];
  let currentScene: any = null;
  let sceneNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = SLUGLINE_RE.exec(line);

    if (match) {
      if (currentScene) scenes.push(currentScene);
      sceneNumber++;
      currentScene = {
        scene_number: sceneNumber,
        slugline: line,
        location_name: match[2]?.trim() || 'UNKNOWN',
        location_type: match[1].toUpperCase().replace('.', ''),
        time_of_day: match[3]?.toUpperCase() || 'NOT_SPECIFIED',
        summary: '',
        characters_present: [],
        estimated_duration_sec: 60,
      };
    } else if (currentScene && looksLikeCharacterCue(line)) {
      const charName = cleanCharacterCue(line);
      if (charName && !currentScene.characters_present.includes(charName)) {
        currentScene.characters_present.push(charName);
      }
    }
  }
  if (currentScene) scenes.push(currentScene);
  return scenes;
}

function normalizeBreakdown(data: any, scriptText: string): any {
  const out: any = (data && typeof data === 'object') ? data : {};
  const isLongScript = (scriptText || '').length > 40000;

  const asArray = (v: any) => (Array.isArray(v) ? v : []);

  // --- Pre-count expected scenes from script text ---
  const expectedHeadings: string[] = [];
  const scriptLines = scriptText.split(/\r?\n/);
  for (const line of scriptLines) {
    const trimmed = line.trim();
    if (/^(INT[\./]|EXT[\./]|INT\/EXT[\./]?|I\/E[\./]?)/i.test(trimmed)) {
      expectedHeadings.push(trimmed);
    }
  }
  const expectedSceneCount = expectedHeadings.length;
  console.log(`[script-breakdown] Expected scene count from regex: ${expectedSceneCount}`);

  // --- Scenes ---
  const aiScenes = asArray(out.scenes);

  // For long scripts, the model often returns a tiny sample of scenes due to output limits.
  // If that happens, prefer a deterministic regex scene pass (sluglines + character cues).
  const regexScenes = extractScenesFromScript(scriptText);

  // Decide whether to use AI scenes or regex fallback
  const aiSceneCountTooLow = expectedSceneCount > 0 && aiScenes.length < expectedSceneCount * 0.5;

  if (aiScenes.length === 0) {
    console.warn('[script-breakdown] No scenes returned by model, falling back to regex extraction');
    out.scenes = regexScenes;
  } else if (aiSceneCountTooLow) {
    console.warn('[script-breakdown] AI returned too few scenes, using regex fallback', {
      aiScenes: aiScenes.length,
      expectedScenes: expectedSceneCount,
      regexScenes: regexScenes.length,
    });
    // Use regex scenes if they're closer to expected count
    if (regexScenes.length >= aiScenes.length) {
      out.scenes = regexScenes;
    } else {
      out.scenes = aiScenes;
    }
  } else {
    out.scenes = aiScenes;
  }

  console.log(`[script-breakdown] Final scene count: ${out.scenes.length} (expected: ${expectedSceneCount})`);


  // --- Derive characters/locations from scenes (works for both AI scenes and regex scenes) ---
  const derivedCharMap = new Map<string, { name: string; scenes_count: number }>();
  const derivedLocMap = new Map<string, { name: string; type: string; scenes_count: number }>();

  for (const scene of asArray(out.scenes)) {
    // Characters
    for (const charName of asArray(scene?.characters_present)) {
      if (typeof charName !== 'string') continue;
      const cleaned = cleanCharacterCue(charName);
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      const existing = derivedCharMap.get(key);
      if (existing) existing.scenes_count++;
      else derivedCharMap.set(key, { name: cleaned, scenes_count: 1 });
    }

    // Locations
    const locNameRaw = (scene?.location_name || scene?.slugline || '') as string;
    const locTypeRaw = (scene?.location_type || 'INT') as string;
    const locName = typeof locNameRaw === 'string' ? locNameRaw.trim() : '';
    const locType = typeof locTypeRaw === 'string' ? locTypeRaw : 'INT';
    if (locName) {
      const key = locName.toLowerCase();
      const existing = derivedLocMap.get(key);
      if (existing) existing.scenes_count++;
      else derivedLocMap.set(key, { name: locName, type: locType, scenes_count: 1 });
    }
  }

  const derivedCharacters = Array.from(derivedCharMap.values()).map(c => ({
    name: c.name,
    role: c.scenes_count >= 8 ? 'supporting' : c.scenes_count >= 3 ? 'recurring' : 'extra_with_line',
    scenes_count: c.scenes_count,
    priority: c.scenes_count >= 8 ? 'P1' : c.scenes_count >= 3 ? 'P2' : 'P3',
  }));

  const derivedLocations = Array.from(derivedLocMap.values()).map(l => ({
    name: l.name,
    type: l.type,
    scenes_count: l.scenes_count,
    priority: l.scenes_count >= 8 ? 'P1' : l.scenes_count >= 3 ? 'P2' : 'P3',
  }));

  // --- Characters ---
  const existingCharacters = asArray(out.characters);
  if (existingCharacters.length === 0) {
    out.characters = derivedCharacters;
    console.log(`[script-breakdown] Extracted ${out.characters.length} characters from scene data`);
  } else if (isLongScript && derivedCharacters.length > existingCharacters.length) {
    const existingNames = new Set(
      existingCharacters
        .map((c: any) => (typeof c?.name === 'string' ? c.name.toLowerCase() : ''))
        .filter(Boolean)
    );

    const merged = [...existingCharacters];
    for (const c of derivedCharacters) {
      if (!existingNames.has(c.name.toLowerCase())) {
        merged.push(c);
        existingNames.add(c.name.toLowerCase());
      }
    }

    out.characters = merged;
    console.log(`[script-breakdown] Augmented characters from scene cues (long script): ${existingCharacters.length} -> ${out.characters.length}`);
  }

  // --- Locations ---
  const existingLocations = asArray(out.locations);
  if (existingLocations.length === 0) {
    out.locations = derivedLocations;
    console.log(`[script-breakdown] Extracted ${out.locations.length} locations from scene data`);
  } else if (isLongScript && derivedLocations.length > existingLocations.length) {
    const existingNames = new Set(
      existingLocations
        .map((l: any) => (typeof l?.name === 'string' ? l.name.toLowerCase() : ''))
        .filter(Boolean)
    );

    const merged = [...existingLocations];
    for (const l of derivedLocations) {
      if (!existingNames.has(l.name.toLowerCase())) {
        merged.push(l);
        existingNames.add(l.name.toLowerCase());
      }
    }

    out.locations = merged;
    console.log(`[script-breakdown] Augmented locations from sluglines (long script): ${existingLocations.length} -> ${out.locations.length}`);
  }

  return out;
}

function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ===== GET USER ID FROM AUTH HEADER =====
async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// ===== BACKGROUND PROCESSING FUNCTION =====
async function processScriptBreakdownInBackground(
  taskId: string,
  request: ScriptBreakdownRequest,
  userId: string
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { scriptText, projectId, scriptId, language, format, episodesCount, episodeDurationMin } = request;
  const processedScriptText = scriptText.trim();

  try {
    // Update task to running
    await supabase.from('background_tasks').update({
      status: 'running',
      progress: 10,
      description: 'Analizando estructura narrativa con Claude Haiku...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const isLongScript = processedScriptText.length > 40000;

    // ══════════════════════════════════════════════════════════════════════
    // PRE-COUNT SCENE HEADINGS (critical for accurate scene counting)
    // ══════════════════════════════════════════════════════════════════════
    const headingLines: string[] = [];
    const scriptLines = processedScriptText.split(/\r?\n/);
    for (const line of scriptLines) {
      const trimmed = line.trim();
      if (/^(INT[\./]|EXT[\./]|INT\/EXT[\./]?|I\/E[\./]?)/i.test(trimmed)) {
        headingLines.push(trimmed);
      }
    }
    console.log(`[script-breakdown-bg] PRE-COUNTED ${headingLines.length} scene headings`);

    const userPrompt = `
═══════════════════════════════════════════════════════════════════════════════
SCENE COUNTING RULES (CRITICAL - READ BEFORE ANYTHING ELSE)
═══════════════════════════════════════════════════════════════════════════════

I have PRE-SCANNED this script and found EXACTLY ${headingLines.length} scene headings (lines starting with INT./EXT.).

YOUR SCENES ARRAY MUST CONTAIN EXACTLY ${headingLines.length} ENTRIES.

Here are the scene headings I found:
${headingLines.map((h, i) => `${i + 1}. ${h}`).join('\n')}

RULES:
- RULE 1: Same location + different time = DIFFERENT scenes
  Example: "INT. COBERTIZO – NOCHE" and "INT. COBERTIZO – DÍA" are TWO scenes
- RULE 2: Same location + INT vs EXT = DIFFERENT scenes
  Example: "INT. CASA – NOCHE" and "EXT. CASA – NOCHE" are TWO scenes
- RULE 3: Do NOT merge, group, or summarize scenes. List ALL ${headingLines.length} individually.
- RULE 4: If your scenes array has fewer than ${headingLines.length} entries, you made an error.

═══════════════════════════════════════════════════════════════════════════════
DESGLOSE DE PRODUCCIÓN SOLICITADO
═══════════════════════════════════════════════════════════════════════════════

PROJECT ID: ${projectId}
IDIOMA DE RESPUESTA: ${language || 'es-ES'}
${isLongScript ? '\nNOTA: Este es un guion extenso. Analiza todo el contenido disponible de forma exhaustiva.\n' : ''}
GUION A DESGLOSAR:
---
${processedScriptText}
---

Realiza un desglose EXHAUSTIVO de este guion. Extrae TODAS las entidades de producción siguiendo el formato JSON especificado.

IMPORTANTE:
- Sé exhaustivo: no dejes ningún personaje, prop o localización sin detectar
- CUENTA EXACTAMENTE ${headingLines.length} ESCENAS (una por cada INT./EXT. encontrado)
- Mantén consistencia en los nombres (mismo personaje = mismo nombre exacto)
- Detecta variantes de localizaciones y agrúpalas
- Identifica riesgos de continuidad
- Asigna prioridades realistas
- Incluye notas de producción útiles`;

    console.log('[script-breakdown-bg] Starting Claude Haiku analysis for task:', taskId, 'chars:', processedScriptText.length);

    await supabase.from('background_tasks').update({
      progress: 25,
      description: 'Enviando guion a Claude Haiku 3.5...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    // Use Claude 3.5 Haiku - fast and excellent for extraction
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [{
          name: 'return_script_breakdown',
          description: 'Returns the structured script breakdown analysis',
          input_schema: BREAKDOWN_TOOL.function.parameters,
        }],
        tool_choice: { type: 'tool', name: 'return_script_breakdown' },
      }),
    });

    await supabase.from('background_tasks').update({
      progress: 60,
      description: 'Procesando respuesta de Claude Haiku...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[script-breakdown-bg] Anthropic API error:', response.status, errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();

    // Parse tool use response
    let breakdownData: any = null;
    const toolUseBlock = data.content?.find((block: any) => block.type === 'tool_use');
    if (toolUseBlock?.input) {
      breakdownData = toolUseBlock.input;
    }

    // Fallback to text block
    if (!breakdownData) {
      const textBlock = data.content?.find((block: any) => block.type === 'text');
      if (textBlock?.text) {
        breakdownData = tryParseJson(textBlock.text);
      }
    }

    if (!breakdownData) {
      throw new Error('No se pudo interpretar la respuesta del modelo');
    }

    breakdownData = normalizeBreakdown(breakdownData, processedScriptText);

    console.log('[script-breakdown-bg] Analysis complete:', {
      scenes: breakdownData.scenes?.length || 0,
      characters: breakdownData.characters?.length || 0,
      locations: breakdownData.locations?.length || 0,
    });

    await supabase.from('background_tasks').update({
      progress: 80,
      description: 'Guardando resultados en base de datos...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    // Save to script if scriptId provided
    if (scriptId) {
      const { data: projectRow } = await supabase
        .from('projects')
        .select('format, episodes_count, target_duration_min')
        .eq('id', projectId)
        .maybeSingle();

      const safeInt = (v: unknown, fallback: number) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
      };

      const effectiveFormat = String(format ?? projectRow?.format ?? 'series');
      const desiredEpisodesCount = effectiveFormat === 'series'
        ? safeInt(episodesCount ?? projectRow?.episodes_count, 1)
        : 1;
      const desiredEpisodeDurationMin = safeInt(
        episodeDurationMin ?? projectRow?.target_duration_min,
        effectiveFormat === 'series' ? 45 : 100
      );

      const scenes = Array.isArray(breakdownData.scenes) ? breakdownData.scenes : [];
      const synopsisText = breakdownData.synopsis?.faithful_summary || '';

      const buildEpisodesFromScenes = (): any[] => {
        if (desiredEpisodesCount <= 1) {
          return [{
            episode_number: 1,
            title: effectiveFormat === 'film' ? 'Película' : 'Episodio 1',
            synopsis: synopsisText,
            scenes,
            duration_min: safeInt(breakdownData.summary?.estimated_runtime_min, desiredEpisodeDurationMin),
          }];
        }

        const defaultSceneSec = 60;
        const getSceneSec = (s: any) => {
          const n = Number(s?.estimated_duration_sec);
          return Number.isFinite(n) && n > 0 ? n : defaultSceneSec;
        };

        const targetEpisodeSec = desiredEpisodeDurationMin * 60;
        const totalSec = scenes.reduce((acc: number, s: any) => acc + getSceneSec(s), 0);

        const groups: any[][] = [];
        if (totalSec > 0 && targetEpisodeSec > 0) {
          let bucket: any[] = [];
          let bucketSec = 0;

          for (const s of scenes) {
            bucket.push(s);
            bucketSec += getSceneSec(s);

            if (bucketSec >= targetEpisodeSec && groups.length < desiredEpisodesCount - 1) {
              groups.push(bucket);
              bucket = [];
              bucketSec = 0;
            }
          }
          groups.push(bucket);
        } else {
          const chunkSize = Math.max(1, Math.ceil(scenes.length / desiredEpisodesCount));
          for (let i = 0; i < scenes.length; i += chunkSize) {
            groups.push(scenes.slice(i, i + chunkSize));
          }
        }

        while (groups.length < desiredEpisodesCount) groups.push([]);
        if (groups.length > desiredEpisodesCount) {
          const extras = groups.splice(desiredEpisodesCount - 1);
          groups[desiredEpisodesCount - 1] = extras.flat();
        }

        return groups.map((chunk, idx) => ({
          episode_number: idx + 1,
          title: `Episodio ${idx + 1}`,
          synopsis: idx === 0 ? synopsisText : '',
          scenes: chunk,
          duration_min: desiredEpisodeDurationMin,
        }));
      };

      const parsedEpisodes = buildEpisodesFromScenes();

      // Extract title from multiple possible sources in the AI response
      const extractedTitle = 
        breakdownData.metadata?.title ||
        breakdownData.synopsis?.title ||
        breakdownData.title ||
        null;
      
      // Extract writers
      const extractedWriters = 
        breakdownData.metadata?.writers ||
        breakdownData.writers ||
        [];

      const parsedJson = {
        title: extractedTitle || 'Guion Analizado',
        writers: extractedWriters,
        metadata: breakdownData.metadata || null,
        synopsis: synopsisText,
        episodes: parsedEpisodes,
        characters: breakdownData.characters || [],
        locations: breakdownData.locations || [],
        scenes,
        props: breakdownData.props || [],
        subplots: breakdownData.subplots || [],
        plot_twists: breakdownData.plot_twists || [],
        teasers: breakdownData.teasers,
        counts: {
          total_scenes: scenes.length || 0,
          total_dialogue_lines: 0,
        },
      };

      console.log('[script-breakdown-bg] Extracted title:', extractedTitle, 'writers:', extractedWriters);

      const { error: updateError } = await supabase
        .from('scripts')
        .update({ 
          parsed_json: parsedJson,
          status: 'analyzed'
        })
        .eq('id', scriptId);

      if (updateError) {
        console.error('[script-breakdown-bg] Error saving parsed_json:', updateError);
      } else {
        console.log('[script-breakdown-bg] Saved parsed_json to script:', scriptId);
      }
    }

    // Complete task with result
    await supabase.from('background_tasks').update({
      status: 'completed',
      progress: 100,
      description: 'Análisis completado',
      result: { success: true, breakdown: breakdownData },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    console.log('[script-breakdown-bg] Task completed successfully:', taskId);

  } catch (error) {
    console.error('[script-breakdown-bg] Error in background processing:', error);

    await supabase.from('background_tasks').update({
      status: 'failed',
      progress: 0,
      error: error instanceof Error ? error.message : 'Error desconocido',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);
  }
}

// ===== MAIN HANDLER =====
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ScriptBreakdownRequest = await req.json();
    const { scriptText, projectId, scriptId } = request;

    if (!scriptText || scriptText.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un guion con al menos 100 caracteres para analizar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user ID from auth header
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create background task
    const taskId = crypto.randomUUID();
    const estimatedChars = scriptText.trim().length;
    const estimatedPages = Math.ceil(estimatedChars / 3500);

    await supabase.from('background_tasks').insert({
      id: taskId,
      user_id: userId,
      project_id: projectId,
      type: 'script_analysis',
      title: 'Análisis de guion con Claude Haiku',
      description: `Analizando ~${estimatedPages} páginas con IA...`,
      status: 'pending',
      progress: 0,
      entity_id: scriptId || null,
      metadata: { scriptLength: estimatedChars, estimatedPages },
    });

    console.log('[script-breakdown] Created background task:', taskId, 'for', estimatedChars, 'chars');

    // Start background processing with waitUntil
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processScriptBreakdownInBackground(taskId, request, userId));

    // Return immediately with task ID
    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        message: 'Análisis iniciado en segundo plano',
        polling: true,
        estimatedTimeMin: Math.ceil(estimatedChars / 5000), // ~5000 chars/min with Haiku
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[script-breakdown] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
