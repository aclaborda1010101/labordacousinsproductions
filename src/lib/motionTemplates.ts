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
