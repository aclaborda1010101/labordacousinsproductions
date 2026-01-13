/**
 * outline-enrich - Adds operational "meat" to outlines without rewriting story
 * 
 * Surgical enrichment:
 * 1. Factions: Groups in conflict with objectives, methods, red lines
 * 2. Entity Rules: can_do/cannot_do/cost for special entities (Aelion, etc.)
 * 3. Setpiece per Episode: Big concrete scene per episode
 * 4. 5-Hitos Season Arc: inciting_incident, first_turn, all_is_lost, final_choice
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { THREADS_ENRICH_V11 } from '../_shared/production-prompts.ts';
import { needsThreads, needsFactions, needsEntityRules, needs5Hitos, needsSetpieces } from '../_shared/qc-validators.ts';
import { THREAD_SCHEMA, THREADS_ENRICH_RESPONSE_SCHEMA } from '../_shared/outline-schemas-v11.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Model config
const QUALITY_MODEL = 'openai/gpt-5.2';
const MAX_TOKENS = 4000;

// ============================================================================
// AI CALLER
// ============================================================================

async function callLovableAI(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  toolName: string,
  toolSchema: any,
  maxTokens: number = MAX_TOKENS
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  // Use max_completion_tokens for OpenAI models (GPT-5.x)
  const tokenField = model.startsWith('openai/') ? 'max_completion_tokens' : 'max_tokens';
  
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      [tokenField]: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: toolName,
            description: "Generate the requested enrichment data",
            parameters: toolSchema
          }
        }
      ],
      tool_choice: { type: "function", function: { name: toolName } }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a few minutes.");
    }
    if (response.status === 402) {
      throw new Error("API credits exhausted. Please add credits to continue.");
    }
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract tool call result
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool arguments:", e);
      throw new Error("Invalid response format from AI");
    }
  }

  // Fallback: try to extract JSON from content
  const content = data.choices?.[0]?.message?.content;
  if (content) {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  }

  throw new Error("No valid response from AI");
}

// ============================================================================
// SCHEMAS
// ============================================================================

const FACTIONS_SCHEMA = {
  type: 'object',
  properties: {
    factions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Faction name' },
          objective: { type: 'string', description: 'What they want' },
          resources: { type: 'array', items: { type: 'string' }, description: 'What they have' },
          method: { type: 'string', description: 'How they operate' },
          red_line: { type: 'string', description: 'What they would NEVER do' },
          leader: { type: 'string', description: 'Character from cast who leads this faction' }
        },
        required: ['name', 'objective', 'method']
      }
    }
  },
  required: ['factions']
};

const ENTITY_RULES_SCHEMA = {
  type: 'object',
  properties: {
    entity_rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entity: { type: 'string', description: 'Entity name (Aelion, Oricalco, etc.)' },
          can_do: { type: 'array', items: { type: 'string' }, description: 'List of 3-5 concrete capabilities' },
          cannot_do: { type: 'array', items: { type: 'string' }, description: 'List of 3-5 absolute limits' },
          cost: { type: 'string', description: 'Dramatic cost of each intervention' },
          dramatic_purpose: { type: 'string', description: 'Why it exists narratively' }
        },
        required: ['entity', 'can_do', 'cannot_do', 'cost']
      }
    }
  },
  required: ['entity_rules']
};

const SEASON_ARC_5_HITOS_SCHEMA = {
  type: 'object',
  properties: {
    season_arc_enriched: {
      type: 'object',
      properties: {
        inciting_incident: { type: 'string', description: 'Triggering event in ep1' },
        first_turn: { type: 'string', description: 'Point of no return (end ep1-2)' },
        midpoint_reversal: { type: 'string', description: 'Midpoint twist - CONCRETE EVENT' },
        all_is_lost: { type: 'string', description: 'Maximum crisis (~75% of season)' },
        final_choice: { type: 'string', description: 'Irreversible protagonist decision' }
      },
      required: ['inciting_incident', 'first_turn', 'all_is_lost', 'final_choice']
    }
  },
  required: ['season_arc_enriched']
};

const SETPIECES_SCHEMA = {
  type: 'object',
  properties: {
    episode_setpieces: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          episode: { type: 'number' },
          setpiece: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Setpiece name (e.g., "Laboratory Chase")' },
              location: { type: 'string', description: 'Where it happens' },
              participants: { type: 'array', items: { type: 'string' }, description: 'Characters involved' },
              stakes: { type: 'string', description: 'What is lost if it fails' }
            },
            required: ['name', 'stakes']
          }
        },
        required: ['episode', 'setpiece']
      }
    }
  },
  required: ['episode_setpieces']
};

// ============================================================================
// V11: THREADS SCHEMA
// ============================================================================

const THREADS_SCHEMA = {
  type: 'object',
  properties: {
    threads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Thread ID: T_MAIN, T_REL, T_ANTAGONIST_1, etc.' },
          type: { 
            type: 'string', 
            enum: ['main', 'subplot', 'relationship', 'ethical', 'mystery', 'procedural', 'myth', 'entity'],
            description: 'Type of narrative thread'
          },
          question: { type: 'string', description: 'Dramatic question this thread explores' },
          engine: { type: 'string', description: 'Core mechanic: investigate, hunt, blackmail, etc.' },
          stake: { type: 'string', description: 'Concrete loss if the thread fails' },
          milestones: { 
            type: 'array', 
            items: { type: 'string' }, 
            description: '3-7 concrete milestones (observable events)'
          },
          end_state: { type: 'string', description: 'Final state of this thread' }
        },
        required: ['id', 'type', 'question', 'engine', 'stake', 'milestones', 'end_state']
      }
    }
  },
  required: ['threads']
};

const THREAD_USAGE_SCHEMA = {
  type: 'object',
  properties: {
    episode_thread_usage: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          episode: { type: 'number' },
          thread_usage: {
            type: 'object',
            properties: {
              A: { type: 'string', description: 'Primary thread.id (mandatory)' },
              B: { type: 'string', description: 'Secondary thread.id (optional)' },
              C: { type: 'string', description: 'Tertiary thread.id (optional)' },
              crossover_event: { type: 'string', description: 'Observable event where threads collide' }
            },
            required: ['A', 'crossover_event']
          }
        },
        required: ['episode', 'thread_usage']
      }
    }
  },
  required: ['episode_thread_usage']
};

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildFactionsPrompt(outline: any): string {
  const cast = outline.main_characters || outline.cast || [];
  const synopsis = outline.synopsis || outline.logline || '';
  
  return `Analyze this story and identify the OPERATIONAL FACTIONS in conflict.

CAST:
${JSON.stringify(cast, null, 2)}

SYNOPSIS:
${synopsis}

TASK: Identify 2-4 factions that represent opposing forces in this story.

For each faction:
- name: Faction name (can be organization, group, or ideology)
- objective: What they specifically want
- resources: What assets they have (list 2-3)
- method: How they operate to achieve their goal
- red_line: What they would NEVER do (ethical limit or practical constraint)
- leader: Which character from the cast leads or represents this faction

IMPORTANT:
- Factions must be represented by characters from the cast
- Include protagonist's faction and antagonist's faction at minimum
- Each faction needs a clear CONFLICT with at least one other faction

FORBIDDEN:
- Generic factions like "good guys" vs "bad guys"
- Factions without concrete methods
- Leaders not from the cast`;
}

function buildEntityRulesPrompt(outline: any): string {
  const synopsis = outline.synopsis || outline.logline || '';
  const worldRules = outline.world_rules || outline.mythology_rules || [];
  const title = outline.title || '';
  
  // Extract potential entities from synopsis and rules
  const entitiesFromRules = worldRules
    .map((r: any) => r.entity || r.rule)
    .filter(Boolean);
  
  return `Define OPERATIONAL RULES for special entities in this story.

TITLE: ${title}
SYNOPSIS: ${synopsis}

EXISTING WORLD RULES/ENTITIES:
${JSON.stringify(worldRules, null, 2)}

TASK: For each supernatural/special entity, technology, or power system in this story, define:

1. entity: The entity name
2. can_do: List of 3-5 CONCRETE capabilities (what it CAN do)
3. cannot_do: List of 3-5 ABSOLUTE LIMITS (what it can NEVER do)
4. cost: The DRAMATIC COST of using this power/entity
5. dramatic_purpose: Why this entity exists in the narrative

EXAMPLE for "Aelion" entity:
{
  "entity": "Aelion",
  "can_do": ["Manifest visually to individuals", "Show visions of the past", "Temporarily alter digital data"],
  "cannot_do": ["Intervene physically", "Save lives directly", "Predict the future", "Communicate with more than 3 people at once"],
  "cost": "Each manifestation weakens its ability to intervene for 48 hours",
  "dramatic_purpose": "Forces protagonists to make decisions without divine help"
}

CRITICAL:
- Be SPECIFIC, not vague
- Limits must create TENSION (if entity can do everything, there's no drama)
- Cost must affect the story (no free magic)`;
}

function buildSeasonArc5HitosPrompt(outline: any): string {
  const existingArc = outline.season_arc || {};
  const episodes = outline.episode_beats || [];
  const synopsis = outline.synopsis || outline.logline || '';
  const cast = outline.main_characters || outline.cast || [];
  
  return `Complete the 5-HITOS season arc structure.

EXISTING ARC:
${JSON.stringify(existingArc, null, 2)}

EPISODES:
${JSON.stringify(episodes.map((e: any) => ({ episode: e.episode, title: e.title, summary: e.summary })), null, 2)}

SYNOPSIS: ${synopsis}

PROTAGONIST: ${cast[0]?.name || 'Unknown'}

TASK: Fill in the 5 structural milestones:

1. inciting_incident: The triggering event in ep1 that starts the story
2. first_turn: Point of no return (usually end of ep1 or ep2) - protagonist commits
3. midpoint_reversal: Major twist at ~50% that changes everything (MUST be a CONCRETE EVENT)
4. all_is_lost: Maximum crisis at ~75% - protagonist has lost everything
5. final_choice: The irreversible decision protagonist must make

EXAMPLES OF GOOD MILESTONES:
✅ "inciting_incident": "Leo accidentally activates the artifact, triggering a nationwide blackout"
✅ "all_is_lost": "Daniel is captured by Nexus, Leo's lab is destroyed, and Nikos betrays them"

EXAMPLES OF BAD MILESTONES:
❌ "The situation gets complicated"
❌ "Everything changes"
❌ "A major revelation"

Each milestone must be:
- SPECIFIC (who, what, where)
- IRREVERSIBLE (can't be undone)
- OBSERVABLE (audience can see it happen)`;
}

function buildSetpiecesPrompt(outline: any): string {
  const episodes = outline.episode_beats || [];
  const locations = outline.main_locations || [];
  const cast = outline.main_characters || outline.cast || [];
  
  return `Create a SETPIECE (big action/emotional scene) for each episode.

EPISODES:
${JSON.stringify(episodes.map((e: any) => ({ episode: e.episode, title: e.title, summary: e.summary })), null, 2)}

LOCATIONS:
${JSON.stringify(locations.map((l: any) => l.name), null, 2)}

CHARACTERS:
${JSON.stringify(cast.map((c: any) => c.name), null, 2)}

TASK: For each episode, define ONE memorable setpiece:

- name: Descriptive action name (e.g., "Rooftop Confrontation", "Underground Lab Chase")
- location: Where it happens (use existing locations when possible)
- participants: Which characters are in this scene
- stakes: What is at risk if they fail

IMPORTANT:
- Each setpiece must be VISUALLY MEMORABLE
- Stakes must be CONCRETE (not "everything")
- Setpiece should be the CLIMAX of that episode
- Use diverse locations across episodes
- Involve key characters in each setpiece`;
}

// ============================================================================
// V11: THREADS PROMPT BUILDERS
// ============================================================================

function buildThreadsPrompt(outline: any): string {
  const synopsis = outline.synopsis || outline.logline || '';
  const episodes = outline.episode_beats || [];
  const cast = outline.main_characters || outline.cast || [];
  const factions = outline.factions || [];
  const entityRules = outline.entity_rules || [];
  const arc = outline.season_arc || {};
  
  return `Analyze this story and create NARRATIVE THREADS (carriles narrativos).

SYNOPSIS: ${synopsis}

SEASON ARC:
${JSON.stringify(arc, null, 2)}

CAST:
${JSON.stringify(cast.map((c: any) => ({ name: c.name, role: c.role, wants: c.wants, arc: c.arc })), null, 2)}

FACTIONS:
${JSON.stringify(factions, null, 2)}

ENTITY RULES:
${JSON.stringify(entityRules, null, 2)}

EPISODES (${episodes.length}):
${JSON.stringify(episodes.map((e: any) => ({ episode: e.episode, title: e.title, summary: e.summary })), null, 2)}

TASK: Create 5-8 narrative threads that organize the story's structure.

THREAD TYPES:
- main: Primary protagonist journey
- subplot: Secondary story with its own arc
- relationship: Dynamic between characters
- ethical: Moral dilemma the character faces
- mystery: Question revealed gradually
- procedural: Technical process/investigation
- myth: Lore/worldbuilding of the universe
- entity: Rules of special entities

FOR EACH THREAD:
- id: Unique identifier (T_MAIN, T_REL_LEO_NIKOS, T_MYSTERY_ARTIFACT, etc.)
- type: One of the types above
- question: The dramatic question this thread explores
- engine: Core mechanic (investigate, hunt, blackmail, protect, hide, etc.)
- stake: Concrete loss if the thread fails (specific, not "everything")
- milestones: 3-7 observable events that advance this thread
- end_state: How this thread resolves by series end

EXAMPLE OF GOOD THREAD:
{
  "id": "T_MAIN",
  "type": "main",
  "question": "¿Podrá Leo descubrir quién saboteó el proyecto de su padre?",
  "engine": "investigar rastros digitales",
  "stake": "Si falla, los responsables destruirán toda evidencia",
  "milestones": [
    "Leo encuentra el diario cifrado",
    "Descubre que Nexus financió el proyecto",
    "Localiza a un testigo superviviente",
    "El testigo es asesinado antes de hablar",
    "Encuentra grabación de audio del sabotaje"
  ],
  "end_state": "Leo expone a Nexus pero pierde a su mejor amigo"
}

FORBIDDEN:
- Threads without clear dramatic question
- Milestones that are vague ("things get complicated")
- Stakes that are abstract ("everything changes")`;
}

function buildThreadUsagePrompt(outline: any, threads: any[]): string {
  const episodes = outline.episode_beats || [];
  
  return `Assign THREADS to each episode.

THREADS AVAILABLE:
${JSON.stringify(threads.map(t => ({ id: t.id, type: t.type, question: t.question })), null, 2)}

EPISODES:
${JSON.stringify(episodes.map((e: any) => ({ episode: e.episode, title: e.title, summary: e.summary })), null, 2)}

TASK: For each episode, assign which threads are active and how they collide.

FOR EACH EPISODE:
- A: Primary thread.id (MANDATORY)
- B: Secondary thread.id (optional)
- C: Tertiary thread.id (optional)
- crossover_event: Observable event where the threads collide (MANDATORY)

EXAMPLE:
{
  "episode": 1,
  "thread_usage": {
    "A": "T_MAIN",
    "B": "T_REL_LEO_NIKOS",
    "crossover_event": "Nikos descubre que Leo investiga a espaldas de todos, confrontación en el laboratorio"
  }
}

RULES:
- T_MAIN should appear in most episodes
- Each thread should progress across multiple episodes
- crossover_event must be CONCRETE (who does what, where)
- Vary which threads are primary vs secondary across episodes`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request
    const { outline_id, enrich_mode = 'all' } = await req.json();

    if (!outline_id) {
      return new Response(JSON.stringify({ error: 'Missing outline_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load outline
    const { data: outlineRecord, error: loadError } = await supabase
      .from('script_outlines')
      .select('*')
      .eq('id', outline_id)
      .single();

    if (loadError || !outlineRecord) {
      return new Response(JSON.stringify({ error: 'Outline not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const outline = outlineRecord.outline_json as any;
    
    // Update status to enriching
    await supabase
      .from('script_outlines')
      .update({ 
        status: 'enriching',
        stage: 'enriching',
        progress: 10
      })
      .eq('id', outline_id);

    // Track what we need to enrich (using V11 validators)
    const outlineNeedsFactions = needsFactions(outline);
    const outlineNeedsEntityRules = needsEntityRules(outline);
    const outlineNeedsSetpieces = needsSetpieces(outline);
    const outlineNeedsArc5Hitos = needs5Hitos(outline);
    const outlineNeedsThreads = needsThreads(outline);
    const outlineNeedsThreadUsage = !outline.episode_beats?.every((ep: any) => ep.thread_usage?.A && ep.thread_usage?.crossover_event);

    let enrichedOutline = { ...outline };
    let progress = 20;

    // ========================================================================
    // ENRICH FACTIONS
    // ========================================================================
    if ((enrich_mode === 'all' || enrich_mode === 'factions') && outlineNeedsFactions) {
      console.log('[outline-enrich] Generating factions...');
      
      await supabase.from('script_outlines').update({ progress: 25 }).eq('id', outline_id);

      const factionsPrompt = buildFactionsPrompt(outline);
      const factionsResult = await callLovableAI(
        QUALITY_MODEL,
        'You are a showrunner. Generate operational factions for this story. Return ONLY valid JSON.',
        factionsPrompt,
        'generate_factions',
        FACTIONS_SCHEMA
      );

      if (factionsResult?.factions) {
        enrichedOutline.factions = factionsResult.factions;
        console.log(`[outline-enrich] Generated ${factionsResult.factions.length} factions`);
      }
      progress = 35;
    }

    // ========================================================================
    // ENRICH ENTITY RULES
    // ========================================================================
    if ((enrich_mode === 'all' || enrich_mode === 'entity_rules') && outlineNeedsEntityRules) {
      console.log('[outline-enrich] Generating entity rules...');
      
      await supabase.from('script_outlines').update({ progress: 45 }).eq('id', outline_id);

      const entityRulesPrompt = buildEntityRulesPrompt(outline);
      const entityRulesResult = await callLovableAI(
        QUALITY_MODEL,
        'You are a worldbuilder. Define operational rules for special entities. Return ONLY valid JSON.',
        entityRulesPrompt,
        'generate_entity_rules',
        ENTITY_RULES_SCHEMA
      );

      if (entityRulesResult?.entity_rules) {
        enrichedOutline.entity_rules = entityRulesResult.entity_rules;
        console.log(`[outline-enrich] Generated ${entityRulesResult.entity_rules.length} entity rules`);
      }
      progress = 55;
    }

    // ========================================================================
    // ENRICH SEASON ARC (5 HITOS)
    // ========================================================================
    if ((enrich_mode === 'all' || enrich_mode === 'arc') && outlineNeedsArc5Hitos) {
      console.log('[outline-enrich] Completing 5-hitos season arc...');
      
      await supabase.from('script_outlines').update({ progress: 60 }).eq('id', outline_id);

      const arcPrompt = buildSeasonArc5HitosPrompt(outline);
      const arcResult = await callLovableAI(
        QUALITY_MODEL,
        'You are a showrunner. Complete the 5-hitos structure. Return ONLY valid JSON.',
        arcPrompt,
        'generate_season_arc',
        SEASON_ARC_5_HITOS_SCHEMA
      );

      if (arcResult?.season_arc_enriched) {
        enrichedOutline.season_arc = {
          ...(outline.season_arc || {}),
          ...arcResult.season_arc_enriched
        };
        console.log('[outline-enrich] Completed 5-hitos season arc');
      }
      progress = 65;
    }

    // ========================================================================
    // ENRICH SETPIECES PER EPISODE
    // ========================================================================
    if ((enrich_mode === 'all' || enrich_mode === 'setpieces') && outlineNeedsSetpieces) {
      console.log('[outline-enrich] Generating setpieces...');
      
      await supabase.from('script_outlines').update({ progress: 70 }).eq('id', outline_id);

      const setpiecesPrompt = buildSetpiecesPrompt(outline);
      const setpiecesResult = await callLovableAI(
        QUALITY_MODEL,
        'You are a showrunner. Create memorable setpieces for each episode. Return ONLY valid JSON.',
        setpiecesPrompt,
        'generate_setpieces',
        SETPIECES_SCHEMA
      );

      if (setpiecesResult?.episode_setpieces) {
        // Merge setpieces into episode_beats
        enrichedOutline.episode_beats = (enrichedOutline.episode_beats || []).map((ep: any) => {
          const setpieceData = setpiecesResult.episode_setpieces.find(
            (s: any) => s.episode === ep.episode
          );
          return setpieceData ? { ...ep, setpiece: setpieceData.setpiece } : ep;
        });
        console.log(`[outline-enrich] Added ${setpiecesResult.episode_setpieces.length} setpieces`);
      }
      progress = 75;
    }

    // ========================================================================
    // V11: ENRICH THREADS (NARRATIVE LANES) - Using centralized prompt
    // ========================================================================
    if ((enrich_mode === 'all' || enrich_mode === 'threads') && outlineNeedsThreads) {
      console.log('[outline-enrich] Generating narrative threads (V11)...');
      
      await supabase.from('script_outlines').update({ 
        progress: 80,
        stage: 'threads'
      }).eq('id', outline_id);

      // Use V11 centralized prompt
      const threadsResult = await callLovableAI(
        THREADS_ENRICH_V11.model,
        THREADS_ENRICH_V11.system,
        THREADS_ENRICH_V11.buildUserPrompt(enrichedOutline),
        'generate_threads',
        THREADS_ENRICH_RESPONSE_SCHEMA,
        THREADS_ENRICH_V11.maxTokens
      );

      if (threadsResult?.threads && threadsResult.threads.length >= 3) {
        enrichedOutline.threads = threadsResult.threads;
        console.log(`[outline-enrich] Generated ${threadsResult.threads.length} threads`);
        
        // V11: Merge episode_beats_patch (not episode_thread_usage)
        if (threadsResult.episode_beats_patch) {
          enrichedOutline.episode_beats = (enrichedOutline.episode_beats || []).map((ep: any) => {
            const patch = threadsResult.episode_beats_patch.find(
              (p: any) => p.episode === ep.episode
            );
            return patch ? { ...ep, thread_usage: patch.thread_usage } : ep;
          });
          console.log(`[outline-enrich] Patched thread_usage on ${threadsResult.episode_beats_patch.length} episodes`);
        }
      }
      progress = 95;
    }

    // ========================================================================
    // SAVE ENRICHED OUTLINE
    // ========================================================================
    const qualityLevel = enrichedOutline.threads?.length >= 5 ? 'threaded' : 'enriched';
    
    const { error: saveError } = await supabase
      .from('script_outlines')
      .update({
        outline_json: enrichedOutline,
        quality: qualityLevel,
        status: 'completed',
        stage: 'done',
        progress: 100,
        updated_at: new Date().toISOString()
      })
      .eq('id', outline_id);

    if (saveError) {
      console.error('[outline-enrich] Save error:', saveError);
      throw saveError;
    }

    console.log('[outline-enrich] Enrichment complete');

    return new Response(JSON.stringify({
      success: true,
      outline: enrichedOutline,
      enriched: {
        factions: enrichedOutline.factions?.length || 0,
        entity_rules: enrichedOutline.entity_rules?.length || 0,
        setpieces: enrichedOutline.episode_beats?.filter((ep: any) => ep.setpiece).length || 0,
        arc_complete: !!(enrichedOutline.season_arc?.inciting_incident && enrichedOutline.season_arc?.final_choice),
        threads: enrichedOutline.threads?.length || 0,
        thread_usage: enrichedOutline.episode_beats?.filter((ep: any) => ep.thread_usage?.A).length || 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[outline-enrich] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
