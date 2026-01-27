/**
 * formatScreenplay.ts - Convierte JSON de guión a formato Hollywood estándar
 * 
 * Formato de salida:
 * - Sluglines en MAYÚSCULAS
 * - Nombres de personaje centrados
 * - Diálogo indentado
 * - Acotaciones entre paréntesis
 * - Transiciones alineadas a la derecha
 */

export interface DialogueLine {
  character: string;
  parenthetical?: string | null;
  line: string;
}

export interface SceneData {
  scene_number?: number;
  slugline: string;
  raw_content?: string;
  action_summary?: string;
  dialogue?: DialogueLine[];
  mood?: string;
  conflict?: string;
}

export interface ScreenplayData {
  title?: string;
  author?: string;
  synopsis?: string;
  scenes: SceneData[];
}

// Constantes de formato (caracteres para simular márgenes en texto plano)
const CHARACTER_INDENT = '                         '; // ~25 espacios para nombre
const DIALOGUE_INDENT = '            '; // ~12 espacios para diálogo
const PARENTHETICAL_INDENT = '                    '; // ~20 espacios para acotación
const TRANSITION_INDENT = '                                                     '; // ~53 espacios

/**
 * Formatea una línea de diálogo con nombre de personaje y acotación
 */
function formatDialogueLine(line: DialogueLine): string {
  const parts: string[] = [];
  
  // Nombre del personaje en mayúsculas, centrado
  parts.push(`${CHARACTER_INDENT}${line.character.toUpperCase()}`);
  
  // Acotación entre paréntesis si existe
  if (line.parenthetical) {
    parts.push(`${PARENTHETICAL_INDENT}(${line.parenthetical})`);
  }
  
  // Línea de diálogo, dividida en líneas de ~35 caracteres
  const dialogueLines = wrapText(line.line, 35);
  for (const dl of dialogueLines) {
    parts.push(`${DIALOGUE_INDENT}${dl}`);
  }
  
  return parts.join('\n');
}

/**
 * Divide texto largo en líneas de ancho máximo
 */
function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  return lines;
}

/**
 * Formatea la descripción de acción (situación)
 */
function formatAction(text: string): string {
  if (!text) return '';
  
  // Dividir en párrafos y formatear cada uno
  const paragraphs = text.split(/\n\n+/);
  const formatted = paragraphs.map(p => {
    // Wrap cada párrafo a ~60 caracteres
    const lines = wrapText(p.trim(), 60);
    return lines.join('\n');
  });
  
  return formatted.join('\n\n');
}

/**
 * Formatea un slugline (encabezado de escena)
 */
function formatSlugline(slugline: string, sceneNumber?: number): string {
  const slug = slugline.toUpperCase().trim();
  
  // Asegurar formato correcto INT./EXT.
  let formatted = slug;
  if (!slug.startsWith('INT') && !slug.startsWith('EXT')) {
    // Intentar inferir del contenido
    if (slug.includes('INTERIOR') || slug.includes('DENTRO')) {
      formatted = 'INT. ' + slug.replace(/INTERIOR|DENTRO/gi, '').trim();
    } else if (slug.includes('EXTERIOR') || slug.includes('FUERA')) {
      formatted = 'EXT. ' + slug.replace(/EXTERIOR|FUERA/gi, '').trim();
    } else {
      formatted = 'INT. ' + slug; // Default a interior
    }
  }
  
  // Añadir número de escena si existe
  if (sceneNumber) {
    return `${sceneNumber}\t${formatted}\t${sceneNumber}`;
  }
  
  return formatted;
}

/**
 * Formatea una escena completa
 */
function formatScene(scene: SceneData): string {
  const parts: string[] = [];
  
  // Slugline
  parts.push(formatSlugline(scene.slugline, scene.scene_number));
  parts.push('');
  
  // Descripción de acción/situación
  if (scene.raw_content) {
    parts.push(formatAction(scene.raw_content));
    parts.push('');
  } else if (scene.action_summary) {
    parts.push(formatAction(scene.action_summary));
    parts.push('');
  }
  
  // Diálogos
  if (scene.dialogue && scene.dialogue.length > 0) {
    for (const line of scene.dialogue) {
      parts.push(formatDialogueLine(line));
      parts.push('');
    }
  }
  
  return parts.join('\n');
}

