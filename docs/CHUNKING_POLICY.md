# Política de Chunking V11

## Objetivo
Minimizar timeouts, evitar pérdida de entidades, asegurar consistencia de outline.

## Entrada (texto bruto)
- ≤ 8k chars: se permite summarize single-shot
- > 8k chars: chunking obligatorio

## Parámetros de Chunking
- **size**: 8,000 caracteres
- **overlap**: 600 caracteres (para nombres/relaciones)
- **extractor**: gpt-5-mini
- **consolidator**: gpt-5 (o gpt-5.2 si premium)

## Regla de Oro
**NUNCA generar outline desde texto bruto si hubo chunking.**
Siempre pasar por structured_summary primero.

## Retries
- 1er retry: mismo modelo, reduce chunk 0.6x
- 2º retry: modelo fallback, reduce chunk 0.5x

## Modelo Fallback Chain
```
openai/gpt-5.2 → openai/gpt-5 → openai/gpt-5-mini → google/gemini-2.5-flash → google/gemini-2.5-flash-lite
```

## Timeouts
- request: 55s
- stage: 80s

## Persistencia
Guardar `structured_summary` + hash de input para idempotencia.

---

## QC Gating V11

### Blockers (impiden "Generar Episodios")

1. **Season Arc sin 5 hitos**
   - `inciting_incident`
   - `first_turn`
   - `midpoint_reversal` (>= 20 chars)
   - `all_is_lost`
   - `final_choice`

2. **Episodios != episode_count esperado**

3. **Por cada episodio debe tener:**
   - `central_conflict` >= 12 chars
   - `turning_points.length` >= 4
   - Cada TP: `agent/event/consequence` >= 6 chars
   - `setpiece.stakes` >= 12 chars
   - `setpiece.participants.length` >= 1
   - `cliffhanger` >= 12 chars
   - `thread_usage.A` (thread principal)
   - `thread_usage.crossover_event` (cruce observable)

### Warnings (no bloquean)
- `threads < 5` o `threads > 8`
- `facciones < 2`
- `entity_rules` vacías si hay entidades especiales

---

## Schema V11

### Thread
```typescript
{
  id: string;              // "T_MAIN", "T_REL", "T_ANTAGONIST_1"
  type: "main" | "subplot" | "relationship" | "ethical" | "mystery" | "procedural" | "myth" | "entity";
  question: string;        // pregunta dramática
  engine: string;          // mecánica (investigar, cazar, chantajear, etc.)
  stake: string;           // pérdida concreta
  milestones: string[];    // 3-7 hitos concretos (hechos)
  end_state: string;
}
```

### Thread Usage (por episodio)
```typescript
{
  A: string;             // thread.id principal (obligatorio)
  B?: string;            // secundario (opcional)
  C?: string;            // terciario (opcional)
  crossover_event: string; // hecho observable donde chocan
}
```
