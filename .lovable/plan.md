
# Plan: Regenerar Outline con Densidad Hollywood

## Estado Actual del Proyecto

| Campo | Valor Actual |
|-------|--------------|
| **Proyecto** | Reyes Magos V3 (`9cbb775e-...`) |
| **Formato** | Film (90 min) |
| **Género** | Comedy |
| **Tono** | Ligero y entretenido |

### Outline Actual (`8601c962-...`)
| Métrica | Actual | Objetivo Hollywood |
|---------|--------|-------------------|
| Personajes | 15 | 15 ✓ |
| Setpieces | 5 | **12** ✗ |
| Sequences | 6 | **8** ✗ |
| Locations | 0 | **15** ✗ |

## Parámetros de Regeneración

Para aplicar el perfil **Hollywood** completo:

```json
{
  "projectId": "9cbb775e-3f28-4232-8fe2-aaa590dd3081",
  "densityProfile": "hollywood",
  "format": "film",
  "duration": 90,
  "genre": "comedy",
  "tone": "Ligero y entretenido",
  "idea": "[synopsis actual del outline]"
}
```

### Objetivos de Densidad Hollywood

| Elemento | Mínimo Requerido |
|----------|------------------|
| Personajes | 15 (incluir 1 antagonista) |
| Localizaciones | 15 |
| Beats narrativos | 30 |
| Escenas | 45 |
| **Setpieces** | **12** |
| **Sequences** | **8** |

## Implementación

### Paso 1: Llamar a la Edge Function

```typescript
const response = await supabase.functions.invoke('generate-outline-direct', {
  body: {
    projectId: '9cbb775e-3f28-4232-8fe2-aaa590dd3081',
    idea: `TÍTULO: La Noche que Fuimos Reyes
    
    SINOPSIS: En un mundo que los ignora o los juzga, Baltasar, un hombre negro 
    cansado del racismo; Gaspar, un pelirrojo marcado por el bullying; y Melchor, 
    un hombre gay atrapado en una vida doble, viven existencias grises y llenas 
    de injusticia. En la noche de Reyes se transforman en los auténticos Reyes 
    Magos y usan su poder para impartir justicia poética irónica y social.`,
    format: 'film',
    densityProfile: 'hollywood',
    genre: 'comedy',
    tone: 'Ligero y entretenido',
    duration: 90
  }
});
```

### Paso 2: El sistema aplicará automáticamente

1. **Prompt mejorado** con requisitos explícitos:
   - "Genera exactamente 12 SETPIECES espectaculares"
   - "Genera exactamente 8 SEQUENCES con dramatic_goal"
   - "Incluye 1 personaje con role='antagonist'"
   - "Define 15 LOCATIONS con INT/EXT"

2. **Validación post-generación** (`softValidate`):
   - Verificar setpieces >= 12
   - Verificar sequences >= 8
   - Verificar antagonist presente
   - Penalizar score si faltan elementos

### Paso 3: Marcar outline anterior como obsoleto

El nuevo outline reemplazará al actual, marcando `8601c962-...` como `status: 'obsolete'`.

## Resultado Esperado

El nuevo outline contendrá:

```text
✓ 15 personajes (incluyendo 1 antagonista: "Inspector Fernández")
✓ 15 localizaciones únicas con INT/EXT
✓ 12 setpieces distribuidos en 3 actos
✓ 8 sequences con dramatic_goal y tone_shift
✓ 30 beats narrativos detallados
```

## Acción Requerida

Para ejecutar la regeneración, cambia a **modo normal** (aprueba este plan) y te ayudaré a:

1. Invocar `generate-outline-direct` con los parámetros correctos
2. Monitorear el progreso en tiempo real
3. Validar que el nuevo outline cumpla todos los requisitos

---

**Nota técnica**: La Edge Function `generate-outline-direct` ya fue actualizada con los perfiles de densidad mejorados. Solo necesita ser invocada con `densityProfile: 'hollywood'`.
