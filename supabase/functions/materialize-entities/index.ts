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

// Extract characters from outline structure
function extractCharactersFromOutline(outline: any): ExtractedCharacter[] {
  const characters: ExtractedCharacter[] = [];
  const seenNames = new Set<string>();
  
  // From main_characters array
  if (Array.isArray(outline?.main_characters)) {
    outline.main_characters.forEach((c: any) => {
      const name = c.name?.trim();
      if (!name) return;
      
      const normalizedName = normalizeName(name);
      if (seenNames.has(normalizedName)) return;
      seenNames.add(normalizedName);
      
      characters.push({
        name: c.name.trim(),
        role: mapToCharacterRole(c.role || 'protagonist'),
        bio: c.description || c.bio || null,
        arc: c.arc || null,
        profile_json: { 
          source: 'outline',
          original_role: c.role,
          description: c.description,
          arc: c.arc,
          relationships: c.relationships,
          ...c
        }
      });
    });
  }
  
  // From supporting_characters array
  if (Array.isArray(outline?.supporting_characters)) {
    outline.supporting_characters.forEach((c: any) => {
      const name = c.name?.trim();
      if (!name) return;
      
      const normalizedName = normalizeName(name);
      if (seenNames.has(normalizedName)) return;
      seenNames.add(normalizedName);
      
      characters.push({
        name: c.name.trim(),
        role: mapToCharacterRole(c.role || 'supporting'),
        bio: c.description || c.bio || null,
        arc: c.arc || null,
        profile_json: { source: 'outline', ...c }
      });
    });
  }
  
  // From episode_beats.key_characters
  if (Array.isArray(outline?.episode_beats)) {
    outline.episode_beats.forEach((ep: any) => {
      const keyChars = ep?.key_characters || ep?.characters_present || [];
      keyChars.forEach((c: any) => {
        const name = typeof c === 'string' ? c.trim() : c.name?.trim();
        if (!name) return;
        
        const normalizedName = normalizeName(name);
        if (seenNames.has(normalizedName)) return;
        seenNames.add(normalizedName);
        
        characters.push({
          name: typeof c === 'string' ? c.trim() : c.name.trim(),
          role: 'recurring',
          bio: typeof c === 'object' ? c.description : null,
          arc: null,
          profile_json: { source: 'outline_beat', episode: ep.episode, original: c }
        });
      });
    });
  }
  
  return characters;
}

// Extract locations from outline structure
function extractLocationsFromOutline(outline: any): ExtractedLocation[] {
  const locations: ExtractedLocation[] = [];
  const seenNames = new Set<string>();
  
  // From main_locations array
  if (Array.isArray(outline?.main_locations)) {
    outline.main_locations.forEach((l: any) => {
      const name = l.name?.trim();
      if (!name) return;
      
      const normalizedName = normalizeName(name);
      if (seenNames.has(normalizedName)) return;
      seenNames.add(normalizedName);
      
      locations.push({
        name: l.name.trim(),
        description: l.description || null,
        narrative_role: l.narrative_role || l.role || null,
        profile_json: { source: 'outline', ...l }
      });
    });
  }
  
  // From episode_beats.location/locations
  if (Array.isArray(outline?.episode_beats)) {
    outline.episode_beats.forEach((ep: any) => {
      // Single location field
      if (ep?.location) {
        const name = typeof ep.location === 'string' ? ep.location.trim() : ep.location.name?.trim();
        if (name) {
          const normalizedName = normalizeName(name);
          if (!seenNames.has(normalizedName)) {
            seenNames.add(normalizedName);
            locations.push({
              name: name,
              description: typeof ep.location === 'object' ? ep.location.description : null,
              narrative_role: null,
              profile_json: { source: 'outline_beat', episode: ep.episode }
            });
          }
        }
      }
      
      // Multiple locations array
      if (Array.isArray(ep?.locations)) {
        ep.locations.forEach((l: any) => {
          const name = typeof l === 'string' ? l.trim() : l.name?.trim();
          if (!name) return;
          
          const normalizedName = normalizeName(name);
          if (seenNames.has(normalizedName)) return;
          seenNames.add(normalizedName);
          
          locations.push({
            name: typeof l === 'string' ? l.trim() : l.name.trim(),
            description: typeof l === 'object' ? l.description : null,
            narrative_role: null,
            profile_json: { source: 'outline_beat', episode: ep.episode }
          });
        });
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
      // Fetch outline from project_outlines
      const query = adminClient
        .from('project_outlines')
        .select('id, outline_json, quality, status')
        .eq('project_id', projectId);
      
      if (outlineId) {
        query.eq('id', outlineId);
      } else {
        // Get the most recent approved or completed outline
        query.in('status', ['approved', 'completed', 'generating']).order('created_at', { ascending: false }).limit(1);
      }
      
      const { data: outlineData, error: outlineError } = await query.maybeSingle();
      
      if (outlineError) {
        console.error('[materialize-entities] Outline fetch error:', outlineError);
        return new Response(
          JSON.stringify({ error: 'OUTLINE_FETCH_ERROR', message: outlineError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!outlineData?.outline_json) {
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
      
      outline = outlineData.outline_json;
      sourceDescription = `outline (${outlineData.status}, quality: ${outlineData.quality || 'unknown'})`;
      
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
