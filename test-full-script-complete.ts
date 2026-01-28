/**
 * FULL SCRIPT GENERATION - La Noche de Reyes
 * 90 min = ~50 scenes (14 + 25 + 11)
 */

const GOOGLE_API_KEY = "AIzaSyCbuoizWsO3Yje7N8UPwxbYhmGSOyiCqjA";
import { writeFileSync } from 'fs';

const SYSTEM_PROMPT = `Eres el guionista de "Parásitos" escribiendo comedia negra española.

PROYECTO: "La Noche de Reyes"
LOGLINE: Tres hombres hartos de ser invisibles descubren que en Noche de Reyes 
tienen autoridad absoluta. Sin magia. Solo poder.

PERSONAJES:
- BALTASAR (45): Médico urgencias. Negro. De Vallecas. Profesional impecable.
- GASPAR (38): Informático. Pelirrojo. El "raro". Guarda rencores.
- MELCHOR (52): Funcionario Hacienda. Gay en el armario. Casado con LOURDES.
- RICARDO: Jefe de Gaspar. Roba ideas.
- CARMEN: Camarera Bar El Tropezón.
- FÉLIX: Cuñado homófobo de Melchor.
- ELENA: Esposa de Baltasar.

═══════════════════════════════════════════════════════════════════
⚠️ REGLAS ABSOLUTAS
═══════════════════════════════════════════════════════════════════
- Cada escena: 100-180 palabras MÁXIMO
- Diálogos: 1-2 líneas por intervención
- Acción: Máximo 3 líneas seguidas
- CERO pensamientos internos
- CERO: "algo cambia", "siente que", "se da cuenta"
- Formato: INT./EXT. LUGAR - MOMENTO
═══════════════════════════════════════════════════════════════════

Genera EXACTAMENTE las escenas indicadas en formato guión profesional.
`;

const ACT1_BEATS = `
ACTO 1 - PRESENTACIÓN (14 escenas, ~25 min)
Los tres viven sus humillaciones cotidianas. Descubren el poder.

1. INT. URGENCIAS HOSPITAL - NOCHE: Baltasar fin turno. Borracho: "¿Eres el Rey Mago?"
2. INT. OFICINA CONSULTORA - NOCHE: Gaspar solo. Ricardo copia su código en USB.
3. INT. BAÑO HACIENDA - NOCHE: Melchor con Grindr. Lourdes llama.
4. EXT. HOSPITAL PARKING - NOCHE: Baltasar sale. Cigarro. Luna llena.
5. EXT. CALLE OFICINAS - NOCHE: Gaspar sale. Ignora a limpiadora.
6. EXT. HACIENDA - NOCHE: Melchor ve pareja gay. Aparta mirada.
7. INT. BAR EL TROPEZÓN - NOCHE: Baltasar entra. Pide caña.
8. INT. BAR - CONTINUO: Gaspar entra. Mesa apartada. Portátil.
9. INT. BAR - CONTINUO: Melchor entra. Otra mesa. Café solo.
10. INT. BAR - MÁS TARDE: Borracho acosa a Carmen.
11. INT. BAR - CONTINUO: Baltasar: "Déjala." El borracho OBEDECE.
12. INT. BAR - CONTINUO: Los tres se miran. ¿Qué ha pasado?
13. EXT. CALLE - NOCHE: Salen juntos. Gaspar: "¿Y si lo probamos?"
14. EXT. PASO CEBRA - NOCHE: Melchor ordena al coche parar. PARA.
`;

const ACT2_BEATS = `
ACTO 2 - EXPERIMENTACIÓN Y COMPLICACIONES (25 escenas, ~45 min)
Prueban el poder. Las consecuencias aparecen.

15. INT. COCHE GASPAR - NOCHE: Los tres en shock. ¿Qué somos?
16. INT. CASA GASPAR - NOCHE: Piso pequeño. Gato Binario. Planean.
17. EXT. CALLE CENTRO - NOCHE: Caminan entre gente de cabalgata.
18. INT. OFICINA CONSULTORA - NOCHE: Gaspar lleva a los otros. Ricardo trabaja.
19. INT. OFICINA - CONTINUO: Gaspar a Ricardo: "Confiesa." Ricardo llama a RRHH.
20. INT. OFICINA - CONTINUO: Ricardo confiesa TODO. Llora. Los otros miran.
21. EXT. OFICINA - NOCHE: Salen. Gaspar eufórico. Baltasar callado.
22. INT. COCHE - NOCHE: Van a Cuenca. Casa de Melchor. 
23. EXT. PUEBLO CUENCA - NOCHE: Llegan. Pueblo dormido. Luces navideñas.
24. INT. CASA MELCHOR - NOCHE: Cena familiar. FÉLIX hace chistes homófobos.
25. INT. CASA MELCHOR - CONTINUO: Melchor a Félix: "Besa a Antonio." Lo hace.
26. INT. CASA MELCHOR - CONTINUO: Silencio mortal. Lourdes mira a Melchor.
27. EXT. CASA MELCHOR - NOCHE: Melchor sale. Los otros le esperan.
28. INT. COCHE - NOCHE: Vuelven a Madrid. Melchor tiembla.
29. EXT. CALLE VALLECAS - MADRUGADA: Baltasar ve policías parando chaval negro.
30. EXT. CALLE - CONTINUO: Baltasar observa. No interviene. Sigue andando.
31. INT. HOSPITAL - MADRUGADA: Traen a Ricardo. Intento suicidio.
32. INT. HOSPITAL - CONTINUO: Baltasar lo reconoce. Gaspar se entera.
33. INT. CASA MELCHOR CUENCA - MADRUGADA: Félix despierta. Crisis identidad.
34. INT. BAR EL TROPEZÓN - MADRUGADA: Los tres se reúnen. Gaspar culpable.
35. INT. BAR - CONTINUO: Baltasar: "El poder sin consecuencias no existe."
36. EXT. CALLE - MADRUGADA (4AM): Baltasar se separa. Tiene algo que hacer.
37. INT. COCHE GASPAR - MADRUGADA: Gaspar y Melchor ven alejarse a Baltasar.
38. EXT. BARRIO RICO - MADRUGADA: Baltasar camina por zona residencial.
39. EXT. CASA GRANDE - MADRUGADA: Baltasar frente a una mansión. Respira.
`;

