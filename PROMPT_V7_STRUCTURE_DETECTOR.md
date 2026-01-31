# 🎬 PROMPT V7 - STRUCTURE DETECTOR

## 🚨 PROBLEMA IDENTIFICADO
**Sistema actual:** Detecta entidades pero NO estructura dramática
**Resultado:** "12 Years a Slave" = 1 acto (debería ser 3 actos)

## 🔧 SOLUCIÓN: NUEVO PROMPT PRE-EXTRACCIÓN

### **PHASE 0: STRUCTURE ANALYZER** 
*Ejecutar ANTES del chunk extractor*

```typescript
const STRUCTURE_ANALYZER_PROMPT = {
  system: `Eres un analista de estructura cinematográfica profesional.

TU ÚNICO TRABAJO: Detectar la estructura de 3 actos en guiones de largometraje.

REGLAS DURAS:
- SIEMPRE busca 3 actos (setup, confrontation, resolution)
- Identifica puntos clave: inciting incident, midpoint, climax
- Para cada acto: % aproximado de páginas y escenas clave
- SI no encuentras 3 actos claros = FLAG como "estructura atípica"`,

  buildUserPrompt: (scriptText: string) => `GUIÓN COMPLETO:
${scriptText.slice(0, 20000)} [... TRUNCATED FOR ANALYSIS ...]

TAREA:
Analiza SOLO la estructura dramática. NO extraigas personajes ni localizaciones.

BUSCA:
1. **ACTO I** (páginas 1-25): Setup, mundo ordinario, inciting incident
2. **ACTO II** (páginas 25-75): Confrontación, obstacles, midpoint  
3. **ACTO III** (páginas 75-final): Clímax, resolución

IDENTIFICA puntos clave:
- **Page 10-15**: Inciting incident (evento que lanza la historia)
- **Page 25**: Plot point 1 (entrada al acto II) 
- **Page 50**: Midpoint (gran revelación o giro)
- **Page 75**: Plot point 2 (entrada al acto III)
- **Page 90+**: Climax

SALIDA (JSON ESTRICTO):
{
  "structure_detected": true|false,
  "total_pages_estimated": 0,
  "acts": [
    {
      "act": "I|II|III",
      "pages_start": 0,
      "pages_end": 0, 
      "scenes_start": 0,
      "scenes_end": 0,
      "function": "setup|confrontation|resolution",
      "key_events": ["event1", "event2"]
    }
  ],
  "structure_points": {
    "inciting_incident": {"page": 0, "description": ""},
    "plot_point_1": {"page": 0, "description": ""},
    "midpoint": {"page": 0, "description": ""},
    "plot_point_2": {"page": 0, "description": ""},
    "climax": {"page": 0, "description": ""}
  },
  "confidence": "high|medium|low",
  "anomalies": ["issue1", "issue2"]
}`
};
```

### **INTEGRATION POINT:**
```typescript
// En script-breakdown/index.ts
async function analyzeScript(text: string) {
  // 1. NUEVO: Structure detection primero
  const structure = await analyzeStructure(text);
  
  // 2. Si structure.confidence === 'low' → AUTO-RETRY con GPT-5
  if (structure.confidence === 'low') {
    structure = await analyzeStructure(text, { model: 'gpt-5' });
  }
  
  // 3. Usar estructura para guiar chunk extraction
  const chunks = createIntelligentChunks(text, structure.acts);
  
  // 4. Proceder con extracción normal
  return extractEntities(chunks, structure);
}
```

## 🎯 **CRITERIOS QC MEJORADOS:**

### **Auto-escalación triggers:**
- `acts.length < 2` → Re-analyze con GPT-5
- `confidence === 'low'` → Re-analyze con GPT-5  
- `total_pages_estimated < 80` para largometraje → Warning
- `structure_detected === false` → Human review

### **Mejoras específicas para "12 Years a Slave":**
```json
{
  "structure_detected": true,
  "acts": [
    {"act": "I", "function": "setup", "scenes_start": 1, "scenes_end": 25},
    {"act": "II", "function": "confrontation", "scenes_start": 26, "scenes_end": 105},
    {"act": "III", "function": "resolution", "scenes_start": 106, "scenes_end": 132}
  ],
  "structure_points": {
    "inciting_incident": {"description": "Solomon es secuestrado"},
    "midpoint": {"description": "Intento de escape fallido"}
  }
}
```

## ⚡ **IMPLEMENTACIÓN PRIORITY:**

1. **IMMEDIATE**: Añadir structure analyzer como paso 0
2. **QC**: Auto-escalación basada en confidence
3. **UX**: No mostrar resultados de baja calidad
4. **TESTING**: Validar con "12 Years a Slave" y otros classics

## 📊 **ÉXITO ESPERADO:**
- **Antes**: 1 acto detectado
- **Después**: 3 actos + puntos estructurales clave
- **Confidence**: High para guiones profesionales

---
**¿Colaboras con Jarvis Win para implementar esto?** 🚀