
# Plan: Integrar Generación Narrativa en el Wizard (5 Pasos Unificados)

## Problema Actual

El flujo de la pestaña "Guion" tiene dos componentes separados que confunden al usuario:

```text
Flujo Actual (Fragmentado):
┌─────────────────────┐     ┌─────────────────────────┐
│  PreScriptWizard    │     │ NarrativeGenerationPanel│
│  (4 pasos)          │ ──> │ (componente separado)   │
└─────────────────────┘     └─────────────────────────┘
         │                              │
         v                              v
      ¿Perdido?                    ¿Perdido?
```

**Problemas:**
- El progreso del wizard no se guarda correctamente
- Cuando se inicia la generación, el usuario es redirigido a otra pantalla
- Al volver, tiene que volver a aprobar el outline
- No hay transición clara al resumen final del guion

---

## Solución: Wizard Unificado de 5 Pasos

```text
Nuevo Flujo (Integrado):
┌──────────────────────────────────────────────────────┐
│                 PreScriptWizard v2                   │
│                                                      │
│  ① Carne Operativa ─> ② Hilos Narrativos ─>         │
│  ③ Showrunner ─> ④ Confirmar ─> ⑤ GENERAR           │
│                                                      │
│  [────────────────────────▓▓▓▓░░░░░░░░] 60%         │
│                                                      │
│  Paso 5: Generando escenas... 8/15 completadas      │
│                                                      │
└──────────────────────────────────────────────────────┘
                         │
                         v (al completar fase 5)
┌──────────────────────────────────────────────────────┐
│              RESUMEN COMPLETO DEL GUION              │
│                                                      │
│  📺 Título del Proyecto                              │
│  ├─ Sinopsis extendida                              │
│  ├─ 12 personajes (8 principales, 4 secundarios)    │
│  ├─ 6 localizaciones                                │
│  ├─ 3 episodios / 45 escenas                        │
│  └─ Subtramas, giros narrativos                     │
│                                                      │
│  [Exportar PDF]  [Ir a Producción]                  │
└──────────────────────────────────────────────────────┘
```

---

## Cambios Técnicos

### 1. Modificar `usePreScriptWizard.ts` - Añadir Paso 5 "generate"

**Archivo:** `src/hooks/usePreScriptWizard.ts`

```typescript
// Añadir nuevo tipo de paso
export type WizardStep = 'enrich' | 'threads' | 'showrunner' | 'approve' | 'generate';

// Actualizar estado inicial
const initialState: WizardState = {
  currentStep: 'enrich',
  steps: {
    enrich: { status: 'pending' },
    threads: { status: 'pending' },
    showrunner: { status: 'pending' },
    approve: { status: 'pending' },
    generate: { status: 'pending' }, // NUEVO
  },
  // ... resto igual
};

// Añadir executeStep5 para generación
const executeStep5 = useCallback(async () => {
  // Integrar lógica de useNarrativeGeneration aquí
  // - Llamar narrative-decide
  // - Ejecutar scene-worker para cada intent
  // - Compilar script al finalizar
  // - Actualizar progreso en tiempo real
}, [projectId, outline, ...deps]);
```

**Nuevo callback:** `onScriptCompiled?: (scriptData: any) => void`

### 2. Modificar `PreScriptWizard.tsx` - Añadir UI para Paso 5

**Archivo:** `src/components/project/PreScriptWizard.tsx`

Añadir configuración del nuevo paso:
```typescript
const STEP_CONFIG: Record<WizardStep, { title: string; description: string; icon: any }> = {
  // ... pasos existentes
  generate: {
    title: 'Generando Guion',
    description: 'Escribiendo escenas con diálogos y acotaciones',
    icon: Film, // o Sparkles
  },
};

const STEP_ORDER: WizardStep[] = ['enrich', 'threads', 'showrunner', 'approve', 'generate'];
```

Añadir renderizado del paso 5:
```tsx
case 'generate':
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        El sistema narrativo está generando las escenas con diálogos completos.
      </p>
      
      {/* Barra de progreso de generación */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Progreso: {completedScenes}/{totalScenes} escenas</span>
          <span>{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} className="h-3" />
      </div>
      
      {/* Lista de intents con estados */}
      <ScrollArea className="h-48">
        {sceneIntents.map((intent) => (
          <div key={intent.id} className="flex items-center gap-2 p-2">
            {getIntentStatusIcon(intent.status)}
            <span>Escena {intent.scene_number}: {intent.intent_summary}</span>
          </div>
        ))}
      </ScrollArea>
      
      {/* Botón cancelar si está generando */}
      {isGenerating && (
        <Button onClick={cancelGeneration} variant="destructive">
          <Square className="h-4 w-4 mr-2" />
          Cancelar Generación
        </Button>
      )}
    </div>
  );
```

