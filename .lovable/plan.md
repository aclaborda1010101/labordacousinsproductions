
# Plan: Refrescar Outline Después de Expansión y Materialización

## Problema Identificado

Después de expandir beats a escenas:
1. El outline JSON se actualiza en la base de datos (status = 'completed')
2. Las escenas se materializan en la tabla `scenes`
3. **PERO** la validación usa el `outline` viejo en memoria del componente

```text
┌─────────────────────────────────────────────────────────────────┐
│  FLUJO ACTUAL (ROTO)                                            │
├─────────────────────────────────────────────────────────────────┤
│  1. expand-beats-to-scenes → DB: outline actualizado            │
│  2. materialize-scenes → DB: 34 escenas insertadas              │
│  3. validateDensity(oldOutline) → Usa memoria vieja             │
│     ✗ oldOutline no tiene episode_beats[0].scenes               │
│     ✗ Sigue mostrando "necesita expansión"                      │
└─────────────────────────────────────────────────────────────────┘
```

## Solución

Modificar `PreScriptWizard.tsx` para refrescar el outline desde la base de datos después de una expansión exitosa:

```text
┌─────────────────────────────────────────────────────────────────┐
│  FLUJO CORREGIDO                                                │
├─────────────────────────────────────────────────────────────────┤
│  1. expand-beats-to-scenes → DB actualizado                     │
│  2. materialize-scenes → 34 escenas insertadas                  │
│  3. NUEVO: Refetch outline from DB                              │
│  4. validateDensity(newOutline) → Encuentra 34 escenas          │
│     ✓ Validación pasa                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Cambios Técnicos

### 1. Añadir callback para refrescar outline

En `PreScriptWizard.tsx`, añadir prop `onOutlineRefresh`:

```typescript
interface PreScriptWizardProps {
  projectId: string;
  outline: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  inline?: boolean;
  onScriptCompiled?: (scriptData: any) => void;
  language?: string;
  onOutlineRefresh?: () => Promise<void>; // NUEVO
}
```

### 2. Modificar el handler del botón "Expandir"

```typescript
<Button 
  onClick={async () => {
    const profile = outline?.density_profile || 'standard';
    const result = await expandBeatsToScenes(projectId, durationMin, profile);
    if (result.success) {
      // NUEVO: Refrescar outline desde la base de datos
      if (onOutlineRefresh) {
        await onOutlineRefresh();
      }
      
      // Ahora la validación usará el outline actualizado
      // (que llegará como nuevo prop en el siguiente render)
      setDensityValidated(false);
      setTimeout(() => setDensityValidated(true), 100);
    }
  }}
  disabled={isExpanding}
>
```

### 3. Alternativa: Validar directamente desde la DB

Si no hay callback disponible, modificar `expandBeatsToScenes` para devolver el outline actualizado:

```typescript
// En useSceneDensityValidation.ts
const expandBeatsToScenes = useCallback(async (
  projectId: string,
  durationMin: number,
  densityProfile: string = 'standard'
): Promise<{ 
  success: boolean; 
  scenesCount: number; 
  error?: string;
  updatedOutline?: any; // NUEVO: Devolver outline actualizado
}> => {
  // ... después de materializar...
  
  // Fetch el outline actualizado desde la DB
  const { data: refreshedOutline } = await supabase
    .from('project_outlines')
    .select('outline_json')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    success: true,
    scenesCount: finalCount,
    updatedOutline: refreshedOutline?.outline_json,
  };
}, []);
```

### 4. Usar el outline actualizado para re-validar

```typescript
// En PreScriptWizard.tsx
const result = await expandBeatsToScenes(projectId, durationMin, profile);
if (result.success && result.updatedOutline) {
  // Re-validar con el outline actualizado
  const newResult = validateDensity(result.updatedOutline, format, durationMin, profile);
  // Esto ahora encontrará las escenas expandidas
}
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useSceneDensityValidation.ts` | Devolver outline actualizado en `expandBeatsToScenes` |
| `src/components/project/PreScriptWizard.tsx` | Usar outline actualizado para re-validar |

## Resultado Esperado

1. Usuario hace clic en "Expandir a 26-45 Escenas"
2. Sistema genera 34 escenas y las materializa
3. Sistema obtiene el outline actualizado de la DB
4. Validación encuentra 34 escenas en `episode_beats[0].scenes`
5. UI muestra "Densidad correcta: 34 escenas" (checkbox verde)
6. Usuario puede continuar al siguiente paso
