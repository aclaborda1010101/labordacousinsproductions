# 📊 LC STUDIO - ESTADO DEL PROYECTO

**Última actualización:** 2026-01-29 21:11  
**Responsables:** Jarvis (Win) + Potus (Mac)

---

## 🎯 OBJETIVO ACTUAL

Construir el **RAG del Guionista Profesional** - Sistema que aprende de 668 guiones de Hollywood antes de generar.

---

## 📍 PROGRESO

### ✅ COMPLETADO

1. **Pipeline básico de generación**
   - Idea → Outline → Script → Storyboard
   - Funciones Supabase desplegadas

2. **Scraping de guiones**
   - 668 guiones parseados
   - Estructura JSON básica
   - Almacenados en `scripts-scraper/parsed/`

3. **Framework de análisis definido**
   - 5 capas de extracción documentadas
   - Métricas cuantitativas definidas
   - Patrones por género identificados
   - Doc: `docs/SCREENPLAY-ANALYSIS-FRAMEWORK.md`

### ✅ COMPLETADO (FASE 1)

1. **V4 - Extracción básica** (Potus)
   - 525 guiones procesados
   - 100% con personajes y diálogos
   - Métricas: escenas, diálogos, palabras, INT/EXT ratios

2. **V5 - Primera iteración** (Jarvis)
   - Limpieza de falsos positivos (ON, INTO, FINAL, etc.)
   - Corrección de géneros por lista
   - ❌ Limitación: géneros por lista, no por contenido

3. **V6 - Clasificación por contenido** (Jarvis)
   - ❌ Falló: no tenía acceso al texto raw

4. **V6b - Reglas de desempate** (Jarvis)
   - ✅ Géneros corregidos con reglas globales:
     - R1: thriller >50 descalifica comedy (Joker: comedy→thriller)
     - R1c: action no dominante → drama (Room, Spotlight)
     - R2: comedy/drama empatados → drama (Whiplash, Her, Birdman)
   - ❌ Limitación: protagonista solo por diálogos

5. **V6c - Heurísticas de guionista** (Jarvis) ✅ ACTUAL
   - Usa `parsed/` para texto de escenas + `enriched-v4/` para stats
   - Detecta protagonista por señales de guionista:
     - ¿Aparece en primera escena?
     - ¿Aparece en última escena?
     - ¿Aparece en turning points?
   - ✅ Whiplash: FLETCHER→ANDREW (corregido)
   - ✅ 8/10 casos de prueba correctos
   - ⚠️ Limitación conocida: películas ensemble (The Big Short)

### 📊 RESULTADOS V6c (10 películas test)

| Película | Género | Protagonista | Señales |
|----------|--------|--------------|---------|
| Joker | thriller ✅ | JOKER ✅ | 1st+Last+TP |
| La La Land | romance ✅ | SEBASTIAN | 1st+TP |
| Top Gun Maverick | action ✅ | MAVERICK ✅ | 1st+Last+TP |
| Whiplash | drama ✅ | ANDREW ✅ | 1st+Last+TP |
| Birdman | drama ✅ | RIGGAN ✅ | 1st+TP |
| The Big Short | comedy ⚠️ | BUFF ❌ | ensemble |
| Her | drama ✅ | THEODORE ✅ | 1st+TP |
| Room | drama ✅ | JACK ✅ | 1st+Last+TP |
| Spotlight | drama ✅ | ROBBY ⚠️ | ensemble |
| Wolf of Wall Street | drama ✅ | JORDAN ✅ | 1st+Last+TP |

### 🔄 EN PROGRESO

1. **Detección de películas ensemble** (V7)
2. **Refinamiento de géneros** (The Big Short no debería ser comedy)

### ⏳ PENDIENTE

1. **Análisis de patrones** (FASE 2)
2. **Construcción del RAG** (FASE 3)
3. **Integración con LC Studio** (FASE 4)

---

## 🐛 PROBLEMAS CONOCIDOS

| Problema | Estado | Prioridad |
|----------|--------|-----------|
| Storyboard sale tipo cómic | Pendiente | Media |
| Géneros mal clasificados | En el enriquecimiento | Alta |
| Personajes no extraídos | En el enriquecimiento | Alta |
| Diálogo mezclado con acción | En el enriquecimiento | Alta |

---

## 📁 ESTRUCTURA DE DOCUMENTACIÓN

```
docs/
├── PROJECT-STATUS.md          (este archivo)
├── SCREENPLAY-ANALYSIS-FRAMEWORK.md  (framework de análisis)
└── ... (futuros docs)
```

---

## 🔑 DECISIONES TÉCNICAS

| Fecha | Decisión | Razón |
|-------|----------|-------|
| 2026-01-29 | RAG antes de generación | Aprender de profesionales antes de crear |
| 2026-01-29 | 668 guiones suficiente para V1 | Masa crítica para patrones, escalar después |
| 2026-01-29 | Estructura de 5 capas | Análisis quirúrgico: formato → estructura → entidades → métricas → género |

---

## 📈 MÉTRICAS DEL PROYECTO

- **Guiones disponibles:** 668
- **Guiones V4 (extracción):** 525 ✅
- **Guiones V5 (narrativa):** 525 ✅
- **Géneros corregidos:** 86
- **Falsos positivos eliminados:** 2,918
- **Patrones extraídos:** En progreso
- **RAG operativo:** No

---

## 👥 CHANGELOG

| Fecha | Autor | Cambio |
|-------|-------|--------|
| 2026-01-29 | Jarvis | Creación del framework de análisis |
| 2026-01-29 | Jarvis | Documentación inicial del proyecto |
| 2026-01-29 | Potus | V4 completado - 525 guiones extraídos |
| 2026-01-29 | Jarvis | V5 - Primera iteración de inteligencia narrativa |
| 2026-01-29 | Jarvis | V6 - Intento de clasificación por contenido (fallido) |
| 2026-01-29 | Jarvis | V6b - Reglas de desempate para géneros (Joker→thriller) |
| 2026-01-29 | Jarvis | V6c - Heurísticas de guionista (Whiplash: ANDREW correcto) |
| 2026-01-29 | Jarvis | 173 géneros corregidos, 8/10 protagonistas correctos |
