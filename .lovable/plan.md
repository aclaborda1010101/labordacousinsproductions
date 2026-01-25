
# Plan: Conectar Expansión de Beats con Materialización de Escenas

## Diagnóstico

El flujo actual tiene una desconexión:

```text
┌─────────────────────────────────────────────────────────────────────┐
│  FLUJO ACTUAL (ROTO)                                                │
├─────────────────────────────────────────────────────────────────────┤
│  1. expand-beats-to-scenes                                          │
│     → Genera 36 escenas en outline_json.episode_beats               │
│     ✓ FUNCIONA                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  2. validateDensity()                                               │
│     → Re-valida el outline actualizado                              │
│     ✗ PERO: Busca en tabla `scenes` que tiene 0 registros           │
├─────────────────────────────────────────────────────────────────────┤
│  3. materialize-scenes                                              │
│     → NUNCA SE LLAMA                                                │
│     ✗ La tabla `scenes` permanece vacía                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Solución

Modificar el hook `useSceneDensityValidation.ts` para que después de expandir los beats, llame automáticamente a `materialize-scenes`:

```text
┌─────────────────────────────────────────────────────────────────────┐
│  FLUJO CORREGIDO                                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. expand-beats-to-scenes                                          │
│     → Genera 36 escenas en outline_json.episode_beats               │
├─────────────────────────────────────────────────────────────────────┤
│  2. materialize-scenes (NUEVO)                                      │
│     → Lee episode_beats[0].scenes                                   │
│     → Inserta 36 registros en tabla `scenes`                        │
├─────────────────────────────────────────────────────────────────────┤
│  3. validateDensity()                                               │
│     → Ahora encuentra 36 escenas en la tabla                        │
│     ✓ Validación pasa                                               │
└─────────────────────────────────────────────────────────────────────┘
```

## Cambios Técnicos

### 1. Actualizar useSceneDensityValidation.ts

Modificar la función `expandBeatsToScenes` para encadenar la llamada a `materialize-scenes`:

```typescript
const expandBeatsToScenes = useCallback(async (
  projectId: string,
  durationMin: number,
  densityProfile: string = 'standard'
): Promise<{ success: boolean; scenesCount: number; error?: string }> => {
  setIsExpanding(true);
  
  try {
    toast.info('Expandiendo beats en escenas...', { duration: 10000 });
    
    // Paso 1: Expandir beats a escenas en el outline
    const { data, error } = await invokeAuthedFunction('expand-beats-to-scenes', {
      projectId,
      durationMin,
      densityProfile,
    });

    if (error || !data?.success) {
      throw new Error(data?.message || error?.message || 'Error expandiendo escenas');
    }

    // Paso 2: NUEVO - Materializar escenas en la tabla scenes
    toast.info('Materializando escenas en base de datos...', { duration: 5000 });
    
    const { data: materializeData, error: materializeError } = await invokeAuthedFunction(
      'materialize-scenes',
      {
        projectId,
        deleteExisting: true, // Borrar escenas previas
      }
    );

    if (materializeError || !materializeData?.success) {
      console.warn('[useSceneDensityValidation] Materialize warning:', materializeError);
      // No fallar si materialize falla, solo advertir
    } else {
      console.log('[useSceneDensityValidation] Materialized:', materializeData.scenes?.created);
    }

    toast.success(`Expansión completada: ${data.scenesCount} escenas generadas`);
    
    return {
      success: true,
      scenesCount: data.scenesCount,
    };
  } catch (err: any) {
    // ... error handling
  } finally {
    setIsExpanding(false);
  }
}, []);
```

### 2. Verificar materialize-scenes

La función `materialize-scenes` ya tiene lógica para leer de `episode_beats[0].scenes`, pero necesita mejorarse para manejar el nuevo formato de `expand-beats-to-scenes`. 

Añadir soporte para el formato con campos `slugline`, `summary`, `characters_present`:

```typescript
// En extractScenesFromEpisodeBeats()
if (Array.isArray(ep.scenes)) {
  for (let i = 0; i < ep.scenes.length; i++) {
    const sc = ep.scenes[i];
    scenes.push({
      scene_no: sc.scene_number || globalSceneNo++,
      episode_no: episodeNo,
      slugline: sc.slugline || `ESCENA ${i + 1}`,
      summary: sc.summary || sc.description || '',
      time_of_day: parseTimeOfDay(sc.slugline || ''),
      mood: 'neutral',
      character_names: sc.characters_present || sc.character_names || [],
      location_name: extractLocationFromSlugline(sc.slugline),
      beats: sc.beats || []
    });
  }
}
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useSceneDensityValidation.ts` | Añadir llamada a materialize-scenes después de expand |
| `supabase/functions/materialize-scenes/index.ts` | Mejorar extracción del nuevo formato de escenas |

## Resultado Esperado

1. Usuario hace clic en "Expandir a 26-45 Escenas"
2. Sistema genera 36 escenas en el outline JSON
3. Sistema automáticamente materializa esas 36 escenas en la tabla `scenes`
4. Validación encuentra 36 escenas y marca como válido
5. Usuario puede continuar al paso de generación de guión
