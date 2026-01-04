import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Dynamic configuration based on file size
interface ProcessingConfig {
  model: string;
  timeoutMs: number;
  maxTokens: number;
  extractionPrompt: string;
  isLarge: boolean;
  estimatedPages: number;
}

function getProcessingConfig(fileSizeBytes: number): ProcessingConfig {
  // Estimate pages: ~3.5KB per page average for screenplay PDFs
  const estimatedPages = Math.ceil(fileSizeBytes / 3500);
  
  if (fileSizeBytes < 100000) {
    // Small: <100KB (~30 pages) - fastest processing
    return {
      model: "google/gemini-2.5-flash",
      timeoutMs: 60000, // 1 min
      maxTokens: 50000,
      isLarge: false,
      estimatedPages,
      extractionPrompt: `Extract ALL text from this PDF screenplay. Preserve exact formatting:
- Scene headings (INT./EXT.)
- Character names in CAPS before dialogue
- Dialogue and parentheticals
- Action lines
Return the complete verbatim text.`
    };
  } else if (fileSizeBytes < 300000) {
    // Medium: 100-300KB (~30-85 pages)
    return {
      model: "google/gemini-2.5-flash",
      timeoutMs: 120000, // 2 min
      maxTokens: 80000,
      isLarge: false,
      estimatedPages,
      extractionPrompt: `Extract the complete screenplay text. Preserve:
- All scene headings (INT./EXT.)
- Character names and dialogue
- Action descriptions
Return verbatim text in screenplay format.`
    };
  } else if (fileSizeBytes < 600000) {
    // Large: 300-600KB (~85-170 pages)
    return {
      model: "google/gemini-2.5-flash-lite",
      timeoutMs: 180000, // 3 min
      maxTokens: 60000,
      isLarge: true,
      estimatedPages,
      extractionPrompt: `Extract screenplay text focusing on:
- Scene headings (INT./EXT.)
- Character names and key dialogue
- Main action beats
Summarize long descriptions if needed. Return in screenplay format.`
    };
  } else {
    // Very large: >600KB (170+ pages)
    return {
      model: "google/gemini-2.5-flash-lite",
      timeoutMs: 240000, // 4 min
      maxTokens: 50000,
      isLarge: true,
      estimatedPages,
      extractionPrompt: `Extract key screenplay elements:
- All scene headings with locations
- Character names and essential dialogue
- Key plot points and action
Skip detailed descriptions. Return structured screenplay format.`
    };
  }
}

// Use AI to extract text from PDF
async function extractTextWithAI(pdfBytes: Uint8Array, config: ProcessingConfig): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not available");
    throw new Error("AI service not configured");
  }

  console.log(`Extracting PDF with config: model=${config.model}, timeout=${config.timeoutMs}ms, ~${config.estimatedPages} pages`);
  
  const pdfBase64 = encodeBase64(pdfBytes);
  console.log(`Encoded PDF to base64: ${pdfBase64.length} chars`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: "You are a professional screenplay text extractor. Output ONLY the extracted text, no commentary."
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
                text: config.extractionPrompt
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: config.maxTokens
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
      console.error("AI extraction timed out after", config.timeoutMs, "ms");
      throw new Error(`Timeout: el PDF (~${config.estimatedPages} páginas) tardó demasiado`);
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
        
        // Get dynamic processing config based on file size
        const config = getProcessingConfig(pdfBytes.length);
        console.log(`Processing config: ${config.estimatedPages} pages, model=${config.model}, timeout=${config.timeoutMs}ms`);
        
        // Try AI extraction first
        let extractedText = "";
        try {
          extractedText = await extractTextWithAI(pdfBytes, config);
        } catch (aiError) {
          console.warn("AI extraction failed, falling back to regex:", aiError);
          extractedText = extractTextFromPdfBytes(pdfBytes);
          
          // If regex extraction also yields poor results for large files, suggest manual input
          if (config.isLarge && extractedText.length < 1000) {
            return new Response(
              JSON.stringify({ 
                error: `Este guión (~${config.estimatedPages} páginas) es muy extenso. Por favor, copia el texto de las primeras 50 páginas y pégalo directamente.`,
                rawText: "",
                needsManualInput: true,
                hint: "Puedes procesar el guión por partes: primero el primer acto, luego el segundo, etc.",
                stats: { estimatedPages: config.estimatedPages, fileSizeKB }
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
              estimatedPages: config.estimatedPages,
              wasLargeFile: config.isLarge,
              modelUsed: config.model
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
        
      } catch (pdfError) {
        console.error("PDF processing error:", pdfError);
        
        // Provide more specific error messages
        const errorMessage = pdfError instanceof Error ? pdfError.message : "Unknown error";
        const isTimeout = errorMessage.toLowerCase().includes("timeout");
        
        return new Response(
          JSON.stringify({ 
            error: isTimeout 
              ? errorMessage
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

    // If text was provided directly (not from PDF), run it through the same formatting AI
    // This ensures consistent quality between PDF extraction and text input
    if (scriptText && !pdfUrl) {
      console.log("Processing direct text input through formatting AI...");
      try {
        const formattingResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                content: "You are a professional screenplay formatter. Your job is to take screenplay text (which may be poorly formatted) and reformat it into proper screenplay format. Output ONLY the reformatted text, no commentary."
              },
              {
                role: "user",
                content: `Reformat this text into proper screenplay format, preserving:
- Scene headings (INT./EXT.) in their own lines, uppercase
- Character names in ALL CAPS before their dialogue
- Dialogue properly indented after character names
- Action lines/descriptions as regular text
- Parentheticals in their proper place

If the text is already well-formatted, return it as-is. If it's prose/narrative, convert it to screenplay format.

Text to format:
${textToProcess}`
              }
            ],
            temperature: 0.1,
            max_tokens: 50000
          }),
        });

        if (formattingResponse.ok) {
          const formattingData = await formattingResponse.json();
          const formattedText = formattingData.choices?.[0]?.message?.content || "";
          if (formattedText.length > textToProcess.length * 0.5) {
            console.log(`Formatted text from ${textToProcess.length} to ${formattedText.length} chars`);
            textToProcess = formattedText;
          } else {
            console.log("Formatting result too short, keeping original text");
          }
        } else {
          console.warn("Formatting AI call failed, using original text");
        }
      } catch (formatError) {
        console.warn("Error in text formatting step, using original text:", formatError);
      }
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
