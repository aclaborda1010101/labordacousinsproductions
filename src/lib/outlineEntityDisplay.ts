/**
 * outlineEntityDisplay.ts - Centralized entity normalization for outline display
 * 
 * Ensures characters and locations ALWAYS have displayable descriptions,
 * even when the backend stores data in fields like want/need/flaw or visual_identity/function.
 * 
 * This is the SINGLE SOURCE OF TRUTH for UI rendering of outline entities.
 */

export interface NormalizedCharacter {
  name: string;
  role?: string;
  description: string;
  details?: string;
  arc?: string;
  want?: string;
  need?: string;
  flaw?: string;
  decision_key?: string;
  [key: string]: unknown;
}

export interface NormalizedLocation {
  name: string;
  type?: string;
  description: string;
  visual_identity?: string;
  function?: string;
  narrative_role?: string;
  [key: string]: unknown;
}

/**
 * Get displayable description for a character.
 * Falls back through: description -> bio -> want/need/flaw combo
 */
export function getCharacterDescription(char: any): string {
  if (!char) return '';
  
  // Priority 1: Direct description or bio
  if (char.description && char.description.trim()) return char.description.trim();
  if (char.bio && char.bio.trim()) return char.bio.trim();
  
  // Priority 2: Construct from want/need/flaw (film scaffold format)
  const parts: string[] = [];
  if (char.want) parts.push(`Quiere: ${char.want}`);
  if (char.need) parts.push(`Necesita: ${char.need}`);
  if (char.flaw) parts.push(`Defecto: ${char.flaw}`);
  
  if (parts.length > 0) {
    return parts.join('. ');
  }
  
  // Priority 3: Arc as fallback
  if (char.arc && char.arc.trim()) return `Arco: ${char.arc.trim()}`;
  
  // Priority 4: Decision key
  if (char.decision_key && char.decision_key.trim()) {
    return `Decisión clave: ${char.decision_key.trim()}`;
  }
  
  return '';
}

/**
 * Get additional details for a character (secondary info)
 */
export function getCharacterDetails(char: any): string | null {
  if (!char) return null;
  
  // If description already covers want/need/flaw, show arc
  if (char.arc && char.arc.trim()) {
    // Only return arc if it wasn't used as the main description
    if (char.description || char.bio || char.want || char.need || char.flaw) {
      return `Arco: ${char.arc.trim()}`;
    }
  }
  
  // Fallback details
  if (char.decision_key && char.decision_key.trim()) {
    return `Decisión clave: ${char.decision_key.trim()}`;
  }
  
  return null;
}

/**
 * Get displayable description for a location.
 * Falls back through: description -> visual_identity -> function -> narrative_role
 */
export function getLocationDescription(loc: any): string {
  if (!loc) return '';
  
  // Priority 1: Direct description
  if (loc.description && loc.description.trim()) return loc.description.trim();
  
  // Priority 2: Visual identity (common in film scaffold)
  if (loc.visual_identity && loc.visual_identity.trim()) return loc.visual_identity.trim();
  
  // Priority 3: Function
  if (loc.function && loc.function.trim()) return loc.function.trim();
  
  // Priority 4: Narrative role
  if (loc.narrative_role && loc.narrative_role.trim()) {
    return `Rol narrativo: ${loc.narrative_role.trim()}`;
  }
  
  // Priority 5: Role (alias)
  if (loc.role && loc.role.trim()) return loc.role.trim();
  
  return '';
}

/**
 * Normalize a single character object to ensure description is always populated
 */
export function normalizeCharacter(char: any): NormalizedCharacter {
  if (!char) return { name: 'Sin nombre', description: '' };
  
  return {
    ...char,
    name: char.name || char.canonical_name || 'Sin nombre',
    description: getCharacterDescription(char),
    details: getCharacterDetails(char) || undefined,
  };
}

/**
 * Normalize a single location object to ensure description is always populated
 */
export function normalizeLocation(loc: any): NormalizedLocation {
  if (!loc) return { name: 'Sin nombre', description: '' };
  
  return {
    ...loc,
    name: loc.name || loc.base_name || loc.location_name || 'Sin nombre',
    description: getLocationDescription(loc),
  };
}

