
# Plan: Corregir Generación de Escenas con Timeout de AI

## Problema Identificado

El modelo `gpt-5-mini` agotó su límite de tokens al intentar planificar 24 escenas:

```text
┌────────────────────────────────────────────────────────────────┐
│  RESPUESTA AI (TRUNCADA)                                       │
├────────────────────────────────────────────────────────────────┤
│  finish_reason: "length" ← Se quedó sin tokens                 │
│  content: "" ← Respuesta vacía                                 │
│  reasoning_tokens: 4000 ← Todo gastado en razonamiento         │
├────────────────────────────────────────────────────────────────┤
│  RESULTADO: scenes = [] → 0 escenas planificadas               │
└────────────────────────────────────────────────────────────────┘
```

## Solución: Procesar en Lotes de 8 Escenas

Modificar `narrative-decide` para dividir la planificación en chunks manejables:

```text
┌────────────────────────────────────────────────────────────────┐
│  FLUJO CORREGIDO (Lotes de 8)                                  │
├────────────────────────────────────────────────────────────────┤
│  scenesToPlan = 24                                             │
│  ↓                                                             │
│  BATCH 1: Planificar escenas 1-8  → 8 intents                  │
│  BATCH 2: Planificar escenas 9-16 → 8 intents                  │
│  BATCH 3: Planificar escenas 17-24 → 8 intents                 │
│  ↓                                                             │
│  TOTAL: 24 scene_intents creados                               │
└────────────────────────────────────────────────────────────────┘
```

## Cambios Técnicos

### 1. Modificar narrative-decide/index.ts

**a) Aumentar max_tokens y usar modelo más capaz para lotes grandes:**

```typescript
// Línea ~184-201: Ajustar configuración del modelo
const modelToUse = scenesToPlan > 10 
  ? 'openai/gpt-5'  // Modelo más capaz para muchas escenas
  : MODEL_CONFIG.SCRIPT.RAPIDO;

const aiResponse = await aiFetch({
  // ...
  payload: {
    model: modelToUse,
    max_tokens: 8000,  // Aumentar de 4000 a 8000
    // ...
  }
});
```

**b) Procesar en lotes si hay más de 10 escenas:**

```typescript
const BATCH_SIZE = 8;
const allSceneIntents: SceneIntent[] = [];

if (scenesToPlan <= BATCH_SIZE) {
  // Proceso normal para pocos escenas
  const decision = await planScenesBatch(/*...*/);
  allSceneIntents.push(...decision.scenes);
} else {
  // Dividir en lotes
  for (let batch = 0; batch * BATCH_SIZE < scenesToPlan; batch++) {
    const startScene = lastSceneNumber + 1 + (batch * BATCH_SIZE);
    const endScene = Math.min(startScene + BATCH_SIZE - 1, lastSceneNumber + scenesToPlan);
    
    const batchDecision = await planScenesBatch({
      startScene,
      endScene,
      previousScenes: allSceneIntents.slice(-3), // Contexto
      // ...
    });
    
    allSceneIntents.push(...batchDecision.scenes);
  }
}
```

**c) Validar respuesta no vacía:**

```typescript
// Línea ~210-213: Añadir validación
const content = (aiResponse as any).choices?.[0]?.message?.content || '{}';

if (!content || content === '{}' || content === '') {
  const finishReason = (aiResponse as any).choices?.[0]?.finish_reason;
  console.error('[narrative-decide] Empty AI response:', { finishReason });
  
  if (finishReason === 'length') {
    throw new Error('AI response truncated - too many scenes requested. Reduce batch size.');
  }
  throw new Error('AI returned empty response');
}

const decision = JSON.parse(content);
```

### 2. Corregir esquema de tabla scenes

Añadir la columna `scene_number` si no existe:

```sql
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS scene_number INTEGER;
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/narrative-decide/index.ts` | Añadir procesamiento en lotes, aumentar max_tokens, validar respuesta vacía |
| Base de datos | Migración para añadir columna `scene_number` a tabla `scenes` |

## Resultado Esperado

1. Usuario inicia generación de guión (24 escenas)
2. Sistema divide en 3 lotes de 8 escenas cada uno
3. Cada lote se procesa con suficientes tokens
4. Se crean 24 `scene_intent` records
5. `scene-worker` genera las 24 escenas correctamente
