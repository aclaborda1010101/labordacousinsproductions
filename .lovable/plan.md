# Plan: Calidad Cinematografica Profesional + Upload Manual de Keyframes

## Vision General

Implementar mejoras para que las producciones generadas sean indistinguibles de una pelicula o serie profesional, ya sea live-action o animacion. El objetivo es eliminar los "tells" tipicos de contenido generado por IA.

---

## FASE 1: Upload Manual de Keyframes

### Problema
El usuario no puede subir keyframes generados externamente (Midjourney, Stable Diffusion local, etc.) o fotogramas de referencia.

### Solucion

**Archivo:** `src/components/project/KeyframeManager.tsx`

Agregar boton de upload junto al boton de generar:

```typescript
// Nuevo estado para upload
const [isUploading, setIsUploading] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);

// Funcion de upload
async function handleManualUpload(file: File, frameType: 'initial' | 'intermediate' | 'final', timestampSec: number) {
  // 1. Subir a Supabase Storage
  const path = `keyframes/${shotId}/manual_${frameType}_${timestampSec}s_${Date.now()}.jpg`;
  const { data, error } = await supabase.storage
    .from('renders')
    .upload(path, file);
  
  // 2. Crear registro en tabla keyframes
  await supabase.from('keyframes').insert({
    shot_id: shotId,
    frame_type: frameType,
    timestamp_sec: timestampSec,
    image_url: publicUrl,
    source: 'manual_upload', // Nuevo campo para distinguir origen
    approved: false // Usuario debe aprobar despues
  });
}
```

**UI:**
- Boton "Subir Keyframe" junto a "Generar"
- Drag & drop zone para arrastrar imagenes
- Preview antes de confirmar
- Opcion de reemplazar keyframe existente

---

## FASE 2: Eliminacion de "AI Tells" - Prompt Engineering Avanzado

### Problema
Las imagenes generadas tienen "tells" tipicos de IA:
- Piel demasiado suave/plastica
- Ojos muy brillantes/perfectos
- Iluminacion irreal
- Texturas repetitivas
- Simetria excesiva

### Solucion: Nuevos Modificadores Anti-AI

**Archivo:** `supabase/functions/generate-keyframe/index.ts`

Agregar bloque `ANTI_AI_TELLS` al prompt:

```typescript
const ANTI_AI_TELLS = `
=== REALISMO FOTOGRAFICO OBLIGATORIO ===
PIEL: 
- Textura de poros visible a distancia apropiada
- Imperfecciones naturales (marcas, pecas, pequeñas irregularidades)
- NO suavizado artificial, NO aspecto "porcelana"
- Variaciones de tono natural (rojeces, venas sutiles)

OJOS:
- Reflexiones realistas de luz ambiental (no highlights perfectos)
- Venas sutiles en esclerótica
- Asimetría natural entre ambos ojos
- Iris con variaciones de color y textura

CABELLO:
- Mechones sueltos naturales, "flyaways"
- Variaciones de grosor y direccion
- Reflejos coherentes con fuente de luz
- NO demasiado perfecto o simétrico

ILUMINACION:
- Coherencia con fuente de luz establecida
- Sombras con bordes variables (no uniformes)
- Spill de color ambiental
- Falloff natural de la luz

TEXTURAS:
- Ropa con arrugas, pliegues, y desgaste apropiado
- Superficies con polvo, huellas, o uso visible
- NO texturas "nuevas" o perfectamente limpias
- Variación en materiales (brillo, mate, textil)

COMPOSICION:
- Asimetría compositiva natural
- Espacio negativo intencional
- NO centrado perfecto a menos que sea narrativo
=== FIN ANTI-AI ===
`;
```

**Negative Prompts Mejorados:**

```typescript
const ENHANCED_NEGATIVE = [
  // Anti-AI específicos
  'smooth plastic skin',
  'poreless skin',
  'airbrushed face',
  'perfect symmetrical face',
  'overly bright eyes',
  'uniform lighting without falloff',
  'perfectly clean textures',
  'stock photo look',
  'CGI render appearance',
  'wax figure look',
  'mannequin appearance',
  
  // Calidad técnica
  'jpeg artifacts',
  'noise grain pattern',
  'watermark',
  'text overlay',
  'border frame',
  'vignette filter',
  
  // Composición
  'centered composition',
  'amateur framing',
  'snapshot aesthetic',
];
```

