/**
 * CINEMATIC TRANSITION LIBRARY
 * Professional film/TV transition types for the AI Director
 */

export interface CinematicTransition {
  id: string;
  name: string;
  category: 'cut' | 'optical' | 'camera' | 'creative';
  description: string;
  emotionalEffect: string;
  useCase: string;
  promptInjection: string;
  keyframeRequirements: {
    endFrameA: string;
    startFrameB: string;
  };
  technicalNotes: string;
  famousExamples: string[];
  aiRisks: string[];
}

export const TRANSITION_LIBRARY: Record<string, CinematicTransition> = {
  // ===================
  // CUT TRANSITIONS
  // ===================
  hard_cut: {
    id: 'hard_cut',
    name: 'Hard Cut',
    category: 'cut',
    description: 'Instantaneous switch from one shot to another',
    emotionalEffect: 'Neutral, keeps pace, standard narrative flow',
    useCase: 'Standard scene continuity, dialogue exchanges',
    promptInjection: 'TRANSITION: Hard cut - ensure visual continuity in action/position',
    keyframeRequirements: {
      endFrameA: 'Clear action or expression endpoint',
      startFrameB: 'Natural continuation of motion or new scene established',
    },
    technicalNotes: 'Match action or cut on dialogue. Avoid jump cuts unless intentional.',
    famousExamples: ['Every film - the default transition'],
    aiRisks: ['Position discontinuity if not careful with keyframes'],
  },

  jump_cut: {
    id: 'jump_cut',
    name: 'Jump Cut',
    category: 'cut',
    description: 'Cut that breaks temporal/spatial continuity within same scene',
    emotionalEffect: 'Jarring, anxiety, passage of time, fragmented psychology',
    useCase: 'Montages, disorientation, time compression, nervous energy',
    promptInjection: 'TRANSITION: Jump cut - same framing, different moment, jarring skip in time',
    keyframeRequirements: {
      endFrameA: 'Character in specific pose/expression',
      startFrameB: 'Same framing but different pose/expression/time',
    },
    technicalNotes: 'Keep camera angle identical. 30-degree rule is intentionally broken.',
    famousExamples: ['Breathless (Godard)', 'Royal Tenenbaums', 'Requiem for a Dream'],
    aiRisks: ['May look like error if not stylistically consistent'],
  },

  match_cut: {
    id: 'match_cut',
    name: 'Match Cut',
    category: 'cut',
    description: 'Cut that matches visual elements, shapes, or actions between scenes',
    emotionalEffect: 'Poetic connection, thematic linking, smooth time/space jump',
    useCase: 'Scene transitions, thematic connections, time jumps',
    promptInjection: 'TRANSITION: Match cut - end frame shape/action must mirror start frame of next scene',
    keyframeRequirements: {
      endFrameA: 'Distinct shape, movement, or action (e.g., spinning wheel, falling object)',
      startFrameB: 'Matching shape, movement, or action in new context',
    },
    technicalNotes: 'Plan composition carefully. Shape, color, or movement must align.',
    famousExamples: ['2001: A Space Odyssey (bone to satellite)', 'Lawrence of Arabia (match to sun)'],
    aiRisks: ['Difficult to achieve - requires precise keyframe planning'],
  },

  smash_cut: {
    id: 'smash_cut',
    name: 'Smash Cut',
    category: 'cut',
    description: 'Abrupt cut from quiet/tense moment to loud/intense one (or vice versa)',
    emotionalEffect: 'Shock, surprise, comedic timing, dramatic emphasis',
    useCase: 'Horror reveals, comedy beats, dramatic irony',
    promptInjection: 'TRANSITION: Smash cut - maximum contrast between scenes (quiet to loud, calm to chaos)',
    keyframeRequirements: {
      endFrameA: 'Quiet, contemplative, or building tension',
      startFrameB: 'Explosive action, loud environment, or dramatic reveal',
    },
    technicalNotes: 'Sound design is crucial. Visual contrast should be extreme.',
    famousExamples: ['Fight Club', 'Hot Fuzz', 'Breaking Bad'],
    aiRisks: ['Needs strong audio design to land properly'],
  },

  j_cut: {
    id: 'j_cut',
    name: 'J-Cut',
    category: 'cut',
    description: 'Audio from next scene begins before the visual cut',
    emotionalEffect: 'Anticipation, smooth flow, narrative pull forward',
    useCase: 'Scene transitions, dialogue continuity, building anticipation',
    promptInjection: 'TRANSITION: J-Cut - audio of next scene bleeds into current visual',
    keyframeRequirements: {
      endFrameA: 'Visual of current scene with implied incoming audio',
      startFrameB: 'Visual reveals source of audio that was already playing',
    },
    technicalNotes: 'Audio editing in post. Visuals should feel like natural continuation.',
    famousExamples: ['Apocalypse Now', 'The Godfather', 'Any quality drama'],
    aiRisks: ['Requires post-production audio work'],
  },

  l_cut: {
    id: 'l_cut',
    name: 'L-Cut',
    category: 'cut',
    description: 'Audio from previous scene continues after visual cuts to new scene',
    emotionalEffect: 'Lingering emotion, connection between scenes, reflection',
    useCase: 'Dialogue overlap, emotional continuity, character reactions',
    promptInjection: 'TRANSITION: L-Cut - current audio continues over next scene visual',
    keyframeRequirements: {
      endFrameA: 'Character speaking or significant audio',
      startFrameB: 'Listener reaction or related visual with continued audio',
    },
    technicalNotes: 'Common in dialogue. Shows reaction to what is being said.',
    famousExamples: ['Every quality dialogue scene', 'The Godfather', 'Zodiac'],
    aiRisks: ['Requires post-production audio work'],
  },

  cross_cut: {
    id: 'cross_cut',
    name: 'Cross-Cut / Parallel Editing',
    category: 'cut',
    description: 'Cutting between two or more scenes happening simultaneously',
    emotionalEffect: 'Tension, suspense, dramatic irony, building to convergence',
    useCase: 'Chase sequences, heists, rescue missions, last-minute saves',
    promptInjection: 'TRANSITION: Cross-cut - alternate between parallel action sequences',
    keyframeRequirements: {
      endFrameA: 'Action in progress in Location A',
      startFrameB: 'Simultaneous action in Location B',
    },
    technicalNotes: 'Pacing should accelerate toward climax. Match intensity between strands.',
    famousExamples: ['The Godfather baptism', 'Inception', 'The Dark Knight'],
    aiRisks: ['Requires clear visual distinction between locations'],
  },

  cutaway: {
    id: 'cutaway',
    name: 'Cutaway',
    category: 'cut',
    description: 'Brief cut to related shot before returning to main action',
    emotionalEffect: 'Context, emphasis, reaction, breathing room',
    useCase: 'Reactions, environment details, passage of time',
    promptInjection: 'TRANSITION: Cutaway - brief insert of related detail or reaction',
    keyframeRequirements: {
      endFrameA: 'Main action in progress',
      startFrameB: 'Detail, reaction, or environment shot',
    },
    technicalNotes: 'Usually 1-3 seconds. Should add information or emphasis.',
    famousExamples: ['Every film uses cutaways for pacing and information'],
    aiRisks: ['Must be clearly related to main action'],
  },

  // ===================
  // OPTICAL TRANSITIONS
  // ===================
  dissolve: {
    id: 'dissolve',
    name: 'Dissolve / Cross-Dissolve',
    category: 'optical',
    description: 'Gradual blend from one image to another',
    emotionalEffect: 'Passage of time, dreamlike state, memory, connection',
    useCase: 'Time passage, flashbacks, romantic connections, dream sequences',
    promptInjection: 'TRANSITION: Dissolve - gradual blend, both images momentarily visible',
    keyframeRequirements: {
      endFrameA: 'Static or slow movement, clear composition',
      startFrameB: 'Complementary composition for overlay moment',
    },
    technicalNotes: '1-3 second dissolve typical. Longer for more dramatic effect.',
    famousExamples: ['Citizen Kane', 'Classic Hollywood', 'Romantic montages'],
    aiRisks: ['Post-production effect - generate clean endpoints'],
  },

  fade_to_black: {
    id: 'fade_to_black',
    name: 'Fade to Black',
    category: 'optical',
    description: 'Image gradually darkens to complete black',
    emotionalEffect: 'Finality, passage of significant time, chapter end, death',
    useCase: 'Scene endings, act breaks, significant emotional moments, film end',
    promptInjection: 'TRANSITION: Fade to black - scene darkens, moment of finality',
    keyframeRequirements: {
      endFrameA: 'Final image that warrants significant pause',
      startFrameB: 'New scene begins after black',
    },
    technicalNotes: 'Duration depends on emotional weight. 1-3 seconds typical.',
    famousExamples: ['End of films', 'Act breaks in prestige TV'],
    aiRisks: ['Post-production effect'],
  },

  fade_from_black: {
    id: 'fade_from_black',
    name: 'Fade from Black',
    category: 'optical',
    description: 'Image gradually emerges from complete black',
    emotionalEffect: 'New beginning, awakening, fresh chapter, hope',
    useCase: 'Scene openings, new acts, after significant pause',
    promptInjection: 'TRANSITION: Fade from black - scene emerges, new beginning',
    keyframeRequirements: {
      endFrameA: 'Black frame (from previous fade)',
      startFrameB: 'First establishing image of new scene',
    },
    technicalNotes: 'Often paired with music cue. Sets tone for new section.',
    famousExamples: ['Opening of films', 'Act beginnings'],
    aiRisks: ['Post-production effect'],
  },

  fade_to_white: {
    id: 'fade_to_white',
    name: 'Fade to White / White Out',
    category: 'optical',
    description: 'Image gradually brightens to complete white',
    emotionalEffect: 'Transcendence, death, heavenly, explosion, memory fade',
    useCase: 'Near-death experiences, explosions, dream endings, spiritual moments',
    promptInjection: 'TRANSITION: Fade to white - overwhelming light, transcendence',
    keyframeRequirements: {
      endFrameA: 'Image with increasing brightness',
      startFrameB: 'New scene after white clears',
    },
    technicalNotes: 'Less common than fade to black. Use for specific emotional effect.',
    famousExamples: ['Contact', 'Gladiator (death scene)', 'Breaking Bad'],
    aiRisks: ['Post-production effect'],
  },

  iris_in: {
    id: 'iris_in',
    name: 'Iris In',
    category: 'optical',
    description: 'Circle opens from black to reveal image',
    emotionalEffect: 'Classic cinema, theatrical, spotlighting, vintage feel',
    useCase: 'Period pieces, comedic effect, spotlight on character',
    promptInjection: 'TRANSITION: Iris in - circular reveal from black',
    keyframeRequirements: {
      endFrameA: 'Black (or previous iris out)',
      startFrameB: 'Subject centered for circular reveal',
    },
    technicalNotes: 'Classic silent film technique. Use sparingly in modern cinema.',
    famousExamples: ['Looney Tunes', 'Silent films', 'O Brother Where Art Thou'],
    aiRisks: ['Post-production effect - stylistic choice'],
  },

  iris_out: {
    id: 'iris_out',
    name: 'Iris Out',
    category: 'optical',
    description: 'Circle closes to black from image',
    emotionalEffect: 'Classic cinema, theatrical, focused ending, vintage feel',
    useCase: 'Period pieces, comedic endings, scene buttons',
    promptInjection: 'TRANSITION: Iris out - circular close to black',
    keyframeRequirements: {
      endFrameA: 'Subject centered for circular close',
      startFrameB: 'Black (or new scene after)',
    },
    technicalNotes: 'Often ends on a character face or significant object.',
    famousExamples: ['Looney Tunes "That\'s All Folks"', 'Silent films'],
    aiRisks: ['Post-production effect - stylistic choice'],
  },

  wipe: {
    id: 'wipe',
    name: 'Wipe',
    category: 'optical',
    description: 'New image pushes old image off screen',
    emotionalEffect: 'Energetic, adventurous, classic serial feel',
    useCase: 'Scene changes, parallel action, adventure films',
    promptInjection: 'TRANSITION: Wipe - new scene pushes across frame',
    keyframeRequirements: {
      endFrameA: 'Scene A complete',
      startFrameB: 'Scene B begins, enters from edge',
    },
    technicalNotes: 'Star Wars signature. Direction and shape can vary.',
    famousExamples: ['Star Wars (all films)', 'Indiana Jones', 'Old Hollywood serials'],
    aiRisks: ['Post-production effect - stylistic choice'],
  },

  // ===================
  // CAMERA TRANSITIONS
  // ===================
  whip_pan: {
    id: 'whip_pan',
    name: 'Whip Pan / Swish Pan',
    category: 'camera',
    description: 'Rapid pan creating motion blur, cuts during blur',
    emotionalEffect: 'Energy, urgency, connection between scenes, surprise',
    useCase: 'Scene transitions, action sequences, connecting related events',
    promptInjection: 'TRANSITION: Whip pan - rapid camera movement creates motion blur for transition',
    keyframeRequirements: {
      endFrameA: 'Scene ending, camera about to whip right/left',
      startFrameB: 'New scene as camera finishes whip in same direction',
    },
    technicalNotes: 'Match direction of whip between scenes. Blur hides the cut.',
    famousExamples: ['La La Land', 'Whiplash', 'Spider-Man: Into the Spider-Verse'],
    aiRisks: ['Requires motion blur in video generation'],
  },

  push_through: {
    id: 'push_through',
    name: 'Push Through',
    category: 'camera',
    description: 'Camera moves through object/surface to new scene',
    emotionalEffect: 'Immersive, continuous, entering new world',
    useCase: 'Entering memories, moving through barriers, dream logic',
    promptInjection: 'TRANSITION: Push through - camera moves through surface into new space',
    keyframeRequirements: {
      endFrameA: 'Approaching surface (door, mirror, fog)',
      startFrameB: 'Emerging into new scene from similar surface',
    },
    technicalNotes: 'Often CG-assisted. Match surfaces between scenes.',
    famousExamples: ['The Matrix', 'Fight Club', 'Panic Room opening'],
    aiRisks: ['Complex - may need VFX work'],
  },

  crane_reveal: {
    id: 'crane_reveal',
    name: 'Crane Up Reveal',
    category: 'camera',
    description: 'Camera cranes up to reveal new location/scene',
    emotionalEffect: 'Scale, grandeur, transition to new chapter',
    useCase: 'Location transitions, act breaks, reveals',
    promptInjection: 'TRANSITION: Crane reveal - camera rises to reveal broader scene',
    keyframeRequirements: {
      endFrameA: 'Ground-level intimate shot',
      startFrameB: 'Wide reveal from above showing new scope',
    },
    technicalNotes: 'Often used for establishing shots after intimate moment.',
    famousExamples: ['The Shawshank Redemption', 'Lord of the Rings'],
    aiRisks: ['Requires continuous camera movement in generation'],
  },

  dolly_zoom_transition: {
    id: 'dolly_zoom_transition',
    name: 'Dolly Zoom Transition',
    category: 'camera',
    description: 'Vertigo effect used as scene transition',
    emotionalEffect: 'Disorientation, psychological shift, reality warp',
    useCase: 'Psychological reveals, horror, drug sequences',
    promptInjection: 'TRANSITION: Dolly zoom - background warps as reality shifts',
    keyframeRequirements: {
      endFrameA: 'Subject with distorting background',
      startFrameB: 'New scene begins with stabilized reality',
    },
    technicalNotes: 'Hitchcock technique. Very dramatic effect.',
    famousExamples: ['Vertigo', 'Jaws', 'Goodfellas'],
    aiRisks: ['Complex optical effect - may need post work'],
  },

  rack_focus_transition: {
    id: 'rack_focus_transition',
    name: 'Rack Focus Transition',
    category: 'camera',
    description: 'Focus shift reveals new subject or scene',
    emotionalEffect: 'Realization, connection, shifting attention',
    useCase: 'Revealing information, connecting subjects, subtle transitions',
    promptInjection: 'TRANSITION: Rack focus - shift focus from foreground to background or vice versa',
    keyframeRequirements: {
      endFrameA: 'Subject A in focus, Subject B blurred',
      startFrameB: 'Subject B now in focus, potentially new scene',
    },
    technicalNotes: 'Can be used within scene or across scenes.',
    famousExamples: ['The Graduate', 'Zodiac', 'Children of Men'],
    aiRisks: ['Requires depth of field control in generation'],
  },

  // ===================
  // CREATIVE TRANSITIONS
  // ===================
  morph: {
    id: 'morph',
    name: 'Morph',
    category: 'creative',
    description: 'One image transforms into another through digital morphing',
    emotionalEffect: 'Magical, transformation, connection, time passage',
    useCase: 'Character transformation, aging, dream logic',
    promptInjection: 'TRANSITION: Morph - face/object transforms into different face/object',
    keyframeRequirements: {
      endFrameA: 'Subject A in clear, similar position to B',
      startFrameB: 'Subject B in matching position',
    },
    technicalNotes: 'Requires matching poses/angles. VFX-heavy.',
    famousExamples: ['Michael Jackson "Black or White"', 'Terminator 2'],
    aiRisks: ['Requires specialized VFX'],
  },

  object_wipe: {
    id: 'object_wipe',
    name: 'Object Wipe',
    category: 'creative',
    description: 'Object passes camera, revealing new scene behind it',
    emotionalEffect: 'Seamless, practical magic, continuous flow',
    useCase: 'Scene transitions, long-take illusions, theater feel',
    promptInjection: 'TRANSITION: Object wipe - something passes in front of camera, revealing new scene',
    keyframeRequirements: {
      endFrameA: 'Object approaching to fill frame',
      startFrameB: 'Object clears frame revealing new scene',
    },
    technicalNotes: 'Can be a person walking by, a door, a vehicle, etc.',
    famousExamples: ['Birdman', '1917', 'Rope'],
    aiRisks: ['Needs careful timing and matching'],
  },

  split_screen: {
    id: 'split_screen',
    name: 'Split Screen',
    category: 'creative',
    description: 'Screen divides to show multiple scenes simultaneously',
    emotionalEffect: 'Parallel action, comparison, connected events',
    useCase: 'Phone calls, parallel stories, comparisons',
    promptInjection: 'TRANSITION: Split screen - frame divides to show simultaneous action',
    keyframeRequirements: {
      endFrameA: 'Full frame of Scene A',
      startFrameB: 'Screen splits to show A and B together',
    },
    technicalNotes: 'Post-production composite. Plan framing for both halves.',
    famousExamples: ['500 Days of Summer', 'Scott Pilgrim', 'Kill Bill'],
    aiRisks: ['Post-production composite effect'],
  },

  color_flash: {
    id: 'color_flash',
    name: 'Color Flash',
    category: 'creative',
    description: 'Brief flash of color between scenes',
    emotionalEffect: 'Impact, photography, memory flash, stylistic punctuation',
    useCase: 'Photo moments, flashbacks, stylized transitions',
    promptInjection: 'TRANSITION: Color flash - brief white/color flash between scenes',
    keyframeRequirements: {
      endFrameA: 'Scene approaching flash',
      startFrameB: 'Scene emerging from flash',
    },
    technicalNotes: 'Usually 2-6 frames. Can be white, red, or thematic color.',
    famousExamples: ['Requiem for a Dream', 'Snatch', 'Fight Club'],
    aiRisks: ['Post-production effect - simple to add'],
  },

  graphic_match: {
    id: 'graphic_match',
    name: 'Graphic Match',
    category: 'creative',
    description: 'Matching graphical elements between scenes',
    emotionalEffect: 'Visual poetry, thematic connection, artful editing',
    useCase: 'Opening credits, artistic montages, thematic stories',
    promptInjection: 'TRANSITION: Graphic match - visual elements align between scenes',
    keyframeRequirements: {
      endFrameA: 'Strong graphic element (circle, line, color block)',
      startFrameB: 'Matching graphic element in new context',
    },
    technicalNotes: 'Plan compositions to align. More stylized than match cut.',
    famousExamples: ['Tree of Life', 'Enter the Void', 'Requiem for a Dream'],
    aiRisks: ['Requires careful composition planning'],
  },

  invisible_cut: {
    id: 'invisible_cut',
    name: 'Invisible Cut / Hidden Cut',
    category: 'creative',
    description: 'Cut disguised within camera movement or action',
    emotionalEffect: 'Seamless, continuous, oner illusion',
    useCase: 'Long-take illusions, maintaining tension, technical showcase',
    promptInjection: 'TRANSITION: Invisible cut - hide cut in motion blur, darkness, or full-frame element',
    keyframeRequirements: {
      endFrameA: 'Approaching cut point (dark area, fast movement)',
      startFrameB: 'Continuation from matching cut point',
    },
    technicalNotes: 'Cut during fast pan, darkness, or full-screen element.',
    famousExamples: ['1917', 'Birdman', 'Rope'],
    aiRisks: ['Needs precise timing and matching'],
  },
};

