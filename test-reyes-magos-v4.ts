/**
 * V4 - BRUTAL QUALITY
 */

const GOOGLE_API_KEY = "AIzaSyCbuoizWsO3Yje7N8UPwxbYhmGSOyiCqjA";

const SYSTEM_PROMPT = `Eres Bong Joon-ho escribiendo una comedia negra española para Noche de Reyes.

PROYECTO: "La Noche de Reyes"
BALTASAR (45): Médico urgencias. Negro. De Vallecas. 20 años siendo profesional 
impecable mientras le preguntan "¿pero de dónde eres DE VERDAD?"

═══════════════════════════════════════════════════════════════════
MAESTRÍA ABSOLUTA
═══════════════════════════════════════════════════════════════════

REFERENCIA - Microagresión perfecta:
---
INT. BOX URGENCIAS - NOCHE
Un BORRACHO mira a Baltasar con los ojos entrecerrados.
BORRACHO
Oye... tú... ¿tú no serás de los Reyes?
BALTASAR
Soy el médico de guardia.
BORRACHO
Ya, ya. Pero el Baltasar ese... ¿no es tu primo o algo?
Baltasar le toma el pulso.
BALTASAR
Necesita hidratación. Enfermera.
El borracho agarra su muñeca con fuerza inesperada.
BORRACHO
Pídele que traiga algo bueno pa' mi nieta. Algo bueno.
Sus ojos están húmedos. La nieta debe ser real.
---

═══════════════════════════════════════════════════════════════════
PROHIBIDO (automático rechazo):
═══════════════════════════════════════════════════════════════════
- "algo cambia/parece diferente"
- "suspira/suspira internamente"  
- "siente/nota/percibe"
- "determinación/resolución"
- cualquier verbo interno
- descripción de emociones
- explicaciones al lector

EL CAMBIO FINAL: Solo IMAGEN. 
Un gesto. Una luz. Un reflejo. Cero narración.
═══════════════════════════════════════════════════════════════════
`;

const BEAT = `ESCENA: Baltasar termina turno. Paciente borracho le confunde con Rey Mago.
Al salir del hospital, pasa ALGO. No palabras. IMAGEN.
300 palabras máximo. Guión profesional.`;

async function test() {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + BEAT }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1500 }
      })
    }
  );
  
  const d = await r.json() as any;
  const t = d.candidates?.[0]?.content?.parts?.[0]?.text || "Error";
  
  console.log("🎬 V4 BRUTAL:\n");
  console.log(t);
  
  const bad = ["algo cambia", "algo parece", "suspira", "siente", "nota", "percibe", "determinación"];
  const found = bad.filter(p => t.toLowerCase().includes(p));
  console.log("\n" + "═".repeat(60));
  console.log(`QC: ${found.length === 0 ? '✅ PERFECTO' : '❌ ' + found.join(', ')}`);
}

test();
