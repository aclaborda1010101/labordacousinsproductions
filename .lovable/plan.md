
# Plan: Persistir la aprobación del outline en la base de datos

## Problema identificado

El botón **"Aprobar y Generar Guion"** en la pestaña Outline solo actualiza el estado local (`setOutlineApproved(true)`), pero **no guarda la aprobación en la base de datos**. 

Cuando navegas a otra pestaña y vuelves:
1. El componente se monta de nuevo
2. El `useEffect` de sincronización lee el estado desde la base de datos
3. La base de datos dice `status: 'completed'` (no `'approved'`)
4. El estado local se resetea a `outlineApproved = false`
5. Te pide aprobar de nuevo

## Solución

Modificar el botón para que use la función `outlinePersistence.approveOutline()` que ya existe y que guarda el estado `'approved'` en la tabla `project_outlines`.

---

## Cambios técnicos

### 1. Actualizar el handler del botón "Aprobar y Generar Guion"

**Archivo:** `src/components/project/ScriptImport.tsx`  
**Líneas:** 7746-7750

**Antes:**
```typescript
onClick={() => {
  setOutlineApproved(true);
  setActiveTab('summary');
  toast.success('Outline aprobado. Ahora puedes generar el guion completo.');
}}
```

**Después:**
```typescript
onClick={async () => {
  const success = await outlinePersistence.approveOutline();
  if (success) {
    setOutlineApproved(true);
    setActiveTab('summary');
    toast.success('Outline aprobado. Ahora puedes generar el guion completo.');
  } else {
    toast.error('Error al aprobar el outline');
  }
}}
```

### 2. Añadir estado de loading para feedback visual (opcional pero recomendado)

Para evitar doble-clicks y dar feedback al usuario:

```typescript
const [approvingOutline, setApprovingOutline] = useState(false);

// En el handler:
onClick={async () => {
  setApprovingOutline(true);
  try {
    const success = await outlinePersistence.approveOutline();
    if (success) {
      setOutlineApproved(true);
      setActiveTab('summary');
      toast.success('Outline aprobado. Ahora puedes generar el guion completo.');
    } else {
      toast.error('Error al aprobar el outline');
    }
  } finally {
    setApprovingOutline(false);
  }
}}
disabled={approvingOutline}
```

---

## Resultado esperado

Después de esta corrección:
1. Al hacer clic en "Aprobar y Generar Guion", se guarda `status: 'approved'` en la base de datos
2. Al navegar fuera y volver a la pestaña Guion, el `useEffect` lee `status: 'approved'` de la base de datos
3. El estado `outlineApproved` se mantiene en `true`
4. El wizard de preparación de guion aparece directamente sin pedir aprobar de nuevo

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/project/ScriptImport.tsx` | Actualizar handler del botón para llamar a `approveOutline()` |
