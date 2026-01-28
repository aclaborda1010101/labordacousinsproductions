/**
 * Test script for scene-retriever few-shot learning
 * Run with: npx tsx test-scene-retriever.ts
 */

// Import scene retriever (simulating Deno -> Node)
interface SceneExample {
  title: string;
  slugline: string;
  content: string;
}

const SCENE_INDEX: Record<string, SceneExample[]> = {
  "comedy": [
    {
      title: "Brooklyn Nine-Nine",
      slugline: "INT. COPY ROOM - LATER",
      content: `Charles walks up to Gina.
CHARLES
Hey, my flight is at eight tonight. It's domestic. Do you think I'll be safe if I get to the airport five hours early?
GINA
I would give yourself at least seven.
Charles nods: "You're right."
GINA (CONT'D)
Why are you going on a singles cruise anyway? I thought you were into Rosa.
CHARLES
Well, I am. But I've begun to feel like there is a small chance Rosa may not love me back.`
    }
  ],
  "drama": [
    {
      title: "John Wick",
      slugline: "INT. THE WICK HOME - THE KITCHEN - CONTINUOUS",
      content: `John unceremoniously tosses the newspaper onto the table, opens a cupboard, and measures out a couple of tablespoons of Folgers Coffee into an old percolator.

As it begins to bubble, John open the fridge, studies its contents for a moment or two, and then closes it, abandoning the thought of breakfast.

He pours himself a cup of coffee and sits at the table. The newspaper is ignored. He drinks in silence for a long, dark, brooding moment, the loneliness almost unsettling.

Suddenly, the phone on the wall RINGS.

John lowers his cup, staring at the device, his eyes tired.

A beat... and he stands, walking slowly to answer it.

JOHN
This is John.

As he listens to the voice on the other end, John remains still... stoic.

JOHN (CONT'D)
(whispers)
Ok.

John hangs up the phone and returns to the table, sinking slowly down into his chair.

A long beat...

...and John begins to weep, his hands trembling as he lowers his face in excruciating, utter, and complete sorrow.`
    }
  ]
};

function getSceneExamples(genre: string, count: number = 2): SceneExample[] {
  const normalizedGenre = genre.toLowerCase().trim();
  
  const genreMap: Record<string, string> = {
    'comedia': 'comedy',
    'dramático': 'drama'
  };
  
  const mappedGenre = genreMap[normalizedGenre] || normalizedGenre;
  
  if (SCENE_INDEX[mappedGenre]) {
    return SCENE_INDEX[mappedGenre].slice(0, count);
  }
  
  return SCENE_INDEX['drama'].slice(0, count);
}

function formatExamplesForPrompt(examples: SceneExample[]): string {
  if (!examples.length) return '';
  
  return examples.map((ex, i) => `
━━━━━━━━━━━━━━━━━━━━━━━━━━
EJEMPLO ${i + 1} (${ex.title})
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ex.slugline}

${ex.content}
`).join('\n');
}

function buildFewShotBlock(genre: string, count: number = 2): string {
  const examples = getSceneExamples(genre, count);
  
  if (!examples.length) return '';
  
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 EJEMPLOS DE GUIONES PROFESIONALES (${genre.toUpperCase()})
━━━━━━━━━━━━━━━━━━━━━━━━━━
Estudia estos fragmentos de guiones reales antes de escribir.
Observa: formato, ritmo, economía visual, diálogos con subtexto.

${formatExamplesForPrompt(examples)}

━━━━━━━━━━━━━━━━━━━━━━━━━━
APLICA ESTOS PATRONES:
- Descripciones visuales, no explicativas
- Diálogos con intención oculta
- Ritmo cinematográfico (párrafos cortos)
- Detalles específicos, no genéricos
━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

// Test it
console.log('=== Testing scene-retriever ===\n');

console.log('1. Testing COMEDY genre:');
console.log(buildFewShotBlock('comedy', 1));

console.log('\n2. Testing COMEDIA (Spanish):');
const comedyExamples = getSceneExamples('comedia', 1);
console.log(`Found ${comedyExamples.length} examples`);
console.log(`First example title: ${comedyExamples[0]?.title}`);

console.log('\n3. Testing DRAMA genre:');
const dramaExamples = getSceneExamples('drama', 1);
console.log(`Found ${dramaExamples.length} examples`);

console.log('\n4. Testing unknown genre (should fallback to drama):');
const unknownExamples = getSceneExamples('western', 1);
console.log(`Found ${unknownExamples.length} examples`);
console.log(`Fallback title: ${unknownExamples[0]?.title}`);

console.log('\n=== Test complete ===');
