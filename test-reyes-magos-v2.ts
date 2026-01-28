/**
 * Test script generation for Los Reyes Magos - V2 REFINED
 * Enhanced prompts for higher quality output
 */

const GOOGLE_API_KEY = "AIzaSyCbuoizWsO3Yje7N8UPwxbYhmGSOyiCqjA";

const FEW_SHOT_REFINED = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 REFERENTES DE TONO (estudia el ritmo y subtexto)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EJEMPLO 1 - Incomodidad social con elegancia (In Bruges)
INT. PUB IRLANDÉS - NOCHE

Ken y Ray sentados. Dos pintas. Silencio largo.
KEN
¿Te gusta Brujas?
RAY
(sin mirarle)
Es un puto agujero.
Ken asiente lentamente. Bebe. No discute.
KEN
Los canales son bonitos.
RAY
Si te gustan los putos canales.

---

EJEMPLO 2 - Tensión racial con subtexto (Get Out)
INT. SALÓN CASA ARMITAGE - DÍA

Chris, solo, examina las fotos familiares. Todas de blancos 
sonrientes en safaris, con "ayudantes" negros al fondo.

GEORGINA (criada negra, sonrisa fija) aparece detrás.
GEORGINA
¿Puedo traerle algo, señor?
CHRIS
No, gracias. Estoy bien.
GEORGINA
(la sonrisa no llega a los ojos)
¿Seguro? La señora dice que debo atenderle.
El "atenderle" suena a advertencia.

---

EJEMPLO 3 - Comedia española incómoda (El Milagro de P. Tinto)
INT. COMEDOR FAMILIA - DÍA

La MADRE sirve lentejas. El PADRE lee el periódico. 
Silencio absoluto. Un reloj de pared marca cada segundo.
MADRE
Tu tío Paco ha muerto.
Pausa. El padre pasa página.
PADRE
¿El del ojo?
MADRE
El del ojo era Fermín.
PADRE
Ah.
Sigue leyendo. La madre sirve más lentejas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

const RULES = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ REGLAS INQUEBRANTABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORMATO:
- Slugline: INT./EXT. LUGAR - MOMENTO (nunca en español "Interior")
- Acción: Presente, concreto, NUNCA más de 3 líneas seguidas
- Personajes: MAYÚSCULAS la primera vez, luego normal
- Paréntesis: Solo para acotaciones BREVES (máx 4 palabras)

DIÁLOGO:
- Nadie dice lo que piensa. NUNCA.
- El conflicto está en lo NO dicho.
- Cada línea tiene una INTENCIÓN oculta (atacar, defenderse, huir, seducir)
- Los españoles hablan con frases cortas. Nada de monólogos.

VISUAL:
- Si no se puede FILMAR, no lo escribas.
- Cero pensamientos internos.
- Gestos > palabras. Silencios > explicaciones.
- Detalles específicos: "un reloj Casio de los 80" no "un reloj"

HUMOR:
- El humor viene de la INCOMODIDAD, no del chiste.
- Ironía dramática: el público sabe más que el personaje.
- Lo absurdo tratado con absoluta seriedad.
- NUNCA remates cómicos obvios.

PROHIBIDO (rechazo automático):
- "Se da cuenta de que..."
- "Todo cambia cuando..."
- "La tensión se palpa en el aire"
- "Algo en su interior..."
- Cualquier explicación de emociones
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

const SYSTEM_PROMPT = `Eres guionista de cine español con el nivel de Álex de la Iglesia 
y el ojo social de Ken Loach.

PROYECTO: "La Noche de Reyes"
LOGLINE: Tres hombres hartos de ser invisibles se convierten, solo en Noche de Reyes, 
en los auténticos Reyes Magos. Sin magia: solo autoridad absoluta y ganas de ajustar cuentas.

PERSONAJES:
- BALTASAR (45): Médico de urgencias, negro, español de tercera generación. 
  Educado, contenido, harto de explicar que nació en Vallecas.
- GASPAR (38): Pelirrojo, informático, el "raro" de todas las oficinas. 
  Observador, silencioso, guarda rencores como quien guarda sellos.
- MELCHOR (52): Funcionario, gay en el armario ante su familia del pueblo. 
  Casado, dos hijos, una úlcera, y una cuenta de Grindr que revisa en el baño.

TONO: Comedia negra española. Incómoda. El humor duele un poco.

${FEW_SHOT_REFINED}

${RULES}

Escribe la escena como si fuera a rodarse mañana. Cada línea tiene un coste.
`;

const BEAT = `ESCENA 1: Presentación de Baltasar

23:45 del 5 de enero. Hospital Doce de Octubre, Madrid.

Baltasar termina un turno de 14 horas. Un PACIENTE borracho (el típico señor 
español que "no es racista, tiene un amigo negro") le confunde con un Rey Mago 
y le pide un regalo para su nieto. El comentario es tan inocente como hiriente.

Baltasar responde con profesionalidad perfecta - esa que ha pulido durante 
20 años para que nadie pueda acusarle de nada. Pero hay algo en sus ojos.

Al salir al parking, algo cambia. No sabemos qué. Él tampoco.`;

async function testGeneration() {
  console.log("🎬 Generando escena REFINADA de 'La Noche de Reyes'...\n");
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + BEAT }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 4000 }
      })
    }
  );
  
  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
  
  console.log("✅ ESCENA GENERADA (V2):\n");
  console.log(text);
  console.log("\n" + "=".repeat(70));
  
  // Quality checks
  const forbidden = ["se da cuenta", "todo cambia", "la tensión", "algo en su interior"];
  const found = forbidden.filter(p => text.toLowerCase().includes(p));
  
  console.log("\n📊 Control de Calidad:");
  console.log(`- Formato correcto: ${/^INT\.|^EXT\./.test(text.trim()) ? '✅' : '⚠️'}`);
  console.log(`- BALTASAR presente: ${text.includes('BALTASAR') ? '✅' : '❌'}`);
  console.log(`- Longitud: ${text.split(/\s+/).length} palabras`);
  console.log(`- Frases prohibidas: ${found.length === 0 ? '✅ CERO' : '❌ ' + found.join(', ')}`);
  console.log(`- Diálogos cortos: ${text.split('\n').filter(l => l.length > 100).length < 5 ? '✅' : '⚠️ revisar'}`);
}

testGeneration();
