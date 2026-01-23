

# Plan: Arreglar el flujo "Generar Guion Completo" y "Aprobar y Generar"

## Diagnóstico

Tras revisar el código, la base de datos y los logs, he identificado **3 causas raíz**:

### 1. Botón "Generar Guion Completo" lleva al tab INCORRECTO
- **Ubicación**: `ScriptImport.tsx:8038`
- **Problema**: El botón ejecuta `setActiveTab('generate')` (tab "Idea"), pero el `NarrativeGenerationPanel` está renderizado en el tab `'outline'`.
- **Efecto**: El usuario ve la pantalla de "Idea" en lugar del panel de generación.

### 2. useEffect fuerza el tab a 'summary' si existe un script
- **Ubicación**: `ScriptImport.tsx:1521-1524`
- **Problema**: Si hay un `generatedScript`, el efecto hace `setActiveTab('summary')` automáticamente, pisando cualquier navegación intencional del usuario.
- **Efecto**: El click del usuario es ignorado porque el efecto restaura el tab inmediatamente.

### 3. La lógica de auto-start detecta intents pero el useEffect tiene dependencias incompletas
- **Ubicación**: `NarrativeGenerationPanel.tsx:94-138`
- **Problema**: El `useEffect` tiene dependencias `[autoStart, isLoaded, sceneIntents.length, progress.phase]` pero no responde correctamente cuando:
  - `sceneIntents.length > 0` (hay 5 intents)
  - `progress.phase === 'planning'` (derivado de intents 'pending')
  - La rama `hasPending` debería dispararse pero no está continuando la generación

El estado actual de tu proyecto:
- 5 `scene_intent` con status `'pending'`
- 0 `jobs` en cola
- `narrative_state.current_phase = 'setup'`

Esto indica que `narrative-decide` creó los intents pero no procesó los jobs. El frontend debería llamar a `continueGeneration()` pero algo bloquea.

---

## Solución

### Cambio 1: Corregir el tab destino del botón "Generar Guion Completo"

**Archivo**: `src/components/project/ScriptImport.tsx`
**Línea**: 8038

```diff
- <Button variant="default" onClick={() => setActiveTab('generate')}>
+ <Button variant="default" onClick={() => setActiveTab('outline')}>
```

Esto llevará al usuario al tab donde está el `NarrativeGenerationPanel`.

### Cambio 2: Evitar que el useEffect pise la navegación intencional

**Archivo**: `src/components/project/ScriptImport.tsx`
**Líneas**: 1521-1524

Añadir un flag que indique "el usuario navegó intencionalmente" y respetarlo.

```typescript
// Nueva ref para trackear navegación intencional
const userNavigatedRef = useRef(false);

// En setActiveTab wrapper:
const handleTabChange = (newTab: string) => {
  userNavigatedRef.current = true;
  setActiveTab(newTab);
  // Reset after a delay
  setTimeout(() => { userNavigatedRef.current = false; }, 500);
};

// En el useEffect:
if (!isOutlineOperationInProgress.current && 
    !userNavigatedRef.current && 
    activeTab === 'generate') {
  setActiveTab('summary');
}
```

### Cambio 3: Mejorar lógica de auto-start para manejar el caso "intents pending sin generación activa"

**Archivo**: `src/components/project/NarrativeGenerationPanel.tsx`
**Líneas**: 94-138

```typescript
useEffect(() => {
  if (!autoStart || autoStartProcessedRef.current || !isLoaded) return;
  
  autoStartProcessedRef.current = true;
  
  // Case 1: No intents → start new generation
  if (sceneIntents.length === 0) {
    console.log('[NarrativePanel] Auto-start: nueva generación');
    handleStart().finally(() => onAutoStartComplete?.());
    return;
  }
  
  // Case 2: Generation completed → show feedback
  if (progress.phase === 'completed') {
    console.log('[NarrativePanel] Auto-start: generación ya completada');
    toast.info('Ya existe un guion generado. Puedes verlo en la pestaña Escenas.', {
      duration: 5000,
      action: {
        label: 'Regenerar',
        onClick: () => resetNarrativeState(),
      },
    });
    onAutoStartComplete?.();
    return;
  }
  
  // Case 3: ANY intents in workable states → ALWAYS continue (covers planning, pending, writing, etc.)
  const workableStatuses = ['pending', 'planning', 'planned', 'writing', 'repairing', 'needs_repair'];
  const hasPending = sceneIntents.some(i => workableStatuses.includes(i.status));
  
  if (hasPending) {
    console.log('[NarrativePanel] Auto-start: continuando generación pendiente', {
      total: sceneIntents.length,
      pending: sceneIntents.filter(i => workableStatuses.includes(i.status)).length,
    });
    continueGeneration().finally(() => onAutoStartComplete?.());
    return;
  }
  
  // Case 4: All failed or unknown → just complete
  console.log('[NarrativePanel] Auto-start: estado no manejado, completando');
  onAutoStartComplete?.();
}, [autoStart, isLoaded, sceneIntents, progress.phase]);
```

**Nota clave**: Cambiar `sceneIntents.length` a `sceneIntents` en las dependencias para que el efecto se re-evalúe cuando cambian los datos internos (statuses).

### Cambio 4: Asegurar que continueGeneration() maneje correctamente el estado actual

**Archivo**: `src/hooks/useNarrativeGeneration.ts`

Añadir un log más explícito al inicio de `continueGeneration` para debugging:

```typescript
const continueGeneration = useCallback(async () => {
  console.log('[NarrativeGen] continueGeneration called', { 
    isGenerating: isGeneratingRef.current,
    projectId 
  });
  // ... resto del código
});
```

---

## Resumen de archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/project/ScriptImport.tsx` | (1) Cambiar `setActiveTab('generate')` → `setActiveTab('outline')` en línea 8038 |
| `src/components/project/ScriptImport.tsx` | (2) Añadir `userNavigatedRef` y condición para evitar override del tab |
| `src/components/project/NarrativeGenerationPanel.tsx` | (3) Mejorar lógica de auto-start y dependencias del useEffect |
| `src/hooks/useNarrativeGeneration.ts` | (4) Añadir logs de debugging en `continueGeneration` |

---

## Flujo esperado después del fix

### Botón "Generar Guion Completo" (tab Guion)
1. Usuario pulsa → `setActiveTab('outline')` 
2. Vista cambia al tab Outline
3. El `NarrativeGenerationPanel` es visible
4. Si `shouldAutoStartGeneration` está true, el panel auto-inicia

### Botón "Aprobar y Generar" (en OutlineWizard)
1. Usuario pulsa → outline se aprueba en BD
2. `setShouldAutoStartGeneration(true)` se activa
3. Scroll al panel de generación
4. `NarrativeGenerationPanel` recibe `autoStart=true`
5. `useEffect` espera `isLoaded=true` (carga intents existentes)
6. Detecta 5 intents `pending` → llama `continueGeneration()`
7. Generación comienza y el usuario ve progreso

---

## Verificación post-fix

1. Pulsar "Generar Guion Completo" → debe ir al tab Outline y mostrar el panel
2. Pulsar "Aprobar y Generar" → debe aprobar, hacer scroll, y auto-iniciar
3. Si ya existen intents pending → debe continuar automáticamente
4. Si ya está completado → debe mostrar toast con opción "Regenerar"

