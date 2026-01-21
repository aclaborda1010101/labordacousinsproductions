/**
 * CONTINUITY MANAGER V1.0
 * 
 * Structured continuity tracking for Writer's Room Hollywood Pipeline
 * Ensures consistent state between script blocks
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CharacterState {
  emotion: string;
  goal: string;
  secrets_known: string[];
  injuries?: string;
  wardrobe?: string;
  location?: string;
}

export interface ContinuitySummary {
  time_of_day: 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK';
  date: string;
  story_day: number;
  location_current: string;
  character_states: Record<string, CharacterState>;
  open_threads: string[];
  props_in_hand: string[];
  injuries_or_changes: string[];
  next_scene_intent: string;
}

export interface CanonPack {
  voice_tone_rules: string[];
  active_cast: Record<string, {
    role: string;
    traits: string[];
    current_goal: string;
    relationships: Record<string, string>;
  }>;
  timeline_state: {
    current_date: string;
    time_of_day: string;
    story_day: number;
    emotional_temperature: string;
  };
  active_props_locs: string[];
  continuity_locks: string[];
}

// =============================================================================
// EMPTY DEFAULTS
// =============================================================================

export const EMPTY_CONTINUITY: ContinuitySummary = {
  time_of_day: 'DAY',
  date: 'Day 1',
  story_day: 1,
  location_current: '',
  character_states: {},
  open_threads: [],
  props_in_hand: [],
  injuries_or_changes: [],
  next_scene_intent: ''
};

export const EMPTY_CANON_PACK: CanonPack = {
  voice_tone_rules: [],
  active_cast: {},
  timeline_state: {
    current_date: '',
    time_of_day: 'DAY',
    story_day: 1,
    emotional_temperature: 'neutral'
  },
  active_props_locs: [],
  continuity_locks: []
};

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate continuity summary structure
 */
export function validateContinuitySummary(summary: any): {
  valid: boolean;
  errors: string[];
  normalized: ContinuitySummary;
} {
  const errors: string[] = [];
  
  if (!summary || typeof summary !== 'object') {
    return {
      valid: false,
      errors: ['Invalid continuity summary: not an object'],
      normalized: EMPTY_CONTINUITY
    };
  }

  // Validate time_of_day
  const validTimes = ['DAY', 'NIGHT', 'DAWN', 'DUSK'];
  if (!validTimes.includes(summary.time_of_day)) {
    errors.push(`Invalid time_of_day: ${summary.time_of_day}`);
  }

  // Validate character_states structure
  if (summary.character_states && typeof summary.character_states === 'object') {
    for (const [name, state] of Object.entries(summary.character_states)) {
      const charState = state as any;
      if (!charState.emotion) {
        errors.push(`Character ${name} missing emotion`);
      }
      if (!charState.goal) {
        errors.push(`Character ${name} missing goal`);
      }
    }
  }

  // Normalize the summary
  const normalized: ContinuitySummary = {
    time_of_day: validTimes.includes(summary.time_of_day) ? summary.time_of_day : 'DAY',
    date: summary.date || 'Day 1',
    story_day: typeof summary.story_day === 'number' ? summary.story_day : 1,
    location_current: summary.location_current || '',
    character_states: summary.character_states || {},
    open_threads: Array.isArray(summary.open_threads) ? summary.open_threads : [],
    props_in_hand: Array.isArray(summary.props_in_hand) ? summary.props_in_hand : [],
    injuries_or_changes: Array.isArray(summary.injuries_or_changes) ? summary.injuries_or_changes : [],
    next_scene_intent: summary.next_scene_intent || ''
  };

  return {
    valid: errors.length === 0,
    errors,
    normalized
  };
}

// =============================================================================
// CONTINUITY PROMPT INJECTION
// =============================================================================

/**
 * Build continuity context for injection into script block prompts
 */
