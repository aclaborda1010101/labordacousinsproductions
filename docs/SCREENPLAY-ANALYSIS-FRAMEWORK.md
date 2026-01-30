# 🎬 FRAMEWORK DE ANÁLISIS DE GUIONES - LC STUDIO

**Fecha:** 2026-01-29  
**Versión:** 1.0  
**Estado:** En desarrollo  
**Objetivo:** Construir RAG del Guionista Profesional

---

## 📋 RESUMEN EJECUTIVO

Análisis de 668 guiones profesionales de Hollywood para extraer patrones universales y crear un sistema de generación de guiones basado en conocimiento real.

**Filosofía:** Primero aprender de los profesionales, luego generar.

---

## 🔬 ANATOMÍA UNIVERSAL DE UN GUIÓN

### CAPA 1: FORMATO TÉCNICO (Obligatorio en todo guión)

| Elemento | Descripción | Regex/Patrón |
|----------|-------------|--------------|
| **Slugline** | INT/EXT, Locación, Tiempo | `^(INT\.|EXT\.|INT/EXT)` |
| **Action** | Descripción visual, beats | Texto sin formato especial |
| **Character Cue** | Nombre antes de diálogo | `^[A-Z][A-Z\s]+$` (mayúsculas) |
| **Dialogue** | Texto hablado | Indentado bajo character cue |
| **Parenthetical** | Indicaciones de actuación | `\(.*\)` |
| **Transition** | Cambios de escena | `CUT TO:`, `FADE OUT`, etc. |

### CAPA 2: ESTRUCTURA NARRATIVA (El esqueleto - Save the Cat)

| Punto Narrativo | Página Típica | % del Guión | Qué Buscar |
|-----------------|---------------|-------------|------------|
| Opening Image | 1 | 0-1% | Primera impresión visual del mundo |
| Setup/Ordinary World | 1-10 | 1-8% | Presentación protagonista y su mundo |
| Theme Stated | 5 | ~4% | Alguien dice el tema de la película |
| Catalyst/Inciting Incident | 12-15 | 10-12% | El evento que cambia todo |
| Debate/Refusal | 15-25 | 12-20% | Protagonista duda, mide consecuencias |
| Break into Act 2 | 25-30 | 20-25% | Decisión irreversible, cruza el umbral |
| B-Story | 30-35 | 25-29% | Subplot (romance, mentor, amistad) |
| Fun & Games | 35-55 | 29-46% | La promesa del premise/género |
| Midpoint | 55-60 | 46-50% | Falsa victoria o falsa derrota |
| Bad Guys Close In | 60-75 | 50-62% | Presión externa e interna aumenta |
| All Is Lost | 75-80 | 62-67% | Momento más bajo, "muerte" simbólica |
| Dark Night of Soul | 80-85 | 67-71% | Reflexión profunda, cambio interno |
| Break into Act 3 | 85-90 | 71-75% | Nueva determinación, plan final |
| Finale/Climax | 90-110 | 75-92% | Confrontación principal, resolución |
| Final Image | 110-120 | 92-100% | Imagen que contrasta con la apertura |

### CAPA 3: ENTIDADES A EXTRAER

| Entidad | Métricas | Importancia |
|---------|----------|-------------|
| **Personajes** | Nombre, primera aparición, # líneas, # escenas, arco | Crítica |
| **Localizaciones** | INT/EXT, nombre, frecuencia, escenas donde aparece | Alta |
| **Props** | Objetos mencionados 3+ veces | Media |
| **Tiempo** | DAY/NIGHT, saltos temporales | Alta |
| **Tono** | Palabras clave emocionales | Media |

### CAPA 4: MÉTRICAS CUANTITATIVAS

| Métrica | Cálculo | Uso |
|---------|---------|-----|
| Páginas totales | Líneas / 55 | Duración estimada |
| Duración (min) | Páginas × 1 | Runtime aproximado |
| Total escenas | Count sluglines | Ritmo narrativo |
| Ratio INT/EXT | INT / (INT + EXT) | Tipo de producción |
| Ratio diálogo/acción | Líneas diálogo / líneas acción | Estilo narrativo |
| Escenas por acto | [Act1, Act2, Act3] | Estructura |
| Longitud media escena | Total palabras / Total escenas | Ritmo |
| Personajes únicos | Count character cues únicos | Complejidad |
| Densidad de diálogo | Palabras diálogo / Palabras total | Estilo |

