/**
 * Sequence Shot Library (Planos Secuencia)
 * 
 * Professional cinematic library for continuous tracking shots
 * inspired by films like 1917, Birdman, Children of Men, and Goodfellas.
 * 
 * These are NOT social media transitions - they are production-grade
 * sequence shot templates for feature films and premium TV series.
 * 
 * Key principles:
 * 1. Continuous, unbroken camera movement through multiple story beats
 * 2. Invisible cuts disguised by movement/obstacles
 * 3. Complex choreography of actors, camera, and environment
 * 4. Real-time storytelling with spatial continuity
 * 5. Technical precision with Steadicam, gimbal, or wire systems
 */

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface SequenceShotBeat {
  beatIndex: number;
  description: string;
  cameraAction: string;
  actorBlocking: string;
  environmentInteraction: string;
  durationHint: string; // e.g., "15-20 seconds"
  hiddenCutOpportunity?: string; // Where to hide a cut if needed
}

export interface SequenceShotTemplate {
  id: string;
  name: string;
  category: 'dramatic' | 'action' | 'horror' | 'comedy' | 'documentary' | 'musical';
  description: string;
  referenceFilms: string[];
  totalDuration: string;
  difficulty: 'moderate' | 'complex' | 'extreme';
  equipmentRequired: string[];
  beats: SequenceShotBeat[];
  technicalNotes: string[];
  promptBlock: string; // Ready-to-use prompt for AI generation
  hiddenCutTechniques: string[];
}

export interface SequenceShotWorkflow {
  id: string;
  templateId: string;
  projectId: string;
  sceneId?: string;
  characterIds: string[];
  locationId?: string;
  customizations: Record<string, string>;
  generatedKeyframes: Array<{
    beatIndex: number;
    imageUrl?: string;
    status: 'pending' | 'generated' | 'approved';
  }>;
  status: 'draft' | 'in_production' | 'complete';
}

// ============================================================
// SEQUENCE SHOT TEMPLATES
// ============================================================

