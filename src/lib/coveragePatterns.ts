/**
 * Hollywood Standard Coverage Patterns
 * These define the standard shot sequences for different scene types
 */

export interface CoverageShot {
  type: string;
  name: string;
  shotSize: 'EXTREME_WIDE' | 'WIDE' | 'MEDIUM_WIDE' | 'MEDIUM' | 'MEDIUM_CLOSE_UP' | 'CLOSE_UP' | 'EXTREME_CLOSE_UP';
  angle: 'EYE_LEVEL' | 'LOW' | 'HIGH' | 'DUTCH' | 'BIRDS_EYE' | 'WORMS_EYE';
  movement: 'STATIC' | 'PAN' | 'TILT' | 'DOLLY' | 'TRACK' | 'CRANE' | 'HANDHELD' | 'STEADICAM' | 'DRONE' | 'SLOW_DOLLY';
  duration: number; // seconds
  purpose: string;
  promptHints: string;
}

export interface CoveragePattern {
  id: string;
  name: string;
  description: string;
  sceneTypes: string[];
  shots: CoverageShot[];
  editingNotes: string;
}

export const COVERAGE_PATTERNS: Record<string, CoveragePattern> = {
  // Two-character dialogue (most common)
  dialogue_2_characters: {
    id: 'dialogue_2_characters',
    name: 'Two-Person Dialogue',
    description: 'Standard coverage for a conversation between two characters',
    sceneTypes: ['dialogue', 'interview', 'confrontation'],
    shots: [
      {
        type: 'master',
        name: 'Master Wide',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Establish spatial relationship between characters',
        promptHints: 'wide shot showing both characters in frame, establishing the space'
      },
      {
        type: 'two_shot',
        name: 'Two Shot Medium',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show both characters interacting',
        promptHints: 'medium shot framing both characters from waist up'
      },
      {
        type: 'ots_a',
        name: 'Over-the-Shoulder A',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Focus on Character A while maintaining B in frame',
        promptHints: 'over-the-shoulder shot, camera behind Character B, focusing on Character A'
      },
      {
        type: 'ots_b',
        name: 'Over-the-Shoulder B',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Focus on Character B while maintaining A in frame',
        promptHints: 'over-the-shoulder shot, camera behind Character A, focusing on Character B'
      },
      {
        type: 'single_a',
        name: 'Single Close-Up A',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Capture emotional reaction of Character A',
        promptHints: 'close-up on Character A face, intimate framing, emotional expression'
      },
      {
        type: 'single_b',
        name: 'Single Close-Up B',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Capture emotional reaction of Character B',
        promptHints: 'close-up on Character B face, intimate framing, emotional expression'
      },
      {
        type: 'insert',
        name: 'Insert/Cutaway',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1,
        purpose: 'Detail shot for emphasis or transition',
        promptHints: 'close-up detail shot, hands, object, or environment detail'
      }
    ],
    editingNotes: 'Cut on action or dialogue. Use reaction shots to build tension. Master for resets.'
  },

  // Group scene (3+ characters)
  dialogue_group: {
    id: 'dialogue_group',
    name: 'Group Conversation',
    description: 'Coverage for scenes with 3 or more characters',
    sceneTypes: ['meeting', 'dinner', 'party', 'group_discussion'],
    shots: [
      {
        type: 'master_wide',
        name: 'Master Establishing',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Establish all characters and their positions',
        promptHints: 'wide establishing shot showing entire group, clear spatial arrangement'
      },
      {
        type: 'master_moving',
        name: 'Moving Master',
        shotSize: 'MEDIUM_WIDE',
        angle: 'EYE_LEVEL',
        movement: 'DOLLY',
        duration: 4,
        purpose: 'Dynamic coverage following conversation flow',
        promptHints: 'medium wide tracking shot, camera slowly dollying around the group'
      },
      {
        type: 'featured_single',
        name: 'Featured Speaker',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Isolate the main speaker',
        promptHints: 'medium close-up on speaking character, others slightly visible in background'
      },
      {
        type: 'reaction_group',
        name: 'Group Reaction',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Show group reaction to statement',
        promptHints: 'medium shot capturing 2-3 listeners reacting'
      },
      {
        type: 'detail',
        name: 'Detail Insert',
        shotSize: 'EXTREME_CLOSE_UP',
        angle: 'HIGH',
        movement: 'STATIC',
        duration: 1,
        purpose: 'Emphasis on key object or gesture',
        promptHints: 'extreme close-up on hands, document, or significant prop'
      }
    ],
    editingNotes: 'Use master for orientation. Cut to featured speaker for important dialogue. Reactions build dynamics.'
  },

  // Action sequence
  action_sequence: {
    id: 'action_sequence',
    name: 'Action Sequence',
    description: 'Fast-paced coverage for action and chase scenes',
    sceneTypes: ['fight', 'chase', 'action', 'stunt'],
    shots: [
      {
        type: 'wide_action',
        name: 'Wide Action Master',
        shotSize: 'WIDE',
        angle: 'HIGH',
        movement: 'CRANE',
        duration: 2,
        purpose: 'Establish action geography',
        promptHints: 'wide dynamic shot, high angle, showing full action environment'
      },
      {
        type: 'medium_action',
        name: 'Medium Action',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'HANDHELD',
        duration: 1.5,
        purpose: 'Capture primary action',
        promptHints: 'handheld medium shot, slight motion blur, dynamic movement'
      },
      {
        type: 'close_impact',
        name: 'Close Impact',
        shotSize: 'CLOSE_UP',
        angle: 'LOW',
        movement: 'STATIC',
        duration: 0.5,
        purpose: 'Punctuate key impacts',
        promptHints: 'close-up impact shot, low angle, dramatic moment frozen'
      },
      {
        type: 'pov',
        name: 'POV Shot',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'HANDHELD',
        duration: 1,
        purpose: 'Immerse viewer in character perspective',
        promptHints: 'point-of-view shot, first-person perspective, handheld motion'
      },
      {
        type: 'reaction_hero',
        name: 'Hero Reaction',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1,
        purpose: 'Show hero determination/fear',
        promptHints: 'close-up hero face, intense expression, action context'
      },
      {
        type: 'speed_insert',
        name: 'Speed Insert',
        shotSize: 'EXTREME_CLOSE_UP',
        angle: 'DUTCH',
        movement: 'STATIC',
        duration: 0.5,
        purpose: 'Quick detail to amp tension',
        promptHints: 'extreme close-up, dutch angle, motion-implied detail'
      }
    ],
    editingNotes: 'Quick cuts (0.5-1.5s). Never hold on action too long. Use speed ramps in post.'
  },

  // Establishing/Transition
  establishing: {
    id: 'establishing',
    name: 'Establishing Sequence',
    description: 'Location establishing and time-of-day shots',
    sceneTypes: ['opening', 'location_change', 'time_passage'],
    shots: [
      {
        type: 'extreme_wide',
        name: 'Extreme Wide Establishing',
        shotSize: 'EXTREME_WIDE',
        angle: 'HIGH',
        movement: 'DRONE',
        duration: 3,
        purpose: 'Establish location at macro level',
        promptHints: 'aerial/drone extreme wide shot, establishing cityscape or landscape'
      },
      {
        type: 'wide_building',
        name: 'Building/Location Wide',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show specific building or location',
        promptHints: 'wide shot of specific location exterior, architectural detail visible'
      },
      {
        type: 'detail_environment',
        name: 'Environmental Detail',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'PAN',
        duration: 2,
        purpose: 'Add texture and atmosphere',
        promptHints: 'medium shot environmental detail, panning slowly across scene'
      },
      {
        type: 'transition_in',
        name: 'Transition Into Scene',
        shotSize: 'MEDIUM_WIDE',
        angle: 'EYE_LEVEL',
        movement: 'DOLLY',
        duration: 2,
        purpose: 'Move into the action space',
        promptHints: 'dolly-in shot, moving from exterior to interior or wide to scene'
      }
    ],
    editingNotes: 'Hold establishing shots longer. Use atmospheric sound design. Can use time-lapse for transitions.'
  },

  // Emotional/Intimate
  emotional_intimate: {
    id: 'emotional_intimate',
    name: 'Emotional/Intimate Scene',
    description: 'Coverage for emotional beats and intimate moments',
    sceneTypes: ['romance', 'grief', 'revelation', 'emotional_climax'],
    shots: [
      {
        type: 'wide_context',
        name: 'Wide Context',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Establish emotional space and isolation',
        promptHints: 'wide shot emphasizing character in space, emotional isolation or intimacy'
      },
      {
        type: 'two_shot_close',
        name: 'Intimate Two-Shot',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Capture connection between characters',
        promptHints: 'intimate two-shot, faces close, emotional connection visible'
      },
      {
        type: 'extreme_cu',
        name: 'Extreme Close-Up Face',
        shotSize: 'EXTREME_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Capture micro-expressions',
        promptHints: 'extreme close-up eyes and face, tears or subtle emotion visible'
      },
      {
        type: 'hands_detail',
        name: 'Hands/Touch Detail',
        shotSize: 'CLOSE_UP',
        angle: 'HIGH',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show physical connection',
        promptHints: 'close-up on hands touching, holding, or reaching'
      },
      {
        type: 'profile_silhouette',
        name: 'Profile/Silhouette',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Artistic emotional emphasis',
        promptHints: 'profile shot with dramatic lighting, possible silhouette, atmospheric'
      }
    ],
    editingNotes: 'Slower cuts. Let moments breathe. Use silence and ambient sound. ECUs for peak emotion.'
  },

  // Suspense/Horror
  suspense: {
    id: 'suspense',
    name: 'Suspense/Tension',
    description: 'Coverage designed to build tension and dread',
    sceneTypes: ['horror', 'thriller', 'suspense', 'mystery'],
    shots: [
      {
        type: 'wide_ominous',
        name: 'Ominous Wide',
        shotSize: 'WIDE',
        angle: 'LOW',
        movement: 'SLOW_DOLLY',
        duration: 4,
        purpose: 'Establish threatening environment',
        promptHints: 'wide shot, low angle, ominous atmosphere, slow creeping movement'
      },
      {
        type: 'stalker_pov',
        name: 'Stalker POV',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STEADICAM',
        duration: 3,
        purpose: 'Imply unseen threat',
        promptHints: 'steadicam POV, watching subject unaware, voyeuristic framing'
      },
      {
        type: 'tight_face',
        name: 'Tight Reaction',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Capture fear and tension',
        promptHints: 'tight close-up, fearful expression, shallow depth of field'
      },
      {
        type: 'negative_space',
        name: 'Negative Space',
        shotSize: 'MEDIUM_WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Create unease with empty frame space',
        promptHints: 'character positioned to one side, large empty/dark space in frame'
      },
      {
        type: 'reveal',
        name: 'Reveal Shot',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'PAN',
        duration: 2,
        purpose: 'Reveal threat or surprise',
        promptHints: 'pan or rack focus revealing hidden element or threat'
      }
    ],
    editingNotes: 'Longer holds build tension. Cut quickly for scares. Sound design is 50% of horror.'
  }
};

/**
 * Get recommended coverage pattern for a scene type
 */
export function getRecommendedCoverage(sceneType: string): CoveragePattern | null {
  for (const pattern of Object.values(COVERAGE_PATTERNS)) {
    if (pattern.sceneTypes.includes(sceneType.toLowerCase())) {
      return pattern;
    }
  }
  // Default to dialogue_2_characters if no match
  return COVERAGE_PATTERNS.dialogue_2_characters;
}

/**
 * Get shot prompt hints for injection into generation
 */
export function getShotPromptHints(patternId: string, shotType: string): string {
  const pattern = COVERAGE_PATTERNS[patternId];
  if (!pattern) return '';
  
  const shot = pattern.shots.find(s => s.type === shotType);
  return shot?.promptHints || '';
}

/**
 * Calculate total coverage duration
 */
export function calculateCoverageDuration(patternId: string): number {
  const pattern = COVERAGE_PATTERNS[patternId];
  if (!pattern) return 0;
  
  return pattern.shots.reduce((total, shot) => total + shot.duration, 0);
}
