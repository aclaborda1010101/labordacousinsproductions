/**
 * build-script-outline.ts - Canonical reconstruction of ScriptOutline
 * 
 * This function reconstructs a valid ScriptOutline from outline_json and outline_parts.
 * It handles cases where outline_json is empty but outline_parts has valid data
 * (e.g., stalled/failed generations that have scaffold + partial acts).
 * 
 * Used by: generate-script, materialize-entities
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ScriptOutlineCharacter {
  name: string;
  role?: string;
  bio?: string;
  arc?: string;
  want?: string;
  need?: string;
  flaw?: string;
  decision_key?: string;
  description?: string;
}

export interface ScriptOutlineLocation {
  name: string;
  description?: string;
  visual_identity?: string;
  function?: string;
  narrative_role?: string;
}

export interface ScriptOutlineBeat {
  beat_number?: number;
  act?: number | string;
  title?: string;
  summary?: string;
  description?: string;
  agent?: string;
  characters?: string[];
  location?: string;
  situation_detail?: {
    physical_context?: string;
    action?: string;
    goal?: string;
    obstacle?: string;
    state_change?: string;
  };
  emotional_pivot?: string;
  visual_trigger?: string;
}

export interface ScriptOutlineActsSummary {
  act_i_goal?: string;
  act_i_break?: string;
  act_ii_goal?: string;
  midpoint_summary?: string;
  all_is_lost_summary?: string;
  act_iii_goal?: string;
  climax_summary?: string;
  inciting_incident_summary?: string;
  resolution?: string;
}

export interface ScriptOutline {
  title: string;
  logline: string;
  synopsis?: string;
  genre?: string;
  tone?: string;
  format?: string;
  main_characters: ScriptOutlineCharacter[];
  main_locations: ScriptOutlineLocation[];
  acts_summary?: ScriptOutlineActsSummary;
  beats?: ScriptOutlineBeat[];
  episode_beats?: any[]; // For series format
  density_targets?: any;
  _source?: 'RAW' | 'MERGED' | 'RECONSTRUCTED' | 'RECONSTRUCTED_WITH_BEATS';
  _hasValidNarrativeContext?: boolean;
}

export interface OutlineRecord {
  outline_json?: Record<string, any> | null;
  outline_parts?: Record<string, any> | null;
  status?: string;
  density_targets?: any;
}

// ============================================================================
// HELPERS
// ============================================================================

function buildBioFromWantNeedFlaw(c: any): string | null {
  const parts: string[] = [];
  if (c.want) parts.push(`Quiere: ${c.want}`);
  if (c.need) parts.push(`Necesita: ${c.need}`);
  if (c.flaw) parts.push(`Defecto: ${c.flaw}`);
  return parts.length > 0 ? parts.join('. ') : null;
}

function normalizeCharacter(c: any): ScriptOutlineCharacter {
  return {
    name: c.name || c.canonical_name || '',
    role: c.role || c.category,
    bio: c.bio || c.description || buildBioFromWantNeedFlaw(c),
    arc: c.arc,
    want: c.want,
    need: c.need,
    flaw: c.flaw,
    decision_key: c.decision_key,
    description: c.description,
  };
}

function normalizeLocation(l: any): ScriptOutlineLocation {
  return {
    name: l.name || l.base_name || l.location_name || '',
    description: l.description || l.visual_identity || l.function,
    visual_identity: l.visual_identity,
    function: l.function,
    narrative_role: l.narrative_role || l.role,
  };
}

function extractBeatsFromParts(parts: Record<string, any>): ScriptOutlineBeat[] {
  const allBeats: ScriptOutlineBeat[] = [];
  
  // Extract from expand_act_i, expand_act_ii, expand_act_iii
  const actKeys = ['expand_act_i', 'expand_act_ii', 'expand_act_iii'];
  
  actKeys.forEach((key, actIndex) => {
    const actData = parts[key]?.data || parts[key];
    if (actData?.beats && Array.isArray(actData.beats)) {
      actData.beats.forEach((beat: any, beatIndex: number) => {
        allBeats.push({
          ...beat,
          act: actIndex + 1,
          beat_number: beat.beat_number || beatIndex + 1,
        });
      });
    }
  });
  
  // Also extract from chunk keys: expand_act_i_chunk_1, expand_act_ii_chunk_2, etc.
  Object.keys(parts)
    .filter(k => k.includes('_chunk_'))
    .sort() // Ensure order
    .forEach(key => {
      const chunkData = parts[key]?.data || parts[key];
      if (chunkData?.beats && Array.isArray(chunkData.beats)) {
        chunkData.beats.forEach((beat: any) => {
          // Avoid duplicates by checking if beat already exists
          const exists = allBeats.some(
            existing => existing.title === beat.title && existing.description === beat.description
          );
          if (!exists) {
            allBeats.push(beat);
          }
        });
      }
    });
  
  return allBeats;
}

function buildActsSummaryFromParts(parts: Record<string, any>): ScriptOutlineActsSummary | undefined {
  const scaffold = parts.film_scaffold?.data;
  if (scaffold?.acts_summary) {
    return scaffold.acts_summary;
  }
  
  // Try to build from expand_act_* summaries
  const actI = parts.expand_act_i?.data;
  const actII = parts.expand_act_ii?.data;
  const actIII = parts.expand_act_iii?.data;
  
  if (actI?.summary || actII?.summary || actIII?.summary) {
    return {
      act_i_goal: actI?.summary || actI?.arc_summary,
      act_ii_goal: actII?.summary || actII?.arc_summary,
      act_iii_goal: actIII?.summary || actIII?.arc_summary,
    };
  }
  
  return undefined;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Reconstructs a valid ScriptOutline from an outline record.
 * 
 * Priority:
 * 1. outline_json if it has content
 * 2. Merge with film_scaffold from outline_parts
 * 3. Extract beats from expand_act_* and chunks
 * 
 * @param record - The outline record from database
 * @returns ScriptOutline or null if insufficient data
 */