export const SEQUENCE_SHOT_TEMPLATES: SequenceShotTemplate[] = [
  // ===================
  // DRAMATIC SEQUENCES
  // ===================
  {
    id: 'war_trench_run',
    name: 'Trench Run (1917 Style)',
    category: 'dramatic',
    description: 'Single-take soldier running through WWI trenches, encountering chaos and obstacles',
    referenceFilms: ['1917', 'Dunkirk', 'Saving Private Ryan'],
    totalDuration: '3-5 minutes',
    difficulty: 'extreme',
    equipmentRequired: ['Steadicam', 'Wire Rig', 'Crane for overhead sections'],
    beats: [
      {
        beatIndex: 1,
        description: 'Soldier receives orders in command bunker',
        cameraAction: 'Medium shot, slowly pushing in on face',
        actorBlocking: 'Soldier turns, grabs gear, moves to exit',
        environmentInteraction: 'Other soldiers pass by, maps on walls',
        durationHint: '20-30 seconds',
        hiddenCutOpportunity: 'As soldier turns toward dark tunnel exit'
      },
      {
        beatIndex: 2,
        description: 'Moving through communication trenches',
        cameraAction: 'Following behind, then moves to side profile',
        actorBlocking: 'Running, ducking, passing other soldiers',
        environmentInteraction: 'Explosions in distance, debris falling',
        durationHint: '30-45 seconds',
        hiddenCutOpportunity: 'When soldier ducks under wooden beam'
      },
      {
        beatIndex: 3,
        description: 'Crossing open ground under fire',
        cameraAction: 'Wide crane up, then crashes down to follow',
        actorBlocking: 'Sprinting, diving into crater',
        environmentInteraction: 'Gunfire, smoke, bodies, mud splashes',
        durationHint: '20-30 seconds',
        hiddenCutOpportunity: 'Smoke grenade obscures frame'
      },
      {
        beatIndex: 4,
        description: 'Reaching destination trench',
        cameraAction: 'Follows soldier dropping into trench, orbits around',
        actorBlocking: 'Catching breath, looking for commander',
        environmentInteraction: 'Wounded soldiers, medics working',
        durationHint: '30-40 seconds'
      }
    ],
    technicalNotes: [
      'Requires pre-lit practical lighting throughout set',
      'Multiple camera operators may hand off between sections',
      'Pyrotechnics must be precisely timed to camera movement',
      'Consider wire rig for crater dive shot'
    ],
    promptBlock: `A continuous single-take tracking shot following a WWI soldier running through muddy trenches under bombardment. The camera stays close, visceral, moving from command bunker through communication trenches to no-man's land. Desaturated color palette, practical lighting from lanterns and explosions, documentary realism. Chaos unfolds around the protagonist in real-time.`,
    hiddenCutTechniques: [
      'Dark tunnel transitions',
      'Smoke and dust obscuration',
      'Passing behind obstacles',
      'Whip pans to black/bright areas'
    ]
  },
  {
    id: 'backstage_theater',
    name: 'Backstage Chaos (Birdman Style)',
    category: 'dramatic',
    description: 'Following an actor through labyrinthine theater corridors to stage',
    referenceFilms: ['Birdman', 'All That Jazz', 'Opening Night'],
    totalDuration: '2-4 minutes',
    difficulty: 'complex',
    equipmentRequired: ['Steadicam', 'Gimbal', 'Tight space rigging'],
    beats: [
      {
        beatIndex: 1,
        description: 'Actor in dressing room, pre-show anxiety',
        cameraAction: 'Starts on mirror reflection, orbits to real actor',
        actorBlocking: 'Applying makeup, muttering lines, standing',
        environmentInteraction: 'Costumes, lights, flowers, photos',
        durationHint: '30-40 seconds',
        hiddenCutOpportunity: 'Mirror reflection allows split frame'
      },
      {
        beatIndex: 2,
        description: 'Moving through narrow corridors',
        cameraAction: 'Leading actor, occasionally swinging behind',
        actorBlocking: 'Walking with purpose, encounters stage manager',
        environmentInteraction: 'Props, other actors, crew rushing',
        durationHint: '45-60 seconds',
        hiddenCutOpportunity: 'Passing through doorframes'
      },
      {
        beatIndex: 3,
        description: 'Descending to stage level',
        cameraAction: 'Follows down stairs, rotates on landing',
        actorBlocking: 'Quick dialogue with another actor on stairs',
        environmentInteraction: 'Hearing audience murmur grow louder',
        durationHint: '20-30 seconds'
      },
      {
        beatIndex: 4,
        description: 'Waiting in wings, then entering stage',
        cameraAction: 'Dollies alongside, then cranes up as actor enters light',
        actorBlocking: 'Deep breath, transforms into character, steps out',
        environmentInteraction: 'Spotlight blinds, audience applause',
        durationHint: '30-40 seconds',
        hiddenCutOpportunity: 'Spotlight flare on lens'
      }
    ],
    technicalNotes: [
      'Requires dressed practical corridors',
      'Timed blocking with background actors',
      'Audio must capture ambient theater sounds',
      'Consider Steadicam low-mode for tight spaces'
    ],
    promptBlock: `A mesmerizing continuous take following an anxious actor from dressing room mirror through labyrinthine theater corridors to the stage. Warm tungsten practical lighting mixes with cool fluorescents. Claustrophobic energy builds to the cathartic release of stepping into the spotlight. Birdman-style fluid movement with moments of magical realism.`,
    hiddenCutTechniques: [
      'Mirror reflections',
      'Doorframe passes',
      'Spotlight flares',
      'Dark corner transitions'
    ]
  },
  {
    id: 'hospital_chaos',
    name: 'Hospital Emergency (ER Style)',
    category: 'dramatic',
    description: 'Following medical team through emergency room during crisis',
    referenceFilms: ['ER', 'The Knick', 'Bringing Out the Dead'],
    totalDuration: '2-3 minutes',
    difficulty: 'complex',
    equipmentRequired: ['Steadicam', 'Gimbal', 'Practical medical set'],
    beats: [
      {
        beatIndex: 1,
        description: 'Ambulance bay, patient arrives',
        cameraAction: 'Starts on ambulance doors opening, tracks with gurney',
        actorBlocking: 'EMTs rush patient, doctors meet at door',
        environmentInteraction: 'Rain, sirens, automatic doors',
        durationHint: '20-25 seconds'
      },
      {
        beatIndex: 2,
        description: 'Moving through ER hallway',
        cameraAction: 'Running alongside gurney, weaving through obstacles',
        actorBlocking: 'Medical jargon, quick decisions, running',
        environmentInteraction: 'Other patients, nurses, equipment carts',
        durationHint: '30-40 seconds',
        hiddenCutOpportunity: 'Passing through plastic curtains'
      },
      {
        beatIndex: 3,
        description: 'Trauma room, intensive work',
        cameraAction: 'Orbits around table, moves between team members',
        actorBlocking: 'Intubation, chest compressions, dialogue',
        environmentInteraction: 'Monitors, equipment, blood',
        durationHint: '45-60 seconds'
      },
      {
        beatIndex: 4,
        description: 'Outcome - save or loss',
        cameraAction: 'Slow push on lead doctor face, then pulls back to room',
        actorBlocking: 'Calling time or celebrating, exhausted reactions',
        environmentInteraction: 'Monitor flatline or stabilize',
        durationHint: '20-30 seconds'
      }
    ],
    technicalNotes: [
      'Medical advisor for accurate procedure blocking',
      'Real medical equipment adds authenticity',
      'Controlled chaos - every background action choreographed',
      'Practical blood effects must be timed to camera'
    ],
    promptBlock: `An intense continuous tracking shot following a trauma team from ambulance bay through chaotic ER corridors to the trauma room. Harsh fluorescent lighting, real medical equipment, controlled chaos. The camera weaves between moving gurneys and running staff. Handheld energy with Steadicam fluidity. Life and death unfold in real-time.`,
    hiddenCutTechniques: [
      'Plastic curtain passes',
      'Swinging door transitions',
      'Monitor glare on lens',
      'Blood splatter obscuration'
    ]
  },

  // ===================
  // ACTION SEQUENCES
  // ===================
  {
    id: 'car_chase_interior',
    name: 'Car Chase Interior (Children of Men Style)',
    category: 'action',
    description: 'Interior of vehicle during extended chase/attack sequence',
    referenceFilms: ['Children of Men', 'Baby Driver', 'Drive'],
    totalDuration: '3-6 minutes',
    difficulty: 'extreme',
    equipmentRequired: ['Custom car rig', 'Remote head', 'Safety team'],
    beats: [
      {
        beatIndex: 1,
        description: 'Calm before storm - conversation in car',
        cameraAction: 'Static in backseat, showing all passengers',
        actorBlocking: 'Casual dialogue, establishing relationships',
        environmentInteraction: 'Countryside passing windows',
        durationHint: '30-45 seconds'
      },
      {
        beatIndex: 2,
        description: 'Attack begins',
        cameraAction: 'Whips to window showing attackers, back to passengers',
        actorBlocking: 'Panic, driver swerves, shouting',
        environmentInteraction: 'Burning roadblock, motorcycle attackers',
        durationHint: '20-30 seconds',
        hiddenCutOpportunity: 'Whip pan to window'
      },
      {
        beatIndex: 3,
        description: 'Extended chase/evasion',
        cameraAction: 'Fluid movement between all windows and passengers',
        actorBlocking: 'Chaos, possible casualty, heroic driving',
        environmentInteraction: 'Gunfire, glass breaking, obstacles',
        durationHint: '60-90 seconds'
      },
      {
        beatIndex: 4,
        description: 'Escape or capture',
        cameraAction: 'Push through windshield (VFX) or steady on survivors',
        actorBlocking: 'Heavy breathing, checking each other',
        environmentInteraction: 'Quiet road, distant smoke',
        durationHint: '20-30 seconds'
      }
    ],
    technicalNotes: [
      'Custom camera car with removable roof/panels',
      'Breakaway glass and squib coordination',
      'Driver must hit precise marks for background plates',
      'Consider LED volume for controlled background'
    ],
    promptBlock: `A breathtaking continuous interior car shot during a violent ambush. The camera floats impossibly between passengers, capturing terror on faces and chaos outside windows. Claustrophobic intimacy contrasts with exterior violence. Anamorphic flares from gunfire and breaking glass. Real-time survival.`,
    hiddenCutTechniques: [
      'Whip pans to windows',
      'Blood splatter on lens',
      'Passing through car pillars',
      'Darkness during tunnel'
    ]
  },
  {
    id: 'hallway_fight',
    name: 'Hallway Fight (Oldboy Style)',
    category: 'action',
    description: 'Single-take corridor fight with multiple opponents',
    referenceFilms: ['Oldboy', 'Daredevil', 'The Raid', 'Atomic Blonde'],
    totalDuration: '2-4 minutes',
    difficulty: 'extreme',
    equipmentRequired: ['Steadicam', 'Stunt team', 'Breakaway props'],
    beats: [
      {
        beatIndex: 1,
        description: 'Hero enters corridor, sees enemies',
        cameraAction: 'Side-scrolling profile, video game aesthetic',
        actorBlocking: 'Hero assesses situation, picks up weapon',
        environmentInteraction: 'Grimy walls, flickering lights, doors',
        durationHint: '10-15 seconds'
      },
      {
        beatIndex: 2,
        description: 'First wave of combat',
        cameraAction: 'Maintains side profile, slight push/pull with action',
        actorBlocking: 'Fighting 3-5 opponents, taking hits, recovering',
        environmentInteraction: 'Bodies falling, walls dented, blood',
        durationHint: '45-60 seconds',
        hiddenCutOpportunity: 'When hero is slammed against wall'
      },
      {
        beatIndex: 3,
        description: 'Reinforcements arrive, hero struggles',
        cameraAction: 'Same side-scroll continues, hero moves through frame',
        actorBlocking: 'Exhausted fighting, crawling, desperate',
        environmentInteraction: 'More enemies from doors, weapons dropped',
        durationHint: '60-90 seconds'
      },
      {
        beatIndex: 4,
        description: 'Final opponents, victory at cost',
        cameraAction: 'Slow push in on battered hero standing among bodies',
        actorBlocking: 'Barely standing, catching breath, walking away',
        environmentInteraction: 'Devastation, groaning enemies',
        durationHint: '20-30 seconds'
      }
    ],
    technicalNotes: [
      'Extensive stunt rehearsal required',
      'Multiple hidden cuts using wall impacts',
      'Precise timing of "getting hit" moments',
      'Practical effects for wall damage'
    ],
    promptBlock: `A brutal side-scrolling continuous hallway fight. The camera maintains an unblinking profile view as the hero battles through waves of enemies in a grimy corridor. Fluorescent flicker, blood spray, bodies pile up. Exhaustion and desperation visible. Oldboy meets John Wick in cinematic brutality.`,
    hiddenCutTechniques: [
      'Wall impact moments',
      'Bodies passing camera',
      'Light flicker blackouts',
      'Blood spray obscuration'
    ]
  },
  {
    id: 'heist_execution',
    name: 'Heist Execution (Heat Style)',
    category: 'action',
    description: 'Following the heist team as plan unfolds in real-time',
    referenceFilms: ['Heat', 'The Town', 'Den of Thieves'],
    totalDuration: '4-6 minutes',
    difficulty: 'extreme',
    equipmentRequired: ['Multiple Steadicams', 'Drone', 'Crane'],
    beats: [
      {
        beatIndex: 1,
        description: 'Team enters building, takes positions',
        cameraAction: 'Following leader, then splits to follow second member',
        actorBlocking: 'Silent hand signals, synchronized movement',
        environmentInteraction: 'Security cameras, guards, vault door',
        durationHint: '45-60 seconds',
        hiddenCutOpportunity: 'When camera passes pillar between team members'
      },
      {
        beatIndex: 2,
        description: 'Vault/safe work while lookouts maintain',
        cameraAction: 'Cross-cutting between vault interior and exterior threats',
        actorBlocking: 'Safecracker working, lookouts watching, tension',
        environmentInteraction: 'Timer, police radio chatter, alarm proximity',
        durationHint: '60-90 seconds'
      },
      {
        beatIndex: 3,
        description: 'Complication arises, adaptation required',
        cameraAction: 'Urgent movement between team members',
        actorBlocking: 'Silent panic, quick decisions, plan B',
        environmentInteraction: 'Unexpected guard, alarm trigger',
        durationHint: '30-45 seconds'
      },
      {
        beatIndex: 4,
        description: 'Exit and escape',
        cameraAction: 'Follows team out, crane up to show getaway',
        actorBlocking: 'Running with loot, covering each other',
        environmentInteraction: 'Sirens in distance, getaway vehicle waiting',
        durationHint: '30-45 seconds'
      }
    ],
    technicalNotes: [
      'May require hidden operator handoffs',
      'Drone can provide impossible camera moves',
      'Sound design critical for tension',
      'Consider prep showing same location empty'
    ],
    promptBlock: `A tension-filled continuous sequence following a professional heist crew executing their plan in real-time. The camera moves with practiced efficiency between team members, capturing synchronized precision and mounting tension. Cool, controlled visual style with sudden moments of chaos. Every second matters.`,
    hiddenCutTechniques: [
      'Pillar/wall passes',
      'Operator handoffs',
      'Lens flare from flashlight',
      'Smoke/dust obscuration'
    ]
  },

  // ===================
  // HORROR SEQUENCES
  // ===================
  {
    id: 'haunted_exploration',
    name: 'Haunted House Exploration',
    category: 'horror',
    description: 'Character exploring haunted location with supernatural reveals',
    referenceFilms: ['The Haunting of Hill House', 'Hereditary', 'The Conjuring'],
    totalDuration: '3-5 minutes',
    difficulty: 'complex',
    equipmentRequired: ['Steadicam', 'Practical lighting FX', 'Wire rigging'],
    beats: [
      {
        beatIndex: 1,
        description: 'Character enters dark building',
        cameraAction: 'Following behind through doorway, slow push',
        actorBlocking: 'Cautious steps, looking around, flashlight',
        environmentInteraction: 'Dust particles, creaking floors, shadows',
        durationHint: '30-40 seconds'
      },
      {
        beatIndex: 2,
        description: 'Exploring rooms, finding clues',
        cameraAction: 'Leads character, then orbits around discoveries',
        actorBlocking: 'Examining objects, reacting to sounds',
        environmentInteraction: 'Objects move slightly, lights flicker',
        durationHint: '45-60 seconds',
        hiddenCutOpportunity: 'Light flicker blackout'
      },
      {
        beatIndex: 3,
        description: 'First supernatural encounter (subtle)',
        cameraAction: 'Continues normal movement but reveals ghost in background',
        actorBlocking: 'Unaware of presence, continues exploring',
        environmentInteraction: 'Figure visible to audience, not character',
        durationHint: '30-45 seconds'
      },
      {
        beatIndex: 4,
        description: 'Major scare, character flees',
        cameraAction: 'Whips to reveal, then runs backward following escape',
        actorBlocking: 'Terror, running, screaming',
        environmentInteraction: 'Doors slamming, full apparition reveal',
        durationHint: '30-40 seconds',
        hiddenCutOpportunity: 'Door slamming obscures frame'
      }
    ],
    technicalNotes: [
      'Lighting must be motivated by practical sources',
      'Timing of background scares requires rehearsal',
      'Wire-work for floating/moving objects',
      'Sound design critical for building dread'
    ],
    promptBlock: `A dread-inducing continuous exploration of a haunted Victorian mansion. The camera follows, then leads, creating unease about what lurks behind. Practical lighting from a single flashlight creates deep shadows. Things move in the background. The supernatural reveals itself gradually. Creeping, patient horror.`,
    hiddenCutTechniques: [
      'Flashlight flicker',
      'Door slams',
      'Passing through cobwebs',
      'Lightning flashes'
    ]
  },

  // ===================
  // COMEDY SEQUENCES
  // ===================
  {
    id: 'party_chaos',
    name: 'Party Chaos (Goodfellas Copacabana)',
    category: 'comedy',
    description: 'Following character through escalating party/social chaos',
    referenceFilms: ['Goodfellas', 'Boogie Nights', 'The Wolf of Wall Street'],
    totalDuration: '2-4 minutes',
    difficulty: 'complex',
    equipmentRequired: ['Steadicam', 'Full party set', 'Extensive extras'],
    beats: [
      {
        beatIndex: 1,
        description: 'Arrival and VIP treatment',
        cameraAction: 'Following character through back entrance, special treatment',
        actorBlocking: 'Confidence, greeting staff, slipping tips',
        environmentInteraction: 'Kitchen, service corridors, staff reactions',
        durationHint: '45-60 seconds'
      },
      {
        beatIndex: 2,
        description: 'Moving through party, encountering people',
        cameraAction: 'Weaving through crowd with subject',
        actorBlocking: 'Quick hellos, kisses, handshakes, moving on',
        environmentInteraction: 'Band playing, drinks passing, dancing',
        durationHint: '45-60 seconds',
        hiddenCutOpportunity: 'Behind large group passing'
      },
      {
        beatIndex: 3,
        description: 'Arriving at the best table',
        cameraAction: 'Crane up and over to reveal perfect table appearing',
        actorBlocking: 'Smooth seating, impressing date',
        environmentInteraction: 'Table magically placed, champagne appears',
        durationHint: '30-40 seconds'
      }
    ],
    technicalNotes: [
      'Every extra must have specific blocking',
      'Multiple rehearsals for crowd timing',
      'Practical table/chair movement by hidden crew',
      'Live music helps cover dialogue issues'
    ],
    promptBlock: `A dazzling continuous tracking shot following a charismatic figure through the back entrance of a packed 1960s nightclub to the best table in the house. The camera glides through kitchens, corridors, and the main floor. Everyone knows his name. Power, swagger, seduction. Pure cinematic confidence.`,
    hiddenCutTechniques: [
      'Crowd passes',
      'Kitchen door swing',
      'Behind pillar/column',
      'Light flash from photographer'
    ]
  },

  // ===================
  // MUSICAL SEQUENCES
  // ===================
  {
    id: 'musical_number',
    name: 'Musical Number (La La Land)',
    category: 'musical',
    description: 'Continuous dance/song number with complex choreography',
    referenceFilms: ['La La Land', 'West Side Story (2021)', 'In the Heights'],
    totalDuration: '3-5 minutes',
    difficulty: 'extreme',
    equipmentRequired: ['Technocrane', 'Steadicam', 'Full playback system'],
    beats: [
      {
        beatIndex: 1,
        description: 'Song begins, characters start to move',
        cameraAction: 'Slow push in, then rises with characters standing',
        actorBlocking: 'Singing, first dance moves, connecting',
        environmentInteraction: 'Magic hour lighting, environment responds',
        durationHint: '45-60 seconds'
      },
      {
        beatIndex: 2,
        description: 'Dance intensifies, movement through space',
        cameraAction: 'Orbiting couple, then crane up for wide',
        actorBlocking: 'Complex partnered dance, separation and reunion',
        environmentInteraction: 'Lights turn on, maybe other dancers join',
        durationHint: '60-90 seconds',
        hiddenCutOpportunity: 'Lens flare from practical lights'
      },
      {
        beatIndex: 3,
        description: 'Climactic moment, emotional peak',
        cameraAction: 'Returns to intimate two-shot, slow rotation',
        actorBlocking: 'Most complex choreography, lift, or dip',
        environmentInteraction: 'Stars/lights at most beautiful moment',
        durationHint: '30-45 seconds'
      },
      {
        beatIndex: 4,
        description: 'Song ends, return to reality',
        cameraAction: 'Slow pull back to establish, or push into kiss',
        actorBlocking: 'Final pose or intimate moment',
        environmentInteraction: 'Music fades, real-world sounds return',
        durationHint: '20-30 seconds'
      }
    ],
    technicalNotes: [
      'Playback coordination is critical',
      'Dancers must hit marks for camera moves',
      'Lighting changes must be pre-programmed',
      'Multiple takes likely - stamina management'
    ],
    promptBlock: `A breathtaking continuous musical number at golden hour. The camera dances with the performers, rising and falling with the emotional beats of the song. Magic realism - the environment responds to the music. Practical lights create lens flares like stars. Pure movie magic captured in one impossible take.`,
    hiddenCutTechniques: [
      'Lens flares',
      'Lift moments (camera dips)',
      'Crowd absorption',
      'Light flash transitions'
    ]
  }
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getTemplatesByCategory(category: SequenceShotTemplate['category']): SequenceShotTemplate[] {
  return SEQUENCE_SHOT_TEMPLATES.filter(t => t.category === category);
}

export function getTemplateById(id: string): SequenceShotTemplate | undefined {
  return SEQUENCE_SHOT_TEMPLATES.find(t => t.id === id);
}

export function generateKeyframePrompts(template: SequenceShotTemplate): string[] {
  return template.beats.map((beat, index) => {
    return `Beat ${index + 1}: ${beat.description}. Camera: ${beat.cameraAction}. Actor: ${beat.actorBlocking}. Environment: ${beat.environmentInteraction}. Cinematic, continuous shot aesthetic.`;
  });
}

export function getHiddenCutOpportunities(template: SequenceShotTemplate): Array<{
  beatIndex: number;
  technique: string;
}> {
  return template.beats
    .filter(beat => beat.hiddenCutOpportunity)
    .map(beat => ({
      beatIndex: beat.beatIndex,
      technique: beat.hiddenCutOpportunity!
    }));
}

export function buildSequenceShotPrompt(
  template: SequenceShotTemplate,
  customizations?: {
    characterDescription?: string;
    locationOverride?: string;
    moodOverride?: string;
  }
): string {
  let prompt = template.promptBlock;
  
  if (customizations?.characterDescription) {
    prompt = prompt.replace(/the hero|the protagonist|a character|the soldier|an actor/gi, 
      customizations.characterDescription);
  }
  
  if (customizations?.locationOverride) {
    prompt += ` Set in ${customizations.locationOverride}.`;
  }
  
  if (customizations?.moodOverride) {
    prompt += ` Mood: ${customizations.moodOverride}.`;
  }
  
  return prompt;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  SEQUENCE_SHOT_TEMPLATES,
  getTemplatesByCategory,
  getTemplateById,
  generateKeyframePrompts,
  getHiddenCutOpportunities,
  buildSequenceShotPrompt
};
