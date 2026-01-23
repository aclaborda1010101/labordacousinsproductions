
# Plan: Corregir Flujo de Reinvocación de Generación de Escenas

## Problema Raíz

Cuando el usuario reintenta la generación después de un error previo, el sistema tiene un estado inconsistente:

| Tabla | Estado Actual | Lo Esperado |
|-------|--------------|-------------|
| `scene_intent` | 5 registros en `pending` | ✓ Correctos |
| `jobs` | 5 registros en `queued` | ✓ Correctos, pero no se procesan |
| `scenes` | 0 registros | ❌ Debería haber 5 |

**El problema**: `narrative-decide` ve que ya existen los `scene_intent` → los filtra → devuelve `jobs_created: []` → el frontend no tiene jobs que procesar.

---

## Solución

Modificar el flujo para que detecte y procese jobs existentes antes de intentar crear nuevos.

### 1. `narrative-decide` debe devolver jobs existentes

**Archivo**: `supabase/functions/narrative-decide/index.ts`

Añadir lógica para:
1. Detectar si hay jobs en estado `queued` para este proyecto/episodio
2. Si existen, devolverlos en lugar de crear nuevos
3. Solo crear nuevos jobs si no hay existentes

```typescript
// Después de línea 118-119, añadir:
// 3b. Check for existing queued jobs that need processing
const { data: existingQueuedJobs } = await auth.supabase
  .from('jobs')
  .select('id, payload')
  .eq('project_id', projectId)
  .eq('type', 'scene_generation')
  .eq('status', 'queued');

// Si hay jobs pendientes, devolverlos sin crear nuevos
if (existingQueuedJobs && existingQueuedJobs.length > 0) {
  const existingJobIds = existingQueuedJobs.map(j => j.id);
  
  console.log('[narrative-decide] Found existing queued jobs:', existingJobIds.length);
  
  return new Response(JSON.stringify({
    ok: true,
    data: {
      scenes_planned: existingJobIds.length,
      jobs_created: existingJobIds,  // Devolver IDs existentes
      reusing_existing_jobs: true,
      narrative_state_id: narrativeState.id,
      duration_ms: Date.now() - startTime
    }
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

### 2. Hook del frontend debe manejar jobs existentes

**Archivo**: `src/hooks/usePreScriptWizard.ts`

Añadir detección de jobs existentes antes de llamar a `narrative-decide`:

```typescript
// En executeStep5, antes de llamar narrative-decide (línea ~687):

// Check for existing queued jobs first
const { data: existingJobs } = await supabase
  .from('jobs')
  .select('id')
  .eq('project_id', projectId)
  .eq('type', 'scene_generation')
  .eq('status', 'queued');

let jobsCreated: string[] = [];

if (existingJobs && existingJobs.length > 0) {
  // Use existing jobs instead of calling narrative-decide
  jobsCreated = existingJobs.map(j => j.id);
  toast.info(`Recuperando ${jobsCreated.length} escenas pendientes...`);
} else {
  // Call narrative-decide for new planning
  const { data, error } = await invokeAuthedFunction('narrative-decide', {...});
  jobsCreated = data.jobs_created || [];
}
```

### 3. Añadir fallback para intents sin jobs

Si hay `scene_intent` en `pending` pero no hay `jobs`, el sistema debe poder invocar `scene-worker` directamente (ya existe esta lógica en líneas 766-820, pero necesita activarse correctamente).

---

## Cambios Técnicos Detallados

### Archivo 1: `supabase/functions/narrative-decide/index.ts`

**Líneas 110-120** - Añadir después de obtener `existingIntents`:

```typescript
// Check for existing queued jobs first
const { data: existingQueuedJobs } = await auth.supabase
  .from('jobs')
  .select('id, payload')
  .eq('project_id', projectId)
  .eq('type', 'scene_generation')
  .eq('status', 'queued');