---

## FASE 3: Sistema de Coherencia Temporal (Keyframe Chaining Mejorado)

### Problema
Los keyframes consecutivos pueden tener inconsistencias sutiles que rompen la ilusion.

### Solucion: Análisis de Coherencia Pre-Generacion

**Nuevo Edge Function:** `supabase/functions/analyze-keyframe-coherence/index.ts`

Antes de generar un nuevo keyframe, analizar el anterior para extraer:

```typescript
interface CoherenceAnalysis {
  // Iluminacion
  lighting: {
    direction: 'left' | 'right' | 'front' | 'back' | 'top' | 'mixed';
    temperature: 'warm' | 'neutral' | 'cool';
    intensity: 'low' | 'medium' | 'high';
    keyToFillRatio: string; // e.g., "3:1"
  };
  
  // Color
  color: {
    dominantPalette: string[]; // hex colors
    saturationLevel: 'muted' | 'natural' | 'vibrant';
    contrastLevel: 'low' | 'medium' | 'high';
  };
  
  // Personajes
  characters: Array<{
    id: string;
    position: { x: number; y: number }; // porcentaje del frame
    facing: 'camera' | 'left' | 'right' | 'away';
    expression: string;
    wardrobeDescription: string;
  }>;
  
  // Set/Fondo
  background: {
    description: string;
    keyElements: string[];
    depth: 'shallow' | 'medium' | 'deep';
  };
}
```

**Flujo:**
1. Usuario genera Keyframe N
2. Sistema analiza Keyframe N con Vision AI
3. Análisis se inyecta como CONTEXTO OBLIGATORIO en Keyframe N+1
4. Prompt incluye: "MANTENER EXACTAMENTE: [análisis del anterior]"

---

## FASE 4: Presets Cinematograficos por Genero

### Solucion: Ampliar Visual Presets

**Archivo:** `src/lib/visualPresets.ts`

Agregar presets especializados con configuraciones anti-AI integradas:

```typescript
// Nuevo preset ejemplo: Drama Televisivo Premium
drama_premium: {
  id: 'drama_premium',
  name: 'Drama Premium TV',
  description: 'Estilo series HBO/Netflix - Breaking Bad, The Crown',
  category: 'live-action',
  examples: ['Breaking Bad', 'The Crown', 'Succession', 'Better Call Saul'],
  
  camera: {
    body: 'ARRI Alexa LF',
    lens: 'Cooke S7/i Full Frame',
    focalLength: '50mm',
    aperture: 'f/2.8',
  },
  
  style: {
    lighting: 'motivated naturalistic, practical sources, subtle fill',
    colorPalette: ['#1a1a1a', '#2d3436', '#636e72', '#dfe6e9', '#ffeaa7'],
    mood: 'contemplative, layered, psychological depth',
    contrast: 'medium',
    saturation: 'natural',
    grain: 'subtle',
  },
  
  // NUEVO: Configuración anti-AI específica del preset
  antiAIConfig: {
    skinTexture: 'visible pores, natural imperfections, age-appropriate',
    eyeDetail: 'realistic reflections of practicals, not ring lights',
    hairStyle: 'natural flyaways, movement-appropriate',
    clothingWear: 'lived-in, character-appropriate wear patterns',
  },
  
  promptModifiers: [
    'premium television production value',
    'motivated lighting from practical sources',
    'shallow depth of field isolating subjects',
    'atmospheric haze in backgrounds',
    'color graded for drama',
    'ARRI Alexa color science',
    'anamorphic lens characteristics',
    'cinematic aspect ratio framing',
  ],
  
  negativePromptModifiers: [
    'flat lighting',
    'amateur photography',
    'stock photo look',
    'oversaturated colors',
    'digital noise',
    'plastic skin texture',
    'perfect symmetry',
  ],
}
```

---

## FASE 5: Sistema de QC Visual Pre-Aprobacion

### Problema
El usuario debe detectar manualmente problemas de calidad.

### Solucion: QC Automatico con Puntuacion

**Nuevo componente:** `src/components/project/KeyframeQCPanel.tsx`

Cuando se genera un keyframe, ejecutar QC automatico:

