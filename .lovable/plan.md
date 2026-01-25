
# Plan: Corregir Densidad de Escenas para Película de 85 min

## Diagnóstico

| Problema | Situación Actual | Esperado |
|----------|------------------|----------|
| Escenas en BD | 5 escenas | 25-35 mínimo |
| Duración promedio | 17 min/escena | 2.5-3.5 min/escena |
| `episode_beats` | Vacío (0 items) | Array con 25+ scenes |
| Script raw_text | 20KB (~6 escenas) | 60KB+ |

### Causa Raíz
El flujo de generación actual tiene una brecha:

```text
[Outline con Beats] → [Script directo desde beats] → [5 escenas]
                   ↓
         FALTA: [Expansión a Escenas]
```

El outline contiene beats narrativos (8+ por acto = 24+ beats total), pero el sistema escribió el script **sin expandir cada beat en 1-2 escenas**.

---

## Solución Propuesta

### Opción A: Re-generar con Expansión (Recomendada)

Agregar un paso intermedio de "Expansión de Escenas" que:

1. Tome los beats del outline (ACT_I, ACT_II, ACT_III)
2. Expanda cada beat en 1-2 escenas con sluglines únicos
3. Guarde las escenas expandidas en `outline_json.episode_beats`
4. Luego el script-worker genere cada escena

**Archivo a crear:** `supabase/functions/expand-beats-to-scenes/index.ts`

### Opción B: Regenerar Outline con Scene Density

Modificar `generate-outline-direct` para que cuando `format = 'film'`:

1. Agregue instrucciones explícitas al prompt para generar 25+ escenas
2. Valide que `episode_beats[0].scenes.length >= 25` antes de aprobar
3. Use el perfil de densidad `film_standard` que requiere 35 escenas mínimo

**Archivo a modificar:** `supabase/functions/generate-outline-direct/index.ts`

---

## Cambios Técnicos (Opción A)

### 1. Nueva Edge Function: `expand-beats-to-scenes`

```typescript
// Prompt para expansión
const EXPAND_PROMPT = `
Tienes ${totalBeats} beats narrativos para una película de ${durationMin} minutos.

REGLA: Cada beat debe convertirse en 1-3 escenas concretas.
OBJETIVO: Generar ${minScenes} escenas mínimo.

Por cada beat, genera escenas con:
- slugline único (INT/EXT. LOCACIÓN - MOMENTO)
- summary (1-2 oraciones)
- characters_present
- duration_estimate_sec (90-180 segundos típico)
`;
```

### 2. Actualizar UI: Agregar paso de validación en Pre-Script Wizard

En `src/components/project/script-wizard/` agregar validación:

```typescript
const validateSceneDensity = (outline: Outline, project: Project) => {
  const minScenes = project.format === 'film' 
    ? Math.ceil(project.target_duration_min / 3) // ~3 min por escena
    : 0;
  
  const currentScenes = outline.episode_beats?.[0]?.scenes?.length || 0;
  
  if (currentScenes < minScenes) {
    return {
      valid: false,
      message: `Se requieren ${minScenes}+ escenas para ${project.target_duration_min} min. Actual: ${currentScenes}`,
      action: 'expand_scenes'
    };
  }
  return { valid: true };
};
```

### 3. Modificar flujo del Wizard

```text
Paso 1: Carne Operativa
Paso 2: Threads  
Paso 3: Showrunner
Paso 4: [NUEVO] Validar Densidad → Si falla, "Expandir Escenas"
Paso 5: Confirmar
Paso 6: GENERAR
```

---

## Resultado Esperado

| Antes | Después |
|-------|---------|
| 5 escenas / 17 min c/u | 28-35 escenas / 2.5 min c/u |
| Script de 20KB | Script de 60-80KB |
| Falta complejidad | Desarrollo completo de tramas |

---

## Archivos a Modificar/Crear

1. **Crear:** `supabase/functions/expand-beats-to-scenes/index.ts` - Nueva función de expansión
2. **Modificar:** `src/components/project/script-wizard/PreScriptWizard.tsx` - Agregar validación de densidad
3. **Modificar:** `supabase/functions/generate-outline-direct/index.ts` - Reforzar requisito de escenas para films
4. **Modificar:** `supabase/functions/_shared/density-validator.ts` - Agregar validador de pre-generación
