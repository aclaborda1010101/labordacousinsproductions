// ============= CREATIVE MODE CAPABILITIES =============
// This file defines what UI elements and editing capabilities are available
// for each creative mode (ASSISTED, PRO)

export type CreativeMode = "ASSISTED" | "PRO";

export interface ModeCapabilities {
  // UI visibility
  ui: {
    showAdvancedSections: boolean;
    showTechCameraFields: boolean;
    showLensExactFields: boolean;
    showLightingTechnicalFields: boolean;
    showEditIntentFields: boolean;
    showBlockingTimelineEditor: boolean;
    showSeedAndModelParams: boolean;
    showTargetsNumeric: boolean;
    showOverrides: boolean;
    showPerSceneOverrideMode: boolean;
    showPackSlots: boolean;
    showIdentityPack: boolean;
    showVisualDNAEditor: boolean;
    // Showrunner IA System
    showShowrunnerLayer: boolean;
    showSequenceIntent: boolean;
    showVisualMemoryTimeline: boolean;
    showSceneComparison: boolean;
    showContinuityAlerts: boolean;
  };
  // Edit permissions
  edit: {
    canEditAuthorDNA: boolean;
    canLockAuthorDNA: boolean;
    canEditWorldRules: boolean;
    canEditContinuityLocks: boolean;
    canChooseShotType: boolean;
    canChooseMovement: boolean;
    canChooseFocalApprox: boolean;
    canChooseFocalExact: boolean;
    canChooseCameraBody: boolean;
    canChooseLensModel: boolean;
    canChooseCameraHeightAngleDistance: boolean;
    canEditLightingMood: boolean;
    canEditLightingSetup: boolean;
    canManualKeyframes: boolean;
    canRequireMidKeyframes: boolean;
    canSelectVideoEngine: boolean;
    canSelectQualityTier: boolean;
    canEditRetryBudget: boolean;
    canEditCostModel: boolean;
    canAcceptWithWarnings: boolean;
    canOverrideQCBlocks: boolean;
    canManagePackSlots: boolean;
    canTrainLoRA: boolean;
    // Showrunner IA System
    canEditShowrunnerDecisions: boolean;
    canEditSequenceIntent: boolean;
    canOverrideShowrunnerBlocks: boolean;
    canValidateShowrunnerDecisions: boolean;
  };
  // AI and QC behavior
  behavior: {
    aiAutoDecidesTechnical: boolean;
    aiMayAutoFixHardIssues: boolean;
    qcBlocksOnHardViolation: boolean;
    qcBlocksOnMediumViolation: boolean;
    qcWarningsOnly: boolean;
    autoGeneratePackSlots: boolean;
    // Showrunner IA System
    showrunnerAutoDecides: boolean;
    showrunnerBlocksOnViolation: boolean;
    showrunnerWarningsOnly: boolean;
    autoUpdateVisualMemory: boolean;
  };
}