export function buildContinuityContext(
  previousContinuity: ContinuitySummary | null,
  canonPack: CanonPack | null
): string {
  let context = '';

  if (canonPack && Object.keys(canonPack.active_cast).length > 0) {
    context += `
## CANON PACK

### Voice & Tone Rules
${canonPack.voice_tone_rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

### Active Cast
${Object.entries(canonPack.active_cast).map(([name, info]) => 
  `- **${name}** (${info.role}): ${info.traits.join(', ')}. Goal: ${info.current_goal}`
).join('\n')}

### Timeline
- Date: ${canonPack.timeline_state.current_date}
- Time: ${canonPack.timeline_state.time_of_day}
- Story Day: ${canonPack.timeline_state.story_day}
- Emotional Temperature: ${canonPack.timeline_state.emotional_temperature}

### Continuity Locks (INMUTABLES)
${canonPack.continuity_locks.map(l => `⚠️ ${l}`).join('\n')}

`;
  }

  if (previousContinuity && previousContinuity.next_scene_intent) {
    context += `
## PREVIOUS SCENE EXIT

- **Time**: ${previousContinuity.time_of_day}, ${previousContinuity.date}
- **Location**: ${previousContinuity.location_current}
- **Intent for next scene**: ${previousContinuity.next_scene_intent}

### Character States
${Object.entries(previousContinuity.character_states).map(([name, state]) => 
  `- **${name}**: ${state.emotion}, pursuing "${state.goal}"${state.injuries ? ` [${state.injuries}]` : ''}`
).join('\n')}

### Active Threads
${previousContinuity.open_threads.map(t => `- ${t}`).join('\n')}

### Props in Hand
${previousContinuity.props_in_hand.map(p => `- ${p}`).join('\n')}

`;
  }

  return context;
}

// =============================================================================
// CONTINUITY DIFF
// =============================================================================

export interface ContinuityDiff {
  hasChanges: boolean;
  timeChanged: boolean;
  locationChanged: boolean;
  characterChanges: string[];
  threadChanges: {
    opened: string[];
    closed: string[];
  };
  propChanges: {
    acquired: string[];
    lost: string[];
  };
}

/**
 * Calculate diff between two continuity states
 */
export function diffContinuity(
  before: ContinuitySummary,
  after: ContinuitySummary
): ContinuityDiff {
  const timeChanged = before.time_of_day !== after.time_of_day || 
                      before.story_day !== after.story_day;
  
  const locationChanged = before.location_current !== after.location_current;

  const characterChanges: string[] = [];
  for (const [name, afterState] of Object.entries(after.character_states)) {
    const beforeState = before.character_states[name];
    if (!beforeState) {
      characterChanges.push(`${name}: NEW character introduced`);
    } else if (beforeState.emotion !== afterState.emotion) {
      characterChanges.push(`${name}: ${beforeState.emotion} → ${afterState.emotion}`);
    }
  }

  const threadsOpened = after.open_threads.filter(t => !before.open_threads.includes(t));
  const threadsClosed = before.open_threads.filter(t => !after.open_threads.includes(t));

  const propsAcquired = after.props_in_hand.filter(p => !before.props_in_hand.includes(p));
  const propsLost = before.props_in_hand.filter(p => !after.props_in_hand.includes(p));

  return {
    hasChanges: timeChanged || locationChanged || characterChanges.length > 0 ||
                threadsOpened.length > 0 || threadsClosed.length > 0 ||
                propsAcquired.length > 0 || propsLost.length > 0,
    timeChanged,
    locationChanged,
    characterChanges,
    threadChanges: {
      opened: threadsOpened,
      closed: threadsClosed
    },
    propChanges: {
      acquired: propsAcquired,
      lost: propsLost
    }
  };
}

// =============================================================================
// MERGE CONTINUITY
// =============================================================================

/**
 * Merge new continuity into existing, preserving locked values
 */
export function mergeContinuity(
  existing: ContinuitySummary,
  incoming: Partial<ContinuitySummary>,
  locks: string[] = []
): ContinuitySummary {
  const merged: ContinuitySummary = {
    ...existing,
    ...incoming,
    character_states: {
      ...existing.character_states,
      ...(incoming.character_states || {})
    },
    open_threads: [
      ...new Set([
        ...existing.open_threads,
        ...(incoming.open_threads || [])
      ])
    ],
    props_in_hand: incoming.props_in_hand || existing.props_in_hand,
    injuries_or_changes: [
      ...existing.injuries_or_changes,
      ...(incoming.injuries_or_changes || [])
    ]
  };

  // Respect locks - don't allow certain changes
  // This would be expanded based on specific lock types

  return merged;
}