### 3. Modificar `ScriptImport.tsx` - Simplificar lógica de renderizado

**Archivo:** `src/components/project/ScriptImport.tsx`

**Antes:**
```tsx
{/* Dos componentes separados */}
<PreScriptWizard ... onComplete={() => setShouldAutoStartGeneration(true)} />
<NarrativeGenerationPanel ... />
```

**Después:**
```tsx
{/* Un solo componente unificado */}
<PreScriptWizard
  projectId={projectId}
  outline={outlineForUI}
  open={true}
  inline={true}
  onComplete={() => {
    // Wizard completó todos los 5 pasos
  }}
  onScriptCompiled={(scriptData) => {
    // Cargar el script compilado y mostrar resumen
    setGeneratedScript(scriptData);
    setNarrativeGenerationComplete(false);
    toast.success('¡Guion generado exitosamente!');
  }}
/>
```

Eliminar el `NarrativeGenerationPanel` separado - su lógica ahora vive dentro del wizard.

### 4. Modificar paso 4 ("Aprobar") para auto-avanzar

**Cambio clave:** Cuando el usuario hace clic en "Generar Guion Completo" en el paso 4, automáticamente:
1. Marca paso 4 como `done`
2. Avanza a paso 5 (`generate`)
3. Inicia la generación automáticamente

```typescript
case 'approve':
  // El botón "Generar Guion Completo" ahora:
  onClick={async () => {
    await executeCurrentStep(); // Marca approve como done
    goNext(); // Avanza a paso 5
    // La generación se inicia automáticamente cuando el step cambia a 'generate'
  }}
```

### 5. Callback de compilación al completar paso 5

Cuando todas las escenas están generadas (`progress.phase === 'completed'`):

```typescript
// En executeStep5 o en un useEffect que observe el progreso
if (progress.phase === 'completed') {
  // Compilar script
  const scriptData = await compileScriptFromScenes(projectId);
  
  // Marcar paso como completado
  updateStep('generate', { status: 'done', result: scriptData });
  
  // Notificar al padre con el script compilado
  onScriptCompiled?.(scriptData);
}
```

---

## Persistencia y Reanudación

El hook ya carga el estado desde la BD. Añadir detección del paso 5:

```typescript
// En loadWizardState()
const { data: sceneIntents } = await supabase
  .from('scene_intent')
  .select('id, status')
  .eq('project_id', projectId);

const hasActiveGeneration = sceneIntents?.some(i => 
  ['pending', 'writing', 'planned'].includes(i.status)
);

if (hasActiveGeneration) {
  // Reanudar en paso 5
  setState(prev => ({
    ...prev,
    currentStep: 'generate',
    steps: {
      ...prev.steps,
      enrich: { status: 'done' },
      threads: { status: 'done' },
      showrunner: { status: 'done' },
      approve: { status: 'done' },
      generate: { status: 'running' },
    },
  }));
}
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/hooks/usePreScriptWizard.ts` | Añadir paso 5 "generate", integrar lógica de generación, nuevo callback `onScriptCompiled` |
| `src/components/project/PreScriptWizard.tsx` | Añadir UI para paso 5 con progreso en tiempo real, actualizar `STEP_CONFIG` y `STEP_ORDER` |
| `src/components/project/ScriptImport.tsx` | Simplificar renderizado, eliminar `NarrativeGenerationPanel` separado, conectar `onScriptCompiled` para cargar resumen |

---

## Resultado Esperado

1. Usuario aprueba outline → va a pestaña "Guion"
2. Ve **un único wizard de 5 pasos**
3. Completa pasos 1-4 (preparación)
4. Paso 5: **la generación ocurre DENTRO del wizard** con progreso visible
5. Al terminar paso 5: **el wizard desaparece**
6. Aparece automáticamente el **resumen completo del guion** con:
   - Sinopsis extendida
   - Personajes por categoría
   - Localizaciones
   - Episodios expandibles con escenas
   - Subtramas, giros narrativos
   - Botones "Exportar PDF" e "Ir a Producción"
7. Si el usuario sale y vuelve: **retoma desde donde estaba** (persistencia completa)
