/**
 * MOTION TEMPLATES SYSTEM
 * Cinematic motion patterns for video generation
 */

export interface MotionTemplate {
  id: string;
  name: string;
  description: string;
  category: 'dialogue' | 'action' | 'emotional' | 'transition' | 'ambient';
  
  // Motion specifications
  camera: {
    movement: string;
    speed: 'static' | 'imperceptible' | 'slow' | 'medium' | 'fast' | 'very_fast';
    stabilization: 'locked' | 'slight_drift' | 'handheld' | 'dynamic';
  };
  
  // Subject motion
  subject: {
    primaryMotion: string;
    secondaryMotion: string;
    breathingVisible: boolean;
    microExpressions: boolean;
  };
  
  // Environment motion
  environment: {
    particles: string[];
    ambientMotion: string;
    lightFlicker: boolean;
  };
  
  // Prompt injection
  promptInjection: string;
}

export const MOTION_TEMPLATES: Record<string, MotionTemplate> = {
  // ===================
  // DIALOGUE TEMPLATES
  // ===================
  dialogue_subtle: {
    id: 'dialogue_subtle',
    name: 'Conversación Sutil',
    description: 'Para diálogos íntimos - cámara casi estática con micro-movimientos de personajes',
    category: 'dialogue',
    camera: {
      movement: 'imperceptible drift, as if camera is breathing',
      speed: 'imperceptible',
      stabilization: 'slight_drift',
    },
    subject: {
      primaryMotion: 'subtle head tilts and nods during speaking',
      secondaryMotion: 'hand gestures that begin and end naturally',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: ['dust motes in light beams'],
      ambientMotion: 'curtains or papers with subtle air movement',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Dialogue Subtle):
- Camera: imperceptible breathing drift, no visible movement
- Subject: natural breathing rhythm visible in chest/shoulders, subtle head movements, eyes that blink naturally at 15-20 blinks per minute
- Micro-expressions: slight eyebrow raises, lip corner movements, nostril flares
- Hands: if gesturing, complete natural arc from rest to gesture to rest
- Environment: dust particles floating in any visible light beams, no sudden movements`,
  },

  dialogue_intense: {
    id: 'dialogue_intense',
    name: 'Confrontación Intensa',
    description: 'Para escenas de conflicto - cámara reactiva, movimientos más marcados',
    category: 'dialogue',
    camera: {
      movement: 'subtle push in during key moments, reactive micro-adjustments',
      speed: 'slow',
      stabilization: 'handheld',
    },
    subject: {
      primaryMotion: 'emphatic gestures, leaning forward/back',
      secondaryMotion: 'tension in jaw, clenched fists',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'stillness that emphasizes tension',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Dialogue Intense):
- Camera: slight handheld tremor suggesting tension, subtle push during emphasis
- Subject: visible tension in neck and shoulder muscles, emphatic hand gestures, aggressive breathing pattern
- Eyes: intense focus, minimal blinking during confrontation peaks
- Body language: weight shifts, leaning in during threats, pulling back during defense
- Environment: stillness that contrasts with character intensity`,
  },

  // ===================
  // ACTION TEMPLATES
  // ===================
  action_dynamic: {
    id: 'action_dynamic',
    name: 'Acción Dinámica',
    description: 'Para secuencias de acción - movimiento completo y físicamente realista',
    category: 'action',
    camera: {
      movement: 'tracking subject, reactive shake on impacts',
      speed: 'fast',
      stabilization: 'dynamic',
    },
    subject: {
      primaryMotion: 'full body kinetic action with momentum',
      secondaryMotion: 'cloth and hair physics, impact reactions',
      breathingVisible: false,
      microExpressions: false,
    },
    environment: {
      particles: ['debris', 'dust clouds', 'sparks', 'glass shards'],
      ambientMotion: 'environmental destruction response',
      lightFlicker: true,
    },
    promptInjection: `MOTION MANDATE (Action Dynamic):
- Camera: dynamic tracking with intentional shake on impacts, speed ramping moments
- Subject: full kinetic movement with proper weight and momentum, cloth/hair react to motion physics
- Impacts: visible shockwaves through body, proper reaction timing
- Environment: debris kicked up, dust clouds, practical effects react to action
- Continuity: movement flows naturally from previous keyframe position`,
  },

  action_fight: {
    id: 'action_fight',
    name: 'Combate Cuerpo a Cuerpo',
    description: 'Para peleas - coordinación de múltiples actores, impactos',
    category: 'action',
    camera: {
      movement: 'orbiting combatants, pushing in on strikes',
      speed: 'very_fast',
      stabilization: 'dynamic',
    },
    subject: {
      primaryMotion: 'coordinated combat choreography',
      secondaryMotion: 'impact reactions, recovery movements',
      breathingVisible: false,
      microExpressions: false,
    },
    environment: {
      particles: ['sweat droplets', 'blood spray', 'dust'],
      ambientMotion: 'destruction from missed strikes',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Action Fight):
- Camera: aggressive tracking, push through action, occasional slow motion beat
- Combatants: strikes with proper wind-up and follow-through, visible muscle tension
- Impacts: bodies react with proper physics, sweat/spit flies on hits
- Recovery: realistic stumble and regain balance
- Environment: surfaces crack/dent on impacts, objects knocked over`,
  },

  // ===================
  // EMOTIONAL TEMPLATES
  // ===================
  emotional_breathing: {
    id: 'emotional_breathing',
    name: 'Momento Emocional',
    description: 'Para escenas emotivas - cámara íntima, respiración visible del personaje',
    category: 'emotional',
    camera: {
      movement: 'imperceptible dolly in',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'deep emotional breathing',
      secondaryMotion: 'trembling, tear formation',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'static except for natural elements',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Emotional Breathing):
- Camera: imperceptible dolly in (5cm over duration), creating unconscious intimacy
- Subject: visible diaphragm breathing, shoulders rising, potential tremor in hands/lips
- Eyes: tear formation process visible, blinking to control tears
- Face: micro-muscle movements around eyes and mouth
- Environment: completely still, all attention on emotional performance`,
  },

  emotional_realization: {
    id: 'emotional_realization',
    name: 'Momento de Revelación',
    description: 'Para revelaciones o epifanías - cambio gradual en la expresión',
    category: 'emotional',
    camera: {
      movement: 'slow push in, slight rotation',
      speed: 'slow',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'gradual expression change',
      secondaryMotion: 'posture shift as realization hits',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'light change if narratively motivated',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Emotional Realization):
- Camera: deliberate push in as realization builds, slight rotation for disorientation
- Subject: expression transforms over duration - confusion to clarity or joy to horror
- Eyes: widening or narrowing based on revelation type, focus changes
- Posture: weight shifts as new understanding settles in
- Breathing: pattern changes as emotional state shifts`,
  },

  // ===================
  // TRANSITION TEMPLATES
  // ===================
  transition_reveal: {
    id: 'transition_reveal',
    name: 'Reveal/Descubrimiento',
    description: 'Para revelar escenarios o personajes - movimiento de cámara dramático',
    category: 'transition',
    camera: {
      movement: 'crane up, dolly around, or push through',
      speed: 'medium',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'turning to reveal, or standing in awe',
      secondaryMotion: 'reaction to what is revealed',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: ['atmosphere appropriate to setting'],
      ambientMotion: 'elements of the reveal have subtle motion',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Transition Reveal):
- Camera: dramatic reveal movement - crane, orbit, or push through
- Subject: if present, reaction builds during reveal
- Environment: the revealed element has appropriate ambient motion (flags wave, fire flickers)
- Light: can change during reveal to emphasize
- Pacing: movement should complete within micro-shot duration`,
  },

  // ===================
  // AMBIENT TEMPLATES
  // ===================
  ambient_peaceful: {
    id: 'ambient_peaceful',
    name: 'Ambiente Pacífico',
    description: 'Para escenas contemplativas - movimientos ambientales mínimos',
    category: 'ambient',
    camera: {
      movement: 'locked or imperceptible drift',
      speed: 'static',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'minimal movement, breathing only',
      secondaryMotion: 'occasional position adjustment',
      breathingVisible: true,
      microExpressions: false,
    },
    environment: {
      particles: ['gentle dust', 'pollen', 'leaves'],
      ambientMotion: 'gentle breeze effects on plants, curtains, water',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Ambient Peaceful):
- Camera: completely static or imperceptible atmospheric drift
- Subject: only breathing motion, occasional natural blink
- Environment: gentle environmental motion - grass sways, water ripples, clouds drift
- Light: stable, possibly slow cloud shadow movement
- Sound-driven: no motion should suggest urgency`,
  },

  ambient_ominous: {
    id: 'ambient_ominous',
    name: 'Ambiente Ominoso',
    description: 'Para crear tensión - movimientos sutiles pero inquietantes',
    category: 'ambient',
    camera: {
      movement: 'imperceptible push or drift',
      speed: 'imperceptible',
      stabilization: 'slight_drift',
    },
    subject: {
      primaryMotion: 'stillness with occasional unsettling micro-movement',
      secondaryMotion: 'shadows that seem to move independently',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: ['fog', 'mist', 'dust'],
      ambientMotion: 'creeping shadows, flickering elements',
      lightFlicker: true,
    },
    promptInjection: `MOTION MANDATE (Ambient Ominous):
- Camera: unsettling imperceptible drift that creates subliminal unease
- Subject: unnaturally still with occasional micro-movement that draws attention
- Environment: shadows that seem to creep, fog that rolls, lights that flicker irregularly
- Atmosphere: heavy with particles that catch light
- Timing: stillness punctuated by sudden small movements`,
  },

  // ===================
  // DIALOGUE EXTENDED
  // ===================
  dialogue_walk_and_talk: {
    id: 'dialogue_walk_and_talk',
    name: 'Walk and Talk',
    description: 'Steadicam siguiendo personajes en conversación mientras caminan - estilo Sorkin/West Wing',
    category: 'dialogue',
    camera: {
      movement: 'steadicam lead or follow, maintaining rhythm with walking pace',
      speed: 'medium',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'walking with purposeful stride, natural arm swing',
      secondaryMotion: 'head turns to speaking partner, occasional gestures while walking',
      breathingVisible: false,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'background extras passing, environmental life',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Walk and Talk):
- Camera: smooth steadicam either leading (walking backward facing subjects) or following alongside
- Subjects: natural walking rhythm, synchronizing with each other, eye contact during key dialogue
- Corridor/path: subjects navigate environment naturally, occasionally dodging obstacles
- Timing: camera anticipates direction changes, maintaining consistent framing
- Background: extras and environment in natural motion, not distracting from subjects`,
  },

  dialogue_dinner_table: {
    id: 'dialogue_dinner_table',
    name: 'Escena de Mesa',
    description: 'Múltiples personajes en comida/reunión - cobertura grupal con micro-movimientos',
    category: 'dialogue',
    camera: {
      movement: 'subtle dolly or static with occasional reframe',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'eating, drinking, natural table gestures',
      secondaryMotion: 'looking at speaker, reactions while listening',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: ['steam from food'],
      ambientMotion: 'glasses refilling, plates being passed',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Dinner Table):
- Camera: static or imperceptible dolly, allowing complex staging
- Subjects: each character has distinct micro-movement pattern (fidgeting, drinking, eating)
- Eye lines: characters naturally look at speaker, reactions visible on listeners
- Props: glasses, utensils, food have natural interaction motion
- Group dynamics: subtle body language showing alliances and tensions`,
  },

  dialogue_phone_call: {
    id: 'dialogue_phone_call',
    name: 'Llamada Telefónica',
    description: 'Personaje solo hablando por teléfono con micro-movimientos naturales',
    category: 'dialogue',
    camera: {
      movement: 'imperceptible drift, occasional slow push',
      speed: 'imperceptible',
      stabilization: 'slight_drift',
    },
    subject: {
      primaryMotion: 'phone to ear, pacing or sitting, natural gestures',
      secondaryMotion: 'free hand gesturing, facial reactions to unheard dialogue',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'background life suggesting private conversation in public space or isolation in private',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Phone Call):
- Camera: intimate framing, slight breathing drift
- Subject: natural phone-holding position, free hand gestures emphasizing unseen conversation
- Face: micro-expressions reacting to unheard speaker, pauses for listening
- Body: potential pacing, shifting weight, nervous energy if tense call
- Background: appropriate stillness or activity based on location`,
  },

  // ===================
  // ACTION EXTENDED
  // ===================
  action_car_chase: {
    id: 'action_car_chase',
    name: 'Persecución de Vehículos',
    description: 'Secuencia de persecución con vehículos - cámara dinámica y vibraciones',
    category: 'action',
    camera: {
      movement: 'tracking alongside, interior POV, mounted to vehicle with vibration',
      speed: 'very_fast',
      stabilization: 'dynamic',
    },
    subject: {
      primaryMotion: 'driver inputs: steering, shifting, braking',
      secondaryMotion: 'body reacting to G-forces, looking in mirrors',
      breathingVisible: false,
      microExpressions: true,
    },
    environment: {
      particles: ['tire smoke', 'debris', 'sparks'],
      ambientMotion: 'background rushing by, other vehicles reacting',
      lightFlicker: true,
    },
    promptInjection: `MOTION MANDATE (Car Chase):
- Camera: vehicle-mounted vibration, interior reflections, speed-implied motion blur
- Driver: hands on wheel, body sways with turns, focus alternating between road and mirrors
- Vehicle: shaking, suspension compression, windows reflecting passing scenery
- Environment: streaking backgrounds, near-miss obstacles, debris kicked up
- Sound-driven: engine revs, tire squeals implied in visual intensity`,
  },

  action_foot_pursuit: {
    id: 'action_foot_pursuit',
    name: 'Persecución a Pie',
    description: 'Persecución corriendo - steadicam o handheld seguimiento intenso',
    category: 'action',
    camera: {
      movement: 'handheld or steadicam following runner, occasional POV',
      speed: 'very_fast',
      stabilization: 'handheld',
    },
    subject: {
      primaryMotion: 'full sprint, arms pumping, breathing visible in effort',
      secondaryMotion: 'looking back at pursuer, navigating obstacles',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: ['dust from footfalls', 'disturbed objects'],
      ambientMotion: 'bystanders reacting, environment being navigated',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Foot Pursuit):
- Camera: crash-following handheld, occasionally overtaking or dropping behind
- Runner: full athletic sprint, visible exertion, labored breathing, sweat
- Obstacles: parkour-like navigation, vaulting, sliding, sharp turns
- Environment: bystanders scatter, objects knocked over, narrow spaces
- Pursuer: occasionally visible in frame adding urgency`,
  },

  action_shootout: {
    id: 'action_shootout',
    name: 'Tiroteo',
    description: 'Secuencia de combate con armas de fuego',
    category: 'action',
    camera: {
      movement: 'handheld with reactive shake on shots, push-ins on impacts',
      speed: 'very_fast',
      stabilization: 'dynamic',
    },
    subject: {
      primaryMotion: 'taking cover, aiming, firing, reloading',
      secondaryMotion: 'flinching from incoming fire, tactical movement',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: ['muzzle flashes', 'debris from impacts', 'dust', 'smoke'],
      ambientMotion: 'destruction of cover, shell casings ejecting',
      lightFlicker: true,
    },
    promptInjection: `MOTION MANDATE (Shootout):
- Camera: reactive handheld, slight flinch on nearby shots, push on key moments
- Combatants: tactical movement, proper weapon handling, cover usage
- Weapons: muzzle flash illumination, slide/bolt movement, recoil, casings ejecting
- Impacts: debris spray, cover chipping, dust clouds on misses
- Environment: destruction accumulating, lighting changes from muzzle flashes`,
  },

  action_explosion: {
    id: 'action_explosion',
    name: 'Explosión',
    description: 'Reacción a explosión con onda de choque y aftermath',
    category: 'action',
    camera: {
      movement: 'shake from blast wave, potential whip away',
      speed: 'very_fast',
      stabilization: 'dynamic',
    },
    subject: {
      primaryMotion: 'being thrown/knocked down, covering self',
      secondaryMotion: 'debris impact, disorientation, ear ringing implied in movement',
      breathingVisible: false,
      microExpressions: true,
    },
    environment: {
      particles: ['fireball', 'debris', 'dust cloud', 'sparks', 'shrapnel'],
      ambientMotion: 'shockwave ripple, destruction radius',
      lightFlicker: true,
    },
    promptInjection: `MOTION MANDATE (Explosion):
- Camera: violent shake from shockwave, potential brief overexposure from flash
- Subject: kinetic reaction to blast - thrown, covered, ducking
- Fireball: proper physics - initial flash, expanding fireball, smoke column
- Debris: radial outward motion, secondary impacts
- Aftermath: settling dust, fire glow, subject disoriented movement`,
  },

  action_fall_stunt: {
    id: 'action_fall_stunt',
    name: 'Caída/Stunt',
    description: 'Personaje cayendo o realizando stunt peligroso',
    category: 'action',
    camera: {
      movement: 'following fall trajectory, speed ramping, multiple angles',
      speed: 'very_fast',
      stabilization: 'dynamic',
    },
    subject: {
      primaryMotion: 'falling, tumbling, impact, recovery attempt',
      secondaryMotion: 'limbs flailing, bracing, cloth physics',
      breathingVisible: false,
      microExpressions: true,
    },
    environment: {
      particles: ['dust on impact', 'debris from collision'],
      ambientMotion: 'surfaces reacting to impact, other characters reacting',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Fall/Stunt):
- Camera: follows action with potential speed ramp at key moment
- Subject: proper falling physics - flailing, bracing, tumbling
- Cloth/hair: physics-correct reaction to rapid motion and direction changes
- Impact: proper physics, dust cloud, body reaction, potential bounce or roll
- Recovery: realistic struggle to regain footing, visible damage effect`,
  },

  // ===================
  // EMOTIONAL EXTENDED
  // ===================
  emotional_death_scene: {
    id: 'emotional_death_scene',
    name: 'Escena de Muerte',
    description: 'Momento de muerte de personaje - máxima carga emocional',
    category: 'emotional',
    camera: {
      movement: 'imperceptible drift or dolly, allowing moment to breathe',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'life fading, final breaths, eyes closing or glazing',
      secondaryMotion: 'holder cradling, tears falling, trembling',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: ['blood if applicable', 'dust settling'],
      ambientMotion: 'world becoming still around the moment',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Death Scene):
- Camera: respectful distance or intimate closeup, no unnecessary movement
- Dying: subtle life-leaving details - breathing slowing, color changing, eyes losing focus
- Mourner: trembling, tears forming and falling, trying to deny the moment
- Physical: hands grasping weakly, final squeeze, gradual relaxation
- Environment: world stilling, contrast to the enormity of the moment`,
  },

  emotional_reunion: {
    id: 'emotional_reunion',
    name: 'Reencuentro',
    description: 'Momento de reencuentro emotivo entre personajes separados',
    category: 'emotional',
    camera: {
      movement: 'slow dolly in during approach, slight orbit during embrace',
      speed: 'slow',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'recognition, approach, embrace',
      secondaryMotion: 'tears of joy, laughter, disbelief',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'background may freeze or blur in focus on couple',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Reunion):
- Camera: slow push or arc during approach, stabilizing during embrace
- Subjects: initial disbelief, recognition dawning, acceleration toward each other
- Embrace: authentic grip, face burying, holding on for dear life
- Emotion: mixed joy and relief, possibly laughter through tears
- Background: time seems to stop, shallow focus on reunited pair`,
  },

  emotional_breakdown: {
    id: 'emotional_breakdown',
    name: 'Colapso Emocional',
    description: 'Personaje perdiendo compostura en momento vulnerable',
    category: 'emotional',
    camera: {
      movement: 'handheld with slight documentary feel, or static voyeuristic',
      speed: 'imperceptible',
      stabilization: 'slight_drift',
    },
    subject: {
      primaryMotion: 'composure cracking, sobbing, potentially physical collapse',
      secondaryMotion: 'hands to face, body curling, seeking support',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'stillness emphasizing isolation of moment',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Breakdown):
- Camera: intimate witness, slight handheld empathy or respectful distance
- Subject: composure gradually crumbling, face distortion, body tension releasing
- Sobbing: authentic chest heaving, gasps, snot and tears if realistic
- Body: collapse potential, leaning on support, sliding down wall
- Sound-implied: silence or ambient only, no music needed`,
  },

  emotional_love_scene: {
    id: 'emotional_love_scene',
    name: 'Escena Romántica/Íntima',
    description: 'Momento íntimo entre amantes - sensual pero artístico',
    category: 'emotional',
    camera: {
      movement: 'slow sensuous dolly or arc, shallow focus',
      speed: 'slow',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'tender touching, kissing, embracing',
      secondaryMotion: 'caressing, breathing together, micro-expressions of pleasure',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'sheets, curtains, candle flames if present',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Love Scene):
- Camera: slow, sensuous movement, respectful of intimacy, shallow focus on details
- Subjects: synchronized breathing, tender touch, emotional connection visible
- Details: hands on skin, lips meeting, eye contact, micro-expressions
- Lighting: flattering, warm, intimate, potentially low key
- Cloth: sheets/clothing in natural, non-gratuitous movement`,
  },

  // ===================
  // TRANSITION EXTENDED
  // ===================
  transition_time_lapse: {
    id: 'transition_time_lapse',
    name: 'Time Lapse',
    description: 'Paso acelerado del tiempo mostrando cambios',
    category: 'transition',
    camera: {
      movement: 'locked for time-lapse, or hyper-lapse dolly',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'appearing and disappearing through time',
      secondaryMotion: 'activity blur, position changes',
      breathingVisible: false,
      microExpressions: false,
    },
    environment: {
      particles: ['weather changes', 'light changes'],
      ambientMotion: 'clouds racing, shadows sweeping, seasons changing',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Time Lapse):
- Camera: rock-solid stable for clean time lapse
- Time: implied through light change, cloud movement, shadow sweep
- Subject: if present, rapid motion blur showing activity over time
- Environment: day-night cycles, weather changes, seasonal shifts
- Transition: smooth entry and exit from normal speed`,
  },

  transition_match_cut: {
    id: 'transition_match_cut',
    name: 'Match Cut Transition',
    description: 'Transición basada en coincidencia visual de formas o movimientos',
    category: 'transition',
    camera: {
      movement: 'movement designed to match between scenes',
      speed: 'medium',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'action that mirrors across cut',
      secondaryMotion: 'pose or shape that matches next scene',
      breathingVisible: false,
      microExpressions: false,
    },
    environment: {
      particles: [],
      ambientMotion: 'elements positioned to create matching shape',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Match Cut):
- End Frame: distinct shape, action, or movement that will mirror
- Next Scene: matching shape, action, or movement in new context
- Examples: thrown object becomes planet, spinning wheel becomes fan
- Timing: action peaks at cut point for maximum impact
- Composition: precise alignment of matching elements`,
  },

  transition_whip_pan: {
    id: 'transition_whip_pan',
    name: 'Whip Pan Transition',
    description: 'Transición mediante movimiento rápido de cámara con blur',
    category: 'transition',
    camera: {
      movement: 'extremely fast horizontal whip creating motion blur',
      speed: 'very_fast',
      stabilization: 'dynamic',
    },
    subject: {
      primaryMotion: 'blur during transition',
      secondaryMotion: 'landing in new position after whip',
      breathingVisible: false,
      microExpressions: false,
    },
    environment: {
      particles: [],
      ambientMotion: 'complete blur during whip',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Whip Pan Transition):
- Camera: rapid horizontal whip creating strong motion blur
- Exit: clean composition before whip begins
- Blur: complete streaking during fastest portion
- Entry: landing on clean composition in new scene
- Direction: consistent whip direction between exit and entry`,
  },

  transition_fade_moment: {
    id: 'transition_fade_moment',
    name: 'Momento de Desvanecimiento',
    description: 'Fade a negro o blanco para transición significativa',
    category: 'transition',
    camera: {
      movement: 'static, holding on significant image',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'still or minimal, allowing fade to work',
      secondaryMotion: 'none',
      breathingVisible: true,
      microExpressions: false,
    },
    environment: {
      particles: [],
      ambientMotion: 'stillness before fade',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Fade Moment):
- Camera: completely stable for clean fade
- Subject: minimal movement, significant expression or pose
- Light: exposure shift may accompany fade
- Timing: hold beat before fade begins
- Meaning: fade suggests finality, time passage, or significant shift`,
  },

  // ===================
  // AMBIENT EXTENDED
  // ===================
  ambient_rain_window: {
    id: 'ambient_rain_window',
    name: 'Lluvia en Ventana',
    description: 'Atmósfera melancólica con lluvia y reflejos',
    category: 'ambient',
    camera: {
      movement: 'static or imperceptible drift',
      speed: 'static',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'watching rain, occasional blink or sigh',
      secondaryMotion: 'finger tracing raindrop, cup of tea steam',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: ['raindrops on glass', 'condensation'],
      ambientMotion: 'rain streaking, reflections of interior light on glass',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Rain Window):
- Camera: static contemplation, focusing on rain or subject through glass
- Subject: minimal movement, internal contemplation, occasional sigh
- Rain: realistic water physics, streaking patterns, collecting drops
- Reflections: interior lights on glass, potential exterior blur
- Sound-implied: rain patter, thunder potential`,
  },

  ambient_busy_street: {
    id: 'ambient_busy_street',
    name: 'Calle Urbana Activa',
    description: 'Vida urbana con tráfico peatonal y actividad',
    category: 'ambient',
    camera: {
      movement: 'static observation or slow pan surveying',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'pedestrian flow, vehicles passing',
      secondaryMotion: 'vendors, signals, urban life details',
      breathingVisible: false,
      microExpressions: false,
    },
    environment: {
      particles: ['exhaust', 'city dust', 'falling leaves'],
      ambientMotion: 'traffic flow, pedestrian crossing, door activity',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Busy Street):
- Camera: observational distance, capturing flow of urban life
- Pedestrians: natural walking rhythms, phone checking, conversation pairs
- Vehicles: realistic traffic patterns, occasional horn implied
- Storefronts: door activity, window displays, signage movement
- Atmosphere: appropriate weather effects, time-of-day lighting`,
  },

  ambient_nature_peaceful: {
    id: 'ambient_nature_peaceful',
    name: 'Naturaleza Serena',
    description: 'Escena natural pacífica sin intervención humana',
    category: 'ambient',
    camera: {
      movement: 'static or imperceptible drift',
      speed: 'static',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'natural elements only',
      secondaryMotion: 'wildlife if present',
      breathingVisible: false,
      microExpressions: false,
    },
    environment: {
      particles: ['pollen', 'falling leaves', 'snow', 'mist'],
      ambientMotion: 'grass swaying, water flowing, clouds drifting',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Nature Peaceful):
- Camera: still contemplation of natural beauty
- Flora: gentle sway in breeze, natural rhythm
- Water: if present, appropriate flow physics
- Wildlife: natural behavior, not reacting to camera
- Light: natural time-of-day, potential god rays or dappled light`,
  },

  // ===================
  // THRILLER CATEGORY (NEW)
  // ===================
  thriller_surveillance: {
    id: 'thriller_surveillance',
    name: 'Vigilancia',
    description: 'Observación desde escondite o cámara de seguridad',
    category: 'ambient',
    camera: {
      movement: 'static security cam or hidden observation POV',
      speed: 'static',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'unaware subject going about activity',
      secondaryMotion: 'casual behavior that becomes suspicious in context',
      breathingVisible: false,
      microExpressions: false,
    },
    environment: {
      particles: [],
      ambientMotion: 'timestamp overlay, occasional glitch or interference',
      lightFlicker: true,
    },
    promptInjection: `MOTION MANDATE (Surveillance):
- Camera: security camera aesthetic - wide angle, fixed position, potential timestamp
- Subject: unaware of observation, natural behavior with sinister context
- Quality: potential grain, compression artifacts, low light struggle
- Framing: security camera placement logic - high corners, coverage angles
- Tension: ordinary behavior made ominous by voyeuristic context`,
  },

  thriller_hidden_threat: {
    id: 'thriller_hidden_threat',
    name: 'Amenaza Oculta',
    description: 'Peligro apenas visible en segundo plano',
    category: 'ambient',
    camera: {
      movement: 'static or imperceptible, allowing viewer to discover threat',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'foreground subject unaware',
      secondaryMotion: 'background threat subtle movement',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'normal except for barely perceptible threat presence',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Hidden Threat):
- Camera: static, allowing viewer to scan frame and discover danger
- Foreground: character unaware, going about normal activity
- Background: subtle threat presence - shape in doorway, movement in shadow
- Depth: deep focus so both planes are visible
- Discovery: threat should be visible but not immediately obvious`,
  },

  thriller_countdown: {
    id: 'thriller_countdown',
    name: 'Contrarreloj',
    description: 'Tensión de tiempo limitado con urgencia creciente',
    category: 'action',
    camera: {
      movement: 'increasingly agitated handheld, push-ins on clock/timer',
      speed: 'fast',
      stabilization: 'handheld',
    },
    subject: {
      primaryMotion: 'frantic activity, checking time, racing',
      secondaryMotion: 'sweat, trembling, desperate problem-solving',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'clock ticking, digital countdown, environmental obstacles',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Countdown):
- Camera: increasingly unstable as time runs out, cutting faster
- Subject: visible panic, racing against time, checking clock repeatedly
- Clock: prominent timer, dramatic lighting on countdown
- Obstacles: everything conspires to slow progress
- Crescendo: movement intensity escalates toward deadline`,
  },

  thriller_paranoia: {
    id: 'thriller_paranoia',
    name: 'Paranoia',
    description: 'Perspectiva subjetiva de personaje paranoico',
    category: 'emotional',
    camera: {
      movement: 'handheld with jittery micro-movements, suspicious glances',
      speed: 'medium',
      stabilization: 'handheld',
    },
    subject: {
      primaryMotion: 'looking over shoulder, checking surroundings',
      secondaryMotion: 'flinching at sounds, suspicious of everyone',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'everyone seems to be looking, following',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Paranoia):
- Camera: jittery, matching internal anxiety, whip pans to check threats
- Subject: hypervigilant, scanning environment, never at ease
- Others: people seem to be watching, following, exchanging glances
- Sound-driven: reacting to off-screen sounds, sudden noises
- Framing: crowded frames, no safe space, threats everywhere`,
  },

  // ===================
  // COMEDY CATEGORY (NEW)
  // ===================
  comedy_timing_beat: {
    id: 'comedy_timing_beat',
    name: 'Beat Cómico',
    description: 'Pausa para timing de comedia con reacción',
    category: 'dialogue',
    camera: {
      movement: 'static or slight zoom for emphasis',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'frozen reaction, delayed response',
      secondaryMotion: 'subtle double-take, exasperated sigh',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'stillness emphasizing the beat',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Comedy Beat):
- Camera: static to allow timing to land, possible subtle zoom for punchline
- Subject: frozen reaction, processing absurdity, slow realization
- Timing: hold longer than comfortable for comedy effect
- Face: micro-expressions of disbelief, resignation, or dawning horror
- Break: eventual reaction - sigh, eye roll, deadpan to camera`,
  },

  comedy_physical_gag: {
    id: 'comedy_physical_gag',
    name: 'Gag Físico',
    description: 'Slapstick o comedia física con timing preciso',
    category: 'action',
    camera: {
      movement: 'wide enough to capture full physical action',
      speed: 'medium',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'pratfall, trip, collision, silly walk',
      secondaryMotion: 'recovery attempt, dignity salvage',
      breathingVisible: false,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'props involved in gag, Rube Goldberg potential',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Physical Gag):
- Camera: wide enough to see full action, no cutting during gag
- Subject: exaggerated physical movement, clear cause and effect
- Timing: setup clearly visible, payoff lands with impact
- Props: involved objects behave with comedic physics
- Recovery: aftermath as important as fall - dignity attempt`,
  },

  comedy_reaction: {
    id: 'comedy_reaction',
    name: 'Reaction Shot Cómico',
    description: 'Corte a reacción exagerada para énfasis cómico',
    category: 'dialogue',
    camera: {
      movement: 'static, allowing face to do the work',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'exaggerated facial reaction',
      secondaryMotion: 'potential body slump, head shake',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'stillness focusing attention on reaction',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Comedy Reaction):
- Camera: tight on face for maximum reaction visibility
- Face: exaggerated but grounded expression - no mugging
- Eyes: key to selling reaction - widening, narrowing, rolling
- Timing: cut to reaction at perfect moment, hold for laugh
- Authenticity: must feel like genuine human response, not cartoon`,
  },

  // ===================
  // DOCUMENTARY CATEGORY (NEW)
  // ===================
  doc_interview: {
    id: 'doc_interview',
    name: 'Entrevista Documental',
    description: 'Sujeto hablando a cámara o entrevistador fuera de cuadro',
    category: 'dialogue',
    camera: {
      movement: 'static or imperceptible, documentary stability',
      speed: 'imperceptible',
      stabilization: 'locked',
    },
    subject: {
      primaryMotion: 'speaking, natural gestures',
      secondaryMotion: 'emotional reactions, looking off-camera to interviewer',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'minimal, allowing focus on subject',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Documentary Interview):
- Camera: stable, respectful distance, slightly off-center eyeline
- Subject: natural speaking rhythm, authentic gestures
- Eyeline: looking slightly off-camera to unseen interviewer
- Emotion: potential emotional moments handled with restraint
- Background: relevant to subject's story but not distracting`,
  },

  doc_broll: {
    id: 'doc_broll',
    name: 'B-Roll Documental',
    description: 'Material de cobertura observacional',
    category: 'ambient',
    camera: {
      movement: 'handheld observational, finding moments',
      speed: 'slow',
      stabilization: 'handheld',
    },
    subject: {
      primaryMotion: 'natural activity unaware of camera',
      secondaryMotion: 'environmental details, process shots',
      breathingVisible: false,
      microExpressions: false,
    },
    environment: {
      particles: [],
      ambientMotion: 'authentic location activity',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Documentary B-Roll):
- Camera: observational handheld, finding natural moments
- Subjects: behaving naturally, not performing for camera
- Details: close-ups of hands working, processes, environment
- Light: natural available light preferred
- Framing: rule-breaking allowed for authenticity`,
  },

  doc_vox_pop: {
    id: 'doc_vox_pop',
    name: 'Vox Pop',
    description: 'Entrevistas callejeras rápidas con múltiples personas',
    category: 'dialogue',
    camera: {
      movement: 'handheld, slightly messy, documentary urgency',
      speed: 'medium',
      stabilization: 'handheld',
    },
    subject: {
      primaryMotion: 'quick statements, natural gestures',
      secondaryMotion: 'street environment activity',
      breathingVisible: true,
      microExpressions: true,
    },
    environment: {
      particles: [],
      ambientMotion: 'busy street life continuing around interview',
      lightFlicker: false,
    },
    promptInjection: `MOTION MANDATE (Vox Pop):
- Camera: handheld, slightly rough, street interview feel
- Subject: quick sound bite, authentic public reaction
- Background: busy street life, authenticity of location
- Framing: may not be perfect, capturing real moment
- Energy: spontaneous, guerrilla filming feel`,
  },
};

/**
 * Get motion template by ID
 */
export function getMotionTemplate(id: string): MotionTemplate | undefined {
  return MOTION_TEMPLATES[id];
}

/**
 * Get all motion templates for a category
 */
export function getMotionTemplatesByCategory(category: MotionTemplate['category']): MotionTemplate[] {
  return Object.values(MOTION_TEMPLATES).filter(t => t.category === category);
}

/**
 * Auto-select motion template based on scene/shot context
 */
export function autoSelectMotionTemplate(context: {
  hasDialogue: boolean;
  emotionalIntensity: 'low' | 'medium' | 'high';
  actionLevel: 'none' | 'subtle' | 'dynamic' | 'intense';
  sceneType?: string;
}): MotionTemplate {
  // Action takes priority
  if (context.actionLevel === 'intense') {
    return MOTION_TEMPLATES.action_fight;
  }
  if (context.actionLevel === 'dynamic') {
    return MOTION_TEMPLATES.action_dynamic;
  }
  
  // Then emotional intensity
  if (context.emotionalIntensity === 'high') {
    return MOTION_TEMPLATES.emotional_breathing;
  }
  
  // Then dialogue
  if (context.hasDialogue) {
    return context.emotionalIntensity === 'medium' 
      ? MOTION_TEMPLATES.dialogue_intense 
      : MOTION_TEMPLATES.dialogue_subtle;
  }
  
  // Default to ambient
  return MOTION_TEMPLATES.ambient_peaceful;
}

export default MOTION_TEMPLATES;
