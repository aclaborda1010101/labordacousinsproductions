
# Plan: Corregir Clonación de Base de Datos

## Problemas Identificados

### Problema 1: Caracteres especiales en contraseña
Tu contraseña contiene `!!!!!!` que necesitan ser URL-encoded como `%21%21%21%21%21%21`. La librería `postgres.js` no está manejando correctamente estos caracteres especiales.

### Problema 2: "Job not found" por cold starts
La Edge Function almacena los jobs en memoria (`Map`). Cuando la función se reinicia (cold start), se pierde el estado y el frontend recibe "Job not found".

## Solución Propuesta

### Cambio 1: Codificar automáticamente la contraseña en la URL

Modificar el Edge Function para parsear la URL, extraer la contraseña, codificarla correctamente, y reconstruir la URL:

```typescript
// En clone-database/index.ts, después de validar la URL
const url = new URL(targetUrl);

// Extraer y re-codificar la contraseña (puede tener caracteres especiales)
if (url.password) {
  // Decodificar primero (por si ya viene parcialmente codificada)
  const decodedPassword = decodeURIComponent(url.password);
  // Re-codificar correctamente
  url.password = encodeURIComponent(decodedPassword);
}

// Usar la URL limpia
const cleanTargetUrl = url.toString();
```

### Cambio 2: Manejo de errores mejorado para cold starts

Cuando el job no se encuentra, en lugar de solo retornar error, agregar información útil:

```typescript
if (action === "status") {
  const job = activeJobs.get(jobId);
  if (!job) {
    return new Response(
      JSON.stringify({ 
        error: "Job not found - la función pudo haberse reiniciado", 
        progress: { 
          phase: 'error', 
          current: 0,
          total: 0,
          currentItem: '',
          error: 'Sesión expirada. Por favor intenta de nuevo.' 
        } 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  // ...
}
```

### Cambio 3: Mejorar el mensaje de error de autenticación

Detectar específicamente el error `28P01` (authentication failed) y mostrar un mensaje más claro:

```typescript
} catch (err: any) {
  console.error("Clone error:", err);
  
  let errorMessage = err.message || "Error desconocido";
  
  // Detectar errores comunes
  if (err.code === '28P01') {
    errorMessage = "Error de autenticación: verifica que la contraseña sea correcta. " +
      "Si contiene caracteres especiales (!, @, #, etc.), intenta cambiarla por una más simple.";
  }
  
  job.phase = 'error';
  job.error = errorMessage;
}
```

## Cambios en Frontend

### Cambio 4: Validación y ayuda en DatabaseCloner.tsx

Agregar advertencia cuando la URL contiene caracteres especiales no codificados:

```typescript
// Detectar caracteres problemáticos en la contraseña
const hasSpecialChars = (url: string): boolean => {
  const match = url.match(/:([^@]+)@/);
  if (match) {
    const password = match[1];
    return /[!@#$%^&*()+=\[\]{}|;':",.<>?/\\]/.test(password);
  }
  return false;
};

// En el UI, mostrar advertencia
{targetUrl && hasSpecialChars(targetUrl) && (
  <p className="text-xs text-yellow-600">
    ⚠️ La contraseña contiene caracteres especiales. Si hay errores de conexión, 
    considera cambiar la contraseña en Supabase a una sin caracteres especiales.
  </p>
)}
```

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/clone-database/index.ts` | Codificar contraseña, mejorar mensajes de error |
| `src/components/project/DatabaseCloner.tsx` | Agregar advertencia para caracteres especiales |

## Solución Alternativa Inmediata

Mientras implementamos los cambios, puedes:

1. Ir al dashboard de Supabase del proyecto destino
2. Settings → Database → Reset database password
3. Usar una contraseña simple sin caracteres especiales (ej: `Bosco2305AbcXyz`)
4. Actualizar la URL con la nueva contraseña

## Flujo de Error Mejorado

```text
Usuario ingresa URL con contraseña "Bosco2305!!!!!!"
                    ↓
Edge Function detecta caracteres especiales
                    ↓
Codifica automáticamente: "Bosco2305%21%21%21%21%21%21"
                    ↓
Intenta conexión con URL limpia
                    ↓
Si falla → Mensaje claro: "Error de autenticación..."
```