/**
 * Normalize an entire outline for display.
 * Ensures main_characters and main_locations arrays exist and have proper descriptions.
 */
export function normalizeOutlineForDisplay(outline: any): any {
  if (!outline) return null;
  
  // V2: Build main_characters with STRICT length > 0 check
  // Empty arrays are truthy, so || doesn't work - we need explicit length check
  const rawMainChars = outline.main_characters;
  const rawCharacters = (Array.isArray(rawMainChars) && rawMainChars.length > 0)
    ? rawMainChars
    : (outline.cast || outline.characters || []);
  const main_characters = Array.isArray(rawCharacters)
    ? rawCharacters.map(normalizeCharacter)
    : [];
  
  // V2: Build main_locations with STRICT length > 0 check
  const rawMainLocs = outline.main_locations;
  const rawLocations = (Array.isArray(rawMainLocs) && rawMainLocs.length > 0)
    ? rawMainLocs
    : (outline.locations || []);
  const main_locations = Array.isArray(rawLocations)
    ? rawLocations.map(normalizeLocation)
    : [];
  
  // Log health check
  const charsWithDesc = main_characters.filter((c: NormalizedCharacter) => c.description).length;
  const locsWithDesc = main_locations.filter((l: NormalizedLocation) => l.description).length;
  
  if (main_characters.length > 0 || main_locations.length > 0) {
    console.log('[outlineEntityDisplay] Normalized:', {
      characters: `${charsWithDesc}/${main_characters.length} with description`,
      locations: `${locsWithDesc}/${main_locations.length} with description`,
    });
  }
  
  // V26: Sintetizar acts_summary para películas si falta pero tiene ACT_I/II/III
  let acts_summary = outline.acts_summary;
  if (!acts_summary) {
    const actI = outline.ACT_I;
    const actII = outline.ACT_II;
    const actIII = outline.ACT_III;
    
    if (actI || actII || actIII) {
      // Import at runtime to avoid circular dependency
      acts_summary = synthesizeActsSummaryInternal(actI, actII, actIII);
      console.log('[outlineEntityDisplay] V26: Synthesized acts_summary from ACT_I/II/III');
    }
  }
  
  return {
    ...outline,
    main_characters,
    main_locations,
    acts_summary,
  };
}

// Internal version to avoid circular dependency - mirrors synthesizeActsSummary
function synthesizeActsSummaryInternal(
  actI: any,
  actII: any,
  actIII: any
): Record<string, string> {
  const summary: Record<string, string> = {};
  
  if (actI) {
    summary.act_i_goal = actI.title || actI.dramatic_goal || actI.summary || 'Planteamiento';
    const inciting = actI.inciting_incident;
    if (inciting?.event) {
      summary.inciting_incident_summary = inciting.event;
    } else {
      const beats = actI.beats || [];
      const firstBeat = beats[0];
      if (firstBeat?.event) {
        summary.inciting_incident_summary = firstBeat.event;
      } else if (firstBeat?.observable_event) {
        summary.inciting_incident_summary = firstBeat.observable_event;
      }
    }
  }
  
  if (actII) {
    summary.act_ii_goal = actII.title || actII.dramatic_goal || actII.summary || 'Confrontación';
    const midpoint = actII.midpoint_reversal;
    if (midpoint?.event) {
      summary.midpoint_summary = midpoint.event;
    } else if (midpoint?.observable_event) {
      summary.midpoint_summary = midpoint.observable_event;
    } else if (actII.summary) {
      summary.midpoint_summary = actII.summary;
    }
  }
  
  if (actIII) {
    summary.act_iii_goal = actIII.title || actIII.dramatic_goal || actIII.summary || 'Resolución';
    const climax = actIII.climax_decision;
    if (climax?.event) {
      summary.climax_summary = climax.event;
    } else if (climax?.observable_event) {
      summary.climax_summary = climax.observable_event;
    } else if (actIII.climax) {
      summary.climax_summary = actIII.climax;
    } else if (actIII.resolution) {
      summary.climax_summary = actIII.resolution;
    } else if (actIII.summary) {
      summary.climax_summary = actIII.summary;
    }
  }
  
  return summary;
}

