
# Plan: Sistema Showrunner Quirófano + Biblia de Serie

## Resumen Ejecutivo

Este plan implementa dos funcionalidades críticas para la pipeline de escritura profesional:

| Funcionalidad | Propósito |
|---------------|-----------|
| **Showrunner Quirófano** | Reescritura quirúrgica del EP1 aplicando 5 reglas dramatúrgicas específicas |
| **Series Bible Generator** | Generación automática de Biblia de Serie + Motor de Episodios |

---

## Parte 1: Showrunner Quirófano (Mejora EP1)

### Arquitectura

```text
+------------------+     +------------------------+     +------------------+
|  ScriptImport    | --> | showrunner-surgery     | --> | scripts table    |
|  (UI Button)     |     | (Edge Function)        |     | (updated script) |
+------------------+     +------------------------+     +------------------+
                                    |
                                    v
                         +------------------------+
                         | generation_blocks      |
                         | (tracking + changelog) |
                         +------------------------+
```

### Nueva Edge Function: `showrunner-surgery`

**Ubicacion**: `supabase/functions/showrunner-surgery/index.ts`

**Sistema de prompt** (basado en tu instruccion):

```typescript
const SHOWRUNNER_SURGERY_SYSTEM = `Actua como showrunner y guionista senior de series.
Tu mision NO es reescribir desde cero ni cambiar el estilo, sino FORTALECER LA DRAMATURGIA.

## REGLAS NO NEGOCIABLES

1. NO CAMBIAR TONO NI VOZ
   - Mantener estilo de dialogos, subtexto y atmosfera
   - No simplificar ni hacer texto mas explicativo
   - No eliminar metafora ni ambiguedad moral

2. CONSECUENCIA DIRECTA TEMPRANA (Escena 2)
   - Primera intervencion con la ventana: consecuencia que afecte a protagonista
   - NO puede recaer solo en tercero secundario
   - Debe generar punto de no retorno (perdida personal, senalamiento, dano irreversible)

3. DECISION MORALMENTE SUCIA (antes de mitad del episodio)
   - Un protagonista decide conscientemente algo sabiendo el coste
   - NO vale accidente ni malentendido
   - La decision define el ADN de la serie: "quien paga"

4. REDUCIR ADVERTENCIA, AUMENTAR ACCION
   - Sustituir reflexion previa por accion con consecuencias
   - La ventana debe "romper" escenas, no solo ser observada
   - Si una escena solo habla del riesgo pero no lo ejecuta: apretarla

5. FINAL CON PUNTO DE NO RETORNO
   Una de estas promesas (elegir UNA):
   - La ventana ya no se puede cerrar
   - Alguien externo sabe que existe
   - El precio empieza a cobrarse en ellos
   - Uno cruza linea que no puede descruzar

## LIMITES
- NO anadir personajes nuevos importantes
- NO introducir reglas nuevas del artefacto
- NO convertir el episodio en exposicion
- NO cerrar arcos que deben vivir en la serie

## FORMATO DE RESPUESTA JSON
{
  "scene_changes": [
    {
      "scene_number": 1,
      "change_summary": "string (1-2 lineas)",
      "change_type": "consequence" | "dirty_decision" | "action_over_reflection" | "no_return_point",
      "original_excerpt": "string (opcional)",
      "revised_excerpt": "string (opcional)"
    }
  ],
  "rewritten_script": {
    "episodes": [
      {
        "episode_number": 1,
        "scenes": [
          {
            "scene_number": 1,
            "location": "string",
            "time": "DAY" | "NIGHT",
            "description": "string",
            "dialogue": [
              { "character": "string", "line": "string", "parenthetical": "string (opcional)" }
            ]
          }
        ]
      }
    ]
  },
  "dramaturgy_checklist": {
    "early_consequence_present": boolean,
    "dirty_decision_present": boolean,
    "action_over_reflection": boolean,
    "pilot_ending_promise": "string (cual de las 4)"
  }
}`;
```

**Request/Response**:

```typescript
interface ShowrunnerSurgeryRequest {
  projectId: string;
  scriptId: string;         // ID del script a mejorar
  episodeNumber?: number;   // Default 1
  surgeryLevel: 'light' | 'standard' | 'aggressive';  // Cuanto apretar
  preserveDialogueStyle: boolean;  // true por default
}

interface ShowrunnerSurgeryResponse {
  success: boolean;
  blockId: string;
  sceneChanges: SceneChange[];
  rewrittenScript: ParsedScript;
  dramaturgChecklist: DramaturgyChecklist;
  stats: {
    scenesModified: number;
    dialoguesAdjusted: number;
    consequencesAdded: number;
  };
}
```

### UI: Boton en ScriptImport.tsx

Agregar un boton "Cirugia de Showrunner" en la barra de acciones del guion:

```typescript
// En ScriptImport.tsx, cerca de los otros botones de accion
<Button
  onClick={() => setShowSurgeryDialog(true)}
  variant="outline"
  className="border-amber-500 text-amber-600 hover:bg-amber-50"
>
  <Scissors className="h-4 w-4 mr-2" />
  Cirugia de Showrunner
</Button>
```

### Componente: ShowrunnerSurgeryDialog.tsx

Modal que:
1. Muestra las 5 reglas que se aplicaran
2. Permite elegir nivel de cirugia (light/standard/aggressive)
3. Muestra preview de cambios propuestos
4. Boton "Aplicar Cirugia" que llama a la edge function
5. Muestra diff antes/despues por escena

---

## Parte 2: Series Bible Generator

### Nueva Edge Function: `generate-series-bible`

**Ubicacion**: `supabase/functions/generate-series-bible/index.ts`

**Sistema de prompt** (basado en tu instruccion):

```typescript
const SERIES_BIBLE_SYSTEM = `Actua como showrunner + guionista jefe desarrollando una serie.
El tono es realismo sucio + fantastico contenido + subtexto social.
NO debes convertirlo en fantasy explicativo.

## REGLAS OBLIGATORIAS

1. NO INVENTAR REGLAS NUEVAS
   Solo explicitar y formalizar lo implicito en el guion:
   - La ventana permite "edicion" puntual
   - Hay coste/peaje
   - Hay erosion/lagunas (memoria/tiempo)
   - El mundo "cobra" y se reequilibra
   
   Si algo no esta claro, marcarlo como UNDEFINED y proponer 2 opciones:
   - SAFE: opcion conservadora
   - BOLD: opcion arriesgada

2. MOTOR DE LA SERIE: "QUIEN PAGA"
   Cada episodio: una intervencion y una consecuencia
   La consecuencia se acerca progresivamente:
   terceros -> protagonistas -> su identidad

3. ARCOS DE PERSONAJES (para cada protagonista)
   - Deseo
   - Herida
   - Mascara
   - Linea roja
   - Evolucion por temporada

4. ANTAGONISMO
   Define antagonismo SIN villano de capa:
   - El sistema social (prejuicio, control del relato, poder)
   - La "ventana" como mecanismo que exige peaje
   - Donya Pilar como vector de mercantilizacion/control

5. ESTRUCTURA DE TEMPORADA (8 episodios default)
   - Logline de temporada
   - Tema de temporada
   - Escalada de stakes por episodio
   - Cliffhanger final
   - 1-2 episodios "bottle" (barato, intenso)

6. PLANTILLA DE EPISODIO (repeatable)
   - Teaser: hook de intervencion
   - Acto 1: tentacion
   - Acto 2: intervencion
   - Acto 3: coste inmediato
   - Tag: precio emocional / perdida / nuevo hilo

## FORMATO JSON
{
  "logline": "string",
  "premise": "string",
  "artifact_rules": {
    "confirmed": [{ "rule": "string", "source": "string (escena que lo implica)" }],
    "undefined": [{ "aspect": "string", "safe_option": "string", "bold_option": "string" }]
  },
  "characters": [
    {
      "name": "string",
      "role": "protagonist" | "recurring" | "antagonist",
      "desire": "string",
      "wound": "string",
      "mask": "string",
      "red_line": "string",
      "season_arc": "string"
    }
  ],
  "antagonism": {
    "primary_forces": ["string"],
    "systemic_threats": ["string"],
    "internal_conflicts": ["string"]
  },
  "season_structure": {
    "episode_count": 8,
    "season_logline": "string",
    "season_theme": "string",
    "episodes": [
      {
        "number": 1,
        "title_suggestion": "string",
        "synopsis": "string (3-4 lineas)",
        "stake_level": "low" | "medium" | "high" | "explosive",
        "is_bottle": boolean
      }
    ],
    "season_cliffhanger": "string"
  },
  "episode_template": {
    "teaser": "string (descripcion del formato)",
    "act_1_tentacion": "string",
    "act_2_intervencion": "string",
    "act_3_coste": "string",
    "tag": "string"
  },
  "tone_guidelines": {
    "promises": ["string (lo que la serie siempre entrega)"],
    "red_lines": ["string (lo que la serie nunca hace)"]
  }
}`;
```

### Nueva Tabla: `series_bibles`