export function buildScriptOutlineFromRecord(record: OutlineRecord): ScriptOutline | null {
  const json = record.outline_json || {};
  const parts = record.outline_parts || {};
  
  let source: ScriptOutline['_source'] = 'RAW';
  let outline: Partial<ScriptOutline> = {};
  
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Check if outline_json has content
  // ──────────────────────────────────────────────────────────────────────────
  const hasJsonTitle = !!json.title;
  const hasJsonLogline = !!json.logline;
  const hasJsonCharacters = Array.isArray(json.main_characters || json.cast || json.characters) && 
    (json.main_characters || json.cast || json.characters).length > 0;
  const hasJsonContent = hasJsonTitle || hasJsonLogline || hasJsonCharacters;
  
  if (hasJsonContent) {
    outline = {
      title: json.title,
      logline: json.logline,
      synopsis: json.synopsis,
      genre: json.genre,
      tone: json.tone,
      format: json.format,
      main_characters: (json.main_characters || json.cast || json.characters || []).map(normalizeCharacter),
      main_locations: (json.main_locations || json.locations || []).map(normalizeLocation),
      acts_summary: json.acts_summary,
      beats: json.beats,
      episode_beats: json.episode_beats,
      density_targets: json.density_targets,
    };
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // 2. Merge/reconstruct from film_scaffold in outline_parts
  // ──────────────────────────────────────────────────────────────────────────
  const scaffold = parts.film_scaffold?.data;
  if (scaffold) {
    source = hasJsonContent ? 'MERGED' : 'RECONSTRUCTED';
    
    // Merge scalar fields (don't overwrite if already set)
    outline.title = outline.title || scaffold.title;
    outline.logline = outline.logline || scaffold.logline;
    outline.synopsis = outline.synopsis || scaffold.synopsis;
    outline.genre = outline.genre || scaffold.genre;
    outline.tone = outline.tone || scaffold.tone;
    outline.format = outline.format || scaffold.format || 'FILM';
    
    // Characters: use scaffold if outline has fewer or none
    // V2: Fixed empty array check - [] is truthy so must check length explicitly
    const scaffoldCast = (scaffold.cast || scaffold.main_characters || []).map(normalizeCharacter);
    const existingChars = (Array.isArray(outline.main_characters) && outline.main_characters.length > 0) 
      ? outline.main_characters 
      : [];
    if (scaffoldCast.length > existingChars.length) {
      outline.main_characters = scaffoldCast;
    }
    
    // Locations: use scaffold if outline has fewer or none
    // V2: Fixed empty array check - [] is truthy so must check length explicitly
    const scaffoldLocs = (scaffold.locations || scaffold.main_locations || []).map(normalizeLocation);
    const existingLocs = (Array.isArray(outline.main_locations) && outline.main_locations.length > 0)
      ? outline.main_locations
      : [];
    if (scaffoldLocs.length > existingLocs.length) {
      outline.main_locations = scaffoldLocs;
    }
    
    // Acts summary
    if (scaffold.acts_summary && !outline.acts_summary) {
      outline.acts_summary = scaffold.acts_summary;
    }
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // 3. Extract beats from expand_act_* and chunks
  // ──────────────────────────────────────────────────────────────────────────
  const extractedBeats = extractBeatsFromParts(parts);
  if (extractedBeats.length > 0) {
    // Only use extracted beats if outline has none or fewer
    const existingBeats = outline.beats || [];
    if (extractedBeats.length > existingBeats.length) {
      outline.beats = extractedBeats;
      source = 'RECONSTRUCTED_WITH_BEATS';
    }
  }
  
  // Also try to build acts_summary from parts if not set
  if (!outline.acts_summary) {
    outline.acts_summary = buildActsSummaryFromParts(parts);
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // 4. Apply density_targets from record if not in outline
  // ──────────────────────────────────────────────────────────────────────────
  if (!outline.density_targets && record.density_targets) {
    outline.density_targets = record.density_targets;
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // 5. Validate minimum requirements
  // ──────────────────────────────────────────────────────────────────────────
  const hasMinimum = 
    outline.title || 
    outline.logline || 
    (outline.main_characters && outline.main_characters.length > 0);
  
  if (!hasMinimum) {
    console.log('[buildScriptOutline] Insufficient data, returning null');
    return null;
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // 6. Set metadata
  // ──────────────────────────────────────────────────────────────────────────
  outline._source = source;
  outline._hasValidNarrativeContext = !!(
    outline.logline || 
    outline.synopsis || 
    outline.acts_summary || 
    (outline.beats && outline.beats.length > 0)
  );
  
  console.log(`[buildScriptOutline] source=${source} chars=${outline.main_characters?.length || 0} locs=${outline.main_locations?.length || 0} beats=${outline.beats?.length || 0} hasActsSummary=${!!outline.acts_summary}`);
  
  return outline as ScriptOutline;
}

/**
 * Checks if an outline record has usable data (even if stalled/failed)
 */
export function hasUsableOutlineData(record: OutlineRecord): boolean {
  // Check outline_json
  const json = record.outline_json || {};
  const hasJsonData = !!(json.title || json.logline || 
    (Array.isArray(json.main_characters || json.cast) && (json.main_characters || json.cast).length > 0));
  
  if (hasJsonData) return true;
  
  // Check outline_parts
  const parts = record.outline_parts || {};
  const hasScaffold = !!parts.film_scaffold?.data;
  const hasExpandedActs = !!(parts.expand_act_i?.data || parts.expand_act_ii?.data || parts.expand_act_iii?.data);
  
  return hasScaffold || hasExpandedActs;
}

/**
 * Formats acts_summary as readable context for script generation
 */
export function formatActsSummaryForPrompt(actsSummary: ScriptOutlineActsSummary): string {
  const lines: string[] = ['=== ESTRUCTURA DE ACTOS (FILM) ==='];
  
  if (actsSummary.act_i_goal) {
    lines.push(`ACTO I: ${actsSummary.act_i_goal}`);
  }
  if (actsSummary.inciting_incident_summary) {
    lines.push(`  - Incidente detonante: ${actsSummary.inciting_incident_summary}`);
  }
  if (actsSummary.act_i_break) {
    lines.push(`  - Break a Acto II: ${actsSummary.act_i_break}`);
  }
  
  if (actsSummary.act_ii_goal) {
    lines.push(`ACTO II: ${actsSummary.act_ii_goal}`);
  }
  if (actsSummary.midpoint_summary) {
    lines.push(`  - Midpoint: ${actsSummary.midpoint_summary}`);
  }
  if (actsSummary.all_is_lost_summary) {
    lines.push(`  - All is Lost: ${actsSummary.all_is_lost_summary}`);
  }
  
  if (actsSummary.act_iii_goal) {
    lines.push(`ACTO III: ${actsSummary.act_iii_goal}`);
  }
  if (actsSummary.climax_summary) {
    lines.push(`  - Clímax: ${actsSummary.climax_summary}`);
  }
  if (actsSummary.resolution) {
    lines.push(`  - Resolución: ${actsSummary.resolution}`);
  }
  
  return lines.join('\n');
}
