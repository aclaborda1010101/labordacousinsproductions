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
  },

  // ===================
  // NEW PATTERNS
  // ===================
  walk_and_talk: {
    id: 'walk_and_talk',
    name: 'Walk and Talk',
    description: 'Steadicam coverage for characters in conversation while walking',
    sceneTypes: ['dialogue', 'business', 'exposition', 'corridor'],
    shots: [
      {
        type: 'lead_two_shot',
        name: 'Leading Two Shot',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STEADICAM',
        duration: 6,
        purpose: 'Primary coverage - both characters visible while walking',
        promptHints: 'steadicam leading, walking backward in front of subjects, both faces visible'
      },
      {
        type: 'follow_two_shot',
        name: 'Following Two Shot',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STEADICAM',
        duration: 4,
        purpose: 'Alternative coverage from behind',
        promptHints: 'steadicam following, behind and slightly to side, catching profile moments'
      },
      {
        type: 'single_a_tracking',
        name: 'Tracking Single A',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STEADICAM',
        duration: 3,
        purpose: 'Isolate speaker A while moving',
        promptHints: 'medium close-up on Character A, walking, steadicam matching pace'
      },
      {
        type: 'single_b_tracking',
        name: 'Tracking Single B',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STEADICAM',
        duration: 3,
        purpose: 'Isolate speaker B while moving',
        promptHints: 'medium close-up on Character B, walking, steadicam matching pace'
      },
      {
        type: 'wide_tracking',
        name: 'Wide Tracking Master',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STEADICAM',
        duration: 4,
        purpose: 'Establish environment while subjects move through',
        promptHints: 'wide steadicam tracking, subjects moving through environment, context visible'
      }
    ],
    editingNotes: 'Cut on footsteps for rhythm. Use wide for navigation beats. Return to lead two-shot for key dialogue.'
  },

  interrogation: {
    id: 'interrogation',
    name: 'Interrogation Scene',
    description: 'Classic police/dramatic interrogation coverage',
    sceneTypes: ['interrogation', 'confrontation', 'thriller', 'drama'],
    shots: [
      {
        type: 'master_wide',
        name: 'Interrogation Room Master',
        shotSize: 'WIDE',
        angle: 'HIGH',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Establish power dynamic and room geography',
        promptHints: 'high angle wide shot, interrogation room, table between subjects, harsh overhead lighting'
      },
      {
        type: 'interrogator_power',
        name: 'Interrogator Power Shot',
        shotSize: 'MEDIUM',
        angle: 'LOW',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show interrogator dominance',
        promptHints: 'low angle on standing interrogator, power position, looking down at subject'
      },
      {
        type: 'subject_pressure',
        name: 'Subject Under Pressure',
        shotSize: 'CLOSE_UP',
        angle: 'HIGH',
        movement: 'SLOW_DOLLY',
        duration: 3,
        purpose: 'Show subject vulnerability and stress',
        promptHints: 'high angle close-up on seated subject, sweating, uncomfortable, slow push'
      },
      {
        type: 'two_shot_tension',
        name: 'Table Two Shot',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show both characters in confrontation',
        promptHints: 'medium two-shot across table, tension between subjects, harsh lighting'
      },
      {
        type: 'hands_detail',
        name: 'Nervous Hands',
        shotSize: 'EXTREME_CLOSE_UP',
        angle: 'HIGH',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Show tells and nervous behavior',
        promptHints: 'extreme close-up on hands, fidgeting, sweating, nervous movement'
      },
      {
        type: 'mirror_pov',
        name: 'Two-Way Mirror POV',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Observer perspective, surveillance feel',
        promptHints: 'through two-way mirror, dark foreground, illuminated interrogation room'
      }
    ],
    editingNotes: 'Alternate power shots with vulnerability. Use mirror POV for audience distancing. Hold on sweating/nervous behavior.'
  },

  montage_training: {
    id: 'montage_training',
    name: 'Training Montage',
    description: 'Rocky-style training/improvement sequence',
    sceneTypes: ['montage', 'training', 'improvement', 'sports'],
    shots: [
      {
        type: 'establishing_start',
        name: 'Starting Point',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show where subject begins',
        promptHints: 'wide shot, subject struggling, early morning, weak state'
      },
      {
        type: 'effort_medium',
        name: 'Effort Medium',
        shotSize: 'MEDIUM',
        angle: 'LOW',
        movement: 'HANDHELD',
        duration: 1.5,
        purpose: 'Show work being done',
        promptHints: 'medium shot, physical effort visible, sweat, determination'
      },
      {
        type: 'detail_work',
        name: 'Training Detail',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1,
        purpose: 'Technique/skill closeup',
        promptHints: 'close-up on hands, feet, or technique being practiced'
      },
      {
        type: 'failure_moment',
        name: 'Failure Beat',
        shotSize: 'MEDIUM',
        angle: 'HIGH',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Show setback',
        promptHints: 'high angle on fallen/failed subject, defeat visible, breathing hard'
      },
      {
        type: 'time_passage',
        name: 'Time Passage',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show different time/conditions',
        promptHints: 'different lighting/weather, same activity, progress visible'
      },
      {
        type: 'success_triumphant',
        name: 'Triumphant Success',
        shotSize: 'MEDIUM',
        angle: 'LOW',
        movement: 'CRANE',
        duration: 3,
        purpose: 'Show mastery achieved',
        promptHints: 'low angle, crane up, subject triumphant, goal achieved'
      }
    ],
    editingNotes: 'Cut to music beats. Show progression arc: weak→effort→failure→persistence→success. Use speed ramps.'
  },

  car_interior: {
    id: 'car_interior',
    name: 'Car Interior Dialogue',
    description: 'Coverage for conversations inside vehicles',
    sceneTypes: ['car', 'dialogue', 'travel', 'chase'],
    shots: [
      {
        type: 'two_shot_dash',
        name: 'Dashboard Two Shot',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Show both occupants from front',
        promptHints: 'mounted on dashboard facing back, both driver and passenger visible'
      },
      {
        type: 'driver_single',
        name: 'Driver Single',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Isolate driver for dialogue',
        promptHints: 'mounted to windshield or A-pillar, driver profile, road reflections on window'
      },
      {
        type: 'passenger_single',
        name: 'Passenger Single',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Isolate passenger for dialogue',
        promptHints: 'mounted to windshield or A-pillar, passenger profile'
      },
      {
        type: 'exterior_tracking',
        name: 'Exterior Tracking',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'TRACK',
        duration: 2,
        purpose: 'Show car from outside while moving',
        promptHints: 'camera on tracking vehicle, profile view of car, subjects visible through windows'
      },
      {
        type: 'rearview_mirror',
        name: 'Rearview Mirror Shot',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Show character through mirror',
        promptHints: 'close-up on rearview mirror reflection, eyes visible'
      },
      {
        type: 'road_pov',
        name: 'Road POV',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Driver point of view of road',
        promptHints: 'POV through windshield, hood visible at bottom, road ahead'
      }
    ],
    editingNotes: 'Match exterior lighting changes. Use road POV for breathing room. Interior lights from passing sources add production value.'
  },

  flashback: {
    id: 'flashback',
    name: 'Flashback Sequence',
    description: 'Coverage for memory/flashback scenes',
    sceneTypes: ['flashback', 'memory', 'dream', 'past'],
    shots: [
      {
        type: 'trigger_closeup',
        name: 'Memory Trigger',
        shotSize: 'EXTREME_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'SLOW_DOLLY',
        duration: 2,
        purpose: 'Object or moment that triggers memory',
        promptHints: 'extreme close-up on trigger object/eyes, slow push, focus shift'
      },
      {
        type: 'dreamlike_wide',
        name: 'Dreamlike Establishing',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'SLOW_DOLLY',
        duration: 3,
        purpose: 'Establish memory world with dreamy quality',
        promptHints: 'wide shot of memory location, soft light, slightly overexposed, ethereal quality'
      },
      {
        type: 'memory_subjective',
        name: 'Subjective Memory',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'HANDHELD',
        duration: 2,
        purpose: 'First-person memory feel',
        promptHints: 'slightly handheld, not quite stable, as if remembering imperfectly'
      },
      {
        type: 'detail_symbolic',
        name: 'Symbolic Detail',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Memory focuses on significant details',
        promptHints: 'close-up on symbolically important element from past'
      },
      {
        type: 'past_present_match',
        name: 'Past/Present Match',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Visual link between then and now',
        promptHints: 'composition that matches present-day frame, different lighting/color'
      }
    ],
    editingNotes: 'Use distinct color grade for past. Dissolve in/out of flashback. More handheld suggests more traumatic memory.'
  },

  heist_sequence: {
    id: 'heist_sequence',
    name: 'Heist / Parallel Action',
    description: 'Multi-location synchronized action coverage',
    sceneTypes: ['heist', 'parallel', 'thriller', 'action'],
    shots: [
      {
        type: 'location_a_establish',
        name: 'Location A Establish',
        shotSize: 'WIDE',
        angle: 'HIGH',
        movement: 'DRONE',
        duration: 2,
        purpose: 'Establish first location in heist',
        promptHints: 'aerial or high angle of Location A, establishing geography'
      },
      {
        type: 'location_b_establish',
        name: 'Location B Establish',
        shotSize: 'WIDE',
        angle: 'HIGH',
        movement: 'DRONE',
        duration: 2,
        purpose: 'Establish second location in heist',
        promptHints: 'aerial or high angle of Location B, establishing geography'
      },
      {
        type: 'action_a',
        name: 'Team A Action',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'HANDHELD',
        duration: 1.5,
        purpose: 'Show action at Location A',
        promptHints: 'handheld medium, urgent action, Team A executing plan'
      },
      {
        type: 'action_b',
        name: 'Team B Action',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'HANDHELD',
        duration: 1.5,
        purpose: 'Show simultaneous action at Location B',
        promptHints: 'handheld medium, urgent action, Team B executing plan'
      },
      {
        type: 'clock_insert',
        name: 'Clock/Time Insert',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1,
        purpose: 'Show synchronization element',
        promptHints: 'close-up on watch, clock, or timing device'
      },
      {
        type: 'complication',
        name: 'Complication Shot',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Something goes wrong',
        promptHints: 'reaction to unexpected complication, plan deviation'
      },
      {
        type: 'convergence',
        name: 'Convergence Wide',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'CRANE',
        duration: 3,
        purpose: 'Parallel threads come together',
        promptHints: 'wide shot as multiple story threads converge at climax point'
      }
    ],
    editingNotes: 'Cross-cut accelerates toward climax. Use clock inserts to build tension. Match intensity between locations.'
  },

  courtroom: {
    id: 'courtroom',
    name: 'Courtroom Drama',
    description: 'Legal drama courtroom coverage',
    sceneTypes: ['courtroom', 'legal', 'drama', 'trial'],
    shots: [
      {
        type: 'wide_establish',
        name: 'Courtroom Establish',
        shotSize: 'WIDE',
        angle: 'HIGH',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Establish courtroom and all participants',
        promptHints: 'high wide shot showing judge, jury, defendant, lawyers, gallery'
      },
      {
        type: 'judge_authority',
        name: 'Judge Authority Shot',
        shotSize: 'MEDIUM',
        angle: 'LOW',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show judge power position',
        promptHints: 'low angle on judge at bench, gavel in frame, authority'
      },
      {
        type: 'lawyer_performance',
        name: 'Lawyer Performance',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'TRACK',
        duration: 3,
        purpose: 'Follow lawyer making argument',
        promptHints: 'tracking shot following lawyer addressing jury/witness'
      },
      {
        type: 'witness_pressure',
        name: 'Witness Under Pressure',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show witness being questioned',
        promptHints: 'close-up on witness in stand, nervousness or defiance'
      },
      {
        type: 'jury_reaction',
        name: 'Jury Reaction',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Show jury response to testimony',
        promptHints: 'medium shot on section of jury, watching, judging'
      },
      {
        type: 'defendant_reaction',
        name: 'Defendant Reaction',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show defendant during key moments',
        promptHints: 'medium close-up on defendant table, reaction to testimony'
      },
      {
        type: 'gallery_audience',
        name: 'Gallery Shot',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Show public/family reaction',
        promptHints: 'wide shot of gallery seats, family members, press'
      }
    ],
    editingNotes: 'Build to verdict. Use reaction shots liberally. Lawyer tracking shots for monologues. Hold on witness for pressure.'
  },

  performance_concert: {
    id: 'performance_concert',
    name: 'Musical Performance',
    description: 'Coverage for live music or performance scenes',
    sceneTypes: ['concert', 'music', 'performance', 'band'],
    shots: [
      {
        type: 'wide_stage',
        name: 'Wide Stage Master',
        shotSize: 'WIDE',
        angle: 'HIGH',
        movement: 'CRANE',
        duration: 4,
        purpose: 'Show full stage and performer energy',
        promptHints: 'crane wide shot of stage, lighting rig visible, performance energy'
      },
      {
        type: 'performer_hero',
        name: 'Performer Hero Shot',
        shotSize: 'MEDIUM',
        angle: 'LOW',
        movement: 'DOLLY',
        duration: 3,
        purpose: 'Rock star hero angle',
        promptHints: 'low angle dolly toward performer, backlit, powerful stance'
      },
      {
        type: 'instrument_detail',
        name: 'Instrument Close-Up',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Show musicianship detail',
        promptHints: 'close-up on hands playing instrument, technical skill visible'
      },
      {
        type: 'crowd_energy',
        name: 'Crowd Reaction',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'HANDHELD',
        duration: 2,
        purpose: 'Show audience energy and response',
        promptHints: 'wide handheld on crowd, hands up, energy, possibly from stage POV'
      },
      {
        type: 'face_emotion',
        name: 'Performance Emotion',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Capture emotional delivery',
        promptHints: 'close-up on face during emotional moment, sweat, passion'
      },
      {
        type: 'band_interaction',
        name: 'Band Interaction',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'PAN',
        duration: 2,
        purpose: 'Show chemistry between performers',
        promptHints: 'medium shot capturing interplay between band members'
      }
    ],
    editingNotes: 'Cut to music beats. Use wide for drops, close for intimate lyrics. Match camera energy to song energy.'
  },

  dinner_party: {
    id: 'dinner_party',
    name: 'Dinner Party / Ensemble',
    description: 'Multiple characters at table/gathering',
    sceneTypes: ['dinner', 'party', 'ensemble', 'gathering'],
    shots: [
      {
        type: 'overhead_table',
        name: 'Overhead Table',
        shotSize: 'WIDE',
        angle: 'BIRDS_EYE',
        movement: 'STATIC',
        duration: 3,
        purpose: 'God-like view of table dynamics',
        promptHints: 'bird\'s eye view of entire table, all guests visible, food laid out'
      },
      {
        type: 'dolly_around',
        name: 'Table Orbit',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'DOLLY',
        duration: 5,
        purpose: 'Move around table catching multiple conversations',
        promptHints: 'dolly orbiting table, passing behind guests, catching fragments of conversation'
      },
      {
        type: 'speaker_focus',
        name: 'Featured Speaker',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Isolate main speaker',
        promptHints: 'medium close-up on person commanding table attention, others blurred'
      },
      {
        type: 'listener_reactions',
        name: 'Listener Row',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show multiple reactions simultaneously',
        promptHints: 'medium shot capturing 2-3 listeners reacting to speaker'
      },
      {
        type: 'under_table',
        name: 'Under Table Detail',
        shotSize: 'CLOSE_UP',
        angle: 'LOW',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Secret moments under table',
        promptHints: 'low shot under tablecloth, feet, hands, secret exchange'
      },
      {
        type: 'end_of_table',
        name: 'Axis Shot',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show full table from end',
        promptHints: 'wide shot from head of table, symmetrical arrangement, host at end'
      }
    ],
    editingNotes: 'Orbit establishes geography. Use under-table for secrets. Featured speaker for reveals. Match energy to conversation tension.'
  },

  sports_event: {
    id: 'sports_event',
    name: 'Sports Event',
    description: 'Coverage for athletic competition',
    sceneTypes: ['sports', 'game', 'race', 'competition'],
    shots: [
      {
        type: 'stadium_wide',
        name: 'Stadium Establish',
        shotSize: 'EXTREME_WIDE',
        angle: 'HIGH',
        movement: 'DRONE',
        duration: 3,
        purpose: 'Establish venue and scale of event',
        promptHints: 'drone shot of stadium/venue, crowd visible, scale of event'
      },
      {
        type: 'action_medium',
        name: 'Game Action',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'PAN',
        duration: 2,
        purpose: 'Track key play',
        promptHints: 'sideline angle, panning with action, player visible'
      },
      {
        type: 'hero_slow_mo',
        name: 'Hero Moment Slo-Mo',
        shotSize: 'MEDIUM_CLOSE_UP',
        angle: 'LOW',
        movement: 'STATIC',
        duration: 3,
        purpose: 'Dramatic moment in slow motion',
        promptHints: 'low angle, slow motion, peak athletic moment, sweat visible'
      },
      {
        type: 'bench_reaction',
        name: 'Bench Reaction',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Teammates/coaches react',
        promptHints: 'bench shot, team reacting to play, emotion visible'
      },
      {
        type: 'crowd_celebration',
        name: 'Crowd Celebration',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'HANDHELD',
        duration: 2,
        purpose: 'Fan energy and reaction',
        promptHints: 'crowd section erupting, cheering, coordinated celebration'
      },
      {
        type: 'scoreboard',
        name: 'Scoreboard Insert',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1,
        purpose: 'Show score/time',
        promptHints: 'scoreboard showing critical score or time remaining'
      },
      {
        type: 'defeat_moment',
        name: 'Defeat Reaction',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show devastation of loss',
        promptHints: 'close-up on losing player/team, dejection, exhaustion'
      }
    ],
    editingNotes: 'Match edit rhythm to game pace. Slow-mo for key moments. Crowd for energy. Bench for emotional stakes.'
  },

  wedding: {
    id: 'wedding',
    name: 'Wedding Ceremony',
    description: 'Coverage for wedding/ceremony scenes',
    sceneTypes: ['wedding', 'ceremony', 'ritual', 'celebration'],
    shots: [
      {
        type: 'venue_establish',
        name: 'Venue Wide',
        shotSize: 'WIDE',
        angle: 'HIGH',
        movement: 'DRONE',
        duration: 3,
        purpose: 'Establish beautiful venue',
        promptHints: 'aerial wide of ceremony venue, decorations visible, guests seated'
      },
      {
        type: 'altar_two_shot',
        name: 'Altar Two Shot',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 4,
        purpose: 'Show couple together at altar',
        promptHints: 'medium shot of couple at altar, officiant partially visible, holding hands'
      },
      {
        type: 'bride_closeup',
        name: 'Bride Close-Up',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Capture bride emotion',
        promptHints: 'close-up on bride, tears of joy, vows, emotional moment'
      },
      {
        type: 'groom_reaction',
        name: 'Groom Reaction',
        shotSize: 'CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show groom first seeing bride',
        promptHints: 'close-up on groom, seeing bride walk down aisle, emotional reaction'
      },
      {
        type: 'ring_detail',
        name: 'Ring Exchange',
        shotSize: 'EXTREME_CLOSE_UP',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 2,
        purpose: 'Show ring exchange moment',
        promptHints: 'extreme close-up on hands exchanging rings, detail of ring sliding on'
      },
      {
        type: 'family_reactions',
        name: 'Family Reactions',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'STATIC',
        duration: 1.5,
        purpose: 'Show parents/family crying/happy',
        promptHints: 'medium shot of parent row, tears, happy pride, emotional reaction'
      },
      {
        type: 'first_kiss',
        name: 'First Kiss',
        shotSize: 'MEDIUM',
        angle: 'EYE_LEVEL',
        movement: 'SLOW_DOLLY',
        duration: 3,
        purpose: 'The ceremonial kiss',
        promptHints: 'medium shot, slow push as couple leans in for first kiss as married'
      },
      {
        type: 'aisle_exit',
        name: 'Aisle Exit',
        shotSize: 'WIDE',
        angle: 'EYE_LEVEL',
        movement: 'STEADICAM',
        duration: 4,
        purpose: 'Couple walking back up aisle',
        promptHints: 'steadicam following behind couple walking up aisle, guests cheering'
      }
    ],
    editingNotes: 'Slow pacing for ceremony. Reaction shots are gold. Ring and kiss are key inserts. Build to kiss as climax.'
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

/**
 * Map coverage pattern shots to angle request format for generate-angle-variants
 */
export interface AngleRequest {
  id: string;
  shotType: string;
  shotSize: string;
  angle: string;
  movement: string;
  duration: number;
  purpose: string;
  promptHints: string;
}

export function mapCoverageToAngleRequests(pattern: CoveragePattern): AngleRequest[] {
  return pattern.shots.map(shot => ({
    id: shot.type,
    shotType: shot.type,
    shotSize: shot.shotSize,
    angle: shot.angle,
    movement: shot.movement,
    duration: shot.duration,
    purpose: shot.purpose,
    promptHints: shot.promptHints,
  }));
}

/**
 * Get all pattern IDs
 */
export function getAllPatternIds(): string[] {
  return Object.keys(COVERAGE_PATTERNS);
}

/**
 * Detect best coverage pattern based on scene metadata
 */
export function detectCoveragePattern(
  sceneType: string,
  characterCount: number,
  mood?: string
): string {
  const type = sceneType?.toLowerCase() || '';
  const moodLower = mood?.toLowerCase() || '';

  // Action sequences
  if (type.includes('action') || type.includes('chase') || type.includes('fight')) {
    return 'action_sequence';
  }

  // Suspense/Horror
  if (type.includes('suspense') || type.includes('horror') || type.includes('thriller') ||
      moodLower.includes('tense') || moodLower.includes('scary')) {
    return 'suspense';
  }

  // Emotional/Intimate
  if (type.includes('emotion') || type.includes('intimate') || type.includes('romance') ||
      moodLower.includes('sad') || moodLower.includes('romantic')) {
    return 'emotional_intimate';
  }

  // Establishing shots
  if (type.includes('establish') || type.includes('opening') || type.includes('transition')) {
    return 'establishing';
  }

  // Group scenes
  if (characterCount >= 3) {
    return 'dialogue_group';
  }

  // Default to two-person dialogue
  return 'dialogue_2_characters';
}