```sql
CREATE TABLE public.series_bibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER DEFAULT 1,
  
  -- Core content
  logline TEXT,
  premise TEXT,
  
  -- Artifact rules (JSON)
  artifact_rules JSONB DEFAULT '{"confirmed": [], "undefined": []}',
  
  -- Characters (JSON array)
  character_arcs JSONB DEFAULT '[]',
  
  -- Antagonism (JSON)
  antagonism JSONB DEFAULT '{}',
  
  -- Season structure (JSON)
  season_structure JSONB DEFAULT '{}',
  
  -- Episode template (JSON)
  episode_template JSONB DEFAULT '{}',
  
  -- Tone guidelines (JSON)
  tone_guidelines JSONB DEFAULT '{"promises": [], "red_lines": []}',
  
  -- Metadata
  source_script_id UUID REFERENCES scripts(id),
  generation_model TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index
CREATE INDEX idx_series_bibles_project ON series_bibles(project_id);

-- RLS
ALTER TABLE series_bibles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project bibles" ON series_bibles
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert to own projects" ON series_bibles
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own project bibles" ON series_bibles
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
```

### UI: SeriesBiblePanel.tsx

Nuevo componente que:
1. Muestra la biblia de serie generada
2. Permite editar cada seccion
3. Visualiza la estructura de temporada como timeline
4. Exporta a PDF profesional

### Integracion en BibleEditor.tsx

Agregar pestana "Biblia de Serie" junto a la biblia de proyecto existente:

```typescript
<Tabs defaultValue="project" className="w-full">
  <TabsList>
    <TabsTrigger value="project">Biblia del Proyecto</TabsTrigger>
    <TabsTrigger value="series">Biblia de Serie</TabsTrigger>
  </TabsList>
  
  <TabsContent value="project">
    {/* BibleEditor existente */}
  </TabsContent>
  
  <TabsContent value="series">
    <SeriesBiblePanel projectId={projectId} />
  </TabsContent>
</Tabs>
```

---

## Archivos a Crear/Modificar

### Nuevos Archivos

| Archivo | Descripcion |
|---------|-------------|
| `supabase/functions/showrunner-surgery/index.ts` | Edge function para cirugia dramaturgica |
| `supabase/functions/generate-series-bible/index.ts` | Edge function para generar biblia de serie |
| `src/components/project/ShowrunnerSurgeryDialog.tsx` | Modal de cirugia con preview |
| `src/components/project/SeriesBiblePanel.tsx` | Panel de visualizacion/edicion de biblia |
| `src/components/project/SeriesBibleExport.tsx` | Exportacion PDF de la biblia |

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/project/ScriptImport.tsx` | Agregar boton "Cirugia de Showrunner" |
| `src/components/editorial/BibleEditor.tsx` | Agregar pestana "Biblia de Serie" |
| `src/integrations/supabase/types.ts` | Se actualizara automaticamente con nueva tabla |
| `supabase/config.toml` | Agregar nuevas edge functions |

---

## Flujo de Usuario

### Flujo 1: Cirugia de Showrunner

```text
1. Usuario en /projects/:id/script con guion generado
2. Click "Cirugia de Showrunner"
3. Modal muestra las 5 reglas que se aplicaran
4. Usuario elige nivel (light/standard/aggressive)
5. Click "Analizar"
6. Sistema muestra preview de cambios propuestos por escena
7. Usuario puede aceptar/rechazar cambios individuales
8. Click "Aplicar Cirugia"
9. Guion se actualiza con cambios
10. Historial guarda version anterior
```

### Flujo 2: Generar Biblia de Serie

```text
1. Usuario en /projects/:id/bible
2. Click pestana "Biblia de Serie"
3. Si no existe: boton "Generar Biblia de Serie"
4. Sistema analiza guion + personajes + localizaciones
5. Genera biblia completa con motor de episodios
6. Usuario puede editar cada seccion
7. Export a PDF profesional disponible
```

---

## Seccion Tecnica

### Modelo de IA

- **Showrunner Surgery**: `openai/gpt-5.2` (mejor para reescritura creativa precisa)
- **Series Bible**: `google/gemini-2.5-pro` (mejor para estructuras largas y analisis)

### Token Limits

```typescript
const SURGERY_OUTPUT_LIMIT = 16000;  // Script completo reescrito
const BIBLE_OUTPUT_LIMIT = 12000;    // Biblia estructurada
```

### Error Handling

- 429 (Rate Limit): Mostrar toast "Por favor espera unos minutos"
- 402 (Credits): Redirigir a settings de workspace
- Timeout: Mostrar progreso parcial y opcion de reintentar

### Tracking

Ambas operaciones se registran en `generation_blocks` con:
- `block_type: 'showrunner_surgery'` o `'series_bible'`
- `input_context`: Parametros usados
- `output_data`: Resultado completo

---

## Resultado Esperado

1. **Cirugia de Showrunner**:
   - EP1 reescrito con conflicto mas temprano y fuerte
   - Decisiones irreversibles antes de la mitad
   - Final con promesa clara de motor de serie
   - Mismo tono y voz preservados

2. **Biblia de Serie**:
   - Documento accionable para guionistas
   - Reglas claras del artefacto (sin inventar)
   - Arcos de personajes definidos
   - Motor de episodios repetible
   - Estructura de temporada 8 eps

