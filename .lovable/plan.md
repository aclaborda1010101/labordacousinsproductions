
# Plan: Regenerar Script con Expansión de Escenas

## Estado Actual del Proyecto

| Aspecto | Valor Actual | Objetivo |
|---------|-------------|----------|
| Beats narrativos | 34 (8+15+11 por acto) | - |
| Escenas en BD | 5-6 | 25-35 |
| Duración objetivo | 85 min | 85 min |
| Set pieces | 5 definidos | 5 |

## Flujo de Regeneración

El sistema ya tiene todo implementado. El proceso será:

```text
[Wizard Paso 4: Confirmar]
        ↓
   Validación de densidad detecta 5 escenas < 25 mínimo
        ↓
   Botón "Expandir a 25-35 Escenas" visible
        ↓
   Invocar expand-beats-to-scenes (34 beats → 28-35 escenas)
        ↓
   outline_json.episode_beats actualizado
        ↓
[Wizard Paso 5: GENERAR]
        ↓
   narrative-decide planifica 28-35 jobs
        ↓
   scene-worker escribe cada escena
        ↓
   compileScriptFromScenes genera script final
```

## Acción Requerida

Navega al **Pre-Script Wizard** desde la vista de Script:

1. **Abre el Wizard** (botón "Preparar Guion" o similar)
2. **Avanza hasta el paso "Confirmar"** (paso 4)
3. **Verás el warning de densidad insuficiente** con el botón amarillo
4. **Haz clic en "Expandir a 25-35 Escenas"**
5. **Una vez expandido**, el botón "Iniciar Generación" se habilitará
6. **Ejecuta la generación** para escribir las 28-35 escenas

## Resultado Esperado

- **34 beats** se transformarán en **~30 escenas** con sluglines únicos
- El script final tendrá **60-80KB** en lugar de 20KB
- Duración promedio por escena: **2.5-3 minutos** (realista para cine)
- Los 5 set pieces se distribuirán correctamente en las escenas expandidas

## Notas Técnicas

- La función `expand-beats-to-scenes` ya está deployeada
- El hook `useSceneDensityValidation` maneja la lógica de UI
- La validación ocurre automáticamente en el paso "Showrunner" → "Confirmar"
- Si el proyecto ya tiene escenas en la tabla `scenes`, se reemplazarán con las nuevas
