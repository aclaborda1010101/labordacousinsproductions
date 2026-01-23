
## Objetivo
Que al salir del Outline y volver, se sigan viendo **Threads/Tramas** y **Carne Operativa (reglas/facciones/setpieces/turning points)** exactamente como quedaron guardadas, sin “desaparecer” hasta que vuelves a “generar”.

---

## Diagnóstico (por qué pasa lo raro)
Por lo que se ve en el código actual, hay dos causas probables y compatibles con tu síntoma (“no se ve guardado”, pero al generar lo hace al momento):

1) **Sí está guardado en el backend, pero la UI se rehidrata con una versión “reconstruida” que pisa campos enriquecidos**  
En `useOutlinePersistence.loadOutline()` hay una lógica que, cuando detecta que el `outline_json` está “vacío” o “necesita enriquecimiento”, **reconstruye** `outlineJson` a partir de `outline_parts.film_scaffold` y acts, pero lo hace con una asignación del estilo:
- `outlineJson = { ...(scaffold), main_characters, main_locations, beats, ... }`
Esto **no mezcla** de forma segura con el `outline_json` original, y puede **perder campos** como:
- `threads`, `episode_beats`
- `entity_rules` (reglas operativas / carne operativa)
- `factions`, `turning_points`, `setpieces`, etc.

Resultado: al volver a entrar, la UI te muestra un `outline_json` “limpio” (sin carne/threads), aunque el backend todavía tenga esos datos (y por eso “generar” va instantáneo).

2) **`ScriptImport.tsx` solo sincroniza `lightOutline` una vez**  
En `ScriptImport.tsx` hay un `useEffect` que solo hace `setLightOutline(...)` si `!lightOutline`. Si por timing/estado la UI ya tiene algo (aunque sea viejo), puede quedar “pegada” a ese snapshot y no reflejar el outline más reciente.

---

## Qué vamos a cambiar (solución)
### A) Arreglar la reconstrucción para que NO borre “Carne Operativa” ni “Threads”
En `src/hooks/useOutlinePersistence.ts`, en el bloque “Reconstructing outline_json from outline_parts”, vamos a:
- **Conservar el `outline_json` original** y solo “rellenar huecos” con scaffold/acts.
- Hacer un merge seguro tipo:
  - Mantener primero lo enriquecido (threads, entity_rules, etc.)
  - Completar `main_characters`, `main_locations`, `beats`, `acts_summary` desde scaffold si faltan
- En vez de reemplazar todo el objeto, construiremos algo como:
  - `outlineJson = { ...outlineJson, ...(scaffold ?? {}), main_characters: ..., main_locations: ..., beats: ..., acts_summary: ... }`
  - Ajustando el orden para que **no pise** arrays/objetos enriquecidos si ya existen.

Criterios concretos:
- Si `outlineJson.threads` ya existe, no tocarlo.
- Si `outlineJson.entity_rules` ya existe, no tocarlo.
- Si `outlineJson.factions` ya existe, no tocarlo.
- Solo “reparar” lo mínimo necesario para que el UI tenga personajes/locaciones/acts coherentes.

### B) Re-sincronizar el Outline UI cuando cambia el Outline guardado
En `src/components/project/ScriptImport.tsx`, vamos a:
- Añadir una sincronización que observe `outlinePersistence.savedOutline?.updated_at` (o `id`) y cuando cambie:
  - actualice `lightOutline` si el outline del backend es más nuevo que el que se está mostrando.
- Mantener el “anti-flicker” (lastStableOutlineRef) pero evitando que se quede mostrando una versión vieja.

Esto hace que:
- Al volver a entrar al Outline, se pinte lo guardado real.
- Tras “Carne Op.” o “Threads”, aunque haya latencia, el refresco termine reflejándose.

---

## Cómo lo probaremos (pasos de verificación)
1) En un proyecto con Outline ya enriquecido:
   - Verificar que aparecen `Threads/Tramas` y `Reglas Operativas/Facciones`.
2) Cambiar de pestaña/ruta (salir del Outline) y volver:
   - Confirmar que **siguen visibles** sin tocar “Generar”.
3) Ejecutar “Carne Op.” y “Threads”:
   - Confirmar que tras terminar, si navegas fuera y vuelves, se mantiene.
4) Caso borde: outline_parts existe y main_characters está vacío:
   - Confirmar que aún reconstruye personajes/locaciones, pero **no borra** threads/reglas.

---

## Impacto esperado
- Se elimina el efecto “parece que no guardó”.
- El botón de generar seguirá funcionando igual, pero ya no será el “trigger” que te hace reaparecer datos.
- Menos confusión y menos riesgo de regenerar innecesariamente.

---

## Archivos a tocar
- `src/hooks/useOutlinePersistence.ts` (merge seguro al reconstruir)
- `src/components/project/ScriptImport.tsx` (sincronización por `updated_at` / outline change)

---

## Riesgos y mitigación
- Riesgo: merge “malo” podría mezclar estructuras antiguas.
  - Mitigación: merge selectivo (solo completar campos faltantes; no sobreescribir enriquecidos).
- Riesgo: re-render extra por re-sincronización.
  - Mitigación: comparar `updated_at` y solo actualizar si es más nuevo.

---

## Sugerencias de siguientes mejoras (opcionales)
1) Añadir un indicador “Guardado en backend: hh:mm:ss” en el panel del Outline para que siempre sepas si estás viendo lo último.
2) Botón “Refrescar Outline” visible (sin generar) para forzar reload.
3) Historial/Versionado del Outline (ver cambios de carne/threads).
4) Aviso si estás viendo un “snapshot reconstruido” (modo recovery) vs outline completo.
5) Tests Playwright: “enrich -> navegar -> volver -> datos siguen”.
