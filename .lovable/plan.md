
# Plan: Mejorar Outline con Antagonista y Secuencias Claras

## Diagnóstico del Outline Actual

| Aspecto | Estado Actual | Requerido |
|---------|--------------|-----------|
| Personajes totales | 15 | ✓ Cumple |
| Antagonistas explícitos | 0 | 1 mínimo |
| Set pieces | 5 | ✓ Cumple |
| Secuencias | No existe campo | Añadir soporte |
| Threads/Tramas | No definidos | 2 mínimo |

### Personajes Actuales (sin antagonista formal)
- 3 Protagonistas: Baltasar, Gaspar, Melchor
- 12 Supporting: Incluyen "El Bully Adulto", "La Mujer Intolerante", "El Agente de Policía Prejuicioso" - que funcionan como antagonistas pero no están marcados como tales

## Cambios Propuestos

### 1. Mejorar el Prompt de Generación de Outline

**Archivo**: `supabase/functions/generate-outline-direct/index.ts`

Añadir instrucciones explícitas para:
- Requerir al menos 1 personaje con `role: "antagonist"`
- Definir "secuencias" como agrupaciones de escenas con un objetivo dramático común
- Añadir validación post-generación para antagonistas

```text
## REQUISITOS OBLIGATORIOS DE PERSONAJES

CRÍTICO: El reparto DEBE incluir al menos:
- 1 personaje con role: "protagonist" 
- 1 personaje con role: "antagonist" (fuerza opositora principal)
- 2+ personajes con role: "supporting"

El ANTAGONISTA puede ser:
- Una persona individual (villano clásico)
- Una institución/sistema (sociedad, burocracia, prejuicio)
- Una fuerza interna (adicción, miedo, pasado)

Pero DEBE estar representado por al menos UN personaje concreto.
```

### 2. Añadir Campo "sequences" al Schema

**Archivo**: `supabase/functions/generate-outline-direct/index.ts`

Añadir estructura de secuencias al JSON solicitado:

```json
"sequences": [
  {
    "name": "Nombre de la secuencia",
    "act": "I | II | III",
    "scenes_range": "1-4",
    "dramatic_goal": "Objetivo emocional de la secuencia",
    "tone_shift": "Cómo cambia el tono al final"
  }
]
```

Las secuencias agrupan 2-5 escenas bajo un mismo objetivo dramático, por ejemplo:
- "El Despertar de los Reyes" (secuencia de transformación)
- "La Noche de los Milagros" (secuencia de acción mágica)
- "El Regreso a la Normalidad" (secuencia de resolución)

### 3. Mejorar la Validación (`softValidate`)

**Archivo**: `supabase/functions/generate-outline-direct/index.ts`

Añadir verificación de antagonista:

```typescript
// Check antagonist presence
const chars = outline.main_characters || outline.cast || [];
const hasAntagonist = chars.some(c => 
  c.role?.toLowerCase().includes('antag') ||
  c.role?.toLowerCase().includes('villain')
);

if (!hasAntagonist) {
  warnings.push({
    type: 'characters',
    message: 'Falta un antagonista explícito - el conflicto puede ser débil',
    current: 0,
    required: 1,
  });
  score -= 15;
}
```

### 4. Actualizar el Outline Existente (Acción Inmediata)

Para el proyecto actual, se puede actualizar el outline sin regenerarlo:

1. Cambiar el `role` de "El Bully Adulto" o "La Mujer Intolerante" a `"antagonist"`
2. Añadir un array `sequences` basado en los set pieces existentes

Esto se hace con una actualización directa al `outline_json` en la base de datos.

## Resumen de Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/generate-outline-direct/index.ts` | Mejorar prompt + validación |
| `supabase/functions/_shared/outline-schemas-film.ts` | Añadir schema para sequences |

## Notas Técnicas

- El validador de densidad (`density-validator.ts`) ya tiene lógica para detectar antagonistas por keywords en descripciones
- Los set pieces actuales pueden mapearse a sequences con lógica de agrupación
- La validación de antagonista debe ser un warning, no un blocker, para no romper flujos existentes
