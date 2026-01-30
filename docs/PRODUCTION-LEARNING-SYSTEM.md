# Sistema de Aprendizaje de Producción Cinematográfica

## 🎯 Objetivo

Crear una **base de conocimiento de producción** que permita:
1. Aprender de películas profesionales (de la colección personal)
2. Aplicar ese conocimiento al generar guiones con IA
3. Producir películas con IA sabiendo exactamente qué técnicas usar

---

## 📊 Qué Extraer de Cada Película

### 1. CINEMATOGRAFÍA
```yaml
camera_work:
  shots:
    - close_up: "frecuencia y uso emocional"
    - wide_shot: "establecimiento de escena"
    - medium: "diálogos"
    - pov: "inmersión"
    - over_shoulder: "conversaciones"
  movements:
    - dolly: "acercamientos dramáticos"
    - tracking: "seguimiento de personajes"
    - steadicam: "fluidez"
    - handheld: "tensión/documentalismo"
    - crane: "épico/establecimiento"
  lenses:
    - wide_angle: "distorsión, espacios"
    - telephoto: "compresión, intimidad"
    - anamorphic: "aspecto cinematográfico"
  aspect_ratio: "2.39:1, 1.85:1, etc."
```

### 2. ILUMINACIÓN
```yaml
lighting:
  style: "high_key | low_key | natural | stylized"
  contrast: "high | medium | low"
  color_temperature: "warm | cool | neutral"
  sources:
    - practical: "lámparas en escena"
    - natural: "ventanas, sol"
    - artificial: "spots, difusores"
  mood_by_scene_type:
    - dialogue: "soft, even"
    - action: "hard, contrasted"
    - romance: "warm, glowing"
```

### 3. DIRECCIÓN DE ARTE
```yaml
art_direction:
  color_palette:
    primary: ["#hex1", "#hex2"]
    mood: "desaturated | vibrant | monochromatic"
  locations:
    interior_ratio: 0.6
    exterior_ratio: 0.4
    types: ["urban", "nature", "studio"]
  period: "contemporary | period | futuristic"
  style: "realistic | stylized | noir | etc"
```

### 4. PERSONAJES Y VESTUARIO
```yaml
characters:
  protagonist:
    archetype: "hero | antihero | everyman"
    wardrobe_style: "descripción"
    color_association: "#color"
  antagonist:
    archetype: "villain | system | nature"
    wardrobe_style: "descripción"
  ensemble: true/false
```

### 5. ATMÓSFERA Y RITMO
```yaml
atmosphere:
  tone: "dark | light | mixed"
  pacing: "fast | slow | variable"
  music_usage: "constant | sparse | diegetic"
  silence_usage: "tension_builder | rare"
  editing_style: "quick_cuts | long_takes | mixed"
```

---

## 📁 Estructura de Output

```
cinema-study/
├── matches.json           # Guiones ↔ Películas
├── stats.json             # Estadísticas globales
│
├── cards/                 # Por película
│   └── {slug}/
│       ├── metadata.json      # Info básica + crew
│       ├── script-analysis.md # Estructura narrativa
│       ├── cinematography.md  # Planos, movimientos, lentes
│       ├── lighting.md        # Iluminación
│       ├── art-direction.md   # Paleta, localizaciones
│       └── production-bible.md # Resumen ejecutivo
│
├── patterns/              # Por género
│   ├── action.md
│   ├── drama.md
│   ├── thriller.md
│   ├── comedy.md
│   ├── scifi.md
│   └── horror.md
│
├── directors/             # Por director
│   ├── nolan.md
│   ├── villeneuve.md
│   ├── fincher.md
│   └── tarantino.md
│
└── INDEX.md               # Navegación principal
```

---

## 🔄 Flujo de Uso

### Input → LC Studio
```
Usuario: "Quiero hacer un thriller psicológico estilo Fincher"

Sistema consulta:
  - patterns/thriller.md
  - directors/fincher.md
  - cards/se7en/ , cards/gone-girl/ , etc.

Output: Guión con notas de dirección específicas:
  - "INT. APARTAMENTO - NOCHE"
  - [CINEMATOGRAFÍA: Low-key lighting, handheld sutil, paleta desaturada]
  - [PLANO: Wide establishing → slow push-in al protagonista]
```

### Generación de Película con IA
```
Escena del guión → Consultar production-bible.md de referencia
                 → Generar prompt para IA de video con:
                    - Tipo de plano
                    - Iluminación
                    - Paleta de colores
                    - Movimiento de cámara
```

---

## 🎬 Directores Prioritarios (por estilo distintivo)

1. **Christopher Nolan** - Escala épica, IMAX, narrativa no lineal
2. **Denis Villeneuve** - Atmósfera, ritmo lento, cinematografía
3. **David Fincher** - Precisión, oscuridad, thriller psicológico
4. **Quentin Tarantino** - Diálogos, violencia estilizada, referencias
5. **Wes Anderson** - Simetría, paletas específicas, whimsy
6. **Roger Deakins** (DP) - Iluminación natural, composición
7. **Emmanuel Lubezki** (DP) - Long takes, luz natural

---

## 📈 Métricas de Éxito

- [ ] >200 películas con ficha de producción
- [ ] Patrones definidos para 6+ géneros
- [ ] Perfiles de 10+ directores reconocidos
- [ ] Sistema consultable desde LC Studio
