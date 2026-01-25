
# Plan: Pasar Conteo Real de Escenas a narrative-decide

## Problema Raíz

El Edge Function `narrative-decide` planifica solo **5 escenas** porque:

1. El parámetro `scenesToPlan` tiene un valor por defecto de `5`
2. El frontend (`usePreScriptWizard.ts`) **no pasa** el número real de escenas al llamar a `narrative-decide`

```text
+-------------------------------------------------------+
|  FLUJO ACTUAL (5 escenas solamente)                   |
+-------------------------------------------------------+
|  expand-beats-to-scenes                               |
|    → outline_json.episode_beats[0].scenes = 34        |
+-------------------------------------------------------+
|  narrative-decide                                     |
|    → scenesToPlan = 5 (default!)                      |
|    → Crea solo 5 scene_intents                        |
+-------------------------------------------------------+
|  scene-worker                                         |
|    → Solo genera 5 escenas                            |
+-------------------------------------------------------+
```

## Solución

Calcular el número de escenas desde el outline y pasarlo a `narrative-decide`:

```text
+-------------------------------------------------------+
|  FLUJO CORREGIDO (todas las escenas)                  |
+-------------------------------------------------------+
|  expand-beats-to-scenes                               |
|    → outline_json.episode_beats[0].scenes = 34        |
+-------------------------------------------------------+
|  usePreScriptWizard.executeStep5                      |
|    → Extraer: scenesToPlan = 34 desde episode_beats   |
+-------------------------------------------------------+
|  narrative-decide                                     |
|    → scenesToPlan = 34                                |
|    → Crea 34 scene_intents                            |
+-------------------------------------------------------+
|  scene-worker                                         |
|    → Genera las 34 escenas                            |
+-------------------------------------------------------+
```

## Cambios Técnicos

### 1. Modificar usePreScriptWizard.ts

En la función `executeStep5`, antes de llamar a `narrative-decide`, calcular el número de escenas:

```typescript
// Calcular el número de escenas desde episode_beats
const episodeBeats = currentOutline?.episode_beats || [];
const scenesToPlan = episodeBeats[0]?.scenes?.length || 
                     episodeBeats.reduce((acc: number, ep: any) => 
                       acc + (ep.scenes?.length || 0), 0) ||
                     5; // Fallback a 5 si no hay datos

console.log('[PreScriptWizard] Scenes to plan from outline:', scenesToPlan);

const { data, error } = await invokeAuthedFunction('narrative-decide', {
  projectId,
  outline: currentOutline,
  episodeNumber: 1,
  language,
  qualityTier,
  format,
  scenesToPlan, // NUEVO: Pasar el número real de escenas
});
```

### 2. Verificar que narrative-decide use el valor

El Edge Function ya soporta este parámetro (línea 66), solo no se estaba pasando:

```typescript
const { 
  projectId, 
  episodeNumber = 1, 
  outline,
  scenesToPlan = 5, // Este valor se usará si viene del frontend
  format = 'film'
} = request;
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/usePreScriptWizard.ts` | Calcular y pasar `scenesToPlan` desde `episode_beats[0].scenes.length` |

## Consideraciones

1. **Límite de escenas**: Para películas largas (40+ escenas), considerar procesar en lotes para evitar timeouts
2. **Validación**: Asegurar que `scenesToPlan` sea al menos 1 y no más de 50 (límite razonable)
3. **Fallback**: Si el outline no tiene `episode_beats`, usar el método legacy de contar desde ACT_I/II/III

## Resultado Esperado

1. Usuario completa los pasos previos del wizard
2. Sistema calcula: 34 escenas en `episode_beats[0].scenes`
3. `narrative-decide` recibe `scenesToPlan: 34`
4. Se crean 34 `scene_intent` records
5. `scene-worker` genera las 34 escenas
6. UI muestra "Escena X de 34" correctamente
