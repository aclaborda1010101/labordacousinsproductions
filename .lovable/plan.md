
# Plan: Sistema Showrunner IA + Coherencia Cinematográfica

## Resumen Ejecutivo

Integrar una capa de **Showrunner IA** que actúe como árbitro editorial entre el guion y la producción visual, garantizando coherencia narrativa, visual y técnica entre escenas. El sistema implementará "Sequence Intent" y "Visual Context Memory" para que cada decisión de plano viva en cadena, no como elemento aislado.

---

## 1. Análisis del Estado Actual

### Lo que YA existe (bases sólidas):

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| **Creative Mode (ASSISTED/PRO)** | Funcionando | `src/lib/modeCapabilities.ts`, `CreativeModeContext.tsx` |
| **scene_intent** | Tabla existe | BD: `scene_intent` con `emotional_turn`, `intent_summary`, `characters_involved` |
| **narrative_state** | Tabla existe | BD: `narrative_state` con `locked_facts`, `forbidden_actions`, `active_threads` |
| **ContinuityManager** | Código base | `src/lib/continuityManager.ts` |
| **canon_packs** | Tabla existe | BD: `canon_packs` con `voice_tone_rules`, `continuity_locks` |
| **Showrunner prompts** | Fragmentos | `outline-patch/index.ts`, `episode-generate-batch/index.ts` |

### Lo que FALTA (gaps críticos):

1. **Visual Context Memory** - No existe memoria visual entre escenas
2. **Sequence Intent UI** - `scene_intent` solo se usa en backend, no hay UI
3. **Showrunner Layer visible** - Las decisiones editoriales son invisibles
4. **Comparación N-1/N/N+1** - No hay vista de concatenación
5. **Reglas de prohibición visual** - No se trackean recursos visuales usados

---

## 2. Arquitectura Propuesta

### 2.1 Nueva Tabla: `visual_context_memory`

```sql
CREATE TABLE visual_context_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  scene_number INTEGER NOT NULL,
  
  -- Estado emocional
  emotional_start TEXT,
  emotional_end TEXT,
  emotional_delta TEXT,
  
  -- Lenguaje visual usado
  dominant_lenses JSONB DEFAULT '[]',
  dominant_movements JSONB DEFAULT '[]', 
  dominant_shot_types JSONB DEFAULT '[]',
  camera_height_tendency TEXT,
  coverage_style TEXT,
  
  -- Ritmo
  average_shot_duration_sec NUMERIC,
  shot_count INTEGER,
  pacing_level TEXT,
  
  -- Restricciones para siguiente escena
  forbidden_next JSONB DEFAULT '{}',
  recommended_next JSONB DEFAULT '{}',
  
  -- Metadata
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(scene_id)
);
```

### 2.2 Ampliar Tabla: `scene_intent` (campos nuevos)

```sql
ALTER TABLE scene_intent ADD COLUMN IF NOT EXISTS
  visual_energy TEXT,
  continuity_constraints JSONB DEFAULT '{}',
  allowed_camera_language JSONB DEFAULT '{}',
  forbidden_repetitions JSONB DEFAULT '[]',
  showrunner_validated BOOLEAN DEFAULT false,
  showrunner_notes TEXT;
```

### 2.3 Nueva Tabla: `showrunner_decisions`

```sql
CREATE TABLE showrunner_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  
  -- Preguntas editoriales respondidas
  where_we_came_from TEXT,
  what_must_change TEXT,
  what_cannot_repeat TEXT,
  
  -- Decisiones resultantes
  visual_strategy TEXT,
  camera_language_allowed JSONB,
  lens_range_allowed TEXT[],
  movement_allowed TEXT[],
  
  -- Validación
  validated BOOLEAN DEFAULT false,
  validated_at TIMESTAMPTZ,
  validated_by UUID,
  
  -- Modo
  mode TEXT DEFAULT 'auto',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(scene_id)
);
```

---

## 3. Componentes UI Nuevos

### 3.1 `ShowrunnerLayer.tsx`

Panel que muestra las decisiones editoriales de la escena actual.

**Comportamiento por modo:**
- **ASSISTED**: Invisible pero activo (guardrail automático)
- **PRO**: Visible y editable

**Contenido:**
- Card "De dónde venimos" (resumen escena anterior)
- Card "Qué debe cambiar" (delta emocional)
- Card "Qué NO repetir" (recursos prohibidos)
- Badge de estado: `DRAFT | REVIEW | VALIDATED`

### 3.2 `SequenceIntentPanel.tsx`

Vista de intención de secuencia antes del storyboard.

**Campos:**
- `emotional_start` / `emotional_end`
- `visual_energy` (baja/media/alta)
- `allowed_camera_language`
- `forbidden_repetitions`

**Comportamiento:**
- En ASSISTED: Auto-derivado del mood, no editable
- En PRO: Editable con validación

### 3.3 `VisualMemoryTimeline.tsx`

Timeline horizontal que muestra concatenación N-1 / N / N+1.

**Visualización por escena:**
- Lentes dominantes (iconos)
- Movimientos usados
- Nivel de ritmo (chips de color)
- Alertas de repetición

### 3.4 `SceneComparisonView.tsx`

Vista lado a lado de 3 escenas para verificar coherencia.

**Columnas:**
- Escena anterior
- Escena actual  
- Escena siguiente

**Métricas comparadas:**
- Lentes usadas
- Movimientos dominantes
- Ritmo de corte
- Estado emocional

---

## 4. Lógica de Backend

### 4.1 Edge Function: `showrunner-decide`

