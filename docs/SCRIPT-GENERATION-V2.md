# 🎬 Script Generation V2 - Arquitectura Profesional

## Problema Actual

El generador actual tiene:
- Prompts genéricos largos (~50KB)
- Sin ejemplos reales de guiones profesionales
- Genera "AI-speak" (frases genéricas, sin voz)
- No aprovecha el conocimiento de guiones reales

## Solución: RAG + Few-Shot Learning

### 1. Pipeline de Procesamiento de Guiones

```
PDFs → Parser → Chunks → Embeddings → Vector DB
                  ↓
              Metadata:
              - Género
              - Formato (film/series)
              - Tono
              - Estructura (3 actos, etc)
              - Patrones de diálogo
```

### 2. Componentes Nuevos

#### A. Script Parser (`parse-reference-scripts`)
- Extrae texto de PDFs
- Detecta estructura (sluglines, acción, diálogo)
- Identifica patrones por género
- Guarda metadata (duración, personajes, locaciones)

#### B. Script Embeddings (`script-embeddings`)
- Chunking inteligente por escenas
- Embeddings con modelo especializado
- Índice en Supabase pgvector

#### C. Script Retriever (`retrieve-similar-scenes`)
- Dado un beat/outline, busca escenas similares
- Filtra por género, tono, formato
- Retorna ejemplos relevantes para few-shot

#### D. Enhanced Prompt Builder
```
SISTEMA:
- Reglas de formato (extraídas de análisis de 1000+ guiones)
- Anti-patterns específicos (detectados en análisis)

EJEMPLOS (few-shot):
- 2-3 escenas reales de guiones similares
- Mismo género/tono que el proyecto

TAREA:
- Outline/beat específico
- Bible context
```

### 3. Esquema de Base de Datos

```sql
-- Guiones de referencia
CREATE TABLE reference_scripts (
  id UUID PRIMARY KEY,
  title TEXT,
  slug TEXT UNIQUE,
  genre TEXT,
  format TEXT, -- film/series
  year INT,
  language TEXT,
  pdf_path TEXT,
  parsed_at TIMESTAMP,
  total_scenes INT,
  total_pages INT,
  metadata JSONB
);

-- Escenas parseadas
CREATE TABLE reference_scenes (
  id UUID PRIMARY KEY,
  script_id UUID REFERENCES reference_scripts,
  scene_number INT,
  slugline TEXT,
  action_text TEXT,
  dialogue JSONB,
  characters TEXT[],
  duration_estimate INT,
  mood TEXT,
  conflict_type TEXT,
  embedding vector(1536)
);

-- Patrones extraídos
CREATE TABLE script_patterns (
  id UUID PRIMARY KEY,
  pattern_type TEXT, -- 'dialogue', 'action', 'structure', 'transition'
  genre TEXT,
  description TEXT,
  example TEXT,
  frequency INT,
  quality_score FLOAT
);
```

### 4. Flujo de Generación Mejorado

```
1. Usuario solicita generación de escena/guión

2. Retrieve Similar (RAG):
   - Query: outline + género + tono
   - Return: 3-5 escenas similares de guiones profesionales

3. Build Enhanced Prompt:
   - System: Reglas condensadas + anti-patterns
   - Examples: Escenas recuperadas (few-shot)
   - Task: Outline específico + Bible

4. Generate:
   - Modelo: Claude/GPT-4 con ejemplos reales
   - Output: Escena con formato profesional

5. QC Post-Process:
   - Validar formato
   - Detectar AI-speak
   - Comparar con ejemplos de referencia
```

### 5. Prompts Condensados (vs actuales)

**ANTES (50KB de prompt):**
```
Eres guionista profesional de CINE (nivel Hollywood).
[... 1000 líneas de reglas genéricas ...]
```

**DESPUÉS (5KB + ejemplos dinámicos):**
```
FORMATO: Guión literario profesional.

REGLAS CORE (extraídas de análisis de 1150 guiones):
1. Slugline: INT./EXT. LUGAR - MOMENTO
2. Acción: Presente, visual, máx 4 líneas/párrafo
3. Diálogo: Subtexto > texto, voces únicas
4. Prohibido: "todo cambia", "se da cuenta", "la tensión"

EJEMPLOS DE TU GÉNERO ({genre}):
{retrieved_scenes}

GENERA basándote en este BEAT:
{beat}
```

### 6. Métricas de Calidad

Para cada generación, medir:
- **Genericidad**: % de frases "AI-speak" detectadas
- **Formato**: Compliance con estándar de industria
- **Densidad**: Palabras/minuto de pantalla
- **Voces**: Distinción entre personajes
- **Subtexto**: Ratio de show vs tell

### 7. Implementación por Fases

**Fase 1 (Ahora):**
- [ ] Parser de PDFs
- [ ] Extracción de escenas
- [ ] Tabla de reference_scripts

**Fase 2 (Esta semana):**
- [ ] Embeddings de escenas
- [ ] Retriever básico
- [ ] Prompt builder mejorado

**Fase 3 (Próxima semana):**
- [ ] QC automático
- [ ] A/B testing vs generador actual
- [ ] Métricas de calidad

### 8. Estimación de Recursos

- **Storage**: ~500MB para 1150 PDFs parseados
- **Embeddings**: ~$5-10 para procesar todo
- **Vector DB**: pgvector en Supabase (gratis)
- **Tokens por generación**: Similar (ejemplos reemplazan prompt largo)

---

## V15: Estándares de Densidad (CRÍTICO)

### Escenas por Duración (Estándar Industria)

| Formato | Duración | Escenas Mín | Escenas Máx | Objetivo |
|---------|----------|-------------|-------------|----------|
| Film Drama | 90 min | 38 | 50 | 45 |
| Film Comedia | 90 min | 50 | 70 | 55 |
| Film Thriller | 90 min | 40 | 55 | 48 |
| Series (episodio) | 45 min | 28 | 38 | 32 |

### Regla de Oro
**1 escena cada 1.5-2 minutos** (comedia más rápido, drama más lento)

### Distribución por Actos (Film)
- **Acto 1** (25%): ~28% de escenas (setup)
- **Acto 2** (50%): ~50% de escenas (confrontación)
- **Acto 3** (25%): ~22% de escenas (resolución)

### Longitud por Escena
- **Máximo**: 350 palabras (hard cap)
- **Objetivo**: 150-250 palabras
- **Mínimo**: 80 palabras
- **Si supera 2 páginas**: DIVIDIR la escena

### Archivo de Referencia
`supabase/functions/_shared/screenplay-standards.ts`

---

## Acción Inmediata

1. ✅ Crear función `parse-reference-scripts`
2. ✅ Crear índice de escenas por género
3. ✅ Crear `scene-retriever.ts` para few-shot
4. ✅ Crear `screenplay-standards.ts` para densidad/calidad
5. ✅ Modificar `generate-script` para usar few-shot + standards
