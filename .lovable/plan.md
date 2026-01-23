
Contexto (qué está pasando ahora)
- El botón “Iniciar Generación” sí ejecuta código, pero el hook `useNarrativeGeneration.startGeneration()` tiene una protección: si ya existen escenas con estado “pendiente / planificando / escribiendo / reparando” en la base de datos, no inicia una nueva corrida y hace `return`.
- En tu proyecto ya existe al menos 1 `scene_intent` en estado `writing` con `job_id = null` y `scene_id = null`. Eso deja la corrida en un estado “a medio camino”: el sistema cree que hay algo en progreso, pero no hay un trabajo activo que la empuje.
- Además, en consola aparece repetido: `[NarrativeGen] Realtime subscription status: CLOSED`. Eso sugiere que la suscripción de “tiempo real” se está cerrando/recreando constantemente (por callbacks inline), lo cual empeora la sensación de que “no pasa nada”.

Objetivo
1) Que el panel no se “quede callado”: si ya hay generación a medias, debe mostrar claramente “Continuar / Reanudar” (y permitirlo).
2) Que el sistema pueda “rescatar” escenas en `writing` sin job (re-lanzando `scene-worker` de forma idempotente).
3) Estabilizar la suscripción realtime para que el panel refleje progreso sin estar cerrándose en bucle.

Cambios propuestos (frontend + hook)

A) Arreglar el estado de UI para que “Continuar” aparezca cuando corresponde
Archivo: `src/hooks/useNarrativeGeneration.ts`
- En `loadInitialState()`:
  - Después de cargar `scene_intent`, calcular un `phase` derivado del estado real (en DB), por ejemplo:
    - Si existe cualquier intent en `writing` → `phase = 'generating'`
    - Si existe cualquier intent en `pending/planning/planned` → `phase = 'planning'` o `generating` (según criterio)
    - Si existe `needs_repair/repairing` → `phase = 'repairing'`
    - Si todos están `written/validated` → `phase = 'completed'`
    - Si no hay intents → `phase = 'idle'`
  - Esto evita el caso actual: `phase` se queda en `idle` aunque existan intents, por lo cual la UI muestra “Iniciar Generación”, pero luego `startGeneration` bloquea y parece que “no hizo nada”.

B) Cambiar “Iniciar Generación” para que sea accionable cuando hay generación previa
Archivos:
- `src/hooks/useNarrativeGeneration.ts`
- `src/components/project/NarrativeGenerationPanel.tsx`

En `startGeneration()` cuando detecta intents existentes:
- Mantener la protección (no crear nuevos intents), pero:
  - Mostrar un toast más claro con acciones:
    - Acción 1: “Continuar” → llama a `continueGeneration()` (o a una nueva función `resumeGeneration()`; ver punto C)
    - Acción 2: “Reiniciar” → llama a `resetNarrativeState()` (con confirmación)
  - Asegurar que `loadInitialState()` deje el `phase` correcto (punto A) para que el botón “Continuar” quede visible siempre.

C) Hacer que “Continuar” realmente rescate estados atascados
Archivo: `src/hooks/useNarrativeGeneration.ts`
- En `continueGeneration()`:
  - Ampliar el filtro de estados para incluir también:
    - `writing` (clave para tu caso)
    - `needs_repair`, `repairing` (si aplica)
  - Ordenar por `episode_number`, `scene_number` (no solo `scene_number`) para evitar rarezas en series.
  - Para cada intent:
    - Si está `writing` y NO tiene `scene_id`:
      - Re-invocar `scene-worker` con `sceneIntentId` (modo directo), porque el `job_id` es null.
      - Luego hacer polling del intent hasta que pase a `written/validated/failed` (ya existe polling; se reutiliza).
    - Si está `pending/planning/planned`:
      - Invocar `scene-worker` (directo por intent id).
    - Si está `repairing/needs_repair`:
      - (Opcional) invocar el worker de reparación correspondiente si existe; si no, al menos mostrar en UI que está en reparación y ofrecer “Reiniciar”.
