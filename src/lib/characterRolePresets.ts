// Character Role Presets - defines slot quantities per role

export type CharacterRoleType = 'lead' | 'supporting' | 'recurring' | 'background' | 'custom';

export interface SlotConfig {
  closeups: number;
  turnarounds: number;
  expressions: number;
  outfits: number;
}

export interface RolePreset {
  id: CharacterRoleType;
  label: string;
  description: string;
  slotConfig: SlotConfig;
  totalSlots: number;
  loraRecommended: boolean;
  loraLabel: string;
  useCase: string;
  expressionNames: string[];
  turnaroundAngles: string[];
}

export const ROLE_PRESETS: Record<CharacterRoleType, RolePreset> = {
  lead: {
    id: 'lead',
    label: 'Protagonista',
    description: 'Personaje principal que aparece en 80%+ de escenas',
    slotConfig: {
      closeups: 3,
      turnarounds: 4,
      expressions: 9,
      outfits: 2,
    },
    totalSlots: 18,
    loraRecommended: true,
    loraLabel: '✅ RECOMENDADO',
    useCase: '80%+ de escenas',
    expressionNames: ['neutral', 'happy', 'sad', 'angry', 'surprised', 'focused', 'worried', 'laughing', 'serious'],
    turnaroundAngles: ['front', 'side', 'back', '3/4'],
  },
  supporting: {
    id: 'supporting',
    label: 'Secundario',
    description: 'Personaje secundario importante, 40-60% de escenas',
    slotConfig: {
      closeups: 2,
      turnarounds: 3,
      expressions: 6,
      outfits: 1,
    },
    totalSlots: 12,
    loraRecommended: false,
    loraLabel: '⚠️ OPCIONAL',
    useCase: '40-60% de escenas',
    expressionNames: ['neutral', 'happy', 'sad', 'angry', 'serious', 'worried'],
    turnaroundAngles: ['front', 'side', 'back'],
  },
  recurring: {
    id: 'recurring',
    label: 'Recurrente',
    description: 'Personaje que aparece varias veces, <30% de escenas',
    slotConfig: {
      closeups: 1,
      turnarounds: 2,
      expressions: 4,
      outfits: 1,
    },
    totalSlots: 8,
    loraRecommended: false,
    loraLabel: '❌ NO necesario',
    useCase: '<30% de escenas',
    expressionNames: ['neutral', 'happy', 'angry', 'serious'],
    turnaroundAngles: ['front', 'side'],
  },
  background: {
    id: 'background',
    label: 'Extra/Fondo',
    description: 'Personajes menores o de fondo',
    slotConfig: {
      closeups: 1,
      turnarounds: 2,
      expressions: 1,
      outfits: 0,
    },
    totalSlots: 4,
    loraRecommended: false,
    loraLabel: '❌ NO necesario',
    useCase: 'Apariciones breves',
    expressionNames: ['neutral'],
    turnaroundAngles: ['front', 'side'],
  },
  custom: {
    id: 'custom',
    label: 'Personalizado',
    description: 'Configura manualmente cada tipo de slot',
    slotConfig: {
      closeups: 1,
      turnarounds: 2,
      expressions: 3,
      outfits: 1,
    },
    totalSlots: 7,
    loraRecommended: false,
    loraLabel: '🔧 Según necesidad',
    useCase: 'Personalizable',
    expressionNames: ['neutral', 'happy', 'angry'],
    turnaroundAngles: ['front', 'side'],
  },
};

export function calculateTotalSlots(config: SlotConfig): number {
  return config.closeups + config.turnarounds + config.expressions + config.outfits;
}

export function getSlotPipeline(preset: RolePreset): Array<{
  type: 'closeup' | 'turnaround' | 'expression' | 'outfit';
  name: string;
  viewAngle?: string;
  expressionName?: string;
  required: boolean;
}> {
  const pipeline: Array<{
    type: 'closeup' | 'turnaround' | 'expression' | 'outfit';
    name: string;
    viewAngle?: string;
    expressionName?: string;
    required: boolean;
  }> = [];

  // Closeups
  for (let i = 0; i < preset.slotConfig.closeups; i++) {
    pipeline.push({
      type: 'closeup',
      name: `Identity Closeup ${i + 1}`,
      required: i === 0, // First closeup is required
    });
  }

  // Turnarounds
  preset.turnaroundAngles.slice(0, preset.slotConfig.turnarounds).forEach((angle, i) => {
    pipeline.push({
      type: 'turnaround',
      name: `Turnaround ${angle}`,
      viewAngle: angle,
      required: angle === 'front', // Front is required
    });
  });

  // Expressions
  preset.expressionNames.slice(0, preset.slotConfig.expressions).forEach((expr, i) => {
    pipeline.push({
      type: 'expression',
      name: `Expression: ${expr}`,
      expressionName: expr,
      required: expr === 'neutral', // Neutral is required
    });
  });

  // Outfits
  for (let i = 0; i < preset.slotConfig.outfits; i++) {
    pipeline.push({
      type: 'outfit',
      name: `Outfit ${i + 1}`,
      required: i === 0, // First outfit is required if any
    });
  }

  return pipeline;
}

export function estimateCost(preset: RolePreset): { generation: string; lora: string; total: string } {
  const genCost = preset.totalSlots * 0.10; // ~$0.10 per generation
  const loraCost = preset.loraRecommended ? 5 : 0;
  
  return {
    generation: `$${genCost.toFixed(2)}`,
    lora: loraCost > 0 ? `$${loraCost.toFixed(2)}` : 'Gratis',
    total: `$${(genCost + loraCost).toFixed(2)}`,
  };
}