/**
 * Formatea la página de título
 */
function formatTitlePage(title: string, author?: string): string {
  const lines: string[] = [];
  
  // Título centrado
  lines.push('');
  lines.push('');
  lines.push('');
  lines.push('');
  lines.push('');
  lines.push(`                    ${title.toUpperCase()}`);
  lines.push('');
  lines.push('');
  
  if (author) {
    lines.push(`                    escrito por`);
    lines.push('');
    lines.push(`                    ${author}`);
  }
  
  lines.push('');
  lines.push('');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Convierte datos de guión JSON a formato Hollywood texto
 */
export function formatScreenplay(data: ScreenplayData): string {
  const parts: string[] = [];
  
  // Página de título
  if (data.title) {
    parts.push(formatTitlePage(data.title, data.author));
    parts.push('');
    parts.push('═'.repeat(60));
    parts.push('');
  }
  
  // Sinopsis (si existe)
  if (data.synopsis) {
    parts.push('SINOPSIS');
    parts.push('');
    parts.push(formatAction(data.synopsis));
    parts.push('');
    parts.push('═'.repeat(60));
    parts.push('');
  }
  
  // Escenas
  for (const scene of data.scenes) {
    parts.push(formatScene(scene));
    parts.push('');
  }
  
  // Final
  parts.push('');
  parts.push(`${TRANSITION_INDENT}FADE OUT.`);
  parts.push('');
  parts.push('                         FIN');
  
  return parts.join('\n');
}

/**
 * Convierte el output del generador a texto de guión
 * Maneja diferentes formatos de entrada
 */
export function convertToScreenplayText(input: any): string {
  // Si ya es string, devolver
  if (typeof input === 'string') {
    return input;
  }
  
  // Si tiene scenes, formatear
  if (input?.scenes && Array.isArray(input.scenes)) {
    return formatScreenplay({
      title: input.title || input.outline?.title,
      author: input.author || input.writers?.join(' & '),
      synopsis: input.synopsis || input.outline?.synopsis,
      scenes: input.scenes,
    });
  }
  
  // Si tiene episodes con scenes dentro
  if (input?.episodes && Array.isArray(input.episodes)) {
    const allScenes: SceneData[] = [];
    for (const ep of input.episodes) {
      if (ep.scenes && Array.isArray(ep.scenes)) {
        allScenes.push(...ep.scenes);
      }
    }
    if (allScenes.length > 0) {
      return formatScreenplay({
        title: input.title,
        synopsis: input.synopsis,
        scenes: allScenes,
      });
    }
  }
  
  // Fallback: intentar extraer raw_content de cualquier estructura
  if (input?.raw_content) {
    return input.raw_content;
  }
  
  // Si todo falla, devolver JSON formateado
  return JSON.stringify(input, null, 2);
}

/**
 * Exporta el guión como archivo descargable
 */
export function downloadScreenplay(data: ScreenplayData, filename: string = 'guion.txt'): void {
  const text = formatScreenplay(data);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Exporta en formato Fountain (estándar de la industria)
 * https://fountain.io/
 */
export function formatAsFountain(data: ScreenplayData): string {
  const lines: string[] = [];
  
  // Metadata Fountain
  if (data.title) {
    lines.push(`Title: ${data.title}`);
  }
  if (data.author) {
    lines.push(`Author: ${data.author}`);
  }
  lines.push('');
  
  // Escenas en formato Fountain
  for (const scene of data.scenes) {
    // Slugline forzado con punto
    const slug = scene.slugline.toUpperCase();
    if (!slug.startsWith('INT') && !slug.startsWith('EXT') && !slug.startsWith('.')) {
      lines.push('.' + slug);
    } else {
      lines.push(slug);
    }
    lines.push('');
    
    // Acción
    if (scene.raw_content) {
      lines.push(scene.raw_content);
      lines.push('');
    }
    
    // Diálogos (en Fountain: nombre en mayúsculas solo)
    if (scene.dialogue) {
      for (const d of scene.dialogue) {
        lines.push(d.character.toUpperCase());
        if (d.parenthetical) {
          lines.push(`(${d.parenthetical})`);
        }
        lines.push(d.line);
        lines.push('');
      }
    }
  }
  
  return lines.join('\n');
}
