/**
 * Test FULL SCRIPT with V15 density standards
 * La Noche de Reyes - 90 min = ~50 scenes
 */

const GOOGLE_API_KEY = "AIzaSyCbuoizWsO3Yje7N8UPwxbYhmGSOyiCqjA";
import { writeFileSync } from 'fs';

// V15 Density Standards (from screenplay-standards.ts)
const DENSITY_RULES = `
═══════════════════════════════════════════════════════════════════
⚠️ DENSIDAD OBLIGATORIA (ESTÁNDAR INDUSTRIA)
═══════════════════════════════════════════════════════════════════

DURACIÓN: 90 minutos
ESCENAS REQUERIDAS: 50-55 (comedia negra)

DISTRIBUCIÓN POR ACTOS:
- Acto 1: ~14 escenas (setup, presentación) - 25 min
- Acto 2: ~25 escenas (confrontación, desarrollo) - 45 min  
- Acto 3: ~11 escenas (resolución) - 20 min

LONGITUD POR ESCENA:
- Máximo: 300 palabras
- Objetivo: 150-200 palabras
- Mínimo: 80 palabras

RITMO:
- 1 escena cada ~1.7 minutos
- Escenas cortas y punzantes
- Si una escena supera 250 palabras, DIVIDIR

═══════════════════════════════════════════════════════════════════
`;

const QUALITY_RULES = `
═══════════════════════════════════════════════════════════════════
⚠️ REGLAS DE CALIDAD (RECHAZO AUTOMÁTICO)
═══════════════════════════════════════════════════════════════════

FORMATO:
- Slugline: INT./EXT. LUGAR - MOMENTO
- Acción: Máximo 3 líneas seguidas
- Diálogo: Máximo 2 líneas por intervención
- Parentéticas: Máximo 4 palabras

PROHIBIDO:
- "algo cambia", "siente que", "se da cuenta"
- "suspira internamente", "piensa que"
- Pensamientos internos de cualquier tipo
- Explicaciones al lector

OBLIGATORIO:
- Cada escena tiene conflicto visible
- Show don't tell SIEMPRE
- El humor en la incomodidad, no en chistes

═══════════════════════════════════════════════════════════════════
`;

const SYSTEM_PROMPT = `Eres el guionista de "Parásitos" escribiendo comedia negra española.

PROYECTO: "La Noche de Reyes"
LOGLINE: Tres hombres hartos de ser invisibles descubren que en Noche de Reyes 
tienen autoridad absoluta. Sin magia. Solo poder.

PERSONAJES:
- BALTASAR (45): Médico urgencias. Negro. De Vallecas.
- GASPAR (38): Informático. Pelirrojo. El "raro".
- MELCHOR (52): Funcionario. Gay en el armario.

${DENSITY_RULES}

${QUALITY_RULES}

Genera EXACTAMENTE las escenas indicadas, numeradas, en formato guión profesional.
Cada escena: 150-200 palabras máximo.
`;

const ACT1_BEATS = `
GENERA ACTO 1 COMPLETO (14 escenas):

1. INT. URGENCIAS HOSPITAL - NOCHE
   Baltasar, fin turno. Paciente borracho: "¿Eres el Rey Mago negro?"

2. INT. OFICINA CONSULTORA - NOCHE
   Gaspar trabaja solo. Ricardo (jefe) copia su código en USB.

3. INT. BAÑO HACIENDA - NOCHE
   Melchor en cubículo, Grindr abierto. Lourdes (mujer) llama.

4. EXT. HOSPITAL PARKING - NOCHE
   Baltasar sale. Frío. Enciende cigarro. Mira la luna.

5. EXT. CALLE OFICINAS - NOCHE
   Gaspar sale. Cruza miradas con LIMPIADORA. No le saluda.

6. EXT. HACIENDA - NOCHE
   Melchor sale. Ve pareja gay. Aparta la mirada. Camina rápido.

7. INT. BAR EL TROPEZÓN - NOCHE
   Baltasar entra. Pide caña. Bar casi vacío.

8. INT. BAR - CONTINUO
   Gaspar entra. Se sienta lejos. Abre portátil.

9. INT. BAR - CONTINUO
   Melchor entra. Mira móvil. Se sienta en otra mesa.

10. INT. BAR - MÁS TARDE
    BORRACHO acosa a CARMEN (camarera). Manoseo.

11. INT. BAR - CONTINUO
    Baltasar interviene. "Déjala." El borracho OBEDECE instantáneo.

12. INT. BAR - CONTINUO
    Los tres se miran. ¿Qué ha pasado? Silencio incómodo.

13. EXT. CALLE - NOCHE
    Los tres salen juntos. Gaspar: "¿Y si lo probamos?"

14. EXT. PASO CEBRA - NOCHE
    Coche viene rápido. Melchor ordena: "Para." El coche PARA en seco.
`;

async function generateAct1() {
  console.log("🎬 Generando ACTO 1 con estándares V15...\n");
  console.log("Objetivo: 14 escenas, 150-200 palabras cada una\n");
  
  const start = Date.now();
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          role: "user", 
          parts: [{ text: SYSTEM_PROMPT + "\n\n" + ACT1_BEATS }] 
        }],
        generationConfig: { 
          temperature: 0.85, 
          maxOutputTokens: 12000 
        }
      })
    }
  );
  
  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Error";
  
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  
  console.log(text);
  
  // Stats
  const sceneMatches = text.match(/(?:ESCENA \d+|^\d+\.|INT\.|EXT\.)/gm) || [];
  const wordCount = text.split(/\s+/).length;
  const avgWordsPerScene = Math.round(wordCount / Math.max(sceneMatches.length, 1));
  
  console.log("\n" + "═".repeat(70));
  console.log("📊 ESTADÍSTICAS ACTO 1:");
  console.log(`   Tiempo generación: ${elapsed}s`);
  console.log(`   Escenas detectadas: ${sceneMatches.length} (objetivo: 14)`);
  console.log(`   Palabras totales: ${wordCount}`);
  console.log(`   Promedio por escena: ${avgWordsPerScene} palabras`);
  console.log(`   Páginas estimadas: ${(wordCount / 180).toFixed(1)}`);
  console.log(`   Minutos estimados: ${Math.round(sceneMatches.length * 1.7)}`);
  console.log("═".repeat(70));
  
  // Quality check
  const forbidden = ["algo cambia", "siente que", "se da cuenta", "suspira internamente"];
  const found = forbidden.filter(p => text.toLowerCase().includes(p));
  console.log(`\n⚠️ Frases prohibidas: ${found.length === 0 ? '✅ NINGUNA' : '❌ ' + found.join(', ')}`);
  
  // Save
  const filename = `guion-reyes-v15-act1-${Date.now()}.txt`;
  writeFileSync(filename, text);
  console.log(`💾 Guardado: ${filename}`);
}

generateAct1();