- También ajustar el “fallback” dentro de `startGeneration()` (cuando `jobs_created` viene vacío):
  - En vez de traer solo `status = 'pending'`, traer “todas las no-finalizadas” (incluyendo `writing`), para que el fallback no ignore escenas en `writing`.

D) Estabilizar Realtime (evitar el bucle CLOSED)
Archivos:
- `src/hooks/useNarrativeGeneration.ts`
- `src/components/project/NarrativeGenerationPanel.tsx`

Problema actual:
- `useNarrativeGeneration` recrea `setupRealtimeSubscription` cuando cambia `onSceneGenerated`.
- En `NarrativeGenerationPanel` se pasa `onSceneGenerated: (scene) => {...}` inline, lo que cambia en cada render → se desmonta/monta el canal → spam de `CLOSED`.

Solución (una de estas dos):
1) En `NarrativeGenerationPanel.tsx`: envolver `onSceneGenerated` y `onError` con `useCallback` para que sean estables.
2) En `useNarrativeGeneration.ts`: guardar callbacks en `useRef` (pattern “callback ref”), y sacar `onSceneGenerated` de las dependencias del `useCallback`, así `setupRealtimeSubscription` solo depende de `projectId`.

Adicional (opcional pero recomendado):
- Si el estado del canal llega como `CLOSED`, programar un reintento (retry con backoff) en vez de depender de renders.

E) Mensaje claro en UI cuando hay intents “en curso”
Archivo: `src/components/project/NarrativeGenerationPanel.tsx`
- Si `sceneIntents.length > 0` y `progress.phase === 'idle'`, mostrar un bloque “Hay una generación anterior en curso” con botones:
  - “Continuar”
  - “Reiniciar”
Esto elimina por completo la experiencia de “no hace nada”.

Validación / pruebas (lo que voy a testear al implementar)
1) Con un proyecto que tenga intents en `writing` y `job_id null`:
   - Entrar a `/projects/:id/script`
   - Ver que el panel muestre “Continuar” (no solo “Iniciar”)
   - Click “Continuar” → debe invocar `scene-worker` por `sceneIntentId` y avanzar estados.
2) Realtime:
   - Confirmar que en consola ya no aparece “CLOSED” en bucle.
   - Confirmar que updates de `scene_intent` refrescan la lista/estado sin recargar.
3) Reinicio:
   - Click “Reiniciar” debe limpiar todo y dejar `phase = idle`, sin intents visibles.

Mitigación inmediata para ti (sin esperar cambios)
- En el panel de “Diagnósticos” usa “Limpiar Todos los Datos de Generación” y luego vuelve a “Iniciar Generación”.
  - Esto funciona, pero es un “reset total”. El plan de arriba busca que NO sea necesario para rescatar corridas a medias.

Archivos a tocar
- `src/hooks/useNarrativeGeneration.ts` (principal: phase derivado + continue/resume + fallback)
- `src/components/project/NarrativeGenerationPanel.tsx` (callbacks estables + UI/acciones claras)

Riesgos y cómo los evitamos
- Riesgo: re-ejecutar `scene-worker` sobre una escena ya escrita.
  - Mitigación: `scene-worker` ya está usando `upsert` por `(project_id, episode_no, scene_no)`, así que reintentos no deberían romper por duplicados.
- Riesgo: contador de progreso se desincroniza.
  - Mitigación: preferir progreso derivado desde `sceneIntents` en `loadInitialState` y, si es necesario, ajustar el incremento en realtime para no duplicar conteos.

Resultado esperado
- Cuando le des “Iniciar Generación”, si hay una corrida previa, te ofrecerá “Continuar” de forma explícita.
- “Continuar” sí moverá escenas en `writing` sin job (rescate automático).
- El panel reflejará cambios en vivo (sin spam de “CLOSED”).
