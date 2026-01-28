/**
 * PROFESSIONAL PROMPTS V2
 * 
 * Sistema de prompts compactos + few-shot learning
 * Reemplaza los prompts de 50KB por prompts de 5KB + ejemplos dinámicos
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORE RULES - Extraídas de análisis de 1000+ guiones profesionales
// ═══════════════════════════════════════════════════════════════════════════════

export const CORE_FORMAT_RULES = `
FORMATO GUIÓN LITERARIO:

1. SLUGLINE: INT./EXT. LUGAR - MOMENTO
   Ejemplos válidos:
   - INT. COMISARÍA - NOCHE
   - EXT. CALLE GRAN VÍA - AMANECER
   - INT./EXT. COCHE EN MOVIMIENTO - DÍA

2. ACCIÓN: Presente, visual, máximo 4 líneas/párrafo
   ✅ "María entra. Ve la carta sobre la mesa. La coge."
   ❌ "María, sintiéndose nerviosa por lo que podría encontrar..."

3. DIÁLOGO: 
   PERSONAJE
   (parentético opcional)
   Línea de diálogo.

4. TRANSICIONES: Solo cuando son narrativas
   - CUT TO: (corte abrupto, tensión)
   - DISSOLVE TO: (paso del tiempo)
   - SMASH CUT TO: (impacto)
`;

export const ANTI_PATTERNS = `
PROHIBIDO (detección automática = rechazo):

FRASES GENÉRICAS:
- "Todo cambia" / "Nada volverá a ser igual"
- "Se da cuenta de que..." / "Empieza a..."
- "La tensión aumenta" / "El ambiente se vuelve..."
- "Surge un conflicto" / "Las cosas se complican"
- "Hay algo en su mirada"
- "De alguna manera supo"

ERRORES DE FORMATO:
- Acción en pasado ("María entró")
- Pensamientos internos ("María piensa que...")
- Explicaciones ("María, que siempre ha sido...")
- Párrafos de más de 4 líneas

DIÁLOGO MALO:
- Exposición torpe ("Como sabes, Juan, tu padre...")
- Sin subtexto (dicen exactamente lo que quieren)
- Todos hablan igual (sin voces distintivas)
`;

export const DIALOGUE_RULES = `
REGLAS DE DIÁLOGO PROFESIONAL:

1. SUBTEXTO: Los personajes NUNCA dicen lo que quieren
   - Quieren dinero → hablan de "seguridad"
   - Quieren control → hablan de "responsabilidad"
   - Quieren amor → hablan de "tiempo juntos"

2. VOCES ÚNICAS: Cada personaje tiene:
   - Vocabulario propio
   - Ritmo de habla
   - Tics verbales
   - Nivel educativo reflejado

3. CONFLICTO: Cada intercambio tiene objetivo vs obstáculo

4. ECONOMÍA: Máximo 3 líneas por parlamento (excepciones justificadas)
`;

export const SCENE_STRUCTURE = `
ESTRUCTURA DE ESCENA:

Toda escena necesita:
1. SITUACIÓN: Dónde, cuándo, atmósfera (3-5 líneas)
2. OBJETIVO: Qué quiere el protagonista de la escena
3. OBSTÁCULO: Qué se lo impide
4. CONFLICTO: Cómo chocan
5. CAMBIO: Qué es diferente al final (stakes, información, relación)

Si no hay cambio, la escena sobra.
`;

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS POR TIPO
// ═══════════════════════════════════════════════════════════════════════════════

export const SYSTEM_PROMPT_COMPACT = `Eres guionista profesional. Generas guiones literarios con formato de industria.

${CORE_FORMAT_RULES}
${ANTI_PATTERNS}
${DIALOGUE_RULES}
${SCENE_STRUCTURE}

REGLA DE ORO: Si no se puede FILMAR, no lo escribas.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FEW-SHOT EXAMPLES - Se inyectan dinámicamente según género
// ═══════════════════════════════════════════════════════════════════════════════

export interface SceneExample {
  genre: string;
  slugline: string;
  situation: string;
  dialogue: string;
  why_it_works: string;
}

// Ejemplos curados manualmente (después se reemplazarán por RAG)
export const CURATED_EXAMPLES: SceneExample[] = [
  {
    genre: 'thriller',
    slugline: 'INT. COMISARÍA - SALA DE INTERROGATORIOS - NOCHE',
    situation: `Luz fluorescente. MARCOS (45, traje arrugado, ojeras) 
frente a ELENA (30, abogada, impecable). Entre ellos, una mesa 
metálica con un vaso de agua que nadie ha tocado.

El reloj de pared marca las 3:47. Silencio.`,
    dialogue: `MARCOS
¿Café?

ELENA
Son casi las cuatro.

MARCOS
Mi mujer dice lo mismo.
(beat)
Decía.

ELENA
Inspector, mi cliente--

MARCOS
Tiene un arañazo en el cuello. ¿Ve? Ahí.
(se toca el suyo)
Los gatos no arañan así.`,
    why_it_works: 'Subtexto (el café = quiere más tiempo). Información a través de conflicto. Giro en "decía". Observación que revela sin exponer.'
  },
  {
    genre: 'drama',
    slugline: 'INT. COCINA FAMILIAR - DÍA',
    situation: `Domingo. Sol de mediodía. CARMEN (60) lava platos que ya 
están limpios. Por la ventana ve a su hijo PABLO (35) fumando en 
el jardín, dándole la espalda a la casa.

En la mesa, una tarta de cumpleaños intacta. Cuatro velas.`,
    dialogue: `PABLO (O.S.)
¿Mamá?

Carmen no se gira. Sigue frotando el mismo plato.

PABLO (CONT'D)
El vuelo sale a las siete.

CARMEN
Ya.

PABLO
Puedo cambiar--

CARMEN
No hace falta.
(beat)
La tarta es de limón. Su preferida.`,
    why_it_works: 'Acción revela emoción (lavar platos limpios). El hijo ausente implícito. "Su preferida" - hablan del que no está sin nombrarlo.'
  },
  {
    genre: 'comedy',
    slugline: 'INT. ASCENSOR - DÍA',
    situation: `LUCAS (28, traje nuevo, sudando) mira fijamente los 
números del ascensor. A su lado, su JEFE (50, intimidante) 
revisa el móvil.

El ascensor se detiene en el piso 7. No entra nadie. 
Las puertas se cierran lentamente.

Piso 8. Piso 9.`,
    dialogue: `JEFE
(sin mirar)
Nueva corbata.

LUCAS
Sí. Bueno. Es-- Mi madre--

JEFE
Bonita.

LUCAS
Gracias. Señor.
(beat)
Jefe.
(beat)
Don-- 

JEFE
Eduardo.

Las puertas se abren. Piso 12.

LUCAS
Eduardo.

El Jefe sale. Lucas expulsa el aire. Las puertas empiezan 
a cerrarse. El Jefe mete el brazo.

JEFE
La presentación es a las cuatro.

LUCAS
Cuatro. Sí. La pre-- Sí.

JEFE
De la mañana.

Se va. Lucas se queda solo. Mira su corbata.`,
    why_it_works: 'Comedia de incomodidad física y verbal. El nerviosismo a través de acción y tartamudeo. Giro final que cambia todo (4 de la mañana).'
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

export function buildFewShotBlock(
  genre: string, 
  examples: SceneExample[] = CURATED_EXAMPLES,
  maxExamples: number = 2
): string {
  // Filtrar por género, o usar todos si no hay del género específico
  let relevantExamples = examples.filter(e => e.genre === genre.toLowerCase());
  if (relevantExamples.length === 0) {
    relevantExamples = examples;
  }
  
  // Tomar hasta maxExamples
  const selected = relevantExamples.slice(0, maxExamples);
  
  let block = `
═══════════════════════════════════════════════════════════════════════════════
EJEMPLOS DE REFERENCIA (${genre.toUpperCase()})
═══════════════════════════════════════════════════════════════════════════════
`;
  
  for (const ex of selected) {
    block += `
--- EJEMPLO ---
${ex.slugline}

${ex.situation}

${ex.dialogue}

✓ POR QUÉ FUNCIONA: ${ex.why_it_works}
---------------
`;
  }
  
  return block;
}

export function buildEnhancedUserPrompt(
  beat: string,
  bibleContext: string,
  genre: string,
  ragExamples?: SceneExample[]
): string {
  const fewShotBlock = buildFewShotBlock(genre, ragExamples || CURATED_EXAMPLES);
  
  return `${fewShotBlock}

═══════════════════════════════════════════════════════════════════════════════
CONTEXTO (STORY BIBLE)
═══════════════════════════════════════════════════════════════════════════════
${bibleContext}

═══════════════════════════════════════════════════════════════════════════════
BEAT A DESARROLLAR
═══════════════════════════════════════════════════════════════════════════════
${beat}

═══════════════════════════════════════════════════════════════════════════════
INSTRUCCIONES
═══════════════════════════════════════════════════════════════════════════════
Desarrolla este beat siguiendo:
1. El estilo de los ejemplos de referencia
2. Las reglas de formato profesional
3. El contexto del Story Bible

Género: ${genre}
Formato de salida: JSON con schema V3`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUALITY CHECKER - Detecta AI-speak
// ═══════════════════════════════════════════════════════════════════════════════

const AI_SPEAK_PATTERNS = [
  /todo cambia/gi,
  /nada volver[áa] a ser igual/gi,
  /se da cuenta/gi,
  /empiezan? a\.\.\./gi,
  /la tensi[óo]n aumenta/gi,
  /surge un conflicto/gi,
  /las cosas se complican/gi,
  /hay algo en su mirada/gi,
  /de alguna manera/gi,
  /en ese momento/gi,
  /sin decir una palabra/gi,
  /el ambiente se vuelve/gi,
  /comparten una mirada/gi,
  /siente? que algo/gi
];

export function detectAISpeak(text: string): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  
  for (const pattern of AI_SPEAK_PATTERNS) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found);
    }
  }
  
  return {
    found: matches.length > 0,
    matches: [...new Set(matches)]
  };
}

export function calculateQualityScore(scene: {
  action_text?: string;
  dialogue?: any[];
  raw_content?: string;
}): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  
  const text = scene.raw_content || scene.action_text || '';
  
  // Check for AI-speak
  const aiSpeak = detectAISpeak(text);
  if (aiSpeak.found) {
    score -= aiSpeak.matches.length * 10;
    issues.push(`AI-speak detectado: ${aiSpeak.matches.join(', ')}`);
  }
  
  // Check dialogue variety
  if (scene.dialogue && scene.dialogue.length > 2) {
    const chars = scene.dialogue.map((d: any) => d.character);
    const uniqueChars = new Set(chars);
    if (uniqueChars.size < 2) {
      score -= 15;
      issues.push('Diálogo sin variedad de personajes');
    }
  }
  
  // Check action length
  const paragraphs = text.split('\n\n');
  const longParagraphs = paragraphs.filter(p => p.split('\n').length > 4);
  if (longParagraphs.length > 0) {
    score -= longParagraphs.length * 5;
    issues.push(`${longParagraphs.length} párrafos demasiado largos`);
  }
  
  return {
    score: Math.max(0, score),
    issues
  };
}
