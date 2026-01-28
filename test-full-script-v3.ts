/**
 * FULL SCRIPT V3 - With enforced minimum scene length
 */

const GOOGLE_API_KEY = "AIzaSyCbuoizWsO3Yje7N8UPwxbYhmGSOyiCqjA";
import { writeFileSync } from 'fs';

const SYSTEM_PROMPT = `Eres el guionista de "Parásitos" escribiendo comedia negra española.

PROYECTO: "La Noche de Reyes"

PERSONAJES:
- BALTASAR (45): Médico urgencias. Negro. De Vallecas.
- GASPAR (38): Informático. Pelirrojo. El "raro".
- MELCHOR (52): Funcionario Hacienda. Gay en el armario.
- RICARDO: Jefe de Gaspar. Roba ideas.
- CARMEN: Camarera Bar El Tropezón.
- FÉLIX: Cuñado homófobo de Melchor.
- ELENA: Esposa de Baltasar.
- LOURDES: Esposa de Melchor.

═══════════════════════════════════════════════════════════════════
⚠️ FORMATO OBLIGATORIO (NO NEGOCIABLE)
═══════════════════════════════════════════════════════════════════

CADA ESCENA DEBE TENER:
1. SLUGLINE: INT./EXT. LUGAR - MOMENTO (primera línea, siempre)
2. DESCRIPCIÓN: 4-8 líneas de acción/ambiente (NO opcional)
3. DIÁLOGO: 3-6 intercambios mínimo por escena
4. LONGITUD: 150-250 palabras POR ESCENA (OBLIGATORIO)

EJEMPLO DE ESCENA CORRECTA (copia este formato):
---
INT. URGENCIAS HOSPITAL - NOCHE

Luz de fluorescentes. BALTASAR (45, negro, bata blanca) firma papeles en el mostrador de admisiones. Las ojeras delatan un turno de catorce horas. Un BORRACHO (60s, barba descuidada) se acerca tambaleándose, apestando a vino barato.

BORRACHO
¿Tú eres el Rey Mago? ¿El Baltasar?

Baltasar no levanta la vista. Sigue escribiendo.

BALTASAR
Soy el doctor Nkosi. ¿En qué puedo ayudarle?

BORRACHO
(acercándose demasiado)
Mi nieto quiere una bici. ¿Se la vas a traer o qué?

Baltasar cierra el expediente. Lo mira directamente.

BALTASAR
Vuelva a su cama, señor.

El borracho parpadea. Como hipnotizado, se da la vuelta y camina hacia su habitación sin decir nada más. Baltasar lo observa alejarse, extrañado.
---
(Esta escena tiene ~140 palabras - MÍNIMO aceptable)

═══════════════════════════════════════════════════════════════════
⚠️ PROHIBICIONES ABSOLUTAS
═══════════════════════════════════════════════════════════════════
- NO escribas "(para sí mismo)" ni "(pensando)"
- NO uses "algo cambia", "siente que", "se da cuenta"
- NO escenas de menos de 120 palabras
- NO markdown, NO asteriscos, NO formateo especial
- SOLO texto plano con formato de guión

═══════════════════════════════════════════════════════════════════

Genera el acto indicado con EXACTAMENTE el número de escenas pedido.
Cada escena: 150-250 palabras. Si una escena tiene menos de 120, EXPANDIR.
`;

const ACT1_BEATS = `
GENERA ACTO 1 (14 escenas, 150-250 palabras CADA UNA):

1. INT. URGENCIAS HOSPITAL - NOCHE
   Baltasar termina turno. Borracho le confunde con Rey Mago. Le insulta.

2. INT. OFICINA CONSULTORA - NOCHE
   Gaspar trabaja solo. Ricardo copia su código. Gaspar aprieta puños.

3. INT. BAÑO HACIENDA - NOCHE
   Melchor con Grindr. Lourdes llama. Cierra app culpable.

4. EXT. HOSPITAL PARKING - NOCHE
   Baltasar sale. Enciende cigarro. Frío. Luna llena.

5. EXT. CALLE OFICINAS - NOCHE
   Gaspar sale. Ignora limpiadora que le saluda. Camina solo.

6. EXT. HACIENDA - NOCHE
   Melchor ve pareja gay besándose. Aparta mirada incómodo.

7. INT. BAR EL TROPEZÓN - NOCHE
   Baltasar entra. Bar cutre. Pide caña a Carmen.

8. INT. BAR - CONTINUO
   Gaspar entra. Mesa apartada. Portátil. Ignora al mundo.

9. INT. BAR - CONTINUO
   Melchor entra. Otra mesa. Café solo. Nervioso.

10. INT. BAR - MÁS TARDE
    Borracho acosa a Carmen. La agarra. Ella forcejea.

11. INT. BAR - CONTINUO
    Baltasar: "Déjala." El borracho OBEDECE instantáneamente.

12. INT. BAR - CONTINUO
    Los tres se miran. Confusión. ¿Qué ha pasado?

13. EXT. CALLE - NOCHE
    Salen juntos. Gaspar propone experimento. Los otros dudan.

14. EXT. PASO CEBRA - NOCHE
    Coche viene rápido. Melchor ordena parar. El coche PARA.

RECUERDA: 150-250 palabras POR ESCENA. Total Acto 1: ~2500-3500 palabras.
`;

async function generateAct(beats: string, actName: string): Promise<string> {
  console.log(`\n🎬 Generando ${actName}...`);
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          role: "user", 
          parts: [{ text: SYSTEM_PROMPT + "\n\n" + beats }] 
        }],
        generationConfig: { 
          temperature: 0.85, 
          maxOutputTokens: 16000 
        }
      })
    }
  );
  
  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Error";
}

async function main() {
  console.log("═".repeat(70));
  console.log("   LA NOCHE DE REYES - GUIÓN V3 (escenas densas)");
  console.log("═".repeat(70));
  
  const act1 = await generateAct(ACT1_BEATS, "ACTO 1");
  
  // Analyze
  const wordCount = act1.split(/\s+/).length;
  const sceneMatches = act1.match(/^\d+\.\s*INT\.|^\d+\.\s*EXT\./gm) || [];
  
  console.log("\n" + "═".repeat(70));
  console.log("📊 ESTADÍSTICAS ACTO 1:");
  console.log(`   Escenas: ${sceneMatches.length} (objetivo: 14)`);
  console.log(`   Palabras totales: ${wordCount} (objetivo: 2500-3500)`);
  console.log(`   Promedio/escena: ${Math.round(wordCount / Math.max(sceneMatches.length, 14))} palabras`);
  console.log("═".repeat(70));
  
  // Save
  const filename = `GUION_REYES_V3_${Date.now()}.txt`;
  writeFileSync(filename, act1);
  console.log(`\n💾 Guardado: ${filename}`);
  
  // Show preview
  console.log("\n--- PREVIEW (primeras 3 escenas) ---\n");
  const preview = act1.split(/(?=\d+\.\s*(?:INT\.|EXT\.))/g).slice(0, 4).join('\n');
  console.log(preview);
}

main();
