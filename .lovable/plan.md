
# Plan: Corregir Scroll en Ventana de Cirugia

## Problema Identificado

El componente `ScrollArea` en `ShowrunnerSurgeryDialog.tsx` no permite hacer scroll porque:

1. El `DialogContent` tiene `overflow-hidden` que corta el contenido
2. El `ScrollArea` usa `flex-1` pero le falta `min-h-0` para permitir que se encoja por debajo del tamano de su contenido (requerido en flexbox)
3. El viewport interno del ScrollArea necesita una altura definida para calcular el scroll

## Solucion

### Archivo: `src/components/project/ShowrunnerSurgeryDialog.tsx`

**Cambio en linea 526** - Agregar `min-h-0` al DialogContent para permitir que los hijos flex se encojan:

```tsx
// Antes:
<DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

// Despues:
<DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col min-h-0">
```

**Cambio en linea 537** - Agregar `min-h-0` y altura maxima al ScrollArea:

```tsx
// Antes:
<ScrollArea className="flex-1 pr-4">

// Despues:
<ScrollArea className="flex-1 min-h-0 pr-4">
```

## Explicacion Tecnica

En CSS Flexbox, los elementos hijos tienen `min-height: auto` por defecto, lo que significa que no pueden encogerse por debajo del tamano de su contenido. Agregar `min-h-0` (`min-height: 0`) permite que el ScrollArea se encoja al tamano disponible del contenedor y active su scroll interno.

El `overflow-hidden` en DialogContent esta bien porque evita scroll doble, pero necesitamos que el ScrollArea hijo tenga `min-h-0` para que respete la altura maxima del padre.

## Resultado Esperado

- El dialogo de Cirugia de Showrunner mostrara una barra de scroll vertical
- El usuario podra hacer scroll para ver todos los cambios propuestos (5 escenas)
- Los botones "Rechazar cambios" y "Aplicar cirugia" permaneceran fijos en la parte inferior
