
# Plan: Distribución de Setpieces por Protagonista para Películas Ensemble

## Concepto a Implementar

En películas corales (ensemble) con múltiples protagonistas (como "Reyes Magos" con Baltasar, Gaspar y Melchor), los setpieces deben distribuirse equitativamente para que **cada protagonista tenga su momento cinematográfico destacado**.

### Regla de Oro
```text
Si hay N protagonistas y M setpieces:
→ Cada protagonista debe liderar al menos ⌊M/N⌋ setpieces
→ Setpieces compartidos cuentan para ambos

Ejemplo: 3 protagonistas + 12 setpieces = 4 setpieces/protagonista mínimo
```

---

## Cambios Técnicos

### 1. Actualizar Schema del Setpiece

**Archivo**: `supabase/functions/generate-outline-direct/index.ts`

Modificar la estructura JSON del setpiece para incluir el protagonista que lo lidera:

```json
"setpieces": [
  {
    "name": "Nombre del setpiece",
    "act": "I | II | III",
    "protagonist_focus": "Nombre del protagonista que lidera este momento",
    "featured_characters": ["Nombre1", "Nombre2"],
    "description": "Descripción visual (50-100 palabras)",
    "stakes": "Qué está en juego"
  }
]
```

### 2. Añadir Instrucciones Específicas para Ensemble

En la sección del prompt (después de línea ~263), añadir reglas explícitas:

```text
### DISTRIBUCIÓN DE SETPIECES PARA PELÍCULAS CORAL/ENSEMBLE

CRÍTICO para películas con múltiples protagonistas:
- Contar cuántos personajes tienen role="protagonist"
- Distribuir los setpieces EQUITATIVAMENTE entre ellos
- Cada protagonista DEBE liderar al menos ${Math.ceil(minSetpieces / protagonistCount)} setpieces
- El campo "protagonist_focus" indica quién PROTAGONIZA ese momento
- "featured_characters" lista todos los personajes presentes

Ejemplo para 3 protagonistas (Baltasar, Gaspar, Melchor) con 12 setpieces:
- Baltasar lidera: 4 setpieces (setpieces 1, 4, 7, 10)
- Gaspar lidera: 4 setpieces (setpieces 2, 5, 8, 11)
- Melchor lidera: 4 setpieces (setpieces 3, 6, 9, 12)
```

### 3. Añadir Validación de Distribución

En la función `softValidate()`, añadir una verificación:

```typescript
// Check setpiece distribution for ensemble films
const protagonists = chars.filter((c: any) => 
  (c.role || '').toLowerCase() === 'protagonist'
);

if (protagonists.length > 1 && setpieces.length > 0) {
  const minPerProtagonist = Math.floor(setpieces.length / protagonists.length);
  
  // Count setpieces per protagonist
  const setpiecesByProtag: Record<string, number> = {};
  protagonists.forEach((p: any) => setpiecesByProtag[p.name] = 0);
  
  setpieces.forEach((sp: any) => {
    const focus = sp.protagonist_focus;
    if (focus && setpiecesByProtag.hasOwnProperty(focus)) {
      setpiecesByProtag[focus]++;
    }
  });
  
  // Warn if any protagonist has fewer than minimum
  for (const [name, count] of Object.entries(setpiecesByProtag)) {
    if (count < minPerProtagonist) {
      warnings.push({
        type: 'structure',
        message: `${name} solo tiene ${count} setpieces, debería tener mínimo ${minPerProtagonist}`,
        current: count,
        required: minPerProtagonist,
      });
      score -= 5;
    }
  }
}
```

### 4. Actualizar Frontend (DensityProfileSelector)

Añadir indicación visual de la distribución en películas ensemble:

```typescript
// En el tooltip o descripción del perfil Hollywood:
"12 setpieces (4 por protagonista en películas coral)"
```

---

## Flujo de Generación Actualizado

```text
┌─────────────────────────────────────────────────────────────┐
│  1. Usuario selecciona perfil "Hollywood"                   │
│     → 12 setpieces, 15 locations, 8 sequences               │
├─────────────────────────────────────────────────────────────┤
│  2. Sistema detecta múltiples protagonistas (3)             │
│     → Calcula: 12/3 = 4 setpieces por protagonista          │
├─────────────────────────────────────────────────────────────┤
│  3. Prompt incluye instrucciones de distribución            │
│     "Baltasar debe liderar 4 setpieces..."                  │
│     "Gaspar debe liderar 4 setpieces..."                    │
│     "Melchor debe liderar 4 setpieces..."                   │
├─────────────────────────────────────────────────────────────┤
│  4. Validación post-generación                              │
│     ✓ Total setpieces >= 12                                 │
│     ✓ Cada protagonista tiene >= 4                          │
│     ⚠ Warning si distribución desbalanceada                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/generate-outline-direct/index.ts` | Schema, prompt, validación |
| `src/components/project/DensityProfileSelector.tsx` | Descripción visual opcional |

## Resultado Esperado

El próximo outline generado incluirá:

```json
{
  "setpieces": [
    {
      "name": "La Transformación de Baltasar",
      "act": "I",
      "protagonist_focus": "Baltasar",
      "featured_characters": ["Baltasar", "Amara"],
      "description": "En el almacén vacío, Baltasar siente por primera vez el poder...",
      "stakes": "Su identidad como Rey Mago despierta"
    },
    {
      "name": "El Desafío del Pelirrojo",
      "act": "I", 
      "protagonist_focus": "Gaspar",
      "featured_characters": ["Gaspar", "Miguel"],
      "description": "En el bar, Gaspar enfrenta a los matones que lo humillaron...",
      "stakes": "Recuperar su dignidad después de años de bullying"
    }
    // ... 10 setpieces más distribuidos
  ]
}
```

---

## Beneficios

1. **Arcos Balanceados**: Cada protagonista tiene su momento de gloria
2. **Producción Clara**: El equipo sabe qué personaje lidera cada escena grande
3. **Validación Automática**: El sistema advierte si la distribución está desbalanceada
4. **Escalable**: Funciona para 2, 3, 4 o más protagonistas

