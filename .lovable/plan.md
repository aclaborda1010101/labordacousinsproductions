# Plan de Implementación - COMPLETADO ✅

## Cambios Aplicados

### 1. ✅ Corregido DialogFooter y DialogHeader (Warning forwardRef)
**Archivo**: `src/components/ui/dialog.tsx`
- Actualizado `DialogHeader` y `DialogFooter` para usar `React.forwardRef`

### 2. ✅ Corregido RLS en generation_run_logs (Error INSERT)
**Migración aplicada**:
```sql
CREATE POLICY "Users can insert their own run logs"
ON public.generation_run_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

### 3. ✅ Mejorada detección de bloques pendientes
**Archivos modificados**:
- `src/components/project/ShowrunnerSurgeryDialog.tsx`: Ahora consulta directamente la BD al abrir el diálogo
- `src/hooks/useHasPendingSurgery.ts`: Nuevo hook para detectar cirugías pendientes

**Mejoras**:
- Consulta directa a `generation_blocks` más rápida y confiable
- Muestra toast prominente cuando hay cambios pendientes
- Navega automáticamente al paso `preview` con los resultados
