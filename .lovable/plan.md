
# Plan: Mejorar UI de Progreso en Cirugía de Showrunner

## Problema Identificado

El reloj de la cirugía no avanza porque:
1. El timer solo se inicia después de recibir la respuesta HTTP inicial (cuando empieza el polling)
2. Durante la llamada inicial al edge function (10-30 segundos), el reloj queda en `0:00`
3. La UI actual solo muestra un contador numérico, que no transmite bien el progreso en operaciones largas

## Solución Propuesta

### 1. Iniciar Timer Inmediatamente

Mover el inicio del timer al momento en que el usuario hace clic en "Analizar", no cuando empieza el polling.

| Momento | Antes | Después |
|---------|-------|---------|
| Click "Analizar" | Timer parado | Timer arranca |
| Respuesta HTTP | Timer arranca (polling) | Timer sigue corriendo |
| Resultado listo | Timer para | Timer para |

### 2. Agregar Barra de Progreso Visual

Añadir un componente `Progress` que muestre el avance estimado basándose en el tiempo transcurrido vs tiempo máximo (5 minutos).

- **0-60s**: Progreso 0-33% - "Analizando estructura..."
- **60-120s**: Progreso 33-66% - "Aplicando reglas dramatúrgicas..."
- **120-180s**: Progreso 66-90% - "Refinando cambios..."
- **180s+**: Progreso 90-99% - "Finalizando análisis..."

### 3. Mensajes de Estado Dinámicos

Mostrar mensajes que cambian según el tiempo transcurrido para dar feedback visual de que algo está pasando.

## Cambios Técnicos

### Archivo: `src/components/project/ShowrunnerSurgeryDialog.tsx`

**Importar componente Progress:**
```tsx
import { Progress } from '@/components/ui/progress';
```

**Modificar `handleAnalyze`:**
```tsx
const handleAnalyze = async () => {
  setStep('analyzing');
  setElapsedSeconds(0);
  
  // NUEVO: Iniciar timer inmediatamente
  pollStartTimeRef.current = Date.now();
  timerIntervalRef.current = window.setInterval(() => {
    setElapsedSeconds(Math.floor((Date.now() - pollStartTimeRef.current) / 1000));
  }, 1000);
  
  try {
    const response = await invokeAuthedFunction(...);
    // resto del código...
  }
};
```

**Nueva función para calcular progreso estimado:**
```tsx
const getProgressInfo = (seconds: number) => {
  const maxSeconds = MAX_POLL_DURATION_MS / 1000; // 300s
  const progress = Math.min((seconds / maxSeconds) * 100, 99);
  
  let message = "Analizando estructura del guion...";
  if (seconds > 60) message = "Aplicando reglas dramatúrgicas...";
  if (seconds > 120) message = "Refinando cambios propuestos...";
  if (seconds > 180) message = "Finalizando análisis...";
  
  return { progress, message };
};
```

**UI mejorada para paso `analyzing`:**
```tsx
{step === 'analyzing' && (
  <div className="flex flex-col items-center justify-center py-12">
    <Loader2 className="h-12 w-12 animate-spin text-amber-500 mb-4" />
    <p className="text-lg font-medium">Analizando guion...</p>
    <p className="text-sm text-muted-foreground mb-4">
      {getProgressInfo(elapsedSeconds).message}
    </p>
    
    {/* Barra de progreso */}
    <div className="w-full max-w-xs mb-4">
      <Progress 
        value={getProgressInfo(elapsedSeconds).progress} 
        className="h-2"
      />
    </div>
    
    {/* Timer */}
    <div className="flex items-center gap-2 text-muted-foreground">
      <Clock className="h-4 w-4" />
      <span className="text-sm font-mono">{formatTime(elapsedSeconds)}</span>
      <span className="text-xs">/ 5:00 máx</span>
    </div>
    
    <p className="text-xs text-muted-foreground mt-4 text-center max-w-sm">
      El resultado se guarda automáticamente. Puedes cerrar este diálogo y volver más tarde.
    </p>
  </div>
)}
```

## Resultado Visual Esperado

```
        [Spinner girando]
      
      Analizando guion...
  Aplicando reglas dramatúrgicas...
      
  [████████████░░░░░░░░░] 58%
      
        🕐 1:45 / 5:00 máx
      
  El resultado se guarda automáticamente...
```

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/project/ShowrunnerSurgeryDialog.tsx` | Timer inmediato + Progress bar + Mensajes dinámicos |

## Beneficios

1. **Feedback inmediato**: El reloj arranca desde el primer click
2. **Progreso visual**: Barra que avanza da confianza de que algo pasa
3. **Mensajes dinámicos**: Texto que cambia indica etapas del proceso
4. **Tiempo límite visible**: Usuario sabe cuánto falta para timeout
