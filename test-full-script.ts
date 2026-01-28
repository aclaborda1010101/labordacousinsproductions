/**
 * Generate FULL SCRIPT - La Noche de Reyes (90 min)
 * Tests complete screenplay generation
 */

const GOOGLE_API_KEY = "AIzaSyCbuoizWsO3Yje7N8UPwxbYhmGSOyiCqjA";
import { writeFileSync } from 'fs';

const BIBLE = `
═══════════════════════════════════════════════════════════════════
BIBLE: LA NOCHE DE REYES
═══════════════════════════════════════════════════════════════════

LOGLINE:
Tres hombres hartos de ser invisibles descubren que cada Noche de Reyes 
tienen autoridad absoluta. Sin magia. Sin explicaciones. Solo poder.

GÉNERO: Comedia negra social
DURACIÓN: 90 minutos
TONO: Irónico, incómodo, navideño pero nada ñoño

PERSONAJES PRINCIPALES:

BALTASAR (45)
- Médico de urgencias, Hospital Doce de Octubre
- Negro, español de tercera generación (Vallecas)
- 20 años siendo profesional impecable mientras le preguntan "¿de dónde eres DE VERDAD?"
- Casado con ELENA (blanca), dos hijos adolescentes
- Cansado de ser el "negro bueno" que nunca se queja

GASPAR (38)
- Informático en una consultora gris
- Pelirrojo, el "raro" de todas las oficinas
- Observador silencioso, guarda rencores como quien guarda sellos
- Soltero, vive con un gato llamado Binario
- Su jefe le roba las ideas sistemáticamente

MELCHOR (52)
- Funcionario de Hacienda
- Gay en el armario ante su familia del pueblo (Cuenca)
- Casado con LOURDES, dos hijos (PABLO 18, LUCÍA 15)
- Cuenta de Grindr que revisa en el baño
- Úlcera de tanto guardar secretos

LOCALIZACIONES:
- Hospital Doce de Octubre (urgencias, parking)
- Oficina consultora IT (planta diáfana gris)
- Hacienda (despachos, archivo)
- Casa Baltasar (Vallecas, clase media)
- Casa Melchor (Pueblo Cuenca, tradicional)
- Bar de barrio (donde se encuentran los tres)
- Cabalgata de Reyes (Madrid centro)
- Casas de los "ajusticiados"

ESTRUCTURA (3 ACTOS):

ACTO 1 (pp. 1-25): PRESENTACIÓN
- Conocemos a los tres en sus vidas normales, aguantando humillaciones cotidianas
- Noche del 5 de enero: algo cambia en cada uno (no saben qué)
- Se encuentran por "casualidad" en un bar
- Descubren que la gente les obedece sin rechistar

ACTO 2A (pp. 26-55): EXPERIMENTACIÓN
- Prueban sus poderes con pequeñas "correcciones"
- Gaspar hace que su jefe confiese el robo de ideas en público
- Melchor obliga a su cuñado homófobo a besar a un hombre
- Baltasar... no usa el poder. Observa. Piensa.

ACTO 2B (pp. 56-75): COMPLICACIONES
- Los ajustes tienen consecuencias inesperadas
- El jefe de Gaspar intenta suicidarse
- El cuñado de Melchor sufre una crisis de identidad real
- Baltasar debe decidir: ¿usa el poder o sigue siendo "el bueno"?

ACTO 3 (pp. 76-90): RESOLUCIÓN
- Baltasar finalmente actúa: confronta a alguien de su pasado
- Los tres descubren el precio del poder: a las 8:00 olvidan todo
- Epílogo: 6 de enero por la mañana. Nada recuerdan. Pero el mundo ha cambiado.
`;

