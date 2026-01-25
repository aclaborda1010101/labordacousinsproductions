
# Plan: Aumentar Set Pieces y Sequences en el Outline

## Problema Detectado

El outline actual muestra solo 5 set pieces porque:

| Campo | Estado Actual | Requerido |
|-------|---------------|-----------|
| `setpieces` | 0 (no existe) | 8-12 mínimo |
| `sequences` | 0 (no existe) | 6-8 mínimo |
| DensityProfile | Sin min_setpieces | Añadir campo |
| Prompt | "memorables" (vago) | Cantidad explícita |
| Validación | No verifica setpieces | Añadir check |

El outline fue generado el 23-enero, antes de los cambios de hoy.

## Cambios Técnicos

### 1. Actualizar DensityProfile

```typescript
interface DensityProfile {
  id: string;
  label: string;
  min_characters: number;
  min_locations: number;
  min_beats: number;
  min_scenes: number;
  min_setpieces: number;    // NUEVO
  min_sequences: number;    // NUEVO
}

const DENSITY_PROFILES = {
  indie: {
    // ... existing
    min_setpieces: 5,
    min_sequences: 4,
  },
  standard: {
    // ... existing
    min_setpieces: 8,
    min_sequences: 6,
  },
  hollywood: {
    // ... existing
    min_setpieces: 12,
    min_sequences: 8,
  },
};
```

### 2. Mejorar el Prompt

Añadir instrucción explícita:

```text
## REQUISITOS DE SETPIECES Y SEQUENCES

SETPIECES (Momentos Visuales de Alto Impacto):
- Mínimo: ${profile.min_setpieces} setpieces
- Cada setpiece debe ser un momento ESPECTACULAR que defina la película
- Distribuir entre los 3 actos
- Cada uno con: name, act, description, stakes

SEQUENCES (Agrupaciones Dramáticas):
- Mínimo: ${profile.min_sequences} secuencias
- Cada secuencia agrupa 2-5 escenas bajo un objetivo común
- Ejemplos: "La Transformación", "La Noche de Milagros", "El Regreso"
```

### 3. Añadir Validación de Setpieces

```typescript
// En softValidate()
const setpieces = outline.setpieces || [];
if (setpieces.length < profile.min_setpieces) {
  warnings.push({
    type: 'structure',
    message: `Tienes ${setpieces.length} setpieces, se requieren mínimo ${profile.min_setpieces}`,
    current: setpieces.length,
    required: profile.min_setpieces,
  });
  score -= 15;
}
```

### 4. Regenerar el Outline Actual

Para que el proyecto `d2a6e5b8-...` tenga los nuevos campos:
- Usar "Regenerar Outline" en el UI
- O ejecutar `generate-outline-direct` con los nuevos parámetros

## Cálculo de Setpieces por Duración

Para una película de 85 minutos con perfil "standard":

```text
Target scenes: 85 min / 2.5 min avg = 34 scenes
Target setpieces: ~25% de scenes = 8-10 setpieces
Target sequences: scenes / 5 = 6-7 secuencias
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/generate-outline-direct/index.ts` | Añadir min_setpieces/sequences a profile, mejorar prompt, añadir validación |

## Resultado Esperado

Después de regenerar el outline:
- 8-12 setpieces con stakes claros
- 6-8 sequences con dramatic_goal
- Personaje con role="antagonist"
- UI mostrando todos los nuevos elementos
