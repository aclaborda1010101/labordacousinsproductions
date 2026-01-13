# Pipeline de Extracción Industrial V1

## Arquitectura

El pipeline de extracción de guiones sigue una arquitectura de 2 fases:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  PDF/Texto      │───▶│  Pre-Parser     │───▶│  SceneBlocks    │
│  (input)        │    │  (determinista) │    │  (estructurado) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                      │
                       ┌──────────────────────────────┘
                       ▼
         ┌─────────────────────────────────────────────────────┐
         │         Chunking por Escenas (máx 10 chunks)        │
         └─────────────────────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┬─────────────┐
         ▼             ▼             ▼             ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ Chunk 1 │   │ Chunk 2 │   │ Chunk 3 │   │ ... N   │
    │ Extract │   │ Extract │   │ Extract │   │ Extract │
    └─────────┘   └─────────┘   └─────────┘   └─────────┘
         │             │             │             │
         └─────────────┴─────────────┴─────────────┘
                       │
                       ▼
         ┌─────────────────────────────────────────────────────┐
         │            Global Consolidator (LLM)                │
         │  - Deduplica personajes/localizaciones              │
         │  - Genera threads con evidencia                     │
         │  - Produce ScreenplayExtraction canónico            │
         └─────────────────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────────────────────────┐
         │            QC Determinista (sin LLM)                │
         │  - Valida estructura                                │
         │  - Detecta blockers/warnings                        │
         │  - Calcula score 0-100                              │
         └─────────────────────────────────────────────────────┘
```

## Componentes

### 1. Pre-Parser (`screenplay-parser.ts`)

Parser determinista que usa regex para:
- Detectar sluglines (INT./EXT.)
- Identificar character cues
- Segmentar en SceneBlocks
- Extraer metadata (título, fecha, autores)

**Sin LLM** - Solo regex y heurísticas.

### 2. Chunking

Agrupa SceneBlocks en chunks para procesamiento paralelo:

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `maxChunks` | 10 | Máximo número de chunks |
| `targetCharsPerChunk` | 10,000 | Caracteres objetivo por chunk |
| `overlapScenes` | 1 | Escenas de overlap entre chunks |

### 3. Chunk Extractor

LLM barato (`openai/gpt-5-mini`) que extrae por chunk:
- Escenas con slugline, personajes, diálogos
- Props explícitos
- Beats narrativos
- Turning points (si hay)

**Ejecutable en paralelo** para velocidad.

### 4. Global Consolidator

LLM potente (`openai/gpt-5.2`) que:
- Une parciales de todos los chunks
- Deduplica personajes (aliases)
- Normaliza localizaciones
- **Genera threads con evidence_scenes**
- Produce QC interno

### 5. QC Determinista (`extraction-qc.ts`)

Validación final sin LLM:

#### Blockers (impiden continuar)
- `scene_count < 5` (series) o `< 20` (film)
- `characters_count < 2`
- `> 20%` escenas sin slugline
- Personajes sin nombre válido

#### Warnings (degradan pero permiten continuar)
- `threads < 3` (series)
- Threads sin evidencia
- Alias overflow
- Localizaciones con >10 variantes
- >50% personajes sin diálogo

## Output: ScreenplayExtraction

```typescript
interface ScreenplayExtraction {
  meta: {
    title: string;
    authors: string[];
    draft_date: string | null;
  };
  stats: {
    scene_count: number;
    dialogue_lines_count: number;
  };
  characters: Character[];
  locations: Location[];
  props: Prop[];
  scenes: Scene[];
  threads: Thread[];
  thread_map: ThreadMapEntry[];
  qc: QCResult;
}
```

## Threads

Cada thread debe tener:

```typescript
interface Thread {
  id: string;           // "T_MAIN", "T_ROMANCE", etc.
  type: string;         // "main" | "subplot" | "relationship" | "mystery"
  question: string;     // Pregunta dramática
  engine: string;       // Mecanismo (investigar, escapar, conquistar)
  stake: string;        // Qué se pierde si falla
  milestones: string[]; // 3-7 eventos
  end_state: string;    // Estado final
  evidence_scenes: string[]; // ¡OBLIGATORIO! IDs de escenas
}
```

**Regla crítica**: Un thread sin `evidence_scenes` no es válido.

## Uso

### Para guiones pequeños (<20 escenas)
```typescript
// Single-pass extraction
const result = await singlePassExtraction(scriptText);
```

### Para guiones grandes (20+ escenas)
```typescript
// 1. Parse
const parsed = parseScreenplayText(scriptText);

// 2. Chunk
const chunks = chunkBySceneBlocks(parsed.scene_blocks, 10, 10000, 1);

// 3. Extract (paralelo)
const partials = await Promise.all(
  chunks.map(chunk => extractChunk(chunk))
);

// 4. Consolidate
const consolidated = await consolidatePartials(partials);

// 5. QC
const qc = runExtractionQC(consolidated);
```

## Migración desde V24

El nuevo pipeline es compatible con el formato existente de `script-breakdown`.
Los campos nuevos (`threads`, `thread_map`) se añaden sin romper estructura.

## Métricas de Éxito

| Métrica | Target | Descripción |
|---------|--------|-------------|
| `qc.score` | ≥85 | Calidad "good" o "excellent" |
| `threads.length` | 5-8 | Para series |
| `evidence_scenes` | ≥2/thread | Cada thread con evidencia |
| Chunk failures | <30% | Tolerancia a errores |
