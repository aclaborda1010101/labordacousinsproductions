# 📖 BIBLIA DEL FORMATO DE GUIONES - LC STUDIO

**Versión:** 1.0  
**Fuentes:** Hollywood Standard, Final Draft, Papers Académicos, Save the Cat  
**Objetivo:** Parser de guiones con >95% precisión

---

## 🎬 FORMATO ESTÁNDAR HOLLYWOOD (Master Scene Format)

### Especificaciones Técnicas

| Elemento | Especificación |
|----------|----------------|
| **Fuente** | Courier 12pt (monoespaciada) |
| **Margen izquierdo** | 1.5 pulgadas |
| **Margen derecho** | 1 pulgada |
| **Margen superior/inferior** | 1 pulgada |
| **Diálogo desde izquierda** | 2.5 pulgadas |
| **Character cue desde izquierda** | 3.7 pulgadas |
| **Parenthetical desde izquierda** | 3.1 pulgadas |
| **Ancho de diálogo** | ~3.5 pulgadas |
| **Líneas por página** | ~55 líneas |
| **Regla de tiempo** | 1 página ≈ 1 minuto |

---

## 📝 ELEMENTOS DEL GUIÓN (6 Fundamentales)

### 1. SCENE HEADING (Slugline)

**Formato:** `INT./EXT. LOCATION - TIME OF DAY`

**Componentes:**
```
┌─────────────────────────────────────────────────────────┐
│ INT. COFFEE SHOP - DAY                                  │
│ ───  ───────────   ───                                  │
│  │        │         └── Time: DAY/NIGHT/MORNING/etc.    │
│  │        └── Location: Nombre del lugar                │
│  └── Interior/Exterior: INT./EXT./INT./EXT.             │
└─────────────────────────────────────────────────────────┘
```

**Regex para detección:**
```regex
^(INT\.|EXT\.|INT\./EXT\.|I/E\.?)\s+(.+?)\s*[-–—]\s*(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DAWN|DUSK|LATER|CONTINUOUS|SAME|MOMENTS LATER)?\s*$
```

**Variaciones válidas:**
- `INT. HOUSE - DAY`
- `EXT. STREET - NIGHT`
- `INT./EXT. CAR (MOVING) - DAY`
- `INT. HOUSE - CONTINUOUS`
- `INT. HOUSE - LATER`
- `INT. HOUSE - SAME`

**Números de escena (Shooting Script):**
```
23  INT. COFFEE SHOP - DAY  23
```

### 2. ACTION (Description/Narrative)

**Características:**
- Escrito en PRESENTE ("John walks", no "John walked")
- Margen completo (izquierda a derecha)
- Describe lo que se VE y se OYE
- Sin emociones internas (a menos que se muestren)
- Párrafos cortos (3-4 líneas máximo)

**Ejemplo:**
```
John enters the coffee shop, scanning the room. His eyes 
land on SARAH (30s), sitting alone at a corner table. She 
doesn't look up from her phone.
```

**Patrones de detección:**
- Línea completa sin indentación especial
- Empieza con mayúscula, termina con punto
- Contiene verbos en presente
- NO es todo mayúsculas (excepto nombres de personajes nuevos)

**Introducción de personajes:**
- Primera aparición: NOMBRE EN MAYÚSCULAS
- Edad entre paréntesis: `SARAH (30s)`
- Descripción breve: `SARAH (30s, sharp eyes, nervous energy)`

### 3. CHARACTER CUE (Character Name)

