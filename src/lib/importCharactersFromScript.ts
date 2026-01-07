/**
 * Automatic character import from script breakdown
 * Imports characters from parsed_json into the characters table
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface ScriptCharacter {
  name: string;
  role?: string;
  narrative_weight?: string;
  dialogue_lines?: number;
  scenes_count?: number;
  description?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParsedJson = Record<string, any>;

// Note: CharacterRole type removed - using CharacterRoleDB below for DB compatibility

/**
 * Normalize character name for comparison and display
 * "AGUSTÍN (PAPÁ)" → "Agustín"
 * "DR. MARTINEZ" → "Dr. Martínez" 
 */
function normalizeCharacterName(rawName: string): string {
  // Remove parenthetical info like (PAPÁ), (V.O.), etc.
  let name = rawName.replace(/\s*\([^)]*\)\s*/g, '').trim();
  
  // Remove common suffixes
  name = name.replace(/\s+(V\.?O\.?|O\.?S\.?|CONT'?D?|VOICE|NARRADOR)$/i, '').trim();
  
  // Capitalize properly: BOSCO → Bosco, DR. MARTINEZ → Dr. Martínez
  name = name
    .toLowerCase()
    .split(/\s+/)
    .map(word => {
      // Keep abbreviations like "Dr." as-is but capitalized
      if (word.endsWith('.')) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
  
  return name;
}

/**
 * Get normalized name for comparison (uppercase, no accents)
 */
function getComparisonName(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// DB enum: "episodic" | "extra" | "protagonist" | "recurring"
type CharacterRoleDB = 'protagonist' | 'recurring' | 'episodic' | 'extra';

/**
 * Map breakdown role to character_role enum (DB-compatible)
 */
function mapToCharacterRole(role?: string, narrativeWeight?: string): CharacterRoleDB {
  const r = (role || narrativeWeight || '').toLowerCase();
  
  if (r.includes('protagonist') || r.includes('antagonist')) return 'protagonist';
  if (r.includes('major') || r.includes('supporting')) return 'recurring';
  if (r.includes('recurring')) return 'recurring';
  if (r.includes('minor') || r.includes('episodic')) return 'episodic';
  if (r.includes('extra') || r.includes('featured')) return 'extra';
  
  return 'episodic';
}

/**
 * Import characters from script's parsed_json into the characters table
 * Returns the list of imported character names
 */
export async function importCharactersFromScript(
  projectId: string,
  parsedJson: ParsedJson | null
): Promise<string[]> {
  if (!parsedJson) {
    console.log('[importCharacters] No parsed_json provided');
    return [];
  }

  // Extract characters from various formats
  const scriptCharacters: ScriptCharacter[] = [];
  
  // New format: characters.cast
  if (parsedJson.characters?.cast) {
    scriptCharacters.push(...parsedJson.characters.cast);
  }
  // Legacy format: cast at root
  if (parsedJson.cast) {
    scriptCharacters.push(...parsedJson.cast);
  }
  // Featured extras (optional import)
  if (parsedJson.characters?.featured_extras) {
    scriptCharacters.push(...parsedJson.characters.featured_extras);
  }
  // Featured extras with lines
  if (parsedJson.characters?.featured_extras_with_lines) {
    scriptCharacters.push(...parsedJson.characters.featured_extras_with_lines);
  }
  // Voices and functional characters
  if (parsedJson.characters?.voices_and_functional) {
    scriptCharacters.push(...parsedJson.characters.voices_and_functional);
  }

  if (scriptCharacters.length === 0) {
    console.log('[importCharacters] No characters found in parsed_json');
    return [];
  }

  console.log(`[importCharacters] Found ${scriptCharacters.length} characters in script`);

  // Get existing characters for this project
  const { data: existingCharacters, error: fetchError } = await supabase
    .from('characters')
    .select('id, name')
    .eq('project_id', projectId);

  if (fetchError) {
    console.error('[importCharacters] Error fetching existing characters:', fetchError);
    return [];
  }

  // Create comparison map of existing names
  const existingNamesMap = new Map<string, string>();
  for (const char of existingCharacters || []) {
    existingNamesMap.set(getComparisonName(char.name), char.id);
  }

  const importedNames: string[] = [];
  const toInsert: Array<{
    project_id: string;
    name: string;
    character_role: CharacterRoleDB;
    bio: string | null;
    profile_json: Json;
  }> = [];

  for (const scriptChar of scriptCharacters) {
    if (!scriptChar.name) continue;

    const displayName = normalizeCharacterName(scriptChar.name);
    const comparisonName = getComparisonName(displayName);

    // Skip if already exists
    if (existingNamesMap.has(comparisonName)) {
      console.log(`[importCharacters] Skipping existing: ${displayName}`);
      continue;
    }

    // Mark as processed to avoid duplicates within same import
    existingNamesMap.set(comparisonName, 'pending');

    const characterRole = mapToCharacterRole(scriptChar.role, scriptChar.narrative_weight);
    
    toInsert.push({
      project_id: projectId,
      name: displayName,
      character_role: characterRole,
      bio: scriptChar.description || null,
      profile_json: {
        source: 'script_breakdown',
        dialogue_lines: scriptChar.dialogue_lines || 0,
        scenes_count: scriptChar.scenes_count || 0,
        imported_at: new Date().toISOString(),
      },
    });

    importedNames.push(displayName);
  }

  if (toInsert.length === 0) {
    console.log('[importCharacters] No new characters to import');
    return [];
  }

  // Batch insert
  const { error: insertError } = await supabase
    .from('characters')
    .insert(toInsert);

  if (insertError) {
    console.error('[importCharacters] Error inserting characters:', insertError);
    return [];
  }

  console.log(`[importCharacters] Successfully imported ${importedNames.length} characters:`, importedNames);
  return importedNames;
}
