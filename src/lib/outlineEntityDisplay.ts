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
  
  return {
    ...outline,
    main_characters,
    main_locations,
  };
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
