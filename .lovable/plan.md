
# Plan: Mejoras en Ventana de Configuración y Verificación de Clonación

## Resumen de Cambios Solicitados

El usuario ha identificado dos mejoras necesarias:

1. **Ventana de ajustes más pequeña con scroll** - La ventana de configuración actual es muy alta y no cabe completamente en pantalla
2. **Verificación post-clonación** - Después de clonar, verificar que los datos se copiaron correctamente comparando conteos de tablas entre origen y destino

## Cambios Propuestos

### 1. Modificar `src/components/project/ProjectSettings.tsx`

**Problema actual:** El `DialogContent` tiene `max-w-md` pero no tiene altura máxima ni scroll, lo que hace que el contenido se desborde en pantallas pequeñas.

**Solución:**
- Agregar altura máxima al diálogo: `max-h-[85vh]`
- Envolver el contenido interno en un `ScrollArea` para habilitar scroll vertical
- Mantener el header y footer fijos, solo el contenido hace scroll

```tsx
// Antes
<DialogContent className="max-w-md">

// Después
<DialogContent className="max-w-md max-h-[85vh] flex flex-col">
  <DialogHeader>...</DialogHeader>
  <ScrollArea className="flex-1 pr-4">
    <div className="space-y-4 py-4">
      {/* contenido existente */}
    </div>
  </ScrollArea>
  <DialogFooter>...</DialogFooter>
</DialogContent>
```

### 2. Modificar `src/components/project/DatabaseCloner.tsx`

**Mejoras:**
- Agregar una nueva fase `verification` después de `policies`
- Mostrar resultados de verificación al completar
- Indicar si hay discrepancias en los conteos

**Nuevo tipo de fase:**
```typescript
export type ClonePhase = 
  | 'idle' 
  | 'connecting' 
  | 'enums' 
  | 'schema' 
  | 'data' 
  | 'functions' 
  | 'policies' 
  | 'verification'  // <-- NUEVO
  | 'done' 
  | 'error';
```

**Nuevo estado para resultados de verificación:**
```typescript
interface VerificationResult {
  table: string;
  sourceCount: number;
  targetCount: number;
  match: boolean;
}

const [verificationResults, setVerificationResults] = useState<VerificationResult[]>([]);
```

**Mostrar resultados de verificación:**
```tsx
{progress.phase === 'done' && verificationResults.length > 0 && (
  <div className="space-y-2">
    <h5 className="text-sm font-medium">Verificación de datos:</h5>
    <div className="max-h-32 overflow-auto text-xs space-y-1">
      {verificationResults.map(v => (
        <div key={v.table} className="flex justify-between">
          <span>{v.table}</span>
          <span className={v.match ? 'text-green-500' : 'text-red-500'}>
            {v.sourceCount} → {v.targetCount} {v.match ? '✓' : '✗'}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

### 3. Modificar `supabase/functions/clone-database/index.ts`

**Agregar fase de verificación después de policies:**

```typescript
// Después de Phase: Policies...

// Phase: Verification
job.phase = 'verification';
job.currentItem = 'Verificando integridad de datos...';

const verificationResults: { table: string; sourceCount: number; targetCount: number; match: boolean }[] = [];

for (const tableName of TABLES_ORDER) {
  if (job.cancelled) return cleanup();
  
  try {
    // Contar en origen
    const sourceResult = await sourceDb.unsafe(`SELECT COUNT(*) as count FROM public."${tableName}"`);
    const sourceCount = parseInt(sourceResult[0]?.count || '0');
    
    // Contar en destino
    const targetResult = await targetDb.unsafe(`SELECT COUNT(*) as count FROM public."${tableName}"`);
    const targetCount = parseInt(targetResult[0]?.count || '0');
    
    verificationResults.push({
      table: tableName,
      sourceCount,
      targetCount,
      match: sourceCount === targetCount
    });
    
    job.currentItem = `Verificando: ${tableName} (${sourceCount} → ${targetCount})`;
  } catch {
    // Tabla puede no existir en uno de los lados
  }
}

