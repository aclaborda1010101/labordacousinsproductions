
# Plan: Persistencia del Estado de Clonación

## Problema Actual

El componente `DatabaseCloner.tsx` pierde el estado cuando:
1. Cambias de pestaña del navegador
2. Navegas a otra sección de la app
3. El componente se desmonta/remonta

Aunque el job está guardado en `background_tasks`, el frontend no sabe qué `jobId` debe consultar al volver.

## Solución: Reconexión Automática a Jobs Activos

### Cambio 1: Detectar jobs activos al montar el componente

Al cargar el componente, consultar `background_tasks` por cualquier job de clonación `running` del usuario actual:

```typescript
// En DatabaseCloner.tsx - nuevo useEffect al inicio
useEffect(() => {
  const checkActiveCloneJob = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    // Buscar job de clonación activo
    const { data: activeTask } = await supabase
      .from('background_tasks')
      .select('id, status, metadata, progress')
      .eq('user_id', user.id)
      .eq('type', 'clone_database')
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (activeTask) {
      // Reconectar al job activo
      setJobId(activeTask.id);
      setCloning(true);
      
      const progress = activeTask.metadata?.clone?.progress;
      if (progress) {
        setProgress(progress);
      }
      
      toast.info('Reconectado a clonación en progreso...');
    }
  };
  
  checkActiveCloneJob();
}, []);
```

### Cambio 2: Mostrar estado del job anterior (incluso si falló)

Permitir ver el último estado del job aunque haya fallado o esté estancado:

```typescript
// También verificar jobs recientes (últimas 2 horas) que no estén completados
const { data: recentTask } = await supabase
  .from('background_tasks')
  .select('id, status, metadata, progress, updated_at')
  .eq('user_id', user.id)
  .eq('type', 'clone_database')
  .in('status', ['running', 'failed'])
  .gte('updated_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```

### Cambio 3: Agregar botón "Reintentar/Limpiar y Clonar"

Cuando hay un job anterior incompleto, mostrar opciones:

| Estado del Job | Acción Disponible |
|----------------|-------------------|
| `running` (pero estancado) | "Reconectar" o "Cancelar y Reiniciar" |
| `failed` | "Limpiar destino y Reintentar" |
| `completed` | "Nueva Clonación" |

### Cambio 4: Edge Function - Limpiar esquema antes de clonar

Agregar opción `cleanTarget: true` que ejecute:

```sql
-- Eliminar todas las tablas del schema public antes de clonar
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

Esto garantiza que no haya datos duplicados ni conflictos.

## Cambios en Archivos

| Archivo | Descripción |
|---------|-------------|
| `src/components/project/DatabaseCloner.tsx` | Agregar reconexión automática, mostrar estado previo, botón de limpieza |
| `supabase/functions/clone-database/index.ts` | Agregar acción `clean` para limpiar destino antes de clonar |

## Flujo de Usuario Mejorado

```text
Usuario abre DatabaseCloner
         ↓
useEffect busca jobs activos/recientes
         ↓
┌─────────────────────────────────────────┐
│ Job encontrado?                          │
├────────────┬────────────────────────────┤
│ running    │ Reconectar automáticamente │
│            │ Mostrar progreso actual    │
├────────────┼────────────────────────────┤
│ failed     │ Mostrar error + botón      │
│            │ "Limpiar y Reintentar"     │
├────────────┼────────────────────────────┤
│ Ninguno    │ Mostrar UI normal          │
└────────────┴────────────────────────────┘
```

## Respuesta a tu Pregunta Inmediata

**¿Qué hacer ahora?**

1. **No inicies otra clonación todavía** - la base destino tiene datos parciales
2. Voy a implementar la función de "Limpiar destino" que:
   - Borra todas las tablas del proyecto destino
   - Inicia la clonación desde cero
3. También agregaré la reconexión automática para que no pierdas el progreso al cambiar de pestaña

## Detalles Técnicos

### Reconexión al Job Activo

El componente verificará `background_tasks` al montarse y se reconectará automáticamente si encuentra un job `running`.

### Limpieza del Destino

La Edge Function tendrá una nueva acción `clean` que ejecuta `DROP SCHEMA public CASCADE` en el destino antes de empezar a copiar, eliminando cualquier dato parcial anterior.

### Manejo de Cold Starts

El job ya está persistido en la base de datos. El problema es que la **ejecución** se interrumpe cuando la Edge Function tiene cold start. Esto es una limitación de las Edge Functions para procesos largos. La solución completa requeriría:

1. Dividir el trabajo en chunks más pequeños
2. Implementar un sistema de "resume" desde el último punto guardado
3. O usar un enfoque diferente (pg_dump/pg_restore manual)

Por ahora, la limpieza + reintento es la solución más práctica.
