import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// BATCH ORCHESTRATOR v3.0
// This function ONLY orchestrates - it NEVER generates content directly
// All generation goes through the canonical generate-script router
// =============================================================================

interface BatchOrchestratorRequest {
  projectId: string;
  totalEpisodes: number;
  qualityTier: 'DRAFT' | 'PRODUCTION';
  outline: any;
  language?: string;
  narrativeMode?: string;
  scenesPerBatch?: number;
  batchesPerEpisode?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const request: BatchOrchestratorRequest = await req.json();
    const {
      projectId,
      totalEpisodes,
      qualityTier = 'PRODUCTION',
      outline,
      language = 'es',
      narrativeMode = 'serie_adictiva',
      scenesPerBatch = 5,
      batchesPerEpisode = 4
    } = request;

    if (!projectId || !outline || !totalEpisodes) {
      return new Response(
        JSON.stringify({ error: 'projectId, outline, and totalEpisodes are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[batch-orchestrator] v3.0 Starting:', {
      projectId,
      totalEpisodes,
      qualityTier,
      batchesPerEpisode,
      scenesPerBatch
    });

    // 1. Create batch_run record
    const { data: batchRun, error: batchRunError } = await supabase
      .from('batch_runs')
      .insert({
        project_id: projectId,
        total_episodes: totalEpisodes,
        quality_tier: qualityTier,
        status: 'running'
      })
      .select()
      .single();

    if (batchRunError) {
      console.error('[batch-orchestrator] Failed to create batch_run:', batchRunError);
      throw new Error('Failed to create batch run record');
    }

    const batchRunId = batchRun.id;
    console.log('[batch-orchestrator] Created batch_run:', batchRunId);

    // 2. Create batch_run_items for each episode
    const items = [];
    for (let ep = 1; ep <= totalEpisodes; ep++) {
      items.push({
        batch_run_id: batchRunId,
        episode_number: ep,
        status: 'pending'
      });
    }

    const { error: itemsError } = await supabase
      .from('batch_run_items')
      .insert(items);

    if (itemsError) {
      console.error('[batch-orchestrator] Failed to create batch_run_items:', itemsError);
    }

    // 3. Process each episode
    let episodesDone = 0;
    let episodesFailed = 0;
    const failedEpisodeNumbers: number[] = [];
    const results: any[] = [];

    for (let epNum = 1; epNum <= totalEpisodes; epNum++) {
      // Update item status to running
      await supabase
        .from('batch_run_items')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('batch_run_id', batchRunId)
        .eq('episode_number', epNum);

      let episodeScenes: any[] = [];
      let episodeError: string | null = null;
      let retryCount = 0;
      const maxRetries = 1;

      // Process batches for this episode
      for (let batchIdx = 0; batchIdx < batchesPerEpisode; batchIdx++) {
        let batchSuccess = false;
        let lastError: Error | null = null;

        // Retry logic for transient errors
        for (let attempt = 0; attempt <= maxRetries && !batchSuccess; attempt++) {
          try {
            if (attempt > 0) {
              console.log(`[batch-orchestrator] Retry ${attempt} for Ep${epNum} batch${batchIdx}`);
              retryCount++;
              await new Promise(r => setTimeout(r, 2000 * attempt)); // Backoff
            }

            // Call generate-script canonical router
            const generateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-script`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                outline,
                episodeNumber: epNum,
                batchIndex: batchIdx,
                previousScenes: episodeScenes,
                qualityTier,
                language,
                narrativeMode,
                scenesPerBatch,
                totalBatches: batchesPerEpisode,
                isLastBatch: batchIdx === batchesPerEpisode - 1
              })
            });

            if (!generateResponse.ok) {
              const errorText = await generateResponse.text();
              throw new Error(`generate-script failed: ${generateResponse.status} - ${errorText}`);
            }

            const batchResult = await generateResponse.json();
            
            if (batchResult.scenes && Array.isArray(batchResult.scenes)) {
              episodeScenes.push(...batchResult.scenes);
              batchSuccess = true;
            } else {
              throw new Error('Invalid response from generate-script: no scenes array');
            }

          } catch (error) {
            lastError = error as Error;
            console.error(`[batch-orchestrator] Ep${epNum} batch${batchIdx} attempt${attempt} failed:`, error);
          }
        }

        // If batch failed after retries, mark episode as failed but continue
        if (!batchSuccess) {
          episodeError = lastError?.message || 'Unknown batch error';
          break; // Stop processing this episode's batches
        }
      }

      // Update episode status
      const episodeStatus = episodeError ? 'failed' : 'done';
      
      await supabase
        .from('batch_run_items')
        .update({
          status: episodeStatus,
          error: episodeError,
          created_scenes_count: episodeScenes.length,
          retry_count: retryCount,
          completed_at: new Date().toISOString()
        })
        .eq('batch_run_id', batchRunId)
        .eq('episode_number', epNum);

      if (episodeError) {
        episodesFailed++;
        failedEpisodeNumbers.push(epNum);
        console.log(`[batch-orchestrator] Episode ${epNum} FAILED: ${episodeError}`);
      } else {
        episodesDone++;
        results.push({
          episode_number: epNum,
          scenes_count: episodeScenes.length,
          scenes: episodeScenes
        });
        console.log(`[batch-orchestrator] Episode ${epNum} DONE: ${episodeScenes.length} scenes`);
      }

      // Update batch_run progress
      await supabase
        .from('batch_runs')
        .update({
          episodes_done: episodesDone,
          episodes_failed: episodesFailed,
          failed_episode_numbers: failedEpisodeNumbers
        })
        .eq('id', batchRunId);

      // Delay between episodes to avoid rate limits
      if (epNum < totalEpisodes) {
        const delayMs = qualityTier === 'PRODUCTION' ? 20000 : 3000;
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    // 4. Finalize batch run
    const finalStatus = episodesFailed === 0 ? 'done' : (episodesDone > 0 ? 'partial' : 'failed');
    
    await supabase
      .from('batch_runs')
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString()
      })
      .eq('id', batchRunId);

    const durationMs = Date.now() - startedAt;
    console.log(`[batch-orchestrator] COMPLETED in ${durationMs}ms:`, {
      status: finalStatus,
      episodesDone,
      episodesFailed,
      failedEpisodeNumbers
    });

    return new Response(
      JSON.stringify({
        batch_run_id: batchRunId,
        status: finalStatus,
        episodes_done: episodesDone,
        episodes_failed: episodesFailed,
        failed_episode_numbers: failedEpisodeNumbers,
        results,
        duration_ms: durationMs,
        _meta: {
          qualityTier,
          schemaVersion: '3.0'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[batch-orchestrator] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