### CAPA 5: PATRONES POR GÉNERO

| Género | Patrones Esperados |
|--------|-------------------|
| **Thriller** | +EXT noche, escenas cortas (<2 pág), tensión creciente, protagonista en peligro |
| **Drama** | +Diálogo, escenas largas (2-4 pág), INT dominante, desarrollo personaje |
| **Comedy** | Ratio alto diálogo, estructura setup-punchline, timing rápido |
| **Action** | +EXT, mucha descripción de acción, menos diálogo, escenas de persecución |
| **Horror** | +Noche, aislamiento, buildup lento, gore/tensión en Act 3 |
| **Romance** | B-story es A-story, mucho diálogo, meet-cute en Act 1 |
| **Sci-Fi** | World-building en Setup, tecnología como plot device |

---

## 📊 DATOS DISPONIBLES

- **Fuente:** scripts-scraper/parsed/
- **Total guiones:** 668
- **Formato:** JSON con escenas parseadas
- **Estado actual:** Estructura básica, falta enriquecimiento

### Estructura actual de datos:

```json
{
  "slug": "joker-2019",
  "title": "joker",
  "genre": "comedy",  // ⚠️ Incorrecto - necesita reclasificación
  "format": "film",
  "scenes_count": 14,
  "characters_count": 0,  // ⚠️ No extraídos
  "characters": [],
  "total_words": 25433,
  "total_dialogue": 0,  // ⚠️ No separado
  "scenes": [
    {
      "scene_number": 1,
      "slugline": "INT. LOBBY...",
      "action_text": "...",  // ⚠️ Mezclado con diálogo
      "dialogue_count": 0,
      "word_count": 1200
    }
  ]
}
```

### Lo que necesitamos extraer:

```json
{
  "slug": "joker-2019",
  "title": "Joker",
  "year": 2019,
  "genre": "thriller_psychological",
  "format": "film",
  "runtime_estimated": 122,
  "pages_estimated": 122,
  
  "structure": {
    "act1_end_scene": 8,
    "midpoint_scene": 15,
    "act2_end_scene": 25,
    "inciting_incident_scene": 3,
    "climax_scene": 28
  },
  
  "metrics": {
    "total_scenes": 30,
    "int_ext_ratio": 0.7,
    "dialogue_action_ratio": 0.45,
    "avg_scene_length": 850,
    "unique_characters": 12,
    "unique_locations": 18
  },
  
  "characters": [
    {
      "name": "ARTHUR/JOKER",
      "type": "protagonist",
      "first_appearance": 1,
      "dialogue_lines": 245,
      "scenes_present": 28
    }
  ],
  
  "locations": [
    {
      "name": "MOM'S APARTMENT",
      "type": "INT",
      "frequency": 8
    }
  ],
  
  "scenes": [
    {
      "scene_number": 1,
      "slugline": "INT. LOBBY, APARTMENT BUILDING - EVENING",
      "location": "LOBBY, APARTMENT BUILDING",
      "time": "EVENING",
      "int_ext": "INT",
      "action_lines": [...],
      "dialogue": [
        {"character": "SOPHIE", "text": "..."},
        {"character": "JOKER", "text": "..."}
      ],
      "word_count": 1200,
      "page_estimate": 2.1
    }
  ]
}
```

---

## 🛠️ PLAN DE IMPLEMENTACIÓN

### FASE 1: Enriquecer Datos (Actual)
- [ ] Crear script de re-parsing con estructura completa
- [ ] Separar diálogo de acción
- [ ] Extraer personajes y líneas
- [ ] Detectar estructura de actos
- [ ] Calcular métricas

### FASE 2: Análisis de Patrones
- [ ] Estadísticas globales (668 guiones)
- [ ] Patrones por género
- [ ] Reglas de estructura
- [ ] Benchmarks de calidad

### FASE 3: RAG del Guionista
- [ ] Embeddings por escena
- [ ] Embeddings por acto
- [ ] Sistema de búsqueda semántica
- [ ] Pipeline de generación informada

---

## 📝 CHANGELOG

| Fecha | Cambio |
|-------|--------|
| 2026-01-29 | Creación del framework inicial |

---

**PRÓXIMO PASO:** Crear script de extracción enriquecida para los 668 guiones.