/**
 * Build a bio string from character data (for materialize-entities)
 */
export function buildCharacterBio(char: any): string {
  // Priority 1: Existing bio or description
  if (char.bio && char.bio.trim()) return char.bio.trim();
  if (char.description && char.description.trim()) return char.description.trim();
  
  // Priority 2: Construct from want/need/flaw
  const parts: string[] = [];
  if (char.want) parts.push(`Quiere: ${char.want}`);
  if (char.need) parts.push(`Necesita: ${char.need}`);
  if (char.flaw) parts.push(`Defecto: ${char.flaw}`);
  
  if (parts.length > 0) {
    return parts.join('. ');
  }
  
  // Priority 3: Arc
  if (char.arc && char.arc.trim()) return char.arc.trim();
  
  return '';
}

/**
 * Build a description string from location data (for materialize-entities)
 */
export function buildLocationDescription(loc: any): string {
  if (loc.description && loc.description.trim()) return loc.description.trim();
  if (loc.visual_identity && loc.visual_identity.trim()) return loc.visual_identity.trim();
  if (loc.function && loc.function.trim()) return loc.function.trim();
  if (loc.role && loc.role.trim()) return loc.role.trim();
  
  return '';
}

/**
 * V26: Sintetiza acts_summary desde la estructura ACT_I/II/III cuando falta.
 * Extrae los campos clave que el QC necesita para validar películas.
 */
export function synthesizeActsSummary(
  actI: Record<string, unknown> | undefined,
  actII: Record<string, unknown> | undefined,
  actIII: Record<string, unknown> | undefined
): Record<string, string> {
  const summary: Record<string, string> = {};
  
  // ACT I: Buscar inciting incident en beats o campos directos
  if (actI) {
    summary.act_i_goal = (actI.title as string) || (actI.dramatic_goal as string) || (actI.summary as string) || 'Planteamiento';
    
    // Buscar el incidente incitador en el primer beat o campo directo
    const inciting = actI.inciting_incident as Record<string, unknown>;
    if (inciting?.event) {
      summary.inciting_incident_summary = inciting.event as string;
    } else {
      const beats = actI.beats as Array<Record<string, unknown>> || [];
      const firstBeat = beats[0];
      if (firstBeat?.event) {
        summary.inciting_incident_summary = firstBeat.event as string;
      } else if (firstBeat?.observable_event) {
        summary.inciting_incident_summary = firstBeat.observable_event as string;
      }
    }
  }
  
  // ACT II: Buscar midpoint
  if (actII) {
    summary.act_ii_goal = (actII.title as string) || (actII.dramatic_goal as string) || (actII.summary as string) || 'Confrontación';
    
    // Buscar midpoint_reversal directo o en estructura
    const midpoint = actII.midpoint_reversal as Record<string, unknown>;
    if (midpoint?.event) {
      summary.midpoint_summary = midpoint.event as string;
    } else if (midpoint?.observable_event) {
      summary.midpoint_summary = midpoint.observable_event as string;
    } else if (actII.summary) {
      summary.midpoint_summary = actII.summary as string;
    }
  }
  
  // ACT III: Buscar climax
  if (actIII) {
    summary.act_iii_goal = (actIII.title as string) || (actIII.dramatic_goal as string) || (actIII.summary as string) || 'Resolución';
    
    // Buscar climax_decision o resolution
    const climax = actIII.climax_decision as Record<string, unknown>;
    if (climax?.event) {
      summary.climax_summary = climax.event as string;
    } else if (climax?.observable_event) {
      summary.climax_summary = climax.observable_event as string;
    } else if (actIII.climax) {
      summary.climax_summary = actIII.climax as string;
    } else if (actIII.resolution) {
      summary.climax_summary = actIII.resolution as string;
    } else if (actIII.summary) {
      summary.climax_summary = actIII.summary as string;
    }
  }
  
  return summary;
}
