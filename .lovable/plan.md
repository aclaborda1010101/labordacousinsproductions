
# Plan: Conectar el botón "Aprobar y Generar Guion" al Sistema Narrativo v70

## Diagnóstico del Problema

El botón **"✅ Aprobar y Generar Guión"** en el componente `OutlineWizardV11` no hace nada visible porque:

1. **Función deprecada**: La función `approveAndGenerateEpisodes()` en `ScriptImport.tsx:3600-3605` está diseñada para **bloquear** la ejecución del motor legacy y solo hacer:
   ```typescript
   navigate(`/projects/${projectId}/script`);
   toast.info('Ve a la pestaña "Producción" y usa el panel de Sistema Narrativo v70 para generar.');
   ```

2. **Doble punto de entrada confuso**: 
   - **Arriba**: Botón grande verde "Aprobar y Generar Guión" que **no genera nada**
   - **Abajo**: Panel de "Sistema Narrativo v70" con botón "Iniciar Generación" que **SÍ genera**

3. **UX rota**: El usuario ve el botón prominente, lo clickea, y parece que "no hace nada" porque:
   - Ya está en `/projects/:id/script` (no hay redirección visible)
   - El toast dice que vaya a un panel que está más abajo en la misma página

## Solución Propuesta

**Conectar el botón "Aprobar y Generar" directamente al Sistema Narrativo v70**, eliminando la confusión de tener dos puntos de entrada.

### Opción A: Invocar el Sistema Narrativo desde el botón (RECOMENDADA)

Modificar `approveAndGenerateEpisodes` para que:
1. Marque el outline como "approved" en la base de datos
2. Invoque `startGeneration()` del hook de useNarrativeGeneration 
3. Navegue a la vista de progreso

### Opción B: Eliminar el botón y destacar el panel v70

Ocultar o cambiar el botón a "Ver Panel de Generación" que haga scroll al `NarrativeGenerationPanel`.

---

## Implementación (Opción A)

### Cambios en `ScriptImport.tsx`

**1. Importar y usar el hook de generación narrativa:**
```typescript
// Nueva referencia para controlar el panel de generación
const narrativeGenerationRef = useRef<{ startGeneration: () => Promise<void> } | null>(null);
```

**2. Modificar `approveAndGenerateEpisodes()` para aprobar el outline e iniciar generación:**

```typescript
const approveAndGenerateEpisodes = async () => {
  try {
    // 1. Aprobar el outline en la base de datos
    if (outlinePersistence.savedOutline?.id) {
      await supabase
        .from('project_outlines')
        .update({ status: 'approved' })
        .eq('id', outlinePersistence.savedOutline.id);
      
      setOutlineApproved(true);
      updatePipelineStep('approval', 'success');
    }
    
    // 2. Hacer scroll al panel de Sistema Narrativo y mostrar toast
    const narrativePanel = document.querySelector('[data-narrative-panel]');
    narrativePanel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    toast.success(
      'Outline aprobado. Haz clic en "Iniciar Generación" en el panel de Sistema Narrativo.',
      { duration: 5000 }
    );
  } catch (error: any) {
    console.error('[ScriptImport] Error approving outline:', error);
    toast.error('Error al aprobar el outline');
  }
};
```

**3. Añadir `data-narrative-panel` al `NarrativeGenerationPanel`:**

```tsx
{lightOutline && (
  <div data-narrative-panel>
    <NarrativeGenerationPanel
      projectId={projectId}
      outline={lightOutline}
      // ... resto de props
    />
  </div>
)}
```

### Alternativa más directa: Auto-iniciar generación

Si quieres que el botón "Aprobar y Generar" inicie automáticamente la generación:

**1. Crear un estado de "auto-start" en ScriptImport:**
```typescript
const [shouldAutoStartGeneration, setShouldAutoStartGeneration] = useState(false);
```

**2. Modificar `approveAndGenerateEpisodes`:**
```typescript
const approveAndGenerateEpisodes = async () => {
  // Aprobar outline
  if (outlinePersistence.savedOutline?.id) {
    await supabase
      .from('project_outlines')
      .update({ status: 'approved' })
      .eq('id', outlinePersistence.savedOutline.id);
    
    setOutlineApproved(true);
    updatePipelineStep('approval', 'success');
  }
  
  // Señalar que debe auto-iniciar
  setShouldAutoStartGeneration(true);
  
  // Scroll al panel
  const narrativePanel = document.querySelector('[data-narrative-panel]');
  narrativePanel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
```

**3. Pasar prop `autoStart` al `NarrativeGenerationPanel`:**
```tsx
<NarrativeGenerationPanel
  projectId={projectId}
  outline={lightOutline}
  autoStart={shouldAutoStartGeneration}
  onAutoStartComplete={() => setShouldAutoStartGeneration(false)}
  // ...
/>
```

**4. En `NarrativeGenerationPanel`, añadir lógica de auto-start:**
```typescript
useEffect(() => {
  if (autoStart && !isGenerating && sceneIntents.length === 0) {
    handleStart().then(() => onAutoStartComplete?.());
  }
}, [autoStart]);
```

---

## Archivos a Modificar

1. **`src/components/project/ScriptImport.tsx`**
   - Líneas 3598-3605: Reescribir `approveAndGenerateEpisodes()` para aprobar + señalar auto-start
   - Líneas 7753-7771: Añadir wrapper con `data-narrative-panel` y props `autoStart`

2. **`src/components/project/NarrativeGenerationPanel.tsx`**
   - Añadir props `autoStart` y `onAutoStartComplete`
   - Implementar `useEffect` que detecte `autoStart` y llame a `handleStart()`

---

## Resultado Esperado

Después de implementar estos cambios:

1. Usuario ve el botón "✅ Aprobar y Generar Guión"
2. Al hacer clic:
   - El outline se marca como `approved` en la base de datos
   - El panel de Sistema Narrativo v70 inicia automáticamente la generación
   - El usuario ve el progreso en tiempo real
3. No hay más confusión entre dos puntos de entrada

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| `startGeneration` falla silenciosamente | Ya implementado en cambios anteriores: muestra toast con acciones "Continuar"/"Reiniciar" |
| El outline no está listo para aprobar | El botón ya está deshabilitado si `!qcStatus.canGenerateEpisodes` |
| Generación ya en curso | `startGeneration` detecta intents existentes y ofrece "Continuar" |