export const modeCapabilities: Record<CreativeMode, ModeCapabilities> = {
  ASSISTED: {
    ui: {
      showAdvancedSections: false,
      showTechCameraFields: false,
      showLensExactFields: false,
      showLightingTechnicalFields: false,
      showEditIntentFields: false,
      showBlockingTimelineEditor: false,
      showSeedAndModelParams: false,
      showTargetsNumeric: false,
      showOverrides: false,
      showPerSceneOverrideMode: false,
      showPackSlots: false,
      showIdentityPack: false,
      showVisualDNAEditor: false,
      // Showrunner: invisible in ASSISTED (works in background)
      showShowrunnerLayer: false,
      showSequenceIntent: false,
      showVisualMemoryTimeline: false,
      showSceneComparison: false,
      showContinuityAlerts: true, // Show warnings, but subtle
    },
    edit: {
      canEditAuthorDNA: false,
      canLockAuthorDNA: false,
      canEditWorldRules: false,
      canEditContinuityLocks: false,
      canChooseShotType: false,
      canChooseMovement: false,
      canChooseFocalApprox: false,
      canChooseFocalExact: false,
      canChooseCameraBody: false,
      canChooseLensModel: false,
      canChooseCameraHeightAngleDistance: false,
      canEditLightingMood: true,
      canEditLightingSetup: false,
      canManualKeyframes: false,
      canRequireMidKeyframes: false,
      canSelectVideoEngine: false,
      canSelectQualityTier: false,
      canEditRetryBudget: false,
      canEditCostModel: false,
      canAcceptWithWarnings: false,
      canOverrideQCBlocks: false,
      canManagePackSlots: false,
      canTrainLoRA: false,
      // Showrunner: no manual control in ASSISTED
      canEditShowrunnerDecisions: false,
      canEditSequenceIntent: false,
      canOverrideShowrunnerBlocks: false,
      canValidateShowrunnerDecisions: false,
    },
    behavior: {
      aiAutoDecidesTechnical: true,
      aiMayAutoFixHardIssues: true,
      qcBlocksOnHardViolation: true,
      qcBlocksOnMediumViolation: true,
      qcWarningsOnly: false,
      autoGeneratePackSlots: true,
      // Showrunner: fully automatic in ASSISTED
      showrunnerAutoDecides: true,
      showrunnerBlocksOnViolation: true,
      showrunnerWarningsOnly: false,
      autoUpdateVisualMemory: true,
    },
  },

  PRO: {
    ui: {
      showAdvancedSections: true,
      showTechCameraFields: true,
      showLensExactFields: true,
      showLightingTechnicalFields: true,
      showEditIntentFields: true,
      showBlockingTimelineEditor: true,
      showSeedAndModelParams: true,
      showTargetsNumeric: true,
      showOverrides: true,
      showPerSceneOverrideMode: true,
      showPackSlots: true,
      showIdentityPack: true,
      showVisualDNAEditor: true,
      // Showrunner: fully visible in PRO
      showShowrunnerLayer: true,
      showSequenceIntent: true,
      showVisualMemoryTimeline: true,
      showSceneComparison: true,
      showContinuityAlerts: true,
    },
    edit: {
      canEditAuthorDNA: true,
      canLockAuthorDNA: true,
      canEditWorldRules: true,
      canEditContinuityLocks: true,
      canChooseShotType: true,
      canChooseMovement: true,
      canChooseFocalApprox: true,
      canChooseFocalExact: true,
      canChooseCameraBody: true,
      canChooseLensModel: true,
      canChooseCameraHeightAngleDistance: true,
      canEditLightingMood: true,
      canEditLightingSetup: true,
      canManualKeyframes: true,
      canRequireMidKeyframes: true,
      canSelectVideoEngine: true,
      canSelectQualityTier: true,
      canEditRetryBudget: true,
      canEditCostModel: true,
      canAcceptWithWarnings: true,
      canOverrideQCBlocks: true,
      canManagePackSlots: true,
      canTrainLoRA: true,
      // Showrunner: full control in PRO
      canEditShowrunnerDecisions: true,
      canEditSequenceIntent: true,
      canOverrideShowrunnerBlocks: true,
      canValidateShowrunnerDecisions: true,
    },
    behavior: {
      aiAutoDecidesTechnical: false,
      aiMayAutoFixHardIssues: false,
      qcBlocksOnHardViolation: false,
      qcBlocksOnMediumViolation: false,
      qcWarningsOnly: true,
      autoGeneratePackSlots: false,
      // Showrunner: advisory only in PRO (user has final say)
      showrunnerAutoDecides: false,
      showrunnerBlocksOnViolation: false,
      showrunnerWarningsOnly: true,
      autoUpdateVisualMemory: true,
    },
  },
} as const;

// Narrative modes for script/episode generation
export type NarrativeMode = 'SERIE_ADICTIVA' | 'VOZ_AUTOR' | 'GIRO_IMPREVISIBLE';

export const narrativeModeConfig: Record<NarrativeMode, {
  label: string;
  description: string;
  icon: string;
  color: string;
}> = {
  SERIE_ADICTIVA: {
    label: 'Serie Adictiva',
    description: 'Cliffhangers constantes, ritmo frenético, ganchos cada escena',
    icon: '🔥',
    color: 'text-red-500',
  },
  VOZ_AUTOR: {
    label: 'Voz de Autor',
    description: 'Diálogos distintivos, atmósfera única, desarrollo profundo',
    icon: '✍️',
    color: 'text-purple-500',
  },
  GIRO_IMPREVISIBLE: {
    label: 'Giro Imprevisible',
    description: 'Subversión de expectativas, twists inesperados, narrativa no lineal',
    icon: '🌀',
    color: 'text-cyan-500',
  },
};

// Helper to get capabilities for a mode
export function getCapabilities(mode: CreativeMode): ModeCapabilities {
  return modeCapabilities[mode];
}

// Helper to check if a field is visible in a mode
export function isFieldVisibleInMode(
  mode: CreativeMode,
  uiKey: keyof ModeCapabilities['ui']
): boolean {
  return modeCapabilities[mode].ui[uiKey];
}

// Helper to check if a field is editable in a mode  
export function canEditInMode(
  mode: CreativeMode,
  editKey: keyof ModeCapabilities['edit']
): boolean {
  return modeCapabilities[mode].edit[editKey];
}

// Helper to get behavior config for a mode
export function getBehaviorInMode(
  mode: CreativeMode,
  behaviorKey: keyof ModeCapabilities['behavior']
): boolean {
  return modeCapabilities[mode].behavior[behaviorKey];
}