// Almacenar resultados en job para el status
job.verification = verificationResults;
job.verificationPassed = verificationResults.every(v => v.match);
```

**Actualizar estructura del job:**
```typescript
const activeJobs = new Map<string, {
  phase: string;
  current: number;
  total: number;
  currentItem: string;
  error?: string;
  cancelled: boolean;
  verification?: { table: string; sourceCount: number; targetCount: number; match: boolean }[];
  verificationPassed?: boolean;
}>();
```

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/project/ProjectSettings.tsx` | Agregar `max-h-[85vh]`, usar `ScrollArea` para contenido scrolleable |
| `src/components/project/DatabaseCloner.tsx` | Agregar fase `verification`, mostrar resultados de verificación, actualizar PHASE_LABELS |
| `supabase/functions/clone-database/index.ts` | Agregar lógica de verificación post-clonación, actualizar estructura del job |

## Flujo de Usuario Actualizado

```text
┌───────────────────────────────────┐
│  Configuración del Proyecto       │  <- max-h-[85vh]
├───────────────────────────────────┤
│  ┌─────────────────────────────┐  │
│  │  Contenido scrolleable      │  │  <- ScrollArea
│  │  - Título                   │  │
│  │  - Formato                  │  │
│  │  - Episodios/Duración       │  │
│  │  - EKB Config               │  │
│  │  - Developer Mode           │  │
│  │  - Backup/Migración         │  │
│  │    ┌─────────────────────┐  │  │
│  │    │ DatabaseCloner      │  │  │
│  │    │ [URL destino]       │  │  │
│  │    │ [Iniciar Clonación] │  │  │
│  │    │                     │  │  │
│  │    │ Progreso: 95%       │  │  │
│  │    │ Fase: verification  │  │  │
│  │    │                     │  │  │
│  │    │ Verificación:       │  │  │
│  │    │ characters: 12→12 ✓ │  │  │
│  │    │ scenes: 45→45 ✓     │  │  │
│  │    │ shots: 120→120 ✓    │  │  │
│  │    └─────────────────────┘  │  │
│  │  - Zona de Peligro          │  │
│  └─────────────────────────────┘  │
├───────────────────────────────────┤
│  [Cancelar]    [Guardar Cambios]  │  <- Footer fijo
└───────────────────────────────────┘
```

## Detalles Técnicos

### Cálculo de Progreso Actualizado

Agregar peso para la nueva fase de verificación:

```typescript
const phaseWeights: Record<ClonePhase, number> = {
  idle: 0,
  connecting: 5,
  enums: 10,
  schema: 25,
  data: 75,
  functions: 85,
  policies: 92,
  verification: 98,  // NUEVO
  done: 100,
  error: 0
};
```

### Etiquetas de Fase Actualizadas

```typescript
const PHASE_LABELS: Record<ClonePhase, string> = {
  idle: 'Esperando...',
  connecting: 'Conectando a bases de datos...',
  enums: 'Creando tipos ENUM...',
  schema: 'Creando tablas...',
  data: 'Copiando datos...',
  functions: 'Creando funciones...',
  policies: 'Aplicando políticas RLS...',
  verification: 'Verificando integridad...', // NUEVO
  done: '¡Clonación completada!',
  error: 'Error en la clonación'
};
```

## Beneficios

1. **Mejor UX en pantallas pequeñas** - La ventana ahora es scrolleable y se adapta a cualquier tamaño de pantalla
2. **Confianza en la migración** - El usuario puede ver exactamente cuántos registros se copiaron vs esperados
3. **Diagnóstico de problemas** - Si hay discrepancias, el usuario sabe exactamente qué tablas revisar
4. **Feedback visual claro** - Iconos ✓/✗ y colores verde/rojo para indicar estado de cada tabla
