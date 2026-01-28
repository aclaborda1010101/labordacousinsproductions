# LC Studio - Arquitectura V3

## Principio Rector

```
SEPARAR SIEMPRE:
├── Estructura (JSON pequeño): decisiones, beats, escenas, objetivos
├── Prosa (texto): el guion escrito
└── Validación (scoring + fixes): lo que corrige y estabiliza
```

---

## PROCESO A: Generación desde Idea

```
A1. INTAKE
   └── project_brief.json
         ↓
A2. CLASIFICACIÓN + STYLE CODES
   └── creative_profile.json
         ↓
A3. BLUEPRINT (outline estructural)
   └── outline_blueprint.json
         ↓
A4. SALA DE GUIONISTAS (consistencia)
   └── outline_v2.json + notes.json
         ↓
A5. SCRIPT RENDER (escena por escena)
   └── draft_script + scene_texts[]
         ↓
A6. FORMATEO HOLLYWOOD
   └── final_script.fdx/.pdf
         ↓
A7. QA + FIX LOOP
   └── quality_report + fixes localizados
```

### A1. Intake - project_brief.json
```json
{
  "logline": "string (1 frase)",
  "genre": "thriller",
  "subgenre": "neo-noir",
  "tone": "dark_comedy",
  "references": ["Se7en", "Fargo"],
  "format": "film",
  "duration_min": 90,
  "constraints": {
    "rating": "R",
    "budget": "mid",
    "locations": ["urbano", "interior"],
    "period": "contemporáneo"
  }
}
```

### A2. Creative Profile
```json
{
  "genre_id": "thriller_noir",
  "style_codes": ["SLOW_BURN", "DARK_COMEDY", "VISUAL_HEAVY"],
  "format_profile": {
    "type": "film_90",
    "acts": 3,
    "avg_scene_duration": 120,
    "dialogue_density": 0.4
  },
  "knowledge_pack": "thriller_noir_film"
}
```

### A3. Blueprint - outline_blueprint.json
```json
{
  "acts": [
    {
      "act": 1,
      "pages": "1-25",
      "beats": [
        {
          "beat_type": "opening_image",
          "scene_range": [1, 2],
          "description": "..."
        },
        {
          "beat_type": "inciting_incident",
          "scene_range": [5, 6],
          "description": "..."
        }
      ]
    }
  ],
  "scenes": [
    {
      "scene_id": 1,
      "objective": "Establecer mundo normal",
      "conflict": "Protagonista ignora señales",
      "turn": "Descubre algo que no debía",
      "value_change": "seguridad -> duda",
      "characters": ["PROTAGONISTA", "VÍCTIMA"],
      "setting": "INT. OFICINA - NOCHE",
      "why_exists": "Setup del mundo y falsa seguridad"
    }
  ],
  "protagonist_arc": {
    "want": "...",
    "need": "...",
    "flaw": "...",
    "ghost": "...",
    "transformation": "de A a B"
  }
}
```

---

## PROCESO B: Extracción desde Guion Pro

```
B1. INGEST + PARSE
   └── parsed_script.json
         ↓
B2. ANÁLISIS DE PRODUCCIÓN
   └── production_breakdown.json
         ↓
B3. ANÁLISIS NARRATIVO
   └── narrative_report.json
         ↓
B4. EXPORT PARA APP
   └── scene_cards[], character_bibles[], beat_map[]
```

---

## PROCESO C: Formateo Hollywood (Transversal)

Módulo independiente:
- Input: texto crudo + metadatos
- Output: Fountain/FDX correcto
- Validador: detecta errores típicos

```typescript
interface FormatValidation {
  slugline_errors: string[];
  dialogue_errors: string[];
  action_errors: string[];
  transition_errors: string[];
  score: number; // 0-1
}
```

---

## KNOWLEDGE PACKS (El Cerebro)

### Estructura por género + formato

