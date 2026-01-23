

# Plan: Ocultar Barra de Progreso Superior Durante el Wizard

## Problema Identificado

Hay dos barras de progreso mostrándose simultáneamente:

| Componente | Ubicación | Muestra |
|------------|-----------|---------|
| `ScriptProgressTimeline` | Arriba (fuera del wizard) | "1/6" - basado en `scene_intent` pendientes |
| `PreScriptWizard` Step 5 | Abajo (dentro del wizard) | "80%" - basado en jobs procesados |

**Causa**: `ScriptWorkspaceView.tsx` muestra `ScriptProgressTimeline` cuando `activeGeneration.phase` no es `idle` o `completed`. Como hay `scene_intent` en `pending`, el hook devuelve `phase: 'planning'` y la barra superior aparece.

**Conflicto**: El wizard tiene su propia UI de progreso más precisa, pero la barra superior le hace competencia con información desactualizada.

---

## Solución

Ocultar `ScriptProgressTimeline` cuando el usuario está en la pestaña "Guion" y el wizard está activo. La lógica en `ScriptWorkspaceView.tsx` no tiene contexto sobre qué pestaña está activa, así que la mejor solución es mover la decisión al componente que sí lo sabe: `ScriptImport.tsx`.

### Opción A: Suprimir Timeline cuando el wizard está activo

Modificar `ScriptWorkspaceView.tsx` para **no** mostrar el timeline cuando estamos en modo de generación activa del wizard.

```typescript
// src/components/project/ScriptWorkspaceView.tsx línea 27-29

// ANTES:
const showTimeline = activeGeneration && 
  activeGeneration.phase !== 'completed' && 
  activeGeneration.phase !== 'idle';

// DESPUÉS:
// Don't show external timeline - PreScriptWizard has its own progress UI
const showTimeline = false;  // Disable until unified
```

### Opción B (Más refinada): Pasar bandera del wizard

Si queremos mantener la timeline para otros casos, podemos deshabilitarla solo cuando el wizard está procesando:

1. Crear un contexto o prop que indique "wizard activo"
2. Consultar si hay un wizard en step 5 ejecutándose

Sin embargo, esto añade complejidad. La **Opción A** es más simple y el wizard ya tiene toda la información de progreso que el usuario necesita.

---

## Cambio Propuesto

### Archivo: `src/components/project/ScriptWorkspaceView.tsx`

**Antes (líneas 27-29)**:
```typescript
const showTimeline = activeGeneration && 
  activeGeneration.phase !== 'completed' && 
  activeGeneration.phase !== 'idle';
```

**Después**:
```typescript
// V78: Disable external ScriptProgressTimeline - the PreScriptWizard 
// now handles its own progress UI for step 5 (narrative generation).
// Showing both causes confusion with mismatched progress indicators.
const showTimeline = false;
```

---

## Alternativa: Solo Ocultar Durante Step 5 del Wizard

Si prefieres mantener el timeline para otros casos (por ejemplo, cuando el usuario navega a otra página durante la generación), podríamos:

1. Añadir un `localStorage` flag cuando el wizard entra en step 5
2. Leer ese flag en `ScriptWorkspaceView` para decidir

Pero esto introduce estado compartido entre componentes no relacionados. La solución más limpia es desactivar el timeline externo ya que el wizard tiene mejor información.

---

## Resultado Esperado

1. **Solo una barra de progreso**: La del wizard "Paso 5: Generando Guion" al 80%
2. **Sin confusión**: El usuario ve un solo indicador con el estado real
3. **UI más limpia**: Menos elementos redundantes en pantalla

---

## Archivo a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/project/ScriptWorkspaceView.tsx` | Cambiar `showTimeline` a `false` (línea 27) |

