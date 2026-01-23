
# Plan: Corregir Conteo y Detección de Diálogos

## Problema Identificado

Hay una inconsistencia de nombres de campos entre diferentes partes del sistema:

| Componente | Campo que usa | Campo esperado |
|------------|---------------|----------------|
| `compileScriptFromScenes.ts` | `dialogues` (array) | - |
| `isScriptComplete` | `s.dialogue` (singular) | `s.dialogue.length > 0` |
| `buildRobustCounts` | `sc.dialogue_lines` / `sc.dialogue_blocks` | No busca `dialogues` ni `dialogue` |
| Episodios (9251-9277) | `s.dialogue` + `s.dialogues` | Encuentra los 89 diálogos |

Esto explica por qué:
- **Episodio muestra 89 diálogos**: usa fallback que incluye `s.dialogues`
- **Métrica general muestra 0**: `buildRobustCounts` no encuentra los campos correctos
- **Banner "Faltan Diálogos"**: `isScriptComplete` busca `dialogue` (singular) que no existe

---

## Solución

Actualizar tres lugares para que todos busquen tanto `dialogue` como `dialogues`:

### 1. `src/lib/compileScriptFromScenes.ts`

Añadir campo `counts` con total de diálogos y usar `dialogue` (singular) además de `dialogues` para compatibilidad:

```typescript
// En el parsedJson (línea 104):
const parsedJson = {
  title: scriptTitle,
  synopsis: scriptSynopsis,
  counts: {
    total_scenes: scenes.length,
    dialogues: scenes.reduce((sum, sc) => 
      sum + (sc.parsed_json?.dialogues?.length || 0), 0
    ),
  },
  episodes: [{
    episode_number: episodeNumber,
    title: scriptTitle,
    scenes: scenes.map((scene: any) => ({
      scene_number: scene.scene_no,
      slugline: scene.slugline,
      summary: scene.summary || scene.objective,
      description: scene.parsed_json?.description || '',
      dialogues: scene.parsed_json?.dialogues || [],
      dialogue: scene.parsed_json?.dialogues || [],  // AÑADIR: alias para compatibilidad
      characters_present: scene.characters_involved || [],
      duration_estimate_sec: scene.duration_estimate_sec,
    })),
  }],
  // ...resto igual
};
```

### 2. `src/lib/breakdown/hydrate.ts` - `buildRobustCounts`

Actualizar el cálculo de diálogos para incluir `dialogues` y `dialogue`:

```typescript
// Línea 286-293, cambiar a:
dialogues:
  typeof existingCounts?.dialogues === "number"
    ? existingCounts.dialogues
    : typeof payload?.dialogues?.total_lines === "number"
      ? payload.dialogues.total_lines
      : typeof payload?.dialogue_count === "number"
        ? payload.dialogue_count
        : scenes.reduce((sum: number, sc: any) => {
            return sum + 
              (sc?.dialogue_lines || 0) + 
              (sc?.dialogue_blocks?.length || 0) +
              (Array.isArray(sc?.dialogues) ? sc.dialogues.length : 0) +
              (Array.isArray(sc?.dialogue) ? sc.dialogue.length : 0);
          }, 0),
```

### 3. `src/components/project/ScriptImport.tsx` - `isScriptComplete`

Actualizar la verificación para aceptar ambos nombres de campo:

```typescript
// Línea 5876-5878, cambiar a:
const isScriptComplete = generatedScript?.episodes?.every((ep: any) =>
  ep.scenes?.every((s: any) => 
    (s.dialogue && s.dialogue.length > 0) || 
    (s.dialogues && s.dialogues.length > 0)
  )
) ?? false;

// Línea 5881-5883, cambiar a:
const episodesNeedingDialogue = generatedScript?.episodes?.filter((ep: any) =>
  ep.scenes?.some((s: any) => 
    (!s.dialogue || s.dialogue.length === 0) && 
    (!s.dialogues || s.dialogues.length === 0)
  )
) || [];
```

También actualizar la verificación en `getStepStatus` (línea 5828-5830):

```typescript
const isScriptComplete = hasScript && generatedScript?.episodes?.every((ep: any) =>
  ep.scenes?.every((s: any) => 
    (s.dialogue && s.dialogue.length > 0) || 
    (s.dialogues && s.dialogues.length > 0)
  )
);
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/lib/compileScriptFromScenes.ts` | Añadir `counts.dialogues`, añadir alias `dialogue` en cada escena |
| `src/lib/breakdown/hydrate.ts` | Actualizar `buildRobustCounts` para buscar `dialogues` y `dialogue` |
| `src/components/project/ScriptImport.tsx` | Actualizar `isScriptComplete` y `episodesNeedingDialogue` para aceptar ambos campos |

---

## Resultado Esperado

1. **Métrica "Diálogos"**: Mostrará el conteo correcto (ej: 89) en lugar de 0
2. **Banner de advertencia**: Desaparecerá si las escenas tienen diálogos
3. **Botón "Ir a Producción"**: Se habilitará correctamente
4. **Etiqueta "Parcial" en PDF**: Desaparecerá cuando el guion esté completo
5. **Consistencia**: Tanto `dialogue` como `dialogues` funcionarán en todo el sistema