const OUTLINE = `
═══════════════════════════════════════════════════════════════════
OUTLINE DETALLADO (genera escenas de esto)
═══════════════════════════════════════════════════════════════════

ACTO 1:

1. INT. URGENCIAS HOSPITAL - NOCHE
   Baltasar, fin de turno. Paciente borracho le confunde con Rey Mago.

2. INT. OFICINA CONSULTORA - NOCHE  
   Gaspar trabaja hasta tarde. Su jefe (RICARDO) se lleva el mérito de su código.

3. INT. BAÑO HACIENDA - NOCHE
   Melchor, escondido, revisa Grindr. Su mujer le llama para cenar.

4. EXT. CALLES MADRID - NOCHE
   Montaje: los tres salen de sus trabajos. La ciudad se prepara para Reyes.

5. INT. BAR EL TROPEZÓN - NOCHE
   Por separado, los tres entran al mismo bar. No se conocen.

6. INT. BAR EL TROPEZÓN - CONTINUO
   Un BORRACHO molesta a una camarera. Baltasar interviene. El borracho OBEDECE 
   inmediatamente, como hipnotizado. Los tres se miran.

7. EXT. CALLE - NOCHE
   Los tres salen juntos, confusos. Gaspar propone un experimento.

8. EXT. PASO DE CEBRA - NOCHE
   Melchor ordena a un coche que pare. El coche para en seco, en mitad del asfalto.

ACTO 2A:

9. INT. CASA GASPAR - NOCHE
   Los tres, incrédulos, intentan entender qué les pasa.

10. EXT. CABALGATA REYES - NOCHE
    Ven la cabalgata. Los niños les señalan. "¡Son los Reyes de verdad!"

11. INT. OFICINA CONSULTORA - NOCHE
    Gaspar lleva a los otros a la oficina. Encuentra a Ricardo trabajando.
    Le ordena confesar. Ricardo llama a RRHH y confiesa TODO.

12. INT. CASA MELCHOR (CUENCA) - NOCHE
    Cena familiar. El CUÑADO FÉLIX hace comentarios homófobos sobre TV.
    Melchor, harto, le ordena besar al VECINO. Lo hace. Silencio mortal.

13. EXT. CALLE VALLECAS - NOCHE
    Baltasar camina solo. Se cruza con POLICÍAS que paran a un chaval negro.
    Podría intervenir. No lo hace. Sigue caminando.

ACTO 2B:

14. INT. HOSPITAL - MADRUGADA
    Baltasar de guardia. Traen a Ricardo: intento de suicidio tras la confesión.

15. INT. CASA MELCHOR - MADRUGADA  
    Félix, en shock, pregunta a Melchor qué le hizo. Melchor no puede explicarlo.

16. INT. BAR EL TROPEZÓN - MADRUGADA
    Los tres se reúnen. Gaspar y Melchor están asustados. Baltasar está pensativo.
    "El poder sin consecuencias no existe."

17. EXT. CALLE - MADRUGADA (4:00)
    Baltasar se separa del grupo. Tiene algo que hacer.

ACTO 3:

18. INT. CASA FAMILIA RICA - MADRUGADA
    Baltasar entra en una casa. Un HOMBRE MAYOR (70) despierta asustado.
    Es el padre de un compañero de instituto que le llamó "negro de mierda" 
    hace 30 años. Y que nunca se disculpó.

19. INT. CASA FAMILIA RICA - CONTINUO
    Baltasar no le grita. Le obliga a ESCUCHAR. A entender. A sentir.
    El hombre llora. Pide perdón. Baltasar le ordena: "Ahora duerme. Y olvida."

20. EXT. AZOTEA EDIFICIO - AMANECER
    Los tres juntos ven amanecer. Saben que a las 8:00 olvidarán todo.
    GASPAR: "¿Ha merecido la pena?"
    Silencio.
    El sol sale.

21. INT. CASA BALTASAR - MAÑANA (6 ENERO)
    Baltasar despierta. Elena prepara chocolate. Los niños abren regalos.
    Baltasar no recuerda nada. Pero sonríe diferente.

22. INT. OFICINA - MAÑANA
    Gaspar llega al trabajo. Ricardo no está. Se ha dado de baja indefinida.
    Nadie sabe por qué. Gaspar tampoco.

23. INT. CASA MELCHOR - MAÑANA
    Melchor desayuna con su familia. Félix le evita la mirada.
    Melchor no sabe por qué. Pero se siente... más ligero.

24. EXT. CALLE MADRID - DÍA
    Los tres se cruzan por la calle. No se reconocen.
    Pero los tres, sin saber por qué, sonríen.
    
FIN.
`;

const SYSTEM_PROMPT = `Eres Bong Joon-ho escribiendo una comedia negra española.

${BIBLE}

REGLAS ABSOLUTAS:
1. Formato guión profesional (INT./EXT., mayúsculas personajes, etc.)
2. Cada escena: 150-300 palabras
3. Diálogos cortos (máx 2 líneas)
4. CERO explicaciones internas
5. CERO frases prohibidas: "algo cambia", "siente que", "se da cuenta"
6. Show don't tell SIEMPRE
7. El humor viene de la incomodidad, no de chistes

Genera las escenas del ACTO 1 completo (escenas 1-8) en formato guión.
`;

async function generateAct(actNumber: number, scenes: string) {
  console.log(`\n🎬 Generando ACTO ${actNumber}...\n`);
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          role: "user", 
          parts: [{ text: SYSTEM_PROMPT + "\n\nGENERA ESTAS ESCENAS:\n" + scenes }] 
        }],
        generationConfig: { 
          temperature: 0.85, 
          maxOutputTokens: 8000 
        }
      })
    }
  );
  
  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Error generating";
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("     LA NOCHE DE REYES - GUIÓN COMPLETO (90 min)");
  console.log("═══════════════════════════════════════════════════════════════════\n");
  
  // Generate Act 1
  const act1Scenes = `
1. INT. URGENCIAS HOSPITAL - NOCHE: Baltasar, fin de turno. Paciente borracho confunde con Rey Mago.
2. INT. OFICINA CONSULTORA - NOCHE: Gaspar trabaja tarde. Su jefe Ricardo se lleva mérito de su código.
3. INT. BAÑO HACIENDA - NOCHE: Melchor revisa Grindr escondido. Su mujer le llama.
4. EXT. CALLES MADRID - NOCHE: Los tres salen de sus trabajos. Ciudad se prepara para Reyes.
5. INT. BAR EL TROPEZÓN - NOCHE: Por separado entran al mismo bar.
6. INT. BAR - CONTINUO: Borracho molesta camarera. Baltasar interviene. El borracho OBEDECE hipnotizado.
7. EXT. CALLE - NOCHE: Los tres salen confusos. Gaspar propone experimento.
8. EXT. PASO CEBRA - NOCHE: Melchor ordena a coche que pare. El coche para en seco.
`;

  const act1 = await generateAct(1, act1Scenes);
  console.log(act1);
  
  // Quick stats
  const sceneCount = (act1.match(/INT\.|EXT\./g) || []).length;
  const wordCount = act1.split(/\s+/).length;
  
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("📊 ESTADÍSTICAS ACTO 1:");
  console.log(`   Escenas generadas: ${sceneCount}`);
  console.log(`   Palabras totales: ${wordCount}`);
  console.log(`   Páginas estimadas: ${Math.round(wordCount / 250)} (1 pág ≈ 250 palabras)`);
  console.log(`   Minutos estimados: ${Math.round(sceneCount * 2)}-${Math.round(sceneCount * 3)} min`);
  console.log("═══════════════════════════════════════════════════════════════════");
  
  // Save to file
  const filename = `guion-reyes-magos-act1-${Date.now()}.txt`;
  writeFileSync(filename, act1);
  console.log(`\n💾 Guardado en: ${filename}`);
}

main();
