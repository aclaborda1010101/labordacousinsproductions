
# Plan: Clonación Directa de Base de Datos

## Objetivo
Crear una herramienta de clonación simplificada que permita duplicar toda la base de datos actual a una nueva instancia de Supabase que el usuario proporcione, sin necesidad de comandos de terminal ni pasos manuales complejos.

## Problema Actual
El sistema de migración existente:
1. Genera un ZIP con archivos SQL que el usuario debe aplicar manualmente
2. Requiere conocimientos de `pg_dump`, `psql` y línea de comandos
3. Ha fallado previamente por límites de memoria (WORKER_LIMIT)

## Solución Propuesta
Un nuevo componente `DatabaseCloner` que:
1. Solicita la **URL de conexión de la nueva base de datos** (proporcionada por el usuario desde su dashboard de Supabase)
2. Ejecuta la clonación directamente desde una Edge Function usando conexión directa PostgreSQL
3. Muestra progreso en tiempo real

## Flujo de Usuario

```text
┌─────────────────────────────────────┐
│   Configuración del Proyecto        │
│                                     │
│   [Backup/Migración]                │
│   ┌───────────────────────────────┐ │
│   │ 📦 Exportar ZIP (actual)      │ │
│   └───────────────────────────────┘ │
│                                     │
│   ┌───────────────────────────────┐ │
│   │ 🔄 Clonar a Nueva DB          │ │  <-- NUEVO
│   │                               │ │
│   │ URL de destino:               │ │
│   │ [postgres://user:pass@...]    │ │
│   │                               │ │
│   │ [x] Incluir datos             │ │
│   │ [x] Incluir storage (URLs)    │ │
│   │                               │ │
│   │ [🚀 Iniciar Clonación]        │ │
│   │                               │ │
│   │ Progreso:                     │ │
│   │ ████████████░░░░ 75%          │ │
│   │ Copiando: characters (45/120) │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Arquitectura Técnica

### 1. Nuevo Componente: `src/components/project/DatabaseCloner.tsx`

Responsabilidades:
- Formulario para capturar URL de destino
- Validación de formato de URL PostgreSQL
- Opciones de clonación (datos, storage)
- Barra de progreso con polling al Edge Function
- Manejo de errores y reintentos

### 2. Nueva Edge Function: `supabase/functions/clone-database/index.ts`

Responsabilidades:
- Recibir URL de destino (encriptada en memoria, nunca persistida)
- Conectar a la BD origen usando `SUPABASE_DB_URL` 
- Conectar a la BD destino usando URL proporcionada
- Ejecutar clonación en fases:
  1. **Crear enums** - Tipos personalizados
  2. **Crear tablas** - Schema completo
  3. **Copiar datos** - INSERT por chunks
  4. **Crear funciones** - Funciones SQL
  5. **Crear policies** - RLS

Dependencias:
```typescript
import postgres from "https://deno.land/x/postgresjs@v3.4.3/mod.js";
```

### 3. Modificar: `src/components/project/ProjectSettings.tsx`

Agregar el nuevo componente `DatabaseCloner` en la sección "Backup / Migración" junto al `MigrationExport` existente.

## Estructura de la Edge Function

```typescript
// supabase/functions/clone-database/index.ts

// Fases de clonación
const PHASES = [
  { id: 'connect', label: 'Conectando...' },
  { id: 'schema', label: 'Creando schema...' },
  { id: 'data', label: 'Copiando datos...' },
  { id: 'functions', label: 'Creando funciones...' },
  { id: 'policies', label: 'Aplicando RLS...' },
  { id: 'done', label: 'Completado' }
];

// Acciones disponibles
// action: 'start' -> Inicia clonación, devuelve jobId
// action: 'status' -> Consulta progreso por jobId
// action: 'cancel' -> Cancela clonación en progreso
```

## Seguridad

1. **URL de destino nunca se guarda** - Solo en memoria durante la ejecución
2. **Validación de propiedad** - Usuario debe estar autenticado
3. **Rate limiting** - Máximo 1 clonación activa por usuario
4. **Timeout** - 10 minutos máximo de ejecución
5. **Logs mínimos** - No se loguean credenciales

## Manejo de Tablas Grandes

Para evitar WORKER_LIMIT:
- Chunking de 100 registros por INSERT
- Delay de 100ms entre chunks
- Tablas grandes (scripts, generation_blocks) usan chunks de 1 registro
- Timeout por tabla de 60 segundos

## Archivos a Crear

| Archivo | Descripción |
|---------|-------------|
| `src/components/project/DatabaseCloner.tsx` | Componente UI para clonación |
| `supabase/functions/clone-database/index.ts` | Edge Function que ejecuta la clonación |

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/project/ProjectSettings.tsx` | Agregar DatabaseCloner debajo de MigrationExport |

## Componente DatabaseCloner - Estructura UI

```tsx
<Card>
  <CardHeader>
    <CardTitle>🔄 Clonar a Nueva Base de Datos</CardTitle>
    <CardDescription>
      Duplica toda la base de datos a otro proyecto Supabase
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* Input para URL de destino */}
    <Input 
      type="password" 
      placeholder="postgres://postgres:PASSWORD@db.XXX.supabase.co:5432/postgres"
    />
    
    {/* Opciones */}
    <Checkbox> Incluir todos los datos</Checkbox>
    <Checkbox> Actualizar URLs de storage</Checkbox>
    
    {/* Progreso */}
    <Progress value={progress} />
    <p>{currentTable} ({currentRow}/{totalRows})</p>
    
    {/* Acción */}
    <Button>🚀 Iniciar Clonación</Button>
  </CardContent>
</Card>
```

## Edge Function - Flujo de Clonación

```text
1. Validar autenticación
2. Validar formato URL destino
3. Conectar a origen (SUPABASE_DB_URL)
4. Conectar a destino (URL proporcionada)
5. Crear job_id para tracking

6. FASE 1: Schema
   - Ejecutar cada archivo de migrations/*.sql en orden
   - O usar queries de información_schema para extraer y recrear

7. FASE 2: Datos
   Para cada tabla en ALL_TABLES:
     - SELECT * FROM tabla (chunks de 100)
     - INSERT INTO destino.tabla VALUES (...)
     - Reportar progreso

8. FASE 3: Funciones
   - Extraer definiciones de pg_proc
   - Crear en destino

9. FASE 4: Policies (opcional - pueden fallar si ya existen)
   - Extraer de pg_policies
   - Crear en destino

10. Cerrar conexiones
11. Marcar job como completado
```

## Instrucciones para el Usuario

Al usar la herramienta, el usuario debe:

1. **Crear un proyecto vacío en Supabase** (supabase.com)
2. **Obtener la URL de conexión**:
   - Dashboard → Settings → Database → Connection string → URI
   - Ejemplo: `postgres://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres`
3. **Pegar la URL** en el campo de la herramienta
4. **Esperar** a que la clonación termine (5-15 minutos según tamaño)
5. **Configurar secretos** manualmente en el nuevo proyecto
6. **Desplegar Edge Functions** con Supabase CLI

## Limitaciones Conocidas

1. **Edge Functions no se clonan** - Deben desplegarse por separado
2. **Secretos no se clonan** - Deben configurarse manualmente
3. **Storage files** - Solo se actualiza la URL base, los archivos deben descargarse por separado
4. **RLS policies** - Pueden requerir ajustes si hay referencias a auth.uid()

## Beneficios

- **Sin comandos de terminal** - Todo desde la UI
- **Progreso visible** - Saber exactamente qué se está copiando
- **Resistente a errores** - Reintenta automáticamente
- **Seguro** - Credenciales nunca se guardan
