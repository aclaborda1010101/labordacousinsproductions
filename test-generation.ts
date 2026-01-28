/**
 * Test script generation with few-shot examples
 * Uses Google AI directly via fetch to test the prompt quality
 */

const GOOGLE_API_KEY = "AIzaSyCbuoizWsO3Yje7N8UPwxbYhmGSOyiCqjA";

// Few-shot examples
const FEW_SHOT_EXAMPLES = `
━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 EJEMPLOS DE GUIONES PROFESIONALES (COMEDIA)
━━━━━━━━━━━━━━━━━━━━━━━━━━
Estudia estos fragmentos de guiones reales antes de escribir.
Observa: formato, ritmo, economía visual, diálogos con subtexto.

━━━━━━━━━━━━━━━━━━━━━━━━━━
EJEMPLO 1 (Brooklyn Nine-Nine)
━━━━━━━━━━━━━━━━━━━━━━━━━━
INT. COPY ROOM - LATER

Charles walks up to Gina.
CHARLES
Hey, my flight is at eight tonight. It's domestic. Do you think I'll be safe if I get to the airport five hours early?
GINA
I would give yourself at least seven.
Charles nods: "You're right."
GINA (CONT'D)
Why are you going on a singles cruise anyway? I thought you were into Rosa.
CHARLES
Well, I am. But I've begun to feel like there is a small chance Rosa may not love me back.

━━━━━━━━━━━━━━━━━━━━━━━━━━
EJEMPLO 2 (Pitch Perfect 2)
━━━━━━━━━━━━━━━━━━━━━━━━━━
INT. BELLA HOUSE - NIGHT

Emily stands in front of the Bellas. There is a hazardous amount of lit candles around her. Beca hands Emily a large wine glass.
BECA
It's ceremonial. And you should definitely not drink it because it is essentially poison.
EMILY
(smells it)
Aw, it smells like cherry and vanilla.

━━━━━━━━━━━━━━━━━━━━━━━━━━
APLICA ESTOS PATRONES:
- Descripciones visuales, no explicativas
- Diálogos con intención oculta
- Ritmo cinematográfico (párrafos cortos)
- Detalles específicos, no genéricos
━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

const SYSTEM_PROMPT = `Eres guionista profesional de CINE (nivel Hollywood).

FORMATO: Guión literario profesional español.

REGLAS CORE:
1. Slugline: INT./EXT. LUGAR - MOMENTO
2. Acción: Presente, visual, máx 4 líneas/párrafo
3. Diálogo: Subtexto > texto, voces únicas
4. Prohibido: "todo cambia", "se da cuenta", "la tensión aumenta"

${FEW_SHOT_EXAMPLES}

Genera UNA escena completa basándote en el beat que te doy.
Incluye:
- Slugline
- Descripción de situación (8-12 líneas)
- Diálogos con subtexto
- Acción visual
`;

const TEST_BEAT = `BEAT: Baltasar (40s, negro, médico de urgencias) llega tarde a su turno de noche en el hospital. 
Su jefe, el Dr. Bermúdez (50s, blanco, condescendiente), le hace un comentario pasivo-agresivo sobre 
la puntualidad. Baltasar aguanta con dignidad glacial mientras una enfermera (María, 30s) observa 
incómoda. El ambiente está cargado de tensión racial no dicha.`;

async function testGeneration() {
  console.log("🎬 Testing script generation with few-shot learning...\n");
  
  console.log("📝 Beat to generate:");
  console.log(TEST_BEAT);
  console.log("\n" + "=".repeat(60) + "\n");
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + TEST_BEAT }] }
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2000
          }
        })
      }
    );
    
    const data = await response.json() as any;
    
    if (data.error) {
      console.error("❌ API Error:", data.error);
      return;
    }
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
    
    console.log("✅ GENERATED SCENE:\n");
    console.log(text);
    console.log("\n" + "=".repeat(60));
    
    // Basic quality checks
    console.log("\n📊 Quality Checks:");
    console.log(`- Has INT/EXT slugline: ${/INT\.|EXT\./.test(text)}`);
    console.log(`- Has character names in caps: ${/[A-Z]{4,}/.test(text)}`);
    console.log(`- Word count: ${text.split(/\s+/).length}`);
    console.log(`- Has dialogue: ${text.includes('BALTASAR') || text.includes('BERMÚDEZ')}`);
    
    // Check for forbidden phrases
    const forbidden = ["todo cambia", "se da cuenta", "la tensión aumenta", "empiezan a"];
    const foundForbidden = forbidden.filter(phrase => text.toLowerCase().includes(phrase));
    console.log(`- Forbidden phrases found: ${foundForbidden.length > 0 ? foundForbidden.join(", ") : "none ✓"}`);
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testGeneration();
