

# Plan: Arreglar el flujo "Aprobar y Generar Guion"

## Problema Detectado

Cuando el usuario pulsa **"Aprobar y Generar Guion"**:
1. El outline se aprueba correctamente en la BD (status → `approved`)
2. Se muestra toast "Outline aprobado. Iniciando generación automática..."
3. Se dispara el auto-start **antes** de que el hook haya cargado los intents existentes
4. `startGeneration()` detecta que ya hay 5 escenas con status `written` y solo carga el estado existente
5. **No genera nada nuevo** porque la generación ya está completada
6. El usuario ve "nada pasa" aunque técnicamente todo funcionó correctamente

## Causa Raíz

**Race condition + Lógica incompleta:**
- El auto-start evalúa `sceneIntents.length === 0` antes de que `loadInitialState()` termine
- No hay feedback claro cuando la generación ya está completada
- No hay opción visible para "empezar de nuevo" si el usuario quiere regenerar

## Solución Propuesta

### Parte A: Esperar a que el estado inicial esté cargado antes del auto-start

En `NarrativeGenerationPanel.tsx`, modificar la lógica de auto-start para:

1. Añadir un estado `initialLoadComplete` que indica cuando `loadInitialState()` terminó
2. Exponer `refreshState` como promesa que resuelve cuando la carga termina
3. El auto-start espera a que el estado inicial esté cargado antes de decidir qué hacer

```typescript
// En useNarrativeGeneration.ts - Exponer isLoaded
const [isLoaded, setIsLoaded] = useState(false);

// En loadInitialState, al final:
setIsLoaded(true);

// En el return del hook:
return { ..., isLoaded };
```

```typescript
// En NarrativeGenerationPanel.tsx - useEffect de auto-start
useEffect(() => {
  if (!autoStart || autoStartProcessedRef.current || !isLoaded) return;
  
  autoStartProcessedRef.current = true;
  
  // Caso 1: No hay intents → iniciar generación nueva
  if (sceneIntents.length === 0) {
    console.log('[NarrativePanel] Auto-start: nueva generación');
    handleStart().finally(() => onAutoStartComplete?.());
    return;
  }
  
  // Caso 2: Hay intents completados → mostrar feedback y opción de regenerar
  if (progress.phase === 'completed') {
    toast.info('Ya existe un guion generado. Puedes verlo o regenerar.', {
      action: { label: 'Regenerar', onClick: () => resetNarrativeState() },
    });
    onAutoStartComplete?.();
    return;
  }
  
  // Caso 3: Hay intents pendientes → continuar
  if (sceneIntents.some(i => ['pending', 'writing', 'repairing'].includes(i.status))) {
    console.log('[NarrativePanel] Auto-start: continuando generación');
    continueGeneration().finally(() => onAutoStartComplete?.());
    return;
  }
  
  onAutoStartComplete?.();
}, [autoStart, isLoaded, sceneIntents.length, progress.phase]);
```

### Parte B: Mejorar el feedback visual cuando la generación ya está completa

En `NarrativeGenerationPanel.tsx`, mejorar la UI para cuando `phase === 'completed'`:

1. Mostrar mensaje claro de que ya existe un guion
2. Botones: "Ver Guion" | "Regenerar Todo"
3. Badge verde de éxito visible

### Parte C: Arreglar el toast del aprobador

En `ScriptImport.tsx`, cambiar el toast para reflejar lo que realmente pasará:
- Si no hay intents → "Iniciando generación..."
- Si hay intents completados → "Outline aprobado. Ya tienes un guion generado."
- Si hay intents pendientes → "Outline aprobado. Retomando generación..."

---

## Cambios por Archivo

### 1. `src/hooks/useNarrativeGeneration.ts`

| Línea | Cambio |
|-------|--------|
| ~135 | Añadir `const [isLoaded, setIsLoaded] = useState(false);` |
| ~417 | En `loadInitialState()`, añadir `setIsLoaded(true);` al final |
| ~795 | En `resetNarrativeState()`, añadir `setIsLoaded(false);` al inicio |
| ~874 | Añadir `isLoaded` al return del hook |

### 2. `src/components/project/NarrativeGenerationPanel.tsx`

| Línea | Cambio |
|-------|--------|
| 73-89 | Extraer `isLoaded` del hook |
| 92-105 | Reescribir `useEffect` de auto-start para manejar los 3 casos |
| 328-333 | Mejorar UI de "Generar Más" con más opciones |

### 3. `src/components/project/ScriptImport.tsx`

| Línea | Cambio |
|-------|--------|
| 3614-3648 | Modificar `approveAndGenerateEpisodes()` para mostrar toast contextual |

---

## Flujo Esperado Después del Fix

### Caso A: Primera vez (sin intents previos)
1. Usuario pulsa "Aprobar y Generar"
2. Outline se aprueba → toast "Iniciando generación..."
3. Hook espera a `isLoaded=true` (muy rápido, ~200ms)
4. Auto-start detecta `sceneIntents.length === 0`
5. Llama a `startGeneration()` → genera las 5 escenas
6. Usuario ve progreso en tiempo real

### Caso B: Ya hay guion completado
1. Usuario pulsa "Aprobar y Generar"  
2. Outline se aprueba → toast "Ya tienes un guion generado"
3. Hook carga los 5 intents `written`
4. Auto-start detecta `phase === 'completed'`
5. Muestra toast con opción "Regenerar"
6. Si usuario elige regenerar → llama a `resetNarrativeState()` y luego `startGeneration()`

### Caso C: Generación interrumpida (intents pendientes)
1. Usuario pulsa "Aprobar y Generar"
2. Outline se aprueba → toast "Retomando generación..."
3. Hook carga intents mixtos
4. Auto-start detecta intents `pending`/`writing`
5. Llama a `continueGeneration()` automáticamente
6. Usuario ve progreso continuar

---

## Impacto

- ✅ El botón "Aprobar y Generar" siempre tiene feedback visible
- ✅ No más "no hace nada" silencioso
- ✅ El usuario entiende el estado actual de su proyecto
- ✅ Opción clara para regenerar si quiere empezar de nuevo

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| `isLoaded` nunca se pone true si falla loadInitialState | Añadir try/finally para garantizar `setIsLoaded(true)` |
| Doble regeneración accidental | `autoStartProcessedRef` ya previene esto |
| Toast spam | Solo 1 toast por flujo, con acciones claras |

