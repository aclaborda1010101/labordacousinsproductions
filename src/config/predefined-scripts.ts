// Guiones predefinidos para ManIAS Lab
// Integración de mejoras desarrolladas 2026-01-31

export interface PredefinedScript {
  id: string;
  title: string;
  description: string;
  category: 'family' | 'adventure' | 'comedy' | 'drama';
  duration: number; // minutes
  script: string;
  characters: Character[];
}

export interface Character {
  name: string;
  age: number;
  description: string;
  role: 'protagonist' | 'secondary' | 'supporting';
}

// BOSCO ADVENTURES - Historia familiar completa
export const BOSCO_ADVENTURES_SCRIPT: PredefinedScript = {
  id: 'bosco-adventures',
  title: 'Las Aventuras de Bosco',
  description: 'Historia familiar sobre un niño de 4 años y su familia en una aventura memorable',
  category: 'family',
  duration: 1, // 58 segundos
  characters: [
    {
      name: 'Bosco',
      age: 4,
      description: 'Niño protagonista, curioso y aventurero',
      role: 'protagonist'
    },
    {
      name: 'Agustín',
      age: 40,
      description: 'Padre cariñoso y protector',
      role: 'secondary'
    },
    {
      name: 'Juani',
      age: 38,
      description: 'Madre organizadora y cariñosa',
      role: 'secondary'
    },
    {
      name: 'Nia',
      age: 8,
      description: 'Prima energética y divertida',
      role: 'supporting'
    },
    {
      name: 'Sasa',
      age: 2,
      description: 'Yorkshire Terrier diminuta, 1.5kg, muy juguetona',
      role: 'supporting'
    }
  ],
  script: `BOSCO ADVENTURES - VIDEO SCRIPT
Duration: 58 seconds
Resolution: HD 1080p

=== SCENE BREAKDOWN ===

SCENE 1 (0:00-0:15) - FAMILY INTRODUCTION
FADE IN: Interior casa familiar, sala de estar cálida
- Bosco (niño 4 años) jugando en el suelo con Sasa (perrita Yorkshire diminuta)
- Agustín (padre 40 años) leyendo en sofá, sonríe viendo a Bosco
- Juani (madre) preparando merienda en cocina de fondo
- Nia (prima) entra corriendo, se une al juego con Bosco y Sasa

DIÁLOGO:
BOSCO: "¡Mira Sasa, vamos a jugar a las aventuras!"
AGUSTÍN: "Cuidado campeón, no hagas mucho ruido"
JUANI: "La merienda está casi lista"

SCENE 2 (0:16-0:30) - LA CRISIS
- Sasa corre hacia la cocina persiguiendo una pelota
- Tropezón cómico: Sasa enreda las patas de Juani
- Juani grita sorprendida, la bandeja de merienda vuela
- Agustín se levanta rápidamente, Bosco y Nia corren a ayudar

DIÁLOGO:
JUANI: "¡Ay, Sasa!"
BOSCO: "¡Mami! ¿Estás bien?"
NIA: "¡Vamos a limpiar!"

SCENE 3 (0:31-0:45) - TRABAJO EN EQUIPO
MONTAGE: Limpieza familiar coordinada
- Agustín recoge platos rotos con cuidado
- Bosco y Nia limpian líquidos derramados, riendo
- Juani abraza a Sasa, ya sin enojo
- Sasa mueve la cola arrepentida

MÚSICA: Melodía familiar alegre

SCENE 4 (0:46-0:58) - FINAL FELIZ
FADE TO: Misma sala, nueva merienda preparada
- Familia sentada en círculo en el suelo
- Compartiendo galletas y risas
- Sasa durmiendo pacíficamente en el regazo de Bosco
- Bosco mira a cámara y sonríe

DIÁLOGO FINAL:
BOSCO: "Las mejores aventuras son con la familia"

FADE OUT con música emotiva

=== TECHNICAL SPECS ===
- Format: HD 1080p (1920x1080)
- Frame Rate: 24fps cinematic
- Audio: Stereo, dialogue clear + ambient music
- Lighting: Warm domestic lighting, natural window light
- Camera: Handheld style for intimacy, stable for dialogue
- Color Grading: Warm tones, family-friendly palette`
};

// Lista de todos los guiones predefinidos
export const PREDEFINED_SCRIPTS: PredefinedScript[] = [
  BOSCO_ADVENTURES_SCRIPT,
  // Aquí se pueden agregar más guiones en el futuro
];

// Función helper para obtener guión por ID
export const getPredefinedScript = (id: string): PredefinedScript | undefined => {
  return PREDEFINED_SCRIPTS.find(script => script.id === id);
};

// Función helper para obtener guiones por categoría
export const getScriptsByCategory = (category: string): PredefinedScript[] => {
  return PREDEFINED_SCRIPTS.filter(script => script.category === category);
};