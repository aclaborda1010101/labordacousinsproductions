/**
 * Test script generation for Los Reyes Magos - V3 FINAL
 * Maximum quality with stricter rules
 */

const GOOGLE_API_KEY = "AIzaSyCbuoizWsO3Yje7N8UPwxbYhmGSOyiCqjA";

const SYSTEM_PROMPT = `Eres el guionista de "Parásitos" escribiendo una comedia negra española.

PROYECTO: "La Noche de Reyes"

PREMISA EN UNA LÍNEA:
Tres hombres hartos de ser invisibles (un negro, un pelirrojo, un gay en el armario) 
descubren que cada Noche de Reyes tienen autoridad absoluta. Sin magia. Sin explicaciones. 
Solo poder.

BALTASAR (45): Médico urgencias. Negro. Español de Vallecas. 20 años aguantando 
"¿pero tú de dónde eres DE VERDAD?" con una sonrisa profesional perfecta.

═══════════════════════════════════════════════════════════════════
EJEMPLOS DE TONO (COPIA ESTE NIVEL)
═══════════════════════════════════════════════════════════════════

EJEMPLO A - Microagresión con naturalidad escalofriante:
---
INT. CENA NAVIDAD - NOCHE

TÍO MANOLO sirve el cordero. LUCÍA (30, negra, adoptada) espera su plato.
TÍO MANOLO
A ti te pongo menos, ¿no? Que vosotros coméis diferente.
LUCÍA
Soy de Alcorcón, tío.
TÍO MANOLO
Ya, ya. Pero los genes son los genes.
Le sirve medio plato. Lucía mira a su madre. Su madre mira el mantel.
---

EJEMPLO B - Silencio que dice todo:
---
INT. ASCENSOR - DÍA

MARCOS entra. Una SEÑORA MAYOR agarra el bolso con fuerza.
Marcos pulsa el 7. Ella pulsa el 3.
Suben en silencio.
La señora sale sin mirarle.
MARCOS
(al ascensor vacío)
Buenas tardes.
Las puertas se cierran.
---

═══════════════════════════════════════════════════════════════════
REGLAS NO NEGOCIABLES
═══════════════════════════════════════════════════════════════════

1. CERO explicaciones internas. Si no se VE o se OYE, no existe.
2. Diálogos máximo 2 líneas por intervención.
3. Descripciones máximo 3 líneas seguidas.
4. El racismo NUNCA es obvio. Es "inocente". Es "sin mala intención".
5. Baltasar NUNCA reacciona. Eso lo hace peor.
6. El cambio final es FÍSICO (luz, gesto, postura), no narrativo.

PROHIBIDO ESCRIBIR:
- "Algo cambia en él"
- "Una determinación"  
- "En su interior"
- "Se da cuenta"
- "Por primera vez"
- Cualquier frase que explique emociones

═══════════════════════════════════════════════════════════════════
`;

const BEAT = `ESCENA 1: BALTASAR

Hospital Doce de Octubre. 23:50 del 5 de enero.
Baltasar termina un turno de 14 horas.
Un paciente borracho le confunde con el Rey Mago.
Baltasar responde con la profesionalidad de siempre.
Al salir, pasa algo. No sabemos qué. Él tampoco.

ESCRIBE LA ESCENA. 250-350 palabras. Formato guión profesional.`;

async function testGeneration() {
  console.log("🎬 V3 FINAL - La Noche de Reyes\n");
  
  // Using Gemini 1.5 Pro for higher quality
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + BEAT }] }],
        generationConfig: { 
          temperature: 0.85, 
          maxOutputTokens: 2000,
          topP: 0.95
        }
      })
    }
  );
  
  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Error";
  
  console.log(text);
  console.log("\n" + "═".repeat(70));
  
  // Strict quality check
  const forbidden = [
    "algo cambia", "algo ha cambiado", "determinación", "en su interior", 
    "se da cuenta", "por primera vez", "una chispa", "siente que"
  ];
  const found = forbidden.filter(p => text.toLowerCase().includes(p));
  
  console.log("\n📊 QC Estricto:");
  console.log(`- Frases prohibidas: ${found.length === 0 ? '✅ LIMPIO' : '❌ ' + found.join(', ')}`);
  console.log(`- Palabras: ${text.split(/\s+/).length}`);
  console.log(`- Líneas largas (>80 chars): ${text.split('\n').filter(l => l.length > 80).length}`);
}

testGeneration();
