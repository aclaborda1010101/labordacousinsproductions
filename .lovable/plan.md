
# Plan: Corregir Nombres de Columnas en compileScriptFromScenes

## Problema Identificado

El archivo `compileScriptFromScenes.ts` está usando nombres de columnas incorrectos para la tabla `scenes`:

**Error en consola:**
```
column scenes.episode_number does not exist
```

**Diferencia de esquema:**
| Tabla | Columna usada en código | Columna real en BD |
|-------|------------------------|-------------------|
| scenes | episode_number | episode_no |
| scenes | scene_number | scene_no |
| scripts | episode_number | episode_number ✓ |

Esto causa que el script se quede en un loop infinito de "Compilando guion..." porque nunca puede cargar las escenas.

---

## Solución

Corregir los nombres de las columnas en `compileScriptFromScenes.ts` para usar `episode_no` y `scene_no` cuando consulta la tabla `scenes`.

---

## Cambios Técnicos

### Archivo: `src/lib/compileScriptFromScenes.ts`

**Línea 42 - Filtro por episodio:**
```typescript
// ANTES:
.eq('episode_number', episodeNumber)

// DESPUÉS:
.eq('episode_no', episodeNumber)
```

**Línea 43 - Ordenar por número de escena:**
```typescript
// ANTES:
.order('scene_number', { ascending: true });

// DESPUÉS:
.order('scene_no', { ascending: true });
```

**Línea 77 - Mapeo de scene_number:**
```typescript
// ANTES:
scene_number: scene.scene_number,

// DESPUÉS:
scene_number: scene.scene_no,
```

**Línea 112 - Mapeo en parsed_json:**
```typescript
// ANTES:
scene_number: scene.scene_number,

// DESPUÉS:
scene_number: scene.scene_no,
```

---

## Verificación Adicional

Revisaré también si hay otras referencias a `scene_number` o `episode_number` en el archivo que deban actualizarse para mantener consistencia.

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/compileScriptFromScenes.ts` | Cambiar `episode_number` → `episode_no` y `scene_number` → `scene_no` para las consultas a la tabla `scenes` |

---

## Resultado Esperado

1. La consulta a `scenes` usará las columnas correctas (`episode_no`, `scene_no`)
2. El script se compilará correctamente
3. La pantalla de "Compilando guion..." mostrará el resumen completo del guion
4. El usuario podrá ver las escenas, personajes y opciones de exportación PDF
