import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuthOrDemo, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-key',
};

interface RunwayPollRequest {
  taskId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const { userId } = await requireAuthOrDemo(req);
    console.log("[AUTH] Authenticated user:", userId);

    const { taskId }: RunwayPollRequest = await req.json();

    if (!taskId) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'taskId is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RUNWAY_API_KEY = Deno.env.get('RUNWAY_API_KEY');

    if (!RUNWAY_API_KEY) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'RUNWAY_API_KEY not configured'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Polling Runway task: ${taskId}`);

    const pollResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${RUNWAY_API_KEY}`,
        'X-Runway-Version': '2024-11-06',
      }
    });

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      console.error('Runway poll error:', pollResponse.status, errorText);
      return new Response(JSON.stringify({
        ok: false,
        error: `Runway API error: ${pollResponse.status}`
      }), {
        status: pollResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pollData = await pollResponse.json();
    console.log('Runway poll result:', JSON.stringify(pollData).substring(0, 500));

    // Runway status: PENDING, RUNNING, SUCCEEDED, FAILED
    const status = pollData.status;
    
    // Map Runway status to our internal status
    let normalizedStatus: 'pending' | 'processing' | 'completed' | 'failed';
    switch (status) {
      case 'PENDING':
        normalizedStatus = 'pending';
        break;
      case 'RUNNING':
      case 'THROTTLED':
        normalizedStatus = 'processing';
        break;
      case 'SUCCEEDED':
        normalizedStatus = 'completed';
        break;
      case 'FAILED':
      case 'CANCELLED':
        normalizedStatus = 'failed';
        break;
      default:
        normalizedStatus = 'processing';
    }

    // Extract video URL from output array
    let videoUrl: string | null = null;
    if (normalizedStatus === 'completed' && pollData.output && Array.isArray(pollData.output)) {
      videoUrl = pollData.output[0] || null;
    }

    // Calculate progress based on status
    let progress = 0;
    if (normalizedStatus === 'pending') progress = 10;
    else if (normalizedStatus === 'processing') progress = pollData.progress || 50;
    else if (normalizedStatus === 'completed') progress = 100;
    else if (normalizedStatus === 'failed') progress = 0;

    return new Response(JSON.stringify({
      ok: true,
      taskId,
      status: normalizedStatus,
      runwayStatus: status,
      videoUrl,
      progress,
      error: pollData.failure || pollData.failureCode || null,
      createdAt: pollData.createdAt,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in runway_poll:', error);
    
    if (error instanceof Error) {
      return authErrorResponse(error, corsHeaders);
    }
    
    return new Response(JSON.stringify({
      ok: false,
      error: 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
