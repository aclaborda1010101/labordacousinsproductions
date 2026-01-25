
# Plan de Implementación

## Problemas a resolver

1. **Ventana de aprobación no aparece**: Necesitamos asegurar que cuando hay bloques pendientes, el usuario sea notificado y pueda acceder al preview de aprobacion
2. **Warning forwardRef en DialogFooter/DialogHeader**: Actualizar estos componentes para usar `React.forwardRef`
3. **Error RLS en generation_run_logs**: Agregar politica INSERT para usuarios autenticados

---

## Cambios Propuestos

### 1. Corregir DialogFooter y DialogHeader (Warning forwardRef)

**Archivo**: `src/components/ui/dialog.tsx`

Actualizar `DialogHeader` y `DialogFooter` para usar `React.forwardRef`:

```tsx
const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
));
DialogHeader.displayName = "DialogHeader";

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
));
DialogFooter.displayName = "DialogFooter";
```

---

### 2. Corregir RLS en generation_run_logs (Error INSERT)

**Accion**: Migracion de base de datos

Agregar politica que permita a usuarios autenticados insertar sus propios logs:

```sql
CREATE POLICY "Users can insert their own run logs"
ON public.generation_run_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

Esta politica:
- Permite INSERT solo a usuarios autenticados
- Verifica que el `user_id` del log coincida con el usuario autenticado
- Mantiene la seguridad: usuarios solo pueden insertar logs propios

---

### 3. Mejorar deteccion de bloques pendientes en la UI

**Archivo**: `src/components/project/ShowrunnerSurgeryDialog.tsx`

Actualmente el dialogo solo verifica bloques pendientes cuando esta abierto. Hay dos opciones:

**Opcion A (Recomendada)**: Agregar indicador visual en el boton que abre el dialogo
- El componente padre que renderiza el boton de "Cirugia Showrunner" deberia consultar si hay bloques pendientes
- Mostrar un badge o indicador en el boton

**Opcion B**: Forzar apertura del dialogo si hay pendientes al cargar la pagina de script
- Auto-abrir el dialogo con el resultado pendiente

Para esta implementacion, mejorare la logica en `checkForPendingSurgery` para que muestre un toast mas prominente cuando encuentra resultados pendientes, y agregare un hook que el componente padre pueda usar.

**Cambios especificos**:

1. Exportar una funcion/hook `useHasPendingSurgery(projectId, scriptId)` que retorna si hay bloques pendientes
2. Modificar el componente que renderiza el boton de cirugia para mostrar un badge "Pendiente" 
3. Cuando el dialogo detecta un resultado pendiente, mostrar directamente el paso `preview` con los resultados

---

## Secuencia de Implementacion

1. **Migracion DB**: Crear politica RLS para INSERT en generation_run_logs
2. **dialog.tsx**: Actualizar DialogHeader y DialogFooter con forwardRef
3. **ShowrunnerSurgeryDialog.tsx**: Mejorar la deteccion y mostrar resultados pendientes automaticamente

---

## Verificacion

Despues de los cambios:
- El warning de forwardRef desaparecera de la consola
- Los logs de telemetria se guardaran correctamente (sin error RLS)
- Al abrir el dialogo de Cirugia, si hay resultado pendiente, se mostrara directamente la vista de preview con los cambios propuestos

---

## Detalle Tecnico: Estado actual de bloques pendientes

| Block ID | Status | Creado | Escenas | Dialogos | Consecuencias |
|----------|--------|--------|---------|----------|---------------|
| d93a78d9... | pending_approval | 25 Jan 18:52 | 5 | 145 | 2 |
| c662e067... | pending_approval | 25 Jan 18:49 | 5 | 130 | 1 |
| 320fafc4... | pending_approval | 24 Jan 14:03 | 5 | 153 | 1 |
| ... | ... | ... | ... | ... | ... |

Hay 9 bloques pendientes en total. Se recomienda limpiar los antiguos y conservar solo el mas reciente despues de aplicar o rechazar.