```typescript
interface KeyframeQC {
  // Puntuaciones por categoria (0-100)
  scores: {
    technicalQuality: number;     // Nitidez, ruido, artefactos
    cinematicComposition: number; // Encuadre, regla de tercios
    lightingCoherence: number;    // Consistencia con preset
    characterIdentity: number;    // Parecido con referencia
    styleAdherence: number;       // Fidelidad al preset visual
    antiAIScore: number;          // Ausencia de "tells" de IA
  };
  
  // Score global ponderado
  overallScore: number;
  
  // Issues detectados
  issues: Array<{
    category: string;
    severity: 'minor' | 'major' | 'critical';
    description: string;
    suggestion: string;
  }>;
  
  // Veredicto
  verdict: 'approve' | 'review' | 'regenerate';
}
```

**UI en KeyframeManager:**
- Badge de color segun score (verde >85, amarillo 70-85, rojo <70)
- Panel expandible con detalles de QC
- Sugerencias de mejora especificas
- Boton "Regenerar con Correcciones" que inyecta los issues al prompt

---

## FASE 6: Temporal Consistency Engine

### Problema
Los videos generados de micro-shots pueden tener "jumps" visuales.

### Solucion: Bloqueo de Parametros entre Keyframes

**Modificar:** `supabase/functions/generate-microshot-video/index.ts`

```typescript
// Antes de generar video, verificar coherencia de keyframes
async function validateKeyframeChain(microShotId: string): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const microShot = await getMicroShotWithKeyframes(microShotId);
  
  const issues: string[] = [];
  
  // Verificar que ambos keyframes existen y estan aprobados
  if (!microShot.keyframe_initial?.approved) {
    issues.push('Keyframe inicial no aprobado');
  }
  if (!microShot.keyframe_final?.approved) {
    issues.push('Keyframe final no aprobado');
  }
  
  // Verificar coherencia visual (usando Vision AI)
  const coherenceCheck = await analyzeKeyframePairCoherence(
    microShot.keyframe_initial.image_url,
    microShot.keyframe_final.image_url
  );
  
  if (coherenceCheck.lightingMismatch) {
    issues.push(`Iluminacion inconsistente: ${coherenceCheck.lightingDetails}`);
  }
  if (coherenceCheck.wardrobeMismatch) {
    issues.push(`Vestuario inconsistente: ${coherenceCheck.wardrobeDetails}`);
  }
  if (coherenceCheck.positionJump) {
    issues.push(`Salto de posicion demasiado grande para ${microShot.duration_sec}s`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}
```

---

## FASE 7: Motion Prompting para Videos

### Problema
Los prompts de video no especifican el movimiento con suficiente detalle.

### Solucion: Template de Movimiento Cinematografico

**Nuevo archivo:** `src/lib/motionTemplates.ts`

```typescript
export const MOTION_TEMPLATES = {
  dialogue_subtle: {
    name: 'Dialogo Sutil',
    description: 'Movimiento minimo para escenas de conversacion',
    cameraMotion: 'locked off, imperceptible drift',
    subjectMotion: 'subtle breathing, micro-expressions, occasional blinks',
    environmentMotion: 'ambient particles, distant background movement',
    promptBlock: `
MOVIMIENTO CINEMATICO:
- Camara: fija con drift imperceptible (maximo 0.5% del frame)
- Personajes: respiracion sutil, micro-expresiones, parpadeo natural
- Ambiente: particulas en el aire, movimiento lejano de fondo
- EVITAR: movimiento robotico, estatismo total, cambios bruscos
    `
  },
  
  action_dynamic: {
    name: 'Accion Dinamica',
    description: 'Movimiento energetico para secuencias de accion',
    cameraMotion: 'handheld shake, motivated pans, impact response',
    subjectMotion: 'full body motion, physics-accurate movement',
    environmentMotion: 'reactive environment, debris, dust',
    promptBlock: `
MOVIMIENTO CINEMATICO:
- Camara: shake de handheld, respuesta a impactos
- Personajes: movimiento de cuerpo completo, fisica realista
- Ambiente: polvo, particulas reactivas, elementos que responden
- EVITAR: movimiento flotante, falta de peso, transiciones irreales
    `
  },
  
  emotional_breathing: {
    name: 'Emocional Respirando',
    description: 'Movimiento para momentos emotivos',
    cameraMotion: 'imperceptible dolly in, breathing with character',
    subjectMotion: 'emotional micro-movements, breathing changes',
    environmentMotion: 'still except for natural elements',
    promptBlock: `
