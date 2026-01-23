/**
 * COMPILE SCRIPT FROM SCENES
 * 
 * Compiles all generated scenes into a single script document
 * for export (PDF, Final Draft format).
 * 
 * Called automatically when the Narrative System completes.
 */

import { supabase } from '@/integrations/supabase/client';
import { renderScreenplayFromScenes, ScreenplayScene, ScreenplayData } from '@/lib/renderScreenplayText';

export interface CompileScriptOptions {
  projectId: string;
  episodeNumber?: number;
  title?: string;
  synopsis?: string;
}

export interface CompileScriptResult {
  success: boolean;
  scriptId?: string;
  scenesCompiled: number;
  error?: string;
}

/**
 * Compile all scenes from the scenes table into a script document
 */
export async function compileScriptFromScenes(
  options: CompileScriptOptions
): Promise<CompileScriptResult> {
  const { projectId, episodeNumber = 1, title, synopsis } = options;

  try {
    // 1. Fetch all scenes for this project/episode
    // @ts-expect-error - Supabase TS2589 workaround for deeply chained queries
    const { data: scenesData, error: scenesError } = await supabase
      .from('scenes')
      .select('*')
      .eq('project_id', projectId)
      .eq('episode_number', episodeNumber)
      .order('scene_number', { ascending: true });

    if (scenesError) {
      console.error('[CompileScript] Error fetching scenes:', scenesError);
      return { success: false, scenesCompiled: 0, error: String(scenesError.message || scenesError) };
    }

    const scenes: any[] = (scenesData as any[]) || [];

    if (!scenes || scenes.length === 0) {
      return { success: false, scenesCompiled: 0, error: 'No hay escenas para compilar' };
    }

    // 2. Fetch project for title if not provided
    let scriptTitle = title;
    let scriptSynopsis = synopsis;
    
    if (!scriptTitle) {
      const { data: projectData } = await supabase
        .from('projects')
        .select('title')
        .eq('id', projectId)
        .single();
      
      const project = projectData as { title?: string } | null;
      scriptTitle = project?.title || 'Untitled Script';
    }

    // 3. Convert scenes to ScreenplayScene format
    const screenplayScenes: ScreenplayScene[] = scenes.map((scene: any) => {
      const parsedJson = scene.parsed_json || {};
      const dialogues = parsedJson.dialogues || [];
      
      return {
        scene_number: scene.scene_number,
        slugline: scene.slugline || parsedJson.slugline || '',
        action_summary: parsedJson.description || parsedJson.action || scene.objective || '',
        dialogue: dialogues.map((d: any) => ({
          character: d.character || '',
          parenthetical: d.parenthetical || '',
          line: d.line || d.text || '',
        })),
        mood: parsedJson.mood || '',
        conflict: parsedJson.conflict || '',
      };
    });

    // 4. Build screenplay data structure
    const screenplayData: ScreenplayData = {
      title: scriptTitle,
      synopsis: scriptSynopsis,
      episodes: [{
        episode_number: episodeNumber,
        title: scriptTitle,
        scenes: screenplayScenes,
      }],
    };

    // 5. Render to raw_text (Hollywood format)
    const rawText = renderScreenplayFromScenes(screenplayData);

    // 6. Build parsed_json for structured access
    const parsedJson = {
      title: scriptTitle,
      synopsis: scriptSynopsis,
      episodes: [{
        episode_number: episodeNumber,
        title: scriptTitle,
        scenes: scenes.map((scene: any) => ({
          scene_number: scene.scene_number,
          slugline: scene.slugline,
          summary: scene.summary || scene.objective,
          description: scene.parsed_json?.description || '',
          dialogues: scene.parsed_json?.dialogues || [],
          characters_present: scene.characters_involved || [],
          duration_estimate_sec: scene.duration_estimate_sec,
        })),
      }],
      characters: [],
      locations: [],
      compiled_at: new Date().toISOString(),
      scenes_count: scenes.length,
    };

    // 7. Check if script already exists for this project/episode
    const { data: existingScript } = await supabase
      .from('scripts')
      .select('id')
      .eq('project_id', projectId)
      .eq('episode_number', episodeNumber)
      .maybeSingle();

    let scriptId: string;

    if (existingScript) {
      // Update existing script
      const { error: updateError } = await supabase
        .from('scripts')
        .update({
          raw_text: rawText,
          parsed_json: parsedJson,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingScript.id);

      if (updateError) {
        console.error('[CompileScript] Error updating script:', updateError);
        return { success: false, scenesCompiled: 0, error: updateError.message };
      }

      scriptId = existingScript.id;
    } else {
      // Insert new script
      const { data: newScript, error: insertError } = await supabase
        .from('scripts')
        .insert({
          project_id: projectId,
          episode_number: episodeNumber,
          script_type: 'narrative_compiled',
          raw_text: rawText,
          parsed_json: parsedJson,
          status: 'completed',
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[CompileScript] Error inserting script:', insertError);
        return { success: false, scenesCompiled: 0, error: insertError.message };
      }

      scriptId = newScript.id;
    }

    console.log('[CompileScript] Script compiled successfully:', {
      scriptId,
      scenesCompiled: scenes.length,
      rawTextLength: rawText.length,
    });

    return {
      success: true,
      scriptId,
      scenesCompiled: scenes.length,
    };

  } catch (err: any) {
    console.error('[CompileScript] Unexpected error:', err);
    return { success: false, scenesCompiled: 0, error: err.message };
  }
}
