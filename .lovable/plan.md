
## Objetivo
Que la página **/script** nunca se vea “vacía” o muestre **“Script: no”** cuando **sí existe un guion** en el backend (como en tu proyecto), y que el usuario sea redirigido/ayudado a ver el **Guion Maestro** automáticamente.

## Lo que está pasando (diagnóstico)
- El backend **sí tiene** un registro en `scripts` para este proyecto (`status: completed`, `script_type: narrative_compiled`, `episodes_len: 1`, `raw_text` con contenido y `parsed_json` con personajes/localizaciones).
- Aun así, en la pestaña **Idea** se llega a ver el panel “Cargando datos del proyecto…” con badges tipo **Outline: ninguno / Script: no**, o la vista queda sin datos.
- Esto ocurre porque en `ScriptImport.tsx` el “estado de existencia de guion” depende de **estado local** (`generatedScript` y `scriptText`) que puede quedar **sin inicializar** o **desincronizado** (por ejemplo, si la hidratación falla, si hay un early-return, si se respeta un flag de “navegación del usuario” y no se auto-cambia a resumen, o si la UI está mostrando un estado “intermedio”).
- Además, `ScriptSummaryPanel.tsx` puede renderizar “nada” si detecta `episodes` vacío (tiene un `return null`), lo cual vuelve la pantalla literalmente en blanco en ciertos casos de datos incompletos o cuando se lee el script equivocado.

## Enfoque de solución (alto nivel)
1. **Separar “existe guion” de “guion hidratado en memoria”**:
   - “Existe guion” debe basarse en un fetch simple a `scripts` (si hay `id` del último script) y no depender de `generatedScript/scriptText`.
2. **Evitar pantallas en blanco**:
   - `ScriptSummaryPanel` no debe hacer `return null` cuando faltan episodios; debe mostrar un estado vacío con explicación y acciones (“Recargar”, “Compilar desde escenas”, etc.).
3. **Auto-navegación inteligente**:
   - Si hay un guion `completed` con contenido, la UI debe ofrecer (o hacer) salto automático a **Guion Maestro** aunque el usuario esté en “Idea”.
4. **Rehidratación confiable + Realtime**:
   - Cuando se actualice `scripts.updated_at` (por compilación o regeneración), refrescar el estado del frontend sin depender de polling parcial.

---

## Cambios propuestos (concretos)

### A) `src/components/project/ScriptImport.tsx` — “Single source of truth” para script
**Añadir un estado mínimo y robusto**, por ejemplo:
- `latestScriptRow` (id, status, script_type, updated_at, parsed_json, raw_text)
- `isLoadingLatestScript`
- `scriptExists` = `!!latestScriptRow?.id`
- `scriptHasContent` = `raw_text.length > 0 || episodes_len > 0`

**Ajustar `fetchData`**:
- Siempre setear `latestScriptRow` si la query devuelve un registro, aunque falle la hidratación.
- Envolver la hidratación (hydrateCharacters/Locations/etc.) en `try/catch`:
  - Si falla, igual setear un `generatedScript` mínimo (por ejemplo `generatedScript = parsed_json` sin counts extra) para que la UI no quede en “no hay script”.

**Corregir el panel de estado**:
- Cambiar `hasScript` para que use `scriptExists` (basado en DB) en lugar de `!!generatedScript || !!scriptText`.
  - Así nunca dirá “Script: no” si existe un registro en `scripts`.

**Auto-navegación**:
- Si `scriptHasContent === true` y el usuario está en la vista “Idea”, mostrar:
  - Banner: “Ya existe un guion generado para este proyecto.”
  - Botón principal: “Ver Guion Maestro”
  - Botón secundario: “Regenerar”
- Opcional (si lo prefieres): auto-cambiar a “Guion” solo la primera vez que detecta el script (sin pelear con navegación manual).

### B) `src/components/project/ScriptSummaryPanel.tsx` — Nunca renderizar “null”
Hoy:
- Si no hay `episodes`, hace `return null` (pantalla vacía).

Cambiar a:
- Si `episodes` vacío:
  - Mostrar Card con:
    - “No se encontró estructura de episodios en el guion guardado.”
    - Botones:
      - “Recargar”
      - “Compilar desde escenas” (si hay escenas)
      - “Ir a Guion”/“Ir a Producción” según corresponda
- Esto elimina el “vacío” aunque haya un caso raro de datos.

### C) Realtime / refresco automático al actualizar scripts
- En `ScriptImport.tsx`, suscribirse a cambios de `scripts` filtrados por `project_id`.
- Cuando llegue `UPDATE`/`INSERT`:
  - Re-ejecutar `fetchData`/`loadLatestScript`.
- Beneficio: si el guion se compila en background, la UI se actualiza sola.

### D) UX: evitar confusión entre “Idea” y “Guion”
En la pestaña “Idea”:
- Si `scriptHasContent`, cambiar el CTA primario:
  - En vez de “Generar Outline”, mostrar “Ver Guion Maestro” (y un botón secundario “Regenerar desde idea”).
- Esto hace que “no se vea vacío”: el usuario entiende que ya hay resultado y dónde está.

---

## Verificación (lo que probaré cuando implementemos)
1. Entrar a `/projects/:id/script` con guion ya compilado:
   - Debe mostrar “Script: sí” en el estado del proyecto.
   - Debe ofrecer “Ver Guion Maestro” sin quedarse en blanco.
2. Ir a “Guion”:
   - Debe cargar métricas y secciones sin necesitar refresh.
3. Forzar casos límite:
   - `scripts` existe pero `parsed_json.episodes` vacío → no debe quedar en blanco; debe aparecer el estado vacío con acciones.
4. Compilar/regenerar y observar:
   - Con la suscripción realtime, debe refrescarse solo.

---

## Archivos a tocar
- `src/components/project/ScriptImport.tsx` (lógica de carga + estado + banner/CTA + hasScript fiable + realtime)
- `src/components/project/ScriptSummaryPanel.tsx` (evitar `return null`, añadir empty state)
- (Opcional) `src/components/project/ProjectDataStatus.tsx` si hace falta ajustar copy/estados, pero idealmente bastará con pasar mejores props desde `ScriptImport`.

---

## Resultado esperado
- Nunca más verás “sigue vacío” en /script cuando el guion exista.
- El sistema mostrará correctamente que hay guion y te llevará al **Guion Maestro** con un click (o automáticamente).
- Incluso si algo falla en la estructura (episodios), habrá un mensaje claro y acciones para recuperar.