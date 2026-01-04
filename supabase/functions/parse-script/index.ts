import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Use AI to extract text from PDF by sending it as base64
async function extractTextWithAI(pdfBytes: Uint8Array): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not available");
    throw new Error("AI service not configured");
  }

  console.log("Using AI to extract PDF text...");
  
  // Use Deno's built-in base64 encoder (handles large files properly)
  const pdfBase64 = encodeBase64(pdfBytes);
  console.log(`Encoded PDF to base64: ${pdfBase64.length} chars`);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a professional screenplay text extractor. Extract ALL text content from the provided PDF document.

CRITICAL RULES:
- Extract the COMPLETE text, preserving the original screenplay structure
- Keep formatting: INT./EXT. headers, character names in CAPS, dialogue, parentheticals, action lines
- Preserve scene breaks and dialogue formatting
- Include footnotes and annotations if present
- Output ONLY the extracted text verbatim, no summaries or metadata
- If text is in Spanish, keep it in Spanish`
        },
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: "script.pdf",
                file_data: `data:application/pdf;base64,${pdfBase64}`
              }
            },
            {
              type: "text",
              text: "Extract all text from this PDF screenplay. Return the complete verbatim text."
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 100000
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI extraction error:", response.status, errorText);
    throw new Error(`AI extraction failed: ${response.status}`);
  }

  const data = await response.json();
  const extractedText = data.choices?.[0]?.message?.content || "";
  
  console.log(`AI extracted ${extractedText.length} characters`);
  return extractedText;
}

// Fallback: Extract text from PDF using basic pattern matching
function extractTextFromPdfBytes(pdfBytes: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const rawContent = decoder.decode(pdfBytes);
  
  let extractedText = '';
  const textBlocks = rawContent.match(/BT[\s\S]*?ET/g) || [];
  
  for (const block of textBlocks) {
    const tjMatches = block.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g) || [];
    for (const tj of tjMatches) {
      const match = tj.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/);
      if (match) {
        let text = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        extractedText += text;
      }
    }
  }
  
  return extractedText
    .replace(/\x00/g, '')
    .replace(/[^\x20-\x7E\n\r\táéíóúñÁÉÍÓÚÑüÜ¿¡]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { scriptText, pdfUrl, projectId } = body;

    console.log("parse-script called with:", { hasPdfUrl: !!pdfUrl, hasScriptText: !!scriptText, projectId });

    let textToProcess = scriptText;

    // If pdfUrl is provided, fetch and extract text using AI
    if (pdfUrl && !scriptText) {
      console.log("Fetching PDF from:", pdfUrl);
      
      try {
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
        }
        
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const pdfBytes = new Uint8Array(pdfBuffer);
        console.log(`PDF downloaded: ${pdfBytes.length} bytes`);
        
        // Try AI extraction first
        let extractedText = "";
        try {
          extractedText = await extractTextWithAI(pdfBytes);
        } catch (aiError) {
          console.warn("AI extraction failed, falling back to regex:", aiError);
          extractedText = extractTextFromPdfBytes(pdfBytes);
        }
        
        console.log(`Extracted ${extractedText.length} characters from PDF`);
        
        if (extractedText.length < 50) {
          console.log("PDF text extraction yielded minimal results");
          return new Response(
            JSON.stringify({ 
              error: "El PDF parece ser escaneado o tiene un formato no compatible. Por favor, copia y pega el texto directamente.",
              rawText: "",
              needsManualInput: true
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        textToProcess = extractedText;
        
        // Return raw text for the frontend to use
        return new Response(
          JSON.stringify({ 
            rawText: textToProcess,
            success: true 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
        
      } catch (pdfError) {
        console.error("PDF processing error:", pdfError);
        return new Response(
          JSON.stringify({ 
            error: "Error al procesar el PDF. Intenta copiar y pegar el texto directamente.",
            rawText: "",
            needsManualInput: true
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!textToProcess) {
      return new Response(
        JSON.stringify({ error: "Script text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI Gateway for parsing
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a professional script breakdown assistant. Analyze the provided screenplay text and extract scenes.

For each scene, identify:
1. Slugline (scene heading like "INT. COFFEE SHOP - DAY")
2. A brief summary of what happens (1-2 sentences)
3. Characters present (names only)
4. Location name
5. Time of day (day, night, dawn, dusk, continuous)
6. Count of dialogue lines

Return a JSON object with this structure:
{
  "scenes": [
    {
      "slugline": "INT. COFFEE SHOP - DAY",
      "summary": "Sarah meets James for a tense confrontation about evidence.",
      "characters": ["SARAH", "JAMES"],
      "location": "Coffee Shop",
      "time_of_day": "day",
      "dialogue_count": 5
    }
  ]
}

Rules:
- Split scenes at INT./EXT. headers
- Extract character names from dialogue (they appear in ALL CAPS before dialogue)
- Parse location from slugline
- Keep summaries concise and action-focused
- Return valid JSON only`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this screenplay:\n\n${textToProcess}` }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let scenes = [];
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        scenes = parsed.scenes || [];
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      console.log("Raw content:", content);
      
      scenes = [{
        slugline: "SCENE 1",
        summary: "Imported scene from script",
        characters: [],
        location: "Unknown",
        time_of_day: "day",
        dialogue_count: 0
      }];
    }

    console.log(`Parsed ${scenes.length} scenes from script`);

    return new Response(
      JSON.stringify({ scenes, rawText: textToProcess }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("parse-script error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
