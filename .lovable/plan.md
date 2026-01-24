
# Plan: Mejora de Timeout y Persistencia para Cirugía de Showrunner

## Problema Identificado

La ejecución anterior de `showrunner-surgery` completó exitosamente (147 segundos, status 200), pero el resultado no se guardó porque:
1. El frontend tiene un timeout más corto que la operación
2. El workflow actual requiere que el usuario apruebe manualmente en el dialog
3. Si el dialog pierde la conexión, los cambios se pierden

## Solución Propuesta

### 1. Persistencia Automática del Resultado

Modificar `showrunner-surgery` para guardar automáticamente el resultado en la base de datos antes de devolver la respuesta:

| Tabla | Campo | Contenido |
|-------|-------|-----------|
| `generation_blocks` | `block_type` | `'showrunner_surgery'` |
| `generation_blocks` | `output_data` | JSON completo con scene_changes, checklist |
| `generation_blocks` | `status` | `'pending_approval'` |

### 2. Polling en el Frontend

Cambiar `ShowrunnerSurgeryDialog.tsx` para usar polling en lugar de esperar la respuesta directa:

```text
1. Usuario hace clic en "Analizar"
2. Edge function inicia, devuelve inmediatamente un `job_id`
3. Frontend hace polling cada 5s a generation_blocks
4. Cuando status = 'pending_approval', muestra preview
5. Usuario aprueba -> status = 'applied'
```

### 3. Nuevo Endpoint: Aplicar Cirugía

Crear función separada para aplicar los cambios aprobados al script:

- `apply-showrunner-surgery`: Toma el `block_id` y actualiza `scripts.parsed_json`

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/showrunner-surgery/index.ts` | Guardar resultado en DB antes de responder |
| `src/components/project/ShowrunnerSurgeryDialog.tsx` | Implementar polling + recuperar resultados previos |
| (nuevo) `supabase/functions/apply-showrunner-surgery/index.ts` | Aplicar cambios aprobados al script |

## Flujo Mejorado

```text
+------------------+     +----------------------+     +--------------------+
|  Click Analizar  | --> | showrunner-surgery   | --> | generation_blocks  |
|                  |     | (guarda en DB)       |     | status: pending    |
+------------------+     +----------------------+     +--------------------+
                                                              |
        +-----------------------------------------------------+
        |
        v
+------------------+     +--------------------+     +------------------+
|  Polling cada 5s | --> | Lee generation_    | --> | Muestra Preview  |
|  (hasta 5 min)   |     | blocks             |     | en Dialog        |
+------------------+     +--------------------+     +------------------+
                                                              |
        +-----------------------------------------------------+
        |
        v
+------------------+     +----------------------+     +------------------+
|  Click Aplicar   | --> | apply-showrunner-    | --> | scripts.parsed   |
|                  |     | surgery              |     | actualizado      |
+------------------+     +----------------------+     +------------------+
```

## Beneficios

1. **Sin pérdida de trabajo**: Resultado guardado aunque el browser se cierre
2. **Recuperación**: Usuario puede volver y ver resultados pendientes
3. **UX mejorada**: Progreso visible con mensaje claro de espera
4. **Robusto**: Timeout de 5 minutos con feedback al usuario

## Seccion Tecnica

### Timeout Configuration

```typescript
// ShowrunnerSurgeryDialog.tsx
const POLL_INTERVAL_MS = 5000;  // 5 segundos
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;  // 5 minutos max
```

### Nuevo Schema para generation_blocks

```typescript
interface SurgeryBlock {
  block_type: 'showrunner_surgery';
  status: 'processing' | 'pending_approval' | 'applied' | 'rejected';
  input_context: {
    script_id: string;
    surgery_level: 'light' | 'standard' | 'aggressive';
  };
  output_data: {
    scene_changes: SceneChange[];
    rewritten_script: any;
    dramaturgy_checklist: DramaturgChecklist;
    stats: SurgeryStats;
  };
}
```

### Endpoint apply-showrunner-surgery

```typescript
// Request
{ blockId: string; action: 'apply' | 'reject' }

// Response
{ 
  ok: boolean; 
  scriptUpdated: boolean;
  previousVersionId?: string;  // Para historial
}
```

## Resultado Esperado

1. Usuario puede ejecutar la cirugía sin preocuparse por timeouts
2. Si cierra el browser, puede volver y ver resultados pendientes
3. Aplicar o rechazar cambios con confianza de que no se perderan
4. Historial del script preserva version anterior

