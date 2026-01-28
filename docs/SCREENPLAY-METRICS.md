# 📊 Métricas de Guiones - Referencia Canónica

## Métricas por Género (basado en análisis de 525+ guiones)

### Película 90 minutos

| Género | Escenas | Págs/escena | Ritmo |
|--------|---------|-------------|-------|
| Comedia rápida (Superbad, Hangover) | 100-140 | 0.7-0.9 | Frenético |
| Comedia estándar (Juno, Lady Bird) | 70-95 | 1.0-1.3 | Ágil |
| Comedia dramática (Little Miss Sunshine) | 60-80 | 1.1-1.5 | Medio |
| Comedia ensemble (3+ protagonistas) | 80-100 | 0.9-1.1 | Medio-alto |
| Drama puro | 50-70 | 1.3-1.8 | Lento |
| Thriller | 55-75 | 1.2-1.4 | Tenso |
| Acción | 80-120 | 0.8-1.0 | Rápido |

### Guiones Analizados (muestra)

| Guión | Escenas | Páginas | Ritmo (págs/escena) |
|-------|---------|---------|---------------------|
| Top Gun: Maverick | 379 | ~140 | 0.37 |
| Aliens (Cameron) | 197 | 158 | 0.80 |
| Austin Powers 1 | 132 | 137 | 1.04 |
| Austin Powers 2 | 109 | 126 | 1.16 |
| As Good As It Gets | 120 | 142 | 1.18 |
| Amadeus | 174 | 222 | 1.28 |
| The Abyss | 243 | 147 | 0.60 |

## Estructura de Actos

### Película Estándar (3 actos)
- **Acto I** (25%): ~25-30 escenas - Setup, presentación de protagonistas
- **Acto IIA** (25%): ~25-30 escenas - Confrontación inicial
- **Acto IIB** (25%): ~20-25 escenas - Escalada, punto medio
- **Acto III** (25%): ~10-15 escenas - Resolución

### Para "La Noche de Reyes" (comedia social, 3 protas)
- **Target:** 80-100 escenas
- **Personajes:** 3 protagonistas + antagonista + 6-8 secundarios
- **Localizaciones:** 10-15 variadas
- **Ritmo:** Medio-alto (comedia con drama)

## Tiers de Calidad

| Tier | Modelo | Uso |
|------|--------|-----|
| **Hollywood** | Claude Opus 4 | Máxima calidad, solo Opus |
| **Profesional** | Opus + Gemini Flash | Balance calidad/coste |
| **Rápido** | Gemini Flash | Borradores, MVPs |

## Densidad por Formato

```typescript
// En screenplay-standards.ts
film_comedy: { minScenes: 80, maxScenes: 100 }
film_comedy_ensemble: { minScenes: 90, maxScenes: 120 }
film_drama: { minScenes: 38, maxScenes: 50 }
film_thriller: { minScenes: 40, maxScenes: 55 }
```

---
Última actualización: 2026-01-28