MOVIMIENTO CINEMATICO:
- Camara: dolly in imperceptible (1% por segundo maximo)
- Personajes: respiracion visible, temblor emocional sutil
- Ambiente: casi estatico, solo elementos naturales (viento, luz)
- EVITAR: movimiento que distraiga de la emocion
    `
  }
};
```

---

## FASE 8: Color Grading Lock

### Problema
Los colores pueden variar entre keyframes/shots.

### Solucion: Extraccion y Bloqueo de Paleta

**Nuevo modulo:** `src/lib/colorGradingLock.ts`

```typescript
// Extraer paleta de colores de una imagen usando Vision AI
async function extractColorPalette(imageUrl: string): Promise<{
  dominant: string[];      // Top 5 colores dominantes (hex)
  shadows: string;         // Color de sombras
  midtones: string;        // Color de medios tonos
  highlights: string;      // Color de altas luces
  temperature: number;     // Kelvin estimado
  tint: number;           // Desviacion verde/magenta
}> {
  // Llamar a Gemini Vision para analisis
}

// Bloquear paleta para toda una escena
interface ColorGradingLock {
  scene_id: string;
  palette: ColorPalette;
  lut_description: string;  // Descripcion del look para prompts
  locked_at: Date;
  locked_by: string;
}
```

**Inyeccion en prompts:**
```typescript
const colorBlock = `
COLOR GRADING BLOQUEADO (NO DESVIARSE):
- Paleta dominante: ${palette.dominant.join(', ')}
- Sombras: ${palette.shadows} (NO usar negro puro)
- Altas luces: ${palette.highlights} (NO usar blanco puro)
- Temperatura: ${palette.temperature}K
- Look: ${palette.lut_description}
- PROHIBIDO: colores fuera de paleta, saturacion inconsistente
`;
```

---

## Archivos a Crear/Modificar

| Archivo | Accion | Descripcion |
|---------|--------|-------------|
| `src/components/project/KeyframeManager.tsx` | Modificar | Agregar upload manual |
| `supabase/functions/generate-keyframe/index.ts` | Modificar | Agregar ANTI_AI_TELLS y negative prompts mejorados |
| `supabase/functions/analyze-keyframe-coherence/index.ts` | Crear | Analisis de coherencia pre-generacion |
| `src/lib/visualPresets.ts` | Modificar | Agregar presets con antiAIConfig |
| `src/components/project/KeyframeQCPanel.tsx` | Crear | Panel de QC automatico |
| `supabase/functions/generate-microshot-video/index.ts` | Modificar | Validacion de coherencia de cadena |
| `src/lib/motionTemplates.ts` | Crear | Templates de movimiento cinematico |
| `src/lib/colorGradingLock.ts` | Crear | Sistema de bloqueo de color |
| `migrations/xxx_add_keyframe_source.sql` | Crear | Agregar campo source a keyframes |

---

## Resultado Esperado

### Calidad Visual:
- Keyframes con textura de piel realista (poros, imperfecciones)
- Iluminacion coherente con fuentes motivadas
- Colores consistentes bloqueados por escena
- Composicion cinematografica profesional

### Coherencia Temporal:
- Keyframes encadenados visualmente coherentes
- Videos sin "jumps" de iluminacion o color
- Movimiento cinematografico apropiado al genero

### Flujo de Trabajo:
- Upload manual para keyframes externos
- QC automatico con puntuacion
- Sugerencias de mejora especificas
- Regeneracion inteligente con correcciones

### Anti-AI:
- Eliminacion de "tells" tipicos de IA
- Texturas realistas en piel, ojos, cabello
- Asimetria y imperfecciones naturales
- Iluminacion con falloff y spill reales

---

## Orden de Implementacion

1. **Fase 1**: Upload manual de keyframes (permite testing inmediato)
2. **Fase 2**: Anti-AI tells en prompts (mejora calidad base)
3. **Fase 3**: Analisis de coherencia (garantiza continuidad)
4. **Fase 4**: Presets cinematograficos (configuracion facil)
5. **Fase 5**: QC automatico (feedback al usuario)
6. **Fase 6**: Validacion de cadena temporal
7. **Fase 7**: Motion templates (calidad de video)
8. **Fase 8**: Color grading lock (consistencia total)