if (existingQueuedJobs && existingQueuedJobs.length > 0) {
  console.log('[narrative-decide] Returning existing queued jobs:', existingQueuedJobs.length);
  
  const durationMs = Date.now() - startTime;
  return new Response(JSON.stringify({
    ok: true,
    data: {
      scenes_planned: existingQueuedJobs.length,
      jobs_created: existingQueuedJobs.map(j => j.id),
      reusing_existing_jobs: true,
      narrative_state_id: narrativeState.id,
      duration_ms: durationMs
    }
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

### Archivo 2: `src/hooks/usePreScriptWizard.ts`

**Líneas 684-710** - Refactorizar para detectar jobs existentes:

```typescript
try {
  const currentOutline = state.enrichedOutline || outline;
  
  // Step 5a: Check for existing queued jobs first
  console.log('[PreScriptWizard] Checking for existing queued jobs...');
  
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('project_id', projectId)
    .eq('type', 'scene_generation')
    .eq('status', 'queued');

  let jobsCreated: string[] = [];
  let scenesPlanned = 0;

  if (existingJobs && existingJobs.length > 0) {
    // Resume from existing queued jobs
    jobsCreated = existingJobs.map(j => j.id);
    scenesPlanned = jobsCreated.length;
    toast.info(`Reanudando ${scenesPlanned} escenas pendientes...`);
    console.log('[PreScriptWizard] Found existing jobs:', jobsCreated);
  } else {
    // No existing jobs - call narrative-decide for fresh planning
    console.log('[PreScriptWizard] Step 5: Planning scenes...');
    toast.info('Planificando escenas...');
    
    const { data, error } = await invokeAuthedFunction('narrative-decide', {
      projectId,
      outline: currentOutline,
      episodeNumber: 1,
      language,
      qualityTier,
      format,
    });

    if (error) {
      throw new Error(error.message || 'Error en narrative-decide');
    }

    console.log('[PreScriptWizard] narrative-decide result:', data);
    jobsCreated = Array.isArray(data.jobs_created) ? data.jobs_created : [];
    scenesPlanned = data.scenes_planned || jobsCreated.length || 0;
  }

  if (scenesPlanned === 0) {
    // Fallback: check for pending intents without jobs
    const { data: pendingIntents } = await supabase
      .from('scene_intent')
      .select('id, scene_number, episode_number')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('scene_number', { ascending: true });
    
    if (pendingIntents && pendingIntents.length > 0) {
      toast.info(`Procesando ${pendingIntents.length} escenas directamente...`);
      // Use existing fallback logic at line 766+
      scenesPlanned = pendingIntents.length;
    }
  }

  toast.success(`${scenesPlanned} escenas planificadas`);
  // ... rest of the function
```

---

## Diagrama del Flujo Corregido

```text
[Usuario inicia generación]
         │
         ▼
┌─────────────────────────────┐
│ ¿Hay jobs en estado queued? │
└─────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
  [SÍ]      [NO]
    │         │
    │         ▼
    │   ┌─────────────────┐
    │   │ narrative-decide │
    │   │ (crear nuevos)   │
    │   └─────────────────┘
    │         │
    └────┬────┘
         ▼
┌─────────────────────────────┐
│ Procesar jobs con           │
│ scene-worker (secuencial)   │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Esperar completion por cada │
│ intent (polling 60s max)    │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ compileScriptFromScenes     │
└─────────────────────────────┘
         │
         ▼
    [Guion Listo]
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/narrative-decide/index.ts` | Detectar y devolver jobs existentes en `queued` antes de crear nuevos |
| `src/hooks/usePreScriptWizard.ts` | Verificar jobs existentes en el frontend antes de llamar `narrative-decide` |

---

## Resultado Esperado

1. **Primera ejecución**: `narrative-decide` crea intents y jobs, el frontend los procesa
2. **Reintentos**: El sistema detecta jobs en `queued` y los procesa sin crear duplicados
3. **Fallback robusto**: Si hay intents sin jobs, invoca `scene-worker` directamente
4. **Sin loops infinitos**: Siempre hay una ruta clara hacia la compilación del guion