```typescript
// Antes de generar storyboard, el Showrunner evalúa:
interface ShowrunnerDecideRequest {
  project_id: string;
  scene_id: string;
  scene_number: number;
  episode_number: number;
}

// Respuesta:
interface ShowrunnerDecision {
  where_we_came_from: string;
  what_must_change: string;
  what_cannot_repeat: string[];
  visual_strategy: string;
  camera_language_allowed: {
    shot_types: string[];
    movements: string[];
    lens_range: { min: number; max: number };
  };
  confidence: number;
}
```

### 4.2 Edge Function: `update-visual-memory`

Se ejecuta al aprobar storyboard/shots de una escena:
- Analiza planos aprobados
- Extrae lentes/movimientos dominantes
- Calcula ritmo medio
- Actualiza `visual_context_memory`
- Genera `forbidden_next` para escena siguiente

### 4.3 Modificar: `generate-storyboard`

Antes de generar, consultar `showrunner_decisions`:
- Si no existe: llamar a `showrunner-decide` primero
- Inyectar restricciones en el prompt
- Validar output contra reglas

---

## 5. Flujo de Pipeline Modificado

```text
GUIÓN
  ↓
SHOWRUNNER-DECIDE (nuevo)
  ↓
SEQUENCE INTENT (visible en PRO)
  ↓
STORYBOARD (condicionado por restricciones)
  ↓
CAMERA PLAN
  ↓
SHOTS
  ↓
MICROSHOTS
  ↓
UPDATE-VISUAL-MEMORY (nuevo)
  ↓
DOCUMENTO TÉCNICO
```

---

## 6. Cambios en modeCapabilities.ts

```typescript
// Nuevas capabilities
ui: {
  // ... existentes ...
  showShowrunnerLayer: boolean,
  showSequenceIntent: boolean,
  showVisualMemoryTimeline: boolean,
  showSceneComparison: boolean,
},

edit: {
  // ... existentes ...
  canEditShowrunnerDecisions: boolean,
  canEditSequenceIntent: boolean,
  canOverrideShowrunnerBlocks: boolean,
},

behavior: {
  // ... existentes ...
  showrunnerAutoDecides: boolean,
  showrunnerBlocksOnViolation: boolean,
}
```

**Configuración por modo:**

| Capability | ASSISTED | PRO |
|------------|----------|-----|
| `showShowrunnerLayer` | `false` | `true` |
| `showSequenceIntent` | `false` | `true` |
| `showVisualMemoryTimeline` | `false` | `true` |
| `canEditShowrunnerDecisions` | `false` | `true` |
| `showrunnerAutoDecides` | `true` | `false` |
| `showrunnerBlocksOnViolation` | `true` | `false` |

---

## 7. Onboarding Inteligente

### Fricción Progresiva (sin tutoriales)

1. **Usuario nuevo → ASSISTED por defecto**
   - Storyboard visible desde inicio
   - Showrunner trabaja invisible

2. **Detección de patrones problemáticos:**
   - Repetición de recursos 3+ veces
   - Escenas similares consecutivas
   - → Aparece banner sutil: "Hay decisiones que podrías afinar"

3. **Revelación del Showrunner:**
   - Al cambiar a PRO por primera vez
   - Animación: "Esto es lo que estaba pasando"
   - Se muestran reglas activas, intención implícita

---

## 8. Copy UX (Voz de Director Senior)

| Ubicación | Copy |
|-----------|------|
| Showrunner Header | "Antes de pensar en planos, piensa en decisiones." |
| Card "De dónde venimos" | "¿Cómo terminó emocionalmente la escena anterior?" |
| Card "Qué debe cambiar" | "Si esta escena no cambia nada, sobra." |
| Card "Qué NO repetir" | "Repetir recursos debilita el relato." |
| Sequence Intent Header | "El plano correcto no es el más bonito. Es el siguiente necesario." |
| Storyboard Tooltip | "Este plano existe para cumplir una función, no para lucirse." |
| Continuity Alert | "Este movimiento ya domina escenas anteriores." |

---

## 9. Fases de Implementación

### Fase 1: Foundation (1-2 semanas)
- [ ] Crear migración DB: `visual_context_memory`, `showrunner_decisions`
- [ ] Ampliar `scene_intent` con campos nuevos
- [ ] Crear edge function `showrunner-decide`
- [ ] Crear edge function `update-visual-memory`

### Fase 2: Backend Integration (1 semana)
- [ ] Modificar `generate-storyboard` para consultar Showrunner
- [ ] Modificar `generate-camera-plan` para respetar restricciones
- [ ] Añadir validación post-storyboard

### Fase 3: UI Components (2 semanas)
- [ ] `ShowrunnerLayer.tsx`
- [ ] `SequenceIntentPanel.tsx`
- [ ] `VisualMemoryTimeline.tsx`
- [ ] `SceneComparisonView.tsx`
- [ ] Integrar en `Scenes.tsx`

### Fase 4: Mode Integration (1 semana)
- [ ] Actualizar `modeCapabilities.ts`
- [ ] Condicionar componentes por modo
- [ ] Implementar onboarding progresivo

### Fase 5: Polish (1 semana)
- [ ] Copy UX final
- [ ] Estados visuales (badges, colores)
- [ ] Animaciones de revelación
- [ ] Testing de flujos

---

## 10. Ventaja Competitiva Resultante

| Higgsfield | Tu Sistema |
|------------|------------|
| Genera planos bonitos | Genera planos coherentes |
| Piensa en escena | Piensa en secuencia |
| Inspira creatividad | Estructura criterio cinematográfico |
| UI como herramienta | UI como mentor invisible |

**Frase núcleo:**
> "El plano no se elige porque es bueno. Se elige porque es el siguiente correcto."

