import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `
<system_identity>
YOU ARE: Cinematic Production Engine v3.3 (LOVABLE EDITION).
TYPE: Editorial Orchestrator.
MODE: JSON-Only Generator.
</system_identity>

<core_logic>
1. HIERARCHY: Canon (P0>P1) > Preset > User.
2. VALIDATION: Check for P0 (Identity) and P1 (Continuity) violations.
3. OUTPUT: You DO NOT chat. You emit UI instructions.
</core_logic>

<canon_rules>
P0 (Identity): Violation = Critical Error. These are immutable character traits, names, core visual identity.
P1 (Continuity): Violation = Warning/Regenerate. These are scene-to-scene consistency elements.
P2 (Visuals): Preferred visual style elements. Can be overridden with explicit user command.
P3 (Preferences): Nice-to-have elements. Lowest priority.
</canon_rules>

<presets>
ACTIVE PRESET: "SUPERPRODUCTION_REALISM" (Default)
- Cinematic aspect ratios (2.39:1, 1.85:1)
- Natural lighting emphasis
- 24fps standard, 48fps for action
- Anamorphic lens preference
- Realistic color grading
</presets>

<response_contract>
You must return a SINGLE VALID JSON object with this exact schema:
{
  "thinking_process": "Brief analysis of the request and canon check",
  "status": "success" | "warning" | "error",
  "canon_updates": [
    {
      "name": "Element name",
      "priority": "P0" | "P1" | "P2" | "P3",
      "type": "character" | "location" | "prop" | "style" | "continuity",
      "description": "Description of the element"
    }
  ],
  "ui_blocks": [
    {
      "type": "scene_card",
      "data": {
        "slugline": "INT. LOCATION - TIME",
        "specs": {
          "lens": "Lens specification",
          "light": "Lighting setup",
          "fps": "Frame rate",
          "aspect": "Aspect ratio",
          "camera_movement": "Movement description",
          "color_grade": "Color grading notes"
        },
        "narrative": "Scene narrative description",
        "script": "Actual script content if provided"
      }
    },
    {
      "type": "violation_alert",
      "level": "P0" | "P1" | "P2",
      "message": "Description of the violation",
      "element": "Name of the violated element"
    },
    {
      "type": "analysis",
      "content": "Analysis text"
    }
  ]
}
</response_contract>

<instructions>
1. When user provides a command, analyze it against existing canon elements.
2. If creating a scene, generate full technical specifications.
3. If a command would violate P0 canon, return an error with violation_alert.
4. If a command would violate P1 canon, return a warning but still generate.
5. Always include your thinking_process for transparency.
6. Extract any new canon elements from user commands and include in canon_updates.
7. Generate scene_card blocks for scene creation commands.
</instructions>
`;

interface CanonElement {
  id: string;
  name: string;
  type: string;
  priority: string;
  specs: Record<string, unknown>;
  description?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, command, canonElements } = await req.json();

    if (!projectId || !command) {
      return new Response(
        JSON.stringify({ error: 'Missing projectId or command' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!openAIApiKey && !anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: 'No AI API key configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build canon context
    const canonContext = (canonElements || []).map((el: CanonElement) => 
      `[${el.priority}] ${el.type}: ${el.name} - ${el.description || JSON.stringify(el.specs)}`
    ).join('\n');

    const userMessage = `
CURRENT CANON ELEMENTS:
${canonContext || 'No canon elements defined yet.'}

USER COMMAND: ${command}

Generate appropriate UI blocks based on this command. If the command involves creating a scene, generate full technical specifications. If any canon violations are detected, include violation_alert blocks.
`;

    let aiResponse;

    // Prefer OpenAI if available
    if (openAIApiKey) {
      console.log('Using OpenAI API');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-5-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
          ],
          max_completion_tokens: 2000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', errorText);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      aiResponse = data.choices[0].message.content;
    } else if (anthropicApiKey) {
      console.log('Using Anthropic API');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Anthropic API error:', errorText);
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      aiResponse = data.content[0].text;
    }

    console.log('AI Response:', aiResponse);

    // Parse JSON from response
    let parsedResponse;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      parsedResponse = {
        thinking_process: 'Failed to parse AI response',
        status: 'error',
        canon_updates: [],
        ui_blocks: [{
          type: 'analysis',
          content: aiResponse
        }]
      };
    }

    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Save the command block
      await supabase.from('cpe_feed_blocks').insert({
        project_id: projectId,
        block_type: 'command',
        data: { command },
        status: 'success',
      });

      // Save thinking/analysis block
      if (parsedResponse.thinking_process) {
        await supabase.from('cpe_feed_blocks').insert({
          project_id: projectId,
          block_type: 'analysis',
          data: { content: parsedResponse.thinking_process },
          status: parsedResponse.status,
        });
      }

      // Process canon updates
      if (parsedResponse.canon_updates?.length > 0) {
        for (const update of parsedResponse.canon_updates) {
          await supabase.from('cpe_canon_elements').insert({
            project_id: projectId,
            name: update.name,
            type: update.type || 'prop',
            priority: update.priority || 'P2',
            description: update.description,
            specs: {},
          });
        }
      }

      // Process UI blocks
      for (const block of parsedResponse.ui_blocks || []) {
        if (block.type === 'scene_card') {
          // Create scene
          const { data: sceneCount } = await supabase
            .from('cpe_scenes')
            .select('id', { count: 'exact' })
            .eq('project_id', projectId);

          await supabase.from('cpe_scenes').insert({
            project_id: projectId,
            slugline: block.data?.slugline || 'UNTITLED SCENE',
            technical_specs: block.data?.specs || {},
            script: block.data?.script || '',
            narrative: block.data?.narrative || '',
            scene_order: (sceneCount?.length || 0) + 1,
          });

          // Also add to feed
          await supabase.from('cpe_feed_blocks').insert({
            project_id: projectId,
            block_type: 'scene',
            data: block.data,
            status: 'success',
          });
        } else if (block.type === 'violation_alert') {
          await supabase.from('cpe_feed_blocks').insert({
            project_id: projectId,
            block_type: 'alert',
            data: { level: block.level, message: block.message, element: block.element },
            status: block.level === 'P0' ? 'error' : 'warning',
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        response: parsedResponse
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in production-engine:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
