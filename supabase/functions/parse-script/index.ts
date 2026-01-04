import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum PDF size for AI processing (5MB - larger files should use chunking)
const MAX_PDF_SIZE_FOR_AI = 5 * 1024 * 1024;
// Maximum pages to process at once
const MAX_PAGES_PER_CHUNK = 50;

// Use AI to extract text from PDF by sending it as base64
async function extractTextWithAI(pdfBytes: Uint8Array, isLargeFile: boolean = false): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not available");
    throw new Error("AI service not configured");
  }

  console.log(`Using AI to extract PDF text... (large file: ${isLargeFile})`);
  
  const pdfBase64 = encodeBase64(pdfBytes);
  console.log(`Encoded PDF to base64: ${pdfBase64.length} chars`);

  // Use flash-lite for faster processing on large files
  const model = isLargeFile ? "google/gemini-2.5-flash-lite" : "google/gemini-2.5-flash";
  
  // For large files, focus on key screenplay elements only
  const systemPrompt = isLargeFile 
    ? `Extract screenplay text from this PDF. Focus on:
- Scene headings (INT./EXT.)
- Character names and dialogue
- Key action lines
Return the text in screenplay format. Skip detailed descriptions if needed to complete faster.`
    : `You are a professional screenplay text extractor. Extract ALL text content from the provided PDF document.

CRITICAL RULES:
- Extract the COMPLETE text, preserving the original screenplay structure
- Keep formatting: INT./EXT. headers, character names in CAPS, dialogue, parentheticals, action lines
- Preserve scene breaks and dialogue formatting
- Include footnotes and annotations if present
- Output ONLY the extracted text verbatim, no summaries or metadata
- If text is in Spanish, keep it in Spanish`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), isLargeFile ? 180000 : 120000); // 3min for large, 2min for normal

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt
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
                text: isLargeFile 
                  ? "Extract the screenplay text from this PDF. Focus on scenes, characters, and dialogue."
                  : "Extract all text from this PDF screenplay. Return the complete verbatim text."
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: isLargeFile ? 50000 : 100000
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI extraction error:", response.status, errorText);
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content || "";
    
    console.log(`AI extracted ${extractedText.length} characters`);
    return extractedText;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error("AI extraction timed out");
      throw new Error("AI extraction timed out - file too large");
    }
    throw error;
  }
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
        const fileSizeKB = Math.round(pdfBytes.length / 1024);
        console.log(`PDF downloaded: ${pdfBytes.length} bytes (${fileSizeKB}KB)`);
        
        // Determine if this is a large file
        const isLargeFile = pdfBytes.length > 300000; // >300KB is considered large (approx 100+ pages)
        
        if (isLargeFile) {
          console.log("Large PDF detected, using optimized extraction...");
        }
        
        // Try AI extraction first
        let extractedText = "";
        try {
          extractedText = await extractTextWithAI(pdfBytes, isLargeFile);
        } catch (aiError) {
          console.warn("AI extraction failed, falling back to regex:", aiError);
          extractedText = extractTextFromPdfBytes(pdfBytes);
          
          // If regex extraction also yields poor results for large files, suggest manual input
          if (isLargeFile && extractedText.length < 1000) {
            return new Response(
              JSON.stringify({ 
                error: "Este guión es muy extenso para procesamiento automático. Por favor, copia el texto de las primeras 50-100 páginas y pégalo directamente.",
                rawText: "",
                needsManualInput: true,
                hint: "Puedes procesar el guión por partes: primero el primer acto, luego el segundo, etc."
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
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
            success: true,
            stats: {
              originalSizeKB: fileSizeKB,
              extractedChars: extractedText.length,
              wasLargeFile: isLargeFile
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
        
      } catch (pdfError) {
        console.error("PDF processing error:", pdfError);
        
        // Provide more specific error messages
        const errorMessage = pdfError instanceof Error ? pdfError.message : "Unknown error";
        const isTimeout = errorMessage.includes("timed out") || errorMessage.includes("timeout");
        
        return new Response(
          JSON.stringify({ 
            error: isTimeout 
              ? "El guión es demasiado largo para procesarlo completo. Intenta copiar y pegar solo las primeras 50 páginas."
              : "Error al procesar el PDF. Intenta copiar y pegar el texto directamente.",
            rawText: "",
            needsManualInput: true,
            hint: isTimeout ? "Puedes dividir el guión en partes (Acto 1, Acto 2, etc.) y procesarlas por separado." : undefined
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
