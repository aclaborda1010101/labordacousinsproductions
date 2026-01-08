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

// Common titles to strip for comparison
const TITLE_PATTERNS = /\b(DR\.?|DON|DOÑA|SR\.?|SRA\.?|SRTA\.?|DOCTOR|DOCTORA|PADRE|MADRE|TÍO|TÍA|ABUELO|ABUELA|PROFESOR|PROFESORA|PROF\.?|CAPTAIN|CAPTAIN|MR\.?|MRS\.?|MS\.?|MISS)\b/gi;

/**
 * Get normalized name for comparison (uppercase, no accents, no titles)
 * "Dr. García" and "García" will both become "GARCIA"
 */
function getComparisonName(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove accents
    .replace(TITLE_PATTERNS, '')       // Remove common titles
    .replace(/\s*\([^)]*\)\s*/g, '')   // Remove parenthetical info
    .replace(/[^A-Z0-9\s]/g, '')       // Remove punctuation
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

export interface ImportCharactersResult {
  imported: string[];
  skipped: string[];
}

/**
 * Import characters from script's parsed_json into the characters table
 * Returns object with imported names and skipped duplicates
 */
export async function importCharactersFromScript(
  projectId: string,
  parsedJson: ParsedJson | null
): Promise<ImportCharactersResult> {
  if (!parsedJson) {
    console.log('[importCharacters] No parsed_json provided');
    return { imported: [], skipped: [] };
  }

  // Extract characters from various formats
  const scriptCharacters: ScriptCharacter[] = [];
  
  // ═══════════════════════════════════════════════════════════════════
  // ASSISTED format: characters.cast, featured_extras, etc.
  // ═══════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════
  // PRO format: characters.protagonists, co_protagonists, secondary, minor
  // ═══════════════════════════════════════════════════════════════════
  if (parsedJson.characters?.protagonists) {
    scriptCharacters.push(
      ...parsedJson.characters.protagonists.map((c: ScriptCharacter) => ({
        ...c,
        role: 'protagonist',
        narrative_weight: 'protagonist'
      }))
    );
  }
  if (parsedJson.characters?.co_protagonists) {
    scriptCharacters.push(
      ...parsedJson.characters.co_protagonists.map((c: ScriptCharacter) => ({
        ...c,
        role: 'co_protagonist',
        narrative_weight: 'major_supporting'
      }))
    );
  }
  if (parsedJson.characters?.secondary) {
    scriptCharacters.push(
      ...parsedJson.characters.secondary.map((c: ScriptCharacter) => ({
        ...c,
        role: 'secondary',
        narrative_weight: 'supporting'
      }))
    );
  }
  if (parsedJson.characters?.minor) {
    scriptCharacters.push(
      ...parsedJson.characters.minor.map((c: ScriptCharacter) => ({
        ...c,
        role: 'minor',
        narrative_weight: 'minor'
      }))
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ASSISTED v25 format: narrative_classification
  // ═══════════════════════════════════════════════════════════════════
  const narrativeClass = parsedJson.characters?.narrative_classification;
  if (narrativeClass) {
    if (narrativeClass.protagonists?.length) {
      scriptCharacters.push(
        ...narrativeClass.protagonists.map((c: Record<string, unknown>) => ({
          name: (c.name ?? c.canonical_name ?? c.label) as string,
          role: 'protagonist',
          narrative_weight: 'protagonist',
          description: c.description as string | undefined,
        }))
      );
    }
    if (narrativeClass.major_supporting?.length) {
      scriptCharacters.push(
        ...narrativeClass.major_supporting.map((c: Record<string, unknown>) => ({
          name: (c.name ?? c.canonical_name ?? c.label) as string,
          role: 'major_supporting',
          narrative_weight: 'major_supporting',
          description: c.description as string | undefined,
        }))
      );
    }
    if (narrativeClass.minor_speaking?.length) {
      scriptCharacters.push(
        ...narrativeClass.minor_speaking.map((c: Record<string, unknown>) => ({
          name: (c.name ?? c.canonical_name ?? c.label) as string,
          role: 'minor',
          narrative_weight: 'minor',
          description: c.description as string | undefined,
        }))
      );
    }
    if (narrativeClass.voices_systems?.length) {
      scriptCharacters.push(
        ...narrativeClass.voices_systems.map((c: Record<string, unknown>) => ({
          name: (c.name ?? c.canonical_name ?? c.label) as string,
          role: 'voice',
          narrative_weight: 'extra',
          description: c.description as string | undefined,
        }))
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ROOT-level narrative_classification (backup source)
  // ═══════════════════════════════════════════════════════════════════
  const rootNarrativeClass = parsedJson.narrative_classification;
  if (rootNarrativeClass) {
    if (rootNarrativeClass.protagonists?.length) {
      scriptCharacters.push(
        ...rootNarrativeClass.protagonists.map((c: Record<string, unknown>) => ({
          name: (c.name ?? c.canonical_name ?? c.label) as string,
          role: 'protagonist',
          narrative_weight: 'protagonist',
          description: c.description as string | undefined,
        }))
      );
    }
    if (rootNarrativeClass.major_supporting?.length) {
      scriptCharacters.push(
        ...rootNarrativeClass.major_supporting.map((c: Record<string, unknown>) => ({
          name: (c.name ?? c.canonical_name ?? c.label) as string,
          role: 'major_supporting',
          narrative_weight: 'major_supporting',
          description: c.description as string | undefined,
        }))
      );
    }
    if (rootNarrativeClass.minor_speaking?.length) {
      scriptCharacters.push(
        ...rootNarrativeClass.minor_speaking.map((c: Record<string, unknown>) => ({
          name: (c.name ?? c.canonical_name ?? c.label) as string,
          role: 'minor',
          narrative_weight: 'minor',
          description: c.description as string | undefined,
        }))
      );
    }
    if (rootNarrativeClass.voices_systems?.length) {
      scriptCharacters.push(
        ...rootNarrativeClass.voices_systems.map((c: Record<string, unknown>) => ({
          name: (c.name ?? c.canonical_name ?? c.label) as string,
          role: 'voice',
          narrative_weight: 'extra',
          description: c.description as string | undefined,
        }))
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // characters_main array (main characters with 'name' field)
  // ═══════════════════════════════════════════════════════════════════
  if (parsedJson.characters_main?.length) {
    scriptCharacters.push(
      ...parsedJson.characters_main.map((c: ScriptCharacter) => ({
        ...c,
        name: c.name,
        role: c.role || 'protagonist',
        narrative_weight: c.narrative_weight || 'protagonist'
      }))
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // Deduplicate by normalized name before processing
  // ═══════════════════════════════════════════════════════════════════
  const seenNames = new Set<string>();
  const deduplicatedCharacters = scriptCharacters.filter(char => {
    if (!char.name) return false;
    const normalized = getComparisonName(char.name);
    if (seenNames.has(normalized)) return false;
    seenNames.add(normalized);
    return true;
  });

  if (deduplicatedCharacters.length === 0) {
    console.log('[importCharacters] No characters found in parsed_json');
    return { imported: [], skipped: [] };
  }

  console.log(`[importCharacters] Found ${deduplicatedCharacters.length} characters in script (after dedup from ${scriptCharacters.length})`)

  console.log(`[importCharacters] Found ${scriptCharacters.length} characters in script`);

  // Get existing characters for this project
  const { data: existingCharacters, error: fetchError } = await supabase
    .from('characters')
    .select('id, name')
    .eq('project_id', projectId);

  if (fetchError) {
    console.error('[importCharacters] Error fetching existing characters:', fetchError);
    return { imported: [], skipped: [] };
  }

  // Create comparison map of existing names
  const existingNamesMap = new Map<string, string>();
  for (const char of existingCharacters || []) {
    existingNamesMap.set(getComparisonName(char.name), char.id);
  }

  const importedNames: string[] = [];
  const skippedNames: string[] = [];
  const toInsert: Array<{
    project_id: string;
    name: string;
    character_role: CharacterRoleDB;
    bio: string | null;
    profile_json: Json;
  }> = [];

  for (const scriptChar of deduplicatedCharacters) {
    if (!scriptChar.name) continue;

    const displayName = normalizeCharacterName(scriptChar.name);
    const comparisonName = getComparisonName(displayName);

    // Skip if already exists in DB
    if (existingNamesMap.has(comparisonName)) {
      console.log(`[importCharacters] Skipping existing: ${displayName}`);
      skippedNames.push(displayName);
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
    console.log(`[importCharacters] No new characters to import (${skippedNames.length} skipped as duplicates)`);
    return { imported: [], skipped: skippedNames };
  }

  // Batch insert
  const { error: insertError } = await supabase
    .from('characters')
    .insert(toInsert);

  if (insertError) {
    console.error('[importCharacters] Error inserting characters:', insertError);
    return { imported: [], skipped: skippedNames };
  }

  console.log(`[importCharacters] Successfully imported ${importedNames.length} characters (${skippedNames.length} skipped):`, importedNames);
  return { imported: importedNames, skipped: skippedNames };
}
