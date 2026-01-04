import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract text from PDF using basic pattern matching
function extractTextFromPdfBytes(pdfBytes: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const rawContent = decoder.decode(pdfBytes);
  
  let extractedText = '';
  
  // Method 1: Extract text between BT (Begin Text) and ET (End Text) markers
  const textBlocks = rawContent.match(/BT[\s\S]*?ET/g) || [];
  
  for (const block of textBlocks) {
    // Extract from Tj operator (show text)
    const tjMatches = block.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g) || [];
    for (const tj of tjMatches) {
      const match = tj.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/);
      if (match) {
        let text = match[1];
        // Decode PDF escape sequences
        text = text
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        extractedText += text;
      }
    }
    
    // Extract from TJ operator (show text with positioning)
    const tJMatches = block.match(/\[([^\]]*)\]\s*TJ/gi) || [];
    for (const tJ of tJMatches) {
      const parts = tJ.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g) || [];
      for (const part of parts) {
        let text = part.slice(1, -1);
        text = text
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        extractedText += text;
      }
      extractedText += ' ';
    }
  }
  
  // Method 2: Try to extract from stream objects if Method 1 fails
  if (extractedText.length < 100) {
    // Look for text in stream content
    const streamMatches = rawContent.match(/stream\s*([\s\S]*?)\s*endstream/g) || [];
    for (const stream of streamMatches) {
      // Look for readable ASCII text patterns
      const readableText = stream.match(/[A-Za-z][A-Za-z0-9\s.,!?'"()-]{10,}/g) || [];
      extractedText += readableText.join(' ') + ' ';
    }
  }
  
  // Clean up extracted text
  extractedText = extractedText
    .replace(/\x00/g, '') // Remove null bytes
    .replace(/[^\x20-\x7E\n\r\táéíóúñÁÉÍÓÚÑüÜ¿¡]/g, ' ') // Keep printable chars + Spanish
    .replace(/\s+/g, ' ')
    .trim();
  
  return extractedText;
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

    // If pdfUrl is provided, fetch and extract text
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
        
        // Extract text from PDF
        const extractedText = extractTextFromPdfBytes(pdfBytes);
        console.log(`Extracted ${extractedText.length} characters from PDF`);
        
        if (extractedText.length < 50) {
          // If extraction failed, return a helpful message
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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
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

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
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
