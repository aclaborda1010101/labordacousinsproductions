
# Plan: Auto-aplicación Opcional en Cirugía de Showrunner

## Problema Identificado

El usuario ejecutó la cirugía exitosamente (hay 3 bloques `pending_approval` en la base de datos), pero nunca vio la pantalla de "Aplicar cambios" porque:

1. El diálogo se cerró durante el análisis
2. Al reabrir, la recuperación de resultados pendientes no funcionó correctamente
3. El flujo actual requiere siempre revisión manual

## Solución

Agregar un **checkbox de auto-aplicación** en la pantalla de configuración que:
- Permite al usuario elegir aplicar automáticamente cuando termine el análisis
- Evita pérdida de resultados por cerrar el diálogo
- Mantiene la opción de revisión manual para usuarios que lo prefieran

## Cambios Técnicos

### Archivo: `src/components/project/ShowrunnerSurgeryDialog.tsx`

#### 1. Nuevo estado para auto-aplicación

```typescript
const [autoApply, setAutoApply] = useState(false);
```

#### 2. Modificar la UI de configuración

Agregar checkbox debajo de los niveles de cirugía:

```tsx
<div className="flex items-center space-x-2 mt-4">
  <Checkbox 
    id="autoApply" 
    checked={autoApply} 
    onCheckedChange={(checked) => setAutoApply(checked === true)} 
  />
  <Label htmlFor="autoApply" className="text-sm cursor-pointer">
    Aplicar cambios automáticamente al finalizar
    <p className="text-xs text-muted-foreground">
      Los cambios se aplicarán sin revisión previa
    </p>
  </Label>
</div>
```

#### 3. Lógica de auto-aplicación

Cuando el polling detecta `pending_approval` y `autoApply` está activo:

```typescript
// En el polling callback, cuando status === 'pending_approval':
if (autoApply) {
  // Auto-aplicar sin mostrar preview
  setStep('applying');
  const applyResponse = await invokeAuthedFunction('apply-showrunner-surgery', {
    blockId: block.id,
    action: 'apply'
  });
  
  if (applyResponse.ok) {
    toast.success(`Cirugía aplicada automáticamente (v${applyResponse.newVersion})`);
    onSurgeryComplete?.(result);
    onOpenChange(false);
    resetDialog();
  } else {
    // Fallback a preview si falla
    setStep('preview');
    toast.error('Error auto-aplicando, revisa los cambios manualmente');
  }
} else {
  // Flujo normal: mostrar preview
  setStep('preview');
}
```

#### 4. También aplicar auto-apply a resultados pendientes recuperados

Cuando `checkForPendingSurgery` encuentra un resultado `pending_approval` y `autoApply` está activo:

```typescript
if (response.status === 'pending_approval' && response.sceneChanges) {
  // Si hay auto-apply configurado previamente, aplicar directamente
  // Por ahora, mostrar preview para que usuario decida
  setResult({...});
  setStep('preview');
  toast.info('Hay una cirugía pendiente de aprobar');
}
```

## Flujo Visual

```text
                          ┌─────────────────────┐
                          │   Configuración     │
                          │                     │
                          │ [x] Auto-aplicar    │
                          │                     │
                          │   [Analizar]        │
                          └─────────┬───────────┘
                                    │
                          ┌─────────▼───────────┐
                          │   Analizando...     │
                          │   [Barra progreso]  │
                          └─────────┬───────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               │                                         │
      Auto-apply ON                            Auto-apply OFF
               │                                         │
    ┌──────────▼──────────┐               ┌──────────────▼──────────────┐
    │   Aplicando...      │               │   Preview                   │
    │   (automático)      │               │   [Rechazar] [Aplicar]      │
    └──────────┬──────────┘               └─────────────────────────────┘
               │
    ┌──────────▼──────────┐
    │   Hecho!            │
    │   (cierra diálogo)  │
    └─────────────────────┘
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/project/ShowrunnerSurgeryDialog.tsx` | Estado `autoApply`, checkbox UI, lógica de auto-aplicación |

## Importación Adicional

```typescript
import { Checkbox } from '@/components/ui/checkbox';
```

## Beneficios

1. **Menos fricción**: Usuario que confía en el sistema puede dejar que aplique solo
2. **Resiliencia**: Si cierra el diálogo, al terminar igual se aplica
3. **Flexibilidad**: Mantiene opción de revisión para usuarios precavidos
4. **Recuperación**: Resultados pendientes se muestran para aplicación manual

## Consideración de UX

- El checkbox está **desactivado por defecto** para mantener el flujo de revisión como comportamiento predeterminado
- Se muestra una advertencia clara de que los cambios se aplicarán sin revisión
