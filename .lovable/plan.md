
## Qué está pasando (diagnóstico real del “atasco”)

Lo que ves como “atascado en `Copiando: storyboard_panels (48/48) (707/2431)`” en realidad no significa que `storyboard_panels` falle:

- En tu base actual, `storyboard_panels` tiene **48 filas** (y el clonador llega a **48/48**, o sea, termina esa tabla).
- El `707/2431` es el **progreso total (todas las tablas sumadas)**, no solo storyboard.
- El job queda con `status=running`, pero **deja de actualizarse** (stale). Eso indica que el proceso backend **se corta por límite de ejecución** antes de seguir con las siguientes tablas (las que vienen después: `generation_runs`, `generation_blocks`, `generation_logs`, etc.).

Causa raíz técnica:
- Ahora mismo la clonación se dispara en modo “fire-and-forget” (no bloqueante): `cloneDatabase(...).catch(...)` y la función responde al navegador.
- En este tipo de runtime, cuando la request termina, **no es confiable que el trabajo siga corriendo**; suele apagarse cerca del límite (30–60s). Por eso “siempre muere” alrededor del mismo punto.

## Objetivo

Que podamos “hacerlo otra vez y monitorizar en tiempo real”, pero de forma robusta:
- La clonación avanzará en **pasos cortos** (step-based).
- Cada paso dura poco y **siempre termina dentro del tiempo permitido**.
- La UI dispara el siguiente paso automáticamente mientras estés en la pantalla (monitor en vivo).
- Si se interrumpe, al volver puedes reanudar sin perder progreso.

---

## Solución propuesta (cambio de arquitectura): clonación por “steps” con runner en el frontend

### 1) Backend: convertir `clone-database` en un motor “step-based”
**Archivo:** `supabase/functions/clone-database/index.ts`

#### 1.1. Nuevo action: `step`
- `step` hace “un tramo” de clonación (por ejemplo, 10–20 segundos de trabajo máximo), persiste checkpoint y devuelve respuesta.
- La UI lo llamará repetidamente hasta terminar.

**Idea clave:** dentro de todos los bucles (fases, tablas, chunks, filas) añadiremos un control de tiempo:
- `deadline = Date.now() + TIME_BUDGET_MS`
- Si `Date.now() > deadline`: persistir estado y **salir limpiamente** devolviendo `{ ok:true, progress, checkpoint, needsMore:true }`.

#### 1.2. `start` y `resume` dejan de lanzar clonación en “background”
- `start` solo crea el job (y guarda targetUrl/options/checkpoint como hoy).
- `resume` solo valida, marca `status=running` si hace falta, y devuelve OK.
- El avance real lo hace `step`.

Esto elimina el comportamiento actual que depende de que el runtime “deje vivir” tareas después de responder.

#### 1.3. Optimización importante: no recalcular conteos cada vez
Hoy, cada arranque entra a “Data” y hace `COUNT(*)` de muchas tablas. Eso consume segundos valiosos.
- En el primer `step` que entra a fase `data`, calculamos y guardamos `tableCounts` (y `totalRows`) en metadata.
- En steps siguientes reutilizamos esos conteos.

(Esto mejora mucho la consistencia y hace que los steps rindan).

#### 1.4. Ajuste de UI/estado para evitar “parece que se quedó ahí”
Actualmente al terminar una tabla haces `persist(true)` pero no cambias `job.currentItem`, entonces queda “pegado” al último texto aunque ya pasó.
- Al completar una tabla, actualizar `job.currentItem = 'Tabla completada: X, continuando...'` antes de persistir.
- Al iniciar la siguiente tabla, actualizar a `Copiando: next_table (0/N)`.

#### 1.5. Seguridad: NO clonar `background_tasks` (y sanitizar targetUrl al final)
Ahora mismo `TABLES_ORDER` incluye `background_tasks`. Eso es peligroso porque:
- `background_tasks.metadata.clone.targetUrl` contiene una connection string con contraseña.
- Si clonas `background_tasks`, estarías copiando esa URL sensible al proyecto destino.

Acciones:
- Excluir `background_tasks` del copiado de datos y de verificación (y opcionalmente también de RLS enable).
- Al finalizar el job (`done`), borrar o nullear `metadata.clone.targetUrl` del job para no dejar la URL guardada más tiempo del necesario.

---

### 2) Frontend: “Monitor en tiempo real” llamando `step` en bucle controlado
**Archivo:** `src/components/project/DatabaseCloner.tsx`

#### 2.1. Reemplazar el polling pasivo por un “runner” activo
Ahora:
- La UI hace `status` cada 2s y espera que el backend avance solo.

Nuevo:
- La UI ejecuta un bucle secuencial:
  1) llama `step`
  2) actualiza `progress`
  3) si `needsMore`, espera un pequeño delay (p.ej. 300–800ms) y repite
  4) si `done/error/cancelled`, termina

Importante: que sea **secuencial**, no setInterval, para no solapar requests.
- Usar `useRef` tipo `isSteppingRef` para evitar doble ejecución.
- Parar el runner al desmontar el componente o al “Cancelar”.

#### 2.2. Botón “Reanudar” = arrancar runner con el job existente
- Para el job que hoy queda “stale”, “Reanudar” simplemente vuelve a empezar el runner (`step` loop) con ese `jobId`.

#### 2.3. Señales claras de vida
Añadir al panel de progreso:
- “Última actualización: hace X segundos”
- “Paso actual: ejecutando…” mientras `step` está in-flight
- Si no hay updates pero runner está activo, mostrar “reintentando” y continuar.

Esto es lo que permite “monitorizar en tiempo real” como pides.

---

## Validación (cómo comprobaremos que ya no se atasca en storyboard_panels)

1) Con el job actual que quedó en storyboard_panels:
- Abrir Project Settings → Backup/Migración → Clonador.
- Dar “Reanudar desde aquí”.
- Verás que pasa a `generation_runs`, `generation_blocks`, `generation_logs` y sigue sumando el total.

2) Con una clonación nueva:
- “Limpiar y empezar de cero”
- “Iniciar clonación”
- Confirmar que llega a `done` y muestra verificación.

---

## Archivos a modificar

1) `supabase/functions/clone-database/index.ts`
- Agregar `action: 'step'`
- Quitar ejecución no-bloqueante en `start`/`resume` (no depender de background)
- Añadir time budget + cortes limpios en loops
- Persistir `tableCounts/totalRows` una vez
- Mejorar `currentItem` al finalizar tablas
- Excluir `background_tasks` y limpiar `targetUrl` al finalizar

2) `src/components/project/DatabaseCloner.tsx`
- Implementar runner secuencial basado en `step`
- Ajustar “Reanudar” para usar runner
- Mejorar señales de estado (última actualización / ejecutando paso)

---

## Riesgos y mitigaciones

- Si cierras la pestaña, el runner se detiene: al volver, “Reanudar” continúa desde checkpoint.
- Si el destino tiene latencia alta, el step puede copiar menos por ciclo: igual avanza (solo tarda más).
- Si algún insert falla por dato raro, hoy ya se “loggea y sigue”. Mantendremos ese comportamiento, pero mejoraremos el reporte final en verificación.

---

## Resultado esperado

- Ya no se quedará “para siempre” en storyboard_panels: avanzará tabla por tabla hasta completar.
- Tendrás un modo real de “monitorización en tiempo real” porque el frontend empuja cada paso y recibe respuesta.
- La reanudación será confiable y sin depender de ejecuciones largas en el backend.
