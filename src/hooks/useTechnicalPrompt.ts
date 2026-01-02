import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type Engine = 'veo' | 'kling' | 'gemini' | 'midjourney' | 'flux';

export interface PromptOptions {
  shotType?: string;
  expression?: string;
  outfit?: string;
  action?: string;
  lighting?: string;
}

export interface GeneratedPrompt {
  positive: string;
  negative: string;
}

export function useTechnicalPrompt() {
  const [generating, setGenerating] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<GeneratedPrompt | null>(null);

  const generatePrompt = useCallback(async (
    characterId: string,
    engine: Engine = 'gemini',
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
    generatePrompt,
    copyToClipboard,
  };
}

// Utility function to build prompts locally without API call
export function buildLocalPrompt(
  visualDNA: any,
  engine: Engine = 'gemini',
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
    if (pi.age_exact) parts.push(`${pi.age_exact} year old`);
    if (pi.biological_sex) parts.push(pi.biological_sex);
    if (pi.ethnicity?.primary) parts.push(`${pi.ethnicity.primary} ethnicity`);
    if (pi.ethnicity?.skin_tone) parts.push(`${pi.ethnicity.skin_tone} skin tone`);
    if (pi.body_type?.build) parts.push(`${pi.body_type.build} build`);
  }

  // Face
  if (visualDNA?.face) {
    const f = visualDNA.face;
    if (f.shape) parts.push(`${f.shape} face`);
    if (f.eyes?.color) parts.push(`${f.eyes.color} eyes`);
    if (f.eyes?.shape) parts.push(`${f.eyes.shape} eye shape`);
    if (f.nose?.shape) parts.push(`${f.nose.shape} nose`);
    if (f.mouth?.lip_fullness) parts.push(`${f.mouth.lip_fullness} lips`);
    if (f.jaw_chin?.jaw_shape) parts.push(`${f.jaw_chin.jaw_shape} jawline`);
  }

  // Hair
  if (visualDNA?.hair) {
    const h = visualDNA.hair;
    const hairDesc = [h.length, h.texture, h.color?.base].filter(Boolean).join(' ');
    if (hairDesc) parts.push(`${hairDesc} hair`);
    if (h.style) parts.push(`styled ${h.style}`);
    if (h.facial_hair?.type && h.facial_hair.type !== 'clean_shaven') {
      parts.push(h.facial_hair.type.replace(/_/g, ' '));
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

  // Build negative from common issues
  const negativeTerms = [
    'deformed', 'blurry', 'bad anatomy', 'extra limbs', 
    'bad hands', 'extra fingers', 'disfigured', 'mutation'
  ];

  return {
    positive,
    negative: negativeTerms.join(', '),
  };
}
