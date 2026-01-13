/**
 * SCREENPLAY TEXT RENDERER
 * 
 * Converts structured JSON screenplay (V3 schema) to industry-standard
 * plain text format (Final Draft style).
 * 
 * This ensures raw_text is ALWAYS cinematic screenplay text, never JSON.
 */

export interface ScreenplayScene {
  scene_number?: number;
  slugline?: string;
  location_type?: string;
  standardized_location?: string;
  standardized_time?: string;
  action_summary?: string;
  raw_content?: string;
  dialogue?: Array<{
    character?: string;
    parenthetical?: string;
    line?: string;
    text?: string;
  }>;
  characters_present?: Array<{ name?: string } | string>;
  mood?: string;
  conflict?: string;
}

export interface ScreenplayEpisode {
  episode_number?: number;
  title?: string;
  scenes?: ScreenplayScene[];
}

export interface ScreenplayData {
  title?: string;
  synopsis?: string;
  episodes?: ScreenplayEpisode[];
  scenes?: ScreenplayScene[];
  teasers?: any;
}

/**
 * Render a JSON screenplay structure to industry-standard text format
 */
export function renderScreenplayFromScenes(screenplay: ScreenplayData): string {
  const lines: string[] = [];
  
  // Title page
  if (screenplay.title) {
    lines.push('');
    lines.push(screenplay.title.toUpperCase());
    lines.push('');
    lines.push('═'.repeat(60));
    lines.push('');
  }
  
  // Synopsis (optional)
  if (screenplay.synopsis) {
    lines.push('SINOPSIS');
    lines.push('');
    lines.push(screenplay.synopsis);
    lines.push('');
    lines.push('═'.repeat(60));
    lines.push('');
  }
  
  // Process episodes or direct scenes
  const episodes = screenplay.episodes?.length 
    ? screenplay.episodes 
    : [{ scenes: screenplay.scenes || [] }];
  
  for (const ep of episodes) {
    // Episode header (if multiple episodes)
    if (screenplay.episodes && screenplay.episodes.length > 1 && ep.episode_number) {
      lines.push('');
      lines.push(`═══════════════════════════════════════════════════════════════`);
      lines.push(`EPISODIO ${ep.episode_number}${ep.title ? ` - ${ep.title}` : ''}`);
      lines.push(`═══════════════════════════════════════════════════════════════`);
      lines.push('');
    }
    
    // Render each scene
    for (const scene of ep.scenes || []) {
      const sceneText = renderScene(scene);
      if (sceneText) {
        lines.push(sceneText);
        lines.push('');
      }
    }
  }
  
  return lines.join('\n').trim();
}

/**
 * Render a single scene to screenplay text format
 */
function renderScene(scene: ScreenplayScene): string {
  const lines: string[] = [];
  
  // Scene number and slugline
  const sceneNum = scene.scene_number ? `${scene.scene_number}. ` : '';
  const slugline = scene.slugline?.toUpperCase() || buildSlugline(scene);
  
  if (slugline) {
    lines.push('');
    lines.push(`${sceneNum}${slugline}`);
    lines.push('');
  }
  
  // If there's raw_content (already formatted screenplay text), use it directly
  if (scene.raw_content?.trim()) {
    // Check if raw_content is already properly formatted
    const content = scene.raw_content.trim();
    lines.push(content);
  } else {
    // Build from structured data
    
    // Action/description first
    if (scene.action_summary) {
      // Capitalize key sounds and props in action (Hollywood style)
      const formattedAction = formatActionLine(scene.action_summary);
      lines.push(formattedAction);
      lines.push('');
    }
    
    // Dialogue blocks
    if (scene.dialogue?.length) {
      for (const d of scene.dialogue) {
        const charName = (d.character || 'CHARACTER').toUpperCase();
        lines.push(charName);
        
        if (d.parenthetical) {
          const paren = d.parenthetical.trim();
          const formatted = paren.startsWith('(') ? paren : `(${paren})`;
          lines.push(formatted);
        }
        
        const dialogueLine = d.line || d.text || '';
        if (dialogueLine) {
          lines.push(dialogueLine);
        }
        lines.push('');
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Build a slugline from scene components if no explicit slugline
 */
function buildSlugline(scene: ScreenplayScene): string {
  const intExt = scene.location_type || 'INT';
  const location = scene.standardized_location || 'UNKNOWN';
  const time = scene.standardized_time || 'DAY';
  
  return `${intExt.toUpperCase()}. ${location.toUpperCase()} - ${time.toUpperCase()}`;
}

/**
 * Format action lines Hollywood style:
 * - CAPITALIZE sounds and key props
 * - Keep sentences short
 */
function formatActionLine(text: string): string {
  // Capitalize common sound words
  const soundWords = [
    'CRASH', 'BANG', 'SLAM', 'THUD', 'CLICK', 'BEEP', 'RING', 'BUZZ',
    'WHISPER', 'SCREAM', 'SHOUT', 'MURMUR', 'ROAR', 'GROWL',
    'FOOTSTEPS', 'GUNSHOT', 'EXPLOSION', 'THUNDER', 'SILENCE'
  ];
  
  let formatted = text;
  
  // Capitalize sound words that appear in the text
  for (const word of soundWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    formatted = formatted.replace(regex, word.toUpperCase());
  }
  
  return formatted;
}

/**
 * Check if text has screenplay markers (sluglines, character cues)
 */
export function hasScreenplayMarkers(text: string): boolean {
  if (!text || text.length < 50) return false;
  
  // Check for INT./EXT. sluglines
  const hasSluglines = /^(INT\.|EXT\.)/mi.test(text);
  
  // Check for character cues (line starting with ALL CAPS name followed by dialogue)
  const hasCharacterCues = /\n[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 '.()-]{2,40}\n/m.test(text);
  
  return hasSluglines && hasCharacterCues;
}

/**
 * Count expected scenes from sluglines in text
 */
export function countSluglines(text: string): number {
  if (!text) return 0;
  const matches = text.match(/^(INT\.|EXT\.)/gmi);
  return matches?.length || 0;
}
