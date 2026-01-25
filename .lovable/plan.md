
# Plan: Corregir Error al Aplicar Cirugía

## Problema Identificado

El error "Error aplicando la cirugía" aparece aunque el backend funciona correctamente. La respuesta del servidor es exitosa:
```json
{"ok":true,"scriptUpdated":true,"action":"applied","newVersion":2}
```

**Causa Raíz**: La función `invokeAuthedFunction` devuelve la estructura estándar de Supabase:
```typescript
{ data: { ok: true, ... }, error: null }
```

Pero el código en `handleApply` accede incorrectamente a la respuesta:
```typescript
// INCORRECTO (actual)
if (!response.ok) { ... }  // response.ok es undefined

// CORRECTO
if (response.error || !response.data?.ok) { ... }
```

---

## Cambios Propuestos

### Archivo: `src/components/project/ShowrunnerSurgeryDialog.tsx`

**Líneas 437-459** - Corregir `handleApply`:

```typescript
const handleApply = async () => {
  if (!result?.blockId) {
    toast.error('No hay resultado para aplicar');
    return;
  }

  setStep('applying');
  
  try {
    const { data, error } = await invokeAuthedFunction('apply-showrunner-surgery', {
      blockId: result.blockId,
      action: 'apply'
    });

    if (error || !data?.ok) {
      throw new Error(data?.error || error?.message || 'Error aplicando la cirugía');
    }

    if (onSurgeryComplete) {
      onSurgeryComplete(result);
    }
    
    toast.success(`Cirugía aplicada (v${data.newVersion})`);
    onOpenChange(false);
    resetDialog();
    
  } catch (error) {
    console.error('Apply error:', error);
    toast.error('Error al aplicar la cirugía');
    setStep('preview');
  }
};
```

**Líneas 469-473** - También corregir `handleReject` para mejor manejo de errores:

```typescript
const { error } = await invokeAuthedFunction('apply-showrunner-surgery', {
  blockId: result.blockId,
  action: 'reject'
});
if (error) {
  console.error('Reject error:', error);
}
toast.info('Cirugía rechazada');
```

---

## Resumen de Cambios

| Función | Problema | Solución |
|---------|----------|----------|
| `handleApply` | Accede a `response.ok` en vez de `response.data.ok` | Desestructurar `{ data, error }` y usar `data.ok` |
| `handleReject` | No verifica errores de la respuesta | Desestructurar y verificar `error` |

---

## Resultado Esperado

- Al hacer clic en "Aplicar cirugía", se aplicará correctamente y mostrará el toast de éxito
- El diálogo se cerrará automáticamente
- La versión del script se actualizará (v2, v3, etc.)
- El callback `onSurgeryComplete` se ejecutará para refrescar el script en la UI