const ACT3_BEATS = `
ACTO 3 - RESOLUCIÓN (11 escenas, ~20 min)
Baltasar ajusta su cuenta. El amanecer lo borra todo.

40. INT. CASA GRANDE - MADRUGADA: Baltasar entra. Un ANCIANO (70) despierta.
41. INT. CASA - CONTINUO: El anciano es padre de compañero instituto que le humilló.
42. INT. CASA - CONTINUO: Baltasar no grita. Le obliga a ESCUCHAR. A entender.
43. INT. CASA - CONTINUO: El anciano llora. Pide perdón por su hijo.
44. INT. CASA - CONTINUO: Baltasar: "Ahora duerme. Y olvida." El anciano duerme.
45. EXT. AZOTEA EDIFICIO - AMANECER: Los tres juntos. Ven salir el sol.
46. EXT. AZOTEA - CONTINUO: Gaspar: "¿Ha merecido la pena?" Silencio.
47. EXT. AZOTEA - CONTINUO: El sol sale. Las 8:00. Sus ojos cambian.
48. INT. CASA BALTASAR - MAÑANA (6 ENERO): Baltasar despierta. Elena prepara chocolate.
49. INT. OFICINA - MAÑANA: Gaspar llega. Ricardo no está. Baja indefinida.
50. INT. CASA MELCHOR - MAÑANA: Desayuno familiar. Félix evita su mirada.
`;

async function generateAct(actName: string, beats: string): Promise<string> {
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Error generating";
}

async function main() {
  console.log("═".repeat(70));
  console.log("     LA NOCHE DE REYES - GUIÓN COMPLETO (90 min, ~50 escenas)");
  console.log("═".repeat(70));
  
  const startTotal = Date.now();
  
  // Generate all acts
  const act1 = await generateAct("ACTO 1 (escenas 1-14)", ACT1_BEATS);
  const act2 = await generateAct("ACTO 2 (escenas 15-39)", ACT2_BEATS);
  const act3 = await generateAct("ACTO 3 (escenas 40-50)", ACT3_BEATS);
  
  const totalTime = ((Date.now() - startTotal) / 1000).toFixed(1);
  
  // Combine
  const fullScript = `
${"═".repeat(70)}
LA NOCHE DE REYES
Guión Cinematográfico
${"═".repeat(70)}

FADE IN:

${act1}

${act2}

${act3}

FADE OUT.

FIN.
`;
  
  // Save
  const filename = `GUION_LA_NOCHE_DE_REYES_${new Date().toISOString().split('T')[0]}.txt`;
  writeFileSync(filename, fullScript);
  
  // Stats
  const wordCount = fullScript.split(/\s+/).length;
  const sceneCount = (fullScript.match(/^\d+\.\s+(?:INT\.|EXT\.)/gm) || []).length;
  
  console.log("\n" + "═".repeat(70));
  console.log("📊 ESTADÍSTICAS FINALES:");
  console.log(`   Tiempo total: ${totalTime}s`);
  console.log(`   Escenas totales: ${sceneCount}`);
  console.log(`   Palabras totales: ${wordCount}`);
  console.log(`   Páginas estimadas: ${Math.round(wordCount / 180)}`);
  console.log(`   Minutos estimados: ${Math.round(sceneCount * 1.8)}`);
  console.log("═".repeat(70));
  
  // Quality check
  const forbidden = ["algo cambia", "siente que", "se da cuenta", "suspira internamente", "piensa que"];
  const found = forbidden.filter(p => fullScript.toLowerCase().includes(p));
  console.log(`\n⚠️ Control calidad: ${found.length === 0 ? '✅ PERFECTO' : '❌ ' + found.join(', ')}`);
  
  console.log(`\n💾 Guardado: ${filename}`);
  
  // Also show preview
  console.log("\n" + "═".repeat(70));
  console.log("PREVIEW (primeras 2000 chars):");
  console.log("═".repeat(70));
  console.log(fullScript.slice(0, 2000) + "...");
}

main();