```json
{
  "pack_id": "thriller_noir_film",
  "genre": "thriller",
  "subgenre": "noir",
  "format": "film",
  
  "format_rules": {
    "slugline_pattern": "INT./EXT. LUGAR - MOMENTO",
    "action_max_lines": 4,
    "dialogue_max_lines": 3,
    "parenthetical_rules": ["(beat)", "(O.S.)", "(V.O.)"]
  },
  
  "structure_stats": {
    "avg_scene_count": 55,
    "avg_scene_duration_sec": 98,
    "act1_ratio": 0.25,
    "act2_ratio": 0.50,
    "act3_ratio": 0.25,
    "dialogue_density": 0.42,
    "action_density": 0.58
  },
  
  "scene_templates": [
    {
      "type": "interrogation",
      "structure": ["establecer poder", "presión", "revelación", "giro"],
      "example_slugline": "INT. SALA DE INTERROGATORIOS - NOCHE",
      "typical_duration": 180,
      "dialogue_heavy": true
    },
    {
      "type": "chase",
      "structure": ["inicio persecución", "obstáculos", "casi atrapado", "escape/captura"],
      "dialogue_heavy": false
    }
  ],
  
  "dialogue_patterns": {
    "detective": {
      "vocabulary": ["caso", "pista", "sospechoso"],
      "rhythm": "corto, directo",
      "tics": ["preguntas retóricas", "silencios"]
    },
    "femme_fatale": {
      "vocabulary": ["cariño", "problema", "solución"],
      "rhythm": "pausado, seductor",
      "tics": ["dobles sentidos", "evasivas"]
    }
  },
  
  "anti_patterns": [
    "exposición directa del pasado",
    "villano explica plan",
    "detective resuelve solo al final",
    "flashbacks excesivos"
  ],
  
  "quality_checklist": [
    "¿Hay misterio desde escena 1?",
    "¿El protagonista tiene fallo explotable?",
    "¿Hay al menos 3 sospechosos viables?",
    "¿El giro es justo pero sorprendente?",
    "¿La resolución usa pistas plantadas?"
  ]
}
```

---

## EVALUADORES AUTOMÁTICOS

```typescript
interface QualityScores {
  format_score: number;      // 0-1, gramática de guion
  pacing_score: number;      // 0-1, ritmo y duración
  voice_score: number;       // 0-1, personajes distintos
  coherence_score: number;   // 0-1, continuidad
  visual_clarity_score: number; // 0-1, filmabilidad
}

interface QualityRule {
  condition: string;
  action: string;
}

const QUALITY_RULES: QualityRule[] = [
  { 
    condition: "format_score < 0.95", 
    action: "Formatter + corrección automática" 
  },
  { 
    condition: "voice_score < 0.7", 
    action: "Reescribir diálogos de personaje X en escenas Y" 
  },
  { 
    condition: "pacing_score < 0.6", 
    action: "Revisar escenas largas, sugerir cortes" 
  },
  { 
    condition: "coherence_score < 0.8", 
    action: "Verificar continuidad, props, estados" 
  }
];
```

---

## STYLE CODES (Clustering)

```typescript
enum StyleCode {
  // Ritmo
  SLOW_BURN = "slow_burn",
  FAST_PACED = "fast_paced",
  EPISODIC = "episodic",
  
  // Diálogo
  DIALOGUE_HEAVY = "dialogue_heavy",
  VISUAL_HEAVY = "visual_heavy",
  MINIMAL_DIALOGUE = "minimal_dialogue",
  
  // Tono
  DARK_COMEDY = "dark_comedy",
  STRAIGHT_DRAMA = "straight_drama",
  ABSURDIST = "absurdist",
  
  // Estructura
  NONLINEAR = "nonlinear",
  ENSEMBLE = "ensemble",
  SINGLE_POV = "single_pov"
}
```

---

## DB SCHEMA MÍNIMO

```sql
-- Proyectos
projects
project_briefs
creative_profiles

-- Conocimiento
knowledge_packs
style_codes
scene_templates

-- Guiones
outlines (blueprint JSON)
scenes (estructura + texto)
scripts (versiones: draft, formatted)

-- Análisis
analysis_runs (status, output)
quality_reports (scores, issues, fixes)

-- Referencia (1500 guiones destilados)
reference_scripts (metadata)
extracted_patterns (lo útil)
```

---

## PIPELINE DE DESTILACIÓN (Una vez)

```
1500 PDFs
    ↓
Parser (extraer escenas, diálogo, estructura)
    ↓
Análisis estadístico por género
    ↓
Clustering por style_codes
    ↓
Extracción de:
├── format_rules (gramática común)
├── structure_stats (duraciones, ratios)
├── scene_templates (bloques reusables)
├── dialogue_patterns (voces por arquetipo)
├── anti_patterns (qué evitar)
└── quality_checklists (qué verificar)
    ↓
KNOWLEDGE PACKS (JSON estáticos)
    ↓
Consumidos en generación SIN búsqueda
```

---

## RAG: Solo como Addon

Cuándo usar RAG:
- Género raro (no hay pack)
- Petición ultra específica
- Pack con baja cobertura
- Usuario pide "estilo de X película"

Cuándo NO usar RAG:
- Generación estándar
- Géneros cubiertos por packs
- Operaciones de QA/Fix
