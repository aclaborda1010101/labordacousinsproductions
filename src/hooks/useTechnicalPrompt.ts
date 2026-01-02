import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateTechnicalPrompt, PromptContext, TechnicalPrompt } from '@/lib/technicalPromptGenerator';
import type { CharacterVisualDNA } from '@/lib/visualDNASchema';

export type Engine = 'veo' | 'kling' | 'chatgpt' | 'claude' | 'midjourney' | 'flux';

export interface PromptOptions {
  shotType?: string;
  expression?: string;
  outfit?: string;
  action?: string;
  lighting?: string;
  purpose?: 'identity_closeup' | 'identity_turnaround' | 'expression' | 'outfit' | 'scene_shot';
}

export interface GeneratedPrompt {
  positive: string;
  negative: string;
}

export function useTechnicalPrompt() {
  const [generating, setGenerating] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<GeneratedPrompt | null>(null);
  const [lastFullPrompt, setLastFullPrompt] = useState<TechnicalPrompt | null>(null);

  const generatePrompt = useCallback(async (
    characterId: string,
    engine: Engine = 'chatgpt',
    options?: PromptOptions
  ): Promise<GeneratedPrompt | null> => {
    setGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-technical-prompt', {
        body: {
          characterId,
          engine,
          ...options,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const prompt = data.prompt as GeneratedPrompt;
      setLastPrompt(prompt);
      return prompt;
    } catch (error) {
      console.error('Error generating prompt:', error);
      toast.error('Error al generar prompt técnico');
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateLocalPrompt = useCallback((
    visualDNA: CharacterVisualDNA,
    engine: Engine = 'chatgpt',
    options?: PromptOptions
  ): TechnicalPrompt => {
    const context: PromptContext = {
      purpose: options?.purpose || 'scene_shot',
      expression: options?.expression,
      outfit_description: options?.outfit,
      view_angle: options?.shotType,
      scene_context: options?.lighting ? { lighting: options.lighting } : undefined,
      engine: engine === 'chatgpt' || engine === 'claude' ? 'flux' : engine as any,
    };

    const result = generateTechnicalPrompt(visualDNA, context);
    setLastFullPrompt(result);
    setLastPrompt({
      positive: result.master_prompt,
      negative: result.negative_prompt,
    });
    return result;
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Prompt copiado al portapapeles');
    } catch (e) {
      toast.error('Error al copiar');
    }
  }, []);

  return {
    generating,
    lastPrompt,
    lastFullPrompt,
    generatePrompt,
    generateLocalPrompt,
    copyToClipboard,
  };
}

// Legacy utility function for backwards compatibility
export function buildLocalPrompt(
  visualDNA: any,
  engine: Engine = 'chatgpt',
  options?: PromptOptions
): GeneratedPrompt {
  const parts: string[] = [];

  // Add shot type
  if (options?.shotType) {
    parts.push(options.shotType);
  }

  // Celebrity likeness
  if (visualDNA?.visual_references?.celebrity_likeness?.primary?.name) {
    const primary = visualDNA.visual_references.celebrity_likeness.primary;
    const secondary = visualDNA.visual_references.celebrity_likeness.secondary;
    if (secondary?.name) {
      parts.push(`looks like ${primary.percentage || 60}% ${primary.name} and ${secondary.percentage || 40}% ${secondary.name}`);
    } else {
      parts.push(`resembles ${primary.name}`);
    }
  }

  // Physical identity
  if (visualDNA?.physical_identity) {
    const pi = visualDNA.physical_identity;
    if (pi.age_exact_for_prompt || pi.age_exact) parts.push(`${pi.age_exact_for_prompt || pi.age_exact} year old`);
    if (pi.gender_presentation) parts.push(pi.gender_presentation);
    if (pi.ethnicity?.primary) parts.push(`${pi.ethnicity.primary.replace(/_/g, ' ')} ethnicity`);
    if (pi.ethnicity?.skin_tone_description) parts.push(pi.ethnicity.skin_tone_description);
    if (pi.body_type?.somatotype) parts.push(`${pi.body_type.somatotype.replace(/_/g, ' ')} build`);
  }

  // Face
  if (visualDNA?.face) {
    const f = visualDNA.face;
    if (f.shape) parts.push(`${f.shape.replace(/_/g, ' ')} face`);
    if (f.eyes?.color_base) parts.push(`${f.eyes.color_base.replace(/_/g, ' ')} eyes`);
    if (f.eyes?.color_hex_approx) parts.push(`(${f.eyes.color_hex_approx})`);
    if (f.eyes?.shape) parts.push(`${f.eyes.shape.replace(/_/g, ' ')} eye shape`);
    if (f.nose?.bridge?.shape) parts.push(`${f.nose.bridge.shape.replace(/_/g, ' ')} nose`);
    if (f.mouth?.lips?.fullness_upper) parts.push(`${f.mouth.lips.fullness_upper} lips`);
    if (f.jaw_chin?.jawline?.shape) parts.push(`${f.jaw_chin.jawline.shape.replace(/_/g, ' ')} jawline`);
  }

  // Hair
  if (visualDNA?.hair) {
    const h = visualDNA.hair.head_hair || visualDNA.hair;
    const hairDesc = [
      h.length?.type || h.length, 
      h.texture?.type || h.texture, 
      h.color?.natural_base || h.color?.base
    ].filter(Boolean).join(' ').replace(/_/g, ' ');
    if (hairDesc) parts.push(`${hairDesc} hair`);
    if (h.style?.overall_shape) parts.push(`styled ${h.style.overall_shape}`);
    
    const fh = visualDNA.face?.facial_hair || h.facial_hair;
    if (fh?.type && fh.type !== 'clean_shaven_smooth' && fh.type !== 'clean_shaven') {
      parts.push(fh.type.replace(/_/g, ' '));
    }
  }

  // Expression
  if (options?.expression) {
    parts.push(`${options.expression} expression`);
  }

  // Outfit
  if (options?.outfit) {
    parts.push(`wearing ${options.outfit}`);
  }

  // Action
  if (options?.action) {
    parts.push(options.action);
  }

  // Lighting
  if (options?.lighting) {
    parts.push(`${options.lighting} lighting`);
  }

  // Build positive prompt
  const positive = parts.filter(Boolean).join(', ');

  // Build negative from common issues + continuity locks
  const negativeTerms = [
    'cartoon', 'anime', 'illustration', '3D render',
    'deformed', 'blurry', 'bad anatomy', 'extra limbs', 
    'bad hands', 'extra fingers', 'disfigured', 'mutation',
    'watermark', 'text overlay', 'logo',
  ];

  if (visualDNA?.continuity_lock?.must_avoid?.length) {
    negativeTerms.push(...visualDNA.continuity_lock.must_avoid);
  }

  return {
    positive,
    negative: negativeTerms.join(', '),
  };
}
