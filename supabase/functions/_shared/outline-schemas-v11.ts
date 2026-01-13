/**
 * OUTLINE SCHEMAS V11 - Strict JSON Schemas for Tool Calling
 * 
 * - additionalProperties: false prevents invented fields
 * - minLength enforces meaningful content
 * - required enforces structure
 * 
 * Usage: Import in outline-worker and outline-enrich for tool schemas
 */

// ============================================================================
// TURNING POINT SCHEMA (object, NEVER string)
// ============================================================================
export const TURNING_POINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tp: { type: "number", description: "Turning point number (1-4+)" },
    agent: { type: "string", minLength: 3, description: "WHO acts (character or faction name)" },
    event: { type: "string", minLength: 10, description: "WHAT happens (strong verb + action)" },
    consequence: { type: "string", minLength: 10, description: "WHAT changes (observable result)" }
  },
  required: ["agent", "event", "consequence"]
};

// ============================================================================
// THREAD USAGE SCHEMA (per-episode thread assignment)
// ============================================================================
export const THREAD_USAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    A: { type: "string", minLength: 3, description: "Primary thread.id (MANDATORY)" },
    B: { type: "string", description: "Secondary thread.id (optional)" },
    C: { type: "string", description: "Tertiary thread.id (optional)" },
    crossover_event: { type: "string", minLength: 20, description: "Observable event where threads collide (MANDATORY)" }
  },
  required: ["A", "crossover_event"]
};

// ============================================================================
// SETPIECE SCHEMA (big scene per episode)
// ============================================================================
export const SETPIECE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 5, description: "Setpiece name (e.g., 'Laboratory Chase')" },
    location_ref: { type: "string", description: "Reference to location name" },
    participants: { type: "array", items: { type: "string" }, minItems: 1, description: "Characters involved" },
    stakes: { type: "string", minLength: 12, description: "What is lost if it fails" },
    visual_hook: { type: "string", description: "Memorable visual element (optional)" }
  },
  required: ["name", "participants", "stakes"]
};

// ============================================================================
// THREAD SCHEMA (narrative lane)
// ============================================================================
export const THREAD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 3, description: "Unique ID: T_MAIN, T_REL_X, T_ANT_1, etc." },
    type: { 
      type: "string", 
      enum: ["main", "subplot", "relationship", "ethical", "mystery", "procedural", "myth", "entity"],
      description: "Type of narrative thread" 
    },
    question: { type: "string", minLength: 15, description: "Dramatic question this thread explores" },
    engine: { type: "string", minLength: 6, description: "Core mechanic: investigate, hunt, blackmail, etc." },
    stake: { type: "string", minLength: 12, description: "Concrete loss if the thread fails" },
    milestones: { 
      type: "array", 
      items: { type: "string", minLength: 10 }, 
      minItems: 3, 
      maxItems: 7,
      description: "3-7 observable milestone events" 
    },
    end_state: { type: "string", minLength: 12, description: "Final state of this thread" }
  },
  required: ["id", "type", "question", "engine", "stake", "milestones", "end_state"]
};

// ============================================================================
// SEASON ARC 5-HITOS SCHEMA
// ============================================================================
export const SEASON_ARC_V11_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    inciting_incident: { type: "string", minLength: 20, description: "Triggering event in ep1" },
    first_turn: { type: "string", minLength: 20, description: "Point of no return (end ep1-2)" },
    midpoint_reversal: { type: "string", minLength: 20, description: "Midpoint twist - CONCRETE EVENT" },
    all_is_lost: { type: "string", minLength: 20, description: "Maximum crisis (~75% of season)" },
    final_choice: { type: "string", minLength: 20, description: "Irreversible protagonist decision" },
    theme: { type: "string", description: "Central theme (optional)" },
    stakes: { 
      type: "object", 
      properties: { 
        personal: { type: "string" }, 
        global: { type: "string" } 
      } 
    },
    // Legacy fields for compatibility
    start_state: { type: "string" },
    end_state: { type: "string" }
  },
  required: ["inciting_incident", "first_turn", "midpoint_reversal", "all_is_lost", "final_choice"]
};

// ============================================================================
// FACTION SCHEMA
// ============================================================================
export const FACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 3, description: "Faction name" },
    objective: { type: "string", minLength: 10, description: "What they want" },
    resources: { type: "array", items: { type: "string" }, description: "What assets they have" },
    method: { type: "string", minLength: 6, description: "How they operate" },
    red_line: { type: "string", description: "What they would NEVER do" },
    leader_ref: { type: "string", description: "Character from cast who leads this faction" }
  },
  required: ["name", "objective", "method"]
};

// ============================================================================
// ENTITY RULES SCHEMA
// ============================================================================
export const ENTITY_RULES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    entity: { type: "string", minLength: 2, description: "Entity name (Aelion, Oricalco, etc.)" },
    can_do: { type: "array", items: { type: "string" }, minItems: 1, description: "List of 3-5 concrete capabilities" },
    cannot_do: { type: "array", items: { type: "string" }, minItems: 1, description: "List of 3-5 absolute limits" },
    cost: { type: "string", minLength: 5, description: "Dramatic cost of each intervention" },
    dramatic_purpose: { type: "string", description: "Why it exists narratively" }
  },
  required: ["entity", "can_do", "cannot_do", "cost"]
};

// ============================================================================
// EPISODE BEAT V11 SCHEMA (complete episode structure)
// ============================================================================
export const EPISODE_BEAT_V11_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    episode: { type: "number" },
    title: { type: "string", minLength: 3 },
    central_question: { type: "string" },
    central_conflict: { type: "string", minLength: 12 },
    turning_points: { 
      type: "array", 
      items: TURNING_POINT_SCHEMA, 
      minItems: 4,
      description: "4+ turning points as objects with agent/event/consequence"
    },
    setpiece: SETPIECE_SCHEMA,
    cliffhanger: { type: "string", minLength: 12 },
    thread_usage: THREAD_USAGE_SCHEMA,
    summary: { type: "string" }
  },
  required: ["episode", "title", "central_conflict", "turning_points", "cliffhanger", "setpiece", "thread_usage"]
};

// ============================================================================
// EPISODES TOOL SCHEMA (for AI tool calling)
// ============================================================================
export const EPISODES_V11_TOOL_SCHEMA = {
  type: "object",
  properties: {
    episodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          episode: { type: "number" },
          title: { type: "string" },
          central_question: { type: "string" },
          central_conflict: { type: "string" },
          turning_points: {
            type: "array",
            items: TURNING_POINT_SCHEMA,
            minItems: 4
          },
          cliffhanger: { type: "string" },
          setpiece: SETPIECE_SCHEMA,
          thread_usage: THREAD_USAGE_SCHEMA
        },
        required: ["episode", "title", "central_conflict", "turning_points", "cliffhanger", "setpiece", "thread_usage"]
      }
    }
  },
  required: ["episodes"]
};

// ============================================================================
// THREADS ENRICHMENT RESPONSE SCHEMA
// ============================================================================
export const THREADS_ENRICH_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    threads: {
      type: "array",
      items: THREAD_SCHEMA,
      minItems: 5,
      maxItems: 8
    },
    episode_beats_patch: {
      type: "array",
      items: {
        type: "object",
        properties: {
          episode: { type: "number" },
          thread_usage: THREAD_USAGE_SCHEMA
        },
        required: ["episode", "thread_usage"]
      }
    }
  },
  required: ["threads", "episode_beats_patch"]
};