// ===========================
// UTILITY FUNCTIONS
// ===========================

/**
 * Get transition by ID
 */
export function getTransition(id: string): CinematicTransition | undefined {
  return TRANSITION_LIBRARY[id];
}

/**
 * Get all transitions by category
 */
export function getTransitionsByCategory(category: CinematicTransition['category']): CinematicTransition[] {
  return Object.values(TRANSITION_LIBRARY).filter(t => t.category === category);
}

/**
 * Get recommended transition based on context
 */
export function recommendTransition(context: {
  emotionalShift: 'none' | 'subtle' | 'significant' | 'dramatic';
  timeGap: 'continuous' | 'minutes' | 'hours' | 'days' | 'years';
  energyLevel: 'low' | 'medium' | 'high';
  stylePreference?: 'classic' | 'modern' | 'experimental';
}): CinematicTransition {
  // Dramatic emotional shift
  if (context.emotionalShift === 'dramatic') {
    if (context.energyLevel === 'high') return TRANSITION_LIBRARY.smash_cut;
    return TRANSITION_LIBRARY.fade_to_black;
  }
  
  // Significant time gap
  if (context.timeGap === 'years') return TRANSITION_LIBRARY.dissolve;
  if (context.timeGap === 'days') return TRANSITION_LIBRARY.fade_to_black;
  
  // High energy
  if (context.energyLevel === 'high') {
    return TRANSITION_LIBRARY.whip_pan;
  }
  
  // Experimental style
  if (context.stylePreference === 'experimental') {
    return TRANSITION_LIBRARY.match_cut;
  }
  
  // Default
  return TRANSITION_LIBRARY.hard_cut;
}

/**
 * Get all transition IDs
 */
export function getAllTransitionIds(): string[] {
  return Object.keys(TRANSITION_LIBRARY);
}

/**
 * Count transitions by category
 */
export function getTransitionStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  Object.values(TRANSITION_LIBRARY).forEach(t => {
    stats[t.category] = (stats[t.category] || 0) + 1;
  });
  return stats;
}

export default TRANSITION_LIBRARY;
