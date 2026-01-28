/**
 * Scene Retriever - Provides few-shot examples from professional scripts
 * Uses genre-indexed scenes for fast retrieval without embeddings
 */

// Embedded scene index - top scenes per genre
// This is a subset of the full index for fast loading in edge functions
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
    },
    {
      title: "Pitch Perfect 2",
      slugline: "INT. BELLA HOUSE - NIGHT",
      content: `Emily stands in front of the Bellas. There is a hazardous amount of lit candles around her. Beca hands Emily a large wine glass.
BECA
It's ceremonial. And you should definitely not drink it because it is essentially poison.
EMILY
(smells it)
Aw, it smells like cherry and vanilla.
CHLOE
Okay, repeat after me. I, sing your name.
EMILY
I -- EMILYYYYY!
CHLOE
Promise to uphold the ideals of a Bella woman forever.`
    }
  ],
  "drama": [
    {
      title: "A Quiet Place",
      slugline: "INT. FARMHOUSE, DINING ROOM - EVENING",
      content: `The rim of the sun sets outside, casting an orange glow over the dinner table. The family finishes their supper. Mia clears the table. John unfolds a MONOPOLY game board as April finally joins from upstairs.

She takes the furthest seat from John. April's mood changes as she tussles with Will over who gets to roll first. They play the game mostly with hand gestures, never speaking a word. They roll the DICE on a soft blanket so that it doesn't make a sound.

Will is five spaces away from landing on April's BOARDWALK. He silently prays for a miracle. Will rolls a... five. He throws up his hands in protest. April lets out a GIGGLE.

The first sound we've heard this whole time -- JOHN'S EYES WIDEN. APRIL COVERS HER MOUTH. EVERYONE GETS DEADLY STILL. AFRAID.

AND THEN WE HEAR IT. A SCREAM IN THE DISTANCE. IT IS NOT HUMAN.`
    },
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
  ],
  "thriller": [
    {
      title: "A Knock at the Cabin",
      slugline: "INT. CABIN - NIGHT",
      content: `Andrew and Eric exchange a look. Their hands still bound.

LEONARD
I know this is hard. I know it seems impossible. But we didn't choose this. None of us did.

He gestures to the others.

LEONARD (CONT'D)
We all had visions. Terrible visions. The four of us, strangers, all seeing the same thing.

ANDREW
What thing?

Leonard hesitates. Swallows hard.

LEONARD
The end of everything.

Eric laughs. Disbelief. Fear.

ERIC
That's insane. You're insane.

LEONARD
(quiet, certain)
I wish I was.`
    },
    {
      title: "Edge of Tomorrow",
      slugline: "EXT. ENGLISH VILLAGE - NIGHT - FLASHBACK",
      content: `It is a SLAUGHTER. JAVELINS flying. SNAKE-LIKE MIMICS attacking like GIANT BLACK RATTLESNAKES, tearing through the VILLAGERS as they fight with makeshift WEAPONS...

CAGE
JUST GET BEHIND ME --

Cage RUNNING, keeping his family behind him. GRABBING WEAPONS from FALLEN VILLAGERS. A SHOTGUN. A PITCHFORK.

As a SNAKE-LIKE MIMIC surges at his son, and --

CAGE (CONT'D)
ADAM --

BLAM. He BLOWS the thing's head off with the shotgun.

Cage GRABBING his son, protecting his family...`
    }
  ],
  "action": [
    {
      title: "John Wick",
      slugline: "INT. A SUBWAY STATION - CONTINUOUS",
      content: `John exits the train, stuffs his hands into his pockets, and seeks to disappear into the crowd...

...as KIRILL and TWO GUNMEN spot him.

They move towards him... following... hands reaching beneath their jackets, fingers curling around triggers as silenced pistols are slipped free by steady hands.

KIRILL
Babushka.

John slows his stride, hands out to his side, mind racing.

Kirill grins, willing for John to give him reason to fire.

Suddenly, a frail commuter stumbles into their midst-

THUMP! THUMP! THUMP!

-killing each with a single, silenced round to the heart.

Kirill is dead before he hits the ground.`
    },
    {
      title: "Wonder Woman",
      slugline: "INT. CONTROL TOWER - CONTINUOUS ACTION",
      content: `The lasso is still tight around Sir Patrick, crackling. Diana holds it, still unsure what to think --

SIR PATRICK/ARES
I am not the God of War, Diana. I am the god of truth... All I ever wanted was to show my father how evil his creation was. But he refused.

As Sir Patrick runs his finger along the lasso, a SURGE of energy runs from his hands and down towards Diana -- into her, causing her to see FLASHES OF THE PAST.

Each is like a pulse that fades and returns us to the scene at hand.`
    }
  ],
  "horror": [
    {
      title: "A Monster Calls",
      slugline: "INT. CONOR'S ROOM - NIGHT",
      content: `Conor lies in bed, eyes wide open. Staring at the ceiling.

The clock reads 12:06.

A SOUND. Like wood groaning. Like something massive... breathing.

Conor sits up. Looks toward the window.

Beyond the glass, the yew tree in the churchyard seems... closer.

Its branches reach toward the house like fingers.

CONOR
(whisper)
It's just a dream.

The branches TAP against the window.

Once. Twice. Three times.

And then a VOICE. Deep as the earth itself.

MONSTER (V.O.)
I have come to tell you three stories.`
    }
  ],
  "romance": [
    {
      title: "20th Century Women",
      slugline: "INT. DOROTHEA'S HOUSE - KITCHEN - NIGHT",
      content: `Dorothea and Jamie sit across from each other. The remains of dinner between them.

DOROTHEA
What do you want to be when you grow up?

JAMIE
I don't know.

DOROTHEA
That's okay. I didn't know either. Still don't.

She lights a cigarette. Studies her son.

DOROTHEA (CONT'D)
You know what I think? I think it's okay to not know. To just... be here. In this moment.

JAMIE
Mom, that's really depressing.

Dorothea laughs. A real laugh.

DOROTHEA
Maybe. But it's also kind of freeing, don't you think?`
    }
  ],
  "sci-fi": [
    {
      title: "Edge of Tomorrow",
      slugline: "EXT. STRATOSPHERE - DAY",
      content: `The dropship SOARS upwards, as Cage forces the jet into a NEEDLE SHOT: straight up, ABOVE THE CLOUDS...

Cage LOCKING his faceplate. Securing his jacket. As he soars ABOVE THE ATMOSPHERE to the BLACK EDGE OF SPACE...

The DENSE FOG of war VISIBLE on the FRENCH COASTLINE BELOW, as the ROCKET starts to fail, and Cage lets go --

Cage floating in LOW-ORBIT. A single man SILHOUETTED against the green and blue below.

And then he sees it...

A SINGLE LIGHT. Pulsing. Growing. Coming from INSIDE the Earth.`
    }
  ]
};