**Formato:**
- TODO EN MAYÚSCULAS
- Centrado (3.7" desde margen izquierdo)
- Solo antes de diálogo

**Variaciones:**
```
JOHN
JOHN (V.O.)        ← Voice Over
JOHN (O.S.)        ← Off Screen
JOHN (O.C.)        ← Off Camera
JOHN (CONT'D)      ← Continued (mismo personaje, interrupción)
JOHN (PRE-LAP)     ← Audio antes de imagen
JOHN (INTO PHONE)  ← Hablando por teléfono
JOHN (FILTERED)    ← Voz distorsionada
```

**Regex para detección:**
```regex
^[A-Z][A-Z\s\.\-']+(?:\s*\((?:V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT|PRE-LAP|INTO PHONE|ON PHONE|FILTERED|OVER PHONE|ON TV|ON RADIO)\))?$
```

### 4. DIALOGUE

**Características:**
- Debajo del character cue
- Indentado (2.5" desde izquierda)
- Ancho limitado (~3.5")
- Sin comillas (a menos que cite algo)

**Ejemplo:**
```
                    JOHN
          I never thought I'd see you
          here. Of all places.
```

**Patrones de detección:**
- Sigue inmediatamente a un character cue
- Indentado significativamente
- Puede tener múltiples líneas
- Termina antes del siguiente elemento

### 5. PARENTHETICAL (Wryly)

**Formato:**
- Entre paréntesis
- Debajo del character cue, encima del diálogo
- O dentro del diálogo para pausas/cambios

**Ejemplos:**
```
                    JOHN
               (sarcastically)
          Oh, that's just great.
          
                    JOHN
          I never thought--
               (beat)
          --I'd see you here.
```

**Usos comunes:**
- `(beat)` - pausa
- `(to Sarah)` - dirigido a alguien
- `(whispering)` - tono
- `(continuing)` - continúa
- `(re: the letter)` - referencia a algo

### 6. TRANSITION

**Formato:**
- Alineado a la derecha
- Solo cuando es narrativamente necesario

**Tipos:**
```
                                        CUT TO:
                                        FADE OUT.
                                        FADE IN:
                                        DISSOLVE TO:
                                        SMASH CUT TO:
                                        MATCH CUT TO:
                                        JUMP CUT TO:
                                        TIME CUT:
                                        FADE TO BLACK.
```

**Nota:** En guiones modernos, las transiciones se usan poco. `CUT TO:` es implícito entre escenas.

---

## 🏗️ ESTRUCTURA NARRATIVA - SAVE THE CAT BEAT SHEET

### Los 15 Beats con Páginas Exactas (guión de 110 páginas)

| # | Beat | Páginas | % | Descripción |
|---|------|---------|---|-------------|
| 1 | **Opening Image** | 1 | 1% | Primera impresión visual del mundo/protagonista |
| 2 | **Theme Stated** | 5 | 5% | Alguien dice (sin saberlo) el tema de la película |
| 3 | **Set-Up** | 1-10 | 1-9% | Mundo ordinario, stasis, qué falta en la vida del protagonista |
| 4 | **Catalyst** | 12 | 11% | El evento que cambia todo (inciting incident) |
| 5 | **Debate** | 12-25 | 11-23% | ¿Debería hacerlo? Resistencia al cambio |
| 6 | **Break into Two** | 25 | 23% | Decisión activa de entrar al Acto 2 |
| 7 | **B Story** | 30 | 27% | Historia secundaria (generalmente amor/amistad) |
| 8 | **Fun and Games** | 30-55 | 27-50% | La "promesa del premise", lo que vinimos a ver |
| 9 | **Midpoint** | 55 | 50% | Falsa victoria o falsa derrota, stakes suben |
| 10 | **Bad Guys Close In** | 55-75 | 50-68% | Presión externa + problemas internos del equipo |
| 11 | **All Is Lost** | 75 | 68% | Lo opuesto al Midpoint, "muerte" simbólica |
| 12 | **Dark Night of the Soul** | 75-85 | 68-77% | Momento más bajo, reflexión |
| 13 | **Break into Three** | 85 | 77% | Solución encontrada, nueva determinación |
| 14 | **Finale** | 85-110 | 77-100% | Ejecución del plan, confrontación final |
| 15 | **Final Image** | 110 | 100% | Opuesto al Opening Image, muestra transformación |

### Estructura de 3 Actos con Beats

```
┌─────────────────────────────────────────────────────────────────────┐
│                           SCREENPLAY                                 │
├─────────────────┬───────────────────────────┬───────────────────────┤
│     ACT 1       │          ACT 2            │        ACT 3          │
│   (25 págs)     │        (50 págs)          │      (25 págs)        │
│    ~23%         │          ~50%             │        ~27%           │
├─────────────────┼─────────────┬─────────────┼───────────────────────┤
│ Setup           │ Fun & Games │ Bad Guys    │ Finale                │
│ Catalyst        │             │ Close In    │                       │
│ Debate          │             │ All Is Lost │                       │
│                 │             │ Dark Night  │                       │
├─────────────────┼─────────────┼─────────────┼───────────────────────┤
│     pág 25      │   pág 55    │   pág 75    │      pág 85           │
│  Break into 2   │  Midpoint   │  All Is Lost│   Break into 3        │
└─────────────────┴─────────────┴─────────────┴───────────────────────┘
```

---

## 🔬 ALGORITMO DE PARSING PROFESIONAL

### Paso 1: Clasificación de Líneas

Cada línea del guión se clasifica en una categoría:

| Tag | Tipo | Características |
|-----|------|-----------------|
| **H** | Scene Heading | Empieza con INT./EXT., contiene locación y tiempo |
| **A** | Action | Margen completo, presente, describe visual |
| **C** | Character Cue | Todo mayúsculas, <30 chars, centrado |
| **D** | Dialogue | Sigue a C, indentado, texto hablado |
| **P** | Parenthetical | Entre paréntesis, corto, instrucción de actuación |
| **T** | Transition | CUT TO:, FADE, etc., alineado derecha |
| **M** | Metadata | Títulos, créditos, notas de producción |

### Paso 2: Reglas de Detección

```javascript
function classifyLine(line, previousType, indentation) {
  const trimmed = line.trim();
  const indent = line.length - line.trimStart().length;
  
  // 1. SCENE HEADING
  if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.?)\s+/i.test(trimmed)) {
    return 'H';
  }
  
  // 2. TRANSITION
  if (/^(CUT TO:|FADE|DISSOLVE|SMASH CUT|MATCH CUT|JUMP CUT|TIME CUT)/.test(trimmed)) {
    return 'T';
  }
  
  // 3. PARENTHETICAL
  if (/^\([^)]+\)$/.test(trimmed) && trimmed.length < 50) {
    return 'P';
  }
  
  // 4. CHARACTER CUE
  if (isCharacterCue(trimmed)) {
    return 'C';
  }
  
  // 5. DIALOGUE (follows character cue or parenthetical)
  if ((previousType === 'C' || previousType === 'P' || previousType === 'D') && indent > 10) {
    return 'D';
  }
  
  // 6. ACTION (default)
  return 'A';
}

function isCharacterCue(text) {
  // Must be mostly uppercase
  if (text !== text.toUpperCase()) return false;
  
  // Must be short (< 40 chars typically)
  if (text.length > 50) return false;
  
  // Must not be a scene heading
  if (/^(INT\.|EXT\.)/.test(text)) return false;
  
  // Must not be a transition
  if (/^(CUT TO:|FADE|DISSOLVE)/.test(text)) return false;
  
  // Must not be common action words
  const excludeWords = ['THE', 'AND', 'BUT', 'CLOSE ON', 'ANGLE ON', 'CONTINUED'];
  if (excludeWords.some(w => text.startsWith(w))) return false;
  
  // Should match character name pattern
  return /^[A-Z][A-Z\s\.\-']+(?:\s*\([^)]*\))?$/.test(text);
}
```

### Paso 3: Extracción de Entidades

**Personajes:**
1. Todos los CHARACTER CUES únicos
2. Primera mención en ACTION (NOMBRE EN MAYÚSCULAS con descripción)
3. Frecuencia de aparición en diálogos
4. Escenas donde aparecen

**Localizaciones:**
1. Extraer de SCENE HEADINGS
2. Normalizar nombres (JOHN'S HOUSE = JOHN'S HOUSE)
3. Contar frecuencia
4. Clasificar INT/EXT

**Estructura:**
1. Contar páginas totales (líneas / 55)
2. Identificar beats por posición porcentual
3. Buscar marcadores de turning points en el texto

---

## 📊 MÉTRICAS DE VALIDACIÓN

### Benchmark de Guión Profesional

| Métrica | Rango Esperado | Notas |
|---------|----------------|-------|
| Páginas totales | 90-120 | Películas estándar |
| Escenas totales | 40-60 | ~2 escenas por minuto |
| Personajes con diálogo | 15-40 | Depende del género |
| Ratio INT/EXT | 50-70% INT | Varía por género |
| Ratio diálogo/acción | 40-60% | Varía por género |
| Longitud media escena | 1.5-3 páginas | ~90-180 segundos |
| Líneas de diálogo por personaje principal | 100-200+ | Protagonista domina |

### Por Género

| Género | INT/EXT | Diálogo/Acción | Escenas/min | Noche% |
|--------|---------|----------------|-------------|--------|
| Drama | 70%+ INT | 60%+ diálogo | 1-1.5 | 30% |
| Action | 50% INT | 30% diálogo | 2-3 | 40% |
| Comedy | 60% INT | 65%+ diálogo | 1.5-2 | 20% |
| Thriller | 60% INT | 45% diálogo | 2-2.5 | 50% |
| Horror | 65% INT | 35% diálogo | 2+ | 60%+ |

---

## 🔧 PROBLEMAS COMUNES DE PARSING

### 1. Texto mezclado sin formato
**Problema:** Guiones scraped pierden el formato original.
**Solución:** Usar heurísticas basadas en contenido, no en indentación.

### 2. Character cues con extensiones
**Problema:** `JOHN (V.O.)` vs `JOHN (CONT'D) (V.O.)`
**Solución:** Regex flexible que capture todas las variaciones.

### 3. Diálogo multi-línea
**Problema:** Diálogo largo que se extiende varias líneas.
**Solución:** Continuar capturando hasta el siguiente element.

### 4. Action con diálogo incrustado
**Problema:** `John smiles. "I knew you'd come."`
**Solución:** Detectar comillas dentro de action y extraer como diálogo implícito.

### 5. Nombres de personajes variables
**Problema:** `JOHN`, `JOHNNY`, `MR. SMITH` = mismo personaje
**Solución:** Crear alias map basado en contexto.

---

## 📚 REFERENCIAS

1. **The Hollywood Standard** - Christopher Riley
2. **Save the Cat** - Blake Snyder
3. **Final Draft Formatting Guide**
4. **ACL Paper: Parsing Screenplays for Extracting Social Networks**
5. **DHQ: Visualizing and Analyzing the Hollywood Screenplay with ScripThreads**

---

**SIGUIENTE PASO:** Implementar Parser V3 basado en esta especificación.
