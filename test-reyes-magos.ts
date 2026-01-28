/**
 * Test script generation for Los Reyes Magos
 * Direct call to Google AI with the few-shot system
 */

const GOOGLE_API_KEY = "AIzaSyCbuoizWsO3Yje7N8UPwxbYhmGSOyiCqjA";

const FEW_SHOT_COMEDY = `
━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 EJEMPLOS DE GUIONES PROFESIONALES (COMEDIA)
━━━━━━━━━━━━━━━━━━━━━━━━━━

EJEMPLO 1 (Brooklyn Nine-Nine)
INT. COPY ROOM - LATER

Charles walks up to Gina.
CHARLES
Hey, my flight is at eight tonight. It's domestic. Do you think I'll be safe if I get to the airport five hours early?
GINA
I would give yourself at least seven.
Charles nods: "You're right."

EJEMPLO 2 (The Office - Adapted)
INT. CONFERENCE ROOM - DAY

Michael stands at the whiteboard. "DIVERSITY DAY" is written in Comic Sans.
MICHAEL
I don't see color. People tell me I'm white and I believe them because I buy my shirts at Banana Republic.
Jim looks at the camera. His face says everything.

━━━━━━━━━━━━━━━━━━━━━━━━━━
APLICA ESTOS PATRONES:
- Humor en el subtexto, no en el chiste obvio
- Diálogos que revelan carácter
- Ironía situacional
- Ritmo cómico preciso
━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

const SYSTEM_PROMPT = `Eres guionista profesional de CINE español (nivel Hollywood).

PROYECTO: "La Noche de Reyes"
GÉNERO: Comedia social inteligente
TONO: Irónico, incómodo, navideño pero nada ñoño

PREMISA:
Tres hombres corrientes (Baltasar - negro harto de prejuicios; Gaspar - pelirrojo "el raro"; 
Melchor - gay con vida doble) se convierten cada noche de Reyes en los auténticos Reyes Magos. 
Su poder no es mágico: es ser escuchados, respetados, obedecidos. Ajustan cuentas con ironía, 
corrigen injusticias con elegancia cruel, exponen hipocresías con humor incómodo.
Al amanecer no recuerdan nada, pero el mundo sí cambia.

${FEW_SHOT_COMEDY}

REGLAS:
1. Slugline: INT./EXT. LUGAR - MOMENTO
2. Acción: Presente, visual, máx 4 líneas/párrafo
3. Diálogo: Subtexto > texto, voces únicas
4. El humor viene de la incomodidad social, no de chistes
5. Prohibido: "todo cambia", "se da cuenta", "la tensión aumenta"

Genera UNA escena completa con formato de guión profesional.
`;

const BEAT = `ESCENA 1: Presentación de Baltasar

Baltasar (45, negro, médico de urgencias) termina su turno de noche en el hospital. 
Son las 23:30 del 5 de enero. Un paciente borracho le llama "negrito" y le pregunta 
si es de los Reyes Magos. Baltasar aguanta con dignidad profesional, pero vemos el 
cansancio acumulado de toda una vida de microagresiones. 

Al salir, algo cambia en él - sus ojos brillan diferente. No lo sabe, pero la 
transformación ha comenzado.`;

async function testGeneration() {
  console.log("🎬 Generando escena de 'La Noche de Reyes'...\n");
  console.log("Beat:", BEAT);
  console.log("\n" + "=".repeat(70) + "\n");
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + BEAT }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 3000 }
      })
    }
  );
  
  const data = await response.json() as any;
  
  if (data.error) {
    console.error("❌ Error:", data.error);
    return;
  }
  
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
  
  console.log("✅ ESCENA GENERADA:\n");
  console.log(text);
  console.log("\n" + "=".repeat(70));
  
  // Quality analysis
  console.log("\n📊 Análisis de Calidad:");
  console.log(`- Slugline presente: ${/INT\.|EXT\./.test(text) ? '✅' : '❌'}`);
  console.log(`- Personaje BALTASAR: ${text.includes('BALTASAR') ? '✅' : '❌'}`);
  console.log(`- Palabras: ${text.split(/\s+/).length}`);
  
  const forbidden = ["todo cambia", "se da cuenta", "la tensión aumenta"];
  const found = forbidden.filter(p => text.toLowerCase().includes(p));
  console.log(`- Frases prohibidas: ${found.length === 0 ? '✅ ninguna' : '❌ ' + found.join(', ')}`);
}

testGeneration();
