
# Plan: Sistema de Reanudación Automática para Clonación

## Diagnóstico del Problema

El job de clonación está en estado "zombie":
- **Job ID:** `9fbd7ae5...`
- **Estado actual:** `running` pero sin actualizaciones en 3+ minutos
- **Fase:** `data` - 29% completado (707/2430 registros)
- **Última tabla:** `storyboard_panels`

La Edge Function tiene un límite de ejecución (~30-60s) que causa que el proceso termine antes de completar todas las tablas. Aunque el estado se persiste en `background_tasks`, la ejecución no se resume automáticamente.

## Solución: Sistema de Resume con Checkpoint

### Cambio 1: Agregar campos de checkpoint al estado del job

Guardar exactamente dónde quedó la clonación para poder reanudar:

```typescript
// Nuevo tipo de checkpoint
type CloneCheckpoint = {
  lastCompletedTable: string | null;  // Última tabla completamente copiada
  currentTable: string | null;        // Tabla en proceso
  currentTableOffset: number;         // Offset dentro de la tabla actual
  completedTables: string[];          // Lista de tablas ya terminadas
};

// El metadata ahora incluye checkpoint
metadata: {
  clone: {
    progress: JobState,
    checkpoint: CloneCheckpoint,
    options: { includeData, includeStorage },
    targetUrl: string  // Necesario para resume
  }
}
```

### Cambio 2: Nueva acción `resume` en la Edge Function

```typescript
// Handler para action === 'resume'
if (action === "resume") {
  const task = await readCloneTask(jobId);
  
  // Verificar que el job esté estancado (sin actualización en 60s)
  const lastUpdate = new Date(task.updated_at).getTime();
  const isStale = Date.now() - lastUpdate > 60_000;
  
  if (!isStale && task.status === 'running') {
    return { error: "Job still active, wait a moment" };
  }
  
  // Extraer checkpoint y targetUrl del metadata
  const checkpoint = task.metadata?.clone?.checkpoint;
  const savedTargetUrl = task.metadata?.clone?.targetUrl;
  
  // Reiniciar la clonación desde el checkpoint
  cloneDatabase(jobId, userId, savedTargetUrl, options, checkpoint);
  
  return { resumed: true, fromTable: checkpoint?.currentTable };
}
```

### Cambio 3: Modificar `cloneDatabase` para aceptar checkpoint

La función ahora puede empezar desde un punto intermedio:

```typescript
async function cloneDatabase(
  jobId: string,
  userId: string,
  targetUrl: string,
  options: { includeData?: boolean },
  checkpoint?: CloneCheckpoint  // NUEVO
) {
  // Si hay checkpoint, saltar las fases/tablas ya completadas
  if (checkpoint) {
    // Saltarse enums si ya se completaron
    if (checkpoint.completedPhases?.includes('enums')) {
      job.phase = 'schema';
    }
    // Durante la fase de datos, empezar desde lastCompletedTable
  }
  
  // En el loop de datos:
  for (const tableName of TABLES_ORDER) {
    // Saltar tablas ya completadas
    if (checkpoint?.completedTables?.includes(tableName)) {
      continue;
    }
    
    // Si es la tabla actual, empezar desde offset guardado
    let startOffset = 0;
    if (checkpoint?.currentTable === tableName) {
      startOffset = checkpoint.currentTableOffset;
    }
    
    // ... copiar datos desde startOffset
  }
}
```

### Cambio 4: Guardar targetUrl encriptada en metadata

Para poder reanudar, necesitamos acceso a la URL destino:

```typescript
// Al iniciar el job
const { error: insertError } = await supabaseAdmin.from("background_tasks").insert({
  id: newJobId,
  metadata: { 
    clone: { 
      progress: initialJob, 
      options,
      // Guardar URL (ya sanitizada) para resume
      targetUrl: cleanTargetUrl,
      checkpoint: { completedTables: [], currentTable: null, currentTableOffset: 0 }
    } 
  },
});
```

### Cambio 5: Actualizar `DatabaseCloner.tsx` para detectar y resumir

```typescript
// Nuevo: detectar jobs estancados
const isJobStale = (updatedAt: string) => {
  return Date.now() - new Date(updatedAt).getTime() > 60_000; // 60s sin update
};

// En el useEffect de reconexión
if (recentTask.status === 'running') {
  const isStale = isJobStale(recentTask.updated_at);
  
  if (isStale) {
    // Job zombie detectado - ofrecer resume
    setPreviousJob({
      ...recentTask,
      isStale: true,  // NUEVO flag
    });
    toast.warning('Clonación interrumpida detectada');
  } else {
    // Job activo - reconectar normalmente
    setJobId(recentTask.id);
    setCloning(true);
  }
}

// Nuevo botón "Reanudar"
const handleResume = async () => {
  setCloning(true);
  const { data } = await supabase.functions.invoke('clone-database', {
    body: { action: 'resume', jobId: previousJob.id }
  });
  
  if (data?.resumed) {
    setJobId(previousJob.id);
    toast.info(`Reanudando desde ${data.fromTable}...`);
  }
};
```

### Cambio 6: UI para job estancado

Agregar estado visual diferente para jobs zombies:

```tsx
{previousJob?.isStale && (
  <Alert className="border-orange-500 bg-orange-50">
    <AlertTriangle className="h-4 w-4 text-orange-600" />
    <AlertDescription>
      <p><strong>Clonación interrumpida:</strong> El proceso se detuvo en la fase {previousJob.progress.phase}</p>
      <p className="text-xs">Progreso: {previousJob.progress.current}/{previousJob.progress.total} - {previousJob.progress.currentItem}</p>
      <div className="flex gap-2 mt-2">
        <Button size="sm" onClick={handleResume}>
          <RotateCcw className="w-3 h-3 mr-1" />
          Reanudar desde aquí
        </Button>
        <Button size="sm" variant="destructive" onClick={handleCleanAndRetry}>
          <Trash2 className="w-3 h-3 mr-1" />
          Empezar de cero
        </Button>
      </div>
    </AlertDescription>
  </Alert>
)}
```

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/clone-database/index.ts` | Nueva acción `resume`, checkpoint en metadata, lógica de skip para tablas completadas |
| `src/components/project/DatabaseCloner.tsx` | Detección de jobs estancados, botón "Reanudar", UI para estado zombie |

## Flujo Completo de Resume

```text
1. Usuario inicia clonación
         ↓
2. Edge Function empieza, guarda checkpoint cada 300ms
         ↓
3. Cold start/timeout interrumpe el proceso
         ↓
4. Usuario vuelve a la pantalla de clonación
         ↓
5. useEffect detecta job "running" sin update en 60s
         ↓
6. UI muestra: "Clonación interrumpida en tabla X"
         ↓
7. Usuario hace clic en "Reanudar"
         ↓
8. Edge Function lee checkpoint, salta tablas completadas
         ↓
9. Continúa desde donde quedó
         ↓
10. Si hay otro timeout, repetir desde paso 4
```

## Manejo del Job Zombie Actual

Para el job actual (`9fbd7ae5...`), después de implementar esto:

1. El sistema detectará que está estancado
2. Mostrará opción de "Reanudar" o "Limpiar y empezar de cero"
3. Si el usuario elige "Reanudar", continuará desde `storyboard_panels`
4. Si elige "Limpiar", borrará el destino y empezará fresh

## Consideraciones de Seguridad

- La `targetUrl` se guarda en `metadata` que solo el usuario propietario puede leer (RLS)
- La URL ya está sanitizada antes de guardarse
- El `resume` verifica que el `user_id` del job coincida con el usuario autenticado
