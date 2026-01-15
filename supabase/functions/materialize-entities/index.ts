/**
 * materialize-entities - P1 FIX: Hydrate characters/locations from outline to Bible tables
 * 
 * This function extracts characters and locations from an outline and upserts them
 * into the characters and locations tables, enabling visual DNA generation and
 * script generation with proper Bible injection.
 * 
 * Sources:
 * - outline: From project_outlines.outline_json
 * - script_breakdown: From scripts.parsed_json (for existing scripts)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireAuthOrDemo, requireProjectAccess, authErrorResponse, type AuthContext } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MaterializeRequest {
  projectId: string;
  source: 'outline' | 'script_breakdown';
  outlineId?: string; // Optional: specific outline to use
}

interface ExtractedCharacter {
  name: string;
  role: string;
  bio: string | null;
  arc: string | null;
  profile_json: Record<string, unknown>;
}

interface ExtractedLocation {
  name: string;
  description: string | null;
  narrative_role: string | null;
  profile_json: Record<string, unknown>;
}

// Normalize character name for deduplication
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^(dr\.?|sr\.?|sra\.?|prof\.?)\s+/i, '') // Remove titles
    .replace(/\s+/g, ' ');
}

// Map role strings to character_role enum (valid values: protagonist, recurring, episodic, extra)
function mapToCharacterRole(role: string): 'protagonist' | 'recurring' | 'episodic' | 'extra' {
  const roleLower = (role || '').toLowerCase();
  
  // Protagonist includes main, hero, lead
  if (roleLower.includes('protagonist') || roleLower.includes('main') || 
      roleLower.includes('hero') || roleLower.includes('lead')) {
    return 'protagonist';
  }
  
  // Recurring includes supporting, secondary, antagonist (they recur across episodes)
  if (roleLower.includes('supporting') || roleLower.includes('secondary') || 
      roleLower.includes('antagonist') || roleLower.includes('villain') ||
      roleLower.includes('recurring')) {
    return 'recurring';
  }
  
  // Extra includes cameo, minor, bit parts
  if (roleLower.includes('cameo') || roleLower.includes('extra') || 
      roleLower.includes('minor') || roleLower.includes('bit')) {
    return 'extra';
  }
  
  // Default: episodic (appears in specific episodes)
  return 'episodic';
}

// Extract characters from outline structure (supports multiple formats)
function extractCharactersFromOutline(outline: any): ExtractedCharacter[] {
  const characters: ExtractedCharacter[] = [];
  const seenNames = new Set<string>();
  
  // Helper to build bio from various character data fields
  const buildBio = (c: any): string | null => {
    // Priority 1: Existing bio or description
    if (c.bio && c.bio.trim()) return c.bio.trim();
    if (c.description && c.description.trim()) return c.description.trim();
    
    // Priority 2: Construct from want/need/flaw (film scaffold format)
    const parts: string[] = [];
    if (c.want) parts.push(`Quiere: ${c.want}`);
    if (c.need) parts.push(`Necesita: ${c.need}`);
    if (c.flaw) parts.push(`Defecto: ${c.flaw}`);
    
    if (parts.length > 0) return parts.join('. ');
    
    // Priority 3: Arc as fallback
    if (c.arc && c.arc.trim()) return c.arc.trim();
    
    // Priority 4: Decision key
    if (c.decision_key && c.decision_key.trim()) return `Decisión clave: ${c.decision_key.trim()}`;
    
    return null;
  };
  
  // Helper to add character if not seen
  const addCharacter = (c: any, source: string) => {
    const name = c.name?.trim() || c.canonical_name?.trim();
    if (!name) return;
    
    const normalizedName = normalizeName(name);
    if (seenNames.has(normalizedName)) return;
    seenNames.add(normalizedName);
    
    characters.push({
      name: name,
      role: mapToCharacterRole(c.role || c.category || 'protagonist'),
      bio: buildBio(c),
      arc: c.arc || null,
      profile_json: { 
        source,
        original_role: c.role,
        want: c.want,
        need: c.need,
        flaw: c.flaw,
        decision_key: c.decision_key,
        description: c.description,
        arc: c.arc,
        relationships: c.relationships,
        ...c
      }
    });
  };
  
  // Source 1: main_characters array
  if (Array.isArray(outline?.main_characters)) {
    outline.main_characters.forEach((c: any) => addCharacter(c, 'outline_main'));
  }
  
  // Source 2: cast array (film scaffold format)
  if (Array.isArray(outline?.cast)) {
    outline.cast.forEach((c: any) => addCharacter(c, 'outline_cast'));
  }
  
  // Source 3: characters array (generic)
  if (Array.isArray(outline?.characters)) {
    outline.characters.forEach((c: any) => addCharacter(c, 'outline_characters'));
  }
  
  // Source 4: supporting_characters array
  if (Array.isArray(outline?.supporting_characters)) {
    outline.supporting_characters.forEach((c: any) => addCharacter({ ...c, role: c.role || 'supporting' }, 'outline_supporting'));
  }
  
  // Source 5: episode_beats.key_characters
  if (Array.isArray(outline?.episode_beats)) {
    outline.episode_beats.forEach((ep: any) => {
      const keyChars = ep?.key_characters || ep?.characters_present || [];
      keyChars.forEach((c: any) => {
        if (typeof c === 'string') {
          addCharacter({ name: c, role: 'recurring' }, 'outline_beat');
        } else {
          addCharacter({ ...c, role: c.role || 'recurring' }, 'outline_beat');
        }
      });
    });
  }
  
  // Source 6: beats array (film format) - extract from protagonists mentions
  if (Array.isArray(outline?.beats)) {
    outline.beats.forEach((beat: any) => {
      if (beat.agent && typeof beat.agent === 'string') {
        addCharacter({ name: beat.agent, role: 'protagonist' }, 'outline_beat_agent');
      }
    });
  }
  
  return characters;
}

// Extract locations from outline structure (supports multiple formats)
function extractLocationsFromOutline(outline: any): ExtractedLocation[] {
  const locations: ExtractedLocation[] = [];
  const seenNames = new Set<string>();
  
  // Helper to build description from various location data fields
  const buildDescription = (l: any): string | null => {
    // Priority 1: Direct description
    if (l.description && l.description.trim()) return l.description.trim();
    
    // Priority 2: Visual identity (film scaffold format)
    if (l.visual_identity && l.visual_identity.trim()) return l.visual_identity.trim();
    
    // Priority 3: Function
    if (l.function && l.function.trim()) return l.function.trim();
    
    // Priority 4: Role/narrative_role
    if (l.narrative_role && l.narrative_role.trim()) return `Rol narrativo: ${l.narrative_role.trim()}`;
    if (l.role && l.role.trim()) return l.role.trim();
    
    return null;
  };
  
  // Helper to add location if not seen
  const addLocation = (l: any, source: string) => {
    const name = l.name?.trim() || l.base_name?.trim() || l.location_name?.trim();
    if (!name) return;
    
    const normalizedName = normalizeName(name);
    if (seenNames.has(normalizedName)) return;
    seenNames.add(normalizedName);
    
    locations.push({
      name: name,
      description: buildDescription(l),
      narrative_role: l.narrative_role || l.role || l.function || null,
      profile_json: { 
        source, 
        visual_identity: l.visual_identity,
        function: l.function,
        ...l 
      }
    });
  };
  
  // Source 1: main_locations array
  if (Array.isArray(outline?.main_locations)) {
    outline.main_locations.forEach((l: any) => addLocation(l, 'outline_main'));
  }
  
  // Source 2: locations array (generic or film scaffold format)
  if (Array.isArray(outline?.locations)) {
    outline.locations.forEach((l: any) => addLocation(l, 'outline_locations'));
  }
  
  // Source 3: episode_beats.location/locations
  if (Array.isArray(outline?.episode_beats)) {
    outline.episode_beats.forEach((ep: any) => {
      // Single location field
      if (ep?.location) {
        if (typeof ep.location === 'string') {
          addLocation({ name: ep.location }, `outline_beat_ep${ep.episode}`);
        } else {
          addLocation(ep.location, `outline_beat_ep${ep.episode}`);
        }
      }
      
      // Multiple locations array
      if (Array.isArray(ep?.locations)) {
        ep.locations.forEach((l: any) => {
          if (typeof l === 'string') {
            addLocation({ name: l }, `outline_beat_ep${ep.episode}`);
          } else {
            addLocation(l, `outline_beat_ep${ep.episode}`);
          }
        });
      }
    });
  }
  
  // Source 4: beats array (film format) - extract from situation_detail
  if (Array.isArray(outline?.beats)) {
    outline.beats.forEach((beat: any) => {
      const sd = beat.situation_detail;
      if (sd?.physical_context && typeof sd.physical_context === 'string') {
        // Try to extract location from physical_context
        const contextLower = sd.physical_context.toLowerCase();
        if (!contextLower.includes('sin definir') && sd.physical_context.length < 100) {
          addLocation({ name: sd.physical_context, description: sd.physical_context }, 'outline_beat_context');
        }
      }
    });
  }
  
  return locations;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let auth: AuthContext;
  try {
    auth = await requireAuthOrDemo(req);
  } catch (error) {
    return authErrorResponse(error as Error, corsHeaders);
  }

  try {
    const request: MaterializeRequest = await req.json();
    const { projectId, source, outlineId } = request;

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'PROJECT_ID_REQUIRED', message: 'projectId es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify project access
    try {
      await requireProjectAccess(auth.supabase, auth.userId, projectId);
    } catch (error) {
      return authErrorResponse(error as Error, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let outline: any = null;
    let sourceDescription = '';

    if (source === 'outline') {
      // V3: Fetch outline from project_outlines - include outline_parts for film scaffold
      // Use updated_at ordering for better selection of the "real" active outline
      const query = adminClient
        .from('project_outlines')
        .select('id, outline_json, outline_parts, quality, status')
        .eq('project_id', projectId);
      
      if (outlineId) {
        query.eq('id', outlineId);
      } else {
        // V3: Get the most recent outline by updated_at (not created_at)
        // Include more statuses to catch partial work
        query.in('status', ['approved', 'completed', 'generating', 'stalled', 'timeout', 'failed'])
          .order('updated_at', { ascending: false })
          .limit(1);
      }
      
      const { data: outlineData, error: outlineError } = await query.maybeSingle();
      
      if (outlineError) {
        console.error('[materialize-entities] Outline fetch error:', outlineError);
        return new Response(
          JSON.stringify({ error: 'OUTLINE_FETCH_ERROR', message: outlineError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // V3: ROBUST RECONSTRUCTION - Always try to extract from outline_parts first
      let outlineJson = outlineData?.outline_json as Record<string, any> | null;
      const outlineParts = outlineData?.outline_parts as Record<string, any> | null;
      
      // V3: Check if outline_json is missing key entity data (cast/locations)
      const outlineJsonHasCast = Array.isArray((outlineJson as any)?.cast) && (outlineJson as any)?.cast.length > 0 ||
                                  Array.isArray((outlineJson as any)?.main_characters) && (outlineJson as any)?.main_characters.length > 0;
      const outlineJsonHasLocs = Array.isArray((outlineJson as any)?.locations) && (outlineJson as any)?.locations.length > 0 ||
                                  Array.isArray((outlineJson as any)?.main_locations) && (outlineJson as any)?.main_locations.length > 0;
      
      // V3: Reconstruct/merge from outline_parts if outline_json is missing OR lacks entities
      if (outlineParts) {
        const scaffold = outlineParts.film_scaffold?.data;
        if (scaffold) {
          const scaffoldCast = scaffold.cast || scaffold.main_characters || [];
          const scaffoldLocs = scaffold.locations || scaffold.main_locations || [];
          
          // Merge scaffold data into outlineJson
          if (!outlineJson || Object.keys(outlineJson).length === 0) {
            console.log('[materialize-entities] V3: Reconstructing outline from film_scaffold');
            outlineJson = {
              ...scaffold,
              main_characters: scaffoldCast,
              main_locations: scaffoldLocs,
            };
          } else if (!outlineJsonHasCast || !outlineJsonHasLocs) {
            console.log('[materialize-entities] V3: Merging scaffold entities into incomplete outline_json');
            outlineJson = {
              ...outlineJson,
              main_characters: outlineJsonHasCast ? (outlineJson as any).main_characters || (outlineJson as any).cast : scaffoldCast,
              main_locations: outlineJsonHasLocs ? (outlineJson as any).main_locations || (outlineJson as any).locations : scaffoldLocs,
              // Also copy title/logline if missing
              title: (outlineJson as any).title || scaffold.title,
              logline: (outlineJson as any).logline || scaffold.logline,
            };
          }
        }
      }
      
      // V3: Check if we have ANYTHING to work with
      if (!outlineJson || Object.keys(outlineJson).length === 0) {
        return new Response(
          JSON.stringify({ 
            error: 'NO_OUTLINE_FOUND', 
            message: 'No se encontró un outline válido. Genera un outline primero.',
            actionable: true,
            suggestedAction: 'generate_outline'
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      outline = outlineJson;
      sourceDescription = `outline (${outlineData?.status}, quality: ${outlineData?.quality || 'unknown'})`;
      
    } else if (source === 'script_breakdown') {
      // Fetch from scripts.parsed_json
      const { data: scriptData, error: scriptError } = await adminClient
        .from('scripts')
        .select('id, parsed_json')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (scriptError) {
        console.error('[materialize-entities] Script fetch error:', scriptError);
        return new Response(
          JSON.stringify({ error: 'SCRIPT_FETCH_ERROR', message: scriptError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!scriptData?.parsed_json) {
        return new Response(
          JSON.stringify({ 
            error: 'NO_SCRIPT_FOUND', 
            message: 'No se encontró un guión. Genera o importa un guión primero.',
            actionable: true,
            suggestedAction: 'generate_script'
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      outline = scriptData.parsed_json;
      sourceDescription = 'script_breakdown';
    }

    console.log('[materialize-entities] Extracting from:', sourceDescription);

    // Extract entities
    const extractedCharacters = extractCharactersFromOutline(outline);
    const extractedLocations = extractLocationsFromOutline(outline);

    console.log('[materialize-entities] Extracted:', {
      characters: extractedCharacters.length,
      locations: extractedLocations.length
    });

    // Upsert characters
    let charactersCreated = 0;
    let charactersUpdated = 0;

    for (const char of extractedCharacters) {
      const normalizedName = normalizeName(char.name);
      
      // Check if exists (case-insensitive)
      const { data: existing } = await adminClient
        .from('characters')
        .select('id, name, bio')
        .eq('project_id', projectId)
        .ilike('name', `%${normalizedName}%`)
        .maybeSingle();
      
      if (existing) {
        // Update existing character (merge profile_json)
        const existingBio = (existing as any).bio;
        const { error: updateError } = await adminClient
          .from('characters')
          .update({
            role: char.role,
            bio: char.bio || existingBio,
            arc: char.arc,
            profile_json: char.profile_json,
            source: 'EXTRACTED', // Valid CHECK constraint value (original source stored in profile_json)
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        
        if (!updateError) charactersUpdated++;
      } else {
        // Insert new character
        const { error: insertError } = await adminClient
          .from('characters')
          .insert({
            project_id: projectId,
            name: char.name,
            role: char.role,
            character_role: char.role as any,
            bio: char.bio,
            arc: char.arc,
            profile_json: char.profile_json,
            source: 'EXTRACTED', // Valid CHECK constraint value (original source stored in profile_json)
            canon_level: 'P2', // Default to P2 (user can promote to P1/P0)
            confidence: 0.8
          });
        
        if (!insertError) charactersCreated++;
      }
    }

    // Upsert locations
    let locationsCreated = 0;
    let locationsUpdated = 0;

    for (const loc of extractedLocations) {
      const normalizedName = normalizeName(loc.name);
      
      // Check if exists (case-insensitive)
      const { data: existing } = await adminClient
        .from('locations')
        .select('id, name, description')
        .eq('project_id', projectId)
        .ilike('name', `%${normalizedName}%`)
        .maybeSingle();
      
      if (existing) {
        // Update existing location
        const existingDescription = (existing as any).description;
        const { error: updateError } = await adminClient
          .from('locations')
          .update({
            description: loc.description || existingDescription,
            narrative_role: loc.narrative_role,
            profile_json: loc.profile_json,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        
        if (!updateError) locationsUpdated++;
      } else {
        // Insert new location
        const { error: insertError } = await adminClient
          .from('locations')
          .insert({
            project_id: projectId,
            name: loc.name,
            description: loc.description,
            narrative_role: loc.narrative_role,
            profile_json: loc.profile_json,
            canon_level: 'P2' // Default to P2
          });
        
        if (!insertError) locationsCreated++;
      }
    }

    console.log('[materialize-entities] Results:', {
      charactersCreated,
      charactersUpdated,
      locationsCreated,
      locationsUpdated
    });

    // V3: HONEST RESPONSE - Never return success:true with 0/0 extracted
    const totalExtracted = extractedCharacters.length + extractedLocations.length;
    const totalMaterialized = (charactersCreated + charactersUpdated) + (locationsCreated + locationsUpdated);
    
    if (totalExtracted === 0) {
      console.warn('[materialize-entities] V3: No entities extracted - outline may be incomplete');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'OUTLINE_NOT_READY',
          message: 'El outline no contiene personajes ni locaciones extraíbles. Puede que la generación aún no haya completado el scaffold.',
          action: 'continue_outline',
          has_partial: outline !== null,
          source: sourceDescription,
          characters: { extracted: 0, created: 0, updated: 0 },
          locations: { extracted: 0, created: 0, updated: 0 }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: sourceDescription,
        characters: {
          extracted: extractedCharacters.length,
          created: charactersCreated,
          updated: charactersUpdated
        },
        locations: {
          extracted: extractedLocations.length,
          created: locationsCreated,
          updated: locationsUpdated
        },
        message: `Materializados ${charactersCreated + charactersUpdated} personajes y ${locationsCreated + locationsUpdated} locaciones desde ${source}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[materialize-entities] Error:', error);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
