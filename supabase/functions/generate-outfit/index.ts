import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateOutfitRequest {
  characterId: string;
  characterName: string;
  characterDescription: string;
  outfitName: string;
  outfitDescription: string;
  referenceImageBase64?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      characterId, 
      characterName, 
      characterDescription, 
      outfitName, 
      outfitDescription,
      referenceImageBase64 
    } = await req.json() as GenerateOutfitRequest;
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Generating outfit "${outfitName}" for character ${characterName}`);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    let generatedImages: string[] = [];

    if (referenceImageBase64) {
      // Use the reference image to generate variations
      console.log('Using reference image for outfit generation');
      
      const editPrompt = `Generate a character turnaround sheet showing ${characterName} wearing this outfit from multiple angles: front view, three-quarter view, and side view. 
      
Character: ${characterDescription}
Outfit: ${outfitName} - ${outfitDescription}

Style: Professional character design sheet, clean white background, consistent character across all views, animation reference quality.`;

      const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image-preview',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: editPrompt },
              { type: 'image_url', image_url: { url: referenceImageBase64 } }
            ]
          }],
          modalities: ['image', 'text'],
        }),
      });

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imageUrl) {
          generatedImages.push(imageUrl);
        }
      }
    } else {
      // Generate outfit from scratch
      console.log('Generating outfit from description');
      
      const views = ['front', 'three-quarter', 'side'];
      
      for (const view of views) {
        const generatePrompt = `Create a ${view} view character design of ${characterName}.

Character Description: ${characterDescription}

Outfit: ${outfitName}
${outfitDescription}

Style: High quality character design, full body, clean background, professional animation reference, consistent with character description.
View: ${view} view, standing pose.`;

        const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-image-preview',
            messages: [{ role: 'user', content: generatePrompt }],
            modalities: ['image', 'text'],
          }),
        });

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (imageUrl) {
            generatedImages.push(imageUrl);
            console.log(`Generated ${view} view`);
          }
        } else {
          console.error(`Failed to generate ${view} view:`, imageResponse.status);
        }
      }
    }

    if (generatedImages.length === 0) {
      throw new Error('No se pudieron generar imágenes');
    }

    // Save the outfit with generated images
    const { data: outfit, error } = await supabase
      .from('character_outfits')
      .insert({
        character_id: characterId,
        name: outfitName,
        description: outfitDescription,
        reference_urls: generatedImages,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving outfit:', error);
      throw new Error('Error al guardar el vestuario');
    }

    console.log(`Successfully generated outfit with ${generatedImages.length} images`);

    return new Response(JSON.stringify({
      success: true,
      outfit,
      imagesGenerated: generatedImages.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating outfit:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Error desconocido' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
