
## ✅ IMPLEMENTADO: Clonación step-based con monitorización en tiempo real

### Cambios realizados

#### 1) Backend: `supabase/functions/clone-database/index.ts`
- ✅ Nuevo `action: 'step'` que ejecuta un tramo de ~15s máx y devuelve `{ needsMore: true/false }`
- ✅ `start` ya no ejecuta en background, solo crea el job
- ✅ `resume` solo valida y marca running, no ejecuta
- ✅ Conteos de tablas (`tableCounts`, `totalRows`) cacheados en checkpoint tras primer cálculo
- ✅ `currentItem` actualizado al completar/iniciar tablas
- ✅ `background_tasks` EXCLUIDO de TABLES_ORDER (seguridad)
- ✅ `targetUrl` se limpia (null) al finalizar o cancelar

#### 2) Frontend: `src/components/project/DatabaseCloner.tsx`
- ✅ Runner secuencial basado en `step` (no polling pasivo)
- ✅ `isSteppingRef` evita dobles ejecuciones
- ✅ `abortRef` para cancelar limpiamente
- ✅ Indicador "Última actualización: hace Xs"
- ✅ Indicador "Ejecutando paso..." con icono Activity pulsante
- ✅ Reanudar = iniciar runner con job existente

### Cómo probar

1. **Reanudar job anterior**: Ir a Project Settings → Clonador → "Reanudar desde aquí"
   - Verás que continúa desde `storyboard_panels` hacia `generation_runs`, etc.

2. **Nueva clonación**: "Limpiar y empezar de cero" o ingresar URL y "Iniciar Clonación"
   - Monitorización en tiempo real: verás cada paso avanzar sin quedarse atascado.

### Arquitectura final

```
┌─────────────┐      step       ┌─────────────┐
│  Frontend   │ ───────────────▶│   Backend   │
│  (runner)   │◀─────────────── │ (15s budget)│
└─────────────┘  { needsMore }  └─────────────┘
      │                               │
      │ loop while needsMore          │ persiste checkpoint
      ▼                               ▼
  actualiza UI                  avanza clonación
```