export interface SceneExample {
  title: string;
  slugline: string;
  content: string;
}

/**
 * Get scene examples for a specific genre
 * @param genre - Target genre (comedy, drama, thriller, action, horror, romance, sci-fi)
 * @param count - Number of examples to return (default 2)
 * @returns Array of scene examples
 */
export function getSceneExamples(genre: string, count: number = 2): SceneExample[] {
  const normalizedGenre = genre.toLowerCase().trim();
  
  // Try exact match first
  if (SCENE_INDEX[normalizedGenre]) {
    return SCENE_INDEX[normalizedGenre].slice(0, count);
  }
  
  // Map common genre variations
  const genreMap: Record<string, string> = {
    'comedia': 'comedy',
    'dramático': 'drama',
    'dramático/comedia': 'comedy',
    'suspense': 'thriller',
    'terror': 'horror',
    'ciencia ficción': 'sci-fi',
    'ciencia-ficción': 'sci-fi',
    'acción': 'action',
    'romántico': 'romance',
    'romántica': 'romance'
  };
  
  const mappedGenre = genreMap[normalizedGenre];
  if (mappedGenre && SCENE_INDEX[mappedGenre]) {
    return SCENE_INDEX[mappedGenre].slice(0, count);
  }
  
  // Fallback to drama (most versatile)
  return SCENE_INDEX['drama'].slice(0, count);
}

/**
 * Format scene examples for prompt injection
 * @param examples - Array of scene examples
 * @returns Formatted string for LLM prompt
 */
export function formatExamplesForPrompt(examples: SceneExample[]): string {
  if (!examples.length) return '';
  
  return examples.map((ex, i) => `
━━━━━━━━━━━━━━━━━━━━━━━━━━
EJEMPLO ${i + 1} (${ex.title})
━━━━━━━━━━━━━━━━━━━━━━━━━━
${ex.slugline}

${ex.content}
`).join('\n');
}

/**
 * Build few-shot prompt block for script generation
 * @param genre - Target genre
 * @param count - Number of examples
 * @returns Formatted prompt block
 */
export function buildFewShotBlock(genre: string, count: number = 2): string {
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
